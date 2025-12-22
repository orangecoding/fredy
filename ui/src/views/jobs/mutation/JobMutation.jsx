/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React, { Fragment, useState } from 'react';

import NotificationAdapterMutator from './components/notificationAdapter/NotificationAdapterMutator';
import NotificationAdapterTable from '../../../components/table/NotificationAdapterTable';
import ProviderTable from '../../../components/table/ProviderTable';
import ProviderMutator from './components/provider/ProviderMutator';
import Headline from '../../../components/headline/Headline';
import { useActions, useSelector } from '../../../services/state/store';
import { xhrPost } from '../../../services/xhr';
import { useNavigate, useParams } from 'react-router-dom';
import { Divider, Input, Switch, Button, TagInput, Toast, Select } from '@douyinfe/semi-ui';
import './JobMutation.less';
import { SegmentPart } from '../../../components/segment/SegmentPart';
import {
  IconBell,
  IconBriefcase,
  IconPaperclip,
  IconPlayCircle,
  IconPlusCircle,
  IconUser,
  IconClear,
} from '@douyinfe/semi-icons';

export default function JobMutator() {
  const jobs = useSelector((state) => state.jobsData.jobs);
  const shareableUserList = useSelector((state) => state.jobsData.shareableUserList);
  const params = useParams();

  const jobToBeEdit = params.jobId == null ? null : jobs.find((job) => job.id === params.jobId);

  const defaultBlacklist = jobToBeEdit?.blacklist || [];
  const defaultName = jobToBeEdit?.name || null;
  const defaultProviderData = jobToBeEdit?.provider || [];
  const defaultNotificationAdapter = jobToBeEdit?.notificationAdapter || [];
  const defaultEnabled = jobToBeEdit?.enabled ?? true;

  const [providerToEdit, setProviderToEdit] = useState(null);
  const [providerCreationVisible, setProviderCreationVisibility] = useState(false);
  const [notificationCreationVisible, setNotificationCreationVisibility] = useState(false);
  const [editNotificationAdapter, setEditNotificationAdapter] = useState(null);
  const [providerData, setProviderData] = useState(defaultProviderData);
  const [name, setName] = useState(defaultName);
  const [blacklist, setBlacklist] = useState(defaultBlacklist);
  const [notificationAdapterData, setNotificationAdapterData] = useState(defaultNotificationAdapter);
  const [shareWithUsers, setShareWithUsers] = useState(jobToBeEdit?.shared_with_user ?? []);
  const [enabled, setEnabled] = useState(defaultEnabled);
  const navigate = useNavigate();
  const actions = useActions();

  const isSavingEnabled = () => {
    return Boolean(notificationAdapterData.length && providerData.length && name);
  };

  const handleProviderEdit = (data) => {
    setProviderData(
      providerData.map((provider) => (provider.url === data.oldProviderToEdit.url ? data.newData : provider)),
    );
  };

  const mutateJob = async () => {
    try {
      await xhrPost('/api/jobs', {
        provider: providerData,
        notificationAdapter: notificationAdapterData,
        shareWithUsers,
        name,
        blacklist,
        enabled,
        jobId: jobToBeEdit?.id || null,
      });
      await actions.jobsData.getJobs();
      Toast.success('Job successfully saved...');
      navigate('/jobs');
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
        onEditData={handleProviderEdit}
        providerToEdit={providerToEdit}
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

      <Headline text={jobToBeEdit ? 'Edit Job' : 'Create new Job'} />
      <form>
        <SegmentPart name="Name" Icon={IconPaperclip}>
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
          name="Providers"
          Icon={IconBriefcase}
          helpText={`
            A provider is essentially the service (e.g. ImmoScout24, Kleinanzeigen) that Fredy searches for new listings.
            Fredy will open a new tab pointing to the website of this provider. You have to adjust your search parameter
            and click on "Search". If the results are being shown, copy the browser URL in here.
            `}
        >
          <Button
            type="primary"
            icon={<IconPlusCircle />}
            className="jobMutation__newButton"
            onClick={() => {
              setProviderToEdit(null);
              setProviderCreationVisibility(true);
            }}
          >
            Add new Provider
          </Button>

          <ProviderTable
            providerData={providerData}
            onRemove={(providerUrl) => {
              setProviderData(providerData.filter((provider) => provider.url !== providerUrl));
            }}
            onEdit={(provider) => {
              setProviderCreationVisibility(true);
              setProviderToEdit(provider);
            }}
          />
        </SegmentPart>
        <Divider margin="1rem" />
        <SegmentPart
          Icon={IconBell}
          name="Notification Adapters"
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
          Icon={IconClear}
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
          Icon={IconUser}
          name="Sharing with user"
          helpText="You can share this job with other users. They will be able to see the listings, but only (as the creator) you can edit the job. Admins are filtered from this list as they have access to everything."
        >
          {shareableUserList.length === 0 ? (
            <div>No users found to share this Job to. Please create additional non-admin user.</div>
          ) : (
            <Select
              filter
              multiple
              placeholder="Search user"
              autoClearSearchValue={false}
              defaultValue={shareWithUsers}
              onChange={(value) => setShareWithUsers(value)}
            >
              {shareableUserList.map((user) => (
                <Select.Option value={user.id} key={user.id}>
                  {user.name}
                </Select.Option>
              ))}
            </Select>
          )}
        </SegmentPart>
        <Divider margin="1rem" />
        <SegmentPart
          Icon={IconPlayCircle}
          name="Job activation"
          helpText="Whether or not the job is activated. Inactive jobs will be ignored when Fredy checks for new listings."
        >
          <Switch className="jobMutation__spaceTop" onChange={(checked) => setEnabled(checked)} checked={enabled} />
        </SegmentPart>
        <Divider margin="1rem" />
        <Button type="danger" style={{ marginRight: '1rem' }} onClick={() => navigate('/jobs')}>
          Cancel
        </Button>
        <Button type="primary" icon={<IconPlusCircle />} disabled={!isSavingEnabled()} onClick={mutateJob}>
          Save
        </Button>
      </form>
    </Fragment>
  );
}
