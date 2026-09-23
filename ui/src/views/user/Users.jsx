/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';
import { Toast, Button } from '@douyinfe/semi-ui-19';
import { IconPlus } from '@douyinfe/semi-icons';
import { SegmentPart } from '../../components/segment/SegmentPart.jsx';
import UserTable from '../../components/table/UserTable';
import { useActions, useSelector } from '../../services/state/store';
import UserRemovalModal from './UserRemovalModal';
import { xhrDelete, errorMessage } from '../../services/xhr';
import { useNavigate } from 'react-router';
import './Users.less';
import { useTranslation } from '../../services/i18n/i18n.jsx';

const Users = function Users() {
  const t = useTranslation();
  const actions = useActions();
  const [loading, setLoading] = React.useState(true);
  const users = useSelector((state) => state.user.users);
  // The whole row, not just its id: the confirmation dialog names the person and counts the
  // jobs that go with them, and both of those are already on the row the table handed over.
  const [userToBeRemoved, setUserToBeRemoved] = React.useState(null);
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
      await xhrDelete('/api/admin/users', { userId: userToBeRemoved.id });
      Toast.success(t('users.toastRemoved'));
      setUserToBeRemoved(null);
      await actions.jobsData.getJobs();
      await actions.user.getUsers();
    } catch (error) {
      // Same wrong key as everywhere else: the rejection is `{ status, json }`, so `error.error`
      // was undefined and a refused removal rendered an empty toast.
      Toast.error(errorMessage(error, t('users.toastRemoveError')));
      setUserToBeRemoved(null);
    }
  };

  return (
    <div className="settingsShell__page users">
      {/* Still no h1 of its own - the Administration layout already names the page - but a card
          title is not an h1, and without one this was the only admin page that never said what
          its table was or what removing a row does. */}
      <SegmentPart
        name={t('users.sectionName')}
        helpText={t('users.sectionHelp')}
        helpMode="popover"
        action={
          <Button size="small" icon={<IconPlus />} onClick={() => navigate('/admin/users/new')}>
            {t('users.newUser')}
          </Button>
        }
      >
        {!loading && (
          <UserTable
            user={users}
            onUserEdit={(userId) => navigate(`/admin/users/edit/${userId}`)}
            onUserRemoval={(userId) => setUserToBeRemoved(users.find((user) => user.id === userId) ?? null)}
          />
        )}
      </SegmentPart>
      {!loading && userToBeRemoved && (
        <UserRemovalModal user={userToBeRemoved} onCancel={() => setUserToBeRemoved(null)} onOk={onUserRemoval} />
      )}
    </div>
  );
};

export default Users;
