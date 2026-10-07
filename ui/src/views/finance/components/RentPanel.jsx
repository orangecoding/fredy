/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Typography } from '@douyinfe/semi-ui-19';

import { SegmentPart } from '../../../components/segment/SegmentPart.jsx';
import { FieldLabel, NumberField } from './ProfileForm.jsx';
import BudgetChart from '../charts/BudgetChart.jsx';
import { formatEuro } from '../../../components/cards/chartTheme.js';
import { DEFAULT_NEBENKOSTEN_PCT } from '../../../services/finance/constants.js';
import { rentCeilingFacts } from '../../../services/finance/rentBasis.js';
import { useTranslation, useLocale } from '../../../services/i18n/i18n.jsx';

import './FinanceForms.less';
import './RentPanel.less';

const { Text } = Typography;

/**
 * The renting half of the finance page: one input, and the ceilings it produces.
 *
 * Renting needs no loan and no closing costs, so there is exactly one thing to configure - how
 * much the Nebenkosten add on top of the cold rent a portal quotes. Everything else follows from
 * the household block above, measured by the same 35 % rule the purchase side uses.
 *
 * The budget and the ceilings are handed in rather than computed here: they come back with the
 * draft's calculation from the server, which is the only place the finance math lives.
 *
 * @param {Object} props
 * @param {import('../../../types/finance.js').FinanceProfile} props.profile
 * @param {Object|null} props.budget The household budget for the current draft.
 * @param {import('../../../types/finance.js').RentThresholds|null} props.thresholds Rent ceilings for the draft.
 * @param {(patch: Object) => void} props.onChange Shallow-merged into profile.renting.
 */
export default function RentPanel({ profile, budget, thresholds, onChange }) {
  const t = useTranslation();
  const locale = useLocale();

  // None of these five is self-explanatory from its label alone: two pairs of ceilings measured on
  // different figures (cold as most listings quote it, warm as paid and as a rent quoted with the
  // charges in it is judged), each with the band above the comfortable one, and plain cash flow
  // that ignores the rule entirely.
  const facts = rentCeilingFacts(thresholds, budget, { locale, formatEuro });

  // The one input and the ceilings it moves share a card. Two cards for a single percentage
  // field made the tab look like a form with a report attached, when it is really one question.
  return (
    <SegmentPart
      name={t('finance.rent.resultTitle')}
      helpText={t('finance.rent.resultHelp')}
      helpMode="popover"
      action={<span className="financeStep">{t('finance.form.step', { n: '2' })}</span>}
    >
      <div className="financeForm__fields">
        {/* Left blank on purpose falls back to the default surcharge, so a user who does not
            know their Nebenkosten still gets a realistic warm rent instead of a cold one. */}
        <NumberField
          label={t('finance.rent.nebenkosten')}
          value={profile.renting?.nebenkostenPct ?? null}
          step={1}
          max={100}
          suffix="%"
          allowEmpty
          placeholder={String(DEFAULT_NEBENKOSTEN_PCT)}
          help={t('finance.rent.nebenkostenHelp', { pct: String(DEFAULT_NEBENKOSTEN_PCT) })}
          onChange={(nebenkostenPct) => onChange({ nebenkostenPct })}
        />
      </div>

      {thresholds == null ? (
        <Text type="tertiary" size="small" className="rentPanel__empty">
          {t('finance.rent.needsHousehold')}
        </Text>
      ) : (
        <>
          <dl className="rentPanel__facts">
            {facts.map(({ key, value, emphasis }) => (
              <div className={`rentPanel__fact${emphasis ? ' rentPanel__fact--emphasis' : ''}`} key={key}>
                <dt>
                  <FieldLabel label={t(`finance.rent.${key}`)} help={t(`finance.rent.${key}Help`)} />
                </dt>
                <dd className="rentPanel__fact-value">{value}</dd>
              </div>
            ))}
          </dl>

          {/* The same chart the purchase side uses, with the affordable warm rent in the place
              the mortgage instalment would occupy - so both halves are read the same way. */}
          <BudgetChart
            budget={budget}
            monthlyRate={thresholds.warmAffordable}
            rateLabel={t('finance.budget.warmRent')}
          />
        </>
      )}
    </SegmentPart>
  );
}

RentPanel.displayName = 'RentPanel';
