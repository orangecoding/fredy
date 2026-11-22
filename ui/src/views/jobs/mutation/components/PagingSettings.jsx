/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Banner, InputNumber } from '@douyinfe/semi-ui-19';

import { useTranslation } from '../../../../services/i18n/i18n.jsx';
import { MAX_PAGES, MAX_WAIT_SECONDS, withPagingChange } from '../../../../services/jobs/paging.js';
import './pagingSettings.less';

/**
 * How many result pages a run reads per provider, and how long it waits between two.
 *
 * One page is every job's default. Only once the count is raised do the wait and the warning
 * appear: every further page is a request the portal may hold against Fredy, and the owner should
 * not have to look for that consequence.
 *
 * @param {Object} props
 * @param {{pages: number, waitSeconds: number, jitterSeconds: number}|null} props.value
 * @param {(next: Object|null) => void} props.onChange - Called with `null` for one page.
 * @param {string[]} props.wholeResultProviders - Names of the job's providers that always read their
 *   whole result, which the count does not change.
 * @returns {React.ReactElement}
 */
export default function PagingSettings({ value, onChange, wholeResultProviders }) {
  const t = useTranslation();
  const pages = value?.pages ?? 1;

  return (
    <div className="pagingSettings">
      <div className="pagingSettings__row">
        <div className="pagingSettings__target">
          <span className="pagingSettings__label">{t('jobs.mutation.pagingPagesLabel')}</span>
          <span className="pagingSettings__hint">{t('jobs.mutation.pagingPagesHint')}</span>
        </div>
        <InputNumber
          className="pagingSettings__number"
          min={1}
          max={MAX_PAGES}
          step={1}
          aria-label={t('jobs.mutation.pagingPagesLabel')}
          value={pages}
          onChange={(v) => onChange(withPagingChange(value, { pages: v }))}
        />
      </div>

      {pages > 1 && (
        <>
          <Banner type="warning" closeIcon={null} fullMode={false} description={t('jobs.mutation.pagingWarning')} />

          <div className="pagingSettings__row">
            <div className="pagingSettings__target">
              <span className="pagingSettings__label">{t('jobs.mutation.pagingWaitLabel')}</span>
              <span className="pagingSettings__hint">{t('jobs.mutation.pagingWaitHint')}</span>
            </div>
            <div className="pagingSettings__pair">
              <InputNumber
                className="pagingSettings__number"
                min={0}
                max={MAX_WAIT_SECONDS}
                step={1}
                hideButtons
                aria-label={t('jobs.mutation.pagingWait')}
                prefix={<span className="pagingSettings__unit">{t('jobs.mutation.pagingWait')}</span>}
                suffix={<span className="pagingSettings__unit">s</span>}
                value={value.waitSeconds}
                onChange={(v) => onChange(withPagingChange(value, { waitSeconds: v }))}
              />
              <InputNumber
                className="pagingSettings__number"
                min={0}
                max={MAX_WAIT_SECONDS}
                step={1}
                hideButtons
                aria-label={t('jobs.mutation.pagingJitter')}
                prefix={<span className="pagingSettings__unit">{t('jobs.mutation.pagingJitter')}</span>}
                suffix={<span className="pagingSettings__unit">s</span>}
                value={value.jitterSeconds}
                onChange={(v) => onChange(withPagingChange(value, { jitterSeconds: v }))}
              />
            </div>
          </div>

          {wholeResultProviders.length > 0 && (
            <p className="pagingSettings__hint">
              {t('jobs.mutation.pagingWholeResult', { providers: wholeResultProviders.join(', ') })}
            </p>
          )}
        </>
      )}
    </div>
  );
}

PagingSettings.displayName = 'PagingSettings';
