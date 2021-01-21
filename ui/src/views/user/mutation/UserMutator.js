import React from 'react';

import ToastContext from '../../../components/toasts/ToastContext';
import { xhrGet, xhrPost } from '../../../services/xhr';
import { useHistory, useParams } from 'react-router';
import { Button, Form } from 'semantic-ui-react';
import { useDispatch } from 'react-redux';
import Switch from 'react-switch';

import './UserMutator.less';

const UserMutator = function UserMutator() {
  const params = useParams();
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [password2, setPassword2] = React.useState('');
  const [isAdmin, setIsAdmin] = React.useState(false);

  const history = useHistory();
  const ctx = React.useContext(ToastContext);
  const dispatch = useDispatch();

  React.useEffect(async () => {
    if (params.userId != null) {
      try {
        const userJson = await xhrGet(`/api/admin/users/${params.userId}`);
        const user = userJson.json;

        const defaultName = user?.username || '';
        const defaultIsAdmin = user?.isAdmin || false;

        setUsername(defaultName);
        setIsAdmin(defaultIsAdmin);
      } catch (Exception) {
        console.error(Exception);
      }
    }
  }, [params.userId]);

  const saveUser = async () => {
    try {
      await xhrPost('/api/admin/users', {
        userId: params.userId || null,
        username,
        password,
        password2,
        isAdmin,
      });
      await dispatch.user.getUsers();
      ctx.showToast({
        title: 'Success',
        message: 'User successfully saved...',
        delay: 5000,
        backgroundColor: '#87eb8f',
        color: '#000',
      });
      history.push('/users');
    } catch (Exception) {
      console.error(Exception);
      ctx.showToast({
        title: 'Error',
        message: Exception.json.message,
        delay: 6000,
        backgroundColor: '#db2828',
        color: '#fff',
      });
    }
  };

  return (
    <Form inverted className="userMutator">
      <Form.Input
        type="text"
        label="Username"
        maxLength={30}
        placeholder="Username"
        autoFocus
        inverted
        width={6}
        defaultValue={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <Form.Input
        type="password"
        label="Password"
        placeholder="Password"
        inverted
        width={6}
        defaultValue={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Form.Input
        type="password"
        label="Retype password"
        placeholder="Retype password"
        inverted
        width={6}
        defaultValue={password2}
        onChange={(e) => setPassword2(e.target.value)}
      />
      <Form.Field>
        <label>Is user an admin?</label>
        <Switch checked={isAdmin} onChange={(checked) => setIsAdmin(checked)} />
      </Form.Field>

      <Button color="red" onClick={() => history.push('/users')}>
        Cancel
      </Button>
      <Button color="green" onClick={saveUser}>
        Save
      </Button>
    </Form>
  );
};

export default UserMutator;
