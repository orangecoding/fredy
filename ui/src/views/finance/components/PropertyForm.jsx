/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Select, Typography } from '@douyinfe/semi-ui-19';

import { SegmentPart } from '../../../components/segment/SegmentPart.jsx';
import { FieldLabel, NumberField } from './ProfileForm.jsx';
import { formatEuro } from '../../../components/cards/chartTheme.js';
import { BUNDESLAENDER, GRUNDERWERBSTEUER } from '../../../services/finance/constants.js';
import { useTranslation, useLocale } from '../../../services/i18n/i18n.jsx';

import './FinanceForms.less';

const { Text } = Typography;

/**
 * The property itself: price, equity, and the Kaufnebenkosten that come with it.
 *
 * The cost breakdown updates as you type, because the gap between the asking price and what
 * you actually have to fund is the thing most buyers underestimate.
 *
 * @param {Object} props
 * @param {import('../../../types/finance.js').FinancingParams} props.financing
 * @param {Object|null} props.costs Closing-cost breakdown for the current draft, from the server.
 * @param {number|null} props.totalCost Purchase price plus closing costs.
 * @param {number|null} props.loanAmount What has to be borrowed after equity.
 * @param {(patch: Object) => void} props.onChange Shallow-merged into profile.financing.
 */
export default function PropertyForm({ financing, costs, totalCost, loanAmount, onChange }) {
  const t = useTranslation();
  const locale = useLocale();

  // The Kaufnebenkosten and the loan they imply are computed server-side and handed in with the
  // draft's calculation. Deriving them here meant a second copy of the Grunderwerbsteuer rules.
  // Until the first answer arrives there is nothing to show, which is a blank breakdown rather
  // than a wrong one.
  const total = totalCost ?? 0;
  const loan = loanAmount ?? 0;

  return (
    <SegmentPart name={t('finance.form.propertyTitle')} helpText={t('finance.form.propertyHelp')}>
      <div className="financeForm__grid">
        <NumberField
          label={t('finance.form.purchasePrice')}
          value={financing.purchasePrice}
          step={5000}
          suffix="€"
          help={t('finance.form.purchasePriceHelp')}
          onChange={(purchasePrice) => onChange({ purchasePrice })}
        />
        <NumberField
          label={t('finance.form.equity')}
          value={financing.equity}
          step={5000}
          suffix="€"
          help={t('finance.form.equityHelp')}
          onChange={(equity) => onChange({ equity })}
        />
      </div>

      <div className="financeForm__grid">
        <label className="financeField">
          <FieldLabel label={t('finance.form.bundesland')} help={t('finance.form.bundeslandHelp')} />
          <Select
            className="financeField__input"
            value={financing.bundesland}
            onChange={(bundesland) =>
              // Switching state resets the manual override, so the new state's rate takes
              // effect instead of silently keeping the old one.
              onChange({ bundesland, grunderwerbsteuerPct: GRUNDERWERBSTEUER[bundesland] })
            }
          >
            {BUNDESLAENDER.map((land) => (
              <Select.Option key={land.code} value={land.code}>
                {land.name} · {GRUNDERWERBSTEUER[land.code]} %
              </Select.Option>
            ))}
          </Select>
        </label>

        <NumberField
          label={t('finance.form.grunderwerbsteuer')}
          value={financing.grunderwerbsteuerPct ?? GRUNDERWERBSTEUER[financing.bundesland] ?? 0}
          step={0.1}
          max={100}
          suffix="%"
          help={t('finance.form.grunderwerbsteuerHelp')}
          onChange={(grunderwerbsteuerPct) => onChange({ grunderwerbsteuerPct })}
        />
        <NumberField
          label={t('finance.form.notary')}
          value={financing.notaryPct}
          step={0.1}
          max={100}
          suffix="%"
          help={t('finance.form.notaryHelp')}
          onChange={(notaryPct) => onChange({ notaryPct })}
        />
        <NumberField
          label={t('finance.form.makler')}
          value={financing.maklerPct}
          step={0.01}
          max={100}
          suffix="%"
          help={t('finance.form.maklerHelp')}
          onChange={(maklerPct) => onChange({ maklerPct })}
        />
      </div>

      <div className="financeForm__readout">
        <div className="financeForm__readout-row">
          <Text type="tertiary" size="small">
            {t('finance.form.closingCostsTotal')}
          </Text>
          <span className="financeForm__readout-value">
            {costs == null ? '—' : `${formatEuro(costs.total, locale)} · ${costs.totalPct.toFixed(2)} %`}
          </span>
        </div>
        <div className="financeForm__readout-row">
          <Text type="tertiary" size="small">
            {t('finance.form.totalCost')}
          </Text>
          <span className="financeForm__readout-value">{formatEuro(total, locale)}</span>
        </div>
        <div className="financeForm__readout-row financeForm__readout-row--emphasis">
          <Text type="tertiary" size="small">
            {t('finance.form.loanAmount')}
          </Text>
          <span className="financeForm__readout-value">{formatEuro(loan, locale)}</span>
        </div>
      </div>
    </SegmentPart>
  );
}

PropertyForm.displayName = 'PropertyForm';
