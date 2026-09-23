/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useState } from 'react';
import { Checkbox, Select, Radio, RadioGroup, Toast, Typography } from '@douyinfe/semi-ui-19';
import { IconAlertTriangle, IconMoon, IconSun } from '@douyinfe/semi-icons';

import { SegmentPart } from '../../../components/segment/SegmentPart';
import SettingsSaveBar from '../../../components/settingsShell/SettingsSaveBar.jsx';
import { useUnsavedWarning } from '../../../hooks/useUnsavedWarning.js';
import { errorMessage } from '../../../services/xhr';
import { useActions, useSelector, useIsLoading } from '../../../services/state/store';
import { useTranslation, availableLanguages } from '../../../services/i18n/i18n.jsx';
import { normalizeTheme } from '../../../services/theme/theme.js';
import './PreferencesPage.less';

const { Text } = Typography;

/** The themes offered as a preview tile, in the order they are drawn. */
const THEME_TILES = Object.freeze(['dark', 'light']);

/** How far each arrow key moves within the tiles. Both axes, because the group is one row. */
const ARROW_STEPS = Object.freeze({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 });

/**
 * The two deletion modes, as data rather than as two hand-written blocks.
 *
 * They had grown a `<Text>` inside a `<Text>` inside a `<Radio>`, held together by two `<br/>`, and
 * the one line that actually matters - that a hard-deleted listing can come back - sat three levels
 * down. A table cannot drift the way two hand-written blocks do.
 *
 * @type {ReadonlyArray<{value: string, labelKey: string, descKey: string, warningKey: string|null}>}
 */
const DELETION_MODES = Object.freeze([
  {
    value: 'soft',
    labelKey: 'settings.listingDeletionSoftLabel',
    descKey: 'settings.listingDeletionSoftDesc',
    warningKey: null,
  },
  {
    value: 'hard',
    labelKey: 'settings.listingDeletionHardLabel',
    descKey: 'settings.listingDeletionHardDesc',
    warningKey: 'settings.listingDeletionHardConsequence',
  },
]);

/**
 * Appearance, language, and what deleting a listing should do.
 *
 * Theme and language apply the moment they are picked rather than waiting for the Save button.
 * Everything else on this page is batched, and the inconsistency is deliberate: a control whose
 * whole subject is how the interface looks, but which leaves it looking unchanged until you find a
 * button, is worse than the rule it breaks.
 *
 * @returns {React.ReactElement}
 */
export default function PreferencesPage() {
  const t = useTranslation();
  const actions = useActions();

  const language = useSelector((state) => state.userSettings.settings.language);
  // Normalised, the same way App reads it: an unknown stored value paints the default theme, and a
  // bare `??` left both tiles unchecked and without a tab stop.
  const theme = normalizeTheme(useSelector((state) => state.userSettings.settings.theme));
  const listingDeletionPreference = useSelector((state) => state.userSettings.settings.listing_deletion_preference);
  const savingLanguage = useIsLoading(actions.userSettings.setLanguage);
  const savingTheme = useIsLoading(actions.userSettings.setTheme);
  const saving = useIsLoading(actions.userSettings.setListingDeletionPreference);

  const [hardDelete, setHardDelete] = useState(false);
  const [skipPrompt, setSkipPrompt] = useState(false);

  /**
   * Put the form back on what is stored. The same line the effect below runs on arrival, which is
   * why both call it rather than spelling it out twice.
   *
   * @returns {void}
   */
  const discard = () => {
    setHardDelete(listingDeletionPreference?.hardDelete ?? false);
    setSkipPrompt(listingDeletionPreference?.skipPrompt ?? false);
  };

  useEffect(discard, [listingDeletionPreference]);

  const dirty =
    hardDelete !== (listingDeletionPreference?.hardDelete ?? false) ||
    skipPrompt !== (listingDeletionPreference?.skipPrompt ?? false);

  useUnsavedWarning(dirty);

  /**
   * Switch to a theme, whether that came from a click or from an arrow key.
   *
   * @param {string} value
   * @returns {Promise<void>}
   */
  const pickTheme = async (value) => {
    try {
      await actions.userSettings.setTheme(value);
    } catch (error) {
      Toast.error(errorMessage(error, t('settings.themeSaveError')));
    }
  };

  const handleSave = async () => {
    try {
      await actions.userSettings.setListingDeletionPreference({ skipPrompt, hardDelete });
      Toast.success(t('settings.userSettingsSaved'));
    } catch (error) {
      Toast.error(errorMessage(error, t('settings.userSettingsSaveError')));
    }
  };

  return (
    <div className="settingsShell__page">
      <SegmentPart
        name={t('settings.appearance')}
        helpText={t('settings.appearanceHelp')}
        className="preferencesPage__appearance"
      >
        <span className="settingsShell__instant">
          <span className="settingsShell__instantDot" aria-hidden="true" />
          {t('settings.appliesImmediately')}
        </span>

        {/* A radiogroup is a single tab stop whose members are reached with the arrow keys, so the
            tile that is not current is taken out of the tab order and the arrows move between
            them. Without that the role would promise a screen reader a navigation the tiles do not
            have - they are buttons, and buttons do not answer arrow keys on their own. */}
        <div className="preferencesPage__themes" role="radiogroup" aria-label={t('settings.theme')}>
          {THEME_TILES.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={theme === value}
              tabIndex={theme === value ? 0 : -1}
              disabled={savingTheme}
              className={`preferencesPage__theme${theme === value ? ' preferencesPage__theme--on' : ''}`}
              onKeyDown={(event) => {
                const step = ARROW_STEPS[event.key];
                if (step == null) {
                  return;
                }
                event.preventDefault();
                const next = THEME_TILES[(THEME_TILES.indexOf(value) + step + THEME_TILES.length) % THEME_TILES.length];
                // The focus follows the selection, which is what the pattern asks for when picking
                // is as cheap as this one is: the theme is already applied by the time you land.
                event.currentTarget.parentElement?.children[THEME_TILES.indexOf(next)]?.focus();
                pickTheme(next);
              }}
              onClick={() => pickTheme(value)}
            >
              <span className={`preferencesPage__swatch preferencesPage__swatch--${value}`} aria-hidden="true">
                <span className="preferencesPage__swatchSide" />
                <span className="preferencesPage__swatchLine" />
                <span className="preferencesPage__swatchLine preferencesPage__swatchLine--short" />
              </span>
              <span className="preferencesPage__themeName">
                {value === 'dark' ? <IconMoon size="small" /> : <IconSun size="small" />}
                {t(value === 'dark' ? 'settings.themeDark' : 'settings.themeLight')}
              </span>
            </button>
          ))}
        </div>

        <div className="preferencesPage__language">
          <Text className="preferencesPage__languageLabel">{t('settings.language')}</Text>
          <Select
            style={{ width: 200 }}
            value={language ?? 'en'}
            disabled={savingLanguage}
            optionList={availableLanguages.map((lang) => ({ label: `${lang.flag} ${lang.name}`, value: lang.code }))}
            onChange={async (code) => {
              try {
                await actions.userSettings.setLanguage(code);
              } catch (error) {
                Toast.error(errorMessage(error, t('settings.languageSaveError')));
              }
            }}
          />
        </div>
      </SegmentPart>

      <SegmentPart name={t('settings.listingDeletion')} helpText={t('settings.listingDeletionHelp')}>
        <RadioGroup
          value={hardDelete ? 'hard' : 'soft'}
          onChange={(e) => setHardDelete(e.target.value === 'hard')}
          className="preferencesPage__modes"
        >
          {DELETION_MODES.map((mode) => (
            <Radio key={mode.value} value={mode.value} className="preferencesPage__mode">
              <span className="preferencesPage__modeName">{t(mode.labelKey)}</span>
              <span className="preferencesPage__modeDesc">{t(mode.descKey)}</span>
              {mode.warningKey && (
                <span className="preferencesPage__modeWarning">
                  <IconAlertTriangle size="small" />
                  {t(mode.warningKey)}
                </span>
              )}
            </Radio>
          ))}
        </RadioGroup>

        <div className="preferencesPage__skipPrompt">
          <Checkbox checked={skipPrompt} onChange={(e) => setSkipPrompt(e.target.checked)}>
            {t('settings.listingDeletionSkipPrompt')}
          </Checkbox>
        </div>
      </SegmentPart>

      <SettingsSaveBar dirty={dirty} saving={saving} onSave={handleSave} onDiscard={discard} />
    </div>
  );
}

PreferencesPage.displayName = 'PreferencesPage';
