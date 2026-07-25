-- Critical access batch 2: location validation and atomic reservoir layout RPCs.

alter table public.alliance_reservoir_assignments
  drop constraint if exists alliance_reservoir_assignments_location_key_check;
alter table public.alliance_reservoir_assignments
  add constraint alliance_reservoir_assignments_location_key_check
  check (location_key in (
    'treatment_1', 'treatment_2',
    'processing_1', 'processing_2', 'processing_3', 'processing_4',
    'solar', 'helipad', 'central', 'development', 'military'
  ));

alter table public.alliance_reservoir_location_notes
  drop constraint if exists alliance_reservoir_location_notes_location_key_check;
alter table public.alliance_reservoir_location_notes
  add constraint alliance_reservoir_location_notes_location_key_check
  check (location_key in (
    'treatment_1', 'treatment_2',
    'processing_1', 'processing_2', 'processing_3', 'processing_4',
    'solar', 'helipad', 'central', 'development', 'military',
    'collectors_north', 'collectors_east', 'collectors_south', 'collectors_west'
  ));

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
    x.location_key,
    x.participant_id,
    coalesce(x.sort_order, 0),
    auth.uid(),
    now()
  from jsonb_to_recordset(coalesce(target_assignments, '[]'::jsonb))
    as x(location_key text, participant_id uuid, sort_order integer);

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

create or replace function public.reset_reservoir_layout(target_week_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.reservoir_layout_manageable(target_week_id) then
    raise exception 'Недостаточно прав для сброса расстановки';
  end if;

  perform 1
  from public.alliance_reservoir_weeks w
  where w.id = target_week_id
  for update;
  if not found then
    raise exception 'Неделя резервуара не найдена';
  end if;

  delete from public.alliance_reservoir_assignments
  where week_id = target_week_id;
  delete from public.alliance_reservoir_location_notes
  where week_id = target_week_id;

  insert into public.alliance_reservoir_layouts (
    week_id, general_comment, published_at, updated_by, updated_at
  ) values (
    target_week_id, '', null, auth.uid(), now()
  )
  on conflict (week_id) do update
  set general_comment = '',
      published_at = null,
      updated_by = auth.uid(),
      updated_at = now();

  return jsonb_build_object('week_id', target_week_id, 'reset', true);
end;
$$;

revoke execute on function public.save_reservoir_layout(uuid, jsonb, jsonb, text, timestamptz) from public, anon;
grant execute on function public.save_reservoir_layout(uuid, jsonb, jsonb, text, timestamptz) to authenticated;
revoke execute on function public.reset_reservoir_layout(uuid) from public, anon;
grant execute on function public.reset_reservoir_layout(uuid) to authenticated;
