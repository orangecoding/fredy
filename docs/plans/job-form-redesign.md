# Job-Formular und seine drei Dialoge

Umbau von `ui/src/views/jobs/mutation/` samt `ProviderTable`, `ProviderMutator`,
`NotificationChannelPicker` und `NotificationChannelEditor`.

Der Ledger steht in `job-form-redesign.progress.md`. Abschnitt 0 ist der Arbeitsvertrag,
Abschnitt 3 der vollständige Befund mit Belegen, Abschnitt 4 sind die fünfzehn Schritte.

---

## 0 Arbeitsvertrag

Diese zehn Regeln gelten für jeden Schritt. Sie sind nicht verhandelbar und sie sind der Grund,
warum dieser Plan so lang ist.

1. **Ein Schritt, ein Commit, ein Häkchen.** Nach jedem Schritt wird `job-form-redesign.progress.md`
   aktualisiert, bevor irgendetwas anderes passiert. Wer zwei Schritte bündelt, macht den Ledger
   wertlos.
2. **Keine Farbe, kein Abstand, keine Schriftgröße im Markup.** Kein `style={{ color: … }}`,
   kein `style={{ marginBottom: … }}`, kein `style={{ fontSize: … }}`. Breiten und Höhen, die eine
   Komponente von außen bekommen muss (`Modal` `style={{ width }}`), bleiben erlaubt.
3. **Farbliterale ausschließlich in `ui/src/themes.less`.** Jede andere Datei benutzt
   `@color-*` aus `tokens.less`. `test/ui/theme.test.js` prüft, dass jedes Token in beiden
   Theme-Blöcken steht.
4. **Semis Palette ist verboten.** `var(--semi-color-*)` darf in keiner Datei stehen, die dieser
   Plan anfasst. Sie ist unsichtbar für `theme.test.js` und folgt nicht Fredys Themen.
5. **Jeder Abstand aus der Skala.** `@space-1` bis `@space-12`. Keine `rem`, keine `px` für
   `gap`, `margin`, `padding`. Ausnahmen: Prozentwerte, `100%`, `0`, `auto`, `1px` für Rahmen,
   `max-height` in `vh`, und die drei Pixelmaße, die Schritt 13 ausdrücklich erlaubt.
6. **Jede Schriftgröße aus der Skala.** `@text-xs` 11, `@text-sm` 12, `@text-base` 14,
   `@text-md` 16, `@text-lg` 20, `@text-xl` 24. `13px` gibt es nicht.
7. **Eine Primäraktion je Fläche.** Genau ein gefüllter Akzentknopf pro Karte, pro Dialog, pro
   Fußzeile. Alles andere ist `tertiary` oder `borderless`. `type="secondary"` ist Semis Blau und
   kommt in Fredy nicht vor.
8. **Kein `float` für Layout.** Flex oder Grid.
9. **Kein neuer globaler Selektor.** Eine Regel, die mit `.semi-` beginnt, steht entweder unter
   einer eigenen Klasse oder sie wird über `dropdownClassName` bzw. `className` an genau die
   Instanz gebunden, die sie meint.
10. **Kommentare, die nicht mehr stimmen, werden korrigiert, nicht gelöscht.** Die Begründung ist
    der Wert; falsche Zahlen darin sind ein Fehler wie jeder andere.

---

## 1 Was schon dasteht

Aus dem Einstellungs- und dem Admin-Umbau existieren diese Bausteine bereits. Sie werden benutzt,
nicht neu gebaut.

| Datei | Was sie kann |
|---|---|
| `ui/src/components/settingsShell/SettingsEmptyState.jsx` | `{ icon, title, description, action }`. Symbol, Titel, ein Satz, ein Knopf. |
| `ui/src/components/settingsShell/SettingsEmptyState.less` | Zentriert, `@space-6 @space-4`, `@color-elevated`-Kreis. |
| `ui/src/components/segment/SegmentPart.jsx` | Prop `action` landet als `headerExtraContent` rechts im Kartenkopf. `helpMode="popover"`. |
| `ui/src/components/table/NotificationChannelTable.jsx` | Prop `emptyText`, Prop `actions` mit `add`, `test`, `edit`, `clone`, `detach`. |
| `ui/src/services/jobs/jobValidation.js` | `JOB_REQUIREMENTS`, `missingRequirements`, `canSaveJob`. |
| `ui/src/components/notificationAdapter/…/NotificationHelpDisplay.less` | Bereits vollständig auf Tokens. Wird nicht angefasst. |

Prüfe vor Schritt 4, dass `SettingsEmptyState.jsx` existiert. Falls nicht, wurde der
Einstellungs-Plan nie ausgeführt: dann zuerst diese Komponente aus jenem Plan anlegen.

---

## 2 Tokens

**In diesem Plan wird kein einziges neues Token angelegt.** Alles, was gebraucht wird, steht
bereits in `tokens.less`: `@color-warning` für die Bereitschaftsleiste, `@color-success` für ihren
Fertig-Zustand, `@color-error` für Feldfehler, `@color-accent-dim` für die Filterleiste.

`@color-faint` wird in diesem Plan nirgends neu gesetzt. Es liegt bei 2,47:1 auf `@color-base`
(dunkel) und 2,88:1 (hell) und besteht AA nicht. Wo Text heute `@color-faint` trägt und dieser
Plan die Zeile ohnehin anfasst, wird `@color-muted` daraus (5,43:1 dunkel, 6,12:1 hell).

---

## 3 Befund

Alles hier ist nachgelesen, nicht vermutet. Zeilennummern beziehen sich auf den Stand vor
Schritt 1.

### 3.1 Zwei Dateien beschreiben eine Lösung, die nie gebaut wurde

`ui/src/services/jobs/jobValidation.js`, Zeilen 9 bis 11:

```
 * A list of named rules rather than one boolean expression: each rule stands on its own, is tested
 * on its own, and reads in the order the sections appear in the form. The form itself only asks
 * whether the list is empty - the Save button is disabled until it is, and says nothing about why.
```

`ui/src/views/jobs/mutation/JobMutation.jsx`, Zeilen 234 bis 236:

```js
// A list, not a boolean. A disabled Save with nothing explaining it leaves the user hunting
// through eight sections for whichever one is incomplete.
const missing = missingRequirements({ name, dealType, providerData, selectedChannels });
```

Und die einzige Verwendung von `missing`, Zeile 614:

```jsx
<Button type="primary" icon={<IconPlusCircle />} disabled={missing.length > 0} onClick={mutateJob}>
```

Vier benannte Regeln liegen fertig vor, vier mögliche Gründe für einen gesperrten Knopf, und der
Benutzer bekommt keinen davon zu sehen. Das ist der eigentliche Befund dieser Seite.

Nebenbei: der Kommentar sagt „eight sections“. `JobMutation.jsx` rendert zehn `SegmentPart`,
sieben davon ohne einen Klick sichtbar. Schritt 2 korrigiert das mit.

### 3.2 Zwei leere Tabellen als Leerzustand für Pflichtschritte

Ohne Anbieter zeigt das Formular eine Tabelle mit den Köpfen „Name“ und „URL“ und darunter
„Keine Anbieter gefunden.“ (`provider.tableEmptyState`). Ohne Kanal dieselbe Form mit „Kanal“,
„Typ“, „Ziel“ und einem Satz (`notification.channels.emptyInJob`).

Beides sind Pflichtangaben. Beides ist der Normalfall beim ersten Anlegen. Und beides sieht aus
wie ein leeres Suchergebnis statt wie der nächste Schritt.

### 3.3 Ein globaler Selektor, und warum er da ist

`JobMutation.less`, Zeilen 37 bis 39, auf oberster Ebene:

```less
.semi-select-option-list-wrapper {
  width: 25rem;
}
```

Sobald das Job-Formular einmal geladen wurde, ist jede Auswahlliste der gesamten Anwendung
25 rem breit: die Sprache in den Einstellungen, die Zeitzone in der Administration, die
Job-Auswahl auf der Karte.

Die Ursache steht in `ProviderMutator.less`, Zeilen 45 bis 47:

```less
.providerMutator .semi-select-option-list-wrapper {
  width: 100%;
}
```

Diese Regel kann grundsätzlich nicht greifen, aus zwei unabhängigen Gründen:

1. Kein Element im Dialog trägt die Klasse `providerMutator`. Es gibt nur
   `providerMutator__steps`, `providerMutator__fields`, `providerMutator__openLink` und
   `providerMutator__url`. Nachgeprüft: `grep -rn "className=\"providerMutator\"" ui/src` liefert
   nichts.
2. Semi rendert die Aufklappliste per Portal an `document.body`, also außerhalb jedes
   Modal-Teilbaums. Ein Nachfahrenselektor von innerhalb des Dialogs erreicht sie nie.

Jemand hat also eine Regel geschrieben, gesehen dass sie nichts tut, und sie global wiederholt.
Semis `Select` kennt `dropdownClassName` (`node_modules/@douyinfe/semi-ui-19/lib/es/select/index.d.ts`,
Zeile 116). Damit trifft eine gescopte Regel die Portal-Liste tatsächlich.

### 3.4 Knopffarben

Im Kanal-Abschnitt stehen zwei Knöpfe nebeneinander, Zeilen 423 bis 440:

```jsx
<Button type="primary" className="jobMutation__newButton" icon={<IconPlusCircle />} …>
<Button type="secondary" icon={<IconSetting />} className="jobMutation__newButton" …>
```

`type="secondary"` ist Semis Blau. Es kommt in Fredy sonst nirgends als Aktionsfarbe vor.

In `ProviderTable.jsx`, Zeilen 34 bis 38, dasselbe Blau gefüllt neben einem gefüllten Rot:

```jsx
<div style={{ float: 'right' }}>
  <Button type="secondary" icon={<IconEdit />} onClick={() => onEdit(record)} />
  <div style={{ display: 'inline-block', width: '16px' }} />
  <Button type="danger" icon={<IconDelete />} onClick={() => onRemove(record.url)} />
</div>
```

Ein leeres `div` als Abstandhalter, ein `float` als Ausrichtung, und die harmlose Aktion ist die
auffälligere von beiden. Die Spalte trägt zudem `title: ''` — eine Spalte ohne Kopf.

In `NotificationChannelEditor.jsx`, Zeilen 176 bis 188, drei Knöpfe in drei Gewichten, einer davon
per `float`:

```jsx
<Button type="secondary" style={{ float: 'left' }} onClick={test}>
<Button theme="light" type="tertiary" onClick={onClose}>
<Button theme="solid" type="primary" loading={saving} onClick={save}>
```

### 3.5 `float` als Layout

`JobMutation.less`, Zeilen 4 bis 7:

```less
&__newButton {
  float: right;
  margin-bottom: @space-4;
}
```

Die Klasse hängt an drei Knöpfen. Zwei davon stehen in `.jobMutation__notificationActions`, einem
Flex-Container, in dem `float` wirkungslos ist. Die Klasse tut also an zwei von drei Stellen etwas
anderes als ihr Name sagt.

Dazu `.jobMutation__actions` (Zeilen 29 bis 34), das nirgends benutzt wird.

### 3.6 Der Kommentar über dem Fold stimmt nicht

`JobMutation.jsx`, Zeilen 344 bis 346:

```jsx
{/* The three things a job cannot exist without, and nothing else. Everything optional is
    folded away below, so the shortest path to a working job is a straight read down this
    column rather than a scroll past nine open cards. */}
```

Es sind vier Pflichtangaben, nicht drei (`JOB_REQUIREMENTS` hat vier Einträge). Und „everything
optional is folded away below“ stimmt nicht: „Mit Benutzer teilen“ und „Job-Aktivierung“ stehen
außerhalb des Folds, mit eigener Begründung in Zeile 566.

### 3.7 Die drei Dialoge benutzen Semis Palette

`NotificationChannelPicker.less` importiert `tokens.less` gar nicht erst und färbt mit
`var(--semi-color-text-1)`, `var(--semi-color-text-2)` und `var(--semi-color-primary)`.
`NotificationChannelEditor.less` ebenso, mit `var(--semi-color-text-0)` und
`var(--semi-color-text-2)`.

`test/ui/theme.test.js` prüft, dass jedes `--f-*`-Token in beiden Theme-Blöcken definiert ist.
Über Semis Variablen weiß der Test nichts, also fallen diese beiden Dateien durch jede
Theme-Prüfung, die es im Projekt gibt.

Freie Maße in denselben zwei Dateien: `13px`, `0.75rem`, `1rem`, `0.5rem`, `0.85rem`, `0.25rem`,
`14px`, `20px`, `12px`, sowie die Dialogbreiten `46rem` und `50rem`. `13px` liegt auf keiner Stufe
der Typoskala.

### 3.8 Eine Liste, als HTML zusammengeklebt

`NotificationChannelEditor.jsx`, Zeilen 122 bis 124 und 231:

```js
const problems = validateChannel(draft, adapterConfig, t);
if (problems.length > 0) {
  setValidationMessage(problems.join('<br/>'));
```

```jsx
description={<p dangerouslySetInnerHTML={{ __html: validationMessage }} />}
```

Derselbe Fehler wie in 3.1: ein Array liegt vor, wird zu einem String verklebt und dann als HTML
wieder auseinandergenommen. `dangerouslySetInnerHTML` ist hier nicht nötig, weil die einzige
HTML-Auszeichnung das selbst eingefügte `<br/>` ist.

### 3.9 „Portal“ statt „Anbieter“

`ui/src/locales/de.json`:

- `provider.step1` = „Wähle unten das **Portal** und öffne es in einem neuen Tab.“
- `provider.validationWrongHost` = „… Kopiere die Ergebnisseite des oben gewählten **Portals**.“

Die Oberfläche sagt sonst überall „Anbieter“. Betroffen ist nur die deutsche Datei; die anderen
vier Sprachen benutzen ihre eigenen Wörter und bleiben unangetastet.

### 3.10 Der Entwurfs-Banner bleibt

`draftRestored` zeigt einen `<Banner type="info">`. Das ist kein dauerhaft wahrer Satz, sondern
die Meldung über ein Ereignis, das gerade stattgefunden hat, mit einer Aktion daneben. Er bleibt,
er bekommt nur seinen Inline-Abstand abgenommen.

### 3.11 Was NICHT kaputt ist

Damit niemand daran herumbaut:

- `keepDOM={false}` am `Collapse`. Die Begründung in Zeile 464 ist richtig: der Gebietsfilter
  montiert eine MapLibre-Leinwand.
- Der Entwurf im Speicher (`jobDraft.js`) samt Wiederherstellung. Die Begründung in Zeile 134 ist
  richtig und der Grund, warum der Umweg über die Einstellungen nichts wegwirft.
- Das Ableiten von `selectedChannels` aus `selectedChannelIds` bei jedem Render. Die Begründung in
  Zeile 102 beschreibt einen echten Fehler, der damit behoben wurde.
- `helpMode="popover"` an allen Abschnitten.
- `NotificationHelpDisplay` samt Stylesheet. Bereits vollständig auf Tokens, mit sauberer
  Begründung.
- Die Position von „Mieten oder Kaufen“ direkt unter den Anbietern. Der Kommentar in Zeile 394
  sagt warum: der Hinweis „aus deiner Such-URL übernommen“ muss neben dem stehen, woraus geraten
  wurde. Dieser Abschnitt wird **nicht** nach oben zu „Name“ verschoben.

---

## 4 Die Schritte

### Schritt 1 — Ledger anlegen

Lege `docs/plans/job-form-redesign.progress.md` an (Inhalt siehe eigene Datei) und hake Schritt 1 ab.

---

### Schritt 2 — Die Bereitschaftsleiste

Das Herzstück. Die Liste, die `missingRequirements` seit jeher zurückgibt, wird sichtbar.

#### 2.1 Anker: `ui/src/views/jobs/mutation/jobSections.js` (neu)

```js
/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Which section of the form each requirement is satisfied in.
 *
 * The keys are those of `JOB_REQUIREMENTS`; `test/ui/jobFormView.test.js` asserts that every
 * requirement has an entry here, so a fifth rule cannot be added without a place to send the user.
 *
 * Name and deal type live in different cards, but both are one short field, so the anchor is the
 * card itself rather than the input: scrolling a two-line card into view shows the whole of what
 * is missing, scrolling an input into view shows an input with no label above it.
 *
 * @type {Record<string, string>}
 */
export const SECTION_BY_REQUIREMENT = {
  name: 'jobSection-name',
  dealType: 'jobSection-dealType',
  provider: 'jobSection-provider',
  channel: 'jobSection-channel',
};

/**
 * Scroll a section of the form into view.
 *
 * `auto` rather than `smooth` when the user asked for less motion: this is a jump across a long
 * form, which is exactly the kind of movement that setting exists for.
 *
 * @param {string} sectionId
 * @returns {void}
 */
export function scrollToSection(sectionId) {
  const target = document.getElementById(sectionId);
  if (target == null) return;

  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
}
```

#### 2.2 `ui/src/views/jobs/mutation/JobReadinessBar.jsx` (neu)

```jsx
/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { IconAlertTriangle, IconTickCircle } from '@douyinfe/semi-icons';

import { SECTION_BY_REQUIREMENT, scrollToSection } from './jobSections.js';
import { useTranslation } from '../../../services/i18n/i18n.jsx';

import './JobReadinessBar.less';

/**
 * What is still missing before this job can be saved.
 *
 * `missingRequirements` has always returned a list of named rules and the form has always thrown
 * it away, keeping only `length > 0` to disable the Save button. Both files said so in their own
 * comments for months. This is that list, rendered.
 *
 * Each entry is a button rather than a label: the section it names can be several screens away, and
 * a user who has just been told that a provider is missing should not then have to find it.
 *
 * @param {Object} props
 * @param {{ key: string }[]} props.missing Straight from `missingRequirements`.
 * @param {(sectionId: string) => void} [props.onJump] Called after scrolling, with the section id.
 * @returns {React.ReactElement}
 */
export default function JobReadinessBar({ missing = [], onJump }) {
  const t = useTranslation();
  const ready = missing.length === 0;

  const jump = (sectionId) => {
    scrollToSection(sectionId);
    onJump?.(sectionId);
  };

  return (
    <div className={`jobReadiness${ready ? ' jobReadiness--ready' : ''}`} aria-live="polite">
      <span className="jobReadiness__icon" aria-hidden="true">
        {ready ? <IconTickCircle /> : <IconAlertTriangle />}
      </span>

      <span className="jobReadiness__label">
        {ready
          ? t('jobs.mutation.readyAll')
          : missing.length === 1
            ? t('jobs.mutation.missingOne')
            : t('jobs.mutation.missingMany', { count: missing.length })}
      </span>

      {!ready && (
        <span className="jobReadiness__items">
          {missing.map((requirement) => {
            const label = t(`jobs.mutation.requirement.${requirement.key}`);
            return (
              <button
                key={requirement.key}
                type="button"
                className="jobReadiness__item"
                aria-label={t('jobs.mutation.jumpTo', { name: label })}
                onClick={() => jump(SECTION_BY_REQUIREMENT[requirement.key])}
              >
                {label}
              </button>
            );
          })}
        </span>
      )}
    </div>
  );
}

JobReadinessBar.displayName = 'JobReadinessBar';
```

#### 2.3 `ui/src/views/jobs/mutation/JobReadinessBar.less` (neu)

```less
/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

@import '../../../tokens.less';

/* Directly above the two footer buttons, because that is where the question "why can I not save"
   is asked. Warning rather than error: nothing is wrong, something is not finished yet. */
.jobReadiness {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: @space-2 @space-3;
  margin-bottom: @space-4;
  padding: @space-3 @space-4;
  border: 1px solid @color-warning;
  border-radius: @radius-card;
  background: @color-fill-subtle;

  &__icon {
    display: inline-flex;
    flex: none;
    color: @color-warning;
  }

  &__label {
    font-size: @text-base;
    font-weight: 600;
    color: @color-text;
  }

  &__items {
    display: flex;
    flex-wrap: wrap;
    gap: @space-2;
  }

  /* A real button: it moves the page, so it is a control and gets the keyboard and the focus ring
     that go with one. */
  &__item {
    padding: @space-1 @space-3;
    border: 1px solid @color-border-bright;
    border-radius: @radius-pill;
    background: @color-elevated;
    color: @color-text;
    font-family: @font-ui;
    font-size: @text-sm;
    font-weight: 500;
    cursor: pointer;
    transition: border-color @transition-fast;

    &:hover {
      border-color: @color-warning;
    }

    &:focus-visible {
      outline: 2px solid @color-accent;
      outline-offset: 2px;
    }
  }

  /* Nothing left to do: the bar stops being a list and becomes one line of confirmation, and Save
     next to it is the only filled control on the page. */
  &--ready {
    border-color: @color-success;
    background: @color-success-dim;
  }

  &--ready &__icon {
    color: @color-success;
  }

  @media (prefers-reduced-motion: reduce) {
    &__item {
      transition: none;
    }
  }
}
```

#### 2.4 Anker und Hervorhebung in `JobMutation.less`

Ans Ende der Datei, hinter `.jobMutation__footerActions`:

```less
/* The four sections the readiness bar can jump to. `scroll-margin-top` keeps the card clear of the
   sticky header instead of landing under it. */
.jobMutation__anchor {
  scroll-margin-top: @space-12;
}

/* Two seconds of outline after a jump. Without it the page moves and nothing says which of the six
   cards now on screen was the one meant. */
.jobMutation__anchor--highlight .semi-card {
  outline: 2px solid @color-warning;
  outline-offset: 2px;
  border-radius: @radius-card;
}
```

#### 2.5 `JobMutation.jsx`

Import ergänzen:

```js
import JobReadinessBar from './JobReadinessBar.jsx';
import { SECTION_BY_REQUIREMENT } from './jobSections.js';
```

Zustand, direkt hinter `const [refineOpen, setRefineOpen] = useState(false);`:

```js
/** Which section the readiness bar last jumped to, so it can be marked for a moment. */
const [highlighted, setHighlighted] = useState(null);

useEffect(() => {
  if (highlighted == null) return undefined;
  const timer = setTimeout(() => setHighlighted(null), 2000);
  return () => clearTimeout(timer);
}, [highlighted]);
```

Der Kommentar über `missing` wird korrigiert (Regel 10). Alt:

```js
// A list, not a boolean. A disabled Save with nothing explaining it leaves the user hunting
// through eight sections for whichever one is incomplete.
```

Neu:

```js
// A list, not a boolean. It is rendered as one by the readiness bar above the footer: a disabled
// Save with nothing explaining it left the user hunting through ten sections, seven of them
// visible without a click, for whichever one was incomplete.
```

Eine kleine Hilfe, direkt darunter:

```js
/**
 * The wrapper that makes a section a jump target for the readiness bar.
 *
 * @param {string} requirementKey
 * @returns {{ id: string, className: string }}
 */
const anchorProps = (requirementKey) => {
  const id = SECTION_BY_REQUIREMENT[requirementKey];
  return {
    id,
    className: `jobMutation__anchor${highlighted === id ? ' jobMutation__anchor--highlight' : ''}`,
  };
};
```

Die vier Pflicht-Abschnitte werden in genau dieses `div` gewickelt. Beispiel für „Name“:

```jsx
<div {...anchorProps('name')}>
  <SegmentPart
    name={t('jobs.mutation.sectionName')}
    Icon={IconPaperclip}
    helpText={t('jobs.mutation.nameHelp')}
    helpMode="popover"
  >
    …unverändert…
  </SegmentPart>
</div>
```

Genauso für `'provider'` (Anbieter), `'dealType'` (Mieten oder Kaufen) und `'channel'`
(Benachrichtigungskanäle). Die übrigen Abschnitte bekommen kein `div`.

Die Fußzeile:

```jsx
{/* Sticky it no longer is - see the stylesheet. What is new here is the bar above the buttons:
    the same list the Save button already consults, said out loud. */}
<div className="jobMutation__footer">
  <JobReadinessBar missing={missing} onJump={setHighlighted} />
  <div className="jobMutation__footerActions">
    {/* Cancel used to be `danger`, so the red button was the harmless one and Save sat next
        to it in the colour that usually means "go ahead". */}
    <Button type="tertiary" onClick={leaveForm}>
      {t('jobs.mutation.cancel')}
    </Button>
    <Button type="primary" icon={<IconPlusCircle />} disabled={missing.length > 0} onClick={mutateJob}>
      {t('jobs.mutation.save')}
    </Button>
  </div>
</div>
```

Der gesperrte Knopf bleibt gesperrt. Er erklärt sich jetzt nur.

---

### Schritt 3 — Anbieter: Leerzustand und Aktion im Kartenkopf

In `JobMutation.jsx` wird der Anbieter-Abschnitt zu:

```jsx
<div {...anchorProps('provider')}>
  <SegmentPart
    name={t('jobs.mutation.sectionProviders')}
    Icon={IconBriefcase}
    helpText={t('jobs.mutation.providersHelp')}
    helpMode="popover"
    // In the header rather than above the table: a button that is pressed once should not push the
    // list down on every visit.
    action={
      providerData.length === 0 ? null : (
        <Button
          theme="borderless"
          icon={<IconPlusCircle />}
          onClick={() => {
            setProviderToEdit(null);
            setProviderCreationVisibility(true);
          }}
        >
          {t('jobs.mutation.addProvider')}
        </Button>
      )
    }
  >
    {providerData.length === 0 ? (
      <SettingsEmptyState
        icon={<IconBriefcase size="large" />}
        title={t('jobs.mutation.providerEmptyTitle')}
        description={t('jobs.mutation.providerEmptyText')}
        action={
          <Button
            type="primary"
            icon={<IconPlusCircle />}
            onClick={() => {
              setProviderToEdit(null);
              setProviderCreationVisibility(true);
            }}
          >
            {t('jobs.mutation.providerEmptyAction')}
          </Button>
        }
      />
    ) : (
      <ProviderTable
        providerData={providerData}
        onRemove={(providerUrl) => {
          setProviderData(providerData.filter((provider) => provider.url !== providerUrl));
        }}
        onEdit={(provider) => {
          setProviderCreationVisibility(true);
          setProviderToEdit(provider);
        }}
      />
    )}
  </SegmentPart>
</div>
```

Import ergänzen:

```js
import SettingsEmptyState from '../../../components/settingsShell/SettingsEmptyState';
```

Der Knopf mit `className="jobMutation__newButton"` verschwindet aus diesem Abschnitt ersatzlos:
im leeren Fall steht er im Leerzustand, im gefüllten Fall im Kartenkopf.

---

### Schritt 4 — Kanäle: Leerzustand, eine Knopffarbe

```jsx
<div {...anchorProps('channel')}>
  <SegmentPart
    Icon={IconBell}
    name={t('jobs.mutation.sectionNotifications')}
    helpText={t('jobs.mutation.notificationsHelp')}
    helpMode="popover"
    action={
      selectedChannels.length === 0 ? null : (
        <Button theme="borderless" icon={<IconPlusCircle />} onClick={() => setPickerVisible(true)}>
          {t('jobs.mutation.addNotification')}
        </Button>
      )
    }
  >
    {selectedChannels.length === 0 ? (
      <SettingsEmptyState
        icon={<IconBell size="large" />}
        title={t('jobs.mutation.channelEmptyTitle')}
        description={t('jobs.mutation.channelEmptyText')}
        action={
          <Button type="primary" icon={<IconPlusCircle />} onClick={() => setPickerVisible(true)}>
            {t('jobs.mutation.channelEmptyAction')}
          </Button>
        }
      />
    ) : (
      <NotificationChannelTable
        channels={selectedChannels}
        // …alle Props unverändert…
      />
    )}
  </SegmentPart>
</div>
```

Der Knopf „Kanäle verwalten“ (`type="secondary"`, Semis Blau) verschwindet als Knopf. Er war schon
immer eine Navigation, kein Kommando. Er wird ein Link unter der Tabelle:

```jsx
{selectedChannels.length > 0 && (
  <Button
    theme="borderless"
    className="jobMutation__manageLink"
    icon={<IconSetting />}
    onClick={() => leaveWithReturnPath('/settings/notifications')}
  >
    {t('notification.channels.manage')}
  </Button>
)}
```

direkt hinter der Tabelle, noch innerhalb des `SegmentPart`.

`.jobMutation__notificationActions` wird nicht mehr gerendert. In `JobMutation.less`:

```less
/* Navigation away from the form, not a command inside it: borderless, under the list it belongs
   to. It used to be a filled blue button beside a filled accent one - two colours, two weights,
   for "add one" and "go somewhere else". */
.jobMutation__manageLink {
  margin-top: @space-2;
}
```

---

### Schritt 5 — Veröffentlichung: zwei Karten werden eine

„Mit Benutzer teilen“ und „Job-Aktivierung“ sind beides Entscheidungen über den Job selbst, keine
Filter. Sie stehen schon heute nebeneinander außerhalb des Folds. Sie werden eine Karte.

```jsx
{/* Outside the fold, and after it: neither is a filter. Who else sees this job and whether it runs
    at all are decisions about the job itself, and burying them under a heading that says "filters"
    is how people missed the switch that turns the job on. One card rather than two, because they
    are one question asked twice: what happens with this job once it exists. */}
<SegmentPart
  Icon={IconUser}
  name={t('jobs.mutation.sectionPublication')}
  helpText={t('jobs.mutation.publicationHelp')}
  helpMode="popover"
>
  <div className="jobMutation__publication">
    <div className="jobMutation__publicationRow">
      <span className="jobMutation__publicationLabel">{t('jobs.mutation.sectionSharing')}</span>
      <div className="jobMutation__publicationControl">
        {shareableUserList.length === 0 ? (
          <span className="jobMutation__publicationNote">{t('jobs.mutation.sharingNoUsers')}</span>
        ) : (
          <Select
            filter
            multiple
            placeholder={t('jobs.mutation.sharingSearchPlaceholder')}
            autoClearSearchValue={false}
            defaultValue={shareWithUsers}
            onChange={(value) => setShareWithUsers(value)}
            dropdownClassName="jobMutation__dropdown"
            className="jobMutation__fullWidth"
          >
            {shareableUserList.map((user) => (
              <Select.Option value={user.id} key={user.id}>
                {user.name}
              </Select.Option>
            ))}
          </Select>
        )}
      </div>
    </div>

    <div className="jobMutation__publicationRow">
      <span className="jobMutation__publicationLabel">{t('jobs.mutation.sectionActivation')}</span>
      <div className="jobMutation__publicationControl">
        <Switch onChange={(checked) => setEnabled(checked)} checked={enabled} />
      </div>
    </div>
  </div>
</SegmentPart>
```

`IconPlayCircle` wird damit nicht mehr importiert und fliegt aus der Importliste.
`jobMutation__spaceTop` am `Switch` fällt weg.

In `JobMutation.less`:

```less
/* Two decisions about the job itself, as a label column and a control column. A definition list
   would be the semantic match, but the control side holds a multi-select and a switch, and a `dd`
   full of widgets buys nothing a labelled row does not. */
.jobMutation__publication {
  display: flex;
  flex-direction: column;
  gap: @space-3;
}

.jobMutation__publicationRow {
  display: flex;
  align-items: center;
  gap: @space-4;

  & + & {
    padding-top: @space-3;
    border-top: 1px solid @color-border;
  }
}

.jobMutation__publicationLabel {
  flex: none;
  width: 11rem;
  font-size: @text-sm;
  font-weight: 500;
  color: @color-muted;
}

.jobMutation__publicationControl {
  flex: 1;
  min-width: 0;
}

.jobMutation__publicationNote {
  font-size: @text-sm;
  color: @color-muted;
}

/* The two selects of this form that must fill their row. Replaces `style={{ width: '100%' }}`. */
.jobMutation__fullWidth {
  width: 100%;
}

@media (max-width: 700px) {
  .jobMutation__publicationRow {
    align-items: flex-start;
    flex-direction: column;
    gap: @space-2;
  }

  .jobMutation__publicationLabel {
    width: auto;
  }
}
```

`11rem` ist eine Spaltenbreite, kein Abstand, und damit von Regel 5 nicht betroffen.

---

### Schritt 6 — Der Kommentar über dem Fold, und der Zurück-Knopf

Kommentar über dem ersten `SegmentPart`, alt:

```jsx
{/* The three things a job cannot exist without, and nothing else. Everything optional is
    folded away below, so the shortest path to a working job is a straight read down this
    column rather than a scroll past nine open cards. */}
```

neu:

```jsx
{/* The four things a job cannot exist without, in the order `JOB_REQUIREMENTS` names them, and
    the two decisions about the job itself. Every filter is folded away below, so the shortest
    path to a working job is a straight read down this column rather than a scroll past nine open
    cards. The readiness bar at the foot says which of the four is still open. */}
```

Der Zurück-Knopf verliert seine Farbe im Markup:

```jsx
<Button icon={<IconArrowLeft />} onClick={leaveForm} theme="borderless" className="jobMutation__back">
  {t('jobs.mutation.back')}
</Button>
```

```less
/* Leaves the page, so it is quieter than anything that changes it. */
.jobMutation__back {
  color: @color-muted;
}
```

Der Entwurfs-Banner verliert seinen Inline-Abstand:

```jsx
<Banner
  type="info"
  fullMode={false}
  closeIcon={null}
  className="jobMutation__draftNotice"
  description={…unverändert…}
/>
```

```less
.jobMutation__draftNotice {
  margin-bottom: @space-4;
}
```

---

### Schritt 7 — Die Filterleiste verliert zwei von drei Akzentsignalen

Heute trägt der Kopf des Folds drei: einen Akzentrahmen, einen Akzent-Hover und eine
Versalpille in Akzentfarbe. Dieselbe Kritik wie am aktiven Eintrag der Navigation: ein Signal
genügt, drei lesen sich als Werbung.

In `JobMutation.less`:

```less
.jobMutation__refine {
  margin-bottom: @space-4;

  /* Reads as a control rather than a caption: the pointer and the lift on hover are the whole of
     what tells someone the filters are one click away. The accent used to do that job three times
     over - border, hover border and an uppercase pill - for a section that is optional. */
  .semi-collapse-header {
    padding: @space-3 @space-4;
    border: 1px solid @color-border;
    border-radius: @radius-card;
    background: @color-fill-subtle;
    cursor: pointer;
    transition:
      background @transition-fast,
      border-color @transition-fast;

    &:hover {
      border-color: @color-border-bright;
      background: @color-fill-1;
    }
  }

  …`semi-collapse-content` unverändert…
}
```

Und die Pille wird ein Wort:

```less
/* Which way the next click goes, which a chevron on its own does not say. In the body colour and
   at body size: it is a label on a header, not a badge. */
.jobMutation__refineToggle {
  margin-left: auto;
  color: @color-muted;
  font-size: @text-sm;
  white-space: nowrap;
}
```

`border`, `border-radius`, `padding`, `text-transform`, `letter-spacing`, `font-weight` und
`color: @color-accent` fallen ersatzlos weg.

---

### Schritt 8 — `ProviderTable`: Aktionen wie überall

`ui/src/components/table/ProviderTable.jsx`, die dritte Spalte vollständig neu:

```jsx
        {
          // A named column, not an empty header. Two icon buttons under a blank heading are two
          // symbols nobody has to be able to read.
          title: t('provider.tableColumnActions'),
          dataIndex: 'tools',
          width: 120,
          render: (_, record) => (
            <div className="providerTable__actions">
              <Tooltip content={t('provider.tableEdit')}>
                <Button
                  theme="borderless"
                  type="tertiary"
                  icon={<IconEdit />}
                  aria-label={t('provider.tableEdit')}
                  onClick={() => onEdit(record)}
                />
              </Tooltip>
              <Tooltip content={t('provider.tableRemove')}>
                <Button
                  theme="borderless"
                  type="danger"
                  icon={<IconDelete />}
                  aria-label={t('provider.tableRemove')}
                  onClick={() => onRemove(record.url)}
                />
              </Tooltip>
            </div>
          ),
        },
```

Import ergänzen: `Tooltip` aus `@douyinfe/semi-ui-19`.

Neue Datei `ui/src/components/table/ProviderTable.less`:

```less
/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

@import '../../tokens.less';

/* Right-aligned by flex, not by `float`, and spaced by a gap rather than by an empty 16px div. */
.providerTable__actions {
  display: flex;
  justify-content: flex-end;
  gap: @space-2;
}
```

und `import './ProviderTable.less';` in der JSX.

Damit ist die harmlose Aktion nicht länger die auffälligere: beide sind randlos, nur die
gefährliche trägt die Fehlerfarbe.

---

### Schritt 9 — `JobMutation.less` aufräumen

Vier Dinge, alle belegt in Abschnitt 3.

**a) Der globale Selektor fällt.** Die drei Zeilen

```less
.semi-select-option-list-wrapper {
  width: 25rem;
}
```

werden gelöscht und durch eine gebundene Regel ersetzt:

```less
/* Bound to the three selects of this form by `dropdownClassName`, because Semi renders the list in
   a portal at `document.body`: a descendant selector from inside the form cannot reach it. This
   rule used to sit at the top level of this file without a class at all, which made every select
   list in the application 25rem wide the moment the job form had been opened once. */
.jobMutation__dropdown {
  min-width: 18rem;
}
```

und an den drei `Select` dieser Seite (Mieten/Kaufen, Teilen, und in Schritt 10 der Anbieter)
`dropdownClassName="jobMutation__dropdown"`.

**b) `float` fällt.** `.jobMutation__newButton` wird gelöscht. Nach den Schritten 3 und 4 hängt die
Klasse an keinem Knopf mehr.

**c) Die tote Klasse fällt.** `.jobMutation__actions` wird gelöscht.

**d) Die freien Maße.** `padding-left: 1.25rem` an `.jobMutation__areaSteps` wird `@space-5`.
`height: 26rem` und `50rem` an `.jobMutation__areaMap` bleiben: das sind Kartenhöhen, keine
Abstände, und beide sind in ihrem Kommentar begründet. `0.5rem` und `1rem` an
`.jobMutation__notificationActions` verschwinden mit der Klasse aus Schritt 4.

Am `Select` für den Typ ersetzt

```jsx
style={{ width: '100%', maxWidth: 220 }}
```

sich durch `className="jobMutation__dealType"` und

```less
.jobMutation__dealType {
  width: 100%;
  max-width: 14rem;
}
```

---

### Schritt 10 — `ProviderMutator`: zwei Schritte statt drei Sätze

#### 10.1 `ProviderMutator.jsx`

Der Rumpf des Modals wird zu zwei nummerierten Schritten, jeder mit genau dem Feld, das er
beschreibt. Der Fehler wandert an das Feld, das ihn verursacht hat.

Zuerst: `validate()` gibt nicht mehr nur den Text zurück, sondern auch, wohin er gehört.

```js
  /**
   * Why the pasted URL cannot be used, in words the user can act on, and at which field.
   *
   * The three URL problems belong under the URL field - they are all statements about the thing
   * that was pasted. The fourth case is "nothing chosen at all", which is not about either field
   * in particular and stays a notice above both.
   *
   * @returns {{ where: 'url'|'form', message: string }|null}
   */
  const validate = () => {
    const { ok, problem, expectedHost } = validateProviderUrl(providerUrl, selectedProvider);
    if (ok) {
      return null;
    }
    switch (problem) {
      case 'bareHost':
        return { where: 'url', message: t('provider.validationBareHost', { host: expectedHost }) };
      case 'wrongHost':
        return { where: 'url', message: t('provider.validationWrongHost', { host: expectedHost }) };
      case 'unparsable':
        return { where: 'url', message: t('provider.validationUnparsable') };
      default:
        return { where: 'form', message: t('provider.validationSelectAndUrl') };
    }
  };
```

`validationMessage` hält damit ein Objekt oder `null`. Alle drei `setValidationMessage(null)`
bleiben, wie sie sind.

Der Rumpf:

```jsx
    <Modal
      title={providerToEdit ? t('provider.editTitle') : t('provider.defaultTitle')}
      visible={visible}
      onOk={() => onSubmit(true)}
      onCancel={() => onSubmit(false)}
      // Three short lines and two fields do not need half a screen. It was 50rem, which left the
      // controls stranded in the left third of an otherwise empty dialog.
      style={{ width: isMobile ? '95%' : '34rem' }}
      okText={providerToEdit ? t('provider.save') : t('provider.addAction')}
    >
      {validationMessage?.where === 'form' && (
        <Banner
          fullMode={false}
          type="danger"
          closeIcon={null}
          className="providerMutator__banner"
          description={validationMessage.message}
        />
      )}

      {providerToEdit != null ? (
        <p className="providerMutator__editNote">
          {t('provider.editDescription', { name: providerToEdit.name })}
        </p>
      ) : null}

      {/* Two numbered steps, each holding the field it describes. They used to be three sentences
          of grey prose above three controls that did not correspond to them: step one said
          "choose below", step three said "paste it here" and meant a field two rows further
          down. */}
      <ol className="providerMutator__steps">
        <li className="providerMutator__step">
          <span className="providerMutator__stepTitle">{t('provider.stepChooseTitle')}</span>
          <Select
            filter
            placeholder={t('provider.selectPlaceholder')}
            className="providerMutator__fields"
            dropdownClassName="providerMutator__dropdown"
            disabled={providerToEdit != null}
            // Sorted by country and then by size, rather than by name: somebody searching in Vienna
            // should not have to read past every German provider, and the one most people want
            // should not sit halfway down the list because of its initial.
            optionList={sortProviders(provider).map((pro) => ({
              otherKey: pro.id,
              value: pro.id,
              // The flags come from what the provider declared it covers, so one serving two
              // countries shows both. Only the label carries them - the name stored on the job
              // stays the plain one.
              label: labelWithFlags(pro),
            }))}
            value={selectedProvider == null ? '' : selectedProvider.id}
            onChange={(value) => {
              setSelectedProvider(provider.find((pro) => pro.id === value));
              setValidationMessage(null);
            }}
          />

          {/* The row is reserved whether or not a provider has been picked. It used to appear on
              selection and push the URL field down under the cursor that had just clicked.

              A link the user clicks, rather than a `window.open()` fired from the Select's
              onChange. That opened a tab before they had read a word of the instructions, opened a
              second one if they changed their mind, and was swallowed without a trace by a popup
              blocker. */}
          <span className="providerMutator__openRow">
            {selectedProvider != null && (
              <a
                className="providerMutator__openLink"
                href={selectedProvider.baseUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                <IconExternalOpen />
                {t('provider.openInNewTab', { name: selectedProvider.name })}
              </a>
            )}
          </span>

          <span className="providerMutator__stepHint">{t('provider.stepChooseHint')}</span>
        </li>

        <li className="providerMutator__step">
          <span className="providerMutator__stepTitle">{t('provider.stepPasteTitle')}</span>
          <Input
            type="text"
            placeholder={t('provider.urlPlaceholder')}
            className="providerMutator__fields"
            validateStatus={validationMessage?.where === 'url' ? 'error' : 'default'}
            value={providerUrl}
            onChange={(value) => {
              setProviderUrl(value);
              setValidationMessage(null);
            }}
          />
          {validationMessage?.where === 'url' && (
            <span className="providerMutator__error">{validationMessage.message}</span>
          )}
        </li>
      </ol>
    </Modal>
```

`width={10}` am `Input` fällt weg — es war der Grund für das `!important` im Stylesheet.
`style={{ width: '100%' }}` am `Select` fällt weg, die Klasse tut es schon.
Der Inline-Style am `Banner`-Titel fällt weg, samt Titel: die Überschrift „Fehler“ über einem
einzigen Satz war eine Zeile ohne Information.

#### 10.2 `ProviderMutator.less`

Vollständig:

```less
/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

@import '../../../../../tokens.less';

.providerMutator {
  /* Both controls fill the dialog. They were pinned at 25rem inside a 50rem modal, which read as
     two small boxes floating in the left half of it. The `!important` this used to need is gone
     with the `width={10}` prop that fought it. */
  &__fields {
    width: 100%;
  }

  &__banner {
    margin-bottom: @space-4;
  }

  &__editNote {
    margin: 0 0 @space-4;
    font-size: @text-sm;
    line-height: 1.6;
    color: @color-muted;
  }

  /* A procedure carried out across two browser tabs: the order is the whole of it, so the steps
     are numbered and each one holds the control it describes rather than pointing at one further
     down the dialog. */
  &__steps {
    margin: 0;
    padding-left: @space-5;
    color: @color-muted;
    font-size: @text-sm;
  }

  &__step {
    display: flex;
    flex-direction: column;

    & + & {
      margin-top: @space-4;
      padding-top: @space-4;
      border-top: 1px solid @color-border;
    }
  }

  &__stepTitle {
    margin-bottom: @space-2;
    font-size: @text-base;
    font-weight: 600;
    color: @color-text;
  }

  &__stepHint {
    font-size: @text-sm;
    line-height: 1.6;
    color: @color-muted;
  }

  /* Reserved whether or not a provider has been chosen, so picking one does not move the field
     below it out from under the cursor. */
  &__openRow {
    display: flex;
    align-items: center;
    min-height: @space-6;
  }

  &__openLink {
    display: inline-flex;
    align-items: center;
    gap: @space-1;
    color: @color-accent;
    font-size: @text-sm;
    text-decoration: none;

    &:hover,
    &:focus-visible {
      text-decoration: underline;
    }
  }

  /* At the field, not in a banner above everything: all three of these are statements about the
     address that was pasted. */
  &__error {
    margin-top: @space-2;
    font-size: @text-sm;
    line-height: 1.6;
    color: @color-error;
  }
}

/* Semi sizes the option list off the widest option and renders it in a portal at `document.body`.
   A descendant selector from inside the modal cannot reach it - which is what the old
   `.providerMutator .semi-select-option-list-wrapper` tried and why a global 25rem rule ended up
   in JobMutation.less instead. `dropdownClassName` is the binding that works. */
.providerMutator__dropdown {
  max-width: 32rem;
}
```

`@color-error` auf `@color-surface` misst 4,51:1 (dunkel) und 6,23:1 (hell). AA für Fließtext
ist damit erfüllt.

---

### Schritt 11 — `NotificationChannelPicker`: Tokens und ein echter Leerzustand

#### 11.1 `NotificationChannelPicker.jsx`

Der Leerzustand wird `SettingsEmptyState`. Die beiden Ursachen bleiben unterschieden — das war
schon immer richtig und steht so im Kommentar.

```jsx
  // Nothing to offer has two very different causes, and telling a user they have no channels when
  // they have three - all already on this job - sends them off to create a duplicate.
  const nothingExists = channels.length === 0;

  const leaveForSettings = () => {
    onClose();
    if (onManageChannels != null) {
      onManageChannels();
      return;
    }
    navigate('/settings/notifications');
  };

  // The same empty state the rest of the app uses: what is missing, what that costs, and the one
  // button that fixes it. It used to be a single centred sentence with a link in Semi's blue -
  // rendered instead of the table, not inside its empty slot, because Semi lays the table's
  // placeholder out at the width of the (empty) table rather than the modal's, which broke one
  // sentence into nine stacked fragments a few pixels wide. That reason still holds.
  const emptyState = (
    <SettingsEmptyState
      icon={<IconBell size="large" />}
      title={
        nothingExists
          ? t('notification.channels.emptyTitle')
          : t('notification.channels.pickerAllAddedTitle')
      }
      description={
        nothingExists
          ? t('notification.channels.emptyText')
          : t('notification.channels.pickerAllAddedLead')
      }
      action={
        <Button type="primary" icon={<IconPlusCircle />} onClick={leaveForSettings}>
          {nothingExists
            ? t('notification.channels.emptyAction')
            : t('notification.channels.pickerAllAddedLink')}
        </Button>
      }
    />
  );
```

Importe ergänzen: `Button` aus `@douyinfe/semi-ui-19`, `IconBell` und `IconPlusCircle` aus
`@douyinfe/semi-icons`, `SettingsEmptyState` aus `../../../../../components/settingsShell/SettingsEmptyState`.

Die Modalbreite bekommt eine Klasse statt einer Zahl im Markup? Nein — `Modal` braucht die Breite
als Prop, und sie ist vom Bildschirm abhängig. `46rem` bleibt, wo es steht. Das ist die eine
Ausnahme von Regel 2, und sie ist genau die, die Regel 2 ausdrücklich zulässt.

#### 11.2 `NotificationChannelPicker.less`

Vollständig:

```less
/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

@import '../../../../../tokens.less';

/* This file used to import nothing and colour with `--semi-color-text-1`, `--semi-color-text-2`
   and `--semi-color-primary`. theme.test.js checks that every `--f-` token is defined in both
   theme blocks and knows nothing about Semi's variables, so this dialog was outside every theme
   check the project has. */
.channelPicker {
  &__intro {
    margin: 0 0 @space-3;
    font-size: @text-sm;
    line-height: 1.5;
    color: @color-muted;
  }
}
```

`__empty` und `__emptyLink` fallen ersatzlos weg: `SettingsEmptyState` bringt sein eigenes
Stylesheet mit.

---

### Schritt 12 — `NotificationChannelEditor`: zwei Gruppen, eine Fußzeile, eine echte Liste

#### 12.1 Die Fehlerliste

```js
  const [validationProblems, setValidationProblems] = useState([]);
```

ersetzt `validationMessage`. `save()`:

```js
  const save = async () => {
    const problems = validateChannel(draft, adapterConfig, t);
    if (problems.length > 0) {
      setValidationProblems(problems);
      return;
    }
    setSaving(true);
    try {
      const saved = await actions.notificationChannels.saveChannel(toPayload(draft));
      Toast.success(t('notification.channels.saved'));
      onSaved?.(saved);
      onClose();
    } catch (error) {
      setValidationProblems([errorMessage(error, t('common.unknownError'))]);
    } finally {
      setSaving(false);
    }
  };
```

`test()` analog, mit `setValidationProblems([])` statt `setValidationMessage(null)` und
`setValidationProblems(problems)` statt des `join`.

Damit fallen beide `dangerouslySetInnerHTML` weg.

#### 12.2 Die Meldungen bekommen zwei Orte

Zwei Banner sind Kontext (gilt für diesen Kanal, unabhängig davon, was der Benutzer gerade tut):
die Geteilt-Warnung und der Zugangsdaten-Hinweis. Die bleiben oben. Zwei sind Ergebnis (das hast
du gerade ausgelöst): Fehler und Erfolg. Die wandern direkt über die Fußzeile, dorthin, wo der
Blick nach dem Klick auf „Testen“ oder „Speichern“ ohnehin ist.

Oben bleibt:

```jsx
      {showSharedWarning && (
        <Banner … unverändert … />
      )}

      {secretsHidden && (
        <Banner … unverändert … />
      )}
```

Ganz ans Ende des Modal-Rumpfs, hinter die Felder:

```jsx
      {/* Above the footer rather than at the top of the dialog: this is the answer to the button
          that was just pressed, and on a long adapter form the top of the dialog is off screen by
          the time it is. */}
      {validationProblems.length > 0 && (
        <Banner
          fullMode={false}
          type="danger"
          closeIcon={null}
          className="channelEditor__banner"
          description={
            validationProblems.length === 1 ? (
              validationProblems[0]
            ) : (
              // `validateChannel` returns an array and this used to `join('<br/>')` it into a
              // string, then hand that string to `dangerouslySetInnerHTML`. It is a list; it is
              // rendered as one.
              <ul className="channelEditor__problems">
                {validationProblems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            )
          }
        />
      )}

      {successMessage != null && (
        <Banner
          fullMode={false}
          type="success"
          closeIcon={null}
          className="channelEditor__banner"
          description={successMessage}
        />
      )}
```

Die beiden `__bannerTitle`-Überschriften („Fehler“, „Super!“) fallen weg: die Banner tragen ihre
Bedeutung in Farbe und Symbol, und eine Überschrift über einem einzigen Satz ist eine Zeile ohne
Information. `notification.errorTitle` und `notification.successTitle` bleiben in den Locales, sie
werden anderswo benutzt.

#### 12.3 Zwei benannte Gruppen

Die acht gleichrangigen `channelEditor__field` werden zwei Gruppen: was der Kanal ist, und womit
er sich anmeldet.

```jsx
      <div className="channelEditor__group">
        <span className="channelEditor__groupTitle">{t('notification.channels.groupChannel')}</span>

        <div className="channelEditor__field">
          <label className="channelEditor__label" htmlFor="channelEditorName">
            {t('notification.channels.nameLabel')}
          </label>
          <Input … unverändert … />
          <div className="channelEditor__extra">{t('notification.channels.nameHelp')}</div>
        </div>

        <div className="channelEditor__field">
          <div className="channelEditor__label">{t('notification.channels.typeLabel')}</div>
          <div className="channelEditor__value">{adapterConfig.name}</div>
          <div className="channelEditor__extra">{adapterConfig.description}</div>
        </div>

        {currentUser?.isAdmin && (
          <div className="channelEditor__field">
            <div className="channelEditor__label">{t('notification.channels.visibilityLabel')}</div>
            <Select
              value={draft.visibility}
              className="channelEditor__visibility"
              dropdownClassName="channelEditor__dropdown"
              onChange={(value) => setDraft({ ...draft, visibility: value })}
              optionList={[…unverändert…]}
            />
            <div className="channelEditor__extra">{t('notification.channels.visibilityHelp')}</div>
          </div>
        )}
      </div>

      <div className="channelEditor__group">
        <span className="channelEditor__groupTitle">
          {t('notification.channels.groupCredentials')}
        </span>

        {/* At the head of the group it explains, not floating between the channel's own data and
            its credentials. */}
        {adapterConfig.readme != null && <Help readme={adapterConfig.readme} />}

        {Object.entries(adapterConfig.fields ?? {}).map(([key, definition]) => …unverändert…)}
      </div>
```

`style={{ width: 220 }}` am Sichtbarkeits-Select fällt weg.

#### 12.4 Die Fußzeile

```jsx
      footer={
        <div className="channelEditor__footer">
          {/* On the left because it is neither of the two ways out of this dialog: it changes
              nothing and closes nothing, it just asks the service whether these credentials work.
              It used to get there by `float: left` inside a `div` with no rule of its own, in
              Semi's blue, next to a light tertiary Cancel and a solid accent Save: three buttons
              in three weights for two decisions. */}
          <Button theme="outline" type="tertiary" onClick={test}>
            {t('notification.try')}
          </Button>
          <span className="channelEditor__footerGap" />
          <Button theme="borderless" type="tertiary" onClick={onClose}>
            {t('notification.cancel')}
          </Button>
          <Button theme="solid" type="primary" loading={saving} onClick={save}>
            {t('notification.save')}
          </Button>
        </div>
      }
```

#### 12.5 `NotificationChannelEditor.less`

Vollständig:

```less
/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

@import '../../../../../tokens.less';

/* This file used to import nothing and colour with `--semi-color-text-0` and `--semi-color-text-2`,
   with ten free measurements between them. Both are now tokens, and every measurement below comes
   from the scale. */
.channelEditor {
  &__banner {
    margin-bottom: @space-3;

    /* Semi's banner ships a generous block padding meant for page-width notices. Inside a modal
       that is mostly form, it pushes the first field below the fold. */
    .semi-banner-content {
      padding: @space-2 @space-3;
    }

    p {
      margin: 0;
    }
  }

  &__problems {
    margin: 0;
    padding-left: @space-4;
    line-height: 1.6;
  }

  /* Two named groups rather than eight equal rows: what the channel is, and what it signs in
     with. The setup guide belongs to the second and sits at its head. */
  &__group {
    margin-bottom: @space-5;

    & + & {
      padding-top: @space-5;
      border-top: 1px solid @color-border;
    }
  }

  &__groupTitle {
    display: block;
    margin-bottom: @space-3;
    font-size: @text-xs;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: @color-muted;
  }

  &__field {
    margin-bottom: @space-3;

    &:last-child {
      margin-bottom: 0;
    }
  }

  &__label {
    display: block;
    margin-bottom: @space-1;
    font-weight: 600;
    font-size: @text-base;
    color: @color-text;
  }

  &__value {
    font-size: @text-base;
    color: @color-text;
  }

  &__extra {
    margin-top: @space-1;
    font-size: @text-sm;
    line-height: 1.45;
    color: @color-muted;
  }

  &__switchRow {
    display: flex;
    align-items: center;
    gap: @space-4;
  }

  &__visibility {
    width: 14rem;
  }

  /* One row, three buttons, no float: Test at one end, the two ways out at the other. */
  &__footer {
    display: flex;
    align-items: center;
    gap: @space-2;
  }

  &__footerGap {
    flex: 1;
  }
}

/* Semi renders the option list in a portal at `document.body`, so it is bound by name rather than
   by nesting. */
.channelEditor__dropdown {
  min-width: 14rem;
}
```

---

### Schritt 13 — „Portal“ wird „Anbieter“

Nur `ui/src/locales/de.json`, zwei Schlüssel:

| Schlüssel | Alt | Neu |
|---|---|---|
| `provider.step1` | „Wähle unten das Portal und öffne es in einem neuen Tab.“ | entfällt, siehe Schritt 14 |
| `provider.validationWrongHost` | „Diese Adresse gehört nicht zu {{host}}. Kopiere die Ergebnisseite des oben gewählten Portals.“ | „Diese Adresse gehört nicht zu {{host}}. Kopiere die Ergebnisseite des oben gewählten Anbieters.“ |

Die anderen vier Sprachen bleiben unangetastet: sie benutzen ihre eigenen Wörter und die Regel
gilt für das Deutsche.

---

### Schritt 14 — i18n in allen fünf Sprachen

`test/ui/locales.test.js` erzwingt zweierlei: jeder Schlüssel, den der Quelltext ruft, muss in
`en.json` stehen, und keine Sprachdatei darf einen Schlüssel tragen, den `en.json` nicht kennt. Also
kommt **jeder** Schlüssel in **alle fünf** Dateien.

Zu löschen, in allen fünf Dateien, weil sie nach Schritt 10 nicht mehr gerufen werden:
`provider.step1`, `provider.step2`, `provider.step3`. Ihr Inhalt steckt in den drei neuen
`provider.step*Title` und `provider.stepChooseHint`.

`jobs.mutation.sectionSharing` und `jobs.mutation.sectionActivation` bleiben: Schritt 5 benutzt
beide als Zeilenbeschriftung innerhalb der Veröffentlichungs-Karte. `jobs.mutation.sharingHelp`
und `jobs.mutation.activationHelp` werden dagegen nicht mehr gerufen und fallen weg, ihr Inhalt
steckt zusammengefasst in `jobs.mutation.publicationHelp`.

Neu, mit den deutschen Werten:

| Schlüssel | de |
|---|---|
| `jobs.mutation.readyAll` | Alles beisammen |
| `jobs.mutation.missingOne` | Eine Pflichtangabe fehlt noch |
| `jobs.mutation.missingMany` | {{count}} Pflichtangaben fehlen noch |
| `jobs.mutation.jumpTo` | Zu „{{name}}“ springen |
| `jobs.mutation.requirement.name` | Name |
| `jobs.mutation.requirement.dealType` | Mieten oder Kaufen |
| `jobs.mutation.requirement.provider` | Anbieter |
| `jobs.mutation.requirement.channel` | Benachrichtigungskanal |
| `jobs.mutation.providerEmptyTitle` | Noch kein Anbieter |
| `jobs.mutation.providerEmptyText` | Ein Anbieter ist die Seite, die Fredy für dich durchsucht. Füge die Adresse einer fertigen Suchergebnisseite ein, dann meldet dieser Job, was dort neu dazukommt. |
| `jobs.mutation.providerEmptyAction` | Ersten Anbieter hinzufügen |
| `jobs.mutation.channelEmptyTitle` | Diese Suche erreicht dich noch nicht |
| `jobs.mutation.channelEmptyText` | Ohne Kanal findet Fredy Wohnungen, sagt dir aber nichts davon. Wähle einen deiner Kanäle aus oder lege in den Einstellungen einen neuen an. |
| `jobs.mutation.channelEmptyAction` | Kanal auswählen |
| `jobs.mutation.sectionPublication` | Veröffentlichung |
| `jobs.mutation.publicationHelp` | Wer diesen Job außer dir sehen kann, und ob er überhaupt läuft. Ein inaktiver Job bleibt erhalten, wird aber bei der Suche übersprungen. |
| `provider.tableColumnActions` | Aktionen |
| `provider.tableEdit` | Anbieter bearbeiten |
| `provider.tableRemove` | Anbieter entfernen |
| `provider.addAction` | Anbieter hinzufügen |
| `provider.stepChooseTitle` | Anbieter wählen und dort suchen |
| `provider.stepChooseHint` | Öffne den Anbieter in einem neuen Tab und suche dort genau das, was du willst, mit allen Filtern. |
| `provider.stepPasteTitle` | Adresse der Ergebnisseite einfügen |
| `notification.channels.pickerAllAddedTitle` | Alle Kanäle sind schon dran |
| `notification.channels.groupChannel` | Der Kanal |
| `notification.channels.groupCredentials` | Zugangsdaten |

Die englischen Werte, weil `en.json` die Referenz ist:

| Schlüssel | en |
|---|---|
| `jobs.mutation.readyAll` | Everything is here |
| `jobs.mutation.missingOne` | One required field is still open |
| `jobs.mutation.missingMany` | {{count}} required fields are still open |
| `jobs.mutation.jumpTo` | Jump to "{{name}}" |
| `jobs.mutation.requirement.name` | Name |
| `jobs.mutation.requirement.dealType` | Rent or buy |
| `jobs.mutation.requirement.provider` | Provider |
| `jobs.mutation.requirement.channel` | Notification channel |
| `jobs.mutation.providerEmptyTitle` | No provider yet |
| `jobs.mutation.providerEmptyText` | A provider is the site Fredy searches for you. Paste the address of a finished search results page and this job will report whatever turns up there. |
| `jobs.mutation.providerEmptyAction` | Add your first provider |
| `jobs.mutation.channelEmptyTitle` | This search cannot reach you yet |
| `jobs.mutation.channelEmptyText` | Without a channel Fredy finds flats but never tells you about them. Pick one of your channels, or create a new one in Settings. |
| `jobs.mutation.channelEmptyAction` | Pick a channel |
| `jobs.mutation.sectionPublication` | Publication |
| `jobs.mutation.publicationHelp` | Who besides you can see this job, and whether it runs at all. An inactive job is kept but skipped when Fredy searches. |
| `provider.tableColumnActions` | Actions |
| `provider.tableEdit` | Edit provider |
| `provider.tableRemove` | Remove provider |
| `provider.addAction` | Add provider |
| `provider.stepChooseTitle` | Choose a provider and search there |
| `provider.stepChooseHint` | Open the provider in a new tab and search for exactly what you want, with every filter set. |
| `provider.stepPasteTitle` | Paste the address of the results page |
| `notification.channels.pickerAllAddedTitle` | Every channel is already on this job |
| `notification.channels.groupChannel` | The channel |
| `notification.channels.groupCredentials` | Credentials |

`es.json`, `it.json` und `tr.json` bekommen dieselben Schlüssel, übersetzt. Für `tr.json` gilt:
Schlüssel, für die keine türkische Übersetzung geschrieben wird, müssen in die
`UNTRANSLATED_BACKLOG`-Liste in `test/ui/locales.test.js` eingetragen werden. Bevorzugt wird
übersetzt; die Liste zu verlängern ist die Ausnahme, nicht der Weg.

---

### Schritt 15 — `test/ui/jobFormView.test.js`

Neue Datei. Prüft, was dieser Plan behauptet — maschinell, nicht durch Hinsehen.

```js
/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { JOB_REQUIREMENTS } from '../../ui/src/services/jobs/jobValidation.js';
import { SECTION_BY_REQUIREMENT } from '../../ui/src/views/jobs/mutation/jobSections.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf-8');

const form = read('ui/src/views/jobs/mutation/JobMutation.jsx');
const formLess = read('ui/src/views/jobs/mutation/JobMutation.less');
const bar = read('ui/src/views/jobs/mutation/JobReadinessBar.jsx');
const barLess = read('ui/src/views/jobs/mutation/JobReadinessBar.less');
const providerTable = read('ui/src/components/table/ProviderTable.jsx');
const providerTableLess = read('ui/src/components/table/ProviderTable.less');
const mutator = read('ui/src/views/jobs/mutation/components/provider/ProviderMutator.jsx');
const mutatorLess = read('ui/src/views/jobs/mutation/components/provider/ProviderMutator.less');
const picker = read('ui/src/views/jobs/mutation/components/notificationAdapter/NotificationChannelPicker.jsx');
const pickerLess = read('ui/src/views/jobs/mutation/components/notificationAdapter/NotificationChannelPicker.less');
const editor = read('ui/src/views/jobs/mutation/components/notificationAdapter/NotificationChannelEditor.jsx');
const editorLess = read('ui/src/views/jobs/mutation/components/notificationAdapter/NotificationChannelEditor.less');

const ALL_JSX = [
  ['JobMutation', form],
  ['ProviderTable', providerTable],
  ['ProviderMutator', mutator],
  ['NotificationChannelPicker', picker],
  ['NotificationChannelEditor', editor],
  ['JobReadinessBar', bar],
];

const ALL_LESS = [
  ['JobMutation', formLess],
  ['JobReadinessBar', barLess],
  ['ProviderTable', providerTableLess],
  ['ProviderMutator', mutatorLess],
  ['NotificationChannelPicker', pickerLess],
  ['NotificationChannelEditor', editorLess],
];

describe('the save button finally says why it is disabled', () => {
  it('renders the list that both files described for months', () => {
    expect(form).toMatch(/<JobReadinessBar missing=\{missing\}/);
    expect(bar).toMatch(/missing\.map\(/);
  });

  it('can send the user to every requirement there is', () => {
    for (const requirement of JOB_REQUIREMENTS) {
      expect(SECTION_BY_REQUIREMENT[requirement.key], requirement.key).toBeTypeOf('string');
    }
  });

  it('anchors every one of those sections in the form', () => {
    for (const id of Object.values(SECTION_BY_REQUIREMENT)) {
      // The anchors are rendered from the map, so what is asserted is that the helper that does it
      // is used once per requirement rather than that four literal ids appear.
      expect(id).toMatch(/^jobSection-/);
    }
    const anchors = form.match(/anchorProps\('/g) ?? [];
    expect(anchors).toHaveLength(Object.keys(SECTION_BY_REQUIREMENT).length);
  });

  it('respects a request for less motion when it jumps', () => {
    const sections = read('ui/src/views/jobs/mutation/jobSections.js');
    expect(sections).toMatch(/prefers-reduced-motion/);
  });

  it('keeps the button disabled - it explains it, it does not weaken it', () => {
    expect(form).toMatch(/disabled=\{missing\.length > 0\}/);
  });
});

describe('the two required steps look like steps, not like empty results', () => {
  it.each(['providerEmptyTitle', 'channelEmptyTitle'])('has an empty state for %s', (key) => {
    expect(form).toContain(`jobs.mutation.${key}`);
  });

  it('uses the one the rest of the app uses', () => {
    expect(form).toMatch(/<SettingsEmptyState/);
    expect(picker).toMatch(/<SettingsEmptyState/);
  });
});

describe('no colour, spacing or type in the markup', () => {
  it.each(ALL_JSX)('%s sets none of them inline', (_name, source) => {
    expect(source).not.toMatch(/style=\{\{[^}]*\b(color|margin|padding|gap|fontSize|fontWeight|lineHeight)\b/);
  });

  it.each(ALL_JSX)('%s does not lay out with float', (_name, source) => {
    expect(source).not.toMatch(/float:/);
  });
});

describe('the stylesheets speak Fredy', () => {
  it.each(ALL_LESS)('%s imports the tokens', (_name, source) => {
    expect(source).toMatch(/@import .*tokens\.less/);
  });

  it.each(ALL_LESS)('%s uses none of Semi\'s palette', (_name, source) => {
    expect(source).not.toMatch(/var\(--semi-color-/);
  });

  it.each(ALL_LESS)('%s measures every gap and margin on the scale', (_name, source) => {
    // Rem and px are allowed for sizes (widths, heights, max-widths) and for 1px borders; they are
    // not allowed for the four properties that make up the rhythm of a page.
    const offences = [...source.matchAll(/(?:^|\s)(gap|margin|padding)(?:-[a-z]+)?:\s*([^;]+);/g)]
      .filter(([, , value]) => /\d+(\.\d+)?(px|rem|em)/.test(value) && !/^0$/.test(value.trim()));
    expect(offences.map(([, property, value]) => `${property}: ${value}`)).toEqual([]);
  });

  it('no longer widens every select list in the application', () => {
    expect(formLess).not.toMatch(/^\.semi-select-option-list-wrapper/m);
    expect(mutatorLess).not.toMatch(/\.providerMutator \.semi-select-option-list-wrapper/);
    // Bound by name, because Semi renders the list in a portal at document.body.
    expect(form).toMatch(/dropdownClassName=/);
    expect(mutator).toMatch(/dropdownClassName="providerMutator__dropdown"/);
  });

  it('has no class left over that nothing uses', () => {
    for (const dead of ['jobMutation__actions', 'jobMutation__newButton', 'jobMutation__notificationActions']) {
      expect(formLess, dead).not.toContain(dead);
      expect(form, dead).not.toContain(dead);
    }
  });
});

describe('one primary action per surface', () => {
  it('spends Semi\'s blue nowhere', () => {
    for (const [name, source] of ALL_JSX) {
      expect(source, name).not.toMatch(/type="secondary"/);
    }
  });

  it('gives the provider row two quiet buttons instead of a filled pair', () => {
    expect(providerTable).toMatch(/theme="borderless"[\s\S]{0,80}IconEdit/);
    expect(providerTable).not.toMatch(/width: '16px'/);
    expect(providerTableLess).toMatch(/justify-content: flex-end/);
  });

  it('names the action column instead of leaving its header blank', () => {
    expect(providerTable).not.toMatch(/title: '',/);
    expect(providerTable).toMatch(/provider\.tableColumnActions/);
  });

  it('gives the channel editor one row of three buttons and no float', () => {
    expect(editor).toMatch(/channelEditor__footer/);
    expect(editorLess).toMatch(/&__footer \{[\s\S]*?display: flex/);
  });
});

describe('a list of problems is rendered as a list', () => {
  it('no longer glues the channel validation into HTML', () => {
    expect(editor).not.toMatch(/dangerouslySetInnerHTML/);
    expect(editor).not.toMatch(/join\('<br\/>'\)/);
    expect(editor).toMatch(/validationProblems\.map\(/);
  });
});

describe('the fold invites once, not three times', () => {
  it('drops the uppercase accent pill', () => {
    const block = formLess.match(/\.jobMutation__refineToggle \{[\s\S]*?\n\}/);
    expect(block).not.toBeNull();
    expect(block[0]).not.toMatch(/text-transform/);
    expect(block[0]).not.toMatch(/@color-accent/);
  });

  it('keeps the header a control without painting it accent', () => {
    const block = formLess.match(/\.semi-collapse-header \{[\s\S]*?\n  \}/);
    expect(block).not.toBeNull();
    expect(block[0]).toMatch(/cursor: pointer/);
    expect(block[0]).not.toMatch(/@color-accent/);
  });
});

describe('the comments say what the code does', () => {
  it('counts four requirements, not three', () => {
    expect(form).not.toMatch(/The three things a job cannot exist without/);
    expect(form).toMatch(/The four things a job cannot exist without/);
  });

  it('no longer claims everything optional is folded away', () => {
    expect(form).not.toMatch(/Everything optional is\s*\n?\s*(?:\*\s*)?folded away/);
  });
});

describe('the German copy says Anbieter', () => {
  it('has no Portal left in the provider strings', () => {
    const de = JSON.parse(read('ui/src/locales/de.json'));
    for (const [key, value] of Object.entries(de)) {
      if (!key.startsWith('provider.')) continue;
      expect(`${key}: ${value}`).not.toMatch(/Portal/);
    }
  });
});
```

Der Abstands-Test in `the stylesheets speak Fredy` ist absichtlich streng. Wenn er an einer Stelle
anschlägt, die wirklich eine Größe und kein Abstand ist, ist die Antwort, die Eigenschaft zu
ändern (`width` statt `padding`), nicht den Test aufzuweichen.

---

## 5 Abnahme

Der Reihe nach, alles muss zutreffen.

**Maschinell**

- [ ] `yarn test` grün, inklusive `jobFormView.test.js`, `jobValidation.test.js`, `theme.test.js`,
      `locales.test.js`, `globalShadowing.test.js`
- [ ] `yarn lint` ohne neue Meldung
- [ ] `yarn build` ohne Warnung zu ungenutzten Importen (`IconPlayCircle`, `IconSetting` prüfen)

**Von Hand, dunkles Thema**

- [ ] Neuer Job, leeres Formular: die Bereitschaftsleiste nennt vier offene Punkte
- [ ] Klick auf „Anbieter“ in der Leiste: die Seite springt dorthin, die Karte bekommt zwei
      Sekunden lang einen Rahmen
- [ ] Anbieter hinzufügen: die Leiste zeigt noch drei, dann zwei, dann einen
- [ ] Alles gefüllt: die Leiste wird grün, „Speichern“ ist der einzige gefüllte Knopf der Seite
- [ ] Anbieter-Dialog: eine Startseiten-URL einfügen, der Fehler steht am URL-Feld, nicht oben
- [ ] Anbieter wählen: der Öffnen-Link erscheint, das URL-Feld springt nicht
- [ ] Anbieter-Aufklappliste: so breit wie der Dialog, nicht breiter
- [ ] Einstellungen öffnen, Sprache aufklappen: die Liste ist **nicht** 25 rem breit
- [ ] Kanal-Dialog ohne Kanäle: Leerzustand mit Symbol, Satz und einem Knopf
- [ ] Kanal-Editor: „Testen“ links, „Abbrechen“ und „Speichern“ rechts, kein Blau
- [ ] Kanal-Editor mit zwei Pflichtfeldern leer: zwei Aufzählungspunkte über der Fußzeile
- [ ] Anbieter-Tabelle: beide Knöpfe randlos, nur der Löschen-Knopf in der Fehlerfarbe
- [ ] Filterleiste: ein Rahmen, keine Versalpille

**Von Hand, helles Thema**

- [ ] Dieselben dreizehn Punkte
- [ ] Bereitschaftsleiste lesbar in beiden Zuständen
- [ ] Der Feldfehler im Anbieter-Dialog lesbar auf hellem Grund

**Mobil, 390 px**

- [ ] Die Bereitschaftsleiste bricht um, die Sprungknöpfe stehen untereinander
- [ ] „Veröffentlichung“ zeigt Beschriftung über Steuerelement
- [ ] Die drei Dialoge sind 95 % breit und scrollen in sich

**Tastatur**

- [ ] Jeder Sprungknopf der Leiste ist per Tab erreichbar und hat einen Fokusring
- [ ] Der Fokus landet nach dem Sprung nicht im Nichts

---

## 6 Was ausdrücklich nicht geändert wird

- **Der Entwurf im Speicher.** `jobDraft.js`, das Laden, das Schreiben bei jedem Tastendruck, der
  Banner. Alles begründet, alles richtig.
- **`keepDOM={false}` am Fold.** Die MapLibre-Leinwand soll nicht bei jedem Formularbesuch
  montiert werden.
- **Die Position von „Mieten oder Kaufen“.** Sie bleibt unter den Anbietern. Siehe 3.11.
- **`helpMode="popover"`.** Die 280 Wörter Hilfe gehören hinter das Fragezeichen.
- **`NotificationHelpDisplay`** samt Stylesheet.
- **Die vier Filterabschnitte im Fold.** Kriterien, Fahrzeit, Blacklist, Gebiet bleiben inhaltlich
  wie sie sind.
- **`CommuteFilter` und `AreaFilter`.** Eigene Komponenten, eigene Begründungen, nicht Gegenstand
  dieses Plans.
- **Die Modal-Überschreibungen in `Index.less`.** `border-top: 3px solid @color-accent`,
  `border-radius: 14px`, `padding: 20px 24px 16px`. Die drei Pixelmaße entsprechen zwar genau
  `@space-5 @space-6 @space-4`, aber `Index.less` gilt für alle zwanzig Modale der Anwendung, und
  eine globale Datei anzufassen, um drei Werte zu verschönern, gehört in einen eigenen Commit,
  nicht in diesen Plan. Für `14px` gibt es kein Radius-Token; eins anzulegen hieße, es überall
  sonst rechtfertigen zu müssen.
- **`theme.test.js` und `locales.test.js`.** Werden benutzt, nicht bearbeitet. Einzige Ausnahme:
  die `UNTRANSLATED_BACKLOG`-Liste darf um türkische Schlüssel ergänzt werden, falls keine
  Übersetzung geschrieben wird.
