/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useState } from 'react';
import { Checkbox, Select, Toast } from '@douyinfe/semi-ui-19';
import { IconAlertTriangle } from '@douyinfe/semi-icons';

import { SegmentPart } from '../../../components/segment/SegmentPart';
import SettingsSaveBar from '../../../components/settingsShell/SettingsSaveBar.jsx';
import { useUnsavedWarning } from '../../../hooks/useUnsavedWarning.js';
import { errorMessage } from '../../../services/xhr';
import { useActions, useSelector, useIsLoading } from '../../../services/state/store';
import { useTranslation } from '../../../services/i18n/i18n.jsx';
import './ListingDetailsPage.less';

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

  /**
   * Put both controls back on what is stored.
   *
   * @returns {void}
   */
  const discard = () => {
    setSelected(Array.isArray(providerDetails) ? providerDetails : []);
    setFilterEnabled(blacklistFilter === true);
  };

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

  useUnsavedWarning(dirty);

  const handleSave = async () => {
    try {
      await actions.userSettings.setProviderDetails(selected);
      await actions.userSettings.setBlacklistFilterOnProviderDetails(filterEnabled);
      Toast.success(t('settings.userSettingsSaved'));
    } catch (error) {
      Toast.error(errorMessage(error, t('settings.userSettingsSaveError')));
    }
  };

  const providers = allProviders ?? [];

  return (
    <div className="settingsShell__page">
      <SegmentPart
        name={t('settings.providerDetails')}
        helpText={
          <>
            {t('settings.providerDetailsHelp')}
            <span className="settingsShell__helpWarning">
              <IconAlertTriangle size="small" />
              {t('settings.providerDetailsWarning')}
            </span>
          </>
        }
      >
        <Select
          multiple
          style={{ width: '100%' }}
          value={selected}
          optionList={providers.map((p) => ({ label: p.name, value: p.id }))}
          placeholder={t('settings.providerDetailsPlaceholder')}
          onChange={setSelected}
        />
        {/* Wovon abhaengt, wie teuer das wird. Die Hilfe sagt "ein zusaetzlicher Abruf pro Inserat",
            und die Zahl dazu stand nirgends. */}
        <p className="listingDetailsPage__count">
          {t('settings.providerDetailsCount', { selected: selected.length, total: providers.length })}
        </p>

        {/* Ohne einen einzigen gewaehlten Anbieter gibt es keinen vollen Anzeigentext, gegen den
            gefiltert werden koennte. Gedaempft statt versteckt: wer ueberlegt, ob er Anbieter-
            Details einschaltet, soll sehen, was danach moeglich ist. */}
        <div
          className={`settingsShell__subSettings${selected.length > 0 ? '' : ' settingsShell__subSettings--disabled'}`}
        >
          <div className="settingsShell__subSetting">
            <span className="settingsShell__subSetting__label">{t('settings.blacklistFilterOnProviderDetails')}</span>
            <p className="settingsShell__subSetting__help">{t('settings.blacklistFilterOnProviderDetailsHelp')}</p>
            <Checkbox
              checked={filterEnabled}
              disabled={selected.length === 0}
              onChange={(e) => setFilterEnabled(e.target.checked)}
            >
              {t('settings.blacklistFilterOnProviderDetailsEnable')}
            </Checkbox>
          </div>
        </div>
      </SegmentPart>

      <SettingsSaveBar dirty={dirty} saving={savingProviders || savingFilter} onSave={handleSave} onDiscard={discard} />
    </div>
  );
}

ListingDetailsPage.displayName = 'ListingDetailsPage';
