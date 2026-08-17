/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';
import { Button, Col, Collapse, Popconfirm, Row, Tabs, Toast, Typography } from '@douyinfe/semi-ui-19';
import { IconSave, IconHome, IconKey, IconDelete } from '@douyinfe/semi-icons';
import { useSearchParams } from 'react-router';

import Headline from '../../components/headline/Headline.jsx';
import { SegmentPart } from '../../components/segment/SegmentPart.jsx';
import ProfileForm from './components/ProfileForm.jsx';
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

import { useActions, useSelector } from '../../services/state/store.js';
import { errorMessage } from '../../services/xhr.js';
import { useFinanceProfile } from '../../hooks/useFinanceProfile.js';
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
 * The Save/Delete row under a tab. Save persists this tab (and the shared household); Delete,
 * shown only when the tab is currently stored, removes it again behind a confirmation.
 *
 * @param {Object} props
 * @param {'rent'|'buy'} props.section
 * @param {boolean} props.canSave Whether this tab's inputs are complete enough to save.
 * @param {boolean} props.saved Whether this tab is currently persisted.
 * @param {boolean} props.saving
 * @param {boolean} props.deleting
 * @param {() => void} props.onSave
 * @param {() => void} props.onDelete
 * @param {string} props.hint
 * @param {(key: string, params?: Object) => string} props.t
 */
function SectionActions({ section, canSave, saved, saving, deleting, onSave, onDelete, hint, t }) {
  return (
    <div className="finance__save-row">
      <Button theme="solid" type="primary" icon={<IconSave />} loading={saving} disabled={!canSave} onClick={onSave}>
        {t('finance.save')}
      </Button>

      {/* The button names the half it removes. "Delete" alone, on a page with two tabs that
          each own their own data, does not say what is about to disappear. */}
      {saved && (
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
      )}

      <Text type="tertiary" size="small">
        {hint}
      </Text>
    </div>
  );
}

SectionActions.displayName = 'SectionActions';

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
      actions.tracking.trackPoi(pois.FINANCE_PROFILE_DELETED);
      Toast.success(t('finance.deleted'));
    } catch (error) {
      Toast.error(errorMessage(error, t('finance.deleteFailed')));
    } finally {
      setDeleting(null);
    }
  };

  /**
   * Persist quietly when a field loses focus, so edits are not lost by navigating away.
   *
   * Only for a section that is already saved: autosaving a half the user has not set up yet
   * would create it behind their back, and the explicit Save button is what opts them in.
   * No Toast either - a save the user did not ask for should not interrupt them; the failure
   * case still speaks up, because silently losing an edit is the thing worth reporting.
   *
   * @param {'rent'|'buy'} section
   */
  const autoSaveSection = async (section) => {
    const alreadySaved = section === 'rent' ? stored?.renting != null : stored?.financing != null;
    const usable = section === 'rent' ? draftRentComplete : draftComplete;
    if (!alreadySaved || !usable || saving != null || deleting != null) {
      return;
    }
    try {
      await actions.userSettings.saveFinanceSection({ section, profile: draft });
    } catch (error) {
      Toast.error(errorMessage(error, t('finance.saveFailed')));
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

  return (
    <div className="finance">
      <Headline text={t('finance.title')} />

      {/* Two quiet lines instead of a lead, a numbered how-to and a full-width banner: what the
          page is for, and the caveat that it is an estimate. Everything else the user needs to
          know is said where it applies - on the tab, on the field, next to the Save button. */}
      <div className="finance__intro">
        <Text className="finance__intro-lead">{t('finance.intro')}</Text>
        {/* Every verdict on this page, and every chip on the listings pages, comes out of this
            one rule. Stating it up front is the difference between a number the user trusts and
            a number they have to reverse-engineer. */}
        <p className="finance__rule">
          <span className="finance__rule-label">{t('finance.rule.label')}</span>
          {t('finance.rule.body')}
        </p>
        <Text className="finance__intro-note">{t('finance.disclaimer')}</Text>
      </div>

      {/* Shared by both tabs: one household, one income, one set of living costs. It sits above
          the tabs because deleting a tab must never take the income with it, and because the
          user should not have to type it twice. */}
      <section className="finance__household">
        {/* React's onBlur bubbles, so one handler per region autosaves every field inside it
            without each form component having to know that autosave exists. */}
        <div onBlur={() => autoSaveSection(activeTab)}>
          <ProfileForm profile={draft} onChange={patchProfile} />
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

          <div onBlur={() => autoSaveSection('rent')}>
            <RentPanel
              profile={draft}
              budget={draftSummary?.budget ?? null}
              thresholds={draftSummary?.thresholds?.rent ?? null}
              onChange={patchRenting}
            />
          </div>

          <SectionActions
            section="rent"
            canSave={draftRentComplete}
            saved={rentSaved}
            saving={saving === 'rent'}
            deleting={deleting === 'rent'}
            onSave={() => saveSection('rent')}
            onDelete={() => deleteSection('rent')}
            hint={draftRentComplete ? t('finance.saveHintRent') : t('finance.saveBlockedRent')}
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
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={10} xl={9}>
              <div onBlur={() => autoSaveSection('buy')}>
                <PropertyForm
                  financing={draft.financing ?? EMPTY_DRAFT.financing}
                  costs={result?.financing?.closingCosts ?? null}
                  totalCost={result?.financing?.totalCost ?? null}
                  loanAmount={result?.financing?.loanAmount ?? null}
                  onChange={patchFinancing}
                />
              </div>
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

          <SectionActions
            section="buy"
            canSave={draftComplete}
            saved={buySaved}
            saving={saving === 'buy'}
            deleting={deleting === 'buy'}
            onSave={() => saveSection('buy')}
            onDelete={() => deleteSection('buy')}
            hint={draftComplete ? t('finance.saveHintBuy') : t('finance.saveBlockedBuy')}
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
    </div>
  );
}

FinanceCalculator.displayName = 'FinanceCalculator';
