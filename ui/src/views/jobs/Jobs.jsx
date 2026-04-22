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

export default function Jobs() {
  const navigate = useNavigate();
  return (
    <div className="jobs">
      <Headline
        text="Jobs"
        actions={
          <Button type="primary" theme="solid" icon={<IconPlusCircle />} onClick={() => navigate('/jobs/new')}>
            New Job
          </Button>
        }
      />
      <JobGrid />
    </div>
  );
}
