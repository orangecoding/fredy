/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Button, Tooltip } from '@douyinfe/semi-ui-19';
import { IconDelete, IconPlus } from '@douyinfe/semi-icons';

import { SegmentPart } from '../../../components/segment/SegmentPart.jsx';
import { NumberField } from './ProfileForm.jsx';
import { CHART_PALETTE } from '../../../components/cards/chartTheme.js';
import { DEFAULT_TILGUNG, DEFAULT_ZINSBINDUNG_YEARS } from '../../../../../lib/services/finance/constants.js';
import { annuity } from '../../../../../lib/services/finance/amortization.js';
import { tilgungFromPayment } from '../../../../../lib/services/finance/financing.js';
import { useTranslation } from '../../../services/i18n/i18n.jsx';

import './FinanceForms.less';

/** Nobody needs more lines on one chart than the palette has colours. */
const MAX_SCENARIOS = 6;

/**
 * The loan scenarios to compare.
 *
 * Nobody knows what terms they will be offered, so the calculator answers for several at once.
 * Each row carries the colour it has on the trajectory chart, so the mapping between a row
 * here and a line there needs no legend lookup.
 *
 * Tilgung and instalment are the same quantity from opposite ends: at a known loan and
 * Sollzins, either one fixes the other. Both are editable and each rewrites the other, so the
 * user can work from whichever number they actually have in mind.
 *
 * @param {Object} props
 * @param {import('../../../../../lib/types/finance.js').RateScenario[]} props.scenarios
 * @param {number} props.loanAmount Current loan, needed to convert between Tilgung and instalment.
 * @param {(scenarios: Array) => void} props.onChange
 */
export default function ScenarioForm({ scenarios, loanAmount = 0, onChange }) {
  const t = useTranslation();

  const update = (index, patch) =>
    onChange(scenarios.map((scenario, i) => (i === index ? { ...scenario, ...patch } : scenario)));

  // Editing the Tilgung drops any pinned instalment, so the instalment follows the percentage
  // again. Editing the instalment pins it, and the Tilgung is derived from it on the way out.
  const setTilgung = (index, tilgung) => update(index, { tilgung, monthlyPayment: null });
  const setPayment = (index, monthlyPayment) =>
    update(index, {
      monthlyPayment,
      tilgung: tilgungFromPayment(loanAmount, scenarios[index]?.annualRate, monthlyPayment),
    });

  const add = () => {
    const last = scenarios[scenarios.length - 1];
    const annualRate = Math.round(((last?.annualRate ?? 3.8) + 0.5) * 10) / 10;
    onChange([
      ...scenarios,
      {
        id: `scenario-${Date.now()}`,
        label: `${annualRate} %`,
        annualRate,
        tilgung: last?.tilgung ?? DEFAULT_TILGUNG,
        fixedYears: last?.fixedYears ?? DEFAULT_ZINSBINDUNG_YEARS,
        monthlyPayment: null,
        sondertilgungPerYear: last?.sondertilgungPerYear ?? 0,
      },
    ]);
  };

  const remove = (index) => onChange(scenarios.filter((_, i) => i !== index));

  return (
    <SegmentPart name={t('finance.form.scenariosTitle')} helpText={t('finance.form.scenariosHelp')}>
      {scenarios.map((scenario, index) => (
        <div className="scenarioRow" key={scenario.id ?? index}>
          <span
            className="scenarioRow__swatch"
            style={{ backgroundColor: CHART_PALETTE[index % CHART_PALETTE.length] }}
            aria-hidden="true"
          />
          <div className="financeForm__grid scenarioRow__fields">
            <NumberField
              label={t('finance.form.interestRate')}
              value={scenario.annualRate}
              step={0.1}
              max={100}
              suffix="%"
              help={t('finance.form.interestRateHelp')}
              onChange={(annualRate) =>
                update(index, {
                  annualRate,
                  label: `${annualRate} %`,
                  // A pinned instalment stays pinned; only the Tilgung it implies moves.
                  tilgung:
                    scenario.monthlyPayment != null
                      ? tilgungFromPayment(loanAmount, annualRate, scenario.monthlyPayment)
                      : scenario.tilgung,
                })
              }
            />
            <NumberField
              label={t('finance.form.tilgung')}
              value={scenario.tilgung}
              step={0.1}
              max={100}
              suffix="%"
              help={t('finance.form.tilgungHelp')}
              onChange={(tilgung) => setTilgung(index, tilgung)}
            />
            <NumberField
              label={t('finance.form.fixedYears')}
              value={scenario.fixedYears}
              step={1}
              max={40}
              suffix={t('finance.form.yearsSuffix')}
              help={t('finance.form.fixedYearsHelp')}
              onChange={(fixedYears) => update(index, { fixedYears })}
            />
            <NumberField
              label={t('finance.form.monthlyPayment')}
              value={Math.round(scenario.monthlyPayment ?? annuity(loanAmount, scenario.annualRate, scenario.tilgung))}
              step={50}
              suffix="€"
              help={t('finance.form.monthlyPaymentHelp')}
              onChange={(monthlyPayment) => setPayment(index, monthlyPayment)}
            />
            <NumberField
              label={t('finance.form.sondertilgung')}
              value={scenario.sondertilgungPerYear ?? 0}
              step={500}
              suffix="€"
              help={t('finance.form.sondertilgungHelp')}
              onChange={(sondertilgungPerYear) => update(index, { sondertilgungPerYear })}
            />
          </div>
          {scenarios.length > 1 && (
            <Tooltip content={t('finance.form.removeScenario')}>
              <Button
                theme="borderless"
                type="tertiary"
                size="small"
                icon={<IconDelete />}
                aria-label={t('finance.form.removeScenario')}
                onClick={() => remove(index)}
              />
            </Tooltip>
          )}
        </div>
      ))}

      {scenarios.length < MAX_SCENARIOS && (
        <Button theme="borderless" icon={<IconPlus />} onClick={add} className="scenarioRow__add">
          {t('finance.form.addScenario')}
        </Button>
      )}
    </SegmentPart>
  );
}

ScenarioForm.displayName = 'ScenarioForm';
