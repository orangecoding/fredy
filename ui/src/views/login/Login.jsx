import React, { useEffect } from 'react';

import cityBackground from '../../assets/city_background.jpg';
import Logo from '../../components/logo/Logo';
import { xhrPost } from '../../services/xhr';
import { useHistory } from 'react-router';
import { useDispatch, useSelector } from 'react-redux';
import { Input, Button, Banner } from '@douyinfe/semi-ui';

import './login.less';
import { IconUser, IconLock } from '@douyinfe/semi-icons';

export default function Login() {
  const dispatch = useDispatch();
  const [username, setUserName] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState(null);
  const demoMode = useSelector((state) => state.demoMode.demoMode || false);
  const history = useHistory();

  useEffect(() => {
    async function init() {
      await dispatch.demoMode.getDemoMode();
    }

    init();
  }, []);

  const tryLogin = async () => {
    if (username.length === 0 || password.length === 0) {
      setError('Username and password are mandatory.');
      return;
    }
    try {
      await xhrPost('/api/login', {
        username,
        password,
      });
      setError(null);
    } catch (Exception) {
      setError('Login not successful...');
      return;
    }
    await dispatch.user.getCurrentUser();
    history.push('/jobs');
  };

  return (
    <div className="login">
      <div className="login__bgImage" style={{ background: `url("${cityBackground}")` }} />
      <Logo />
      <form>
        <div className="login__loginWrapper">
          {error && <Banner type="danger" closeIcon={null} description={error} />}
          <Input
            size="large"
            prefix={<IconUser />}
            placeholder="Username"
            value={username}
            showClear
            style={{ marginTop: error ? '1rem' : '4rem' }}
            autoFocus
            onChange={(value) => setUserName(value)}
            onKeyPress={async (e) => {
              if (e.key === 'Enter') {
                await tryLogin();
              }
            }}
          />

          <Input
            size="large"
            mode="password"
            prefix={<IconLock />}
            value={password}
            placeholder="Password"
            style={{ marginTop: '2rem' }}
            onChange={(value) => setPassword(value)}
            onKeyPress={async (e) => {
              if (e.key === 'Enter') {
                await tryLogin();
              }
            }}
          />

          <Button type="primary" onClick={tryLogin} theme="solid" style={{ marginTop: '3rem' }}>
            Login
          </Button>
          <br />
          {demoMode && (
            <Banner
              fullMode={true}
              type="info"
              bordered
              closeIcon={null}
              description="This is the demo version of Fredy. Use 'demo' as both the username and password to log in."
            />
          )}
        </div>
      </form>
    </div>
  );
}

Login.displayName = 'Login';
