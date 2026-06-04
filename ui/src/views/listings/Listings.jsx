/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import ListingsOverview from '../../components/listings/ListingsOverview.jsx';
import Headline from '../../components/headline/Headline.jsx';
import { useTranslation } from '../../services/i18n/i18n.jsx';

/**
 * @param {{ mode?: 'all' | 'watchlist' }} props
 */
export default function Listings({ mode = 'all' }) {
  const t = useTranslation();
  const title = mode === 'watchlist' ? t('listings.watchlistTitle') : t('listings.title');
  return (
    <>
      <Headline text={title} />
      <ListingsOverview mode={mode} />
    </>
  );
}
