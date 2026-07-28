/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  Input,
  AutoComplete,
  Select,
  Banner,
  Radio,
  RadioGroup,
  Toast,
  Typography,
} from '@douyinfe/semi-ui-19';
import { IconSave, IconPlus, IconDelete } from '@douyinfe/semi-icons';

import { SegmentPart } from '../../../components/segment/SegmentPart';
import { xhrGet, errorMessage } from '../../../services/xhr';
import { debounce } from '../../../utils';
import { useActions, useSelector, useIsLoading } from '../../../services/state/store';
import { useTranslation, availableLanguages } from '../../../services/i18n/i18n.jsx';

const { Text } = Typography;

/**
 * The settings that belong to the person looking at the page, not to the instance.
 *
 * Language, the addresses distances are measured to, which providers get their detail pages
 * fetched, and what deleting a listing should do. Open to every user - an administrator has no
 * more say over someone else's home address than anyone else does.
 *
 * @returns {React.ReactElement} One to be rendered inside the page's Tabs.
 */
export default function UserPreferencesPanel() {
  const t = useTranslation();
  const actions = useActions();

  const language = useSelector((state) => state.userSettings.settings.language);
  const homeAddresses = useSelector((state) => state.userSettings.settings.home_addresses);
  const providerDetails = useSelector((state) => state.userSettings.settings.provider_details);
  const blacklistFilterOnProviderDetails = useSelector(
    (state) => state.userSettings.settings.blacklist_filter_on_provider_details,
  );
  const listingDeletionPreference = useSelector((state) => state.userSettings.settings.listing_deletion_preference);
  const allProviders = useSelector((state) => state.provider);

  const [addresses, setAddresses] = useState([]);
  const [listingDeleteHard, setListingDeleteHard] = useState(false);
  const [listingDeleteSkipPrompt, setListingDeleteSkipPrompt] = useState(false);
  const [dataSource, setDataSource] = useState([]);
  const [activeSearchIdx, setActiveSearchIdx] = useState(null);
  const saving = useIsLoading(actions.userSettings.setHomeAddresses);
  const savingLanguage = useIsLoading(actions.userSettings.setLanguage);

  useEffect(() => {
    const initial = Array.isArray(homeAddresses) ? homeAddresses : [];
    setAddresses(initial.map((a) => ({ label: a.label || '', address: a.address || '', coords: a.coords || null })));
  }, [homeAddresses]);

  useEffect(() => {
    setListingDeleteHard(listingDeletionPreference?.hardDelete ?? false);
    setListingDeleteSkipPrompt(listingDeletionPreference?.skipPrompt ?? false);
  }, [listingDeletionPreference]);

  const handleSaveUserSettings = async () => {
    try {
      const responseJson = await actions.userSettings.setHomeAddresses(
        addresses.filter((a) => a.address).map((a) => ({ label: a.label, address: a.address })),
      );
      setAddresses(
        (responseJson.home_addresses || []).map((a) => ({
          label: a.label || '',
          address: a.address || '',
          coords: a.coords || null,
        })),
      );
      await actions.userSettings.setListingDeletionPreference({
        skipPrompt: listingDeleteSkipPrompt,
        hardDelete: listingDeleteHard,
      });
      await actions.userSettings.getUserSettings();
      Toast.success(t('settings.userSettingsSaved'));
    } catch (error) {
      Toast.error(errorMessage(error, t('settings.userSettingsSaveError')));
    }
  };

  const debouncedSearch = useMemo(
    () =>
      debounce((value) => {
        xhrGet(`/api/user/settings/autocomplete?q=${encodeURIComponent(value)}`)
          .then((response) => {
            if (response.status === 200) {
              setDataSource(response.json);
            }
          })
          .catch(() => {});
      }, 300),
    [],
  );

  const searchAddress = (value, idx) => {
    setActiveSearchIdx(idx);
    if (!value) {
      setDataSource([]);
      return;
    }
    debouncedSearch(value);
  };

  return (
    <div className="generalSettings__tab-content">
      <SegmentPart name={t('settings.language')} helpText={t('settings.languageHelp')}>
        <Select
          style={{ width: 240 }}
          value={language ?? 'en'}
          disabled={savingLanguage}
          optionList={availableLanguages.map((lang) => ({
            label: `${lang.flag} ${lang.name}`,
            value: lang.code,
          }))}
          onChange={async (code) => {
            try {
              await actions.userSettings.setLanguage(code);
            } catch (error) {
              Toast.error(errorMessage(error, t('settings.languageSaveError')));
            }
          }}
        />
      </SegmentPart>

      <SegmentPart name={t('settings.homeAddresses')} helpText={t('settings.homeAddressesHelp')}>
        {addresses.map((row, idx) => (
          <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
            <Input
              value={row.label}
              placeholder={t('settings.homeAddressLabelPlaceholder')}
              style={{ width: 140 }}
              onChange={(v) => setAddresses((prev) => prev.map((r, i) => (i === idx ? { ...r, label: v } : r)))}
            />
            <div style={{ flex: 1 }}>
              <AutoComplete
                data={activeSearchIdx === idx ? dataSource : []}
                value={row.address}
                showClear
                onChange={(v) => setAddresses((prev) => prev.map((r, i) => (i === idx ? { ...r, address: v } : r)))}
                onSearch={(v) => searchAddress(v, idx)}
                placeholder={t('settings.homeAddressPlaceholder')}
                style={{ width: '100%' }}
              />
              {row.coords && row.coords.lat === -1 && (
                <Banner
                  type="danger"
                  description={t('settings.homeAddressGeoError')}
                  closeIcon={null}
                  style={{ marginTop: 8 }}
                />
              )}
            </div>
            <Button
              type="danger"
              theme="borderless"
              icon={<IconDelete />}
              aria-label={t('settings.removeAddress')}
              onClick={() => setAddresses((prev) => prev.filter((_, i) => i !== idx))}
            />
          </div>
        ))}
        <Button
          icon={<IconPlus />}
          onClick={() => setAddresses((prev) => [...prev, { label: '', address: '', coords: null }])}
        >
          {t('settings.addAddress')}
        </Button>
      </SegmentPart>

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
          value={Array.isArray(providerDetails) ? providerDetails : []}
          optionList={(allProviders ?? []).map((p) => ({ label: p.name, value: p.id }))}
          placeholder={t('settings.providerDetailsPlaceholder')}
          onChange={async (selected) => {
            try {
              await actions.userSettings.setProviderDetails(selected);
              Toast.success(t('settings.providerDetailsUpdated'));
            } catch (error) {
              Toast.error(errorMessage(error, t('settings.providerDetailsUpdateError')));
            }
          }}
        />
      </SegmentPart>

      <SegmentPart
        name={t('settings.blacklistFilterOnProviderDetails')}
        helpText={t('settings.blacklistFilterOnProviderDetailsHelp')}
      >
        <Checkbox
          checked={blacklistFilterOnProviderDetails === true}
          onChange={async (e) => {
            try {
              await actions.userSettings.setBlacklistFilterOnProviderDetails(e.target.checked);
              Toast.success(t('settings.blacklistFilterOnProviderDetailsUpdated'));
            } catch (error) {
              Toast.error(errorMessage(error, t('settings.blacklistFilterOnProviderDetailsUpdateError')));
            }
          }}
        >
          {t('settings.blacklistFilterOnProviderDetailsEnable')}
        </Checkbox>
      </SegmentPart>

      <SegmentPart name={t('settings.listingDeletion')} helpText={t('settings.listingDeletionHelp')}>
        <RadioGroup
          value={listingDeleteHard ? 'hard' : 'soft'}
          onChange={(e) => setListingDeleteHard(e.target.value === 'hard')}
        >
          <Radio value="soft">
            <div>
              <Text strong>{t('settings.listingDeletionSoftLabel')}</Text>
              <br />
              <Text type="secondary">{t('settings.listingDeletionSoftDesc')}</Text>
            </div>
          </Radio>
          <Radio value="hard">
            <div>
              <Text strong>{t('settings.listingDeletionHardLabel')}</Text>
              <br />
              <Text type="secondary">
                {t('settings.listingDeletionHardDesc')}
                <br />
                <Text type="warning">{t('settings.listingDeletionHardConsequence')}</Text>
              </Text>
            </div>
          </Radio>
        </RadioGroup>
        <Checkbox
          checked={listingDeleteSkipPrompt}
          onChange={(e) => setListingDeleteSkipPrompt(e.target.checked)}
          style={{ marginTop: 12 }}
        >
          {t('settings.listingDeletionSkipPrompt')}
        </Checkbox>
      </SegmentPart>

      <div className="generalSettings__save-row">
        <Button icon={<IconSave />} theme="solid" type="primary" onClick={handleSaveUserSettings} loading={saving}>
          {t('settings.save')}
        </Button>
      </div>
    </div>
  );
}

UserPreferencesPanel.displayName = 'UserPreferencesPanel';
