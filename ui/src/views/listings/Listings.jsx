/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useState } from 'react';
import { Button, Tooltip } from '@douyinfe/semi-ui-19';
import { IconPlus } from '@douyinfe/semi-icons';
import ListingsOverview from '../../components/listings/ListingsOverview.jsx';
import Headline from '../../components/headline/Headline.jsx';
import AddListingModal from './components/AddListingModal.jsx';
import { useTranslation } from '../../services/i18n/i18n.jsx';
import { useSelector } from '../../services/state/store.js';

/**
 * Every listing Fredy has found.
 *
 * The watchlist used to be a second copy of this page behind its own route, differing only in one
 * filter being forced on. It is a quick filter in the toolbar now, so there is one listings page with one
 * set of filters rather than two pages that had to be kept in step.
 *
 * Adding a listing by hand is the page's one primary action, in the heading rather than in a toolbar
 * that is already full. Only the plus, so it does not outweigh the title: adding by hand is the
 * exception, for an advert the jobs missed, and the tooltip says so.
 *
 * @returns {React.ReactElement}
 */
export default function Listings() {
  const t = useTranslation();
  const [addVisible, setAddVisible] = useState(false);
  // How many listings the current filters match, from the page the overview has already loaded.
  // Nothing until that page is in: the store starts at zero, and "0 listings" is a claim.
  const loaded = useSelector((state) => state.listingsData.loaded === true);
  const total = useSelector((state) => state.listingsData.totalNumber);
  const subtitle = !loaded
    ? null
    : total === 1
      ? t('listings.matchCountOne')
      : t('listings.matchCount', { count: String(total ?? 0) });
  return (
    <>
      <Headline
        text={t('listings.title')}
        subtitle={subtitle}
        actions={
          <Tooltip content={t('listings.add.tooltip')} position="bottomRight">
            <Button
              type="primary"
              theme="solid"
              icon={<IconPlus />}
              aria-label={t('listings.add.button')}
              onClick={() => setAddVisible(true)}
            />
          </Tooltip>
        }
      />
      <ListingsOverview onAddListing={() => setAddVisible(true)} />
      <AddListingModal visible={addVisible} onClose={() => setAddVisible(false)} />
    </>
  );
}
