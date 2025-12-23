/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';

import JobGrid from '../../components/grid/jobs/JobGrid.jsx';
import './Jobs.less';

export default function Jobs() {
  return (
    <div className="jobs">
      <JobGrid />
    </div>
  );
}
