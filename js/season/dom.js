const numberFormat = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 1
});

export function num(id) {
  const element = document.getElementById(id);
  return Number(element?.value) || 0;
}

export function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = numberFormat.format(value);
}

export function findByLevel(list, level, fallback = null) {
  return list.find(item => Number(item.level) === Number(level)) || fallback;
}
