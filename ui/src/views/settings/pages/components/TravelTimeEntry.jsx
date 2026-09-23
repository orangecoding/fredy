/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useState } from 'react';
import { AutoComplete, Banner, Button, Dropdown, Input, Select } from '@douyinfe/semi-ui-19';
import { IconDelete, IconMore } from '@douyinfe/semi-icons';

import { PLACE_CATEGORIES, ADDRESS_ICON, placeCategoryIcon } from '../../../../services/travelTime/placeCategories.js';
import { useTranslation } from '../../../../services/i18n/i18n.jsx';

/** The times of day worth offering. A commute is asked about the morning or the evening. */
const DEPARTURE_TIMES = ['06:00', '07:00', '07:30', '08:00', '08:30', '09:00', '12:00', '17:00', '17:30', '18:00'];

/** How an entry can be measured. Public transport first, because it is the default. */
const MODES = ['transit', 'car', 'bike', 'walk'];

/** The default time of day a travel time refers to. Mirrors the server's fallback. */
const DEFAULT_DEPARTURE = { time: '08:00' };

/**
 * One place every listing is measured against.
 *
 * Two lines rather than four. The row used to stack a name, a destination, a mode-and-departure
 * strip and a two-line help paragraph, and that paragraph was the same words under every address
 * that travelled by public transport - three addresses printed it three times. It says the same
 * thing once, in the card's own help.
 *
 * What takes its place is the sentence that place types already had: "by public transport, leaving
 * at 08:00". An address never had one, so reading a row meant reading four controls and assembling
 * it yourself. Now both kinds carry it, and the controls behind it are opened when they are wanted.
 *
 * A row that was just added opens them straight away: there is nothing yet to summarise.
 *
 * @param {Object} props
 * @param {Object} props.row
 * @param {boolean} props.startOpen
 * @param {string[]} props.suggestions
 * @param {(value: string) => void} props.onSearch
 * @param {(patch: Object) => void} props.onChange
 * @param {() => void} props.onRemove
 * @returns {React.ReactElement}
 */
export default function TravelTimeEntry({ row, startOpen, suggestions, onSearch, onChange, onRemove }) {
  const t = useTranslation();
  const [editing, setEditing] = useState(startOpen);

  const isCategory = row.kind === 'category';
  const mode = row.mode ?? 'transit';
  const byMode = t(`travelTime.byMode.${mode}`);

  // What this row will actually measure, said in words. A category picker next to a mode picker
  // does not say "a supermarket nearby, on foot" by itself, and that sentence is the whole reason
  // the row is comprehensible without help text.
  let summary;
  if (isCategory) {
    summary = row.category
      ? t('settings.placeTypeSummary', { category: t(`travelTime.placeCategory.${row.category}`), mode: byMode })
      : t('settings.placeTypeSummaryIncomplete');
  } else if (mode === 'transit') {
    summary = t('settings.addressSummary', { mode: byMode, time: row.departure?.time ?? DEFAULT_DEPARTURE.time });
  } else {
    summary = t('settings.addressSummaryNoTime', { mode: byMode });
  }

  return (
    <div className="travelTimePage__row">
      <span className="travelTimePage__icon" aria-hidden="true">
        {isCategory ? placeCategoryIcon(row.category) : ADDRESS_ICON}
      </span>

      <div className="travelTimePage__body">
        <div className="travelTimePage__where">
          <Input
            className="travelTimePage__name"
            value={row.label}
            placeholder={t(isCategory ? 'settings.placeTypeLabelPlaceholder' : 'settings.homeAddressLabelPlaceholder')}
            onChange={(value) => onChange({ label: value })}
          />

          {isCategory ? (
            <Select
              value={row.category || undefined}
              placeholder={t('settings.placeTypeCategoryPlaceholder')}
              onChange={(value) => onChange({ category: value })}
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
          ) : (
            <AutoComplete
              data={suggestions}
              value={row.address}
              showClear
              onChange={(value) => onChange({ address: value })}
              onSearch={onSearch}
              placeholder={t('settings.homeAddressPlaceholder')}
              style={{ width: '100%' }}
            />
          )}
        </div>

        {/* Something that really did just happen, to this one row. */}
        {row.coords && row.coords.lat === -1 && (
          <Banner type="danger" description={t('settings.homeAddressGeoError')} closeIcon={null} />
        )}

        <div className="travelTimePage__summary">
          <span>{summary}</span>
          <Button
            size="small"
            theme="borderless"
            className="travelTimePage__edit"
            aria-expanded={editing}
            onClick={() => setEditing((open) => !open)}
          >
            {t(editing ? 'settings.entryDone' : 'settings.entryChange')}
          </Button>
        </div>

        {editing && (
          <div className="travelTimePage__controls">
            <span className="settingsShell__inlineLabel">{t('settings.addressModeLabel')}</span>
            <Select size="small" style={{ width: 150 }} value={mode} onChange={(value) => onChange({ mode: value })}>
              {MODES.map((option) => (
                <Select.Option key={option} value={option}>
                  {t(`travelTime.mode.${option}`)}
                </Select.Option>
              ))}
            </Select>

            {/* Only public transport depends on a time of day. A drive is a drive whenever you make
                it, so asking for one would be asking a question with no effect. */}
            {mode === 'transit' && (
              <>
                <span className="settingsShell__inlineLabel">{t('settings.addressDepartureLabel')}</span>
                <Select
                  size="small"
                  style={{ width: 100 }}
                  value={row.departure?.time ?? DEFAULT_DEPARTURE.time}
                  onChange={(value) =>
                    onChange({ departure: { ...(row.departure ?? DEFAULT_DEPARTURE), time: value } })
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
        )}
      </div>

      {/* One red trash icon per row was the loudest thing in a list of addresses. */}
      <Dropdown
        trigger="click"
        position="bottomRight"
        clickToHide
        render={
          <Dropdown.Menu>
            <Dropdown.Item type="danger" icon={<IconDelete />} onClick={onRemove}>
              {t(isCategory ? 'settings.removePlaceType' : 'settings.removeAddress')}
            </Dropdown.Item>
          </Dropdown.Menu>
        }
      >
        <Button
          size="small"
          theme="borderless"
          icon={<IconMore />}
          aria-label={t('listings.moreActions')}
          className="travelTimePage__more"
        />
      </Dropdown>
    </div>
  );
}

TravelTimeEntry.displayName = 'TravelTimeEntry';
