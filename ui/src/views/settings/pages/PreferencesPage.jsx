/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useState } from 'react';
import { Button, Checkbox, Select, Radio, RadioGroup, Toast, Typography } from '@douyinfe/semi-ui-19';
import { IconSave, IconMoon, IconSun } from '@douyinfe/semi-icons';

import { SegmentPart } from '../../../components/segment/SegmentPart';
import { errorMessage } from '../../../services/xhr';
import { useActions, useSelector, useIsLoading } from '../../../services/state/store';
import { useTranslation, availableLanguages } from '../../../services/i18n/i18n.jsx';
import { DEFAULT_THEME } from '../../../services/theme/theme.js';

const { Text } = Typography;

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
  const theme = useSelector((state) => state.userSettings.settings.theme) ?? DEFAULT_THEME;
  const listingDeletionPreference = useSelector((state) => state.userSettings.settings.listing_deletion_preference);
  const savingLanguage = useIsLoading(actions.userSettings.setLanguage);
  const savingTheme = useIsLoading(actions.userSettings.setTheme);
  const saving = useIsLoading(actions.userSettings.setListingDeletionPreference);

  const [hardDelete, setHardDelete] = useState(false);
  const [skipPrompt, setSkipPrompt] = useState(false);

  useEffect(() => {
    setHardDelete(listingDeletionPreference?.hardDelete ?? false);
    setSkipPrompt(listingDeletionPreference?.skipPrompt ?? false);
  }, [listingDeletionPreference]);

  const dirty =
    hardDelete !== (listingDeletionPreference?.hardDelete ?? false) ||
    skipPrompt !== (listingDeletionPreference?.skipPrompt ?? false);

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
      <SegmentPart name={t('settings.theme')} helpText={t('settings.themeHelp')}>
        <RadioGroup
          type="button"
          value={theme}
          onChange={async (e) => {
            try {
              await actions.userSettings.setTheme(e.target.value);
            } catch (error) {
              Toast.error(errorMessage(error, t('settings.themeSaveError')));
            }
          }}
        >
          <Radio value="dark" disabled={savingTheme}>
            <IconMoon size="small" style={{ marginRight: 6 }} />
            {t('settings.themeDark')}
          </Radio>
          <Radio value="light" disabled={savingTheme}>
            <IconSun size="small" style={{ marginRight: 6 }} />
            {t('settings.themeLight')}
          </Radio>
        </RadioGroup>
      </SegmentPart>

      <SegmentPart name={t('settings.language')} helpText={t('settings.languageHelp')}>
        <Select
          style={{ width: 240 }}
          value={language ?? 'en'}
          disabled={savingLanguage}

          optionList={availableLanguages.map((lang) => ({
            label: `${lang.flag} ${lang.name}`,
            value: lang.code,
          }))}
          onChange={async (code) => {
            try {
              await actions.userSettings.setLanguage(code);
            } catch (error) {
              Toast.error(errorMessage(error, t('settings.languageSaveError')));
            }
          }}
        />
      </SegmentPart>

      <SegmentPart name={t('settings.listingDeletion')} helpText={t('settings.listingDeletionHelp')}>
        <RadioGroup value={hardDelete ? 'hard' : 'soft'} onChange={(e) => setHardDelete(e.target.value === 'hard')}>
          <Radio value="soft">
            <div>
              <Text strong>{t('settings.listingDeletionSoftLabel')}</Text>
              <br />
              <Text type="secondary">{t('settings.listingDeletionSoftDesc')}</Text>
            </div>
          </Radio>
          <Radio value="hard">
            <div>
              <Text strong>{t('settings.listingDeletionHardLabel')}</Text>
              <br />
              <Text type="secondary">
                {t('settings.listingDeletionHardDesc')}
                <br />
                <Text type="warning">{t('settings.listingDeletionHardConsequence')}</Text>
              </Text>
            </div>
          </Radio>
        </RadioGroup>
        <Checkbox checked={skipPrompt} onChange={(e) => setSkipPrompt(e.target.checked)} style={{ marginTop: 12 }}>
          {t('settings.listingDeletionSkipPrompt')}
        </Checkbox>
      </SegmentPart>

      <div className="settingsShell__saveRow">
        <Button
          icon={<IconSave />}
          theme="solid"
          type="primary"
          onClick={handleSave}
          disabled={!dirty}
          loading={saving}
        >
          {t('settings.save')}
        </Button>
      </div>
    </div>
  );
}

PreferencesPage.displayName = 'PreferencesPage';
