/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Fragment, useState, useCallback, useEffect, useRef } from 'react';

import NotificationChannelPicker from './components/notificationAdapter/NotificationChannelPicker';
import NotificationChannelEditor from './components/notificationAdapter/NotificationChannelEditor';
import NotificationChannelTable from '../../../components/table/NotificationChannelTable';
import ProviderTable from '../../../components/table/ProviderTable';
import ProviderMutator from './components/provider/ProviderMutator';
import AreaFilter from './components/areaFilter/AreaFilter';
import CommuteFilter from './components/CommuteFilter.jsx';
import Headline from '../../../components/headline/Headline';
import { useActions, useSelector } from '../../../services/state/store';
import { xhrPost, errorMessage } from '../../../services/xhr';
import { useNavigate, useParams, useLocation } from 'react-router';
import { Input, Switch, Button, TagInput, Toast, Select, Banner, Collapse } from '@douyinfe/semi-ui-19';
import './JobMutation.less';
import { SegmentPart } from '../../../components/segment/SegmentPart';
import { loadDraft, saveDraft, clearDraft } from '../../../services/jobs/jobDraft.js';
import { missingRequirements } from '../../../services/jobs/jobValidation.js';
import { summariseJobRefinements } from '../../../services/jobs/jobSummary.js';
import { withReturnTo } from '../../../services/routes/returnTo.js';
import { formatEuro } from '../../../components/cards/chartTheme.js';
// The frontend copy of the server's detection. The two must agree: the pipeline falls back to its
// own when a job carries no deal type, so a form that guessed differently would show one thing and
// store another. Kept in step by test/ui/dealTypeCopyInSync.test.js.
import { detectDealTypeFromUrl } from '../../../services/jobs/dealType.js';
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
import { useTranslation, useLocale } from '../../../services/i18n/i18n.jsx';

export default function JobMutator() {
  const t = useTranslation();
  const locale = useLocale();

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
  // The job stores references, and a read hands back the hydrated adapter shape carrying the
  // channel id. Ids are what this form keeps: they are here at mount like every other default
  // below, whereas the channel records they name are fetched separately and arrive later.
  const sourceChannelIds = (sourceJob?.notificationAdapter || [])
    .map((adapter) => adapter.configuredAdapterId)
    .filter(Boolean);
  const defaultEnabled = sourceJob?.enabled ?? true;
  const defaultShareWithUsers = sourceJob?.shared_with_user ?? [];
  const defaultSpatialFilter = sourceJob?.spatialFilter || null;
  const defaultSpecFilter = sourceJob?.specFilter || null;
  const defaultCommuteFilter = sourceJob?.commuteFilter || null;
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
  const [selectedChannelIds, setSelectedChannelIds] = useState(sourceChannelIds);
  const [shareWithUsers, setShareWithUsers] = useState(defaultShareWithUsers);
  const [enabled, setEnabled] = useState(defaultEnabled);
  const [spatialFilter, setSpatialFilter] = useState(defaultSpatialFilter);
  const [specFilter, setSpecFilter] = useState(defaultSpecFilter);
  const [commuteFilter, setCommuteFilter] = useState(defaultCommuteFilter);
  const [dealType, setDealType] = useState(defaultDealType);
  /** Whether the value in the deal type field was guessed rather than chosen. */
  const [dealTypeWasInferred, setDealTypeWasInferred] = useState(false);

  // Derived on every render rather than kept alongside the ids. A second copy of the selection in
  // state is a copy that has to be resolved once the channels load and then kept in step, and the
  // effect that did that used to put a removed channel straight back: it saw an empty selection,
  // could not tell "the user just removed the last one" from "not resolved yet", and refilled it.
  // An id nothing answers to falls out here - its channel was deleted, or is no longer shared with
  // this user - so what is saved below is always what the table showed.
  const selectedChannels = selectedChannelIds
    .map((id) => allChannels.find((channel) => channel.id === id))
    .filter(Boolean);
  const navigate = useNavigate();
  const actions = useActions();

  /** Whether the drawing map has been given the full height it used to always occupy. */
  const [areaExpanded, setAreaExpanded] = useState(false);

  const draftId = params.jobId ?? null;
  const [draftRestored, setDraftRestored] = useState(false);
  /** Whether the restore attempt has run. Until it has, nothing may be written back over it. */
  const draftChecked = useRef(false);

  // Memoize the spatial filter change handler to prevent map reinitializations
  const handleSpatialFilterChange = useCallback((data) => {
    setSpatialFilter(data);
  }, []);

  useEffect(() => {
    actions.notificationChannels.getChannels();
  }, [actions]);

  // Pick up whatever was left behind last time. The two links this form offers - "Manage channels"
  // and the picker's empty state - both navigate away and unmount it, and a first-time user has to
  // follow one of them, because a job needs a channel and channels are made on the Settings page.
  // Without this, that detour silently threw away everything they had typed.
  useEffect(() => {
    if (draftChecked.current) return;
    draftChecked.current = true;

    const draft = loadDraft(draftId);
    if (draft == null) return;

    if (draft.name !== undefined) setName(draft.name);
    if (draft.dealType !== undefined) setDealType(draft.dealType);
    if (draft.providerData !== undefined) setProviderData(draft.providerData);
    if (draft.selectedChannelIds !== undefined) setSelectedChannelIds(draft.selectedChannelIds);
    if (draft.blacklist !== undefined) setBlacklist(draft.blacklist);
    if (draft.shareWithUsers !== undefined) setShareWithUsers(draft.shareWithUsers);
    if (draft.enabled !== undefined) setEnabled(draft.enabled);
    if (draft.spatialFilter !== undefined) setSpatialFilter(draft.spatialFilter);
    if (draft.specFilter !== undefined) setSpecFilter(draft.specFilter);
    if (draft.commuteFilter !== undefined) setCommuteFilter(draft.commuteFilter);
    setDraftRestored(true);
  }, [draftId]);

  // Written straight through rather than debounced: the payload is a few hundred bytes and the
  // write is synchronous, so a keystroke costs less than the render it already triggered.
  useEffect(() => {
    if (!draftChecked.current) return;
    saveDraft(draftId, {
      name,
      dealType,
      providerData,
      selectedChannelIds,
      blacklist,
      shareWithUsers,
      enabled,
      spatialFilter,
      specFilter,
      commuteFilter,
    });
  }, [
    draftId,
    name,
    dealType,
    providerData,
    selectedChannelIds,
    blacklist,
    shareWithUsers,
    enabled,
    spatialFilter,
    specFilter,
    commuteFilter,
  ]);

  // The deal type decides which half of the finance profile applies to everything this job finds,
  // and the search URL the user just pasted almost always says which it is.
  const inferredDealType =
    providerData.map((provider) => detectDealTypeFromUrl(provider.url)).find((type) => type != null) ?? null;

  // Offered as a starting value, never as a decision: an ambiguous URL leaves the field empty, a
  // value the user has already chosen is never overwritten, and the guess can always be corrected.
  useEffect(() => {
    if (dealType != null || inferredDealType == null) return;
    setDealType(inferredDealType);
    setDealTypeWasInferred(true);
  }, [inferredDealType, dealType]);

  /**
   * Leave the form for somewhere that can only be reached by unmounting it, carrying a way back.
   * @param {string} to
   * @returns {void}
   */
  const leaveWithReturnPath = (to) => navigate(withReturnTo(to, `${location.pathname}${location.search}`));

  const discardDraft = () => {
    clearDraft(draftId);
    setDraftRestored(false);
    setName(defaultName);
    setDealType(defaultDealType);
    setProviderData(defaultProviderData);
    setSelectedChannelIds(sourceChannelIds);
    setBlacklist(defaultBlacklist);
    setShareWithUsers(defaultShareWithUsers);
    setEnabled(defaultEnabled);
    setSpatialFilter(defaultSpatialFilter);
    setSpecFilter(defaultSpecFilter);
    setCommuteFilter(defaultCommuteFilter);
  };

  const leaveForm = () => {
    clearDraft(draftId);
    navigate('/jobs');
  };

  const handleSpecFilterChange = (key, value) => {
    if (!SPEC_FILTERS.map(({ key }) => key).includes(key)) return;

    setSpecFilter({ ...specFilter, [key]: value ? parseFloat(value) : null });
  };

  // A list, not a boolean. A disabled Save with nothing explaining it leaves the user hunting
  // through eight sections for whichever one is incomplete.
  const missing = missingRequirements({ name, dealType, providerData, selectedChannels });

  // What the collapsed section holds, so it does not have to be opened to find out.
  const refinementSummary = summariseJobRefinements(
    { blacklist, specFilter, spatialFilter, commuteFilter, shareWithUsers, enabled },
    { t, formatPrice: (value) => formatEuro(value, locale) },
  );

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
        commuteFilter,
        dealType,
        enabled,
        jobId: jobToBeEdit?.id || null,
      });
      await actions.jobsData.getJobs();
      // Only once the save actually landed. Clearing before would throw the draft away on a
      // rejection, which is exactly when it is worth the most.
      clearDraft(draftId);
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
        selectedIds={selectedChannelIds}
        onClose={() => setPickerVisible(false)}
        onPick={(channel) => setSelectedChannelIds((current) => [...current, channel.id])}
        onManageChannels={() => leaveWithReturnPath('/settings/notifications')}
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
            setSelectedChannelIds((current) =>
              // A "Duplicate instead" from the editor returns a different channel, so the job is
              // repointed at the copy and the original is left alone for the jobs still using it.
              current.map((id) => (id === channelEditor.channelId ? saved.id : id)),
            )
          }
        />
      )}

      <Headline
        text={jobToBeEdit ? t('jobs.mutation.editTitle') : t('jobs.mutation.createTitle')}
        actions={
          <Button icon={<IconArrowLeft />} onClick={leaveForm} theme="borderless" style={{ color: 'var(--f-muted)' }}>
            {t('jobs.mutation.back')}
          </Button>
        }
      />
      {draftRestored && (
        <Banner
          type="info"
          fullMode={false}
          closeIcon={null}
          style={{ marginBottom: '1rem' }}
          description={
            <div className="jobMutation__draftBanner">
              <span>{t('jobs.mutation.draftRestored')}</span>
              <Button size="small" theme="borderless" onClick={discardDraft}>
                {t('jobs.mutation.draftDiscard')}
              </Button>
            </div>
          }
        />
      )}
      <form className="jobMutation__form">
        {/* The three things a job cannot exist without, and nothing else. Everything optional is
            folded away below, so the shortest path to a working job is a straight read down this
            column rather than a scroll past nine open cards. */}
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

        <SegmentPart
          name={t('jobs.mutation.sectionProviders')}
          Icon={IconBriefcase}
          helpText={t('jobs.mutation.providersHelp')}
          helpMode="popover"
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

        {/* Directly under the providers, because that is where its value is read from: the hint
            about a guessed answer has to sit next to the thing it was guessed from. */}
        <SegmentPart
          name={t('jobs.mutation.sectionDealType')}
          Icon={IconHome}
          helpText={t('jobs.mutation.dealTypeHelp')}
          helpMode="popover"
        >
          <Select
            placeholder={t('jobs.mutation.dealTypePlaceholder')}
            value={dealType}
            onChange={(value) => {
              setDealType(value);
              setDealTypeWasInferred(false);
            }}
            style={{ width: '100%', maxWidth: 220 }}
          >
            <Select.Option value="rent">{t('jobs.mutation.dealTypeRent')}</Select.Option>
            <Select.Option value="buy">{t('jobs.mutation.dealTypeBuy')}</Select.Option>
          </Select>
          {dealTypeWasInferred && <p className="jobMutation__inferredHint">{t('jobs.mutation.dealTypeInferred')}</p>}
        </SegmentPart>

        <SegmentPart
          Icon={IconBell}
          name={t('jobs.mutation.sectionNotifications')}
          helpText={t('jobs.mutation.notificationsHelp')}
          helpMode="popover"
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
              onClick={() => leaveWithReturnPath('/settings/notifications')}
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
            onDetach={(channel) => setSelectedChannelIds((current) => current.filter((id) => id !== channel.id))}
          />
        </SegmentPart>

        {/* keepDOM={false} is the point of the fold, not a detail of it: the area filter mounts an
            800px MapLibre canvas, and it used to do so on every visit to this form - including the
            edits that never touch it. The header line says what is inside, so the section does not
            have to be opened to find out. */}
        <Collapse accordion={false} keepDOM={false} className="jobMutation__refine">
          <Collapse.Panel
            itemKey="refine"
            header={
              <span className="jobMutation__refineHeader">
                <span className="jobMutation__refineTitle">{t('jobs.mutation.sectionRefine')}</span>
                <span className="jobMutation__refineSummary">{refinementSummary}</span>
              </span>
            }
          >
            <SegmentPart
              Icon={IconFilter}
              name={t('jobs.mutation.sectionCriteriaFilter')}
              helpText={t('jobs.mutation.criteriaFilterHelp')}
              helpMode="popover"
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

            {/* After the price and size criteria and before the blacklist: it is the same kind of
                statement about what this search will accept, and it is the one that needs the
                travel times, which only exist once a listing has been found. */}
            <SegmentPart
              Icon={IconFilter}
              name={t('jobs.mutation.sectionCommuteFilter')}
              helpText={t('jobs.mutation.commuteFilterHelp')}
              helpMode="popover"
            >
              <CommuteFilter value={commuteFilter} onChange={setCommuteFilter} />
            </SegmentPart>

            <SegmentPart
              Icon={IconFilter}
              name={t('jobs.mutation.sectionBlacklist')}
              helpText={t('jobs.mutation.blacklistHelp')}
              helpMode="popover"
            >
              <TagInput
                value={blacklist || []}
                placeholder={t('jobs.mutation.blacklistPlaceholder')}
                onChange={(v) => setBlacklist([...v])}
              />
            </SegmentPart>

            <SegmentPart
              Icon={IconFilter}
              name={t('jobs.mutation.sectionAreaFilter')}
              helpText={t('jobs.mutation.areaFilterHelp')}
              helpMode="popover"
            >
              {/* Three steps rather than the four-sentence paragraph that used to describe this
                  mouse gesture in prose, and inside the panel rather than above it, where the
                  drawing actually happens. */}
              <ol className="jobMutation__areaSteps">
                <li>{t('jobs.mutation.areaStep1')}</li>
                <li>{t('jobs.mutation.areaStep2')}</li>
                <li>{t('jobs.mutation.areaStep3')}</li>
              </ol>
              <div className={`jobMutation__areaMap${areaExpanded ? ' jobMutation__areaMap--expanded' : ''}`}>
                <AreaFilter
                  spatialFilter={spatialFilter}
                  onChange={handleSpatialFilterChange}
                  providerData={providerData}
                />
              </div>
              <Button theme="borderless" size="small" onClick={() => setAreaExpanded((current) => !current)}>
                {areaExpanded ? t('jobs.mutation.areaCollapse') : t('jobs.mutation.areaExpand')}
              </Button>
            </SegmentPart>

            <SegmentPart
              Icon={IconUser}
              name={t('jobs.mutation.sectionSharing')}
              helpText={t('jobs.mutation.sharingHelp')}
              helpMode="popover"
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
              helpMode="popover"
            >
              <Switch className="jobMutation__spaceTop" onChange={(checked) => setEnabled(checked)} checked={enabled} />
            </SegmentPart>
          </Collapse.Panel>
        </Collapse>

        {/* Sticky, because on a phone the form is still taller than the screen and Save used to be
            several screens below the fold. */}
        <div className="jobMutation__footer">
          <div className="jobMutation__footerActions">
            {/* Cancel used to be `danger`, so the red button was the harmless one and Save sat next
                to it in the colour that usually means "go ahead". */}
            <Button type="tertiary" onClick={leaveForm}>
              {t('jobs.mutation.cancel')}
            </Button>
            <Button type="primary" icon={<IconPlusCircle />} disabled={missing.length > 0} onClick={mutateJob}>
              {t('jobs.mutation.save')}
            </Button>
          </div>
        </div>
      </form>
    </Fragment>
  );
}
