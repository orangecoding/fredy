/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Turn a timestamp into how far away it is, e.g. "in 56 min" or "4 min ago".
 *
 * A job that runs on an interval makes an absolute timestamp work the reader has to do: they
 * have to subtract the current time to learn the only thing they wanted, which is whether it
 * just ran or is about to. The exact stamp stays available in the tooltip.
 *
 * It sits in `services/time` rather than under one of the pages because two of them ask the same
 * question now - the dashboard about its panels' rows, the jobs page about a job's last run - and
 * a second copy would be a second set of rounding rules. The `dashboard.time*` keys it reads kept
 * their names through the move; renaming them would have touched five locale files to say the
 * same thing.
 *
 * @param {number|null|undefined} timestamp Epoch ms.
 * @param {(key: string, params?: Object) => string} t
 * @param {number} [now]
 * @returns {string|null} `null` when there is nothing to describe.
 */
export function relativeTime(timestamp, t, now = Date.now()) {
  // Not a number is nothing to describe either: the arithmetic below would print "NaN days ago".
  if (timestamp == null || timestamp === 0 || !Number.isFinite(Number(timestamp))) {
    return null;
  }
  const deltaMinutes = Math.round((Number(timestamp) - now) / 60000);
  const magnitude = Math.abs(deltaMinutes);
  if (magnitude < 1) {
    return t('dashboard.timeNow');
  }
  const days = Math.round(magnitude / (60 * 24));
  // Minutes and hours are abbreviated ("min", "h") and read the same for one and for many. Days are
  // spelled out, so one of them needs its own key: "1 days ago".
  const unit =
    magnitude < 60
      ? { key: 'Minutes', value: magnitude }
      : magnitude < 60 * 24
        ? { key: 'Hours', value: Math.round(magnitude / 60) }
        : { key: days === 1 ? 'Day' : 'Days', value: days };
  const direction = deltaMinutes > 0 ? 'in' : 'ago';
  return t(`dashboard.time${direction === 'in' ? 'In' : 'Ago'}${unit.key}`, { count: String(unit.value) });
}
