import React from 'react';
import { Input } from 'semantic-ui-react';

import cityBackground from '../../assets/city_background.jpg';
import Logo from '../../components/logo/Logo';
import { xhrPost } from '../../services/xhr';
import { Message } from 'semantic-ui-react';
import { useHistory } from 'react-router';
import { useDispatch } from 'react-redux';

import './login.less';

export default function Login() {
  const dispatch = useDispatch();

  const [username, setUserName] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState(null);

  const history = useHistory();

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
      <Logo />
      <div className="login__bgImage" style={{ background: `url(${cityBackground})` }} />

      <form>
        <div className="login__loginWrapper">
          {error && <Message negative icon="error" content={error} />}
          <Input
            icon="user"
            iconPosition="left"
            placeholder="Username"
            defaultValue={username}
            style={{ marginTop: error ? '1rem' : '4rem' }}
            autoFocus
            onChange={(e) => setUserName(e.target.value)}
          />

          <Input
            type="password"
            icon="lock"
            iconPosition="left"
            defaultValue={password}
            placeholder="Password"
            style={{ marginTop: '2rem' }}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button className="ui primary button" style={{ marginTop: '3rem' }} onClick={tryLogin}>
            Login
          </button>
        </div>
      </form>
    </div>
  );
}

Login.displayName = 'Login';
