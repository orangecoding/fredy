/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useMemo, useState } from 'react';
import { Button, Input, AutoComplete, Banner, Toast } from '@douyinfe/semi-ui-19';
import { IconSave, IconPlus, IconDelete } from '@douyinfe/semi-icons';

import { SegmentPart } from '../../../components/segment/SegmentPart';
import { xhrGet, errorMessage } from '../../../services/xhr';
import { debounce } from '../../../utils';
import { useActions, useSelector, useIsLoading } from '../../../services/state/store';
import { useTranslation } from '../../../services/i18n/i18n.jsx';

/**
 * The places distances are measured to.
 *
 * Each address is geocoded on save, and every stored listing's distance is recalculated afterwards,
 * which is why this is a Save button rather than an as-you-type write.
 *
 * @returns {React.ReactElement}
 */
export default function AddressesPage() {
  const t = useTranslation();
  const actions = useActions();

  const homeAddresses = useSelector((state) => state.userSettings.settings.home_addresses);
  const saving = useIsLoading(actions.userSettings.setHomeAddresses);

  const [addresses, setAddresses] = useState([]);
  const [dataSource, setDataSource] = useState([]);
  const [activeSearchIdx, setActiveSearchIdx] = useState(null);

  useEffect(() => {
    const initial = Array.isArray(homeAddresses) ? homeAddresses : [];
    setAddresses(initial.map((a) => ({ label: a.label || '', address: a.address || '', coords: a.coords || null })));
  }, [homeAddresses]);

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

  const handleSave = async () => {
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
      Toast.success(t('settings.userSettingsSaved'));
    } catch (error) {
      Toast.error(errorMessage(error, t('settings.userSettingsSaveError')));
    }
  };

  return (
    <div className="settingsShell__page">
      <SegmentPart name={t('settings.homeAddresses')} helpText={t('settings.homeAddressesHelp')}>
        <>
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
        </>
      </SegmentPart>

      <div className="settingsShell__saveRow">
        <Button icon={<IconSave />} theme="solid" type="primary" onClick={handleSave} loading={saving}>
          {t('settings.save')}
        </Button>
      </div>
    </div>
  );
}

AddressesPage.displayName = 'AddressesPage';
