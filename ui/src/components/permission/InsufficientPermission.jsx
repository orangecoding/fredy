/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Button } from '@douyinfe/semi-ui-19';
import { useNavigate } from 'react-router';

import { useTranslation } from '../../services/i18n/i18n.jsx';

import './InsufficientPermission.less';

/**
 * What a non-admin sees on an admin route.
 *
 * It used to be a picture of the wordmark with a prohibition sign over the heart, drawn in dark grey
 * on a transparent ground, so on the dark theme the one thing that said what had happened was the
 * part nobody could read. Now it says it in words and offers the way back.
 *
 * @returns {React.ReactElement}
 */
export default function InsufficientPermission() {
  const t = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="insufficientPermission">
      <h1 className="insufficientPermission__title">{t('permission.title')}</h1>
      <Button theme="outline" onClick={() => navigate('/dashboard')}>
        {t('nav.dashboard')}
      </Button>
    </div>
  );
}

InsufficientPermission.displayName = 'InsufficientPermission';
