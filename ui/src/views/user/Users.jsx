/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';
import { Toast, Button } from '@douyinfe/semi-ui-19';
import { IconPlus } from '@douyinfe/semi-icons';
import UserTable from '../../components/table/UserTable';
import { useActions, useSelector } from '../../services/state/store';
import UserRemovalModal from './UserRemovalModal';
import { xhrDelete } from '../../services/xhr';
import { useNavigate } from 'react-router-dom';
import Headline from '../../components/headline/Headline.jsx';
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
      Toast.success('User successfully removed');
      setUserIdToBeRemoved(null);
      await actions.jobsData.getJobs();
      await actions.user.getUsers();
    } catch (error) {
      Toast.error(error);
      setUserIdToBeRemoved(null);
    }
  };

  return (
    <div className="users">
      <Headline
        text="Users"
        actions={
          <Button type="primary" theme="solid" icon={<IconPlus />} onClick={() => navigate('/users/new')}>
            New User
          </Button>
        }
      />
      {!loading && (
        <React.Fragment>
          {userIdToBeRemoved && <UserRemovalModal onCancel={() => setUserIdToBeRemoved(null)} onOk={onUserRemoval} />}
          <UserTable
            user={users}
            onUserEdit={(userId) => navigate(`/users/edit/${userId}`)}
            onUserRemoval={(userId) => setUserIdToBeRemoved(userId)}
          />
        </React.Fragment>
      )}
    </div>
  );
};

export default Users;
