create index if not exists alliance_reservoir_assignments_updated_by_idx
  on public.alliance_reservoir_assignments(updated_by);
create index if not exists alliance_reservoir_layouts_updated_by_idx
  on public.alliance_reservoir_layouts(updated_by);
create index if not exists alliance_reservoir_location_notes_updated_by_idx
  on public.alliance_reservoir_location_notes(updated_by);
create index if not exists alliance_reservoir_participants_updated_by_idx
  on public.alliance_reservoir_participants(updated_by);
create index if not exists alliance_reservoir_weeks_created_by_idx
  on public.alliance_reservoir_weeks(created_by);
create index if not exists alliance_reservoir_weeks_updated_by_idx
  on public.alliance_reservoir_weeks(updated_by);
create index if not exists alliance_squad_power_measurements_created_by_idx
  on public.alliance_squad_power_measurements(created_by);
create index if not exists alliance_squad_power_measurements_updated_by_idx
  on public.alliance_squad_power_measurements(updated_by);
create index if not exists alliance_vs_results_created_by_idx
  on public.alliance_vs_results(created_by);
create index if not exists alliance_vs_results_updated_by_idx
  on public.alliance_vs_results(updated_by);
create index if not exists participant_membership_periods_created_by_idx
  on public.participant_membership_periods(created_by);
create index if not exists participant_membership_periods_updated_by_idx
  on public.participant_membership_periods(updated_by);
create index if not exists participant_nickname_history_changed_by_idx
  on public.participant_nickname_history(changed_by);
create index if not exists participants_created_by_idx
  on public.participants(created_by);
create index if not exists participants_updated_by_idx
  on public.participants(updated_by);
