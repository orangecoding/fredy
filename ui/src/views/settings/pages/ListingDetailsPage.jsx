/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useState } from 'react';
import { Button, Checkbox, Select, Banner, Toast } from '@douyinfe/semi-ui-19';
import { IconSave } from '@douyinfe/semi-icons';

import { SegmentPart } from '../../../components/segment/SegmentPart';
import { errorMessage } from '../../../services/xhr';
import { useActions, useSelector, useIsLoading } from '../../../services/state/store';
import { useTranslation } from '../../../services/i18n/i18n.jsx';

/**
 * Which portals get their detail pages fetched, and whether the blacklist is applied to what comes
 * back.
 *
 * Both used to write the moment they were touched, on a page where two other controls waited for a
 * Save button. They are batched now: fetching detail pages costs requests at the portal, so
 * "I picked four providers" should be one decision, not four.
 *
 * @returns {React.ReactElement}
 */
export default function ListingDetailsPage() {
  const t = useTranslation();
  const actions = useActions();

  const providerDetails = useSelector((state) => state.userSettings.settings.provider_details);
  const blacklistFilter = useSelector((state) => state.userSettings.settings.blacklist_filter_on_provider_details);
  const allProviders = useSelector((state) => state.provider);
  const savingProviders = useIsLoading(actions.userSettings.setProviderDetails);
  const savingFilter = useIsLoading(actions.userSettings.setBlacklistFilterOnProviderDetails);

  const [selected, setSelected] = useState([]);
  const [filterEnabled, setFilterEnabled] = useState(false);

  useEffect(() => {
    setSelected(Array.isArray(providerDetails) ? providerDetails : []);
  }, [providerDetails]);

  useEffect(() => {
    setFilterEnabled(blacklistFilter === true);
  }, [blacklistFilter]);

  const stored = Array.isArray(providerDetails) ? providerDetails : [];
  const dirty =
    filterEnabled !== (blacklistFilter === true) ||
    selected.length !== stored.length ||
    selected.some((id) => !stored.includes(id));

  const handleSave = async () => {
    try {
      await actions.userSettings.setProviderDetails(selected);
      await actions.userSettings.setBlacklistFilterOnProviderDetails(filterEnabled);
      Toast.success(t('settings.userSettingsSaved'));
    } catch (error) {
      Toast.error(errorMessage(error, t('settings.userSettingsSaveError')));
    }
  };

  return (
    <div className="settingsShell__page">
      <SegmentPart name={t('settings.providerDetails')} helpText={t('settings.providerDetailsHelp')}>
        <Banner
          type="warning"
          description={t('settings.providerDetailsWarning')}
          closeIcon={null}
          style={{ marginBottom: 12 }}
        />
        <Select
          multiple
          style={{ width: '100%' }}
          value={selected}

          optionList={(allProviders ?? []).map((p) => ({ label: p.name, value: p.id }))}
          placeholder={t('settings.providerDetailsPlaceholder')}
          onChange={setSelected}
        />
      </SegmentPart>

      <SegmentPart
        name={t('settings.blacklistFilterOnProviderDetails')}
        helpText={t('settings.blacklistFilterOnProviderDetailsHelp')}
      >
        <Checkbox checked={filterEnabled} onChange={(e) => setFilterEnabled(e.target.checked)}>
          {t('settings.blacklistFilterOnProviderDetailsEnable')}
        </Checkbox>
      </SegmentPart>

      <div className="settingsShell__saveRow">
        <Button
          icon={<IconSave />}
          theme="solid"
          type="primary"
          onClick={handleSave}
          disabled={!dirty}
          loading={savingProviders || savingFilter}
        >
          {t('settings.save')}
        </Button>
      </div>
    </div>
  );
}

ListingDetailsPage.displayName = 'ListingDetailsPage';
