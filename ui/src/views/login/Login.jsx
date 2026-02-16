/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React, { useEffect } from 'react';

import cityBackground from '../../assets/city_background.jpg';
import Logo from '../../components/logo/Logo';
import { xhrPost } from '../../services/xhr';
import { useNavigate } from 'react-router-dom';
import { useActions, useSelector } from '../../services/state/store';
import { Input, Button, Banner, Toast } from '@douyinfe/semi-ui-19';

import './login.less';
import { IconUser, IconLock } from '@douyinfe/semi-icons';

export default function Login() {
  const actions = useActions();
  const [username, setUserName] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState(null);
  const demoMode = useSelector((state) => state.demoMode.demoMode || false);
  const navigate = useNavigate();

  useEffect(() => {
    async function init() {
      await actions.demoMode.getDemoMode();
    }

    init();
  }, []);

  const tryLogin = async () => {
    if (!username?.trim() || !password) {
      setError('Username and password are mandatory.');
      return;
    }
    setError(null);

    try {
      await xhrPost('/api/login', {
        username: username.trim(),
        password,
      });
      /* eslint-disable no-unused-vars */
    } catch (ignored) {
      Toast.error('Login unsuccessful…');
      return;
    }

    Toast.success('Login successful!');

    await actions.user.getCurrentUser();
    navigate('/dashboard');
  };

  return (
    <div className="login">
      <div className="login__bgImage" style={{ background: `url("${cityBackground}")` }} />
      <div className="login__loginWrapper">
        <div className="login__logoWrapper">
          <Logo width={250} white />
        </div>

        {demoMode && (
          <Banner
            fullMode={true}
            type="info"
            bordered
            closeIcon={null}
            description="This is the demo version of Fredy. Use 'demo' as both the username and password to log in."
            style={{ marginBottom: '1.5rem' }}
          />
        )}

        <form onSubmit={(e) => e.preventDefault()}>
          {error && <Banner type="danger" closeIcon={null} description={error} style={{ marginBottom: '1rem' }} />}
          <div className="login__inputGroup">
            <Input
              size="large"
              prefix={<IconUser />}
              placeholder="Username"
              value={username}
              showClear
              autoFocus
              onChange={(value) => setUserName(value)}
              onKeyPress={async (e) => {
                if (e.key === 'Enter') {
                  await tryLogin();
                }
              }}
            />
          </div>

          <div className="login__inputGroup">
            <Input
              size="large"
              mode="password"
              prefix={<IconLock />}
              value={password}
              placeholder="Password"
              onChange={(value) => setPassword(value)}
              onKeyPress={async (e) => {
                if (e.key === 'Enter') {
                  await tryLogin();
                }
              }}
            />
          </div>

          <Button block type="primary" onClick={tryLogin} theme="solid" style={{ marginTop: '1rem' }}>
            Login
          </Button>
        </form>
      </div>
    </div>
  );
}

Login.displayName = 'Login';
