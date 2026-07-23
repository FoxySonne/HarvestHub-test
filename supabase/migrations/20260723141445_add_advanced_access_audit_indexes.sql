create index if not exists app_admins_created_by_idx
  on private.app_admins (created_by)
  where created_by is not null;

create index if not exists advanced_mode_access_granted_by_idx
  on private.advanced_mode_access (granted_by)
  where granted_by is not null;
