/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { IconAlertTriangle } from '@douyinfe/semi-icons';

import { relativeTime } from '../../../services/time/relativeTime.js';

/** Seven bars of six, with three between them, is exactly the sixty the stylesheet reserves. */
const SPARK_BAR_W = 6;
const SPARK_GAP = 3;
const SPARK_H = 24;
/** The tallest a bar may draw, leaving the baseline visible under a full day. */
const SPARK_MAX_BAR = 22;
/** A day with nothing still draws, so seven empty days read as a flat line and not as no chart. */
const SPARK_MIN_BAR = 2;

/** Seven days of nothing, for a job the activity payload does not mention. */
const NO_ACTIVITY = { perDay: [0, 0, 0, 0, 0, 0, 0], total: 0 };

/**
 * One job's last seven days, as seven bars.
 *
 * Scaled against that job's own busiest day rather than against the other jobs: the question a
 * reader has here is "is this one still working", not "which of these two found more", and a
 * shared scale would flatten a quiet search into a blank row next to a busy one.
 *
 * @param {Object} props
 * @param {number[]} props.perDay Oldest first, seven entries.
 * @returns {React.ReactElement}
 */
function JobSpark({ perDay }) {
  const max = Math.max(1, ...perDay);
  return (
    <svg className="dashboard__jobSpark" viewBox="0 0 60 24" aria-hidden="true">
      <g fill="currentColor">
        {perDay.map((count, index) => {
          const height = Math.max(SPARK_MIN_BAR, Math.round((count / max) * SPARK_MAX_BAR));
          return (
            <rect
              // The series is a fixed seven-day window, so the position is the identity: there is
              // nothing to reorder and no id to key on.
              key={index}
              x={index * (SPARK_BAR_W + SPARK_GAP)}
              y={SPARK_H - height}
              width={SPARK_BAR_W}
              height={height}
              rx="2"
            />
          );
        })}
      </g>
    </svg>
  );
}

JobSpark.displayName = 'JobSpark';

/**
 * Every search the user has, with what each of them actually did this week.
 *
 * This replaces a tile that read "Jobs 2". The count was the whole of what the dashboard said
 * about the searches, which is the one thing a reader already knows: what they cannot see is
 * which of those searches is still finding anything, and which one has been quietly returning
 * nothing since its portal URL stopped working.
 *
 * @param {Object} props
 * @param {Array<Object>} props.jobs
 * @param {Record<string, {perDay: number[], total: number}>} props.jobActivity Keyed by job id.
 * @param {Array<{id: string}>} props.attention Every job that wants looking at, from
 *   `allJobsNeedingAttention` (not the capped list the attention card shows).
 * @param {boolean} [props.loaded=true] Whether `jobActivity` has arrived. Until it has, a row cannot
 *   say "nothing found" without that being a guess.
 * @param {(key: string, params?: Object) => string} props.t
 * @param {() => void} props.onManage Opens the jobs page.
 * @param {(job: Object) => void} props.onOpenJob Opens one job; handed the whole job so the caller
 *   can tell one that is only shared with this user.
 * @returns {React.ReactElement}
 */
export default function JobsPanel({
  jobs = [],
  jobActivity = {},
  attention = [],
  loaded = true,
  t,
  onManage,
  onOpenJob,
}) {
  const rows = Array.isArray(jobs) ? jobs : [];
  const flagged = new Set((Array.isArray(attention) ? attention : []).map((entry) => entry.id));

  return (
    <div className="dashboard__card">
      <div className="dashboard__cardHead">
        <h2 className="dashboard__cardLabel">{t('dashboard.sectionJobs')}</h2>
        <span className="dashboard__spacer" />
        <span className="dashboard__count">{rows.length}</span>
      </div>
      <div className="dashboard__jobs">
        {rows.map((job) => {
          const activity = jobActivity?.[job.id] ?? NO_ACTIVITY;
          const time = relativeTime(job.lastRunAt, t) ?? '---';
          const noHits = loaded && activity.total === 0;
          return (
            <button type="button" className="dashboard__jobRow" key={job.id} onClick={() => onOpenJob(job)}>
              <div className="dashboard__jobText">
                <span className="dashboard__jobName">
                  {job.name}
                  {flagged.has(job.id) && <IconAlertTriangle className="dashboard__jobWarning" />}
                </span>
                <span className="dashboard__jobMeta">
                  {noHits ? t('dashboard.jobNoHits', { time }) : t('dashboard.jobLastRun', { time })}
                </span>
              </div>
              <JobSpark perDay={activity.perDay} />
              <span className={`dashboard__jobCount${noHits ? ' dashboard__jobCount--zero' : ''}`}>
                {loaded ? activity.total : '---'}
              </span>
            </button>
          );
        })}
      </div>
      <button type="button" className="dashboard__link" onClick={onManage}>
        {t('dashboard.jobsManage')}
      </button>
    </div>
  );
}

JobsPanel.displayName = 'JobsPanel';
