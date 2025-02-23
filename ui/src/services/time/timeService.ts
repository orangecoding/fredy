export function format(ts: number | Date): string {
  return new Intl.DateTimeFormat('default', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).format(ts);
}

export const roundToNext5Minute = (ts: number): number => Math.ceil(ts / (1000 * 60 * 5)) * (1000 * 60 * 5);
