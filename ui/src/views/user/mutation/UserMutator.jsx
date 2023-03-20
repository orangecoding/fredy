import React from 'react';

import { xhrGet, xhrPost } from '../../../services/xhr';
import { useHistory, useParams } from 'react-router';
import { useDispatch } from 'react-redux';
import { Divider, Input, Switch, Button, Toast } from '@douyinfe/semi-ui';
import './UserMutator.less';
import { SegmentPart } from '../../../components/segment/SegmentPart';
import { IconPlusCircle } from '@douyinfe/semi-icons';

const UserMutator = function UserMutator() {
  const params = useParams();
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [password2, setPassword2] = React.useState('');
  const [isAdmin, setIsAdmin] = React.useState(false);

  const history = useHistory();
  const dispatch = useDispatch();

  React.useEffect(() => {
    async function init() {
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
    }

    init();
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
      Toast.success('User successfully saved...');
      history.push('/users');
    } catch (error) {
      console.error(error);
      Toast.error(error.json.message);
    }
  };

  return (
    <form className="userMutator">
      <SegmentPart name="Username" helpText="The username used to login to Fredy">
        <Input
          type="text"
          label="Username"
          maxLength={30}
          placeholder="Username"
          autoFocus
          width={6}
          value={username}
          onChange={(val) => setUsername(val)}
        />
      </SegmentPart>
      <Divider margin="1rem" />
      <SegmentPart name="Password" helpText="The password used to login to Fredy">
        <Input
          mode="password"
          label="Password"
          placeholder="Password"
          width={6}
          value={password}
          onChange={(val) => setPassword(val)}
        />
      </SegmentPart>
      <Divider margin="1rem" />
      <SegmentPart name="Retype password" helpText="Retype the password to make sure they match">
        <Input
          mode="password"
          label="Retype password"
          placeholder="Retype password"
          width={6}
          value={password2}
          onChange={(val) => setPassword2(val)}
        />
      </SegmentPart>
      <Divider margin="1rem" />
      <SegmentPart name="Is user an admin?" helpText="Check this if the user is an administrator">
        <Switch checked={isAdmin} onChange={(checked) => setIsAdmin(checked)} />
      </SegmentPart>
      <Divider margin="1rem" />
      <Button type="danger" style={{ marginRight: '1rem' }} onClick={() => history.push('/users')}>
        Cancel
      </Button>
      <Button type="primary" icon={<IconPlusCircle />} onClick={saveUser}>
        Save
      </Button>
    </form>
  );
};

export default UserMutator;
