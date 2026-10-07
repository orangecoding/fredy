/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it } from 'vitest';
import { isCampaignParam } from '../../lib/utils/campaignParams.js';

describe('#isCampaignParam', () => {
  // The tags a url picks up from an ad click or an alert mail. A translator that took them for
  // filters stopped the job over a link the user copied straight out of their inbox.
  it('knows the tags ad networks, analytics and mail campaigns append', () => {
    for (const name of ['utm_source', 'UTM_Medium', 'gclid', 'gbraid', 'wbraid', 'gad_source', 'fbclid', 'msclkid']) {
      expect(isCampaignParam(name), name).toBe(true);
    }
  });

  // AT Internet (now Piano), which the French portals track their alert mails and partner links with.
  it('knows the French analytics tags', () => {
    for (const name of ['xtor', 'at_medium', 'at_campaign']) {
      expect(isCampaignParam(name), name).toBe(true);
    }
  });

  it('leaves the filters of a search alone', () => {
    for (const name of ['priceMax', 'locations', 'distributionTypes', 'price', 'atelier', 'prix-max', 'category']) {
      expect(isCampaignParam(name), name).toBe(false);
    }
  });
});
