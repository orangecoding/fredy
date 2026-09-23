/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useId, useState } from 'react';

import { useNavigate, useParams } from 'react-router';
import { Button, Input, Switch, Toast, Typography } from '@douyinfe/semi-ui-19';
import { IconAlertTriangle, IconArrowLeft } from '@douyinfe/semi-icons';

import AdminField from '../../admin/components/AdminField.jsx';
import SettingsSaveBar from '../../../components/settingsShell/SettingsSaveBar.jsx';
import { SegmentPart } from '../../../components/segment/SegmentPart';
import { useActions, useSelector } from '../../../services/state/store';
import { useCapsLock } from '../../../hooks/useCapsLock.js';
import { useTranslation } from '../../../services/i18n/i18n.jsx';
import { useUnsavedWarning } from '../../../hooks/useUnsavedWarning.js';
import { userProblems, problemOn } from '../../../services/users/userValidation.js';
import { xhrGet, xhrPost, errorMessage } from '../../../services/xhr';

import './UserMutator.less';

const { Title } = Typography;

export default function UserMutator() {
  const t = useTranslation();
  const params = useParams();
  const navigate = useNavigate();
  const actions = useActions();
  const currentUser = useSelector((state) => state.user.currentUser);

  const mode = params.userId == null ? 'create' : 'edit';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [saving, setSaving] = useState(false);
  /** Problems are shown once Save has been pressed, not while the first character is being typed. */
  const [submitted, setSubmitted] = useState(false);
  /**
   * What the form was handed, to compare the current values against. A new account starts from an
   * empty one, which is what makes an untouched "New user" page count as unchanged.
   */
  const [loaded, setLoaded] = useState({ username: '', isAdmin: false });

  const { capsLockOn, trackCapsLock, clearCapsLock } = useCapsLock();

  const usernameId = useId();
  const passwordId = useId();
  const password2Id = useId();
  const capsHintId = useId();

  useEffect(() => {
    async function init() {
      if (params.userId == null) return;
      try {
        const userJson = await xhrGet(`/api/admin/users/${params.userId}`);
        const user = userJson.json;
        setUsername(user?.username || '');
        setIsAdmin(user?.isAdmin || false);
        setLoaded({ username: user?.username || '', isAdmin: user?.isAdmin || false });
        // The two password fields stay empty on purpose. The stored value is a hash and cannot be
        // read back, and since the route learned to treat an empty password on an edit as "keep the
        // one you have", empty is now a valid answer rather than a refused one.
      } catch (error) {
        // No form for an account that could not be read. A blank one saved from here would rename
        // the user and drop their admin flag, or, for an account deleted in the meantime, ask for
        // one to be created without a password.
        console.error(error);
        Toast.error(errorMessage(error, t('users.mutation.loadError')));
        navigate('/admin/users');
      }
    }

    init();
  }, [params.userId]);

  const problems = userProblems({ username, password, password2, mode });
  const shown = submitted ? problems : [];
  const usernameProblem = problemOn(shown, 'username');
  const passwordProblem = problemOn(shown, 'password');
  const password2Problem = problemOn(shown, 'password2');

  // A typed password always counts as a change, whichever mode this is: there is nothing to compare
  // it against, because what is stored is a hash and the field starts empty either way.
  const dirty =
    username !== loaded.username || isAdmin !== loaded.isAdmin || password.length > 0 || password2.length > 0;

  useUnsavedWarning(dirty);

  const discard = () => {
    setUsername(loaded.username);
    setIsAdmin(loaded.isAdmin);
    setPassword('');
    setPassword2('');
    setSubmitted(false);
  };

  const saveUser = async () => {
    setSubmitted(true);
    // Checked here rather than left to the server: two passwords that differ used to cost a round
    // trip and arrive as a toast in the corner, with nothing marking which field was meant.
    if (problems.length > 0) {
      return;
    }

    setSaving(true);
    try {
      await xhrPost('/api/admin/users', {
        userId: params.userId || null,
        // Trimmed the way the login form trims what it sends, or "kim " could never sign in.
        username: username.trim(),
        password,
        password2,
        isAdmin,
      });
      const editedSelf = mode === 'edit' && params.userId === currentUser?.userId;
      if (editedSelf) {
        // The sidebar shows the signed-in account's name and role, and this save may have changed
        // either.
        await actions.user.getCurrentUser();
      }
      Toast.success(t('users.mutation.saved'));
      if (editedSelf && !isAdmin) {
        // No longer an administrator: the user list is an admin route, and the 401 it would answer
        // with is read by the app as an expired session and sent to the login screen.
        navigate('/dashboard');
        return;
      }
      await actions.user.getUsers();
      navigate('/admin/users');
    } catch (error) {
      // `error.json` is absent when the request never reached the backend, and reading `.error`
      // off it threw a second time inside the catch - which left the user with no toast at all.
      console.error('Error while trying to save the user.', error);
      Toast.error(errorMessage(error, t('users.mutation.saveError')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settingsShell__page">
      {/* A sub-heading, not a page heading: the Administration layout above already provides the
          h1, and stacking two of them reads as a mistake. */}
      <div className="userMutator__header">
        <Title heading={5} className="userMutator__title">
          {mode === 'edit' ? t('users.mutation.editTitle') : t('users.mutation.newTitle')}
        </Title>
        <Button
          icon={<IconArrowLeft />}
          onClick={() => navigate('/admin/users')}
          theme="borderless"
          className="userMutator__back"
        >
          {t('users.mutation.back')}
        </Button>
      </div>

      <form className="userMutator" onSubmit={(event) => event.preventDefault()}>
        {/* Two cards, where there were four plus three dividers between them. Who this person is
            and what they may do is one question; how they sign in is the other. The help moved
            behind the marks for the reason SegmentPart's own documentation gives: 95 words of
            standing prose, on a form an administrator opens perhaps five times in the life of an
            instance. */}
        <SegmentPart name={t('users.mutation.sectionAccount')}>
          <AdminField
            label={t('users.mutation.sectionUsername')}
            help={t('users.mutation.usernameHelp')}
            htmlFor={usernameId}
          >
            <Input
              id={usernameId}
              type="text"
              maxLength={30}
              autoFocus
              autoComplete="username"
              placeholder={t('users.mutation.usernamePlaceholder')}
              validateStatus={usernameProblem ? 'error' : 'default'}
              value={username}
              onChange={(value) => setUsername(value)}
            />
          </AdminField>

          {usernameProblem && <p className="userMutator__error">{t('users.mutation.errorUsername')}</p>}

          <AdminField label={t('users.mutation.sectionIsAdmin')} help={t('users.mutation.isAdminHelp')}>
            <Switch
              checked={isAdmin}
              aria-label={t('users.mutation.sectionIsAdmin')}
              onChange={(checked) => setIsAdmin(checked)}
            />
          </AdminField>
        </SegmentPart>

        <SegmentPart
          name={t('users.mutation.sectionPassword')}
          // Two different sentences, because an empty field means two different things. On a new
          // account it is missing; on an existing one it is the way to say "leave it alone", which
          // is what the storage layer has always done with it. Printed under the title rather than
          // hidden behind a mark: "leave empty to keep the current one" is the instruction this
          // whole change exists for, and an administrator who does not read it goes on handing out
          // new passwords to change a role.
          helpText={mode === 'edit' ? t('users.mutation.passwordHelpEdit') : t('users.mutation.passwordHelpNew')}
        >
          <AdminField label={t('users.mutation.fieldNewPassword')} htmlFor={passwordId}>
            <Input
              id={passwordId}
              mode="password"
              autoComplete="new-password"
              placeholder={t('users.mutation.passwordPlaceholder')}
              validateStatus={passwordProblem ? 'error' : 'default'}
              aria-describedby={capsLockOn ? capsHintId : undefined}
              value={password}
              onKeyUp={trackCapsLock}
              onBlur={clearCapsLock}
              onChange={(value) => setPassword(value)}
            />
          </AdminField>

          {passwordProblem && <p className="userMutator__error">{t('users.mutation.errorPassword')}</p>}

          <AdminField label={t('users.mutation.fieldRepeatPassword')} htmlFor={password2Id}>
            <Input
              id={password2Id}
              mode="password"
              autoComplete="new-password"
              placeholder={t('users.mutation.retypePasswordPlaceholder')}
              validateStatus={password2Problem ? 'error' : 'default'}
              aria-describedby={capsLockOn ? capsHintId : undefined}
              value={password2}
              onKeyUp={trackCapsLock}
              onBlur={clearCapsLock}
              onChange={(value) => setPassword2(value)}
            />
          </AdminField>

          {password2Problem && <p className="userMutator__error">{t('users.mutation.errorMismatch')}</p>}

          {/* The same hint the login screen has shown for a while. It matters more here: this
              password is typed once, never read back, and handed to somebody else. */}
          {capsLockOn && (
            <p className="userMutator__capsHint" id={capsHintId} role="status">
              <IconAlertTriangle size="small" />
              {t('login.capsLockHint')}
            </p>
          )}
        </SegmentPart>

        {/* The same bar the settings and admin pages carry, rather than a pair of buttons at the
            end of the form: it says that something is unsaved, it stays in reach while the page is
            scrolled, and it is not there at all while there is nothing to save. Discard takes the
            place the Cancel button had - "undo what I typed" without leaving the page, which the
            arrow at the top right still does. */}
        <SettingsSaveBar dirty={dirty} saving={saving} onSave={saveUser} onDiscard={discard} />
      </form>
    </div>
  );
}

UserMutator.displayName = 'UserMutator';
