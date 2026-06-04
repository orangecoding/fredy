/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useNavigate } from 'react-router-dom';
import { Button } from '@douyinfe/semi-ui-19';
import { IconPlusCircle } from '@douyinfe/semi-icons';
import JobGrid from '../../components/grid/jobs/JobGrid.jsx';
import Headline from '../../components/headline/Headline.jsx';
import './Jobs.less';
import { useTranslation } from '../../services/i18n/i18n.jsx';

export default function Jobs() {
  const t = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="jobs">
      <Headline
        text={t('jobs.title')}
        actions={
          <Button type="primary" theme="solid" icon={<IconPlusCircle />} onClick={() => navigate('/jobs/new')}>
            {t('jobs.newJob')}
          </Button>
        }
      />
      <JobGrid />
    </div>
  );
}
