create or replace function public.record_participant_nickname_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.purged_at is null
     and lower(btrim(coalesce(old.nickname, ''))) is distinct from lower(btrim(coalesce(new.nickname, ''))) then
    insert into public.participant_nickname_history (
      participant_id, alliance_id, old_nickname, new_nickname, changed_by
    ) values (
      new.id, new.alliance_id, old.nickname, new.nickname, auth.uid()
    );
  end if;
  return new;
end;
$$;

create or replace function public.save_reservoir_layout(
  target_week_id uuid,
  target_assignments jsonb,
  target_notes jsonb,
  target_general_comment text,
  target_published_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.reservoir_layout_manageable(target_week_id) then
    raise exception 'Недостаточно прав для изменения расстановки';
  end if;

  perform 1
  from public.alliance_reservoir_weeks w
  where w.id = target_week_id
  for update;
  if not found then
    raise exception 'Неделя резервуара не найдена';
  end if;

  if jsonb_typeof(coalesce(target_assignments, '[]'::jsonb)) <> 'array' then
    raise exception 'Некорректный список назначений';
  end if;
  if jsonb_typeof(coalesce(target_notes, '[]'::jsonb)) <> 'array' then
    raise exception 'Некорректный список комментариев';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(target_assignments, '[]'::jsonb))
      as x(location_key text, participant_id uuid, sort_order integer)
    left join public.alliance_reservoir_participants rp
      on rp.week_id = target_week_id
     and rp.participant_id = x.participant_id
     and rp.assignment in ('main', 'reserve')
    where x.location_key not in (
      'treatment_1', 'treatment_2',
      'processing_1', 'processing_2', 'processing_3', 'processing_4',
      'solar', 'helipad', 'central', 'development', 'military'
    )
       or x.participant_id is null
       or rp.participant_id is null
  ) then
    raise exception 'Расстановка содержит неизвестную локацию или участника вне состава недели';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(target_notes, '[]'::jsonb))
      as x(location_key text, comment text)
    where x.location_key not in (
      'treatment_1', 'treatment_2',
      'processing_1', 'processing_2', 'processing_3', 'processing_4',
      'solar', 'helipad', 'central', 'development', 'military',
      'collectors_north', 'collectors_east', 'collectors_south', 'collectors_west'
    )
  ) then
    raise exception 'Комментарий содержит неизвестную локацию';
  end if;

  delete from public.alliance_reservoir_assignments
  where week_id = target_week_id;

  insert into public.alliance_reservoir_assignments (
    week_id, location_key, participant_id, sort_order, updated_by, updated_at
  )
  select
    target_week_id,
    ranked.location_key,
    ranked.participant_id,
    ranked.sort_order,
    auth.uid(),
    now()
  from (
    select
      x.location_key,
      x.participant_id,
      row_number() over (
        partition by x.location_key
        order by latest.squad_1 desc nulls last,
                 lower(coalesce(p.nickname, '')),
                 x.participant_id
      ) - 1 as sort_order
    from jsonb_to_recordset(coalesce(target_assignments, '[]'::jsonb))
      as x(location_key text, participant_id uuid, sort_order integer)
    join public.participants p on p.id = x.participant_id
    left join lateral (
      select m.squad_1
      from public.alliance_squad_power_measurements m
      where m.participant_id = x.participant_id
      order by m.measured_on desc, m.updated_at desc, m.id desc
      limit 1
    ) latest on true
  ) ranked;

  delete from public.alliance_reservoir_location_notes
  where week_id = target_week_id;

  insert into public.alliance_reservoir_location_notes (
    week_id, location_key, comment, updated_by, updated_at
  )
  select
    target_week_id,
    x.location_key,
    btrim(x.comment),
    auth.uid(),
    now()
  from jsonb_to_recordset(coalesce(target_notes, '[]'::jsonb))
    as x(location_key text, comment text)
  where btrim(coalesce(x.comment, '')) <> '';

  insert into public.alliance_reservoir_layouts (
    week_id, general_comment, published_at, updated_by, updated_at
  ) values (
    target_week_id,
    btrim(coalesce(target_general_comment, '')),
    target_published_at,
    auth.uid(),
    now()
  )
  on conflict (week_id) do update
  set general_comment = excluded.general_comment,
      published_at = excluded.published_at,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;

  return jsonb_build_object('week_id', target_week_id, 'saved', true);
end;
$$;
