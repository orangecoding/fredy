/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React, { useEffect, useId } from 'react';
import { Input, Button, Banner } from '@douyinfe/semi-ui-19';

import { xhrPost } from '../../services/xhr';
import { useLocale, useTranslation } from '../../services/i18n/i18n.jsx';

/**
 * The message for a refused reset, by the status the server answered with.
 *
 * @param {number|undefined} status
 * @returns {string} Translation key.
 */
function resetErrorKey(status) {
  switch (status) {
    case 403:
      return 'login.reset.errorCode';
    case 404:
      return 'login.reset.errorUser';
    case 429:
      return 'login.reset.errorRateLimit';
    default:
      return 'login.reset.errorGeneric';
  }
}

/**
 * "Forgot password?" on the login card.
 *
 * Opening it asks Fredy to write a one-time code to its console (`POST /api/login/reset-code`).
 * Whoever can read that console types it back here with the user name and the new password. The
 * server keeps one code at a time, so asking again while a code is live hands out the same expiry
 * and writes nothing new. The answer also says whether Fredy runs in Docker: only then does the
 * hint name `docker logs`, everywhere else it just says logs.
 *
 * @param {Object} props
 * @param {string} props.initialUsername - Whatever was already typed into the login form.
 * @param {(username: string) => void} props.onSuccess - The password was changed.
 * @param {() => void} props.onCancel - Back to the login form.
 * @returns {React.ReactElement}
 */
export default function PasswordReset({ initialUsername, onSuccess, onCancel }) {
  const t = useTranslation();
  const locale = useLocale();
  const [username, setUsername] = React.useState(initialUsername ?? '');
  const [password, setPassword] = React.useState('');
  const [password2, setPassword2] = React.useState('');
  const [code, setCode] = React.useState('');
  const [expiresAt, setExpiresAt] = React.useState(null);
  const [inDocker, setInDocker] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [pending, setPending] = React.useState(false);
  const usernameId = useId();
  const passwordId = useId();
  const password2Id = useId();
  const codeId = useId();

  const requestCode = async () => {
    setError(null);
    try {
      const response = await xhrPost('/api/login/reset-code');
      setExpiresAt(response.json.expiresAt);
      setInDocker(response.json.docker === true);
    } catch (rejection) {
      setExpiresAt(null);
      setError(t(rejection?.status === 429 ? 'login.reset.errorRateLimit' : 'login.reset.errorRequest'));
    }
  };

  useEffect(() => {
    requestCode();
  }, []);

  const submit = async () => {
    if (pending) {
      return;
    }
    if (!username.trim() || !password || !code.trim()) {
      setError(t('login.reset.errorMandatory'));
      return;
    }
    if (password !== password2) {
      setError(t('login.reset.errorMismatch'));
      return;
    }
    setError(null);
    setPending(true);
    try {
      await xhrPost('/api/login/reset-password', {
        username: username.trim(),
        password,
        password2,
        code: code.trim(),
      });
    } catch (rejection) {
      setError(t(resetErrorKey(rejection?.status)));
      setPending(false);
      return;
    }
    onSuccess(username.trim());
  };

  const validUntil =
    expiresAt == null
      ? null
      : new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(expiresAt);

  return (
    <form className="login__form" onSubmit={(e) => e.preventDefault()}>
      {validUntil != null && (
        <Banner
          type="info"
          fullMode={false}
          closeIcon={null}
          title={t('login.reset.title')}
          description={t(inDocker ? 'login.reset.codeWrittenDocker' : 'login.reset.codeWritten', {
            time: validUntil,
          })}
        />
      )}
      {error && <Banner type="danger" closeIcon={null} description={error} />}

      <div className="login__field">
        <label className="login__label" htmlFor={usernameId}>
          {t('login.usernameLabel')}
        </label>
        <Input
          id={usernameId}
          size="large"
          value={username}
          autoComplete="username"
          autoFocus
          onChange={(value) => setUsername(value)}
          onEnterPress={submit}
        />
      </div>

      <div className="login__field">
        <label className="login__label" htmlFor={passwordId}>
          {t('login.reset.newPasswordLabel')}
        </label>
        <Input
          id={passwordId}
          size="large"
          mode="password"
          value={password}
          autoComplete="new-password"
          onChange={(value) => setPassword(value)}
          onEnterPress={submit}
        />
      </div>

      <div className="login__field">
        <label className="login__label" htmlFor={password2Id}>
          {t('login.reset.repeatPasswordLabel')}
        </label>
        <Input
          id={password2Id}
          size="large"
          mode="password"
          value={password2}
          autoComplete="new-password"
          onChange={(value) => setPassword2(value)}
          onEnterPress={submit}
        />
      </div>

      <div className="login__field">
        <label className="login__label" htmlFor={codeId}>
          {t('login.reset.codeLabel')}
        </label>
        <Input
          id={codeId}
          size="large"
          value={code}
          autoComplete="one-time-code"
          placeholder="ABCD-EFGH"
          onChange={(value) => setCode(value)}
          onEnterPress={submit}
        />
      </div>

      <Button
        block
        size="large"
        type="primary"
        theme="solid"
        onClick={submit}
        loading={pending}
        className="login__submit"
      >
        {pending ? t('login.reset.submitPending') : t('login.reset.submit')}
      </Button>

      <div className="login__links">
        <Button theme="borderless" onClick={requestCode}>
          {t('login.reset.newCode')}
        </Button>
        <Button theme="borderless" onClick={onCancel}>
          {t('login.reset.back')}
        </Button>
      </div>
    </form>
  );
}

PasswordReset.displayName = 'PasswordReset';
