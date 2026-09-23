/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The colours of the pins, in one place, because two things now have to agree on them: the markers
 * MapLibre draws and the legend that explains them. They were spread over three files.
 *
 * Map layer literals, which `AGENTS.md` allows: a MapLibre marker takes a colour string and cannot
 * read a custom property. The legend takes the same strings from here rather than restating them.
 *
 * The stack is not here: it is drawn as a listing pin with a badge in the accent colour, which is a
 * theme token (`.map-marker-badge`), and a literal copy of it only matched the dark theme.
 *
 * @type {Readonly<Record<'listing'|'inRing'|'home'|'pick', string>>}
 */
export const MARKER_COLORS = Object.freeze({
  listing: '#3FB1CE',
  inRing: 'orange',
  home: 'red',
  pick: '#f5a623',
});
