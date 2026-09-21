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
  if (timestamp == null || timestamp === 0) {
    return null;
  }
  const deltaMinutes = Math.round((timestamp - now) / 60000);
  const magnitude = Math.abs(deltaMinutes);
  if (magnitude < 1) {
    return t('dashboard.timeNow');
  }
  const unit =
    magnitude < 60
      ? { key: 'Minutes', value: magnitude }
      : magnitude < 60 * 24
        ? { key: 'Hours', value: Math.round(magnitude / 60) }
        : { key: 'Days', value: Math.round(magnitude / (60 * 24)) };
  const direction = deltaMinutes > 0 ? 'in' : 'ago';
  return t(`dashboard.time${direction === 'in' ? 'In' : 'Ago'}${unit.key}`, { count: String(unit.value) });
}
