/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useCallback, useMemo, useState } from 'react';
import { AutoComplete, Button, Popover, Typography } from '@douyinfe/semi-ui-19';
import { IconEdit, IconMapPin, IconSearch } from '@douyinfe/semi-icons';

import { debounce } from '../../../utils.js';
import { xhrGet } from '../../../services/xhr.js';
import { useTranslation } from '../../../services/i18n/i18n.jsx';
import './AddressEditor.less';

/** Shorter than this and Nominatim answers with half of Germany. */
const MIN_QUERY_LENGTH = 3;

/**
 * Correct the address a portal reported for a listing.
 *
 * Portals are vague on purpose - district instead of street, or nothing at all - while the
 * description and the photos usually give the real location away. This is where that knowledge goes
 * so the map, the distances and the nearby stops can use it.
 *
 * Two ways out: an address the geocoder recognises, or, when it recognises nothing, dropping a pin
 * on the map. The second is the interesting one, because the addresses worth correcting are exactly
 * the ones a geocoder struggles with.
 *
 * @param {Object} props
 * @param {boolean} props.isManual - Whether the current address was already set by the user.
 * @param {(position: {address: string, latitude: number, longitude: number}) => Promise<void>} props.onSave
 * @param {(address: string) => void} props.onPickOnMap - Hand over to pin dropping with this text.
 */
export default function AddressEditor({ isManual = false, onSave, onPickOnMap }) {
  const t = useTranslation();
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  // 'idle' | 'checking' | 'saving' | 'notFound'
  const [status, setStatus] = useState('idle');

  // Nominatim rate-limits hard, and the backend passes that on. Waiting for a pause in typing
  // means one lookup per address rather than one per keystroke.
  const requestSuggestions = useMemo(
    () =>
      debounce((value) => {
        xhrGet(`/api/user/settings/autocomplete?q=${encodeURIComponent(value)}`)
          .then((response) => setSuggestions(response.status === 200 ? response.json : []))
          .catch(() => setSuggestions([]));
      }, 300),
    [],
  );

  const search = (value) => {
    setQuery(value);
    setStatus('idle');
    if (!value || value.trim().length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      return;
    }
    requestSuggestions(value);
  };

  const reset = useCallback(() => {
    setQuery('');
    setSuggestions([]);
    setStatus('idle');
  }, []);

  const submit = useCallback(
    async (value) => {
      const address = typeof value === 'string' ? value.trim() : '';
      if (address.length === 0) return;

      setQuery(address);
      setStatus('checking');
      let coords;
      try {
        const response = await xhrGet(`/api/user/settings/geocode?q=${encodeURIComponent(address)}`);
        coords = response.json;
      } catch {
        // A 404 means the geocoder found nothing, which is not a failure of the feature but the
        // case it exists for. Anything else lands here too; the pin drop rescues both.
        setStatus('notFound');
        return;
      }

      setStatus('saving');
      try {
        await onSave({ address, latitude: coords.lat, longitude: coords.lng });
        setVisible(false);
        reset();
      } catch {
        setStatus('idle');
      }
    },
    [onSave, reset],
  );

  const content = (
    <div className="addressEditor">
      <header className="addressEditor__header">
        <Typography.Title heading={6} className="addressEditor__title">
          {t('listing.detail.editAddress')}
        </Typography.Title>
        <Typography.Paragraph type="tertiary" size="small" className="addressEditor__hint">
          {t('listing.detail.editAddressHint')}
        </Typography.Paragraph>
      </header>

      <AutoComplete
        data={suggestions}
        value={query}
        onChange={search}
        onSearch={search}
        onSelect={submit}
        // Enter submits whatever has been typed, so an address the suggestions never returned still
        // gets its chance - which is most of them, for the listings this feature is for.
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            submit(query);
          }
        }}
        loading={status === 'checking'}
        prefix={<IconSearch />}
        showClear
        placeholder={t('listing.detail.addressSearchPlaceholder')}
        style={{ width: '100%' }}
      />

      {status === 'notFound' && (
        <div className="addressEditor__notFound">
          <Typography.Text type="warning" size="small">
            {t('listing.detail.addressNotFound')}
          </Typography.Text>
          <Button
            block
            icon={<IconMapPin />}
            onClick={() => {
              setVisible(false);
              onPickOnMap(query.trim());
              reset();
            }}
          >
            {t('listing.detail.setAddressManually')}
          </Button>
        </div>
      )}

      <footer className="addressEditor__actions">
        <Typography.Text type="tertiary" size="small">
          {isManual ? t('listing.detail.addressIsManual') : ''}
        </Typography.Text>
        <div className="addressEditor__buttons">
          <Button theme="borderless" onClick={() => setVisible(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            theme="solid"
            type="primary"
            loading={status === 'saving'}
            disabled={query.trim().length === 0}
            onClick={() => submit(query)}
          >
            {t('listing.detail.addressSave')}
          </Button>
        </div>
      </footer>
    </div>
  );

  return (
    <Popover
      trigger="click"
      position="bottomLeft"
      visible={visible}
      onVisibleChange={(next) => {
        setVisible(next);
        if (!next) reset();
      }}
      content={content}
    >
      <Button
        size="small"
        theme="borderless"
        icon={<IconEdit />}
        aria-label={t('listing.detail.editAddress')}
        className="addressEditor__trigger"
      />
    </Popover>
  );
}
