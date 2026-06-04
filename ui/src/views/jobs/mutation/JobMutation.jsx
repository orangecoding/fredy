/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Fragment, useState, useCallback } from 'react';

import NotificationAdapterMutator from './components/notificationAdapter/NotificationAdapterMutator';
import NotificationAdapterTable from '../../../components/table/NotificationAdapterTable';
import ProviderTable from '../../../components/table/ProviderTable';
import ProviderMutator from './components/provider/ProviderMutator';
import AreaFilter from './components/areaFilter/AreaFilter';
import Headline from '../../../components/headline/Headline';
import { useActions, useSelector } from '../../../services/state/store';
import { xhrPost } from '../../../services/xhr';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Divider, Input, Switch, Button, TagInput, Toast, Select } from '@douyinfe/semi-ui-19';
import './JobMutation.less';
import { SegmentPart } from '../../../components/segment/SegmentPart';
import {
  IconArrowLeft,
  IconBell,
  IconBriefcase,
  IconPaperclip,
  IconPlayCircle,
  IconPlusCircle,
  IconUser,
  IconFilter,
} from '@douyinfe/semi-icons';
import { useTranslation } from '../../../services/i18n/i18n.jsx';

export default function JobMutator() {
  const t = useTranslation();

  const SPEC_FILTERS = [
    { key: 'maxPrice', translation: t('jobs.mutation.filterMaxPrice') },
    { key: 'minSize', translation: t('jobs.mutation.filterMinSize') },
    { key: 'minRooms', translation: t('jobs.mutation.filterMinRooms') },
  ];

  const jobs = useSelector((state) => state.jobsData.jobs);
  const shareableUserList = useSelector((state) => state.jobsData.shareableUserList);
  const params = useParams();
  const location = useLocation();

  const cloneFromId = location.state?.cloneFrom;
  const jobToClone = cloneFromId ? jobs.find((job) => job.id === cloneFromId) : null;
  const jobToBeEdit = params.jobId == null ? null : jobs.find((job) => job.id === params.jobId);

  const sourceJob = jobToBeEdit || jobToClone;

  const defaultBlacklist = sourceJob?.blacklist || [];
  const defaultName = jobToClone ? `Copy of - ${sourceJob?.name}` : sourceJob?.name || null;
  const defaultProviderData = sourceJob?.provider || [];
  const defaultNotificationAdapter = sourceJob?.notificationAdapter || [];
  const defaultEnabled = sourceJob?.enabled ?? true;
  const defaultShareWithUsers = sourceJob?.shared_with_user ?? [];
  const defaultSpatialFilter = sourceJob?.spatialFilter || null;
  const defaultSpecFilter = sourceJob?.specFilter || null;

  const [providerToEdit, setProviderToEdit] = useState(null);
  const [providerCreationVisible, setProviderCreationVisibility] = useState(false);
  const [notificationCreationVisible, setNotificationCreationVisibility] = useState(false);
  const [editNotificationAdapter, setEditNotificationAdapter] = useState(null);
  const [providerData, setProviderData] = useState(defaultProviderData);
  const [name, setName] = useState(defaultName);
  const [blacklist, setBlacklist] = useState(defaultBlacklist);
  const [notificationAdapterData, setNotificationAdapterData] = useState(defaultNotificationAdapter);
  const [shareWithUsers, setShareWithUsers] = useState(defaultShareWithUsers);
  const [enabled, setEnabled] = useState(defaultEnabled);
  const [spatialFilter, setSpatialFilter] = useState(defaultSpatialFilter);
  const [specFilter, setSpecFilter] = useState(defaultSpecFilter);
  const navigate = useNavigate();
  const actions = useActions();

  // Memoize the spatial filter change handler to prevent map reinitializations
  const handleSpatialFilterChange = useCallback((data) => {
    setSpatialFilter(data);
  }, []);

  const handleSpecFilterChange = (key, value) => {
    if (!SPEC_FILTERS.map(({ key }) => key).includes(key)) return;

    setSpecFilter({ ...specFilter, [key]: value ? parseFloat(value) : null });
  };

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
        spatialFilter,
        specFilter,
        enabled,
        jobId: jobToBeEdit?.id || null,
      });
      await actions.jobsData.getJobs();
      Toast.success(t('jobs.mutation.saved'));
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

      <Headline
        text={jobToBeEdit ? t('jobs.mutation.editTitle') : t('jobs.mutation.createTitle')}
        actions={
          <Button
            icon={<IconArrowLeft />}
            onClick={() => navigate('/jobs')}
            theme="borderless"
            style={{ color: '#909090' }}
          >
            {t('jobs.mutation.back')}
          </Button>
        }
      />
      <form>
        <SegmentPart name={t('jobs.mutation.sectionName')} Icon={IconPaperclip}>
          <Input
            autoFocus
            type="text"
            maxLength={40}
            placeholder={t('jobs.mutation.namePlaceholder')}
            width={6}
            value={name}
            onChange={(value) => setName(value)}
          />
        </SegmentPart>
        <Divider margin="1rem" />
        <SegmentPart
          name={t('jobs.mutation.sectionProviders')}
          Icon={IconBriefcase}
          helpText={t('jobs.mutation.providersHelp')}
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
            {t('jobs.mutation.addProvider')}
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
          name={t('jobs.mutation.sectionNotifications')}
          helpText={t('jobs.mutation.notificationsHelp')}
        >
          <Button
            type="primary"
            className="jobMutation__newButton"
            icon={<IconPlusCircle />}
            onClick={() => setNotificationCreationVisibility(true)}
          >
            {t('jobs.mutation.addNotification')}
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
          Icon={IconFilter}
          name={t('jobs.mutation.sectionBlacklist')}
          helpText={t('jobs.mutation.blacklistHelp')}
        >
          <TagInput
            value={blacklist || []}
            placeholder={t('jobs.mutation.blacklistPlaceholder')}
            onChange={(v) => setBlacklist([...v])}
          />
        </SegmentPart>
        <Divider margin="1rem" />
        <SegmentPart
          Icon={IconFilter}
          name={t('jobs.mutation.sectionCriteriaFilter')}
          helpText={t('jobs.mutation.criteriaFilterHelp')}
        >
          <div className="jobMutation__specFilter">
            {SPEC_FILTERS.map((filter) => (
              <div key={filter.key} className="jobMutation__specFilterItem">
                <div className="jobMutation__specFilterLabel">{filter.translation}</div>
                <Input
                  type="number"
                  placeholder={t('jobs.mutation.criteriaNumberPlaceholder')}
                  value={specFilter?.[filter.key]}
                  onChange={(value) => handleSpecFilterChange(filter.key, value)}
                />
              </div>
            ))}
          </div>
        </SegmentPart>
        <Divider margin="1rem" />
        <SegmentPart
          Icon={IconFilter}
          name={t('jobs.mutation.sectionAreaFilter')}
          helpText={t('jobs.mutation.areaFilterHelp')}
        >
          <AreaFilter spatialFilter={spatialFilter} onChange={handleSpatialFilterChange} />
        </SegmentPart>
        <Divider margin="1rem" />
        <SegmentPart Icon={IconUser} name={t('jobs.mutation.sectionSharing')} helpText={t('jobs.mutation.sharingHelp')}>
          {shareableUserList.length === 0 ? (
            <div>{t('jobs.mutation.sharingNoUsers')}</div>
          ) : (
            <Select
              filter
              multiple
              placeholder={t('jobs.mutation.sharingSearchPlaceholder')}
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
          name={t('jobs.mutation.sectionActivation')}
          helpText={t('jobs.mutation.activationHelp')}
        >
          <Switch className="jobMutation__spaceTop" onChange={(checked) => setEnabled(checked)} checked={enabled} />
        </SegmentPart>
        <Divider margin="1rem" />
        <Button type="danger" style={{ marginRight: '1rem' }} onClick={() => navigate('/jobs')}>
          {t('jobs.mutation.cancel')}
        </Button>
        <Button type="primary" icon={<IconPlusCircle />} disabled={!isSavingEnabled()} onClick={mutateJob}>
          {t('jobs.mutation.save')}
        </Button>
      </form>
    </Fragment>
  );
}
