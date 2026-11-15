/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useId } from 'react';
import { InputNumber, Select } from '@douyinfe/semi-ui-19';

import { useTranslation } from '../../../../services/i18n/i18n.jsx';
import { COMMUTE_ACTIONS, DEFAULT_COMMUTE_ACTION } from '../../../../services/jobs/commuteFilter.js';
import { countMarketTargets, withMarketChange } from '../../../../services/jobs/marketFilter.js';
import './marketFilter.less';

// The labels of the two actions that mean exactly what they mean for the commute filter are shared
// with it. `mark` is not: there it paints the map, here it marks the card.
const ACTION_LABEL_KEYS = {
  mark: 'jobs.mutation.marketAction.mark',
  notify: 'jobs.mutation.commuteAction.notify',
  exclude: 'jobs.mutation.commuteAction.exclude',
};

const ACTION_HELP_KEYS = {
  mark: 'jobs.mutation.marketActionHelp.mark',
  notify: 'jobs.mutation.commuteActionHelp.notify',
  exclude: 'jobs.mutation.marketActionHelp.exclude',
};

/**
 * What this search expects of the market around a listing, and what to do about one that misses.
 *
 * Two targets, both optional and both in percent: how far under the local median the price per
 * square metre has to be, and what a purchase has to earn in rent. The yield is only offered to a
 * job that buys, because a rental has no rent to earn.
 *
 * @param {Object} props
 * @param {{action?: string, minBelowMarketPercent?: number, minYieldPercent?: number}|null} props.value
 * @param {(next: Object|null) => void} props.onChange - Called with `null` once nothing is set.
 * @param {('rent'|'buy'|null)} props.dealType - What the job searches for.
 * @returns {React.ReactElement}
 */
export default function MarketFilter({ value, onChange, dealType }) {
  const t = useTranslation();
  const actionLabelId = useId();
  const action = COMMUTE_ACTIONS.includes(value?.action) ? value.action : DEFAULT_COMMUTE_ACTION;

  const targets = [
    { key: 'minBelowMarketPercent', label: 'jobs.mutation.marketBelowLabel', hint: 'jobs.mutation.marketBelowHint' },
    ...(dealType === 'buy'
      ? [{ key: 'minYieldPercent', label: 'jobs.mutation.marketYieldLabel', hint: 'jobs.mutation.marketYieldHint' }]
      : []),
  ];

  return (
    <div className="marketFilter">
      <p className="marketFilter__intro">{t('jobs.mutation.marketIntro')}</p>

      {targets.map((target) => (
        <div key={target.key} className="marketFilter__row">
          <div className="marketFilter__target">
            <span className="marketFilter__label">{t(target.label)}</span>
            <span className="marketFilter__hint">{t(target.hint)}</span>
          </div>
          <InputNumber
            className="marketFilter__percent"
            min={0}
            max={100}
            step={1}
            hideButtons
            aria-label={t(target.label)}
            value={value?.[target.key] ?? ''}
            placeholder={t('jobs.mutation.commuteLimitPlaceholder')}
            suffix={<span className="marketFilter__unit">%</span>}
            onChange={(v) => onChange(withMarketChange(value, { [target.key]: v }))}
          />
        </div>
      ))}

      <div className="marketFilter__action">
        <span className="marketFilter__actionLabel" id={actionLabelId}>
          {t('jobs.mutation.marketActionLabel')}
        </span>
        <Select
          className="marketFilter__actionSelect"
          aria-labelledby={actionLabelId}
          value={action}
          onChange={(v) => onChange(withMarketChange(value, { action: v }))}
        >
          {COMMUTE_ACTIONS.map((option) => (
            <Select.Option key={option} value={option}>
              {t(ACTION_LABEL_KEYS[option])}
            </Select.Option>
          ))}
        </Select>
        <div className="marketFilter__hint">
          {countMarketTargets(value) === 0 ? t('jobs.mutation.marketActionIdle') : t(ACTION_HELP_KEYS[action])}
        </div>
      </div>
    </div>
  );
}

MarketFilter.displayName = 'MarketFilter';
