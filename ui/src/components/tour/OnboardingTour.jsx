/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Modal, Toast } from '@douyinfe/semi-ui-19';
import { useLocation, useNavigate } from 'react-router';

import { useActions } from '../../services/state/store';
import { useTranslation } from '../../services/i18n/i18n.jsx';
import { errorMessage } from '../../services/xhr.js';
import { buildTourSteps, stepBodyKey, stepTitleKey } from '../../services/tour/tourSteps.js';
import {
  TOUR_OUTCOME,
  TOUR_STATUS_RUNNING,
  declineTour,
  fetchTourState,
  finishTour,
  sendTourCancelBeacon,
  startTour,
} from '../../services/tour/tourClient.js';
import { useTourHighlight } from './useTourHighlight.js';

import './OnboardingTour.less';

/**
 * Where the tour is, from this component's point of view.
 *
 * @type {Readonly<{IDLE: 'idle', PROMPT: 'prompt', STARTING: 'starting', RUNNING: 'running', FINISHING: 'finishing'}>}
 */
const PHASE = Object.freeze({
  IDLE: 'idle',
  PROMPT: 'prompt',
  STARTING: 'starting',
  RUNNING: 'running',
  FINISHING: 'finishing',
});

/**
 * The tour this page load started, if any.
 *
 * Module scope rather than component state, because it has to outlive a remount: on mount, a tour
 * the server reports as running is either this page's own (resume it) or the leftover of a page
 * that was closed without saying so (cancel it and remove its data). Only something that survives
 * the component but not the page can tell the two apart.
 *
 * @type {{listingId: string|null, stepIndex: number}|null}
 */
let tourOfThisPage = null;

/**
 * The onboarding tour: asks a new account once whether it wants a guided tour, and if so, walks it
 * through the app on example data the server lends it for the duration.
 *
 * Every way out of the tour removes the example data again - the buttons on the card, a closed or
 * reloaded tab (a beacon on `pagehide`), and a page that comes back to find a tour it did not start
 * still running. What none of those catch, the server's cleanup cron does.
 *
 * @param {Object} props
 * @param {boolean} props.isAdmin Administrators also get the administration step.
 * @param {boolean} props.blocked True while another first-run dialog is on screen. The question
 *   waits for it instead of stacking a second dialog on top.
 * @returns {React.ReactElement|null}
 */
export default function OnboardingTour({ isAdmin, blocked }) {
  const t = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const actions = useActions();

  const [phase, setPhase] = useState(tourOfThisPage != null ? PHASE.RUNNING : PHASE.IDLE);
  const [listingId, setListingId] = useState(tourOfThisPage?.listingId ?? null);
  const [stepIndex, setStepIndex] = useState(tourOfThisPage?.stepIndex ?? 0);

  // Read inside the navigation effect without making it depend on the location: the effect must
  // follow the step, not every click the user makes in the sidebar while a step is open.
  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;

  const steps = useMemo(() => buildTourSteps({ isAdmin, listingId }), [isAdmin, listingId]);
  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const isLast = stepIndex >= steps.length - 1;
  const onStepRoute = step != null && location.pathname === step.route;
  const running = phase === PHASE.RUNNING || phase === PHASE.FINISHING;

  useTourHighlight(step?.target ?? null, phase === PHASE.RUNNING && onStepRoute);

  /** Reload what the example data changed: the job list and the dashboard. */
  const refreshData = () => {
    actions.jobsData.getJobs();
    actions.dashboard.getDashboard();
  };

  useEffect(() => {
    if (tourOfThisPage != null) {
      return undefined;
    }
    let unmounted = false;
    fetchTourState()
      .then(async (state) => {
        if (unmounted || state == null) return;
        if (state.status === TOUR_STATUS_RUNNING) {
          // Running, but not started by this page: the tab that started it is gone. Its example data
          // must not outlive it.
          await finishTour(TOUR_OUTCOME.CANCELLED).catch((error) => {
            console.warn('Could not cancel a tour left behind by an earlier page.', error);
          });
          refreshData();
          return;
        }
        if (state.offer) {
          setPhase(PHASE.PROMPT);
        }
      })
      .catch((error) => console.warn('Could not load the onboarding tour state.', error));
    return () => {
      unmounted = true;
    };
  }, []);

  useEffect(() => {
    if (phase !== PHASE.RUNNING || step == null) return;
    tourOfThisPage = { listingId, stepIndex };
    if (pathnameRef.current !== step.route) {
      navigate(step.route);
    }
  }, [phase, stepIndex, step?.route]);

  // Closing or reloading the tab ends the tour. A beacon, because an ordinary request would be
  // cancelled together with the page it came from.
  useEffect(() => {
    if (phase !== PHASE.RUNNING) return undefined;
    const onPageHide = () => sendTourCancelBeacon();
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [phase]);

  const accept = async () => {
    setPhase(PHASE.STARTING);
    try {
      const started = await startTour();
      tourOfThisPage = { listingId: started?.listingId ?? null, stepIndex: 0 };
      setListingId(started?.listingId ?? null);
      setStepIndex(0);
      refreshData();
      setPhase(PHASE.RUNNING);
    } catch (error) {
      Toast.error(errorMessage(error, t('tour.startError')));
      setPhase(PHASE.IDLE);
    }
  };

  const decline = () => {
    setPhase(PHASE.IDLE);
    // Best effort: if the answer cannot be stored, the question simply comes back on the next visit.
    declineTour().catch((error) => console.warn('Could not store that the tour was declined.', error));
  };

  /**
   * End the tour, remove the example data, and leave the user somewhere that does not show it.
   *
   * @param {'completed'|'cancelled'} outcome
   * @param {string} destination
   */
  const end = async (outcome, destination) => {
    setPhase(PHASE.FINISHING);
    tourOfThisPage = null;
    try {
      await finishTour(outcome);
    } catch (error) {
      // The cleanup cron removes the data once the tour has outlived its time. Nothing the user can
      // do about it here, so no toast.
      console.warn('Could not end the onboarding tour.', error);
    }
    refreshData();
    setPhase(PHASE.IDLE);
    navigate(destination);
  };

  if ((phase === PHASE.PROMPT || phase === PHASE.STARTING) && !blocked) {
    const starting = phase === PHASE.STARTING;
    return (
      <Modal
        visible
        title={t('tour.prompt.title')}
        closable={false}
        maskClosable={false}
        closeOnEsc={false}
        footer={
          <>
            <Button onClick={decline} disabled={starting}>
              {t('tour.prompt.decline')}
            </Button>
            <Button theme="solid" type="primary" loading={starting} onClick={accept}>
              {t('tour.prompt.accept')}
            </Button>
          </>
        }
      >
        <p className="onboardingTourPrompt__body">{t(isAdmin ? 'tour.prompt.bodyAdmin' : 'tour.prompt.body')}</p>
      </Modal>
    );
  }

  if (!running || step == null) {
    return null;
  }

  const busy = phase === PHASE.FINISHING;
  const progress = ((stepIndex + 1) / steps.length) * 100;

  return (
    <section className="onboardingTour" role="dialog" aria-modal="false" aria-labelledby="onboardingTour-title">
      <div className="onboardingTour__progress" aria-hidden="true">
        <div className="onboardingTour__progressBar" style={{ width: `${progress}%` }} />
      </div>
      <span className="onboardingTour__counter">
        {t('tour.progress', { current: String(stepIndex + 1), total: String(steps.length) })}
      </span>
      <h2 id="onboardingTour-title" className="onboardingTour__title">
        {t(stepTitleKey(step.id))}
      </h2>
      <p className="onboardingTour__body" aria-live="polite">
        {t(stepBodyKey(step.id))}
      </p>
      <div className="onboardingTour__actions">
        {!isLast && (
          <Button
            theme="borderless"
            type="tertiary"
            disabled={busy}
            onClick={() => end(TOUR_OUTCOME.CANCELLED, '/dashboard')}
          >
            {t('tour.skip')}
          </Button>
        )}
        <span className="onboardingTour__spacer" />
        {stepIndex > 0 && (
          <Button disabled={busy} onClick={() => setStepIndex((index) => Math.max(0, index - 1))}>
            {t('tour.back')}
          </Button>
        )}
        {isLast ? (
          <>
            <Button disabled={busy} onClick={() => end(TOUR_OUTCOME.COMPLETED, '/dashboard')}>
              {t('tour.finish')}
            </Button>
            <Button
              theme="solid"
              type="primary"
              loading={busy}
              onClick={() => end(TOUR_OUTCOME.COMPLETED, '/jobs/new')}
            >
              {t('tour.createJob')}
            </Button>
          </>
        ) : (
          <Button
            theme="solid"
            type="primary"
            disabled={busy}
            onClick={() => setStepIndex((index) => Math.min(steps.length - 1, index + 1))}
          >
            {t('tour.next')}
          </Button>
        )}
      </div>
    </section>
  );
}

OnboardingTour.displayName = 'OnboardingTour';
