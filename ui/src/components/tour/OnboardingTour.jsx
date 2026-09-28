/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Toast } from '@douyinfe/semi-ui-19';
import { useLocation, useNavigate } from 'react-router';

import { useActions } from '../../services/state/store';
import { useTranslation } from '../../services/i18n/i18n.jsx';
import { errorMessage } from '../../services/xhr.js';
import {
  buildTourSteps,
  isActionDone,
  isOnStepPage,
  stepBodyKey,
  stepTitleKey,
} from '../../services/tour/tourSteps.js';
import { placeCard, scrimPanels, spotlightRect } from '../../services/tour/tourPlacement.js';
import {
  TOUR_OUTCOME,
  TOUR_STATUS_RUNNING,
  declineTour,
  fetchTourState,
  finishTour,
  resetTour,
  sendTourCancelBeacon,
  startTour,
} from '../../services/tour/tourClient.js';
import { useTourTarget } from './useTourTarget.js';
import inDevelopment from '../../services/developmentMode.js';

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

/** Below this width the card becomes a sheet from the bottom. Matches the app's phone breakpoint. */
const PHONE_WIDTH = 768;

/** Stable empty target list, so the target hook does not restart on every render of a step without one. */
const NO_TARGETS = Object.freeze([]);

/** What the card is assumed to measure until it has been rendered once. */
const INITIAL_CARD_SIZE = Object.freeze({ width: 440, height: 280 });

/**
 * The pages the invitation lists as the tour's route, by their sidebar labels.
 *
 * @param {boolean} isAdmin
 * @returns {string[]} Translation keys.
 */
function routeStops(isAdmin) {
  const stops = ['nav.dashboard', 'nav.jobs', 'nav.listings', 'nav.mapView', 'nav.finance', 'nav.settings'];
  return isAdmin ? [...stops, 'nav.administration'] : stops;
}

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
 * The window's size, kept current.
 *
 * @returns {{width: number, height: number}}
 */
function useViewport() {
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return viewport;
}

/** @returns {React.ReactElement} */
function CompassIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2 5-5 2 2-5z" />
    </svg>
  );
}

/** @returns {React.ReactElement} */
function PointerIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 11V5a2 2 0 0 1 4 0v5" />
      <path d="M13 10a2 2 0 0 1 4 0v1a2 2 0 0 1 4 0v4a6 6 0 0 1-6 6h-2a6 6 0 0 1-5-2.7L5 14a2 2 0 0 1 3.2-2.4L9 13" />
    </svg>
  );
}

/** @returns {React.ReactElement} */
function ArrowIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/**
 * The onboarding tour: asks a new account once whether it wants a guided tour, and if so, walks it
 * through the app on example data the server lends it for the duration.
 *
 * Each step blurs and dims everything except the element it is about, rings that element, and
 * puts its explanation right next to it. The blur is four panels around the element rather than one
 * sheet, so the element itself stays sharp and can be used.
 *
 * Every way out of the tour removes the example data again - the buttons on the card, Escape, a
 * closed or reloaded tab (a beacon on `pagehide`), and a page that comes back to find a tour it did
 * not start still running. What none of those catch, the server's cleanup cron does.
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
  const viewport = useViewport();

  const [phase, setPhase] = useState(tourOfThisPage != null ? PHASE.RUNNING : PHASE.IDLE);
  const [listingId, setListingId] = useState(tourOfThisPage?.listingId ?? null);
  const [stepIndex, setStepIndex] = useState(tourOfThisPage?.stepIndex ?? 0);
  const [cardSize, setCardSize] = useState(INITIAL_CARD_SIZE);
  const cardRef = useRef(null);
  const primaryRef = useRef(null);

  // Read inside the navigation effect without making it depend on the location: the effect must
  // follow the step, not every click the user makes while a step is open.
  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;

  const steps = useMemo(() => buildTourSteps({ isAdmin, listingId }), [isAdmin, listingId]);
  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const isLast = stepIndex >= steps.length - 1;
  const onStepRoute = isOnStepPage(step, location.pathname);
  const isAction = step?.type === 'action';
  const running = phase === PHASE.RUNNING || phase === PHASE.FINISHING;
  const phone = viewport.width <= PHONE_WIDTH;

  const targetRect = useTourTarget(step?.targets ?? NO_TARGETS, phase === PHASE.RUNNING && onStepRoute);

  // The card is placed from its own size, which depends on the step's text. Measured after every
  // render and stored only when it changed, so this settles after one extra pass.
  useLayoutEffect(() => {
    const element = cardRef.current;
    if (element == null) return;
    const next = { width: element.offsetWidth, height: element.offsetHeight };
    if (next.width !== cardSize.width || next.height !== cardSize.height) {
      setCardSize(next);
    }
  });

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

  // Development only: `fredyTour.restart()` in the browser console forgets this account's answer,
  // removes any example data and reloads, so the invitation shows up again. Offered when either half
  // runs in development: the Vite dev server, or a dev backend serving the built UI (whose own build
  // says production, hence `canReset`). The reset itself is the backend's call and needs it in dev
  // mode. The reload is what clears `tourOfThisPage`, which would otherwise resume the old tour.
  useEffect(() => {
    const register = () => {
      window.fredyTour = {
        async restart() {
          try {
            await resetTour();
          } catch (error) {
            console.warn(
              'The tour can only be reset while the backend runs in dev mode (yarn run start:backend:dev).',
              error,
            );
            return;
          }
          tourOfThisPage = null;
          window.location.reload();
        },
      };
    };
    if (inDevelopment()) {
      register();
      return undefined;
    }
    let unmounted = false;
    fetchTourState()
      .then((state) => {
        if (!unmounted && state?.canReset === true) register();
      })
      .catch(() => {});
    return () => {
      unmounted = true;
    };
  }, []);

  useEffect(() => {
    if (phase !== PHASE.RUNNING || step == null) return;
    tourOfThisPage = { listingId, stepIndex };
    if (!isOnStepPage(step, pathnameRef.current)) {
      navigate(step.route);
    }
    // Keyboard users land on the way forward. Without preventScroll the focus would scroll the page
    // away from the element the step is about.
    primaryRef.current?.focus({ preventScroll: true });
  }, [phase, stepIndex, step?.route]);

  // An action step is done the moment the app is on the page its control leads to, whether the user
  // clicked the control, used the "show me" fallback, or found another way there. Keyed on the path
  // alone: going back to an action step must not count the page it was left from as arriving.
  useEffect(() => {
    if (phase !== PHASE.RUNNING || !isActionDone(step, location.pathname)) return;
    setStepIndex((index) => Math.min(steps.length - 1, index + 1));
  }, [location.pathname]);

  // Closing or reloading the tab ends the tour. A beacon, because an ordinary request would be
  // cancelled together with the page it came from.
  useEffect(() => {
    if (phase !== PHASE.RUNNING) return undefined;
    const onPageHide = () => sendTourCancelBeacon();
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [phase]);

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

  // Escape ends the tour, as the pill on every step says. Not while one of Semi's dialogs is open on
  // top of it, where Escape belongs to that dialog.
  useEffect(() => {
    if (phase !== PHASE.RUNNING) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || document.querySelector('.semi-modal-wrap, .semi-sidesheet') != null) {
        return;
      }
      end(TOUR_OUTCOME.CANCELLED, '/dashboard');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
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

  if ((phase === PHASE.PROMPT || phase === PHASE.STARTING) && !blocked) {
    const starting = phase === PHASE.STARTING;
    return (
      <div className="onboardingTour">
        <div className="onboardingTour__scrim" style={{ top: 0, left: 0, width: '100vw', height: '100vh' }} />
        <div className="onboardingTour__dialogLayer">
          <section
            className="onboardingTour__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="onboardingTour-prompt-title"
          >
            <div className="onboardingTour__dialogHead">
              <span className="onboardingTour__badge">
                <CompassIcon />
                {t('tour.prompt.duration')}
              </span>
              <ol className="onboardingTour__stops">
                {routeStops(isAdmin).map((key, index) => (
                  <li key={key} className="onboardingTour__stop">
                    <span className="onboardingTour__stopDot">{index + 1}</span>
                    <span>{t(key)}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="onboardingTour__dialogBody">
              <h2 id="onboardingTour-prompt-title" className="onboardingTour__dialogTitle">
                {t('tour.prompt.title')}
              </h2>
              <p className="onboardingTour__body">{t(isAdmin ? 'tour.prompt.bodyAdmin' : 'tour.prompt.body')}</p>
              <div className="onboardingTour__actions">
                <button type="button" className="onboardingTour__button" onClick={decline} disabled={starting}>
                  {t('tour.prompt.decline')}
                </button>
                <span className="onboardingTour__spacer" />
                <button
                  type="button"
                  className="onboardingTour__button onboardingTour__button--primary"
                  onClick={accept}
                  disabled={starting}
                  autoFocus
                >
                  {t('tour.prompt.accept')}
                  <ArrowIcon />
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (!running || step == null) {
    return null;
  }

  const busy = phase === PHASE.FINISHING;
  const hole = step.targets.length > 0 && onStepRoute ? spotlightRect(targetRect, viewport) : null;
  const nextStep = steps[stepIndex + 1];
  const placement = placeCard(hole, cardSize, viewport);
  const sideways = placement.side === 'left' || placement.side === 'right';
  const cardClass = [
    'onboardingTour__card',
    phone ? 'onboardingTour__card--sheet' : null,
    !phone && placement.side === 'center' ? 'onboardingTour__card--center' : null,
  ]
    .filter(Boolean)
    .join(' ');
  const finishing = step.id === 'finish';

  return (
    <div className="onboardingTour">
      {scrimPanels(hole, viewport).map((panel, index) => (
        <div key={index} className="onboardingTour__scrim" style={panel} aria-hidden="true" />
      ))}
      {/* On an info step the ring also covers the element, so a click on it cannot navigate the
          tour away mid-explanation - unless the step invites trying it out (the map, the filters).
          On an action step clicks pass through: that click is the step. */}
      {hole != null && (
        <div
          className={`onboardingTour__ring${isAction ? ' onboardingTour__ring--action' : ''}${
            !isAction && step.interactive ? ' onboardingTour__ring--open' : ''
          }`}
          style={hole}
          aria-hidden="true"
        />
      )}

      {!phone && (
        <div className="onboardingTour__pill">
          <CompassIcon />
          <span className="onboardingTour__pillLabel">{t('tour.pill.label')}</span>
          <span className="onboardingTour__pillMuted">{t('tour.pill.example')}</span>
          <span className="onboardingTour__kbd">
            <kbd>Esc</kbd>
            {t('tour.pill.escape')}
          </span>
        </div>
      )}

      <section
        ref={cardRef}
        className={cardClass}
        style={phone ? undefined : { top: placement.top, left: placement.left }}
        role="dialog"
        aria-modal="false"
        aria-labelledby="onboardingTour-title"
      >
        {phone && <span className="onboardingTour__handle" aria-hidden="true" />}
        {!phone && placement.arrow != null && (
          <span
            className={`onboardingTour__arrow onboardingTour__arrow--${placement.side}`}
            style={sideways ? { top: placement.arrow - 7 } : { left: placement.arrow - 7 }}
            aria-hidden="true"
          />
        )}

        {finishing ? (
          <span className="onboardingTour__check" aria-hidden="true">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
        ) : (
          <div className="onboardingTour__head">
            <span className={`onboardingTour__badge${isAction ? ' onboardingTour__badge--action' : ''}`}>
              {isAction ? <PointerIcon /> : <CompassIcon />}
              {t(isAction ? 'tour.yourTurn' : 'tour.badge')}
            </span>
            <span className="onboardingTour__counter">
              {String(stepIndex + 1).padStart(2, '0')} / {String(steps.length).padStart(2, '0')}
            </span>
          </div>
        )}

        <div
          className="onboardingTour__segments"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={stepIndex + 1}
          aria-label={t('tour.progress', { current: String(stepIndex + 1), total: String(steps.length) })}
        >
          {steps.map((candidate, index) => (
            <span
              key={candidate.id}
              className={`onboardingTour__segment${
                index < stepIndex || finishing
                  ? ' onboardingTour__segment--done'
                  : index === stepIndex
                    ? ' onboardingTour__segment--current'
                    : ''
              }`}
            />
          ))}
        </div>

        <h2 id="onboardingTour-title" className="onboardingTour__title">
          {t(stepTitleKey(step.id))}
        </h2>
        <p className="onboardingTour__body" aria-live="polite">
          {t(stepBodyKey(step.id), {
            target: step.labelKey ? t(step.labelKey) : '',
            group: step.groupKey ? t(step.groupKey) : '',
          })}
        </p>

        <div className="onboardingTour__actions">
          {isLast ? (
            <>
              <button
                type="button"
                className="onboardingTour__button"
                disabled={busy}
                onClick={() => end(TOUR_OUTCOME.COMPLETED, '/dashboard')}
              >
                {t('tour.finish')}
              </button>
              <span className="onboardingTour__spacer" />
              <button
                ref={primaryRef}
                type="button"
                className="onboardingTour__button onboardingTour__button--primary"
                disabled={busy}
                onClick={() => end(TOUR_OUTCOME.COMPLETED, '/jobs/new')}
              >
                {t('tour.createJob')}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="onboardingTour__button onboardingTour__button--quiet"
                disabled={busy}
                onClick={() => end(TOUR_OUTCOME.CANCELLED, '/dashboard')}
              >
                {t('tour.skip')}
              </button>
              <span className="onboardingTour__spacer" />
              {stepIndex > 0 && (
                <button
                  type="button"
                  className="onboardingTour__button"
                  disabled={busy}
                  onClick={() => setStepIndex((index) => Math.max(0, index - 1))}
                >
                  {t('tour.back')}
                </button>
              )}
              {isAction ? (
                // No "next" here: the click on the real control is the way on. This is the way out for
                // anybody who cannot find it, and it goes to the same page the control would have.
                <button
                  type="button"
                  className="onboardingTour__button"
                  disabled={busy || nextStep == null}
                  onClick={() => navigate(nextStep.route)}
                >
                  {t('tour.showMe')}
                </button>
              ) : (
                <button
                  ref={primaryRef}
                  type="button"
                  className="onboardingTour__button onboardingTour__button--primary"
                  disabled={busy}
                  onClick={() => setStepIndex((index) => Math.min(steps.length - 1, index + 1))}
                >
                  {t('tour.next')}
                  <ArrowIcon />
                </button>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

OnboardingTour.displayName = 'OnboardingTour';
