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
import SettingsEmptyState from '../../../components/settingsShell/SettingsEmptyState';
import SettingsSaveBar from '../../../components/settingsShell/SettingsSaveBar.jsx';
import AdminField from '../../admin/components/AdminField.jsx';
import JobReadinessBar from './JobReadinessBar.jsx';
import { SECTION_BY_REQUIREMENT } from './jobSections.js';
import { isJobDirty } from '../../../services/jobs/jobDirty.js';
import { useUnsavedWarning } from '../../../hooks/useUnsavedWarning.js';
import { useActions, useSelector } from '../../../services/state/store';
import { xhrPost, errorMessage } from '../../../services/xhr';
import { useNavigate, useParams, useLocation } from 'react-router';
import { Input, Switch, Button, TagInput, Toast, Select, Banner, Collapse } from '@douyinfe/semi-ui-19';
import './JobMutation.less';
import { SegmentPart } from '../../../components/segment/SegmentPart';
import { loadDraft, saveDraft, clearDraft, hasContent } from '../../../services/jobs/jobDraft.js';
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
  IconPlusCircle,
  IconUser,
  IconFilter,
} from '@douyinfe/semi-icons';
import { useTranslation, useLocale } from '../../../services/i18n/i18n.jsx';

/**
 * One sentence with a control in the middle of it.
 *
 * The alternative is three translation keys for one sentence, which puts the word order of five
 * languages into the markup - and German alone would need the link somewhere English never puts it.
 * One key with a `{{link}}` in it keeps the sentence a sentence.
 *
 * @param {string} sentence Carries `{{link}}` exactly once.
 * @param {React.ReactNode} link
 * @returns {React.ReactNode[]}
 */
function withManageLink(sentence, link) {
  const [before, after = ''] = sentence.split('{{link}}');
  return [before, link, after];
}

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

  /** Whether the filter section is folded open. Drives the "click to set filters" line in its header. */
  const [refineOpen, setRefineOpen] = useState(false);

  /** Which section the readiness bar last jumped to, so it can be marked for a moment. */
  const [highlighted, setHighlighted] = useState(null);

  /** Whether a save is in flight, so the bar's button can say so rather than look ignored. */
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (highlighted == null) return undefined;
    const timer = setTimeout(() => setHighlighted(null), 2000);
    return () => clearTimeout(timer);
  }, [highlighted]);

  const draftId = params.jobId ?? null;
  const [draftRestored, setDraftRestored] = useState(false);
  /** Whether the restore attempt has run. Until it has, nothing may be written back over it. */
  const draftChecked = useRef(false);

  // Memoize the spatial filter change handler to prevent map reinitializations
  const handleSpatialFilterChange = useCallback((data) => {
    // Drawing a shape and deleting it again leaves an empty FeatureCollection, which is "no area"
    // just as null is. Kept as it came, it held the form dirty against a job without an area and
    // was saved as a filter that filters nothing.
    setSpatialFilter(data?.features?.length > 0 ? data : null);
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

    // A draft of a stored job that says nothing the job does not already say is no unsaved work,
    // and restoring it would announce changes nobody made. Older copies like that were written on
    // every visit to an edit form.
    if (draftId != null && !isJobDirty({ ...baseline, ...draft }, baseline)) {
      clearDraft(draftId);
      return;
    }

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
    const draft = {
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
    };
    // A stored job always "has content", so without this every visit to its form left a copy
    // behind. The next visit restored that copy over whatever had changed in the meantime - a job
    // switched off in the list came back on - and after a Discard the banner returned anyway.
    if (draftId != null && !isJobDirty(draft, baseline)) {
      clearDraft(draftId);
      return;
    }
    saveDraft(draftId, draft);
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

  /**
   * What this form started from: the job as stored, or the empty defaults of a new one.
   *
   * The one place both the save bar and Discard read, so "there is something to save" and "put it
   * back the way it was" can never disagree about what "the way it was" means.
   */
  const baseline = {
    name: defaultName,
    dealType: defaultDealType,
    providerData: defaultProviderData,
    selectedChannelIds: sourceChannelIds,
    blacklist: defaultBlacklist,
    shareWithUsers: defaultShareWithUsers,
    enabled: defaultEnabled,
    spatialFilter: defaultSpatialFilter,
    specFilter: defaultSpecFilter,
    commuteFilter: defaultCommuteFilter,
  };

  const discardChanges = () => {
    clearDraft(draftId);
    setDraftRestored(false);
    setName(baseline.name);
    setDealType(baseline.dealType);
    setProviderData(baseline.providerData);
    setSelectedChannelIds(baseline.selectedChannelIds);
    setBlacklist(baseline.blacklist);
    setShareWithUsers(baseline.shareWithUsers);
    setEnabled(baseline.enabled);
    setSpatialFilter(baseline.spatialFilter);
    setSpecFilter(baseline.specFilter);
    setCommuteFilter(baseline.commuteFilter);
    // A guessed deal type is only a guess about a provider that has just been discarded.
    setDealTypeWasInferred(false);
  };

  const current = {
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
  };

  // Compared, not tracked. Drives the save bar, so a character typed and deleted again closes it
  // rather than leaving the page claiming an edit that is no longer there.
  //
  // Only a stored job has something to compare against. A job that is not stored yet - a new one,
  // or a clone - is unsaved as soon as it holds anything: compared against its own starting point,
  // a clone saved as it came never showed the bar that holds the only Save button.
  const dirty = params.jobId == null ? hasContent(current) : isJobDirty(current, baseline);

  // Covers a reload, a closed tab and a typed address. An in-app navigation is not covered - see
  // the hook for why - which is the other half of why the bar is sticky.
  useUnsavedWarning(dirty);

  const leaveForm = () => {
    clearDraft(draftId);
    navigate('/jobs');
  };

  const handleSpecFilterChange = (key, value) => {
    if (!SPEC_FILTERS.map(({ key }) => key).includes(key)) return;

    setSpecFilter({ ...specFilter, [key]: value ? parseFloat(value) : null });
  };

  // A list, not a boolean. It is rendered as one by the readiness bar above the footer: a disabled
  // Save with nothing explaining it left the user hunting through ten sections, seven of them
  // visible without a click, for whichever one was incomplete.
  const missing = missingRequirements({ name, dealType, providerData, selectedChannels });

  /**
   * The wrapper that makes a section a jump target for the readiness bar.
   *
   * @param {string} requirementKey
   * @returns {{ id: string, className: string }}
   */
  const anchorProps = (requirementKey) => {
    const id = SECTION_BY_REQUIREMENT[requirementKey];
    return {
      id,
      className: `jobMutation__anchor${highlighted === id ? ' jobMutation__anchor--highlight' : ''}`,
    };
  };

  // What the collapsed section holds, so it does not have to be opened to find out.
  const refinementSummary = summariseJobRefinements(
    { blacklist, specFilter, spatialFilter, commuteFilter },
    { t, formatPrice: (value) => formatEuro(value, locale) },
  );

  const handleProviderEdit = (data) => {
    setProviderData(
      providerData.map((provider) => (provider.url === data.oldProviderToEdit.url ? data.newData : provider)),
    );
  };

  const mutateJob = async () => {
    // A second press (or a held Enter) while the first save is in flight would create a new job
    // twice.
    if (saving) return;
    setSaving(true);
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
    } finally {
      setSaving(false);
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
          <Button icon={<IconArrowLeft />} onClick={leaveForm} theme="borderless" className="jobMutation__back">
            {t('jobs.mutation.back')}
          </Button>
        }
      />
      {draftRestored && (
        <Banner
          type="info"
          fullMode={false}
          closeIcon={null}
          className="jobMutation__draftNotice"
          description={
            <div className="jobMutation__draftBanner">
              <span>{t('jobs.mutation.draftRestored')}</span>
              <Button size="small" theme="borderless" onClick={discardChanges}>
                {t('jobs.mutation.draftDiscard')}
              </Button>
            </div>
          }
        />
      )}
      {/* No implicit submission: with the name as the only text field on the page, Enter in it
          submitted the form as a GET to the current URL and reloaded the app. */}
      <form className="jobMutation__form" onSubmit={(event) => event.preventDefault()}>
        {/* The four things a job cannot exist without, in the order `JOB_REQUIREMENTS` names them,
            and the two decisions about the job itself. Every filter is folded away below, so the
            shortest path to a working job is a straight read down this column rather than a scroll
            past nine open cards. The readiness bar at the foot says which of the four is still
            open. */}
        {/* Two rows, one card. They were two cards holding one short field each, which is two
            titles, two help marks and two borders spent on "what is it called" and "rent or buy".
            The artboard calls the pair Grunddaten and the readiness bar sends both requirements
            here. */}
        <div {...anchorProps('name')}>
          <SegmentPart
            name={t('jobs.mutation.sectionBasics')}
            Icon={IconPaperclip}
            helpText={t('jobs.mutation.basicsHelp')}
            helpMode="popover"
          >
            <div className="jobMutation__rows">
              <AdminField grow label={t('jobs.mutation.sectionName')} htmlFor="jobName">
                <Input
                  autoFocus
                  id="jobName"
                  type="text"
                  maxLength={40}
                  placeholder={t('jobs.mutation.namePlaceholder')}
                  value={name}
                  onChange={(value) => setName(value)}
                />
              </AdminField>

              {/* Directly under the name rather than in a card of its own further down, but still
                after it: the hint about a guessed answer has to sit near the provider it was
                guessed from, and the provider card is the next thing below. */}
              <AdminField label={t('jobs.mutation.requirement.dealType')} labelId="jobDealTypeLabel">
                <Select
                  // Semi's Select sets its own `aria-label` on the trigger and forwards only
                  // `aria-labelledby`.
                  aria-labelledby="jobDealTypeLabel"
                  placeholder={t('jobs.mutation.dealTypePlaceholder')}
                  value={dealType}
                  onChange={(value) => {
                    setDealType(value);
                    setDealTypeWasInferred(false);
                  }}
                  dropdownClassName="jobMutation__dropdown"
                  className="jobMutation__dealType"
                >
                  <Select.Option value="rent">{t('jobs.mutation.dealTypeRent')}</Select.Option>
                  <Select.Option value="buy">{t('jobs.mutation.dealTypeBuy')}</Select.Option>
                </Select>
              </AdminField>
            </div>
            {dealTypeWasInferred && <p className="jobMutation__inferredHint">{t('jobs.mutation.dealTypeInferred')}</p>}
          </SegmentPart>
        </div>

        <div {...anchorProps('provider')}>
          <SegmentPart
            name={t('jobs.mutation.sectionProviders')}
            Icon={IconBriefcase}
            helpText={t('jobs.mutation.providersHelp')}
            helpMode="popover"
            // In the header rather than above the table: a button that is pressed once should not
            // push the list down on every visit. Short, because the card title already says what
            // is being added, and it stays in the empty state too - the big button below it is the
            // one being offered, this is the one that will still be there once the list is full.
            action={
              <Button
                theme="borderless"
                size="small"
                icon={<IconPlusCircle />}
                aria-label={t('jobs.mutation.addProvider')}
                onClick={() => {
                  setProviderToEdit(null);
                  setProviderCreationVisibility(true);
                }}
              >
                {t('jobs.mutation.addShort')}
              </Button>
            }
          >
            {providerData.length === 0 ? (
              <SettingsEmptyState
                icon={<IconBriefcase size="large" />}
                title={t('jobs.mutation.providerEmptyTitle')}
                description={t('jobs.mutation.providerEmptyText')}
                action={
                  <Button
                    type="primary"
                    icon={<IconPlusCircle />}
                    onClick={() => {
                      setProviderToEdit(null);
                      setProviderCreationVisibility(true);
                    }}
                  >
                    {t('jobs.mutation.providerEmptyAction')}
                  </Button>
                }
              />
            ) : (
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
            )}
          </SegmentPart>
        </div>

        <div {...anchorProps('channel')}>
          <SegmentPart
            Icon={IconBell}
            name={t('jobs.mutation.sectionNotifications')}
            helpText={t('jobs.mutation.notificationsHelp')}
            helpMode="popover"
            action={
              <Button
                theme="borderless"
                size="small"
                icon={<IconPlusCircle />}
                aria-label={t('jobs.mutation.addNotification')}
                onClick={() => setPickerVisible(true)}
              >
                {t('jobs.mutation.addShort')}
              </Button>
            }
          >
            {selectedChannels.length === 0 ? (
              <SettingsEmptyState
                icon={<IconBell size="large" />}
                title={t('jobs.mutation.channelEmptyTitle')}
                // The way out of the empty state is a sentence with a link in it, not a second
                // button beside the first: "pick one" and "go make one" are one thought, and two
                // buttons side by side make them look like two equal offers.
                description={withManageLink(
                  t('jobs.mutation.channelEmptyText'),
                  <Button
                    key="manage"
                    theme="borderless"
                    size="small"
                    className="jobMutation__manageLink"
                    onClick={() => leaveWithReturnPath('/settings/notifications')}
                  >
                    {t('notification.channels.manage')}
                  </Button>,
                )}
                action={
                  <Button type="primary" icon={<IconPlusCircle />} onClick={() => setPickerVisible(true)}>
                    {t('jobs.mutation.channelEmptyAction')}
                  </Button>
                }
              />
            ) : (
              <>
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
                {/* Still reachable once the job has a channel. A second kind of channel is made on
                    the Settings page, and the picker only offers that way out while it has nothing
                    left to list. */}
                <Button
                  theme="borderless"
                  size="small"
                  className="jobMutation__manageLink"
                  onClick={() => leaveWithReturnPath('/settings/notifications')}
                >
                  {t('notification.channels.manage')}
                </Button>
              </>
            )}
          </SegmentPart>
        </div>

        {/* keepDOM={false} is the point of the fold, not a detail of it: the area filter mounts an
            800px MapLibre canvas, and it used to do so on every visit to this form - including the
            edits that never touch it. What is behind the fold is the whole of what this job will
            and will not report, so the header names those filters rather than promising "more
            options", and the line under it says which of them are set. */}
        <Collapse
          accordion={false}
          keepDOM={false}
          className="jobMutation__refine"
          // Controlled only so the header can say which way the click goes. A chevron alone was
          // read as decoration, and the section that holds every filter is the last one a user
          // should have to discover by clicking around.
          activeKey={refineOpen ? ['refine'] : []}
          onChange={(keys) => setRefineOpen([].concat(keys ?? []).includes('refine'))}
        >
          <Collapse.Panel
            itemKey="refine"
            header={
              <span className="jobMutation__refineHeader">
                <span className="jobMutation__refineTitle">{t('jobs.mutation.sectionRefine')}</span>
                <span className="jobMutation__refineSummary">{refinementSummary}</span>
                <span className="jobMutation__refineToggle">
                  {refineOpen ? t('jobs.mutation.refineClose') : t('jobs.mutation.refineOpen')}
                </span>
                <span className="jobMutation__refineHint">{t('jobs.mutation.refineHint')}</span>
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
          </Collapse.Panel>
        </Collapse>

        {/* Outside the fold, and after it: neither is a filter. Who else sees this job and whether
            it runs at all are decisions about the job itself, and burying them under a heading that
            says "filters" is how people missed the switch that turns the job on. One card rather
            than two, because they are one question asked twice: what happens with this job once it
            exists. */}
        <SegmentPart
          Icon={IconUser}
          name={t('jobs.mutation.sectionSharingActivation')}
          helpText={t('jobs.mutation.sharingActivationHelp')}
          helpMode="popover"
        >
          <div className="jobMutation__rows">
            <AdminField label={t('jobs.mutation.sectionSharing')} labelId="jobShareWithLabel">
              {shareableUserList.length === 0 ? (
                <span className="jobMutation__rowNote">{t('jobs.mutation.sharingNoUsers')}</span>
              ) : (
                <Select
                  filter
                  multiple
                  aria-labelledby="jobShareWithLabel"
                  placeholder={t('jobs.mutation.sharingSearchPlaceholder')}
                  autoClearSearchValue={false}
                  // Controlled: with `defaultValue` a Discard (or a restored draft) changed the state
                  // but not what the field showed, and the next save shared with the users on screen
                  // being the ones the user believed they had removed.
                  value={shareWithUsers}
                  onChange={(value) => setShareWithUsers(value)}
                  dropdownClassName="jobMutation__dropdown"
                  className="jobMutation__shareWith"
                >
                  {shareableUserList.map((user) => (
                    <Select.Option value={user.id} key={user.id}>
                      {user.name}
                    </Select.Option>
                  ))}
                </Select>
              )}
            </AdminField>

            <AdminField label={t('jobs.mutation.labelRunning')}>
              <Switch
                onChange={(checked) => setEnabled(checked)}
                checked={enabled}
                aria-label={t('jobs.mutation.labelRunning')}
              />
            </AdminField>
          </div>
        </SegmentPart>

        {/* The same sticky bar the settings and administration pages use, and it appears on the
            same condition: there is something to save. A form that has not been touched shows no
            bar at all, which is the whole difference from the row of buttons that used to sit here
            - one of them permanently greyed out, the other one duplicating the Back button above.

            Its status is the readiness list, so the one place a Save can be disabled is the one
            place that says why, and pressing a name in it still jumps to the section it means. */}
        <SettingsSaveBar
          dirty={dirty}
          saving={saving}
          saveDisabled={missing.length > 0}
          saveLabel={t('jobs.mutation.saveJob')}
          discardLabel={t('jobs.mutation.cancel')}
          status={<JobReadinessBar missing={missing} onJump={setHighlighted} />}
          onSave={mutateJob}
          onDiscard={discardChanges}
        />
      </form>
    </Fragment>
  );
}
