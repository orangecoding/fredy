import React from 'react';

import ToastContext from '../../components/toasts/ToastContext';
import UserTable from '../../components/table/UserTable';
import { useDispatch, useSelector } from 'react-redux';
import { Button, Icon } from 'semantic-ui-react';
import UserRemovalModal from './UserRemovalModal';
import { xhrDelete } from '../../services/xhr';
import { useHistory } from 'react-router';

import './Users.less';

const Users = function Users() {
  const dispatch = useDispatch();
  const [loading, setLoading] = React.useState(true);
  const users = useSelector((state) => state.user.users);
  const ctx = React.useContext(ToastContext);
  const [userIdToBeRemoved, setUserIdToBeRemoved] = React.useState(null);
  const history = useHistory();

  React.useEffect(async () => {
    await dispatch.user.getUsers();
    setLoading(false);
  }, []);

  const onUserRemoval = async () => {
    try {
      await xhrDelete('/api/admin/users', { userId: userIdToBeRemoved });
      ctx.showToast({
        title: 'Success',
        message: 'User successfully remove',
        delay: 4000,
        backgroundColor: '#87eb8f',
        color: '#000',
      });
      setUserIdToBeRemoved(null);
      await dispatch.jobs.getJobs();
      await dispatch.user.getUsers();
    } catch (error) {
      ctx.showToast({
        title: 'Error',
        message: error,
        delay: 8000,
        backgroundColor: '#db2828',
        color: '#fff',
      });
      setUserIdToBeRemoved(null);
    }
  };

  return (
    <div>
      {!loading && (
        <React.Fragment>
          {userIdToBeRemoved && <UserRemovalModal onCancel={() => setUserIdToBeRemoved(null)} onOk={onUserRemoval} />}

          <Button primary className="users__newButton" onClick={() => history.push('/users/new')}>
            <Icon name="plus" />
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
