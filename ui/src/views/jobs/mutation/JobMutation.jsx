import React, { Fragment, useState } from 'react';

import NotificationAdapterMutator from './components/notificationAdapter/NotificationAdapterMutator';
import NotificationAdapterTable from '../../../components/table/NotificationAdapterTable';
import ProviderTable from '../../../components/table/ProviderTable';
import ProviderMutator from './components/provider/ProviderMutator';
import Headline from '../../../components/headline/Headline';
import { useDispatch, useSelector } from 'react-redux';
import { xhrPost } from '../../../services/xhr';
import { useHistory } from 'react-router-dom';
import { useParams } from 'react-router';
import { Divider, Input, Switch, Button, TagInput, Toast } from '@douyinfe/semi-ui';
import './JobMutation.less';
import { SegmentPart } from '../../../components/segment/SegmentPart';
import { IconPlusCircle } from '@douyinfe/semi-icons';
import CustomFields from './components/customFields/CustomFields.jsx';
import Waypoints from './components/waypoints/Waypoints.jsx';

export default function JobMutator() {
  const jobs = useSelector((state) => state.jobs.jobs);
  const defaultCustomFields = useSelector((state) => state.jobs.defaultCustomFields);
  const params = useParams();

  const jobToBeEdit = params.jobId == null ? null : jobs.find((job) => job.id === params.jobId);

  const defaultBlacklist = jobToBeEdit?.blacklist || [];
  const defaultName = jobToBeEdit?.name || null;
  const defaultProviderData = jobToBeEdit?.provider || [];
  const defaultNotificationAdapter = jobToBeEdit?.notificationAdapter || [];
  const defaultEnabled = jobToBeEdit?.enabled ?? true;
  const defaultCustomFieldsForJob = jobToBeEdit?.customFields || defaultCustomFields;
  const defaultWaypoints = jobToBeEdit?.waypoints || [];

  const [providerCreationVisible, setProviderCreationVisibility] = useState(false);
  const [notificationCreationVisible, setNotificationCreationVisibility] = useState(false);
  const [editNotificationAdapter, setEditNotificationAdapter] = useState(null);
  const [providerData, setProviderData] = useState(defaultProviderData);
  const [name, setName] = useState(defaultName);
  const [blacklist, setBlacklist] = useState(defaultBlacklist);
  const [notificationAdapterData, setNotificationAdapterData] = useState(defaultNotificationAdapter);
  const [enabled, setEnabled] = useState(defaultEnabled);
  const [customFields, setCustomFields] = useState(defaultCustomFieldsForJob);
  const [waypoints, setWaypoints] = useState(defaultWaypoints);
  const history = useHistory();
  const dispatch = useDispatch();

  const isCustomFieldsValid = () => {
    // All fields must be either completely filled or completely empty
    return customFields.every(field => {
      const allEmpty = !field.name && !field.questionPrompt && !field.answerLength;
      const allFilled = field.name && field.questionPrompt && field.answerLength;
      return allEmpty || allFilled;
    });
  };

  const isWaypointsValid = () => {
    return waypoints.every(waypoint => {
      const allEmpty = !waypoint.name && !waypoint.location && !waypoint.transportMode;
      const allFilled = waypoint.name && waypoint.location && waypoint.transportMode;
      return allEmpty || allFilled;
    });
  };

  const isSavingEnabled = () => {
    return (
      notificationAdapterData.length > 0 &&
      providerData.length > 0 &&
      name != null &&
      name.length > 0 &&
      isCustomFieldsValid() &&
      isWaypointsValid()
    );
  };

  const mutateJob = async () => {
    try {
      await xhrPost('/api/jobs', {
        provider: providerData,
        notificationAdapter: notificationAdapterData,
        name,
        blacklist,
        enabled,
        customFields,
        waypoints,
        jobId: jobToBeEdit?.id || null,
      });
      await dispatch.jobs.getJobs();
      Toast.success('Job successfully saved...');
      history.push('/jobs');
    } catch (Exception) {
      console.error(Exception.json.message);
      Toast.error(Exception.json != null ? Exception.json.message : Exception);
    }
  };

  return (
    <Fragment>
      <ProviderMutator
        visible={providerCreationVisible}
        onVisibilityChanged={(visible) => setProviderCreationVisibility(visible)}
        onData={(data) => {
          setProviderData([...providerData, data]);
        }}
      />

      {notificationCreationVisible && (
        <NotificationAdapterMutator
          visible={notificationCreationVisible}
          onVisibilityChanged={(visible) => {
            setEditNotificationAdapter(null);
            setNotificationCreationVisibility(visible);
          }}
          selected={notificationAdapterData}
          editNotificationAdapter={
            editNotificationAdapter == null
              ? null
              : notificationAdapterData.find((adapter) => adapter.id === editNotificationAdapter)
          }
          onData={(data) => {
            const oldData = [...notificationAdapterData].filter((o) => o.id !== data.id);
            setNotificationAdapterData([...oldData, data]);
          }}
        />
      )}

      <Headline text={jobToBeEdit ? 'Edit a Job' : 'Create a new Job'} />
      <form>
        <SegmentPart name="Name">
          <Input
            autoFocus
            type="text"
            maxLength={40}
            placeholder="Name"
            width={6}
            value={name}
            onChange={(value) => setName(value)}
          />
        </SegmentPart>
        <Divider margin="1rem" />
        <SegmentPart
          name="Provider"
          icon="briefcase"
          helpText={
            'A provider is essentially the service (Immowelt etc.) that Fredy is using to search for new listings. When adding a new provider, Fredy will open a new tab pointing ' +
            'to the website of this provider. You have to adjust your search parameter and click on "Search". If the results are being shown, copy the browser url. This is the url, Fredy will use ' +
            'to search for new listings.'
          }
        >
          <Button
            type="primary"
            icon={<IconPlusCircle />}
            className="jobMutation__newButton"
            onClick={() => setProviderCreationVisibility(true)}
          >
            Add new Provider
          </Button>

          <ProviderTable
            providerData={providerData}
            onRemove={(providerId) => {
              setProviderData(providerData.filter((provider) => provider.id !== providerId));
            }}
          />
        </SegmentPart>
        <Divider margin="1rem" />
        <SegmentPart
          icon="bell"
          name="Notification Adapter"
          helpText="Fredy supports multiple ways to notify you about new findings. These are called notification adapter. You can chose between email, Telegram etc."
        >
          <Button
            type="primary"
            className="jobMutation__newButton"
            icon={<IconPlusCircle />}
            onClick={() => setNotificationCreationVisibility(true)}
          >
            Add new Notification Adapter
          </Button>

          <NotificationAdapterTable
            notificationAdapter={notificationAdapterData}
            onRemove={(adapterId) => {
              setEditNotificationAdapter(null);
              setNotificationAdapterData(notificationAdapterData.filter((adapter) => adapter.id !== adapterId));
            }}
            onEdit={(adapterId) => {
              setEditNotificationAdapter(adapterId);
              setNotificationCreationVisibility(true);
            }}
          />
        </SegmentPart>
        <Divider margin="1rem" />
        <SegmentPart
          icon="bell"
          name="Blacklist"
          helpText="If a listing contains one of these words, it will be filtered out. Type in a word, then hit enter."
        >
          <TagInput
            value={blacklist || []}
            placeholder="Add a word for filtering..."
            onChange={(v) => setBlacklist([...v])}
          />
        </SegmentPart>
        <Divider margin="1rem" />
        <SegmentPart
          icon="play circle outline"
          name="Job activation"
          helpText="Whether or not the job is activated. If it is not activated, it will be ignored when Fredy checks for new listings."
        >
          <Switch className="jobMutation__spaceTop" onChange={(checked) => setEnabled(checked)} checked={enabled} />
        </SegmentPart>
        <Divider margin="1rem" />
        <SegmentPart
          icon="settings"
          name="Custom Fields"
        >
          <CustomFields value={customFields} onChange={setCustomFields} jobToBeEdit={jobToBeEdit} />
        </SegmentPart>
        <Divider margin="1rem" />
        <SegmentPart
          icon="map marker alternate"
          name="Waypoints"
          helpText="Define important locations and how you want to travel to them. Fredy will calculate travel times from each listing to these locations."
        >
          <Waypoints value={waypoints} onChange={setWaypoints} jobToBeEdit={jobToBeEdit}/>
        </SegmentPart>
        <Divider margin="1rem" />
        <Button type="danger" style={{ marginRight: '1rem' }} onClick={() => history.push('/jobs')}>
          Cancel
        </Button>
        <Button type="primary" icon={<IconPlusCircle />} disabled={!isSavingEnabled()} onClick={mutateJob}>
          Save
        </Button>
      </form>
    </Fragment>
  );
}
