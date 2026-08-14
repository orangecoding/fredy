/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import ListingsOverview from '../../components/listings/ListingsOverview.jsx';
import Headline from '../../components/headline/Headline.jsx';
import { useTranslation } from '../../services/i18n/i18n.jsx';

/**
 * Every listing Fredy has found.
 *
 * The watchlist used to be a second copy of this page behind its own route, differing only in one
 * filter being forced on. It is the star in the toolbar now, so there is one listings page with one
 * set of filters rather than two pages that had to be kept in step.
 *
 * @returns {React.ReactElement}
 */
export default function Listings() {
  const t = useTranslation();
  return (
    <>
      <Headline text={t('listings.title')} />
      <ListingsOverview />
    </>
  );
}
