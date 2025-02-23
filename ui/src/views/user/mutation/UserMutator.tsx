// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import React from 'react';

import { xhrGet, xhrPost } from '../../../services/xhr';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import { useHistory, useParams } from 'react-router';
import { useDispatch } from 'react-redux';
import { Divider, Input, Switch, Button, Toast } from '@douyinfe/semi-ui';
import './UserMutator.less';
// @ts-expect-error TS(6142): Module '../../../components/segment/SegmentPart' w... Remove this comment to see the full error message
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
          // @ts-expect-error TS(2571): Object is of type 'unknown'.
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
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      Toast.error(error.json.message);
    }
  };

  return (
    // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
    <form className="userMutator">
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <SegmentPart name="Username" helpText="The username used to login to Fredy">
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <Input
          type="text"
          label="Username"
          maxLength={30}
          placeholder="Username"
          autoFocus
          width={6}
          value={username}
          onChange={(val: any) => setUsername(val)}
        />
      </SegmentPart>
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <Divider margin="1rem" />
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <SegmentPart name="Password" helpText="The password used to login to Fredy">
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <Input
          mode="password"
          label="Password"
          placeholder="Password"
          width={6}
          value={password}
          onChange={(val: any) => setPassword(val)}
        />
      </SegmentPart>
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <Divider margin="1rem" />
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <SegmentPart name="Retype password" helpText="Retype the password to make sure they match">
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <Input
          mode="password"
          label="Retype password"
          placeholder="Retype password"
          width={6}
          value={password2}
          onChange={(val: any) => setPassword2(val)}
        />
      </SegmentPart>
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <Divider margin="1rem" />
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <SegmentPart name="Is user an admin?" helpText="Check this if the user is an administrator">
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <Switch checked={isAdmin} onChange={(checked) => setIsAdmin(checked)} />
      </SegmentPart>
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <Divider margin="1rem" />
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <Button type="danger" style={{ marginRight: '1rem' }} onClick={() => history.push('/users')}>
        Cancel
      </Button>
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <Button type="primary" icon={<IconPlusCircle />} onClick={saveUser}>
        Save
      </Button>
    // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
    </form>
  );
};

export default UserMutator;
