/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useMemo, useState } from 'react';
import { Button, Input, AutoComplete, Banner, Select, Toast } from '@douyinfe/semi-ui-19';
import { IconSave, IconPlus, IconDelete } from '@douyinfe/semi-icons';

import { SegmentPart } from '../../../components/segment/SegmentPart';
import { xhrGet, errorMessage } from '../../../services/xhr';
import { debounce } from '../../../utils';
import { useActions, useSelector, useIsLoading } from '../../../services/state/store';
import { useTranslation } from '../../../services/i18n/i18n.jsx';

/**
 * The default time of day a travel time refers to.
 *
 * Mirrors the server's fallback. The day is never asked for: it is always the next working day,
 * because choosing between Tuesday and Wednesday is a question with no useful answer.
 */
const DEFAULT_DEPARTURE = { time: '08:00' };

/** The times of day worth offering. A commute is asked about the morning or the evening. */
const DEPARTURE_TIMES = ['06:00', '07:00', '07:30', '08:00', '08:30', '09:00', '12:00', '17:00', '17:30', '18:00'];

/** How an address can be measured. Public transport first, because it is the default. */
const MODES = ['transit', 'car', 'bike', 'walk'];

/**
 * The places distances are measured to.
 *
 * Each address is geocoded on save, and every stored listing's distance is recalculated afterwards,
 * which is why this is a Save button rather than an as-you-type write.
 *
 * @returns {React.ReactElement}
 */
export default function TravelTimePage() {
  const t = useTranslation();
  const actions = useActions();

  const homeAddresses = useSelector((state) => state.userSettings.settings.home_addresses);
  const saving = useIsLoading(actions.userSettings.setHomeAddresses);

  const [addresses, setAddresses] = useState([]);
  const [dataSource, setDataSource] = useState([]);
  const [activeSearchIdx, setActiveSearchIdx] = useState(null);

  useEffect(() => {
    const initial = Array.isArray(homeAddresses) ? homeAddresses : [];
    setAddresses(
      initial.map((a) => ({
        label: a.label || '',
        address: a.address || '',
        coords: a.coords || null,
        departure: a.departure || DEFAULT_DEPARTURE,
        mode: a.mode || 'transit',
      })),
    );
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
        addresses
          .filter((a) => a.address)
          .map((a) => ({ label: a.label, address: a.address, departure: a.departure, mode: a.mode })),
      );
      setAddresses(
        (responseJson.home_addresses || []).map((a) => ({
          label: a.label || '',
          address: a.address || '',
          coords: a.coords || null,
          departure: a.departure || DEFAULT_DEPARTURE,
          mode: a.mode || 'transit',
        })),
      );
      Toast.success(t('settings.userSettingsSaved'));
    } catch (error) {
      Toast.error(errorMessage(error, t('settings.userSettingsSaveError')));
    }
  };

  return (
    <div className="settingsShell__page">
      <SegmentPart name={t('settings.travelTimeSection')} helpText={t('settings.travelTimeSectionHelp')}>
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
                {/* A journey time is meaningless without a departure: the ride to the office at
                    eight and the ride home at half five are not the same trip, and neither
                    resembles Sunday. Per address, because "Home" and "Work" are usually asked
                    about in opposite directions. */}
                <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="settingsShell__inlineLabel">{t('settings.addressModeLabel')}</span>
                  <Select
                    size="small"
                    style={{ width: 150 }}
                    value={row.mode ?? 'transit'}
                    onChange={(v) => setAddresses((prev) => prev.map((r, i) => (i === idx ? { ...r, mode: v } : r)))}
                  >
                    {MODES.map((mode) => (
                      <Select.Option key={mode} value={mode}>
                        {t(`travelTime.mode.${mode}`)}
                      </Select.Option>
                    ))}
                  </Select>

                  {/* Only public transport depends on a time of day. A drive is a drive whenever
                      you make it, so asking for one would be asking a question with no effect. */}
                  {(row.mode ?? 'transit') === 'transit' && (
                    <>
                      <span className="settingsShell__inlineLabel">{t('settings.addressDepartureLabel')}</span>
                      <Select
                        size="small"
                        style={{ width: 100 }}
                        value={row.departure?.time ?? DEFAULT_DEPARTURE.time}
                        onChange={(v) =>
                          setAddresses((prev) =>
                            prev.map((r, i) =>
                              i === idx ? { ...r, departure: { ...(r.departure ?? DEFAULT_DEPARTURE), time: v } } : r,
                            ),
                          )
                        }
                      >
                        {DEPARTURE_TIMES.map((time) => (
                          <Select.Option key={time} value={time}>
                            {time}
                          </Select.Option>
                        ))}
                      </Select>
                    </>
                  )}
                </div>
                <div className="settingsShell__inlineHint">
                  {(row.mode ?? 'transit') === 'transit'
                    ? t('settings.addressDepartureHelp')
                    : t('settings.addressStreetModeHelp')}
                </div>
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
            onClick={() =>
              setAddresses((prev) => [
                ...prev,
                { label: '', address: '', coords: null, departure: DEFAULT_DEPARTURE, mode: 'transit' },
              ])
            }
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

TravelTimePage.displayName = 'TravelTimePage';
