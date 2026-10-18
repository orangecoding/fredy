/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * One server-sent event stream per tab, shared by everything that listens.
 *
 * The app, the listings page and the jobs page each used to open their own `EventSource` on the
 * same endpoint, which sends every event to every connection of a user anyway. Over HTTP/1.1 a
 * browser allows six connections per host across all tabs, so three tabs on the listings page held
 * all six and every other request of the app waited until one was closed.
 */

const URL = '/api/jobs/events';

/** @type {EventSource|null} */
let source = null;
let subscribers = 0;

/**
 * Listen for one event type on the shared stream, opening it on first use.
 *
 * @param {string} event The SSE event name, e.g. `jobStatus`.
 * @param {(event: MessageEvent) => void} handler
 * @param {() => EventSource} [open] Opens the stream; replaced in tests.
 * @returns {() => void} Stops listening, and closes the stream once nobody listens any more.
 */
export function subscribeJobEvents(event, handler, open = () => new EventSource(URL)) {
  if (source == null) {
    source = open();
    // The browser reconnects on its own; an error here only means it is about to.
    source.onerror = () => {};
  }
  const stream = source;
  stream.addEventListener(event, handler);
  subscribers += 1;

  let active = true;
  return () => {
    if (!active) return;
    active = false;
    stream.removeEventListener(event, handler);
    subscribers -= 1;
    if (subscribers === 0 && source === stream) {
      stream.close();
      source = null;
    }
  };
}
