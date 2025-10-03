export function format(ts, showSeconds = true) {
  return new Intl.DateTimeFormat('default', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    ...(showSeconds ? { second: 'numeric' } : {}),
  }).format(ts);
}

export const roundToHour = (ts) => Math.ceil(ts / (1000 * 60 * 60)) * (1000 * 60 * 60);
