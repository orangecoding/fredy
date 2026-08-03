/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Toast } from '@douyinfe/semi-ui-19';

import { xhrPost, errorMessage } from '../../services/xhr';
import { useTranslation } from '../../services/i18n/i18n.jsx';

/**
 * The fields the System page owns.
 *
 * `sqlitepath` is the odd one out: the backend routes it to conf/config.json rather than the
 * settings table. It travels in the same request regardless.
 * @type {string[]}
 */
export const SYSTEM_FIELDS = [
  'port',
  'baseUrl',
  'sessionTTL',
  'listingRetentionDays',
  'sqlitepath',
  'analyticsEnabled',
  'demoMode',
];

/** The fields the Execution page owns. @type {string[]} */
export const EXECUTION_FIELDS = [
  'interval',
  'workingHours',
  'proxyUrl',
  'priceTrackingEnabled',
  'priceCheckIntervalDays',
  'priceCheckLimitPerRun',
  'priceChangeThresholdPercent',
];

const nullOrEmpty = (val) => val == null || String(val).length === 0;

/**
 * The stored settings, normalised into the shape the forms edit.
 *
 * Every field gets a defined value so that "unchanged" can be decided by comparison rather than by
 * tracking which inputs the user has touched.
 *
 * @param {Object} settings Global settings from the store.
 * @returns {Object}
 */
function toForm(settings) {
  return {
    port: settings?.port ?? '',
    baseUrl: settings?.baseUrl ?? '',
    sessionTTL: settings?.sessionTTL ?? '',
    listingRetentionDays: settings?.listingRetentionDays ?? 14,
    sqlitepath: settings?.sqlitepath ?? '',
    analyticsEnabled: settings?.analyticsEnabled === true,
    demoMode: settings?.demoMode === true,
    interval: settings?.interval ?? '',
    workingHours: {
      from: settings?.workingHours?.from ?? null,
      to: settings?.workingHours?.to ?? null,
    },
    proxyUrl: settings?.proxyUrl ?? '',
    priceTrackingEnabled: settings?.priceTrackingEnabled === true,
    priceCheckIntervalDays: settings?.priceCheckIntervalDays ?? 7,
    priceCheckLimitPerRun: settings?.priceCheckLimitPerRun ?? 100,
    priceChangeThresholdPercent: settings?.priceChangeThresholdPercent ?? 1,
  };
}

/**
 * Whether any of `fields` differs between two forms.
 *
 * JSON comparison rather than a deep-equal helper: the only non-primitive here is `workingHours`,
 * whose two keys are written in a fixed order by `toForm`.
 *
 * @param {Object} a
 * @param {Object} b
 * @param {string[]} fields
 * @returns {boolean}
 */
function differs(a, b, fields) {
  return fields.some((name) => JSON.stringify(a[name]) !== JSON.stringify(b[name]));
}

/**
 * Operator settings: one form, two pages, one save per page.
 *
 * The two pages used to be tabs sharing a single Save that posted all fourteen fields at once, so
 * saving a proxy URL also rewrote the database path. They are separate routes now, and the backend
 * (`generalSettingsRoute.js`) validates and upserts only the keys a request actually carries, so
 * each page can save its own fields and leave the other page's values untouched.
 *
 * The hook lives on the Administration layout rather than on either page so that switching between
 * System and Execution does not throw away unsaved edits.
 *
 * @param {Object} settings The global settings from the store.
 * @returns {Object} The form, a field setter, per-page dirty flags and per-page save handlers.
 */
export function useAdminSettings(settings) {
  const t = useTranslation();

  // The values as stored. Re-derived whenever the store hands over a new object, which happens
  // once the settings request lands - this may well have mounted before that.
  const baseline = useMemo(() => toForm(settings), [settings]);
  const [form, setForm] = useState(baseline);
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    setForm(baseline);
  }, [baseline]);

  const setField = useCallback((name, value) => {
    setForm((previous) => ({ ...previous, [name]: value }));
  }, []);

  const setWorkingHour = useCallback((edge, value) => {
    setForm((previous) => ({ ...previous, workingHours: { ...previous.workingHours, [edge]: value } }));
  }, []);

  /**
   * Post one page's fields.
   *
   * @param {string[]} fields
   * @param {() => string|null} validate Returns a message when the values must not be sent.
   * @param {boolean} reload Whether the page has to come back up on the new configuration.
   * @returns {Promise<void>}
   */
  const save = useCallback(
    async (fields, validate, reload) => {
      const complaint = validate();
      if (complaint != null) {
        Toast.error(complaint);
        return;
      }

      const payload = {};
      for (const name of fields) {
        payload[name] = form[name];
      }
      // Numbers arrive from InputNumber as numbers already, but a hand-edited field can leave a
      // string behind, and the backend's bounds checks are stricter than its coercion.
      if (fields.includes('listingRetentionDays')) {
        payload.listingRetentionDays = Number(form.listingRetentionDays);
      }
      if (fields.includes('priceCheckIntervalDays')) {
        payload.priceCheckIntervalDays = Number(form.priceCheckIntervalDays);
        payload.priceCheckLimitPerRun = Number(form.priceCheckLimitPerRun);
        payload.priceChangeThresholdPercent = Number(form.priceChangeThresholdPercent);
        payload.proxyUrl = form.proxyUrl?.trim() ?? '';
      }

      setSaving(fields);
      try {
        await xhrPost('/api/admin/generalSettings', payload);
      } catch (exception) {
        console.error(exception);
        // The backend returns the concrete reason (e.g. a 403 "Only admins can change these
        // settings."), which errorMessage() reads from whichever key the route used.
        Toast.error(errorMessage(exception, t('settings.toastSaveError')));
        return;
      } finally {
        setSaving(null);
      }

      if (reload) {
        Toast.success(t('settings.toastSavedReloading'));
        setTimeout(() => {
          location.reload();
        }, 3000);
        return;
      }
      Toast.success(t('settings.toastSaved'));
    },
    [form, t],
  );

  const saveSystem = useCallback(
    () =>
      save(
        SYSTEM_FIELDS,
        () => {
          if (nullOrEmpty(form.port)) {
            return t('settings.toastPortEmpty');
          }
          if (nullOrEmpty(form.sqlitepath)) {
            return t('settings.toastSqlitePathEmpty');
          }
          // A cleared field must not be sent: the backend would have to guess, and guessing on a
          // setting that drives an irreversible delete is the wrong default either way.
          if (
            form.listingRetentionDays === '' ||
            form.listingRetentionDays == null ||
            !Number.isInteger(Number(form.listingRetentionDays))
          ) {
            return t('settings.toastListingRetentionInvalid');
          }
          return null;
        },
        // The port and the database path only take effect on the process that reads them at boot,
        // and the browser is talking to that process.
        true,
      ),
    [save, form, t],
  );

  const saveExecution = useCallback(
    () =>
      save(
        EXECUTION_FIELDS,
        () => {
          if (nullOrEmpty(form.interval)) {
            return t('settings.toastIntervalEmpty');
          }
          const { from, to } = form.workingHours;
          if ((!nullOrEmpty(from) && nullOrEmpty(to)) || (nullOrEmpty(from) && !nullOrEmpty(to))) {
            return t('settings.toastWorkingHoursIncomplete');
          }
          // Only the interval and the limit are guarded here. They decide how much traffic Fredy
          // sends at the portals, so a cleared field must not be silently coerced into a value the
          // operator never chose - the threshold is allowed to be 0, which legitimately means
          // "notify me about anything".
          if (
            !Number.isInteger(Number(form.priceCheckIntervalDays)) ||
            Number(form.priceCheckIntervalDays) < 1 ||
            !Number.isInteger(Number(form.priceCheckLimitPerRun)) ||
            Number(form.priceCheckLimitPerRun) < 1
          ) {
            return t('settings.toastPriceTrackingInvalid');
          }
          return null;
        },
        false,
      ),
    [save, form, t],
  );

  return {
    t,
    form,
    setField,
    setWorkingHour,
    systemDirty: differs(form, baseline, SYSTEM_FIELDS),
    executionDirty: differs(form, baseline, EXECUTION_FIELDS),
    savingSystem: saving === SYSTEM_FIELDS,
    savingExecution: saving === EXECUTION_FIELDS,
    saveSystem,
    saveExecution,
  };
}
