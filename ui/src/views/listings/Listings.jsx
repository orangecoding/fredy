/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import ListingsOverview from '../../components/listings/ListingsOverview.jsx';
import Headline from '../../components/headline/Headline.jsx';

/**
 * @param {{ mode?: 'all' | 'watchlist' }} props
 */
export default function Listings({ mode = 'all' }) {
  const title = mode === 'watchlist' ? 'Watchlist' : 'Listings';
  return (
    <>
      <Headline text={title} />
      <ListingsOverview mode={mode} />
    </>
  );
}
