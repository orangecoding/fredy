/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

const COLORS = {
  debug: '\x1b[36m',
  info: '\x1b[32m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
  reset: '\x1b[0m',
};

const env = process.env.NODE_ENV || 'development';
const useColor = process.stdout.isTTY || process.stderr.isTTY;

/**
 * Optional sink that forwards formatted log entries to the opt-in "Debug Logging"
 * DB storage. Wired and unwired by debugLogStorage as the feature is toggled, so
 * when nobody enabled the feature this stays null and the logger hot path skips
 * the Date.now + stringifyArgs work entirely.
 *
 * We deliberately do NOT import debugLogStorage here, because that would create a
 * cycle (debugLogStorage → SqliteConnection → utils → logger → debugLogStorage).
 * Inversion of control via setDebugLogSink() keeps the dependency one-way.
 *
 * @type {((entry:{ts:number, level:string, message:string}) => void)|null}
 */
let debugLogSink = null;

function ts() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function lvl(level) {
  const upper = level.toUpperCase();
  if (!useColor) return upper;
  return `${COLORS[level] || ''}${upper}${COLORS.reset}`;
}

/**
 * Build a colour-free plain text representation of variadic console args. Errors
 * are unwrapped to their stack/message, objects are JSON-serialized. Used when
 * forwarding to the DB sink so the stored text is portable across terminals.
 *
 * @param {any[]} args
 * @returns {string}
 */
function stringifyArgs(args) {
  return args
    .map((a) => {
      if (a == null) return String(a);
      if (a instanceof Error) return a.stack || a.message;
      if (typeof a === 'object') {
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      }
      return String(a);
    })
    .join(' ');
}

/* eslint-disable no-console */
function log(level, ...args) {
  // Forward to the DB sink first (regardless of console suppression rules) so the
  // recorded debug bundle truly contains every level, including debug entries that
  // would otherwise be silenced in production.
  if (debugLogSink) {
    try {
      debugLogSink({
        ts: Date.now(),
        level,
        message: `${stringifyArgs(args)}`,
      });
    } catch {
      // never break the caller because of logging
    }
  }

  if (level === 'debug' && env !== 'development') {
    return; // Skip debug logs in non-development environments (console only)
  }

  const prefix = `[${ts()}] ${lvl(level)}:`;
  switch (level) {
    case 'debug':
      console.debug(prefix, ...args);
      break;
    case 'info':
      console.info(prefix, ...args);
      break;
    case 'warn':
      console.warn(prefix, ...args);
      break;
    case 'error':
      console.error(prefix, ...args);
      break;
    default:
      console.log(prefix, ...args);
  }
}

/**
 * Register a sink function that receives every log entry the logger sees, regardless
 * of console suppression rules. debugLogStorage attaches its sink only while the
 * feature is enabled and detaches it on disable, so the logger's hot path can use
 * the null check as a cheap on/off gate and skip stringification when off.
 *
 * Pass null to remove the sink (used both by the storage module on disable and by
 * tests to reset state between cases).
 *
 * @param {((entry:{ts:number, level:string, message:string}) => void)|null} sink
 * @returns {void}
 */
function setDebugLogSink(sink) {
  debugLogSink = typeof sink === 'function' ? sink : null;
}

export { setDebugLogSink };

export default {
  debug: (...a) => log('debug', ...a),
  info: (...a) => log('info', ...a),
  warn: (...a) => log('warn', ...a),
  error: (...a) => log('error', ...a),
  setDebugLogSink,
};
