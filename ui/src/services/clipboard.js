/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Put text on the clipboard, on the browsers Fredy actually runs in.
 *
 * `navigator.clipboard` only exists on a secure context, and a self-hosted Fredy is routinely
 * reached over plain http on a LAN address - which is why the deprecated `execCommand` path is not
 * legacy cruft here but the path a large share of installations take every time.
 *
 * Returns whether the text made it, rather than throwing: every caller's response to a failure is
 * the same toast, and a rejected clipboard permission is a normal thing for a user to do.
 *
 * Must be called from a user gesture. Do not await anything between the click and this call - a
 * fetch in between costs the transient activation in Safari and the write is refused.
 *
 * @param {string|null|undefined} text
 * @returns {Promise<boolean>} True when the text is on the clipboard.
 */
export async function copyToClipboard(text) {
  if (typeof text !== 'string' || text.length === 0) return false;

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      // A refused permission, or an insecure context that advertises the API anyway. Neither is
      // worth failing on while the older path is still available.
      console.warn('Clipboard API refused the write, falling back to execCommand.', error);
    }
  }

  return copyViaScratchElement(text);
}

/**
 * The pre-`navigator.clipboard` way: select text in an off-screen textarea and let the browser's
 * own copy command take it.
 *
 * @param {string} text
 * @returns {boolean}
 */
function copyViaScratchElement(text) {
  if (typeof document === 'undefined') return false;

  let scratch = null;
  try {
    scratch = document.createElement('textarea');
    scratch.value = text;
    scratch.setAttribute('readonly', '');
    // Fixed and transparent rather than `display: none`: a hidden element cannot be selected, and
    // an on-flow one scrolls the page to itself.
    scratch.style.position = 'fixed';
    scratch.style.top = '0';
    scratch.style.opacity = '0';
    document.body.appendChild(scratch);
    scratch.select();
    return document.execCommand('copy');
  } catch (error) {
    console.error('Could not copy to the clipboard.', error);
    return false;
  } finally {
    // In `finally` so a failed copy does not leave an invisible textarea behind on the page.
    if (scratch != null) {
      try {
        document.body.removeChild(scratch);
      } catch {
        // The node was never attached; nothing to clean up.
      }
    }
  }
}
