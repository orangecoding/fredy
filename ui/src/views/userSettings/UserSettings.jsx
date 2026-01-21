/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React, { useEffect, useState, useMemo } from 'react';
import { Divider, Button, AutoComplete, Toast, Typography, Banner } from '@douyinfe/semi-ui-19';
import { IconSave, IconHome } from '@douyinfe/semi-icons';
import { xhrGet, xhrPost } from '../../services/xhr';
import { SegmentPart } from '../../components/segment/SegmentPart';
import debounce from 'lodash/debounce';

const { Title } = Typography;

const UserSettings = () => {
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dataSource, setDataSource] = useState([]);

  useEffect(() => {
    fetchUserSettings();
  }, []);

  const fetchUserSettings = async () => {
    try {
      const response = await xhrGet('/api/user/settings');
      if (response.status === 200) {
        const homeAddress = response.json.home_address;
        setAddress(homeAddress?.address || '');
        setCoords(homeAddress?.coords || null);
      }
    } catch {
      Toast.error('Failed to fetch user settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await xhrPost('/api/user/settings', { home_address: address });
      if (response.status === 200) {
        setCoords(response.json.coords);
        Toast.success('Settings saved successfully');
      } else {
        Toast.error(response.json.error || 'Failed to save settings');
      }
    } catch (error) {
      Toast.error(error.json?.error || 'Error while saving settings');
    } finally {
      setSaving(false);
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
          .catch(() => {
            // Silently fail for autocomplete
          });
      }, 300),
    [],
  );

  const searchAddress = (value) => {
    if (!value) {
      setDataSource([]);
      return;
    }
    debouncedSearch(value);
  };

  if (loading) {
    return null;
  }

  return (
    <div className="user-settings">
      <Title heading={2}>User Specific Settings</Title>
      <Divider />
      <SegmentPart
        name="Distance claculation"
        Icon={IconHome}
        helpText="Your address is used to calculate the distance between your chosen location and each listing. The distance is computed using an approximate mathematical method and is intended to give you a rough indication of commute time. If you update your address, we will recalculate the distance for all active listings."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '600px' }}>
          <AutoComplete
            data={dataSource}
            value={address}
            onChange={(v) => setAddress(v)}
            onSearch={searchAddress}
            placeholder="Enter your home address"
            style={{ width: '100%' }}
          />
          {coords && coords.lat === -1 && (
            <Banner type="danger" description="Address found but could not be geocoded accurately." closeIcon={null} />
          )}
        </div>
      </SegmentPart>
      <Divider />
      <div style={{ marginTop: '20px' }}>
        <Button icon={<IconSave />} theme="solid" type="primary" onClick={handleSave} loading={saving}>
          Save Settings
        </Button>
      </div>
    </div>
  );
};

export default UserSettings;
