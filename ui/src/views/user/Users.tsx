import React from 'react';

import { Toast } from '@douyinfe/semi-ui';
import UserTable from '../../components/table/UserTable';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../services/rematch/store';
import { IconPlus } from '@douyinfe/semi-icons';
import { Button } from '@douyinfe/semi-ui';
import UserRemovalModal from './UserRemovalModal';
import { parseError, xhrDelete } from '#ui_services/xhr';
import { useHistory } from 'react-router';

import './Users.less';
import { ApiDeleteUserReq } from '#types/Api.ts';

const Users = function Users() {
  const dispatch = useDispatch();
  const [loading, setLoading] = React.useState(true);
  const users = useSelector((state: RootState) => state.user.users);
  const [userIdToBeRemoved, setUserIdToBeRemoved] = React.useState<string | null>(null);
  const history = useHistory();

  React.useEffect(() => {
    async function init() {
      await dispatch.user.getUsers();
      setLoading(false);
    }

    init();
  }, []);

  const onUserRemoval = async () => {
    if (userIdToBeRemoved == null) {
      Toast.error('userIdToBeRemoved is null');
      setUserIdToBeRemoved(null);
      return;
    }

    xhrDelete<ApiDeleteUserReq>('/api/admin/users', { id: userIdToBeRemoved })
      .then(async () => {
        const awaits = [];
        awaits.push(dispatch.jobs.getJobs());
        awaits.push(dispatch.user.getUsers());
        await Promise.all(awaits);
        Toast.success('User successfully removed');
        setUserIdToBeRemoved(null);
      })
      .catch((error) => {
        const errorMessage = parseError(error, 'Failed to remove user');
        Toast.error(errorMessage);
        setUserIdToBeRemoved(null);
      });
  };

  const userToRemove = userIdToBeRemoved ? users.find((user) => user.id === userIdToBeRemoved) : null;

  return (
    <div>
      {!loading && (
        <React.Fragment>
          {userIdToBeRemoved && userToRemove && (
            <UserRemovalModal user={userToRemove} onCancel={() => setUserIdToBeRemoved(null)} onOk={onUserRemoval} />
          )}

          <Button
            type="primary"
            className="users__newButton"
            icon={<IconPlus />}
            onClick={() => history.push('/users/new')}
          >
            Create new User
          </Button>

          <UserTable
            user={users}
            onUserEdit={(userId: string) => {
              history.push(`/users/edit/${userId}`);
            }}
            onUserRemoval={(userId: string) => {
              setUserIdToBeRemoved(userId);
              //throw warning message that all jobs will be removed associated to this user
              //check if at least 1 admin is available
            }}
          />
        </React.Fragment>
      )}
    </div>
  );
};

export default Users;
