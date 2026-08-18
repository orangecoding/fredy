/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Radio, RadioGroup, Select } from '@douyinfe/semi-ui-19';

import FilterSelect from './FilterSelect.jsx';
import FilterDrawer, { FilterGroup, FilterHelp } from '../filters/FilterDrawer.jsx';
import { COMMUTE_OPTIONS } from '../transit/travelTimeFormat.js';
import {
  showValueOf,
  showPatch,
  clearAllFilters,
  countActiveFilters,
  filterConfiguredProviders,
} from '../../services/listings/listingFilters.js';
import { useTranslation } from '../../services/i18n/i18n.jsx';

/**
 * Every listings filter, in one drawer.
 *
 * These were eleven controls in a wrapping row above the results, permanently on screen whether or
 * not any of them were doing anything - on a narrow window they wrapped onto three lines and pushed
 * the listings themselves below the fold. Behind a button they cost nothing until they are wanted,
 * and the chip row outside says which of them are on.
 *
 * The controls are the ones that were there, with their help text, grouped by the question they
 * answer. Two of them still appear only once they can mean something: affordability needs a finance
 * profile to measure against, a commute needs an address to measure from.
 *
 * @param {Object} props
 * @param {boolean} props.visible
 * @param {() => void} props.onClose
 * @param {Object} props.values The full URL state.
 * @param {(patch: Object) => void} props.onChange Applies a URL patch.
 * @param {{id: string, name: string}[]} [props.jobs]
 * @param {{id: string, name: string}[]} [props.providers]
 * @param {boolean} props.financeComplete
 * @param {string} props.affordabilityHelp
 * @param {boolean} props.hasAddresses
 * @param {() => void} props.onAffordabilityUsed
 * @returns {React.ReactElement}
 */
export default function ListingsFilterPanel({
  visible,
  onClose,
  values,
  onChange,
  jobs = [],
  providers = [],
  financeComplete,
  affordabilityHelp,
  hasAddresses,
  onAffordabilityUsed,
}) {
  const t = useTranslation();
  const activeCount = countActiveFilters(values);
  const visibleProviders = filterConfiguredProviders(providers, jobs, values.job, values.provider);


  return (
    <FilterDrawer
      visible={visible}
      onClose={onClose}
      activeCount={activeCount}
      onClearAll={() => onChange(clearAllFilters())}
    >
      <FilterGroup title={t('listings.filterGroupShow')}>
        <FilterHelp>{t('listings.filterActivityHelp')}</FilterHelp>
        <RadioGroup
          type="button"
          buttonSize="middle"
          value={showValueOf(values)}
          onChange={(e) => onChange(showPatch(e.target.value))}
        >
          <Radio value="all">{t('listings.filterAll')}</Radio>
          <Radio value="true">{t('listings.filterActive')}</Radio>
          <Radio value="false">{t('listings.filterInactive')}</Radio>
          <Radio value="hidden">{t('listings.filterHidden')}</Radio>
        </RadioGroup>

        <FilterHelp>{t('listings.filterWatchHelp')}</FilterHelp>
        <RadioGroup
          type="button"
          buttonSize="middle"
          value={values.watch === null ? 'all' : String(values.watch)}
          onChange={(e) => {
            const value = e.target.value;
            onChange({ watch: value === 'all' ? null : value === 'true', page: 1 });
          }}
        >
          <Radio value="all">{t('listings.filterAll')}</Radio>
          <Radio value="true">{t('listings.filterWatched')}</Radio>
          <Radio value="false">{t('listings.filterUnwatched')}</Radio>
        </RadioGroup>
      </FilterGroup>

      <FilterGroup title={t('listings.filterGroupApplication')}>
        <FilterSelect
          help={t('listings.filterStatusHelp')}
          placeholder={t('listings.filterStatusPlaceholder')}
          showClear
          onChange={(val) => onChange({ status: val ?? null, page: 1 })}
          value={values.status}
          style={{ width: '100%' }}
        >
          <Select.Option value="applied">{t('listings.filterStatusApplied')}</Select.Option>
          <Select.Option value="rejected">{t('listings.filterStatusRejected')}</Select.Option>
          <Select.Option value="accepted">{t('listings.filterStatusAccepted')}</Select.Option>
          <Select.Option value="none">{t('listings.filterStatusNone')}</Select.Option>
        </FilterSelect>
      </FilterGroup>

      {(financeComplete || hasAddresses) && (
        <FilterGroup title={t('listings.filterGroupFit')}>
          {/* Only offered once the user has actually entered their financial data - there is
              nothing to measure a listing against otherwise. */}
          {financeComplete && (
            <FilterSelect
              help={affordabilityHelp}
              placeholder={t('listings.filterAffordabilityPlaceholder')}
              showClear
              onChange={(val) => {
                onChange({ afford: val ?? null, page: 1 });
                // Counted when it is switched on, not when it is cleared, and not on every page
                // load that happens to carry the filter in its URL.
                if (val != null) {
                  onAffordabilityUsed();
                }
              }}
              value={values.afford}
              style={{ width: '100%' }}
            >
              <Select.Option value="affordable">{t('listings.filterAffordabilityYes')}</Select.Option>
              <Select.Option value="stretch">{t('listings.filterAffordabilityStretch')}</Select.Option>
              <Select.Option value="unaffordable">{t('listings.filterAffordabilityNo')}</Select.Option>
            </FilterSelect>
          )}

          {/* Only offered once there is an address to measure a commute against, the same way the
              affordability filter waits for a finance profile. */}
          {hasAddresses && (
            <FilterSelect
              help={t('listings.filterCommuteHelp')}
              placeholder={t('listings.filterCommutePlaceholder')}
              showClear
              onChange={(val) => onChange({ commute: val ?? null, page: 1 })}
              value={values.commute}
              style={{ width: '100%' }}
            >
              {COMMUTE_OPTIONS.map(({ mode, minutes }) =>
                minutes.map((max) => (
                  <Select.Option key={`${mode}:${max}`} value={`${mode}:${max}`}>
                    {t('listings.filterCommuteOption', { mode: t(`travelTime.mode.${mode}`), minutes: max })}
                  </Select.Option>
                )),
              )}
            </FilterSelect>
          )}
        </FilterGroup>
      )}

      <FilterGroup title={t('listings.filterGroupSource')}>
        <FilterSelect
          help={t('listings.filterProviderHelp')}
          placeholder={t('listings.filterProviderPlaceholder')}
          showClear
          onChange={(val) => onChange({ provider: val ?? null, page: 1 })}
          value={values.provider}
          style={{ width: '100%' }}
        >
          {visibleProviders?.map((provider) => (
            <Select.Option key={provider.id} value={provider.id}>
              {provider.name}
            </Select.Option>
          ))}
        </FilterSelect>

        <FilterSelect
          help={t('listings.filterJobHelp')}
          placeholder={t('listings.filterJobPlaceholder')}
          showClear
          onChange={(val) => onChange({ job: val ?? null, page: 1 })}
          value={values.job}
          style={{ width: '100%' }}
        >
          {jobs?.map((job) => (
            <Select.Option key={job.id} value={job.id}>
              {job.name}
            </Select.Option>
          ))}
        </FilterSelect>
      </FilterGroup>
    </FilterDrawer>
  );
}

ListingsFilterPanel.displayName = 'ListingsFilterPanel';
