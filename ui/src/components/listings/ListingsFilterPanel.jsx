/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Radio, RadioGroup, Select } from '@douyinfe/semi-ui-19';

import FilterSelect from './FilterSelect.jsx';
import FilterDrawer, { FilterGroup, FilterHelp } from '../filters/FilterDrawer.jsx';
import { COMMUTE_OPTIONS } from '../transit/travelTimeFormat.js';
import {
  DOWNSTREAM_FILTER_STEPS,
  FILTERABLE_TECHNOLOGIES,
  FILTERABLE_OPERATORS,
} from '../connectivity/connectivityFormat.js';
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
 * @param {string[]|null} [props.availableProviders]
 * @param {boolean} props.financeComplete
 * @param {string} props.affordabilityHelp
 * @param {boolean} props.hasAddresses
 * @param {boolean} [props.connectivityEnabled]
 * @param {() => void} props.onAffordabilityUsed
 * @param {(kind: 'downstream'|'fiber'|'mobile') => void} props.onConnectivityFilterUsed
 * @returns {React.ReactElement}
 */
export default function ListingsFilterPanel({
  visible,
  onClose,
  values,
  onChange,
  jobs = [],
  providers = [],
  availableProviders = null,
  financeComplete,
  affordabilityHelp,
  hasAddresses,
  connectivityEnabled = false,
  onAffordabilityUsed,
  onConnectivityFilterUsed,
}) {
  const t = useTranslation();
  const activeCount = countActiveFilters(values);
  const visibleProviders = filterConfiguredProviders(providers, jobs, values.job, values.provider, availableProviders);

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

      {/* Only offered while the operator has the enrichment on. With it off nothing is ever
          written to the columns these read, so every one of them would return an empty page. */}
      {connectivityEnabled && (
        <FilterGroup title={t('listings.filterGroupConnectivity')}>
          <FilterSelect
            help={t('listings.filterDownstreamHelp')}
            placeholder={t('listings.filterDownstreamPlaceholder')}
            showClear
            onChange={(val) => {
              onChange({ down: val ?? null, page: 1 });
              if (val != null) {
                onConnectivityFilterUsed('downstream');
              }
            }}
            value={values.down}
            style={{ width: '100%' }}
          >
            {DOWNSTREAM_FILTER_STEPS.map((mbit) => (
              <Select.Option key={mbit} value={mbit}>
                {t('listings.filterDownstreamOption', { mbit })}
              </Select.Option>
            ))}
          </FilterSelect>

          <FilterHelp>{t('listings.filterFiberHelp')}</FilterHelp>
          {/*
            Two states rather than three. "Only addresses without fibre" is a question nobody
            asks, and offering it would put a filter in the drawer whose only use is to hide the
            listings the user is looking for.
          */}
          <RadioGroup
            type="button"
            buttonSize="middle"
            value={values.fiber === true ? 'fiber' : 'all'}
            onChange={(e) => {
              const wantsFiber = e.target.value === 'fiber';
              onChange({ fiber: wantsFiber ? true : null, page: 1 });
              if (wantsFiber) {
                onConnectivityFilterUsed('fiber');
              }
            }}
          >
            <Radio value="all">{t('listings.filterAll')}</Radio>
            <Radio value="fiber">{t('listings.filterFiberOnly')}</Radio>
          </RadioGroup>

          <FilterSelect
            help={t('listings.filterMobileTechHelp')}
            placeholder={t('listings.filterMobileTechPlaceholder')}
            showClear
            onChange={(val) => {
              // The operator is cleared along with the technology: on its own it filters nothing,
              // and leaving it set would make the next technology pick silently narrower than the
              // drawer shows.
              onChange({ mtech: val ?? null, mop: val == null ? null : values.mop, page: 1 });
              if (val != null) {
                onConnectivityFilterUsed('mobile');
              }
            }}
            value={values.mtech}
            style={{ width: '100%' }}
          >
            {FILTERABLE_TECHNOLOGIES.map((tech) => (
              <Select.Option key={tech} value={tech}>
                {t(`connectivity.tech.${tech}`)}
              </Select.Option>
            ))}
          </FilterSelect>

          {/*
            Disabled rather than hidden while no technology is picked. "5G at Telekom" is one
            question, and a lone operator dropdown suggests "listings where Telekom exists", which
            is every listing in the country.
          */}
          <FilterSelect
            help={t('listings.filterMobileOperatorHelp')}
            placeholder={t('listings.filterMobileOperatorPlaceholder')}
            showClear
            disabled={values.mtech == null}
            onChange={(val) => onChange({ mop: val ?? null, page: 1 })}
            value={values.mop}
            style={{ width: '100%' }}
          >
            {FILTERABLE_OPERATORS.map((code) => (
              <Select.Option key={code} value={code}>
                {t(`connectivity.operator.${code}`)}
              </Select.Option>
            ))}
          </FilterSelect>
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
