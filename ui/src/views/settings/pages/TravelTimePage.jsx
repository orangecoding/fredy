/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useMemo, useState } from 'react';
import { Progress, Toast } from '@douyinfe/semi-ui-19';
import { IconPlus } from '@douyinfe/semi-icons';

import { SegmentPart } from '../../../components/segment/SegmentPart';
import SettingsSaveBar from '../../../components/settingsShell/SettingsSaveBar.jsx';
import { useUnsavedWarning } from '../../../hooks/useUnsavedWarning.js';
import { xhrGet, errorMessage } from '../../../services/xhr';
import { debounce } from '../../../utils';
import { useActions, useSelector, useIsLoading } from '../../../services/state/store';
import { useTranslation } from '../../../services/i18n/i18n.jsx';
import TravelTimeEntry from './components/TravelTimeEntry.jsx';
import './travelTimePage.less';

/**
 * The default time of day a travel time refers to.
 *
 * Mirrors the server's fallback. The day is never asked for: it is always the next working day,
 * because choosing between Tuesday and Wednesday is a question with no useful answer.
 */
const DEFAULT_DEPARTURE = { time: '08:00' };

/** Source of the rows' client-side keys. Never sent to the server. */
let lastRowKey = 0;

/**
 * One entry, normalised out of whatever the server sent.
 *
 * Carries `key`, an identity for React only. The rows keep state of their own (whether their
 * controls are open), and keyed by position that state moved to the next row whenever one above it
 * was removed. Left out of the comparison and of the save payload.
 *
 * @param {Object} entry
 * @returns {Object}
 */
function toRow(entry) {
  lastRowKey += 1;
  return {
    key: `row-${lastRowKey}`,
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
 * The rows as they would be saved, for comparing: without their client-side keys.
 *
 * @param {Object[]} rows
 * @returns {string}
 */
function comparableRows(rows) {
  return JSON.stringify(rows.map(({ key: _key, ...row }) => row));
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
  /** The row the suggestions belong to, by key: an index pointed at the next row after a removal. */
  const [activeSearchKey, setActiveSearchKey] = useState(null);
  const [progress, setProgress] = useState(null);
  // Welche Zeile gerade neu angelegt wurde, damit sie ihre Regler offen zeigt. Ein Schluessel, kein
  // Flag an der Zeile: die Zeilen werden aus der Antwort des Servers neu gebaut und ein Flag daran
  // ueberlebte das Speichern nicht.
  const [openKey, setOpenKey] = useState(null);

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

  // Die einzige Seite, die das bisher nicht gerechnet hat: ihr Speichern-Knopf war immer aktiv,
  // auch wenn nichts geaendert war. Verglichen wird gegen dieselbe Normalisierung, aus der die
  // Zeilen gebaut werden, sonst meldete jede frisch geladene Seite eine Aenderung.
  const dirty = useMemo(
    () => comparableRows(rows) !== comparableRows((Array.isArray(homeAddresses) ? homeAddresses : []).map(toRow)),
    [rows, homeAddresses],
  );

  useUnsavedWarning(dirty);

  // An address whose geocode failed is stored at -1/-1, and saving the list again is how it is
  // retried: the route geocodes every address on save. The bar holds the only Save, so it has to be
  // there for that too, not only once something was edited.
  const geocodeFailed = rows.some((row) => row.kind !== 'category' && row.coords?.lat === -1);

  /**
   * Put the list back on what is stored.
   *
   * @returns {void}
   */
  const discard = () => setRows((Array.isArray(homeAddresses) ? homeAddresses : []).map(toRow));

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

  const searchAddress = (value, key) => {
    setActiveSearchKey(key);
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

  /**
   * Add an entry of the given kind, with its controls already open.
   *
   * @param {'address'|'category'} kind
   * @param {string} mode
   * @returns {void}
   */
  const addRow = (kind, mode) => {
    const row = toRow({ kind, mode });
    setOpenKey(row.key);
    setRows((prev) => [...prev, row]);
  };

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
      <SegmentPart
        name={t('settings.travelTimeSection')}
        // Every explanation the rows used to print, once, including the place types' one: that a
        // place type is measured to the nearest one found in OpenStreetMap is said nowhere else.
        helpText={`${t('settings.travelTimeSectionHelp')} ${t('settings.addressDepartureHelp')} ${t('settings.addressStreetModeHelp')} ${t('settings.placeTypeHelp')}`}
      >
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
                  className="travelTimePage__progressBar"
                />
              )}
              <span className="travelTimePage__progressText">
                {progress.measured < progress.total
                  ? t('settings.travelTimeProgress', progress)
                  : t('settings.travelTimeProgressAll', progress)}
              </span>
              {/* Why a page that will not change before tomorrow is not broken. */}
              {progress.measured < progress.total && (
                <span className="settingsShell__inlineHint">{t('settings.travelTimeProgressHelp')}</span>
              )}
            </div>
          )}

          {rows.map((row, idx) => (
            <TravelTimeEntry
              key={row.key}
              row={row}
              startOpen={row.key === openKey}
              suggestions={activeSearchKey === row.key ? dataSource : []}
              onSearch={(value) => searchAddress(value, row.key)}
              onChange={(patch) => update(idx, patch)}
              onRemove={() => setRows((prev) => prev.filter((candidate) => candidate.key !== row.key))}
            />
          ))}

          {/* Die Seite, auf die Karte und Inserate verweisen und ohne die dort Filter gesperrt
              sind, empfing einen neuen Benutzer mit zwei nackten Knoepfen. */}
          {rows.length === 0 && <p className="travelTimePage__empty">{t('settings.travelTimeEmpty')}</p>}

          <div className="travelTimePage__add">
            {[
              {
                kind: 'address',
                mode: 'transit',
                labelKey: 'settings.addAddressEntry',
                helpKey: 'settings.addAddressHelp',
              },
              {
                kind: 'category',
                mode: 'walk',
                labelKey: 'settings.addPlaceType',
                helpKey: 'settings.addPlaceTypeHelp',
              },
            ].map((option) => (
              <button
                key={option.kind}
                type="button"
                className="travelTimePage__addOption"
                onClick={() => addRow(option.kind, option.mode)}
              >
                <span className="travelTimePage__addName">
                  <IconPlus size="small" />
                  {t(option.labelKey)}
                </span>
                <span className="travelTimePage__addHelp">{t(option.helpKey)}</span>
              </button>
            ))}
          </div>
        </>
      </SegmentPart>

      <SettingsSaveBar
        dirty={dirty || geocodeFailed}
        saving={saving}
        note={!dirty && geocodeFailed ? t('settings.travelTimeRetryGeocode') : null}
        onSave={handleSave}
        onDiscard={discard}
      />
    </div>
  );
}

TravelTimePage.displayName = 'TravelTimePage';
