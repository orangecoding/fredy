/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useState, useMemo } from 'react';
import { Divider, Button, AutoComplete, Toast, Banner } from '@douyinfe/semi-ui-19';
import { IconSave, IconHome } from '@douyinfe/semi-icons';
import { useSelector, useActions, useIsLoading } from '../../services/state/store';
import { xhrGet } from '../../services/xhr';
import { SegmentPart } from '../../components/segment/SegmentPart';
import debounce from 'lodash/debounce';

const UserSettings = () => {
  const actions = useActions();
  const homeAddress = useSelector((state) => state.userSettings.settings.home_address);
  const [address, setAddress] = useState(homeAddress?.address || '');
  const [coords, setCoords] = useState(homeAddress?.coords || null);
  const saving = useIsLoading(actions.userSettings.setHomeAddress);
  const [dataSource, setDataSource] = useState([]);

  useEffect(() => {
    setAddress(homeAddress?.address || '');
    setCoords(homeAddress?.coords || null);
  }, [homeAddress]);

  const handleSave = async () => {
    try {
      const responseJson = await actions.userSettings.setHomeAddress(address);
      setCoords(responseJson.coords);
      await actions.userSettings.getUserSettings();
      Toast.success(
        'Settings saved successfully. We will now start calculating distances for you. This may take a while and runs in the background.',
      );
    } catch (error) {
      Toast.error(error.json?.error || 'Error while saving settings');
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

  return (
    <div className="user-settings">
      <SegmentPart
        name="Distance claculation"
        Icon={IconHome}
        helpText="The address you enter is used to calculate the distance between your chosen location and each listing. The distance is computed using an approximate mathematical method and is intended to give you a rough indication of commute time. If you update your address, we will recalculate the distance for all active listings."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '600px' }}>
          <AutoComplete
            data={dataSource}
            value={address}
            showClear
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
