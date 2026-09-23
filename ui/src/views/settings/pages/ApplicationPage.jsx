/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  DatePicker,
  Input,
  InputNumber,
  Popover,
  Select,
  RadioGroup,
  Radio,
  TextArea,
  Tag,
  Toast,
  Typography,
} from '@douyinfe/semi-ui-19';
import { IconRefresh } from '@douyinfe/semi-icons';

import { SegmentPart } from '../../../components/segment/SegmentPart';
import SettingsSaveBar from '../../../components/settingsShell/SettingsSaveBar.jsx';
import { useUnsavedWarning } from '../../../hooks/useUnsavedWarning.js';
import { errorMessage } from '../../../services/xhr';
import { useActions, useSelector, useIsLoading } from '../../../services/state/store';
import { useTranslation } from '../../../services/i18n/i18n.jsx';
import { previewApplicationTemplate } from '../../../services/applicationClient.js';
import {
  LETTER_LANGUAGES,
  PLACEHOLDER_CATALOG,
  PLACEHOLDER_GROUPS,
} from '../../../services/application/placeholderCatalog.js';
import './ApplicationPage.less';

const { Text, Paragraph } = Typography;

/** Employment types the profile offers, matching the phrase tables the letters render from. */
const EMPLOYMENT_TYPES = ['permanent', 'temporary', 'selfEmployed', 'civilServant', 'student', 'retired'];

/** The tri-state questions. Unanswered is not the same as "no" and must stay tellable apart. */
const FLAGS = ['smoker', 'schufa', 'wbs', 'guarantor'];

/** How long typing pauses before the preview is re-rendered. */
const PREVIEW_DEBOUNCE_MS = 400;

const EMPTY_PREVIEW = { text: '', missing: [], unknown: [] };

/**
 * Everything that goes into an application letter: who is applying, and how the letter is worded.
 *
 * The two belong on one page because they only make sense together - a template is a set of
 * placeholders, and the profile is what fills them.
 *
 * The preview is rendered by the server, not here. The frontend may not import out of `lib/`, and
 * even if it could, a second implementation of the placeholder substitution would eventually
 * disagree with the one that writes the real letters. Only the placeholder catalogue is duplicated,
 * and `test/ui/applicationCatalogInSync.test.js` fails if the two copies drift.
 *
 * @returns {React.ReactElement}
 */
/**
 * The applicant profile with its empty answers left out, in a fixed key order, for comparing.
 *
 * A flag set and cleared again, or a date picked and removed, holds `null` or '' where the stored
 * profile has no key at all - and after an all-empty save the stored profile is `null`. Compared as
 * raw JSON those differ, and the save bar stayed up after a successful save.
 *
 * @param {Object|null|undefined} profile
 * @returns {Object}
 */
function compactProfile(profile) {
  return Object.fromEntries(
    Object.entries(profile ?? {})
      .filter(([, value]) => value != null && String(value).trim().length > 0)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

export default function ApplicationPage() {
  const t = useTranslation();
  const actions = useActions();

  const storedProfile = useSelector((state) => state.userSettings.settings.applicant_profile);
  const storedTemplates = useSelector((state) => state.userSettings.settings.application_templates);
  const savingProfile = useIsLoading(actions.userSettings.setApplicantProfile);
  const savingTemplates = useIsLoading(actions.userSettings.setApplicationTemplates);

  const [profile, setProfile] = useState({});
  const [overrides, setOverrides] = useState({});
  const [language, setLanguage] = useState(LETTER_LANGUAGES[0]);
  const [dealType, setDealType] = useState('rent');
  /** Shipped letters, cached per `language:dealType` as the server hands them over. */
  const [defaults, setDefaults] = useState({});
  const [preview, setPreview] = useState(EMPTY_PREVIEW);
  const editorRef = useRef(null);
  /**
   * What the preview on screen was rendered from: the slot, the draft, and which save it followed.
   *
   * The slot is in the key because two slots can hold the same text - one letter pasted into two
   * languages - and the numbers and dates in it are formatted per language. The save counter is in
   * it because the server renders against the *stored* profile, so filling the form in and saving
   * changes the preview without changing a character of the template.
   */
  const [previewFor, setPreviewFor] = useState(null);
  const [saveCount, setSaveCount] = useState(0);
  /**
   * Whether the placeholder list is open.
   *
   * Controlled rather than left to the Popover, because picking one has to close it. Uncontrolled
   * it stayed open over the preview after every insert, so the one thing you wanted to look at
   * afterwards - what the letter now reads like - was the thing it covered.
   */
  const [placeholdersOpen, setPlaceholdersOpen] = useState(false);

  useEffect(() => {
    setProfile(storedProfile ?? {});
  }, [storedProfile]);

  useEffect(() => {
    setOverrides(storedTemplates ?? {});
  }, [storedTemplates]);

  const slot = `${language}:${dealType}`;
  const shipped = defaults[slot];
  const override = overrides?.[language]?.[dealType];
  const currentTemplate = override ?? shipped ?? '';
  const isOverridden = typeof override === 'string';

  const previewKey = `${slot}|${saveCount}|${currentTemplate}`;

  // Ask the server for the shipped letter the first time a language and deal type are looked at.
  // Fetched even when the slot already has an override: the shipped text is what "reset" restores
  // and what an edited draft is compared against to decide the override can be dropped again.
  useEffect(() => {
    if (defaults[slot] !== undefined) return;
    let cancelled = false;
    previewApplicationTemplate({ template: null, language, dealType })
      .then((result) => {
        if (cancelled) return;
        setDefaults((previous) => ({ ...previous, [slot]: result.template }));
        // Only seed the preview when this slot has no draft of its own; otherwise the shipped
        // letter would flash up in place of what the user actually wrote.
        if (override == null) {
          setPreview(result);
          setPreviewFor(`${slot}|${saveCount}|${result.template}`);
        }
      })
      .catch((error) => {
        console.error('Error while trying to load the shipped application letter.', error);
        Toast.error(errorMessage(error, t('settings.application.previewError')));
      });
    return () => {
      cancelled = true;
    };
  }, [slot, language, dealType, defaults, override, saveCount, t]);

  // Re-render the preview once typing settles. Debounced rather than per keystroke: this is a
  // request per change, and a letter is written in bursts.
  useEffect(() => {
    // Nothing to render yet - a slot whose shipped letter is still in flight. Clearing rather than
    // leaving the last one up stops the previous tab's letter sitting under an empty editor.
    if (currentTemplate.length === 0) {
      setPreview(EMPTY_PREVIEW);
      return undefined;
    }
    if (previewKey === previewFor) return undefined;

    let cancelled = false;
    const timer = setTimeout(() => {
      previewApplicationTemplate({ template: currentTemplate, language, dealType })
        .then((result) => {
          if (cancelled) return;
          setPreviewFor(previewKey);
          setPreview(result);
        })
        .catch((error) => console.error('Error while trying to preview an application template.', error));
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [previewKey, previewFor, currentTemplate, language, dealType]);

  const field = (name) => (value) => setProfile((previous) => ({ ...previous, [name]: value }));

  /**
   * Store the edited template, or drop the override when it is back to the shipped wording.
   *
   * Dropping it rather than storing an identical copy is what makes "reset" meaningful, and what
   * lets a future improvement to the shipped letter reach users who never really changed it.
   *
   * @param {string} value
   */
  const setCurrentTemplate = (value) => {
    if (value === shipped) {
      resetCurrentTemplate();
      return;
    }
    setOverrides((previous) => ({
      ...previous,
      [language]: { ...(previous[language] ?? {}), [dealType]: value },
    }));
  };

  const resetCurrentTemplate = () =>
    setOverrides((previous) => {
      const perLanguage = { ...(previous[language] ?? {}) };
      delete perLanguage[dealType];
      const next = { ...previous };
      if (Object.keys(perLanguage).length === 0) {
        delete next[language];
      } else {
        next[language] = perLanguage;
      }
      return next;
    });

  /**
   * Drop a placeholder in at the cursor, which is the point of the chip list - hunting for the
   * exact spelling of `{{applicant.employmentType}}` in a table is not editing.
   *
   * @param {string} key
   */
  const insertPlaceholder = (key) => {
    setPlaceholdersOpen(false);
    const textarea = editorRef.current?.querySelector('textarea');
    const token = `{{${key}}}`;
    if (textarea == null) {
      setCurrentTemplate(`${currentTemplate}${token}`);
      return;
    }
    const start = textarea.selectionStart ?? currentTemplate.length;
    const end = textarea.selectionEnd ?? start;
    setCurrentTemplate(currentTemplate.slice(0, start) + token + currentTemplate.slice(end));

    // Replacing a controlled value drops the caret to the end, so clicking two chips in a row
    // would put the second one at the bottom of the letter instead of beside the first.
    const caret = start + token.length;
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(caret, caret);
    });
  };

  // Memoised because both sides can be large - six templates at up to 20 000 characters each - and
  // an unmemoised comparison runs on every keystroke in the editor.
  const profileDirty = useMemo(
    () => JSON.stringify(compactProfile(profile)) !== JSON.stringify(compactProfile(storedProfile)),
    [profile, storedProfile],
  );
  const templatesDirty = useMemo(
    () => JSON.stringify(overrides) !== JSON.stringify(storedTemplates ?? {}),
    [overrides, storedTemplates],
  );

  const dirty = profileDirty || templatesDirty;

  useUnsavedWarning(dirty);

  /**
   * Put the profile and the letter drafts back on what is stored.
   *
   * @returns {void}
   */
  const discard = () => {
    setProfile(storedProfile ?? {});
    setOverrides(storedTemplates ?? {});
  };

  const handleSave = async () => {
    try {
      if (profileDirty) {
        const anyValue = Object.values(profile).some((value) => value != null && String(value).trim().length > 0);
        await actions.userSettings.setApplicantProfile(anyValue ? profile : null);
      }
      if (templatesDirty) {
        await actions.userSettings.setApplicationTemplates(Object.keys(overrides).length > 0 ? overrides : null);
      }
      // The preview renders against the *stored* profile, so a save is the only thing that can
      // change it without the template changing. Bumping this is what re-asks for it.
      setSaveCount((previous) => previous + 1);
      Toast.success(t('settings.userSettingsSaved'));
    } catch (error) {
      Toast.error(errorMessage(error, t('settings.userSettingsSaveError')));
    }
  };

  /** Placeholder chips, in the catalogue's own groups. */
  const grouped = useMemo(() => {
    const groups = Object.fromEntries(PLACEHOLDER_GROUPS.map((group) => [group, []]));
    for (const [key, definition] of Object.entries(PLACEHOLDER_CATALOG)) {
      (groups[definition.group] ??= []).push(key);
    }
    return groups;
  }, []);

  return (
    <div className="settingsShell__page applicationPage">
      {/* The only place in the interface that connects this page to the button it feeds. */}
      <p className="settingsShell__pageIntro">{t('settings.application.pageIntro')}</p>
      <div className="settingsShell__groupTitle">{t('settings.application.groupProfile')}</div>
      <SegmentPart name={t('settings.application.contact')} helpText={t('settings.application.contactHelp')}>
        <div className="applicationPage__grid">
          <Input
            value={profile.firstName ?? ''}
            onChange={field('firstName')}
            placeholder={t('settings.application.firstName')}
            prefix={t('settings.application.firstName')}
          />
          <Input
            value={profile.lastName ?? ''}
            onChange={field('lastName')}
            placeholder={t('settings.application.lastName')}
            prefix={t('settings.application.lastName')}
          />
          <Input
            value={profile.street ?? ''}
            onChange={field('street')}
            placeholder={t('settings.application.street')}
            prefix={t('settings.application.street')}
          />
          <Input
            value={profile.zip ?? ''}
            onChange={field('zip')}
            placeholder={t('settings.application.zip')}
            prefix={t('settings.application.zip')}
          />
          <Input
            value={profile.city ?? ''}
            onChange={field('city')}
            placeholder={t('settings.application.city')}
            prefix={t('settings.application.city')}
          />
          <Input
            value={profile.phone ?? ''}
            onChange={field('phone')}
            placeholder={t('settings.application.phone')}
            prefix={t('settings.application.phone')}
          />
          <Input
            value={profile.email ?? ''}
            onChange={field('email')}
            placeholder={t('settings.application.email')}
            prefix={t('settings.application.email')}
          />
        </div>
      </SegmentPart>

      <SegmentPart name={t('settings.application.household')} helpText={t('settings.application.householdHelp')}>
        <div className="applicationPage__grid">
          <InputNumber
            value={profile.adults ?? null}
            onChange={field('adults')}
            min={0}
            max={20}
            prefix={t('settings.application.adults')}
            style={{ width: '100%' }}
          />
          <InputNumber
            value={profile.children ?? null}
            onChange={field('children')}
            min={0}
            max={20}
            prefix={t('settings.application.children')}
            style={{ width: '100%' }}
          />
          <Input
            value={profile.pets ?? ''}
            onChange={field('pets')}
            placeholder={t('settings.application.petsPlaceholder')}
            prefix={t('settings.application.pets')}
          />
        </div>
      </SegmentPart>

      <SegmentPart name={t('settings.application.occupation')} helpText={t('settings.application.occupationHelp')}>
        <div className="applicationPage__grid">
          <Input
            value={profile.occupation ?? ''}
            onChange={field('occupation')}
            placeholder={t('settings.application.occupationField')}
            prefix={t('settings.application.occupationField')}
          />
          <Input
            value={profile.employer ?? ''}
            onChange={field('employer')}
            placeholder={t('settings.application.employer')}
            prefix={t('settings.application.employer')}
          />
          <Select
            value={profile.employmentType ?? null}
            onChange={field('employmentType')}
            placeholder={t('settings.application.employmentType')}
            style={{ width: '100%' }}
            showClear
            optionList={EMPLOYMENT_TYPES.map((value) => ({
              value,
              label: t(`settings.application.employmentType.${value}`),
            }))}
          />
          <InputNumber
            value={profile.netIncome ?? null}
            onChange={field('netIncome')}
            min={0}
            step={100}
            prefix={t('settings.application.netIncome')}
            suffix="€"
            style={{ width: '100%' }}
          />
        </div>
      </SegmentPart>

      <SegmentPart name={t('settings.application.details')} helpText={t('settings.application.detailsHelp')}>
        <div className="applicationPage__grid">
          {/* Semi hands `onChange` two values; the string is the second one, and it is the one that
              is stored - the template still expects `yyyy-MM-dd`, and a Date object in the profile
              would serialise to something else. */}
          <DatePicker
            type="date"
            format="yyyy-MM-dd"
            value={profile.moveInDate || null}
            onChange={(_date, dateString) => field('moveInDate')(dateString || null)}
            placeholder={t('settings.application.moveInDate')}
            insetLabel={t('settings.application.moveInDate')}
            style={{ width: '100%' }}
          />
        </div>

        {/* Three states, not a checkbox: "no" and "not answered" produce different letters. A false
            for the smoking question puts "Nichtraucherhaushalt" in, while leaving it unanswered
            drops the line entirely. */}
        {FLAGS.map((flag) => (
          <div key={flag} className="applicationPage__flag">
            <Text>{t(`settings.application.flag.${flag}`)}</Text>
            <RadioGroup
              type="button"
              value={profile[flag] === true ? 'yes' : profile[flag] === false ? 'no' : 'unset'}
              onChange={(e) => field(flag)(e.target.value === 'unset' ? null : e.target.value === 'yes')}
            >
              <Radio value="unset">{t('settings.application.flagUnset')}</Radio>
              <Radio value="yes">{t('settings.application.flagYes')}</Radio>
              <Radio value="no">{t('settings.application.flagNo')}</Radio>
            </RadioGroup>
          </div>
        ))}

        <TextArea
          value={profile.extra ?? ''}
          onChange={field('extra')}
          autosize={{ minRows: 3, maxRows: 8 }}
          placeholder={t('settings.application.extraPlaceholder')}
          className="applicationPage__extra"
        />
      </SegmentPart>

      <div className="settingsShell__groupTitle">{t('settings.application.groupLetter')}</div>
      <SegmentPart
        name={t('settings.application.template')}
        helpText={`${t('settings.application.templateHelp')} ${t('settings.application.previewHelp')}`}
      >
        <div className="applicationPage__templateControls">
          <Select
            value={language}
            onChange={setLanguage}
            style={{ width: 180 }}
            optionList={LETTER_LANGUAGES.map((value) => ({ value, label: t(`application.language.${value}`) }))}
          />
          <RadioGroup type="button" value={dealType} onChange={(e) => setDealType(e.target.value)}>
            <Radio value="rent">{t('settings.application.dealTypeRent')}</Radio>
            <Radio value="buy">{t('settings.application.dealTypeBuy')}</Radio>
          </RadioGroup>

          {/* Gebraucht beim Schreiben, im Weg beim Lesen. Vier Gruppen mit ueber dreissig Chips
              standen dauerhaft zwischen dem Editor und dem, was er erzeugt. */}
          <Popover
            trigger="click"
            position="bottomLeft"
            visible={placeholdersOpen}
            onVisibleChange={setPlaceholdersOpen}
            content={
              <div className="applicationPage__placeholders">
                {PLACEHOLDER_GROUPS.map((group) => (
                  <div key={group} className="applicationPage__placeholderGroup">
                    <Text type="tertiary" size="small">
                      {t(`settings.application.group.${group}`)}
                    </Text>
                    <div className="applicationPage__chips">
                      {(grouped[group] ?? []).map((key) => (
                        <Tag key={key} onClick={() => insertPlaceholder(key)}>
                          {t(PLACEHOLDER_CATALOG[key].labelKey)}
                        </Tag>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            }
          >
            <Button theme="borderless" size="small">
              {t('settings.application.insertPlaceholder')}
            </Button>
          </Popover>

          <Button
            icon={<IconRefresh />}
            theme="borderless"
            size="small"
            disabled={!isOverridden}
            onClick={resetCurrentTemplate}
          >
            {t('settings.application.resetTemplate')}
          </Button>
        </div>

        {/* Direkt ueber dem Editor, der sie verursacht hat. Sie stand unter den Chips, also unter
            allem, was man beim Tippen gar nicht sieht. */}
        {preview.unknown.length > 0 && (
          <Paragraph type="warning" size="small" className="applicationPage__warning">
            {t('settings.application.unknownPlaceholders', { placeholders: preview.unknown.join(', ') })}
          </Paragraph>
        )}

        <div className="applicationPage__split">
          <div className="applicationPage__pane" ref={editorRef}>
            <span className="applicationPage__paneTitle">{t('settings.application.template')}</span>
            {/* Semi puts className on the wrapper, not on the textarea, so the editor's type has to
                be set through textareaStyle or it silently keeps the form default. */}
            <TextArea
              value={currentTemplate}
              onChange={setCurrentTemplate}
              autosize={{ minRows: 14, maxRows: 28 }}
              className="applicationPage__editor"
              textareaStyle={{ fontSize: 13, lineHeight: 1.55 }}
            />
          </div>

          <div className="applicationPage__pane">
            <span className="applicationPage__paneTitle">{t('settings.application.preview')}</span>
            <pre className="applicationPage__preview">{preview.text}</pre>
          </div>
        </div>
      </SegmentPart>

      <SettingsSaveBar
        dirty={dirty}
        saving={savingProfile || savingTemplates}
        onSave={handleSave}
        onDiscard={discard}
      />
    </div>
  );
}

ApplicationPage.displayName = 'ApplicationPage';
