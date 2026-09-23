/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Checkbox, Input, InputNumber } from '@douyinfe/semi-ui-19';
import { IconAlertTriangle } from '@douyinfe/semi-icons';
import { useOutletContext } from 'react-router';

import { SegmentPart } from '../../../components/segment/SegmentPart';
import SettingsSaveBar from '../../../components/settingsShell/SettingsSaveBar.jsx';
import { useUnsavedWarning } from '../../../hooks/useUnsavedWarning.js';

/**
 * The reverse-proxy sign-in inputs, rendered from one template: they share label, help and
 * placeholder keys by name, and differ only in whether they hold a secret.
 * @type {{name: string, secret?: boolean}[]}
 */
const PROXY_AUTH_FIELDS = [
  { name: 'proxyAuthTrustedProxies' },
  { name: 'proxyAuthUserHeader' },
  { name: 'proxyAuthSecretHeader' },
  { name: 'proxyAuthSecret', secret: true },
];

/**
 * How the instance runs: the port it listens on, where it thinks it lives, how long a session
 * lasts, how long listings are kept, where the database file is.
 *
 * Five groups and six cards, where this was ten cards in a row. Seven of those ten held a single
 * input, and their help text alone came to some 450 words of permanently visible prose - read once
 * by whoever set the instance up, and in the way on every visit afterwards.
 *
 * Related fields sit side by side in one card body rather than stacked with a label each. The
 * group title and the card title already say what the card is about, and a suffix inside the box
 * says the rest: "14 Tage", "10 MB", "20 Dateien" read as a sentence across the row, where a
 * label column beside them would have repeated the card title three times. One mark per card
 * carries the explanation. Where a field has no suffix to speak for it - the port, the base URL,
 * the database path - the control carries an `aria-label`, so nothing is lost to a reader who
 * cannot see the card title above it.
 *
 * The standing introduction that used to carry the structure goes with the ten cards: it was a
 * crutch for the grouping that was missing.
 *
 * @returns {React.ReactElement}
 */
export default function SystemPage() {
  const { t, form, setField, systemDirty, savingSystem, saveSystem, discardSystem } = useOutletContext();

  // Port und Datenbankpfad werden beim Start gelesen, deshalb laedt saveSystem den Browser drei
  // Sekunden nach dem Speichern neu. Bisher stand das nur in den Hilfetexten der beiden Felder und
  // im Toast danach - also vor der Entscheidung nirgends und nach ihr zu spaet.
  const restartNeeded = systemDirty;

  useUnsavedWarning(systemDirty);

  /**
   * The chip saying that saving this card restarts the instance.
   *
   * A node, not a component declared in the render body: `SegmentPart`'s `action` takes any node,
   * and a component declared in a render body is a new type on every render - which is precisely
   * the bug step 7 exists to fix, one page over.
   * @type {React.ReactElement}
   */
  const restartFlag = (
    <span className="settingsShell__cardFlag">
      <span className="settingsShell__cardFlagDot" aria-hidden="true" />
      {t('admin.system.restartFlag')}
    </span>
  );

  return (
    <div className="settingsShell__page">
      <div className="settingsShell__groupTitle">{t('admin.system.groupReach')}</div>
      <SegmentPart
        name={t('admin.system.cardAddress')}
        // One card for what used to be two, so one mark for both explanations: the port's (a
        // restart, and the Docker mapping has to follow) is not said anywhere else.
        helpText={`${t('settings.portHelp')} ${t('settings.baseUrlHelp')}`}
        helpMode="popover"
        action={restartFlag}
      >
        <div className="adminRow">
          <span className="adminRow__control">
            <InputNumber
              min={0}
              max={99999}
              aria-label={t('settings.port')}
              placeholder={t('settings.portPlaceholder')}
              value={form.port}
              formatter={(value) => `${value}`.replace(/\D/g, '')}
              onChange={(value) => setField('port', value)}
            />
          </span>
          {/* Eine URL ist so lang wie sie ist und nimmt den Rest der Zeile. */}
          <span className="adminRow__control adminRow__control--grow">
            <Input
              type="text"
              aria-label={t('settings.baseUrl')}
              placeholder={t('settings.baseUrlPlaceholder')}
              value={form.baseUrl}
              onChange={(value) => setField('baseUrl', value)}
            />
          </span>
        </div>
      </SegmentPart>

      <div className="settingsShell__groupTitle">{t('admin.system.groupSession')}</div>
      <SegmentPart name={t('admin.system.cardSession')} helpText={t('settings.sessionTTLHelp')} helpMode="popover">
        <div className="adminRow">
          <span className="adminRow__control adminRow__control--grow">
            <Input
              type="text"
              aria-label={t('settings.sessionTTL')}
              placeholder={t('settings.sessionTTLPlaceholder')}
              value={form.sessionTTL}
              onChange={(value) => setField('sessionTTL', value)}
            />
          </span>
        </div>
      </SegmentPart>

      <div className="settingsShell__groupTitle">{t('admin.system.groupRetention')}</div>
      <SegmentPart
        name={t('admin.system.cardRetention')}
        helpText={`${t('settings.listingRetentionHelp')} ${t('settings.listingAttachmentMaxMbHelp')} ${t(
          'settings.listingAttachmentMaxPerListingHelp',
        )}`}
        helpMode="popover"
      >
        {/* "14 Tage", "10 MB", "20 Dateien" - nebeneinander gelesen sagt die Zeile, was die Karte
            aufbewahrt. Untereinander mit einer Beschriftung je Zeile stand dreimal daneben, was
            der Kartentitel schon sagt. */}
        <div className="adminRow">
          <span className="adminRow__control">
            <InputNumber
              min={0}
              max={365}
              aria-label={t('settings.listingRetention')}
              placeholder={t('settings.listingRetentionPlaceholder')}
              value={form.listingRetentionDays}
              formatter={(value) => `${value}`.replace(/\D/g, '')}
              onChange={(value) => setField('listingRetentionDays', value)}
              suffix={t('settings.listingRetentionSuffix')}
            />
          </span>
          <span className="adminRow__control">
            <InputNumber
              min={1}
              max={50}
              aria-label={t('settings.listingAttachmentMaxMb')}
              placeholder={t('settings.listingAttachmentMaxMbPlaceholder')}
              value={form.listingAttachmentMaxMb}
              formatter={(value) => `${value}`.replace(/\D/g, '')}
              onChange={(value) => setField('listingAttachmentMaxMb', value)}
              suffix={t('settings.listingAttachmentMaxMbSuffix')}
            />
          </span>
          <span className="adminRow__control">
            <InputNumber
              min={1}
              max={200}
              aria-label={t('settings.listingAttachmentMaxPerListing')}
              placeholder={t('settings.listingAttachmentMaxPerListingPlaceholder')}
              value={form.listingAttachmentMaxPerListing}
              formatter={(value) => `${value}`.replace(/\D/g, '')}
              onChange={(value) => setField('listingAttachmentMaxPerListing', value)}
              suffix={t('settings.listingAttachmentMaxPerListingSuffix')}
            />
          </span>
        </div>
      </SegmentPart>

      <div className="settingsShell__groupTitle">{t('admin.system.groupDatabase')}</div>
      <SegmentPart
        name={t('admin.system.cardStorage')}
        helpText={t('settings.sqlitePathHelp')}
        helpMode="popover"
        action={restartFlag}
      >
        {/* Nicht hinter die Marke: eine Warnung, die man aufklappen muss, ist keine. */}
        <span className="settingsShell__helpWarning">
          <IconAlertTriangle size="small" />
          <span>{t('settings.sqlitePathWarning')}</span>
        </span>

        <div className="adminRow">
          <span className="adminRow__control adminRow__control--grow">
            <Input
              type="text"
              aria-label={t('settings.sqlitePath')}
              placeholder={t('settings.sqlitePathPlaceholder')}
              value={form.sqlitepath}
              onChange={(value) => setField('sqlitepath', value)}
            />
          </span>
        </div>
      </SegmentPart>

      <div className="settingsShell__groupTitle">{t('admin.system.groupInstance')}</div>
      {/* Both explanations, as both switches are here: that demo mode resets everything at midnight
          is not said anywhere else. */}
      <SegmentPart
        name={t('admin.system.cardInstance')}
        helpText={`${t('settings.analyticsHelp')} ${t('settings.demoModeHelp')}`}
        helpMode="popover"
      >
        {/* Ein Ankreuzfeld traegt seine Beschriftung selbst - die wegzunehmen und rechts danebenzu-
            stellen waere hier keine Vereinfachung, sondern ein Klickziel weniger. */}
        <div className="adminRow adminRow--stack">
          <Checkbox checked={form.analyticsEnabled} onChange={(e) => setField('analyticsEnabled', e.target.checked)}>
            {t('settings.analyticsEnable')}
          </Checkbox>
          <Checkbox checked={form.demoMode} onChange={(e) => setField('demoMode', e.target.checked)}>
            {t('settings.demoModeEnable')}
          </Checkbox>
        </div>
      </SegmentPart>

      {/* Die einzige Karte der Seite, deren Hilfe stehen bleibt: sie traegt die Entscheidung, ob
          diese Instanz ihre Anmeldung aus der Hand gibt, und dazu eine Warnung. Eine Warnung, die
          man erst aufklappen muss, ist keine. */}
      <SegmentPart
        name={t('settings.proxyAuth')}
        helpText={
          <>
            {t('settings.proxyAuthHelp')}
            <span className="settingsShell__helpWarning">
              <IconAlertTriangle size="small" />
              <span>{t('settings.proxyAuthWarning')}</span>
            </span>
          </>
        }
      >
        <Checkbox checked={form.proxyAuthEnabled} onChange={(e) => setField('proxyAuthEnabled', e.target.checked)}>
          {t('settings.proxyAuthEnable')}
        </Checkbox>

        <div
          className={`settingsShell__subSettings${form.proxyAuthEnabled ? '' : ' settingsShell__subSettings--disabled'}`}
        >
          {PROXY_AUTH_FIELDS.map(({ name, secret }) => (
            <div className="settingsShell__subSetting" key={name}>
              <label className="settingsShell__subSetting__label" htmlFor={name}>
                {t(`settings.${name}`)}
              </label>
              <p className="settingsShell__subSetting__help">{t(`settings.${name}Help`)}</p>
              <Input
                id={name}
                type={secret ? 'password' : 'text'}
                mode={secret ? 'password' : undefined}
                autoComplete={secret ? 'new-password' : undefined}
                disabled={!form.proxyAuthEnabled}
                placeholder={t(`settings.${name}Placeholder`)}
                value={form[name]}
                onChange={(value) => setField(name, value)}
              />
            </div>
          ))}
        </div>
      </SegmentPart>

      <SettingsSaveBar
        dirty={systemDirty}
        saving={savingSystem}
        onSave={saveSystem}
        onDiscard={discardSystem}
        note={restartNeeded ? t('admin.system.saveRestartNote') : null}
      />
    </div>
  );
}

SystemPage.displayName = 'SystemPage';
