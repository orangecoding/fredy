/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Fragment, useState, useCallback, useEffect } from 'react';

import NotificationChannelPicker from './components/notificationAdapter/NotificationChannelPicker';
import NotificationChannelEditor from './components/notificationAdapter/NotificationChannelEditor';
import NotificationChannelTable from '../../../components/table/NotificationChannelTable';
import ProviderTable from '../../../components/table/ProviderTable';
import ProviderMutator from './components/provider/ProviderMutator';
import AreaFilter from './components/areaFilter/AreaFilter';
import Headline from '../../../components/headline/Headline';
import { useActions, useSelector } from '../../../services/state/store';
import { xhrPost, errorMessage } from '../../../services/xhr';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Divider, Input, Switch, Button, TagInput, Toast, Select, Row, Col } from '@douyinfe/semi-ui-19';
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
  IconHome,
  IconSetting,
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
  const allChannels = useSelector((state) => state.notificationChannels.channels);
  const params = useParams();
  const location = useLocation();

  const cloneFromId = location.state?.cloneFrom;
  const jobToClone = cloneFromId ? jobs.find((job) => job.id === cloneFromId) : null;
  const jobToBeEdit = params.jobId == null ? null : jobs.find((job) => job.id === params.jobId);

  const sourceJob = jobToBeEdit || jobToClone;

  const defaultBlacklist = sourceJob?.blacklist || [];
  const defaultName = jobToClone ? `Copy of - ${sourceJob?.name}` : sourceJob?.name || null;
  const defaultProviderData = sourceJob?.provider || [];
  // The job stores references; a read hands back the hydrated adapter shape carrying the channel
  // id. The table renders the channel DTO, so the ids are resolved against the loaded channel list
  // - which arrives asynchronously, hence the effect below rather than a plain initial value.
  const sourceChannelIds = (sourceJob?.notificationAdapter || [])
    .map((adapter) => adapter.configuredAdapterId)
    .filter(Boolean);
  const defaultEnabled = sourceJob?.enabled ?? true;
  const defaultShareWithUsers = sourceJob?.shared_with_user ?? [];
  const defaultSpatialFilter = sourceJob?.spatialFilter || null;
  const defaultSpecFilter = sourceJob?.specFilter || null;
  // Deliberately not defaulted for a new job: the user has to say what they are looking for,
  // because it decides which half of their finance profile applies to everything this job finds.
  const defaultDealType = sourceJob?.dealType || null;

  const [providerToEdit, setProviderToEdit] = useState(null);
  const [providerCreationVisible, setProviderCreationVisibility] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [channelEditor, setChannelEditor] = useState(null);
  const [providerData, setProviderData] = useState(defaultProviderData);
  const [name, setName] = useState(defaultName);
  const [blacklist, setBlacklist] = useState(defaultBlacklist);
  const [selectedChannels, setSelectedChannels] = useState([]);
  const [shareWithUsers, setShareWithUsers] = useState(defaultShareWithUsers);
  const [enabled, setEnabled] = useState(defaultEnabled);
  const [spatialFilter, setSpatialFilter] = useState(defaultSpatialFilter);
  const [specFilter, setSpecFilter] = useState(defaultSpecFilter);
  const [dealType, setDealType] = useState(defaultDealType);
  const navigate = useNavigate();
  const actions = useActions();

  // Memoize the spatial filter change handler to prevent map reinitializations
  const handleSpatialFilterChange = useCallback((data) => {
    setSpatialFilter(data);
  }, []);

  useEffect(() => {
    actions.notificationChannels.getChannels();
  }, [actions]);

  // Resolve the job's stored channel ids once the channel list has loaded. Guarded on the state
  // still being empty so that a later refresh of the list cannot undo the user's edits.
  useEffect(() => {
    if (allChannels.length === 0 || sourceChannelIds.length === 0) return;
    setSelectedChannels((current) => {
      if (current.length > 0) return current;
      return sourceChannelIds.map((id) => allChannels.find((channel) => channel.id === id)).filter(Boolean);
    });
  }, [allChannels, sourceChannelIds]);

  const handleSpecFilterChange = (key, value) => {
    if (!SPEC_FILTERS.map(({ key }) => key).includes(key)) return;

    setSpecFilter({ ...specFilter, [key]: value ? parseFloat(value) : null });
  };

  const isSavingEnabled = () => {
    return Boolean(selectedChannels.length && providerData.length && name && dealType);
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
        notificationAdapter: selectedChannels.map((channel) => ({ configuredAdapterId: channel.id })),
        shareWithUsers,
        name,
        blacklist,
        spatialFilter,
        specFilter,
        dealType,
        enabled,
        jobId: jobToBeEdit?.id || null,
      });
      await actions.jobsData.getJobs();
      Toast.success(t('jobs.mutation.saved'));
      navigate('/jobs');
    } catch (Exception) {
      // The rejection carries the reason under `json.error`; reading `json.message` produced
      // `Toast.error(undefined)`, so a refused save (a 403 in demo mode, a validation error)
      // rendered an empty toast and looked like nothing had happened at all.
      console.error('Error while trying to save the job.', Exception);
      Toast.error(errorMessage(Exception, t('jobs.mutation.saveError')));
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

      <NotificationChannelPicker
        visible={pickerVisible}
        selectedIds={selectedChannels.map((channel) => channel.id)}
        onClose={() => setPickerVisible(false)}
        onPick={(channel) => setSelectedChannels((current) => [...current, channel])}
      />

      {channelEditor && (
        <NotificationChannelEditor
          visible
          mode={channelEditor.mode}
          channelId={channelEditor.channelId}
          // Opened from inside a job, even one *other* job matters: the person editing is thinking
          // about this job alone and would not expect to change somebody else's.
          warnUsageAbove={2}
          onClose={() => setChannelEditor(null)}
          onSaved={(saved) =>
            setSelectedChannels((current) =>
              // A "Duplicate instead" from the editor returns a different channel, so the job is
              // repointed at the copy and the original is left alone for the jobs still using it.
              current.map((channel) => (channel.id === channelEditor.channelId ? saved : channel)),
            )
          }
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
        {/* Mandatory: everything financial about this job's listings - the affordability verdict,
            the filter, which half of the finance profile applies - hangs off this one answer. */}
        <SegmentPart
          name={t('jobs.mutation.sectionDealType')}
          Icon={IconHome}
          helpText={t('jobs.mutation.dealTypeHelp')}
        >
          <Select
            placeholder={t('jobs.mutation.dealTypePlaceholder')}
            value={dealType}
            onChange={(value) => setDealType(value)}
            style={{ width: '100%', maxWidth: 220 }}
          >
            <Select.Option value="rent">{t('jobs.mutation.dealTypeRent')}</Select.Option>
            <Select.Option value="buy">{t('jobs.mutation.dealTypeBuy')}</Select.Option>
          </Select>
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
          <div className="jobMutation__notificationActions">
            <Button
              type="primary"
              className="jobMutation__newButton"
              icon={<IconPlusCircle />}
              onClick={() => setPickerVisible(true)}
            >
              {t('jobs.mutation.addNotification')}
            </Button>
            <Button
              type="secondary"
              icon={<IconSetting />}
              className="jobMutation__newButton"
              onClick={() => navigate('/settings/notifications')}
            >
              {t('notification.channels.manage')}
            </Button>
          </div>

          <NotificationChannelTable
            channels={selectedChannels}
            // Detach, not delete: taking a channel off this job must never remove it from the
            // instance. Deleting lives on the Settings page and is blocked while a job uses it.
            actions={['test', 'edit', 'clone', 'detach']}
            showVisibility={false}
            showUsage={false}
            emptyText={t('notification.channels.emptyInJob')}
            onTest={async (channel) => {
              try {
                await actions.notificationChannels.tryChannel(channel.id);
                Toast.success(t('notification.trySuccess'));
              } catch (error) {
                Toast.error(t('notification.tryError', { error: errorMessage(error, t('common.unknownError')) }));
              }
            }}
            onEdit={(channel) => setChannelEditor({ mode: 'edit', channelId: channel.id })}
            onClone={(channel) => setChannelEditor({ mode: 'clone', channelId: channel.id })}
            onDetach={(channel) =>
              setSelectedChannels((current) => current.filter((selected) => selected.id !== channel.id))
            }
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
        {/* Both filters narrow the same search, so they belong beside each other where there is
            room. The Col breakpoints collapse them back into a single column on a phone. */}
        <Row gutter={[16, 16]} className="jobMutation__filterRow">
          <Col xs={24} lg={12}>
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

            {/* Sharing and activation are short controls. Stacking them under the criteria
                filter fills the column the tall map leaves half empty, instead of pushing two
                near-empty full-width cards below the fold. */}
            <SegmentPart
              Icon={IconUser}
              name={t('jobs.mutation.sectionSharing')}
              helpText={t('jobs.mutation.sharingHelp')}
            >
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
                  style={{ width: '100%' }}
                >
                  {shareableUserList.map((user) => (
                    <Select.Option value={user.id} key={user.id}>
                      {user.name}
                    </Select.Option>
                  ))}
                </Select>
              )}
            </SegmentPart>

            <SegmentPart
              Icon={IconPlayCircle}
              name={t('jobs.mutation.sectionActivation')}
              helpText={t('jobs.mutation.activationHelp')}
            >
              <Switch className="jobMutation__spaceTop" onChange={(checked) => setEnabled(checked)} checked={enabled} />
            </SegmentPart>
          </Col>
          <Col xs={24} lg={12}>
            <SegmentPart
              Icon={IconFilter}
              name={t('jobs.mutation.sectionAreaFilter')}
              helpText={t('jobs.mutation.areaFilterHelp')}
            >
              <AreaFilter spatialFilter={spatialFilter} onChange={handleSpatialFilterChange} />
            </SegmentPart>
          </Col>
        </Row>
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
