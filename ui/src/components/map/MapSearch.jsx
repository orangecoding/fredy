/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useCallback, useMemo, useState } from 'react';
import { AutoComplete, Toast } from '@douyinfe/semi-ui-19';
import { IconSearch } from '@douyinfe/semi-icons';

import { debounce } from '../../utils.js';
import { xhrGet } from '../../services/xhr.js';
import { useTranslation } from '../../services/i18n/i18n.jsx';

import './MapSearch.less';

/**
 * Where to search an address, without moving the camera.
 *
 * The suggestion endpoint answers with display names only and the geocode endpoint resolves the
 * one that was chosen, which is why they are two calls rather than one: suggesting is for
 * choosing, geocoding costs a lookup and only the chosen address needs to pay it.
 *
 * Neither call names its countries. Both fall back to the union across the jobs the user can see,
 * which is the same answer `useProviderCountries()` gives the map itself - so the box finds what
 * the map can show and nothing outside it.
 *
 * @param {string} query
 * @returns {Promise<string[]>}
 */
async function fetchSuggestions(query) {
  const response = await xhrGet(`/api/user/settings/autocomplete?q=${encodeURIComponent(query)}`);
  return response.status === 200 && Array.isArray(response.json) ? response.json : [];
}

/** Below this nothing is looked up: two characters match half of Germany. */
const MIN_QUERY_LENGTH = 3;

/**
 * The address search that sits on the map.
 *
 * Deliberately only moves the camera and marks the place it found. It does not filter the listings
 * and does not become part of the view state in the URL: where you are looking and what you are
 * looking *for* are different decisions, and the filters that answer the second one are in the
 * panel below this.
 *
 * Presentational as far as the map is concerned - it reports a hit through `onLocate` rather than
 * touching the map itself, so the flying and the marker stay with the component that owns the map
 * instance.
 *
 * @param {Object} props
 * @param {(coords: {lat: number, lng: number}, label: string) => void} props.onLocate Called with
 *   a resolved address.
 * @param {() => void} props.onClear Called when the field is emptied, so the mark can go with it.
 * @returns {React.ReactElement}
 */
export default function MapSearch({ onLocate, onClear }) {
  const t = useTranslation();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [locating, setLocating] = useState(false);

  // The suggestion endpoint talks to Nominatim, which rate-limits hard. Waiting for a pause in
  // typing keeps one lookup per address rather than one per keystroke.
  const requestSuggestions = useMemo(
    () =>
      debounce((value) => {
        fetchSuggestions(value)
          .then(setSuggestions)
          .catch(() => setSuggestions([]));
      }, 300),
    [],
  );

  const search = (value) => {
    setQuery(value);
    if (!value || value.trim().length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      if (!value) onClear?.();
      return;
    }
    requestSuggestions(value);
  };

  const goTo = useCallback(
    async (address) => {
      const target = typeof address === 'string' ? address.trim() : '';
      if (target.length === 0) return;

      setQuery(target);
      setLocating(true);
      try {
        const response = await xhrGet(`/api/user/settings/geocode?q=${encodeURIComponent(target)}`);
        const { lat, lng } = response.json;
        onLocate?.({ lat, lng }, target);
      } catch {
        // The endpoint answers 404 for "looked, found nothing" and 500 for "could not ask", and
        // the difference does not change what the user can do about it: try another wording.
        Toast.warning(t('map.searchNotFound'));
      } finally {
        setLocating(false);
      }
    },
    [t, onLocate],
  );

  return (
    /*
     * Enter locates whatever has been typed, so an address the suggestions never returned still
     * works - Nominatim's completion is patchy on new streets.
     *
     * Caught on this wrapper rather than through `AutoComplete`'s own `onKeyDown` prop. Semi does
     * forward that prop, but only from a handler it installs on its *own* outer element, and only
     * once `bindKeyBoardEvent()` has run - so whether the prop is called depends on state this
     * component cannot see. A listener one element further out is reached by the same bubbling
     * synthetic event regardless, and it is the path that was actually verified end to end.
     */
    <div
      className="mapSearch"
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        goTo(query);
      }}
    >
      <AutoComplete
        className="mapSearch__field"
        dropdownClassName="mapSearch__dropdown"
        data={suggestions}
        value={query}
        onChange={search}
        onSearch={search}
        onSelect={goTo}
        loading={locating}
        prefix={<IconSearch />}
        showClear
        placeholder={t('map.searchPlaceholder')}
        aria-label={t('map.searchLabel')}
      />
    </div>
  );
}

MapSearch.displayName = 'MapSearch';
