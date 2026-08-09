/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React, { useEffect, useId } from 'react';

import cityBackground from '../../assets/city_background.jpg';
import Logo from '../../components/logo/Logo';
import { xhrPost } from '../../services/xhr';
import { useLocation, useNavigate } from 'react-router-dom';
import { useActions, useSelector } from '../../services/state/store';
import { Input, Button, Banner } from '@douyinfe/semi-ui-19';

import './login.less';
import { IconUser, IconLock, IconAlertTriangle } from '@douyinfe/semi-icons';
import { useTranslation } from '../../services/i18n/i18n.jsx';

/**
 * Reads the caps lock state from a keyboard event, if the browser reports it.
 * @param {React.KeyboardEvent} event
 * @returns {boolean|null} true/false when known, null when the event carries no modifier state
 */
function readCapsLockState(event) {
  const nativeEvent = event?.nativeEvent ?? event;
  if (typeof nativeEvent?.getModifierState !== 'function') {
    return null;
  }
  return nativeEvent.getModifierState('CapsLock');
}

export default function Login() {
  const t = useTranslation();
  const actions = useActions();
  const [username, setUserName] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState(null);
  const [pending, setPending] = React.useState(false);
  const [capsLockOn, setCapsLockOn] = React.useState(false);
  const demoMode = useSelector((state) => state.demoMode.demoMode || false);
  const navigate = useNavigate();
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

    await actions.user.getCurrentUser();
    const returnTo = new URLSearchParams(location.search).get('returnTo');
    // OAuth passes a server-relative authorization URL. Restrict this hand-off so the login
    // screen cannot be used as an open redirect.
    if (typeof returnTo === 'string' && returnTo.startsWith('/api/oauth/authorize?')) {
      window.location.assign(returnTo);
      return;
    }
    navigate(location.state?.from?.pathname || '/dashboard');
  };

  /** @param {React.KeyboardEvent} e */
  const submitOnEnter = async (e) => {
    if (e.key === 'Enter') {
      await tryLogin();
    }
  };

  /** @param {React.KeyboardEvent} e */
  const trackCapsLock = (e) => {
    const state = readCapsLockState(e);
    if (state !== null) {
      setCapsLockOn(state);
    }
  };

  return (
    <div className="login">
      <div className="login__bgImage" style={{ backgroundImage: `url("${cityBackground}")` }} />
      <div className="login__glow" />
      <div className="login__loginWrapper">
        <div className="login__scanLine" aria-hidden="true" />
        <div className="login__logoWrapper">
          <Logo width={250} white />
        </div>

        {demoMode && (
          <Banner
            fullMode={true}
            type="info"
            bordered
            closeIcon={null}
            description={t('login.demoBanner')}
            style={{ marginBottom: '1.5rem' }}
          />
        )}

        <form onSubmit={(e) => e.preventDefault()}>
          {error && <Banner type="danger" closeIcon={null} description={error} style={{ marginBottom: '1rem' }} />}
          <div className="login__inputGroup login__inputGroup--first">
            <label className="login__label" htmlFor={usernameId}>
              {t('login.usernameLabel')}
            </label>
            <Input
              id={usernameId}
              size="large"
              prefix={<IconUser />}
              value={username}
              showClear
              autoFocus
              onChange={(value) => setUserName(value)}
              onKeyUp={trackCapsLock}
              onKeyPress={submitOnEnter}
            />
          </div>

          <div className="login__inputGroup login__inputGroup--second">
            <label className="login__label" htmlFor={passwordId}>
              {t('login.passwordLabel')}
            </label>
            <Input
              id={passwordId}
              size="large"
              mode="password"
              prefix={<IconLock />}
              value={password}
              aria-describedby={capsLockOn ? capsLockHintId : undefined}
              onChange={(value) => setPassword(value)}
              onKeyUp={trackCapsLock}
              onBlur={() => setCapsLockOn(false)}
              onKeyPress={submitOnEnter}
            />
            {capsLockOn && (
              <div className="login__capsHint" id={capsLockHintId} role="status">
                <IconAlertTriangle size="small" />
                {t('login.capsLockHint')}
              </div>
            )}
          </div>

          <Button
            block
            type="primary"
            onClick={tryLogin}
            theme="solid"
            loading={pending}
            className="login__submit"
            style={{ marginTop: '1rem' }}
          >
            {pending ? t('login.loginButtonPending') : t('login.loginButton')}
          </Button>
        </form>
      </div>
    </div>
  );
}

Login.displayName = 'Login';
