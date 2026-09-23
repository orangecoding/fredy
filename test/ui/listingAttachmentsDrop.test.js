/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const uiSrc = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../ui/src');

/**
 * Reads a source file under `ui/src`.
 *
 * Source text rather than a rendered tree, because this suite runs without a DOM. Coarse on
 * purpose: each assertion guards a rule that is easy to break by accident and invisible in a diff.
 *
 * @param {string} relative
 * @returns {string}
 */
function source(relative) {
  return fs.readFileSync(path.join(uiSrc, relative), 'utf-8');
}

const card = source('views/listings/components/AttachmentsCard.jsx');
const cardStyles = source('views/listings/components/AttachmentsCard.less');
const mapStyles = source('views/listings/Map.less');

describe('listing documents accept a drop', () => {
  it('listens on the list, which is the box a file is dragged onto', () => {
    const zone = card.slice(card.indexOf('attachmentsCard__dropzone'), card.indexOf('{loading ?'));
    for (const handler of ['onDragEnter', 'onDragOver', 'onDragLeave', 'onDrop']) {
      expect(zone).toContain(handler);
    }
  });

  it('cancels the dragover, without which the browser navigates to the dropped file', () => {
    const over = card.slice(card.indexOf('const handleDragOver'), card.indexOf('const handleDragLeave'));
    expect(over).toContain('event.preventDefault()');
  });

  it('sends a dropped file down the same path as a picked one', () => {
    // Two upload paths is how the size check, the type check and the capacity check end up
    // enforced on one of them only.
    const drop = card.slice(card.indexOf('const handleDrop'), card.indexOf('const handleDelete'));
    const picked = card.slice(card.indexOf('const handlePicked'), card.indexOf('const handleDragEnter'));
    expect(drop).toContain('uploadFiles(');
    expect(picked).toContain('uploadFiles(');
  });

  it('turns a drop away when the listing is already full, rather than uploading past the ceiling', () => {
    const drop = card.slice(card.indexOf('const handleDrop'), card.indexOf('const handleDelete'));
    expect(drop).toContain('atCapacity');
    expect(drop).toContain("t('listing.detail.attachmentsFull'");
  });

  it('swallows the drop that misses, which the browser would answer by leaving the page', () => {
    const guard = card.slice(card.indexOf("window.addEventListener('dragover'"));
    expect(guard).toContain("window.addEventListener('drop'");
    expect(guard).toContain("window.removeEventListener('dragover'");
    expect(guard).toContain("window.removeEventListener('drop'");
  });

  it('keeps the drop overlay out of the pointer, so the highlight cannot strobe', () => {
    const overlay = cardStyles.slice(cardStyles.indexOf('&__dropOverlay'), cardStyles.indexOf('&__list'));
    expect(overlay).toMatch(/pointer-events:\s*none;/);
  });

  it('says so in the empty slot, now that there really is something listening', () => {
    expect(card).toContain("t('listing.detail.attachmentsDropHint')");
    expect(card).toContain("t('listing.detail.attachmentsDropActive')");
  });
});

describe('map popup pager', () => {
  it('keeps its next arrow clear of the close button', () => {
    // Both sit in the top right corner of the popup, and only a group of several listings has both
    // at once - which is why the close button sat on top of the arrow for so long.
    const pager = mapStyles.slice(mapStyles.indexOf('&__pager {'), mapStyles.indexOf('&__pagerLabel'));
    const reserved = Number(/padding-right:\s*(\d+)px;/.exec(pager)?.[1]);

    const close = mapStyles.slice(mapStyles.indexOf('.maplibregl-popup-close-button {'));
    const width = Number(/width:\s*(\d+)px;/.exec(close)?.[1]);

    // The close button is offset by @space-2 and MapLibre's own content padding is 10px, so what
    // the pager has to give up is everything the button reaches past that padding.
    const closeOffset = 8;
    const popupPadding = 10;
    expect(reserved).toBeGreaterThanOrEqual(closeOffset + width - popupPadding);
  });
});
