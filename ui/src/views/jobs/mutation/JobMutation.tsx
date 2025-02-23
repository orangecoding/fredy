// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import React, { Fragment, useState } from 'react';

// @ts-expect-error TS(6142): Module './components/notificationAdapter/Notificat... Remove this comment to see the full error message
import NotificationAdapterMutator from './components/notificationAdapter/NotificationAdapterMutator';
// @ts-expect-error TS(6142): Module '../../../components/table/NotificationAdap... Remove this comment to see the full error message
import NotificationAdapterTable from '../../../components/table/NotificationAdapterTable';
// @ts-expect-error TS(6142): Module '../../../components/table/ProviderTable' w... Remove this comment to see the full error message
import ProviderTable from '../../../components/table/ProviderTable';
// @ts-expect-error TS(6142): Module './components/provider/ProviderMutator' was... Remove this comment to see the full error message
import ProviderMutator from './components/provider/ProviderMutator';
// @ts-expect-error TS(6142): Module '../../../components/headline/Headline' was... Remove this comment to see the full error message
import Headline from '../../../components/headline/Headline';
import { useDispatch, useSelector } from 'react-redux';
import { xhrPost } from '../../../services/xhr';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import { useHistory } from 'react-router-dom';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import { useParams } from 'react-router';
import { Divider, Input, Switch, Button, TagInput, Toast } from '@douyinfe/semi-ui';
import './JobMutation.less';
// @ts-expect-error TS(6142): Module '../../../components/segment/SegmentPart' w... Remove this comment to see the full error message
import { SegmentPart } from '../../../components/segment/SegmentPart';
import { IconPlusCircle } from '@douyinfe/semi-icons';

export default function JobMutator() {
  // @ts-expect-error TS(2571): Object is of type 'unknown'.
  const jobs = useSelector((state) => state.jobs.jobs);
  const params = useParams();

  const jobToBeEdit = params.jobId == null ? null : jobs.find((job: any) => job.id === params.jobId);

  const defaultBlacklist = jobToBeEdit?.blacklist || [];
  const defaultName = jobToBeEdit?.name || null;
  const defaultProviderData = jobToBeEdit?.provider || [];
  const defaultNotificationAdapter = jobToBeEdit?.notificationAdapter || [];
  const defaultEnabled = jobToBeEdit?.enabled ?? true;

  const [providerCreationVisible, setProviderCreationVisibility] = useState(false);
  const [notificationCreationVisible, setNotificationCreationVisibility] = useState(false);
  const [editNotificationAdapter, setEditNotificationAdapter] = useState(null);
  const [providerData, setProviderData] = useState(defaultProviderData);
  const [name, setName] = useState(defaultName);
  const [blacklist, setBlacklist] = useState(defaultBlacklist);
  const [notificationAdapterData, setNotificationAdapterData] = useState(defaultNotificationAdapter);
  const [enabled, setEnabled] = useState(defaultEnabled);
  const history = useHistory();
  const dispatch = useDispatch();

  const isSavingEnabled = () => {
    return notificationAdapterData.length > 0 && providerData.length > 0 && name != null && name.length > 0;
  };

  const mutateJob = async () => {
    try {
      await xhrPost('/api/jobs', {
        provider: providerData,
        notificationAdapter: notificationAdapterData,
        name,
        blacklist,
        enabled,
        jobId: jobToBeEdit?.id || null,
      });
      await dispatch.jobs.getJobs();
      Toast.success('Job successfully saved...');
      history.push('/jobs');
    } catch (Exception) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      console.error(Exception.json.message);
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      Toast.error(Exception.json != null ? Exception.json.message : Exception);
    }
  };

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <Fragment>
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <ProviderMutator
        visible={providerCreationVisible}
        onVisibilityChanged={(visible: any) => setProviderCreationVisibility(visible)}
        onData={(data: any) => {
          setProviderData([...providerData, data]);
        }}
      />

      {notificationCreationVisible && (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <NotificationAdapterMutator
          visible={notificationCreationVisible}
          onVisibilityChanged={(visible: any) => {
            setEditNotificationAdapter(null);
            setNotificationCreationVisibility(visible);
          }}
          selected={notificationAdapterData}
          editNotificationAdapter={
            editNotificationAdapter == null
              ? null
              : notificationAdapterData.find((adapter: any) => adapter.id === editNotificationAdapter)
          }
          onData={(data: any) => {
            const oldData = [...notificationAdapterData].filter((o) => o.id !== data.id);
            setNotificationAdapterData([...oldData, data]);
          }}
        />
      )}

      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <Headline text={jobToBeEdit ? 'Edit a Job' : 'Create a new Job'} />
      // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
      <form>
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <SegmentPart name="Name">
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <Input
            autofocus
            type="text"
            maxLength={40}
            placeholder="Name"
            width={6}
            value={name}
            onChange={(value: any) => setName(value)}
          />
        </SegmentPart>
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <Divider margin="1rem" />
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <SegmentPart
          name="Provider"
          icon="briefcase"
          helpText={
            'A provider is essentially the service (Immowelt etc.) that Fredy is using to search for new listings. When adding a new provider, Fredy will open a new tab pointing ' +
            'to the website of this provider. You have to adjust your search parameter and click on "Search". If the results are being shown, copy the browser url. This is the url, Fredy will use ' +
            'to search for new listings.'
          }
        >
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <Button
            type="primary"
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            icon={<IconPlusCircle />}
            className="jobMutation__newButton"
            onClick={() => setProviderCreationVisibility(true)}
          >
            Add new Provider
          </Button>

          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <ProviderTable
            providerData={providerData}
            onRemove={(providerId: any) => {
              setProviderData(providerData.filter((provider: any) => provider.id !== providerId));
            }}
          />
        </SegmentPart>
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <Divider margin="1rem" />
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <SegmentPart
          icon="bell"
          name="Notification Adapter"
          helpText="Fredy supports multiple ways to notify you about new findings. These are called notification adapter. You can chose between email, Telegram etc."
        >
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <Button
            type="primary"
            className="jobMutation__newButton"
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            icon={<IconPlusCircle />}
            onClick={() => setNotificationCreationVisibility(true)}
          >
            Add new Notification Adapter
          </Button>

          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <NotificationAdapterTable
            notificationAdapter={notificationAdapterData}
            onRemove={(adapterId: any) => {
              setEditNotificationAdapter(null);
              setNotificationAdapterData(notificationAdapterData.filter((adapter: any) => adapter.id !== adapterId));
            }}
            onEdit={(adapterId: any) => {
              setEditNotificationAdapter(adapterId);
              setNotificationCreationVisibility(true);
            }}
          />
        </SegmentPart>
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <Divider margin="1rem" />
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <SegmentPart
          icon="bell"
          name="Blacklist"
          helpText="If a listing contains one of these words, it will be filtered out. Type in a word, then hit enter."
        >
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <TagInput
            value={blacklist || []}
            placeholder="Add a word for filtering..."
            onChange={(v) => setBlacklist([...v])}
          />
        </SegmentPart>
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <Divider margin="1rem" />
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <SegmentPart
          icon="play circle outline"
          name="Job activation"
          helpText="Whether or not the job is activated. If it is not activated, it will be ignored when Fredy checks for new listings."
        >
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <Switch className="jobMutation__spaceTop" onChange={(checked) => setEnabled(checked)} checked={enabled} />
        </SegmentPart>
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <Divider margin="1rem" />
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <Button type="danger" style={{ marginRight: '1rem' }} onClick={() => history.push('/jobs')}>
          Cancel
        </Button>
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <Button type="primary" icon={<IconPlusCircle />} disabled={!isSavingEnabled()} onClick={mutateJob}>
          Save
        </Button>
      // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
      </form>
    </Fragment>
  );
}
