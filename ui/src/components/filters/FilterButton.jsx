/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Button } from '@douyinfe/semi-ui-19';

import { IconSliders } from '../icons/StrokeIcons.jsx';
import './FilterButton.less';

import { useTranslation } from '../../services/i18n/i18n.jsx';

/**
 * The control that opens a page's filters, carrying how many are on.
 *
 * The count is the whole reason filters can be put away at all: without it, a filter left on in a
 * closed drawer silently explains an empty page and there is nothing on screen to say so.
 *
 * @param {Object} props
 * @param {number} props.activeCount
 * @param {() => void} props.onClick
 * @returns {React.ReactElement}
 */
export default function FilterButton({ activeCount, onClick }) {
  const t = useTranslation();

  return (
    <Button className="filterButton" size="large" icon={<IconSliders />} onClick={onClick}>
      {t('listings.filtersButton')}
      {/* The count inside the button rather than a badge on its corner, which read as a
          notification rather than as how many filters are on. */}
      {activeCount > 0 && <span className="filterButton__count">{activeCount}</span>}
    </Button>
  );
}

FilterButton.displayName = 'FilterButton';
