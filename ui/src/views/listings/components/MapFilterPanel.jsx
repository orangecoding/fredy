/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useState } from 'react';
import { Badge } from '@douyinfe/semi-ui-19';
import { IconChevronDown } from '@douyinfe/semi-icons';

/**
 * The map view's one panel, folded behind its own heading on a phone.
 *
 * On a phone the panel column is as wide as the map, and the panel - the map's switches, every
 * listing filter and the legend - is taller than what the address search leaves of it, so it
 * covered the whole map before anyone had asked for a single filter. There it starts folded: the
 * heading turns into the toggle, and what stays on screen is a chip in the corner the panel owns
 * anyway, clear of MapLibre's controls on the left and of its attribution along the bottom.
 *
 * A button with `aria-expanded` rather than `<details>`, for two reasons. What is folded away is
 * not rendered at all instead of merely hidden, so the price slider measures its track once it is on
 * screen rather than a zero-width box while folded. And the fullscreen button stays on the heading
 * row whatever the fold is doing, which a `<summary>` cannot offer: a control may not sit inside
 * it, and everything outside it folds away with the rest.
 *
 * Wider than a phone nothing changes: the heading is plain text, the panel is always open, and the
 * markup is exactly what it was before there was a fold.
 *
 * @param {Object} props
 * @param {boolean} props.foldable - Whether to fold at all. False renders the panel open.
 * @param {string} props.title - The heading, and on a phone the toggle's label.
 * @param {number} [props.activeCount=0] - How many filters are hiding pins, shown while folded.
 * @param {string} [props.activeCountLabel] - The same count in words, for a screen reader.
 * @param {React.ReactNode} [props.headerExtra] - The end of the heading row, folded or not.
 * @param {React.ReactNode} props.children - Everything below the heading.
 * @returns {React.ReactElement}
 */
export default function MapFilterPanel({
  foldable,
  title,
  activeCount = 0,
  activeCountLabel,
  headerExtra = null,
  children,
}) {
  const [open, setOpen] = useState(false);
  const folded = foldable && !open;
  // Only while folded: opened, the filters are on screen and speak for themselves.
  const showCount = folded && activeCount > 0;

  return (
    <div className={folded ? 'map-panel map-panel--folded' : 'map-panel'}>
      <div className="map-panel__groupTitle">
        {foldable ? (
          <button
            type="button"
            className="map-panel__foldToggle"
            aria-expanded={open}
            aria-label={showCount ? `${title}, ${activeCountLabel}` : undefined}
            onClick={() => setOpen((current) => !current)}
          >
            {title}
            {showCount && <Badge count={activeCount} type="primary" />}
            <IconChevronDown className="map-panel__foldChevron" aria-hidden />
          </button>
        ) : (
          title
        )}
        {headerExtra}
      </div>
      {!folded && children}
    </div>
  );
}
