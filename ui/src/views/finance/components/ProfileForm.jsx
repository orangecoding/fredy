/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { InputNumber, Switch, Tooltip, Typography } from '@douyinfe/semi-ui-19';
import { IconHelpCircleStroked } from '@douyinfe/semi-icons';

import { SegmentPart } from '../../../components/segment/SegmentPart.jsx';
import { useTranslation } from '../../../services/i18n/i18n.jsx';

import './FinanceForms.less';

const { Text } = Typography;

/**
 * The caption above a field, with the explanation of what the field does hanging off an icon.
 *
 * The help lives in a popover rather than under the input on purpose: every field can carry a
 * sentence or two without the form growing, and - because the text no longer takes vertical
 * space - inputs sitting next to each other stay on one line.
 *
 * @param {Object} props
 * @param {string} props.label
 * @param {string} [props.help] Shown on hover. Say what the number is *and* what changes when it moves.
 */
export function FieldLabel({ label, help }) {
  return (
    <span className="financeField__label">
      {label}
      {help && (
        <Tooltip content={help} position="top" showArrow>
          <span className="financeField__help" tabIndex={0} role="note" aria-label={help}>
            <IconHelpCircleStroked size="small" />
          </span>
        </Tooltip>
      )}
    </span>
  );
}

/**
 * A labelled numeric field. Every input on this page is a number, so this keeps the forms
 * from becoming a wall of repeated markup.
 *
 * @param {Object} props
 * @param {string} props.label
 * @param {number} props.value
 * @param {(value: number) => void} props.onChange
 * @param {string} [props.suffix]
 * @param {string} [props.help] Explanation shown in the label popover.
 * @param {number} [props.min]
 * @param {number} [props.max]
 * @param {number} [props.step]
 * @param {boolean} [props.allowEmpty] When true, clearing the field yields `null` rather than 0,
 *   so a field with a meaningful default can tell "left blank" from "deliberately zero".
 * @param {string} [props.placeholder] Shown while the field is empty, e.g. the default that applies.
 * @param {() => void} [props.onBlur] Fired when the field loses focus, for save-on-blur.
 */
export function NumberField({
  label,
  value,
  onChange,
  suffix,
  help,
  min = 0,
  max,
  step = 1,
  allowEmpty = false,
  placeholder,
  onBlur,
}) {
  return (
    <label className="financeField">
      <FieldLabel label={label} help={help} />
      <InputNumber
        className="financeField__input"
        value={value ?? ''}
        min={min}
        max={max}
        step={step}
        hideButtons
        placeholder={placeholder}
        suffix={suffix ? <span className="financeField__suffix">{suffix}</span> : undefined}
        onBlur={onBlur}
        onChange={(next) => {
          const isBlank = next === '' || next == null;
          if (isBlank) {
            onChange(allowEmpty ? null : 0);
            return;
          }
          onChange(Number.isFinite(Number(next)) ? Number(next) : allowEmpty ? null : 0);
        }}
      />
    </label>
  );
}

/**
 * Income, age and living costs for one or two people, plus any debt already being serviced.
 *
 * @param {Object} props
 * @param {import('../../../../../lib/types/finance.js').FinanceProfile} props.profile
 * @param {(patch: Object) => void} props.onChange Shallow-merged into the profile.
 */
export default function ProfileForm({ profile, onChange }) {
  const t = useTranslation();

  const setPerson = (key, patch) => onChange({ [key]: { ...profile[key], ...patch } });

  return (
    <>
      <SegmentPart name={t('finance.form.householdTitle')} helpText={t('finance.form.householdHelp')}>
        <div className="financeForm__person">
          <Text strong className="financeForm__person-title">
            {t('finance.form.personA')}
          </Text>
          <div className="financeForm__grid">
            <NumberField
              label={t('finance.form.age')}
              value={profile.personA.age}
              min={16}
              max={99}
              help={t('finance.form.ageHelp')}
              onChange={(age) => setPerson('personA', { age })}
            />
            <NumberField
              label={t('finance.form.primaryIncome')}
              value={profile.personA.primaryIncome}
              step={50}
              suffix="€"
              help={t('finance.form.primaryIncomeHelp')}
              onChange={(primaryIncome) => setPerson('personA', { primaryIncome })}
            />
            <NumberField
              label={t('finance.form.secondaryIncome')}
              value={profile.personA.secondaryIncome}
              step={50}
              suffix="€"
              help={t('finance.form.secondaryIncomeHelp')}
              onChange={(secondaryIncome) => setPerson('personA', { secondaryIncome })}
            />
          </div>
        </div>

        <div className="financeForm__person">
          <div className="financeForm__person-header">
            <Text strong className="financeForm__person-title">
              {t('finance.form.personB')}
            </Text>
            <Switch
              size="small"
              checked={profile.personB.enabled === true}
              aria-label={t('finance.form.addPartner')}
              onChange={(enabled) => setPerson('personB', { enabled })}
            />
          </div>
          {profile.personB.enabled ? (
            <div className="financeForm__grid">
              <NumberField
                label={t('finance.form.age')}
                value={profile.personB.age}
                min={16}
                max={99}
                help={t('finance.form.ageHelp')}
                onChange={(age) => setPerson('personB', { age })}
              />
              <NumberField
                label={t('finance.form.primaryIncome')}
                value={profile.personB.primaryIncome}
                step={50}
                suffix="€"
                help={t('finance.form.primaryIncomeHelp')}
                onChange={(primaryIncome) => setPerson('personB', { primaryIncome })}
              />
              <NumberField
                label={t('finance.form.secondaryIncome')}
                value={profile.personB.secondaryIncome}
                step={50}
                suffix="€"
                help={t('finance.form.secondaryIncomeHelp')}
                onChange={(secondaryIncome) => setPerson('personB', { secondaryIncome })}
              />
            </div>
          ) : (
            <Text type="tertiary" size="small">
              {t('finance.form.addPartnerHint')}
            </Text>
          )}
        </div>
      </SegmentPart>

      <SegmentPart name={t('finance.form.outgoingsTitle')} helpText={t('finance.form.outgoingsHelp')}>
        <div className="financeForm__grid">
          <NumberField
            label={t('finance.form.livingCosts')}
            value={profile.livingCosts}
            step={50}
            suffix="€"
            help={t('finance.form.livingCostsHelp')}
            onChange={(livingCosts) => onChange({ livingCosts })}
          />
        </div>
      </SegmentPart>

      <SegmentPart name={t('finance.form.existingDebtTitle')} helpText={t('finance.form.existingDebtHelp')}>
        <div className="financeForm__grid">
          <NumberField
            label={t('finance.form.existingDebt')}
            value={profile.existingDebt}
            step={500}
            suffix="€"
            help={t('finance.form.existingDebtAmountHelp')}
            onChange={(existingDebt) => onChange({ existingDebt })}
          />
          <NumberField
            label={t('finance.form.existingDebtRate')}
            value={profile.existingDebtRate}
            step={25}
            suffix="€"
            help={t('finance.form.existingDebtRateHelp')}
            onChange={(existingDebtRate) => onChange({ existingDebtRate })}
          />
          <NumberField
            label={t('finance.form.existingDebtInterest')}
            value={profile.existingDebtInterest}
            step={0.1}
            max={100}
            suffix="%"
            help={t('finance.form.existingDebtInterestHelp')}
            onChange={(existingDebtInterest) => onChange({ existingDebtInterest })}
          />
        </div>
        {profile.existingDebt > 0 && profile.existingDebtRate > 0 && (
          <label className="financeForm__toggle">
            <Switch
              size="small"
              checked={profile.rollFreedBudgetIntoMortgage === true}
              onChange={(rollFreedBudgetIntoMortgage) => onChange({ rollFreedBudgetIntoMortgage })}
            />
            <span>
              <span className="financeForm__toggle-label">{t('finance.form.rollOver')}</span>
              <span className="financeForm__toggle-hint">{t('finance.form.rollOverHint')}</span>
            </span>
          </label>
        )}
      </SegmentPart>
    </>
  );
}

ProfileForm.displayName = 'ProfileForm';
