/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useMemo, useState } from 'react';
import { Button, Input, AutoComplete, Banner, Progress, Select, Toast } from '@douyinfe/semi-ui-19';
import { IconSave, IconPlus, IconDelete } from '@douyinfe/semi-icons';

import { SegmentPart } from '../../../components/segment/SegmentPart';
import { xhrGet, errorMessage } from '../../../services/xhr';
import { debounce } from '../../../utils';
import { useActions, useSelector, useIsLoading } from '../../../services/state/store';
import { useTranslation } from '../../../services/i18n/i18n.jsx';
import { PLACE_CATEGORIES, ADDRESS_ICON, placeCategoryIcon } from '../../../services/travelTime/placeCategories.js';
import './travelTimePage.less';

/**
 * The default time of day a travel time refers to.
 *
 * Mirrors the server's fallback. The day is never asked for: it is always the next working day,
 * because choosing between Tuesday and Wednesday is a question with no useful answer.
 */
const DEFAULT_DEPARTURE = { time: '08:00' };

/** The times of day worth offering. A commute is asked about the morning or the evening. */
const DEPARTURE_TIMES = ['06:00', '07:00', '07:30', '08:00', '08:30', '09:00', '12:00', '17:00', '17:30', '18:00'];

/** How an entry can be measured. Public transport first, because it is the default. */
const MODES = ['transit', 'car', 'bike', 'walk'];

/**
 * One entry, normalised out of whatever the server sent.
 *
 * @param {Object} entry
 * @returns {Object}
 */
function toRow(entry) {
  return {
    kind: entry.kind === 'category' ? 'category' : 'address',
    category: entry.category || '',
    label: entry.label || '',
    address: entry.address || '',
    coords: entry.coords || null,
    departure: entry.departure || DEFAULT_DEPARTURE,
    mode: entry.mode || 'transit',
  };
}

/**
 * The controls every entry has, whatever kind it is: how you get there, and when.
 *
 * Shared rather than duplicated because it is genuinely the same question. What differs between an
 * address and a place type is *where* you are going, which is the line above this one.
 *
 * @param {Object} props
 * @returns {React.ReactElement}
 */
function ModeControls({ row, onChange }) {
  const t = useTranslation();
  const mode = row.mode ?? 'transit';

  return (
    <div className="travelTimePage__controls">
      <span className="settingsShell__inlineLabel">{t('settings.addressModeLabel')}</span>
      <Select size="small" style={{ width: 150 }} value={mode} onChange={(v) => onChange({ mode: v })}>
        {MODES.map((option) => (
          <Select.Option key={option} value={option}>
            {t(`travelTime.mode.${option}`)}
          </Select.Option>
        ))}
      </Select>

      {/* Only public transport depends on a time of day. A drive is a drive whenever you make it,
          so asking for one would be asking a question with no effect. */}
      {mode === 'transit' && (
        <>
          <span className="settingsShell__inlineLabel">{t('settings.addressDepartureLabel')}</span>
          <Select
            size="small"
            style={{ width: 100 }}
            value={row.departure?.time ?? DEFAULT_DEPARTURE.time}
            onChange={(v) => onChange({ departure: { ...(row.departure ?? DEFAULT_DEPARTURE), time: v } })}
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
  );
}

/**
 * A place you have named: your office, your parents.
 *
 * @param {Object} props
 * @returns {React.ReactElement}
 */
function AddressRow({ row, suggestions, onSearch, onChange }) {
  const t = useTranslation();

  return (
    <>
      <Input
        value={row.label}
        placeholder={t('settings.homeAddressLabelPlaceholder')}
        onChange={(v) => onChange({ label: v })}
      />
      <AutoComplete
        data={suggestions}
        value={row.address}
        showClear
        onChange={(v) => onChange({ address: v })}
        onSearch={onSearch}
        placeholder={t('settings.homeAddressPlaceholder')}
        style={{ width: '100%' }}
      />
      {row.coords && row.coords.lat === -1 && (
        <Banner type="danger" description={t('settings.homeAddressGeoError')} closeIcon={null} />
      )}
      <ModeControls row={row} onChange={onChange} />
      <div className="settingsShell__inlineHint">
        {(row.mode ?? 'transit') === 'transit'
          ? t('settings.addressDepartureHelp')
          : t('settings.addressStreetModeHelp')}
      </div>
    </>
  );
}

/**
 * A kind of place rather than a particular one: a supermarket, a gym.
 *
 * The row is deliberately the same shape as an address row - name, then where, then how - because
 * from the user's side these are one list of places they need to be near, and every other surface
 * in the app already shows them side by side.
 *
 * What it adds is the last line: a plain restatement of what this row will actually measure. A
 * category picker and a mode picker sitting next to each other do not say "the nearest supermarket
 * on foot" on their own, and that sentence is the whole point of the row.
 *
 * @param {Object} props
 * @returns {React.ReactElement}
 */
function PlaceTypeRow({ row, onChange }) {
  const t = useTranslation();

  const summary = row.category
    ? t('settings.placeTypeSummary', {
        category: t(`travelTime.placeCategory.${row.category}`),
        mode: t(`travelTime.byMode.${row.mode ?? 'transit'}`),
      })
    : t('settings.placeTypeSummaryIncomplete');

  return (
    <>
      <Input
        value={row.label}
        placeholder={t('settings.placeTypeLabelPlaceholder')}
        onChange={(v) => onChange({ label: v })}
      />
      <Select
        value={row.category || undefined}
        placeholder={t('settings.placeTypeCategoryPlaceholder')}
        onChange={(v) => onChange({ category: v })}
        style={{ width: '100%' }}
      >
        {PLACE_CATEGORIES.map((category) => (
          <Select.Option key={category.id} value={category.id}>
            <span aria-hidden="true" className="travelTimePage__optionIcon">
              {category.icon}
            </span>
            {t(`travelTime.placeCategory.${category.id}`)}
          </Select.Option>
        ))}
      </Select>
      <ModeControls row={row} onChange={onChange} />
      <div className="travelTimePage__summary">{summary}</div>
      <div className="settingsShell__inlineHint">{t('settings.placeTypeHelp')}</div>
    </>
  );
}

/**
 * The places every listing is measured against.
 *
 * One list holding two kinds of entry, because "the places I need to be near" is one thought: some
 * of them are addresses you can name, and some are a kind of place where any nearby one will do.
 * Splitting them into two sections would be modelling how they are resolved - a fixed coordinate
 * against one worked out per listing - which is Fredy's problem rather than the reader's, and it
 * would leave this page disagreeing with the job form, the cards and the notifications, all of
 * which already list them together.
 *
 * Each entry is geocoded or looked up on save, and every stored listing's distance is recalculated
 * afterwards, which is why this is a Save button rather than an as-you-type write.
 *
 * @returns {React.ReactElement}
 */
export default function TravelTimePage() {
  const t = useTranslation();
  const actions = useActions();

  const homeAddresses = useSelector((state) => state.userSettings.settings.home_addresses);
  const saving = useIsLoading(actions.userSettings.setHomeAddresses);

  const [rows, setRows] = useState([]);
  const [dataSource, setDataSource] = useState([]);
  const [activeSearchIdx, setActiveSearchIdx] = useState(null);
  const [progress, setProgress] = useState(null);

  /**
   * How far through the backlog the sweeper is.
   *
   * Read on arrival and again after a save, not on a timer. The sweeper runs every two hours, so a
   * poll would spend requests to show the same number back; what this has to answer is the question
   * somebody actually arrives with, which is whether anything is happening at all.
   *
   * @returns {void}
   */
  const loadProgress = () => {
    xhrGet('/api/user/settings/travel-time-progress')
      .then((response) => {
        if (response.status === 200) {
          setProgress(response.json);
        }
      })
      .catch(() => {});
  };

  useEffect(loadProgress, []);

  useEffect(() => {
    setRows((Array.isArray(homeAddresses) ? homeAddresses : []).map(toRow));
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

  /**
   * @param {number} idx
   * @param {Object} patch
   * @returns {void}
   */
  const update = (idx, patch) => setRows((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));

  const handleSave = async () => {
    try {
      const responseJson = await actions.userSettings.setHomeAddresses(
        rows
          // An address with nothing typed in it, and a place type with nothing picked, are both
          // half-finished rows rather than instructions - dropped on save the way an empty address
          // always was.
          .filter((row) => (row.kind === 'category' ? row.category : row.address))
          .map((row) =>
            row.kind === 'category'
              ? { kind: 'category', category: row.category, label: row.label, departure: row.departure, mode: row.mode }
              : { label: row.label, address: row.address, departure: row.departure, mode: row.mode },
          ),
      );
      setRows((responseJson.home_addresses || []).map(toRow));
      // Saving an address puts every listing back in front of the sweeper, which takes a few at a
      // time every couple of hours. Saying only "Saved" would leave somebody watching a page that
      // is not going to change until tomorrow and reading that as the feature being broken.
      Toast.success(
        responseJson.queued > 0
          ? t('settings.travelTimeQueued', { count: responseJson.queued })
          : t('settings.userSettingsSaved'),
      );
      loadProgress();
    } catch (error) {
      Toast.error(errorMessage(error, t('settings.userSettingsSaveError')));
    }
  };

  return (
    <div className="settingsShell__page">
      <SegmentPart name={t('settings.travelTimeSection')} helpText={t('settings.travelTimeSectionHelp')}>
        <>
          {/* What the sweeper has got through. Only shown once there is something to measure, and
              only with a bar while it is still working: a full bar sitting there permanently would
              be decoration, where a partial one is the answer to "did my change take effect". */}
          {progress != null && progress.total > 0 && (
            <div className="travelTimePage__progress">
              {progress.measured < progress.total && (
                <Progress
                  percent={Math.round((progress.measured / progress.total) * 100)}
                  aria-label={t('settings.travelTimeProgress', progress)}
                  size="small"
                />
              )}
              <span className="travelTimePage__progressText">
                {progress.measured < progress.total
                  ? t('settings.travelTimeProgress', progress)
                  : t('settings.travelTimeProgressAll', progress)}
              </span>
              {progress.measured < progress.total && (
                <span className="settingsShell__inlineHint">{t('settings.travelTimeProgressHelp')}</span>
              )}
            </div>
          )}

          {rows.map((row, idx) => (
            <div key={idx} className="travelTimePage__row">
              {/* The one thing that tells the two kinds apart at a glance: a pin for a fixed
                  point, the category's own icon for a kind of place. */}
              <span className="travelTimePage__icon" aria-hidden="true">
                {row.kind === 'category' ? placeCategoryIcon(row.category) : ADDRESS_ICON}
              </span>
              <div className="travelTimePage__body">
                {row.kind === 'category' ? (
                  <PlaceTypeRow row={row} onChange={(patch) => update(idx, patch)} />
                ) : (
                  <AddressRow
                    row={row}
                    suggestions={activeSearchIdx === idx ? dataSource : []}
                    onSearch={(value) => searchAddress(value, idx)}
                    onChange={(patch) => update(idx, patch)}
                  />
                )}
              </div>
              <Button
                type="danger"
                theme="borderless"
                icon={<IconDelete />}
                aria-label={row.kind === 'category' ? t('settings.removePlaceType') : t('settings.removeAddress')}
                onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}
              />
            </div>
          ))}

          <div className="travelTimePage__add">
            <Button
              icon={<IconPlus />}
              onClick={() => setRows((prev) => [...prev, toRow({ kind: 'address', mode: 'transit' })])}
            >
              {t('settings.addAddressEntry')}
            </Button>
            <Button
              icon={<IconPlus />}
              onClick={() => setRows((prev) => [...prev, toRow({ kind: 'category', mode: 'walk' })])}
            >
              {t('settings.addPlaceType')}
            </Button>
          </div>
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
