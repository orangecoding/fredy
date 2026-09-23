/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Tag, Tooltip, Switch } from '@douyinfe/semi-ui-19';
import { IconAlertTriangle } from '@douyinfe/semi-icons';

import JobActions from '../jobs/JobActions.jsx';
import { relativeTime } from '../../services/time/relativeTime.js';
import './JobsTable.less';
import { useTranslation } from '../../services/i18n/i18n.jsx';

/**
 * @param {{ jobs: object[], onRun: Function, onEdit: Function, onClone: Function, onDeleteListings: Function, onDeleteJob: Function, onStatusChange: Function }} props
 */
const JobsTable = ({ jobs, onRun, onEdit, onClone, onDeleteListings, onDeleteJob, onStatusChange }) => {
  const t = useTranslation();
  return (
    <div className="jobsTable">
      {/* The table used to have no header: three numbers side by side with 12px icons and no
          words, while the grid spelled all three out. The two blank cells hold the dot and the
          action group, which are the only columns that need no name. */}
      {/* Only over rows: with none, a strip of column titles stood under the empty state. */}
      {jobs.length > 0 && (
        <div className="jobsTable__head">
          <span aria-hidden="true" />
          <div className="jobsTable__headCell">{t('jobs.columnName')}</div>
          <div className="jobsTable__headCell jobsTable__headCell--number jobsTable__headCell--listings">
            {t('jobs.columnListings')}
          </div>
          <div className="jobsTable__headCell jobsTable__headCell--number jobsTable__headCell--providers">
            {t('jobs.columnProviders')}
          </div>
          <div className="jobsTable__headCell jobsTable__headCell--number jobsTable__headCell--channels">
            {t('jobs.columnChannels')}
          </div>
          <div className="jobsTable__headCell jobsTable__headCell--lastRun">{t('jobs.columnLastRun')}</div>
          <div className="jobsTable__headCell">{t('jobs.columnActive')}</div>
          <span aria-hidden="true" />
        </div>
      )}

      {jobs.map((job) => (
        <div key={job.id} className={`jobsTable__row${!job.enabled ? ' jobsTable__row--inactive' : ''}`}>
          <span className={`jobsTable__row__dot${job.enabled ? ' jobsTable__row__dot--active' : ''}`} />

          {/* The chip and the warning ride inline with the name, and only the name gives way to a
              long one: the running state and the reason Run, Edit and the switch are disabled are
              the two things this row must not lose to an ellipsis. */}
          <div className="jobsTable__row__name" title={job.name}>
            <span className="jobsTable__row__nameText">{job.name}</span>
            {job.running && (
              <Tag color="green" variant="light" size="small">
                {t('jobs.cardRunning')}
              </Tag>
            )}
            {job.isOnlyShared && (
              <Tooltip content={t('jobs.tableSharedTooltip')}>
                <IconAlertTriangle style={{ color: 'rgba(var(--semi-yellow-7), 1)' }} />
              </Tooltip>
            )}
          </div>

          <div className="jobsTable__row__stat jobsTable__row__stat--listings">{job.numberOfFoundListings || 0}</div>

          <div className="jobsTable__row__stat jobsTable__row__stat--providers">{job.provider?.length || 0}</div>

          <div className="jobsTable__row__stat jobsTable__row__stat--channels">
            {job.notificationAdapter?.length || 0}
          </div>

          {/* Bare, because the column heading above already says "last run". */}
          <div className="jobsTable__row__lastRun">
            {job.lastRunAt ? relativeTime(job.lastRunAt, t) : t('jobs.lastRunNever')}
          </div>

          <Switch
            size="small"
            checked={job.enabled}
            disabled={job.isOnlyShared}
            onChange={(checked) => onStatusChange(job.id, checked)}
            aria-label={t('jobs.toggleEnabled')}
          />

          <JobActions
            job={job}
            density="row"
            onRun={onRun}
            onEdit={onEdit}
            onClone={onClone}
            onDeleteListings={onDeleteListings}
            onDeleteJob={onDeleteJob}
          />
        </div>
      ))}
    </div>
  );
};

export default JobsTable;
