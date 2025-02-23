// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import React from 'react';

import { Toast } from '@douyinfe/semi-ui';
// @ts-expect-error TS(6142): Module '../../components/table/UserTable' was reso... Remove this comment to see the full error message
import UserTable from '../../components/table/UserTable';
import { useDispatch, useSelector } from 'react-redux';
import { IconPlus } from '@douyinfe/semi-icons';
import { Button } from '@douyinfe/semi-ui';
// @ts-expect-error TS(6142): Module './UserRemovalModal' was resolved to 'C:/Pr... Remove this comment to see the full error message
import UserRemovalModal from './UserRemovalModal';
import { xhrDelete } from '../../services/xhr';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import { useHistory } from 'react-router';

import './Users.less';

const Users = function Users() {
  const dispatch = useDispatch();
  const [loading, setLoading] = React.useState(true);
  // @ts-expect-error TS(2571): Object is of type 'unknown'.
  const users = useSelector((state) => state.user.users);
  const [userIdToBeRemoved, setUserIdToBeRemoved] = React.useState(null);
  const history = useHistory();

  React.useEffect(() => {
    async function init() {
      await dispatch.user.getUsers();
      setLoading(false);
    }

    init();
  }, []);

  const onUserRemoval = async () => {
    try {
      await xhrDelete('/api/admin/users', { userId: userIdToBeRemoved });
      Toast.success('User successfully remove');
      setUserIdToBeRemoved(null);
      await dispatch.jobs.getJobs();
      await dispatch.user.getUsers();
    } catch (error) {
      // @ts-expect-error TS(2345): Argument of type 'unknown' is not assignable to pa... Remove this comment to see the full error message
      Toast.error(error);
      setUserIdToBeRemoved(null);
    }
  };

  return (
    // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
    <div>
      {!loading && (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <React.Fragment>
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          {userIdToBeRemoved && <UserRemovalModal onCancel={() => setUserIdToBeRemoved(null)} onOk={onUserRemoval} />}

          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <Button
            type="primary"
            className="users__newButton"
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            icon={<IconPlus />}
            onClick={() => history.push('/users/new')}
          >
            Create new User
          </Button>

          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <UserTable
            user={users}
            onUserEdit={(userId: any) => {
              history.push(`/users/edit/${userId}`);
            }}
            onUserRemoval={(userId: any) => {
              setUserIdToBeRemoved(userId);
              //throw warning message that all jobs will be removed associated to this user
              //check if at least 1 admin is available
            }}
          />
        </React.Fragment>
      )}
    // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
    </div>
  );
};

export default Users;
