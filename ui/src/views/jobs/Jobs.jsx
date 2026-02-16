/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import JobGrid from '../../components/grid/jobs/JobGrid.jsx';
import './Jobs.less';

export default function Jobs() {
  return (
    <div className="jobs">
      <JobGrid />
    </div>
  );
}
