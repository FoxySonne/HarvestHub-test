revoke execute on function public.sync_participant_membership_period()
  from public, anon, authenticated;
revoke execute on function public.validate_power_membership_date()
  from public, anon, authenticated;
revoke execute on function public.validate_vs_membership_date()
  from public, anon, authenticated;
revoke execute on function public.set_participant_membership_period_updated_at()
  from public, anon, authenticated;

drop policy if exists participant_membership_periods_no_direct_access
  on public.participant_membership_periods;
create policy participant_membership_periods_no_direct_access
on public.participant_membership_periods
for all
to public
using (false)
with check (false);
