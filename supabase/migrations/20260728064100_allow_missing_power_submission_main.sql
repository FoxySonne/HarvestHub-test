-- Разрешает сохранять строку без числовых значений как отметку
-- «игрок не сдал силу на выбранную дату».

alter table public.alliance_squad_power_measurements
  drop constraint if exists alliance_squad_power_measurements_has_value_check;
