export function format(ts) {
  return new Intl.DateTimeFormat('default', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).format(ts);
}
export const roundToNext5Minute = (ts) => Math.ceil(ts / (1000 * 60 * 5)) * (1000 * 60 * 5);
