/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';
import { Button, Col, Collapse, Popconfirm, Row, Tabs, Toast, Typography } from '@douyinfe/semi-ui-19';
import { IconHome, IconKey, IconDelete } from '@douyinfe/semi-icons';
import { useSearchParams } from 'react-router';

import Headline from '../../components/headline/Headline.jsx';
import { SegmentPart } from '../../components/segment/SegmentPart.jsx';
import SettingsSaveBar from '../../components/settingsShell/SettingsSaveBar.jsx';
import ProfileForm from './components/ProfileForm.jsx';
import HouseholdHeadline from './components/HouseholdHeadline.jsx';
import PropertyForm from './components/PropertyForm.jsx';
import RentPanel from './components/RentPanel.jsx';
import ScenarioForm from './components/ScenarioForm.jsx';
import ResultSummary from './components/ResultSummary.jsx';
import MilestoneTimeline from './components/MilestoneTimeline.jsx';
import AffordabilityPanel from './components/AffordabilityPanel.jsx';
import DebtTrajectoryChart from './charts/DebtTrajectoryChart.jsx';
import InterestPrincipalChart from './charts/InterestPrincipalChart.jsx';
import CostBreakdownChart from './charts/CostBreakdownChart.jsx';
import BudgetChart from './charts/BudgetChart.jsx';

import { useActions, useFredyState, useSelector } from '../../services/state/store.js';
import { errorMessage } from '../../services/xhr.js';
import { useFinanceProfile } from '../../hooks/useFinanceProfile.js';
import { summariseHousehold } from '../../services/finance/householdSummary.js';
import { discardSection, financeDirtyState, isSectionDirty } from '../../services/finance/financeDirty.js';
import { useUnsavedWarning } from '../../hooks/useUnsavedWarning.js';
import { useTranslation } from '../../services/i18n/i18n.jsx';

import './FinanceCalculator.less';

const { Text } = Typography;
const { TabPane } = Tabs;

/** Recompute is cheap but not free; this keeps typing smooth without a visible lag. */
const RECALC_DEBOUNCE_MS = 250;

/**
 * What the form renders against before the server has said anything.
 *
 * Only needs the keys the panels dereference without guarding. Everything else is filled in by the
 * normalized profile that comes back with the first calculation.
 */
const EMPTY_DRAFT = Object.freeze({
  financing: Object.freeze({ scenarios: Object.freeze([]) }),
  renting: Object.freeze({}),
});

/**
 * The Delete button under a tab, shown only while that tab is stored.
 *
 * Saving is not here. It lives in the sticky bar at the foot of the page, the same one every
 * settings page uses, because a Save button at the end of a tab is a button the user has to go
 * looking for - on the purchase tab there are two forms, six figures and three charts between the
 * first field and where it used to sit. Removing a stored half is the opposite kind of action:
 * rare, deliberate, and it belongs beside the thing it removes rather than beside a Save that is
 * pressed on every visit.
 *
 * @param {Object} props
 * @param {'rent'|'buy'} props.section
 * @param {boolean} props.saved Whether this tab is currently persisted.
 * @param {boolean} props.deleting
 * @param {() => void} props.onDelete
 * @param {(key: string, params?: Object) => string} props.t
 * @returns {React.ReactElement|null}
 */
function SectionDelete({ section, saved, deleting, onDelete, t }) {
  if (!saved) {
    return null;
  }

  return (
    <div className="finance__delete-row">
      {/* The button names the half it removes. "Delete" alone, on a page with two tabs that
          each own their own data, does not say what is about to disappear. */}
      <Popconfirm
        title={t(section === 'rent' ? 'finance.delete.confirmTitleRent' : 'finance.delete.confirmTitleBuy')}
        content={t(section === 'rent' ? 'finance.delete.confirmRent' : 'finance.delete.confirmBuy')}
        okType="danger"
        okText={t('finance.delete.ok')}
        cancelText={t('finance.delete.cancel')}
        onConfirm={onDelete}
      >
        <Button theme="borderless" type="danger" icon={<IconDelete />} loading={deleting}>
          {t(section === 'rent' ? 'finance.delete.buttonRent' : 'finance.delete.buttonBuy')}
        </Button>
      </Popconfirm>
    </div>
  );
}

SectionDelete.displayName = 'SectionDelete';

/**
 * The credit and debt calculator.
 *
 * Everything is computed in the browser from the shared finance core, so the charts move as
 * you type. The backend is only involved when saving the profile or scoring the whole
 * listings database - and it runs that same core, so the numbers always agree.
 */
export default function FinanceCalculator() {
  const t = useTranslation();
  const actions = useActions();
  const [searchParams] = useSearchParams();
  const { profile: storedProfile, stored, anyComplete } = useFinanceProfile();
  const pois = useSelector((state) => state.tracking.pois);

  // Never `{}`: the Buy tab dereferences `draft.financing.scenarios`, and there is no error
  // boundary in the app, so one failed profile-summary request would blank the whole page. The
  // shape below is the minimum the forms read; the server's normalized profile replaces it as
  // soon as it arrives.
  const [draft, setDraft] = React.useState(() => storedProfile ?? EMPTY_DRAFT);
  // The whole payload of POST /api/finance/calculate for the current draft: the breakdown, the
  // budget, the ceilings, and whether each half of the draft is usable. All of it is computed
  // server-side - the browser holds no finance math - so one request answers every panel here.
  const [draftSummary, setDraftSummary] = React.useState(null);
  const result = draftSummary?.result ?? null;
  // Which section has a request in flight, so only the button that was clicked spins.
  const [saving, setSaving] = React.useState(null);
  const [deleting, setDeleting] = React.useState(null);
  /** Set as soon as the user changes a field, so the re-seed below stops competing with them. */
  const edited = React.useRef(false);

  // Prefill the price when arriving from a listing ("Calculate financing").
  const prefillPrice = searchParams.get('price');
  React.useEffect(() => {
    const price = Number(prefillPrice);
    if (Number.isFinite(price) && price > 0) {
      setDraft((current) => ({ ...current, financing: { ...current.financing, purchasePrice: price } }));
    }
  }, [prefillPrice]);

  // Re-seed when the saved profile changes identity. The draft is seeded once at mount, so a
  // profile that only lands afterwards - the settings request still in flight, or a reload
  // triggered elsewhere - would otherwise leave every field on its blank default. Once the
  // user has typed, their draft wins: a profile arriving late must never overwrite edits.
  React.useEffect(() => {
    if (edited.current || storedProfile == null) {
      return;
    }
    const price = Number(prefillPrice);
    setDraft(
      Number.isFinite(price) && price > 0
        ? { ...storedProfile, financing: { ...storedProfile.financing, purchasePrice: price } }
        : storedProfile,
    );
    // Deliberately keyed on the stored profile alone: the prefill has its own effect, and
    // re-running this one whenever the URL changes would throw away edits in progress.
  }, [storedProfile]);

  // Debounced so a keystroke does not fire a request, and guarded so a slow answer for an older
  // draft cannot overwrite a newer one.
  React.useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      const payload = await actions.finance.calculate(draft);
      if (!cancelled) setDraftSummary(payload);
    }, RECALC_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [draft]);

  // A pinned instalment implies a Tilgung, and only the server computes it. Once a calculation
  // lands, that value is written back into the draft so what gets saved carries a real percentage
  // rather than a stale one. Guarded by an equality check, so this converges in one pass instead
  // of looping.
  React.useEffect(() => {
    const computed = draftSummary?.result?.financing?.scenarios;
    if (!Array.isArray(computed) || computed.length === 0) {
      return;
    }
    const scenarios = draft?.financing?.scenarios;
    if (!Array.isArray(scenarios)) {
      return;
    }
    let changed = false;
    const synced = scenarios.map((scenario, index) => {
      const derived = computed[index]?.tilgung;
      if (scenario.monthlyPayment == null || derived == null || scenario.tilgung === derived) {
        return scenario;
      }
      changed = true;
      return { ...scenario, tilgung: derived };
    });
    if (changed) {
      setDraft((current) => ({ ...current, financing: { ...current.financing, scenarios: synced } }));
    }
  }, [draftSummary]);

  const patchProfile = (patch) => {
    edited.current = true;
    setDraft((current) => ({ ...current, ...patch }));
  };
  const patchFinancing = (patch) => {
    edited.current = true;
    setDraft((current) => ({ ...current, financing: { ...current.financing, ...patch } }));
  };
  const patchRenting = (patch) => {
    edited.current = true;
    setDraft((current) => ({ ...current, renting: { ...current.renting, ...patch } }));
  };

  // Each tab saves on its own. The household is written along with whichever tab is saved,
  // and the other tab is preserved from what is already stored (handled in the store action).
  const saveSection = async (section) => {
    setSaving(section);
    try {
      await actions.userSettings.saveFinanceSection({ section, profile: draft });
      // Only the deliberate Save is counted. The save-on-blur below fires on every field the
      // user leaves, which would measure typing rather than adoption.
      actions.tracking.trackPoi(section === 'rent' ? pois.FINANCE_RENT_PROFILE_SAVED : pois.FINANCE_BUY_PROFILE_SAVED);
      Toast.success(t('finance.saved'));
    } catch (error) {
      Toast.error(errorMessage(error, t('finance.saveFailed')));
    } finally {
      setSaving(null);
    }
  };

  const deleteSection = async (section) => {
    setDeleting(section);
    try {
      await actions.userSettings.deleteFinanceSection(section);
      // The block just deleted goes back to the defaults the server now answers with. Left as it
      // was, the draft still held the deleted values, the bar reported them as unsaved straight
      // away, and pressing Save recreated what had just been removed.
      const refreshed = useFredyState.getState().finance.summary?.profile;
      const key = section === 'rent' ? 'renting' : 'financing';
      if (refreshed != null) {
        setDraft((current) => ({ ...current, [key]: refreshed[key] }));
      }
      actions.tracking.trackPoi(pois.FINANCE_PROFILE_DELETED);
      Toast.success(t('finance.deleted'));
    } catch (error) {
      Toast.error(errorMessage(error, t('finance.deleteFailed')));
    } finally {
      setDeleting(null);
    }
  };

  // A tab can be saved once its own inputs are usable: renting never needs equity or a
  // Bundesland, so the two are judged independently. Both verdicts come back with the draft's
  // calculation rather than being re-derived here.
  const draftComplete = draftSummary?.isComplete === true;
  const draftRentComplete = draftSummary?.rentComplete === true;
  // Whether each tab is currently persisted, which is what the Delete button acts on.
  const rentSaved = stored?.renting != null;
  const buySaved = stored?.financing != null;
  const primary = result?.financing?.primary;

  // Renting is the default, because it is the common case. The only thing that overrides it is
  // arriving from a purchase listing, where the user is plainly here on a buying errand.
  // Computed once: switching tabs afterwards is the user's business, not the component's.
  const [defaultTab] = React.useState(() => (searchParams.get('dealType') === 'buy' ? 'buy' : 'rent'));
  // Tracked because the shared household block sits outside the tabs: when one of its fields is
  // left, the autosave has to know which half it belongs to.
  const [activeTab, setActiveTab] = React.useState(defaultTab);
  /** Whether the optional half of the household is folded open. */
  const [householdOpen, setHouseholdOpen] = React.useState(false);

  // What the draft has changed, per part. Compared against the stored profile rather than tracked
  // per input, for the reason `financeDirty.js` gives; split into three, because this page saves in
  // halves and a bar over the renting tab must not go quiet because the purchase tab was saved.
  const dirtyState = React.useMemo(() => financeDirtyState(draft, storedProfile), [draft, storedProfile]);
  const dirty = isSectionDirty(dirtyState, activeTab);
  const canSave = activeTab === 'rent' ? draftRentComplete : draftComplete;
  // A tab that has never been saved can be complete on the server's defaults alone (renting needs
  // only the household), and then equals what is "stored" field for field. Gated on `dirty` alone,
  // the bar - which holds the only Save - never appeared, and rent verdicts could not be switched on.
  const tabSaved = activeTab === 'rent' ? rentSaved : buySaved;
  const showSaveBar = dirty || (canSave && !tabSaved);

  // Every part, not only the tab on screen: edits left on the other tab are just as unsaved.
  useUnsavedWarning(dirtyState.household || dirtyState.rent || dirtyState.buy);

  /**
   * Put the household and the tab on screen back on what is stored.
   *
   * Only the part this bar saves: the other tab keeps its edits. `edited` is cleared only when
   * nothing is left to protect, so a profile arriving late may seed the draft again - the flag
   * exists to stop a late answer overwriting the user's typing.
   *
   * @returns {void}
   */
  const discard = () => {
    const baseline = storedProfile ?? EMPTY_DRAFT;
    const next = discardSection(draft, baseline, activeTab);
    edited.current = financeDirtyState(next, baseline)[activeTab === 'rent' ? 'buy' : 'rent'];
    setDraft(next);
  };

  return (
    <div className="finance">
      <Headline text={t('finance.title')} />

      {/* One line, and the caveat at the foot of the page. The rule that produces every verdict
          here used to stand third, above the first field, with an accent rule down its side - the
          answer to "why this number?" printed before there was a number. It now lives behind the
          mark on the household card, which is the card that applies it. */}
      <Text className="finance__intro-lead">{t('finance.intro')}</Text>

      {/* Shared by both tabs: one household, one income, one set of living costs. It sits above
          the tabs because deleting a tab must never take the income with it, and because the user
          should not have to type it twice.

          Two fields are in the open and the rest is folded, because `isRentProfileComplete` asks
          for exactly those two and `isProfileComplete` for those two plus equity. Everything
          behind the fold arrives with a working default from `defaultProfile()`. */}
      <section className="finance__household">
        <div>
          <HouseholdHeadline
            profile={draft}
            budget={draftSummary?.budget ?? null}
            housingBudget={result?.recommendation?.recommendedRate ?? null}
            onChange={patchProfile}
            onPersonChange={(patch) => patchProfile({ personA: { ...draft.personA, ...patch } })}
          />

          <Collapse
            className="finance__householdMore"
            keepDOM={false}
            activeKey={householdOpen ? ['more'] : []}
            onChange={(keys) => setHouseholdOpen([].concat(keys ?? []).includes('more'))}
          >
            <Collapse.Panel
              itemKey="more"
              header={
                <span className="finance__foldHeader">
                  <span className="finance__foldTitle">{t('finance.form.moreHousehold')}</span>
                  <span className="finance__foldSummary">{summariseHousehold(draft, t)}</span>
                  <span className="finance__foldToggle">
                    {householdOpen ? t('finance.form.foldClose') : t('finance.form.foldOpen')}
                  </span>
                </span>
              }
            >
              <ProfileForm profile={draft} onChange={patchProfile} />
            </Collapse.Panel>
          </Collapse>
        </div>
      </section>

      {/* Renting and buying answer the same budget question but are otherwise nothing alike, so
          they get a tab each. Each tab saves and deletes on its own, and only the matching tab's
          data applies to a job of that type. */}
      <Tabs type="line" activeKey={activeTab} onChange={setActiveTab} keepDOM={false} className="finance__tabs">
        <TabPane
          itemKey="rent"
          tab={
            <span className="finance__tab finance__tab--rent">
              <IconHome />
              {t('finance.area.rentTitle')}
            </span>
          }
        >
          <Text type="tertiary" size="small" className="finance__tab-lead">
            {t('finance.area.rentLead')}
          </Text>

          <RentPanel
            profile={draft}
            budget={draftSummary?.budget ?? null}
            thresholds={draftSummary?.thresholds?.rent ?? null}
            onChange={patchRenting}
          />

          <SectionDelete
            section="rent"
            saved={rentSaved}
            deleting={deleting === 'rent'}
            onDelete={() => deleteSection('rent')}
            t={t}
          />
        </TabPane>

        <TabPane
          itemKey="buy"
          tab={
            <span className="finance__tab finance__tab--buy">
              <IconKey />
              {t('finance.area.buyTitle')}
            </span>
          }
        >
          <Text type="tertiary" size="small" className="finance__tab-lead">
            {t('finance.area.buyLead')}
          </Text>

          {/* Inputs on the left, the answer on the right. The charts that justify the answer
              rather than give it live in the disclosure below, so the default view is one
              screen of figures instead of five charts the user has to triage. */}
          <Row gutter={[16, 16]} className="finance__split">
            <Col xs={24} lg={10} xl={9}>
              <PropertyForm
                financing={draft.financing ?? EMPTY_DRAFT.financing}
                costs={result?.financing?.closingCosts ?? null}
                totalCost={result?.financing?.totalCost ?? null}
                loanAmount={result?.financing?.loanAmount ?? null}
                onChange={patchFinancing}
              />
              <ScenarioForm
                scenarios={draft.financing?.scenarios ?? []}
                computed={result?.financing?.scenarios ?? []}
                onChange={(scenarios) => patchFinancing({ scenarios })}
              />
            </Col>

            <Col xs={24} lg={14} xl={15}>
              <ResultSummary result={result} />

              <SegmentPart name={t('finance.section.trajectory')} helpText={t('finance.section.trajectoryHelp')}>
                <DebtTrajectoryChart
                  scenarios={result?.financing?.scenarios ?? []}
                  currentAge={draft.personA?.age ?? null}
                />
              </SegmentPart>

              <SegmentPart name={t('finance.section.budget')} helpText={t('finance.section.budgetHelp')}>
                <BudgetChart budget={result?.budget} monthlyRate={primary?.monthlyPayment ?? 0} />
              </SegmentPart>
            </Col>
          </Row>

          {/* keepDOM={false}: closed, these three chart.js canvases are never created at all. */}
          <Collapse className="finance__more" keepDOM={false}>
            <Collapse.Panel itemKey="detail" header={t('finance.section.moreDetail')}>
              <Row gutter={[16, 16]}>
                <Col xs={24} lg={12}>
                  <SegmentPart name={t('finance.section.split')} helpText={t('finance.section.splitHelp')}>
                    <InterestPrincipalChart scenario={primary} />
                  </SegmentPart>
                </Col>
                <Col xs={24} lg={12}>
                  <SegmentPart name={t('finance.section.costs')} helpText={t('finance.section.costsHelp')}>
                    <CostBreakdownChart financing={result?.financing} />
                  </SegmentPart>
                </Col>
              </Row>

              <SegmentPart name={t('finance.section.milestones')} helpText={t('finance.section.milestonesHelp')}>
                <MilestoneTimeline result={result} />
              </SegmentPart>
            </Collapse.Panel>
          </Collapse>

          <SectionDelete
            section="buy"
            saved={buySaved}
            deleting={deleting === 'buy'}
            onDelete={() => deleteSection('buy')}
            t={t}
          />
        </TabPane>
      </Tabs>

      {anyComplete ? (
        <AffordabilityPanel profile={draft} />
      ) : (
        <SegmentPart name={t('finance.panel.title')} helpText={t('finance.panel.help')}>
          <Text type="tertiary" size="small">
            {t('finance.panel.needsProfile')}
          </Text>
        </SegmentPart>
      )}

      <Text className="finance__disclaimer">{t('finance.disclaimer')}</Text>

      {/* One bar for the whole page, sticky, and only while there is something to save - the same
          one every settings page carries. It saves the tab you are on, because that is the half the
          Save writes; the household goes along with whichever half that is, which is why
          `isSectionDirty` counts a household edit towards both.

          `status` rather than a disabled button on its own: renting needs two figures and buying
          three, and a Save that refuses without saying why is the thing that bar exists to avoid. */}
      <SettingsSaveBar
        dirty={showSaveBar}
        saving={saving === activeTab}
        saveDisabled={!canSave}
        saveLabel={t(activeTab === 'rent' ? 'finance.saveRent' : 'finance.saveBuy')}
        note={canSave ? t(activeTab === 'rent' ? 'finance.saveHintRent' : 'finance.saveHintBuy') : null}
        status={
          canSave ? null : (
            <span className="settingsSaveBar__label">
              <span className="settingsSaveBar__dot" aria-hidden="true" />
              {t(activeTab === 'rent' ? 'finance.saveBlockedRent' : 'finance.saveBlockedBuy')}
            </span>
          )
        }
        onSave={() => saveSection(activeTab)}
        onDiscard={discard}
      />
    </div>
  );
}

FinanceCalculator.displayName = 'FinanceCalculator';
