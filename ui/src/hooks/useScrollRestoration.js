/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useRef } from 'react';

/**
 * The app scrolls inside its content column, not in the window, so a scroll position can only be
 * read from and written to that element.
 * @type {string}
 */
const SCROLL_CONTAINER_SELECTOR = '.app__content';

/** Prefix for the sessionStorage keys holding one saved position per view. */
const STORAGE_PREFIX = 'fredy:scroll:';

/**
 * @param {string} key
 * @returns {number} The last saved offset for that key, 0 when there is none.
 */
function readSaved(key) {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_PREFIX + key);
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

/**
 * @param {string} key
 * @param {number} value
 * @returns {void}
 */
function writeSaved(key, value) {
  try {
    window.sessionStorage.setItem(STORAGE_PREFIX + key, String(value));
  } catch {
    // A full or blocked storage must not break scrolling.
  }
}

/**
 * Remember where the user was in a scrollable view and put them back there when they come back
 * to it, so opening a listing and returning does not throw them to the top of the list again.
 *
 * The position is restored only once per mount, and only after `ready` turns true: the content
 * has no height until the listings are in the DOM, and scrolling a short element silently clamps
 * to whatever fits.
 *
 * @param {string} key Identifies the view; separate views keep separate positions.
 * @param {boolean} ready Whether the content that gives the container its height is rendered.
 * @returns {void}
 */
export function useScrollRestoration(key, ready) {
  const restored = useRef(false);

  useEffect(() => {
    restored.current = false;
  }, [key]);

  useEffect(() => {
    const el = document.querySelector(SCROLL_CONTAINER_SELECTOR);
    if (el == null) {
      return;
    }
    const onScroll = () => writeSaved(key, el.scrollTop);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [key]);

  useEffect(() => {
    if (restored.current || !ready) {
      return;
    }
    const el = document.querySelector(SCROLL_CONTAINER_SELECTOR);
    if (el == null) {
      return;
    }
    restored.current = true;
    const target = readSaved(key);
    if (target <= 0) {
      return;
    }
    // One frame later: the freshly rendered rows are in the DOM but not yet laid out, so an
    // immediate assignment would be clamped to the old, shorter height.
    const raf = window.requestAnimationFrame(() => {
      el.scrollTop = target;
    });
    return () => window.cancelAnimationFrame(raf);
  }, [key, ready]);
}
