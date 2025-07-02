import React, { Fragment, useState } from 'react';

import NotificationAdapterMutator from './components/notificationAdapter/NotificationAdapterMutator';
import NotificationAdapterTable from '../../../components/table/NotificationAdapterTable';
import ProviderTable from '../../../components/table/ProviderTable';
import ProviderMutator from './components/provider/ProviderMutator';
import Headline from '../../../components/headline/Headline';
import { useDispatch, useSelector } from 'react-redux';
import { parseError, xhrPost } from '#ui_services/xhr';
import { useHistory } from 'react-router-dom';
import { useParams } from 'react-router';
import { Divider, Input, Switch, Button, TagInput, Toast } from '@douyinfe/semi-ui';
import './JobMutation.less';
import { SegmentPart } from '../../../components/segment/SegmentPart';
import { IconPlusCircle } from '@douyinfe/semi-icons';
import { JobInsightParams, Provider, RootState } from 'ui/src/types';
import { NotificationAdapterConfig } from '#types/NotificationAdapter.ts';
import { Job } from '#types/Jobs.ts';
import { XhrApiResponseError } from 'ui/src/types/XhrApi';
import { ApiSaveJobReq } from '#types/Api.ts';

export default function JobMutator() {
  const jobs = useSelector((state: RootState) => state.jobs.jobs);
  const params = useParams<JobInsightParams>();
  const jobToBeEdit: Job | null = params.jobId == null ? null : jobs.find((job) => job.id === params.jobId) || null;

  const defaultBlacklist = jobToBeEdit?.blacklist || [];
  const defaultName = jobToBeEdit?.name || null;
  const defaultProviderData = jobToBeEdit?.provider || [];
  const defaultNotificationAdapter = jobToBeEdit?.notificationAdapter || [];
  const defaultEnabled = jobToBeEdit?.enabled ?? true;

  const [providerCreationVisible, setProviderCreationVisibility] = useState<boolean>(false);
  const [notificationCreationVisible, setNotificationCreationVisibility] = useState<boolean>(false);
  const [editNotificationAdapter, setEditNotificationAdapter] = useState<string | null>(null);
  const [providerData, setProviderData] = useState<Provider[]>(defaultProviderData);
  const [name, setName] = useState<string | null>(defaultName);
  const [blacklist, setBlacklist] = useState<string[]>(defaultBlacklist);
  const [notificationAdapterData, setNotificationAdapterData] =
    useState<NotificationAdapterConfig[]>(defaultNotificationAdapter);
  const [enabled, setEnabled] = useState<boolean>(defaultEnabled);
  const history = useHistory();
  const dispatch = useDispatch();

  const isSavingEnabled = () => {
    return notificationAdapterData.length > 0 && providerData.length > 0 && name != null && name.length > 0;
  };

  const mutateJob = async () => {
    xhrPost<ApiSaveJobReq>('/api/jobs', {
      provider: providerData,
      notificationAdapter: notificationAdapterData,
      name: name!,
      blacklist,
      enabled,
      id: jobToBeEdit?.id,
      userId: jobToBeEdit?.userId,
    })
      .then(async () => {
        await dispatch.jobs.getJobs();
        Toast.success('Job successfully saved...');
        history.push('/jobs');
      })
      .catch((error: XhrApiResponseError | Error) => {
        Toast.error(parseError(error));
      });
  };

  return (
    <Fragment>
      <ProviderMutator
        visible={providerCreationVisible}
        onVisibilityChanged={(visible: boolean) => setProviderCreationVisibility(visible)}
        onData={(data: Provider) => {
          setProviderData([...providerData, data]);
        }}
      />
      <NotificationAdapterMutator
        visible={notificationCreationVisible}
        onVisibilityChanged={(visible: boolean) => {
          setEditNotificationAdapter(null);
          setNotificationCreationVisibility(visible);
        }}
        selected={notificationAdapterData}
        editNotificationAdapter={
          editNotificationAdapter == null
            ? undefined
            : notificationAdapterData.find((adapter) => adapter.id === editNotificationAdapter)
        }
        onData={(data: NotificationAdapterConfig) => {
          const oldData = [...notificationAdapterData].filter((o) => o.id !== data.id);
          setNotificationAdapterData([...oldData, data]);
        }}
      />

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
            onChange={(value: string) => setName(value)}
          />
        </SegmentPart>
        <Divider margin="1rem" />
        <SegmentPart
          name="Provider"
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
            onRemove={(providerId: string) => {
              setProviderData(providerData.filter((provider: Provider) => provider.id !== providerId));
            }}
          />
        </SegmentPart>
        <Divider margin="1rem" />
        <SegmentPart
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
            onRemove={(adapterId: string) => {
              setEditNotificationAdapter(null);
              setNotificationAdapterData(
                notificationAdapterData.filter((adapter: NotificationAdapterConfig) => adapter.id !== adapterId),
              );
            }}
            onEdit={(adapterId: string) => {
              setEditNotificationAdapter(adapterId);
              setNotificationCreationVisibility(true);
            }}
          />
        </SegmentPart>
        <Divider margin="1rem" />
        <SegmentPart
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
          name="Job activation"
          helpText="Whether or not the job is activated. If it is not activated, it will be ignored when Fredy checks for new listings."
        >
          <Switch className="jobMutation__spaceTop" onChange={(checked) => setEnabled(checked)} checked={enabled} />
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
