/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';

import { xhrGet, xhrPost, errorMessage } from '../../../services/xhr';
import { useNavigate, useParams } from 'react-router';
import { useActions } from '../../../services/state/store';
import { Divider, Input, Switch, Button, Toast, Typography } from '@douyinfe/semi-ui-19';
import './UserMutator.less';
import { SegmentPart } from '../../../components/segment/SegmentPart';
import { IconPlusCircle, IconArrowLeft } from '@douyinfe/semi-icons';
import { useTranslation } from '../../../services/i18n/i18n.jsx';

const { Title } = Typography;

const UserMutator = function UserMutator() {
  const t = useTranslation();
  const params = useParams();
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [password2, setPassword2] = React.useState('');
  const [isAdmin, setIsAdmin] = React.useState(false);

  const navigate = useNavigate();
  const actions = useActions();

  React.useEffect(() => {
    async function init() {
      if (params.userId != null) {
        try {
          const userJson = await xhrGet(`/api/admin/users/${params.userId}`);
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
      await actions.user.getUsers();
      Toast.success(t('users.mutation.saved'));
      navigate('/admin/users');
    } catch (error) {
      // `error.json` is absent when the request never reached the backend, and reading `.error`
      // off it threw a second time inside the catch - which left the user with no toast at all.
      console.error('Error while trying to save the user.', error);
      Toast.error(errorMessage(error, t('users.mutation.saveError')));
    }
  };

  return (
    <>
      {/* A sub-heading, not a page heading: the Administration layout above already provides the
          h1, and stacking two of them reads as a mistake. */}
      <div className="userMutator__header">
        <Title heading={5} style={{ margin: 0 }}>
          {params.userId ? t('users.mutation.editTitle') : t('users.mutation.newTitle')}
        </Title>
        <Button
          icon={<IconArrowLeft />}
          onClick={() => navigate('/admin/users')}
          theme="borderless"
          style={{ color: 'var(--f-muted)' }}
        >
          {t('users.mutation.back')}
        </Button>
      </div>
      <form className="userMutator">
        <SegmentPart name={t('users.mutation.sectionUsername')} helpText={t('users.mutation.usernameHelp')}>
          <Input
            type="text"
            label={t('users.mutation.sectionUsername')}
            maxLength={30}
            placeholder={t('users.mutation.usernamePlaceholder')}
            autoFocus
            width={6}
            value={username}
            onChange={(val) => setUsername(val)}
          />
        </SegmentPart>
        <Divider margin="1rem" />
        <SegmentPart name={t('users.mutation.sectionPassword')} helpText={t('users.mutation.passwordHelp')}>
          <Input
            mode="password"
            label={t('users.mutation.sectionPassword')}
            placeholder={t('users.mutation.passwordPlaceholder')}
            width={6}
            value={password}
            onChange={(val) => setPassword(val)}
          />
        </SegmentPart>
        <Divider margin="1rem" />
        <SegmentPart name={t('users.mutation.sectionRetypePassword')} helpText={t('users.mutation.retypePasswordHelp')}>
          <Input
            mode="password"
            label={t('users.mutation.sectionRetypePassword')}
            placeholder={t('users.mutation.retypePasswordPlaceholder')}
            width={6}
            value={password2}
            onChange={(val) => setPassword2(val)}
          />
        </SegmentPart>
        <Divider margin="1rem" />
        <SegmentPart name={t('users.mutation.sectionIsAdmin')} helpText={t('users.mutation.isAdminHelp')}>
          <Switch checked={isAdmin} onChange={(checked) => setIsAdmin(checked)} />
        </SegmentPart>
        <Divider margin="1rem" />
        <div className="userMutator__actions">
          <Button
            size="small"
            theme="borderless"
            style={{ color: 'var(--f-muted)' }}
            onClick={() => navigate('/admin/users')}
          >
            {t('users.mutation.cancel')}
          </Button>
          <Button size="small" type="primary" theme="solid" icon={<IconPlusCircle />} onClick={saveUser}>
            {t('users.mutation.save')}
          </Button>
        </div>
      </form>
    </>
  );
};

export default UserMutator;
