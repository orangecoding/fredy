import React from 'react';

import { Toast } from '@douyinfe/semi-ui';
import UserTable from '../../components/table/UserTable';
import { useDispatch, useSelector } from 'react-redux';
import { IconPlus } from '@douyinfe/semi-icons';
import { Button } from '@douyinfe/semi-ui';
import UserRemovalModal from './UserRemovalModal';
import { xhrDelete } from '../../services/xhr';
import { useHistory } from 'react-router';

import './Users.less';

const Users = function Users() {
  const dispatch = useDispatch();
  const [loading, setLoading] = React.useState(true);
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
      Toast.error(error);
      setUserIdToBeRemoved(null);
    }
  };

  return (
    <div>
      {!loading && (
        <React.Fragment>
          {userIdToBeRemoved && <UserRemovalModal onCancel={() => setUserIdToBeRemoved(null)} onOk={onUserRemoval} />}

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
            onUserEdit={(userId) => {
              history.push(`/users/edit/${userId}`);
            }}
            onUserRemoval={(userId) => {
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
