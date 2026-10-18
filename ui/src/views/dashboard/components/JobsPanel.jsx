/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { ATTENTION_REASONS } from '../../../services/dashboard/attention.js';
import { jobSetupLine } from '../../../services/jobs/jobSetupLine.js';

/** Sparkline geometry: seven points across the width, the busiest day touching the top. */
const SPARK_W = 72;
const SPARK_H = 24;
const SPARK_PAD = 2;

/** Seven days of nothing, for a job the activity payload does not mention. */
const NO_ACTIVITY = { perDay: [0, 0, 0, 0, 0, 0, 0], total: 0 };

/**
 * One job's last seven days, as a line.
 *
 * Scaled against that job's own busiest day rather than against the other jobs: the question a
 * reader has here is "is this one still working", not "which of these two found more", and a
 * shared scale would flatten a quiet search into a blank row next to a busy one.
 *
 * @param {Object} props
 * @param {number[]} props.perDay Oldest first, seven entries.
 * @param {boolean} [props.quiet] Draw it in the faint tone, for a job that is switched off.
 * @returns {React.ReactElement}
 */
function JobSpark({ perDay, quiet = false }) {
  const days = perDay.length > 1 ? perDay : NO_ACTIVITY.perDay;
  const max = Math.max(1, ...days);
  const step = SPARK_W / (days.length - 1);
  const points = days
    .map((count, index) => {
      const y = SPARK_H - SPARK_PAD - (count / max) * (SPARK_H - SPARK_PAD * 2);
      return `${Math.round(index * step * 10) / 10},${Math.round(y * 10) / 10}`;
    })
    .join(' ');
  return (
    <svg
      className={`dashboard__jobSpark${quiet ? ' dashboard__jobSpark--quiet' : ''}`}
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

JobSpark.displayName = 'JobSpark';

/**
 * Every search the user has, with what each of them did this week.
 *
 * The count is listings found in the last seven days; the line beside it shows how those days were
 * spread. A job that wants attention says why in amber instead of its setup line, so the reason is
 * in the place a reader's eye already is.
 *
 * @param {Object} props
 * @param {Array<Object>} props.jobs
 * @param {Record<string, {perDay: number[], total: number}>} props.jobActivity Keyed by job id.
 * @param {Array<{id: string, reason: string}>} props.attention Every job that wants looking at,
 *   from `allJobsNeedingAttention`.
 * @param {Record<string, string>} [props.providerNames] Provider id to the portal's name.
 * @param {boolean} [props.loaded=true] Whether `jobActivity` has arrived. Until it has, a count
 *   cannot say "nothing found" without that being a guess.
 * @param {(key: string, params?: Object) => string} props.t
 * @param {() => void} props.onCreate Opens the form for a new job.
 * @param {(job: Object) => void} props.onOpenJob Opens one job; handed the whole job so the caller
 *   can tell one that is only shared with this user.
 * @returns {React.ReactElement}
 */
export default function JobsPanel({
  jobs = [],
  jobActivity = {},
  attention = [],
  providerNames = {},
  loaded = true,
  t,
  onCreate,
  onOpenJob,
}) {
  const rows = Array.isArray(jobs) ? jobs : [];
  const reasons = new Map((Array.isArray(attention) ? attention : []).map((entry) => [entry.id, entry.reason]));
  // Spelled out rather than built from the reason, so every key stays visible to the locale check.
  const reasonLabels = {
    [ATTENTION_REASONS.NO_CHANNEL]: t('dashboard.jobReasonNoChannel'),
    [ATTENTION_REASONS.PAUSED]: t('dashboard.jobReasonPaused'),
    [ATTENTION_REASONS.NOTHING_FOUND]: t('dashboard.jobReasonNothingFound'),
  };

  return (
    <section className="dashboard__section dashboard__jobsSection" aria-labelledby="dashboard-jobs">
      <div className="dashboard__sectionHead">
        <h2 id="dashboard-jobs" className="dashboard__sectionTitle">
          {t('dashboard.sectionJobs')}
        </h2>
        <span className="dashboard__spacer" />
        <button type="button" className="dashboard__link" onClick={onCreate}>
          {t('dashboard.newJob')}
        </button>
      </div>
      <div className="dashboard__jobs">
        {rows.map((job) => {
          const activity = jobActivity?.[job.id] ?? NO_ACTIVITY;
          const reason = reasons.get(job.id);
          const paused = job.enabled === false;
          const state = paused ? 'paused' : reason != null ? 'attention' : 'ok';
          return (
            <button type="button" className="dashboard__jobRow" key={job.id} onClick={() => onOpenJob(job)}>
              <span className={`dashboard__jobDot dashboard__jobDot--${state}`} aria-hidden="true" />
              <span className="dashboard__jobText">
                <span className={`dashboard__jobName${paused ? ' dashboard__jobName--paused' : ''}`}>{job.name}</span>
                {reason != null && !paused ? (
                  <span className="dashboard__jobMeta dashboard__jobMeta--attention">{reasonLabels[reason]}</span>
                ) : (
                  <span className="dashboard__jobMeta">
                    {paused ? t('dashboard.jobReasonPaused') : jobSetupLine(job, providerNames)}
                  </span>
                )}
              </span>
              <JobSpark perDay={activity.perDay} quiet={paused} />
              <span className="dashboard__jobCount">
                <span className={`dashboard__jobTotal${paused ? ' dashboard__jobTotal--quiet' : ''}`}>
                  {loaded ? activity.total : '---'}
                </span>
                <span className="dashboard__jobWindow">{t('dashboard.jobWindow')}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

JobsPanel.displayName = 'JobsPanel';
