import React from 'react';

import { xhrGet, xhrPost, parseError } from '#ui_services/xhr';
import { useHistory, useParams } from 'react-router';
import { useDispatch } from 'react-redux';
import { Divider, Input, Switch, Button, Toast } from '@douyinfe/semi-ui';
import './UserMutator.less';
import { SegmentPart } from '../../../components/segment/SegmentPart';
import { IconPlusCircle } from '@douyinfe/semi-icons';
import { User } from '#types/User.ts';
import { ApiSaveUserReq } from '#types/api.ts';
import { XhrApiResponseError } from 'ui/src/types/XhrApi';

interface UserMutatorParams {
  userId?: string;
}

const UserMutator = function UserMutator() {
  const params = useParams<UserMutatorParams>();
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
          const userJson = await xhrGet<User>(`/api/admin/users/${params.userId}`);
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
    xhrPost<ApiSaveUserReq, User>('/api/admin/users', {
      id: params.userId || null,
      username,
      password,
      password2,
      isAdmin,
    })
      .then(async () => {
        await dispatch.user.getUsers();
        Toast.success('User successfully saved...');
        history.push('/users');
      })
      .catch((error: XhrApiResponseError | Error) => {
        const msg = parseError(error);
        Toast.error(msg);
      });
  };

  return (
    <form className="userMutator">
      <SegmentPart name="Username" helpText="The username used to login to Fredy">
        <Input
          type="text"
          maxLength={30}
          placeholder="Username"
          autoFocus
          width={6}
          value={username}
          onChange={(val: string) => setUsername(val)}
        />
      </SegmentPart>
      <Divider margin="1rem" />
      <SegmentPart name="Password" helpText="The password used to login to Fredy">
        <Input
          mode="password"
          placeholder="Password"
          width={6}
          value={password}
          onChange={(val: string) => setPassword(val)}
        />
      </SegmentPart>
      <Divider margin="1rem" />
      <SegmentPart name="Retype password" helpText="Retype the password to make sure they match">
        <Input
          mode="password"
          placeholder="Retype password"
          width={6}
          value={password2}
          onChange={(val: string) => setPassword2(val)}
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
