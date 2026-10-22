/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React, { useEffect, useId } from 'react';

import cityBackground from '../../assets/city_background.jpg';
import Logo from '../../components/logo/Logo';
import { xhrPost } from '../../services/xhr';
import { useLocation } from 'react-router';
import { useActions, useSelector } from '../../services/state/store';
import { Input, Button, Banner } from '@douyinfe/semi-ui-19';

import './login.less';
import { IconWarning } from '../../components/icons/StrokeIcons.jsx';
import { useTranslation } from '../../services/i18n/i18n.jsx';
import { useCapsLock } from '../../hooks/useCapsLock.js';

export default function Login() {
  const t = useTranslation();
  const actions = useActions();
  const [username, setUserName] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState(null);
  const [pending, setPending] = React.useState(false);
  const { capsLockOn, trackCapsLock, clearCapsLock } = useCapsLock();
  const demoMode = useSelector((state) => state.demoMode.demoMode || false);
  const location = useLocation();
  const usernameId = useId();
  const passwordId = useId();
  const capsLockHintId = useId();

  useEffect(() => {
    async function init() {
      await actions.demoMode.getDemoMode();
    }

    init();
  }, []);

  const tryLogin = async () => {
    if (pending) {
      return;
    }
    if (!username?.trim() || !password) {
      setError(t('login.errorMandatory'));
      return;
    }
    setError(null);
    setPending(true);

    try {
      await xhrPost('/api/login', {
        username: username.trim(),
        password,
      });
      /* eslint-disable no-unused-vars */
    } catch (ignored) {
      setError(t('login.errorInvalid'));
      setPending(false);
      return;
    }

    const returnTo = new URLSearchParams(location.search).get('returnTo');
    // OAuth passes a server-relative authorization URL. Restrict this hand-off so the login
    // screen cannot be used as an open redirect.
    if (typeof returnTo === 'string' && returnTo.startsWith('/api/oauth/authorize?')) {
      window.location.assign(returnTo);
      return;
    }
    // With its query, so a session that ran out on a filtered page comes back to the same filters.
    const from = location.state?.from;
    const target = from?.pathname ? `${from.pathname}${from.search ?? ''}` : '/dashboard';
    // A full start rather than a route change: after a session ran out the store still holds the
    // previous account's jobs, listings and figures, and the pages would render them until each
    // answer for the new account came in.
    window.location.hash = target;
    window.location.reload();
  };

  /** @param {React.KeyboardEvent} e */
  const submitOnEnter = async (e) => {
    if (e.key === 'Enter') {
      await tryLogin();
    }
  };

  return (
    <div className="login">
      <div className="login__backdrop" aria-hidden="true">
        <img src={cityBackground} alt="" />
      </div>

      <div className={`login__card${pending ? ' login__card--pending' : ''}`}>
        <div className="login__logo">
          <Logo width={220} white />
        </div>

        {demoMode && (
          <Banner fullMode={true} type="info" bordered closeIcon={null} description={t('login.demoBanner')} />
        )}

        <form className="login__form" onSubmit={(e) => e.preventDefault()}>
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
              showClear
              autoFocus
              onChange={(value) => setUserName(value)}
              onKeyUp={trackCapsLock}
              onKeyPress={submitOnEnter}
            />
          </div>

          <div className="login__field">
            <label className="login__label" htmlFor={passwordId}>
              {t('login.passwordLabel')}
            </label>
            <Input
              id={passwordId}
              size="large"
              mode="password"
              value={password}
              autoComplete="current-password"
              aria-describedby={capsLockOn ? capsLockHintId : undefined}
              onChange={(value) => setPassword(value)}
              onKeyUp={trackCapsLock}
              onBlur={clearCapsLock}
              onKeyPress={submitOnEnter}
            />
            {capsLockOn && (
              <div className="login__capsHint" id={capsLockHintId} role="status">
                <IconWarning />
                {t('login.capsLockHint')}
              </div>
            )}
          </div>

          <Button
            block
            size="large"
            type="primary"
            theme="solid"
            onClick={tryLogin}
            loading={pending}
            className="login__submit"
          >
            {pending ? t('login.loginButtonPending') : t('login.loginButton')}
          </Button>
        </form>
      </div>
    </div>
  );
}

Login.displayName = 'Login';
