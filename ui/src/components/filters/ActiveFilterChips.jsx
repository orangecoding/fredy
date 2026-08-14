/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Tag, Button } from '@douyinfe/semi-ui-19';

import { useTranslation } from '../../services/i18n/i18n.jsx';

import './ActiveFilterChips.less';

/**
 * What a page is currently filtered by, as removable chips.
 *
 * The filters themselves live in a drawer, and a drawer is a place things get forgotten in. This
 * row is the receipt: it names every filter that is on, and each chip is also the way to switch
 * that one off, so nothing can be hiding rows without saying so on screen.
 *
 * Renders nothing when nothing is on, rather than an empty bar that has to be explained.
 *
 * Takes chips already described, rather than a filter state and a way to read it, so the listings
 * and jobs pages can share it without it knowing what either of them filters by.
 *
 * @param {Object} props
 * @param {{key: string, label: string}[]} props.chips
 * @param {(key: string) => void} props.onRemove
 * @param {() => void} props.onClearAll
 * @returns {React.ReactElement|null}
 */
export default function ActiveFilterChips({ chips, onRemove, onClearAll }) {
  const t = useTranslation();

  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="activeFilterChips">
      {chips.map((chip) => (
        <Tag
          key={chip.key}
          closable
          type="light"
          size="large"
          className="activeFilterChips__chip"
          aria-label={t('listings.filterChipRemove', { name: chip.label })}
          onClose={() => onRemove(chip.key)}
        >
          {chip.label}
        </Tag>
      ))}
      {/* Offered from two chips up. With one on screen it would be a second button doing exactly
          what the chip's own cross already does. */}
      {chips.length > 1 && (
        <Button theme="borderless" size="small" onClick={onClearAll}>
          {t('listings.filterClearAll')}
        </Button>
      )}
    </div>
  );
}

ActiveFilterChips.displayName = 'ActiveFilterChips';
