import React from 'react';

import { Toast } from '@douyinfe/semi-ui';
import UserTable from '../../components/table/UserTable';
import { useActions, useSelector } from '../../services/state/store';
import { IconPlus } from '@douyinfe/semi-icons';
import { Button } from '@douyinfe/semi-ui';
import UserRemovalModal from './UserRemovalModal';
import { xhrDelete } from '../../services/xhr';
import { useNavigate } from 'react-router-dom';

import './Users.less';

const Users = function Users() {
  const actions = useActions();
  const [loading, setLoading] = React.useState(true);
  const users = useSelector((state) => state.user.users);
  const [userIdToBeRemoved, setUserIdToBeRemoved] = React.useState(null);
  const navigate = useNavigate();

  React.useEffect(() => {
    async function init() {
      await actions.user.getUsers();
      setLoading(false);
    }

    init();
  }, []);

  const onUserRemoval = async () => {
    try {
      await xhrDelete('/api/admin/users', { userId: userIdToBeRemoved });
      Toast.success('User successfully remove');
      setUserIdToBeRemoved(null);
      await actions.jobs.getJobs();
      await actions.user.getUsers();
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
            onClick={() => navigate('/users/new')}
          >
            Create new User
          </Button>

          <UserTable
            user={users}
            onUserEdit={(userId) => {
              navigate(`/users/edit/${userId}`);
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
