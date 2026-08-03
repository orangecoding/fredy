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
import { xhrDelete, errorMessage } from '../../services/xhr';
import { useNavigate } from 'react-router-dom';
import './Users.less';
import { useTranslation } from '../../services/i18n/i18n.jsx';

const Users = function Users() {
  const t = useTranslation();
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
      Toast.success(t('users.toastRemoved'));
      setUserIdToBeRemoved(null);
      await actions.jobsData.getJobs();
      await actions.user.getUsers();
    } catch (error) {
      // Same wrong key as everywhere else: the rejection is `{ status, json }`, so `error.error`
      // was undefined and a refused removal rendered an empty toast.
      Toast.error(errorMessage(error, t('users.toastRemoveError')));
      setUserIdToBeRemoved(null);
    }
  };

  return (
    <div className="users">
      {/* No heading of its own: this renders inside the Administration layout, which already names
          the page. A second h1 underneath the first one is noise. */}
      <div className="settingsShell__saveRow">
        <Button type="primary" theme="solid" icon={<IconPlus />} onClick={() => navigate('/admin/users/new')}>
          {t('users.newUser')}
        </Button>
      </div>
      {!loading && (
        <React.Fragment>
          {userIdToBeRemoved && <UserRemovalModal onCancel={() => setUserIdToBeRemoved(null)} onOk={onUserRemoval} />}
          <UserTable
            user={users}
            onUserEdit={(userId) => navigate(`/admin/users/edit/${userId}`)}
            onUserRemoval={(userId) => setUserIdToBeRemoved(userId)}
          />
        </React.Fragment>
      )}
    </div>
  );
};

export default Users;
