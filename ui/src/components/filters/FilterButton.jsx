/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Badge, Button } from '@douyinfe/semi-ui-19';
import { IconFilter } from '@douyinfe/semi-icons';

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
    <Badge count={activeCount > 0 ? activeCount : null} type="primary">
      <Button
        icon={<IconFilter />}
        theme={activeCount > 0 ? 'light' : 'borderless'}
        onClick={onClick}
        aria-label={t('listings.filtersButton')}
      >
        {t('listings.filtersButton')}
      </Button>
    </Badge>
  );
}

FilterButton.displayName = 'FilterButton';
