/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useState } from 'react';
import { Banner, Button, Input, Modal, Select, Switch, Toast } from '@douyinfe/semi-ui-19';

import Help from './NotificationHelpDisplay';
import { useActions, useSelector } from '../../../../../services/state/store';
import { errorMessage } from '../../../../../services/xhr';
import { triggerTestNotification } from '../../../../../services/notification/browserNotification';
import { useScreenWidth } from '../../../../../hooks/screenWidth.js';
import { useTranslation } from '../../../../../services/i18n/i18n.jsx';
import {
  emptyChannel,
  toCloneDraft,
  toPayload,
  validateChannel,
} from '../../../../../services/notificationChannels/channelForm.js';

import './NotificationChannelEditor.less';

/**
 * Create, edit or duplicate one notification channel.
 *
 * One component for all three because they are the same form over the same fields; only where the
 * initial draft comes from differs. Three components would mean three copies of the field renderer
 * and three chances for the validation to drift apart.
 *
 * `warnUsageAbove` exists because "shared" means something different depending on where the editor
 * was opened. From the Settings page a channel is shared once a second job uses it. From inside a
 * job, even one *other* job matters, because the person editing is thinking about this job alone
 * and would not expect to change somebody else's.
 *
 * @param {Object} props
 * @param {boolean} props.visible
 * @param {'create'|'edit'|'clone'} props.mode
 * @param {string} [props.channelId] - Required for edit and clone.
 * @param {string} [props.adapterId] - Required for create.
 * @param {number} [props.warnUsageAbove] - Job count at which the shared-channel banner appears.
 * @param {() => void} props.onClose
 * @param {(channel: Object) => void} [props.onSaved]
 * @returns {React.ReactElement|null}
 */
export default function NotificationChannelEditor({
  visible,
  mode,
  channelId = null,
  adapterId = null,
  warnUsageAbove = 2,
  onClose,
  onSaved,
} = {}) {
  const t = useTranslation();
  const actions = useActions();
  const adapters = useSelector((state) => state.notificationAdapter);
  const currentUser = useSelector((state) => state.user.currentUser);
  const width = useScreenWidth();
  const isMobile = width <= 850;

  const [draft, setDraft] = useState(null);
  const [loaded, setLoaded] = useState(null);
  const [validationMessage, setValidationMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [secretsHidden, setSecretsHidden] = useState(false);
  const [saving, setSaving] = useState(false);

  const adapterConfig = adapters.find((a) => a?.id === (draft?.adapterId ?? adapterId)) ?? null;

  useEffect(() => {
    if (!visible) {
      setDraft(null);
      setLoaded(null);
      setValidationMessage(null);
      setSuccessMessage(null);
      setSecretsHidden(false);
      return undefined;
    }

    if (mode === 'create') {
      const config = adapters.find((a) => a?.id === adapterId);
      if (config) setDraft(emptyChannel(config));
      return undefined;
    }

    let cancelled = false;
    actions.notificationChannels
      .loadChannel(channelId)
      .then((channel) => {
        if (cancelled) return;
        const config = adapters.find((a) => a?.id === channel.adapterId);
        setLoaded(channel);
        if (mode === 'clone') {
          // The server already blanked whatever it would not reveal; `canEdit` says which case
          // this was, and therefore whether to tell the user their own credentials are needed.
          setSecretsHidden(!channel.canEdit);
          setDraft(toCloneDraft(channel, { canRevealSecrets: channel.canEdit, adapterConfig: config }));
        } else {
          setDraft({
            id: channel.id,
            adapterId: channel.adapterId,
            name: channel.name,
            fields: { ...channel.fields },
            visibility: channel.visibility,
          });
        }
      })
      .catch((error) => Toast.error(errorMessage(error, t('common.unknownError'))));

    return () => {
      cancelled = true;
    };
  }, [visible, mode, channelId, adapterId, adapters, actions, t]);

  if (!visible || draft == null || adapterConfig == null) return null;

  const setField = (key, value) => setDraft({ ...draft, fields: { ...draft.fields, [key]: value } });

  const save = async () => {
    const problems = validateChannel(draft, adapterConfig, t);
    if (problems.length > 0) {
      setValidationMessage(problems.join('<br/>'));
      return;
    }
    setSaving(true);
    try {
      const saved = await actions.notificationChannels.saveChannel(toPayload(draft));
      Toast.success(t('notification.channels.saved'));
      onSaved?.(saved);
      onClose();
    } catch (error) {
      setValidationMessage(errorMessage(error, t('common.unknownError')));
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setValidationMessage(null);
    setSuccessMessage(null);

    const problems = validateChannel(draft, adapterConfig, t);
    if (problems.length > 0) {
      setValidationMessage(problems.join('<br/>'));
      return;
    }
    if (draft.adapterId === 'browser') {
      triggerTestNotification(t, setSuccessMessage, setValidationMessage);
      return;
    }
    try {
      // The draft route, not the stored-channel one: an unsaved draft has no id, and an edited
      // draft should be tested as it stands rather than as it was last saved.
      await actions.notificationAdapter.tryDraft(draft.adapterId, draft.fields);
      setSuccessMessage(t('notification.trySuccess'));
    } catch (error) {
      setValidationMessage(t('notification.tryError', { error: errorMessage(error, t('common.unknownError')) }));
    }
  };

  const showSharedWarning = mode === 'edit' && (loaded?.usedByJobs ?? 0) >= warnUsageAbove;

  const title = {
    create: t('notification.channels.createTitle'),
    edit: t('notification.channels.editTitle'),
    clone: t('notification.channels.cloneTitle'),
  }[mode];

  return (
    <Modal
      title={title}
      visible={visible}
      style={{ width: isMobile ? '95%' : '50rem' }}
      onCancel={onClose}
      footer={
        <div>
          <Button type="secondary" style={{ float: 'left' }} onClick={test}>
            {t('notification.try')}
          </Button>
          <Button theme="light" type="tertiary" onClick={onClose}>
            {t('notification.cancel')}
          </Button>
          <Button theme="solid" type="primary" loading={saving} onClick={save}>
            {t('notification.save')}
          </Button>
        </div>
      }
    >
      {showSharedWarning && (
        <Banner
          fullMode={false}
          type="warning"
          closeIcon={null}
          className="channelEditor__banner"
          description={t('notification.channels.sharedWarning', { count: loaded.usedByJobs })}
          // The escape hatch from "I edited the shared channel and changed four other jobs":
          // carries the current values into a new private channel instead of saving over the
          // original. The caller decides what to do with the result.
          action={
            <Button
              theme="borderless"
              onClick={() => {
                setSecretsHidden(false);
                setDraft({ ...draft, id: null, name: `${draft.name} (copy)`, visibility: 'private' });
              }}
            >
              {t('notification.channels.cloneInstead')}
            </Button>
          }
        />
      )}

      {secretsHidden && (
        <Banner
          fullMode={false}
          type="info"
          closeIcon={null}
          className="channelEditor__banner"
          description={t('notification.channels.cloneSecretsHidden')}
        />
      )}

      {validationMessage != null && (
        <Banner
          fullMode={false}
          type="danger"
          closeIcon={null}
          className="channelEditor__banner"
          title={<div className="channelEditor__bannerTitle">{t('notification.errorTitle')}</div>}
          description={<p dangerouslySetInnerHTML={{ __html: validationMessage }} />}
        />
      )}
      {successMessage != null && (
        <Banner
          fullMode={false}
          type="success"
          closeIcon={null}
          className="channelEditor__banner"
          title={<div className="channelEditor__bannerTitle">{t('notification.successTitle')}</div>}
          description={<p dangerouslySetInnerHTML={{ __html: successMessage }} />}
        />
      )}

      <div className="channelEditor__field">
        <label className="channelEditor__label" htmlFor="channelEditorName">
          {t('notification.channels.nameLabel')}
        </label>
        <Input
          id="channelEditorName"
          value={draft.name}
          placeholder={t('notification.channels.namePlaceholder')}
          onChange={(value) => setDraft({ ...draft, name: value })}
        />
        <div className="channelEditor__extra">{t('notification.channels.nameHelp')}</div>
      </div>

      <div className="channelEditor__field">
        <div className="channelEditor__label">{t('notification.channels.typeLabel')}</div>
        <div>{adapterConfig.name}</div>
        <div className="channelEditor__extra">{adapterConfig.description}</div>
      </div>

      {currentUser?.isAdmin && (
        <div className="channelEditor__field">
          <div className="channelEditor__label">{t('notification.channels.visibilityLabel')}</div>
          <Select
            value={draft.visibility}
            style={{ width: 220 }}
            onChange={(value) => setDraft({ ...draft, visibility: value })}
            optionList={[
              { value: 'private', label: t('notification.channels.visibilityPrivate') },
              { value: 'admin', label: t('notification.channels.visibilityAdmin') },
              { value: 'everyone', label: t('notification.channels.visibilityEveryone') },
            ]}
          />
          <div className="channelEditor__extra">{t('notification.channels.visibilityHelp')}</div>
        </div>
      )}

      {adapterConfig.readme != null && <Help readme={adapterConfig.readme} />}

      {Object.entries(adapterConfig.fields ?? {}).map(([key, definition]) =>
        definition.type === 'boolean' ? (
          <div key={key} className="channelEditor__field">
            <div className="channelEditor__switchRow">
              <Switch checked={draft.fields[key] === true} onChange={(checked) => setField(key, checked)} />
              <span>{definition.label}</span>
            </div>
            {definition.description && <div className="channelEditor__extra">{definition.description}</div>}
          </div>
        ) : (
          <div key={key} className="channelEditor__field">
            <label className="channelEditor__label" htmlFor={`channelEditorField-${key}`}>
              {definition.label}
            </label>
            <Input
              id={`channelEditorField-${key}`}
              // A credential is masked in the form as well as on the wire. `mode="password"`
              // gives Semi's reveal toggle, so the owner can still check what they typed.
              mode={definition.secret === true ? 'password' : undefined}
              type={definition.type === 'number' ? 'number' : 'text'}
              value={draft.fields[key] ?? ''}
              placeholder={definition.label}
              onChange={(value) => setField(key, value)}
            />
            {definition.description && <div className="channelEditor__extra">{definition.description}</div>}
          </div>
        ),
      )}
    </Modal>
  );
}
