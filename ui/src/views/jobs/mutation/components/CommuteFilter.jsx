/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useId } from 'react';
import { Banner, InputNumber, Select } from '@douyinfe/semi-ui-19';
import { Link } from 'react-router';

import { useSelector } from '../../../../services/state/store';
import { useTranslation } from '../../../../services/i18n/i18n.jsx';
import {
  COMMUTE_ACTIONS,
  DEFAULT_COMMUTE_ACTION,
  orphanedCommuteLabels,
  savedAddresses,
  toCommuteLimit,
} from '../../../../services/jobs/commuteFilter.js';
import { placeCategoryIcon, isPlaceType } from '../../../../services/travelTime/placeCategories.js';
import './commuteFilter.less';

/**
 * How far this search is willing to travel, and what to do about a listing that is further.
 *
 * One row per saved address, because that is the shape of the answer: a limit is a fact about one
 * place, and somebody with an office and a school needs both to hold. Leaving a row empty is how you
 * say this search does not care how far that address is, which is why an untouched form does exactly
 * what it did before this existed.
 *
 * The mode and the departure are shown but not editable here. They belong to the address, in
 * Settings, because they decide what the sweeper computes and what it costs: a public transport
 * address is answered by one region-wide query, a driving one by a routing per listing. A job may
 * say how far is too far; it may not say how you get there.
 *
 * @param {Object} props
 * @param {{action?: string, limits?: Record<string, number>}|null} props.value
 * @param {(next: {action: string, limits: Record<string, number>}|null) => void} props.onChange -
 *   Called with `null` once the last limit is cleared, so an emptied form really does clear.
 * @returns {React.ReactElement}
 */
export default function CommuteFilter({ value, onChange }) {
  const t = useTranslation();
  const userSettings = useSelector((state) => state.userSettings.settings);
  const addresses = savedAddresses(userSettings);
  // Semi's Select does not forward `aria-label` to its trigger but does honour `aria-labelledby`,
  // so the visible label is what names the control rather than a second string kept in step with it.
  const actionLabelId = useId();

  const limits = value?.limits ?? {};
  const action = COMMUTE_ACTIONS.includes(value?.action) ? value.action : DEFAULT_COMMUTE_ACTION;

  // Nothing to measure from, so nothing to ask. Pointing at the page that fixes it rather than
  // rendering an empty section somebody has to work out for themselves.
  if (addresses.length === 0) {
    return (
      <Banner
        type="info"
        closeIcon={null}
        description={
          <span>
            {t('jobs.mutation.commuteNoAddresses')}{' '}
            <Link to="/settings/travel-time">{t('jobs.mutation.commuteNoAddressesLink')}</Link>
          </span>
        }
      />
    );
  }

  // A limit set before its address was renamed or deleted. It cannot be enforced - there is no mode
  // left to judge it in, so the server ignores it and nothing is held back - but it must not vanish
  // without a word, because from the user's side a filter they set simply stopped working.
  const orphaned = orphanedCommuteLabels(limits, addresses);

  /**
   * @param {Record<string, number>} nextLimits
   * @param {string} nextAction
   * @returns {void}
   */
  const emit = (nextLimits, nextAction) => {
    // Touching the section is what clears the orphans out. Dropping them on load would be a silent
    // edit of a job nobody asked to change; dropping them here happens next to the warning that
    // says so, and only once the user is already editing.
    const cleaned = Object.fromEntries(Object.entries(nextLimits).filter(([label]) => !orphaned.includes(label)));
    // An object with no limits in it would filter nothing while still reading as a configured filter
    // everywhere downstream, so a search with nothing set is null. The one exception is somebody who
    // picked the action before typing a number: throwing that away would silently undo a choice they
    // just made and watched take effect. The server normalises it back to null on save, since a
    // filter with no limits still filters nothing.
    const empty = Object.keys(cleaned).length === 0;
    onChange(empty && nextAction === DEFAULT_COMMUTE_ACTION ? null : { action: nextAction, limits: cleaned });
  };

  /**
   * @param {string} label
   * @param {unknown} raw
   * @returns {void}
   */
  const setLimit = (label, raw) => {
    const next = { ...limits };
    const minutes = toCommuteLimit(raw);
    if (minutes == null) {
      delete next[label];
    } else {
      next[label] = minutes;
    }
    emit(next, action);
  };

  return (
    <div className="commuteFilter">
      {orphaned.length > 0 && (
        <Banner
          type="warning"
          closeIcon={null}
          description={t('jobs.mutation.commuteOrphanedLimits', { labels: orphaned.join(', ') })}
        />
      )}

      {/* What to do, in the open rather than behind the help mark next to the title. The first thing
          this section used to show was an unlabelled number box, and a box whose only label is its
          own placeholder does not say what number belongs in it. The help mark still carries what
          cannot be seen from here: where the places come from, and the promise that a travel time
          Fredy never worked out cannot cost a listing. */}
      <p className="commuteFilter__intro">{t('jobs.mutation.commuteIntro')}</p>

      {addresses.map((address) => (
        <div key={address.label} className="commuteFilter__row">
          <div className="commuteFilter__place">
            <span className="commuteFilter__label">
              {/* A limit on "Groceries" behaves differently from one on "Work": it is measured to
                  whichever supermarket is nearest to each listing rather than to one fixed place.
                  Saying so here, where the number is being decided, rather than only in settings. */}
              <span aria-hidden="true" className="commuteFilter__icon">
                {placeCategoryIcon(isPlaceType(address) ? address.category : null)}
              </span>
              {address.label}
            </span>
            <span className="commuteFilter__mode">
              {isPlaceType(address) ? `${t(`travelTime.placeCategory.${address.category}`)} · ` : ''}
              {t(`travelTime.mode.${address.mode ?? 'transit'}`)}
              {(address.mode ?? 'transit') === 'transit' ? ` · ${address.departure?.time ?? '08:00'}` : ''}
            </span>
          </div>
          <InputNumber
            size="small"
            className="commuteFilter__minutes"
            min={1}
            max={240}
            step={5}
            precision={0}
            hideButtons
            aria-label={t('jobs.mutation.commuteLimitAria', { label: address.label })}
            value={limits[address.label] ?? ''}
            placeholder={t('jobs.mutation.commuteLimitPlaceholder')}
            suffix={<span className="commuteFilter__unit">{t('jobs.mutation.commuteLimitUnit')}</span>}
            onChange={(v) => setLimit(address.label, v)}
          />
        </div>
      ))}

      {/* Always shown, even with every box still empty. It reads as a follow-up question and is not
          one: it is what says whether typing a number here costs a notification or only paints a pin,
          and somebody deciding whether to set a limit at all needs that before they set it. Hiding it
          until the first number left the section looking like it did nothing.

          Label above control, the way the price and size criteria next door are built, so the one
          decision that covers every row reads as a second part of this section rather than as a
          caption stuck to the end of the last one. */}
      <div className="commuteFilter__action">
        <span className="commuteFilter__actionLabel" id={actionLabelId}>
          {t('jobs.mutation.commuteActionLabel')}
        </span>
        <Select
          size="small"
          className="commuteFilter__actionSelect"
          aria-labelledby={actionLabelId}
          value={action}
          onChange={(v) => emit(limits, v)}
        >
          {COMMUTE_ACTIONS.map((option) => (
            <Select.Option key={option} value={option}>
              {t(`jobs.mutation.commuteAction.${option}`)}
            </Select.Option>
          ))}
        </Select>
        {/* With nothing set yet this says when the choice starts mattering rather than that it
            currently does nothing. "Set one above to switch it on" told somebody who had just picked
            an option that they had achieved nothing, which is the wrong note for the one control in
            here that is genuinely a decision. */}
        <div className="commuteFilter__hint">
          {Object.keys(limits).length === 0
            ? t('jobs.mutation.commuteActionIdle')
            : t(`jobs.mutation.commuteActionHelp.${action}`)}
        </div>
      </div>
    </div>
  );
}

CommuteFilter.displayName = 'CommuteFilter';
