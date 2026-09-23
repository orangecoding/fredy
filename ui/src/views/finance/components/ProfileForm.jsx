/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useId } from 'react';
import { InputNumber, Popover, Switch, Typography } from '@douyinfe/semi-ui-19';
import { IconHelpCircle } from '@douyinfe/semi-icons';

import { SegmentPart } from '../../../components/segment/SegmentPart.jsx';
import AdminField from '../../admin/components/AdminField.jsx';
import { useTranslation } from '../../../services/i18n/i18n.jsx';

import './FinanceForms.less';

const { Text } = Typography;

/**
 * A caption with its explanation behind a mark, for the places on this page that are not a field.
 *
 * The inputs themselves are `AdminField` rows now, which carries its own label and mark. What is
 * left for this is the rent panel's four ceilings: a caption over a figure the user cannot type
 * into, which still has to say what the figure means.
 *
 * A popover rather than a tooltip: these texts are two and three sentences long - the Nebenkosten
 * one runs to 34 words - and a tooltip closes on the first pointer movement. The mark and the
 * behaviour match SegmentPart and AdminField, which is every other explanation in the app.
 *
 * @param {Object} props
 * @param {string} props.label
 * @param {string} [props.help] Say what the number is *and* what changes when it moves.
 */
export function FieldLabel({ label, help }) {
  return (
    <span className="financeField__label">
      {label}
      {help && (
        <Popover content={<div className="financeField__helpBody">{help}</div>} position="top" showArrow>
          <span className="financeField__help" tabIndex={0} role="note" aria-label={help}>
            <IconHelpCircle size="small" />
          </span>
        </Popover>
      )}
    </span>
  );
}

/**
 * A labelled numeric field, as one settings row: name on the left, figure on the right.
 *
 * This used to stack a caption over a full-width input, which is what made twelve of them read as a
 * tax return - and at full width Semi's four nested boxes came apart, so the unit behind the figure
 * sat on the card's edge rather than inside the field. `AdminField` answers both: it is the row the
 * settings and admin pages are built from, and its stylesheet already takes Semi's inner boxes
 * apart so that a suffix has somewhere to stand.
 *
 * @param {Object} props
 * @param {string} props.label
 * @param {number} props.value
 * @param {(value: number) => void} props.onChange
 * @param {string} [props.suffix]
 * @param {string} [props.help] Explanation shown behind the mark beside the label.
 * @param {number} [props.min]
 * @param {number} [props.max]
 * @param {number} [props.step]
 * @param {boolean} [props.allowEmpty] When true, clearing the field yields `null` rather than 0,
 *   so a field with a meaningful default can tell "left blank" from "deliberately zero".
 * @param {string} [props.placeholder] Shown while the field is empty, e.g. the default that applies.
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
}) {
  // The row's caption is a real <label>, so it needs something to point at. Generated rather than
  // passed in: every caller would otherwise have to invent an id for a field it only names once.
  const id = useId();

  return (
    <AdminField label={label} help={help} htmlFor={id}>
      <InputNumber
        id={id}
        className="financeField__input"
        value={value ?? ''}
        min={min}
        max={max}
        step={step}
        hideButtons
        placeholder={placeholder}
        suffix={suffix ? <span className="financeField__suffix">{suffix}</span> : undefined}
        onChange={(next) => {
          const isBlank = next === '' || next == null;
          if (isBlank) {
            onChange(allowEmpty ? null : 0);
            return;
          }
          onChange(Number.isFinite(Number(next)) ? Number(next) : allowEmpty ? null : 0);
        }}
      />
    </AdminField>
  );
}

/**
 * The half of the household that has a working default, and therefore sits behind a fold: ages,
 * a partner and their income, a second income, and any debt already being serviced.
 *
 * Net income and living costs are not here - they are the two figures `isRentProfileComplete` and
 * `isProfileComplete` actually ask for, and `HouseholdHeadline` asks for them in the open.
 *
 * @param {Object} props
 * @param {import('../../../types/finance.js').FinanceProfile} props.profile
 * @param {(patch: Object) => void} props.onChange Shallow-merged into the profile.
 */
export default function ProfileForm({ profile, onChange }) {
  const t = useTranslation();

  const setPerson = (key, patch) => onChange({ [key]: { ...profile[key], ...patch } });

  return (
    <>
      <SegmentPart name={t('finance.form.peopleTitle')}>
        <div className="financeForm__person">
          <Text strong className="financeForm__person-title">
            {t('finance.form.personA')}
          </Text>
          <div className="financeForm__fields">
            <NumberField
              label={t('finance.form.age')}
              value={profile.personA.age}
              min={16}
              max={99}
              help={t('finance.form.ageHelp')}
              onChange={(age) => setPerson('personA', { age })}
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
            <div className="financeForm__fields">
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

      <SegmentPart name={t('finance.form.existingDebtTitle')} helpText={t('finance.form.existingDebtHelp')}>
        <div className="financeForm__fields">
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
