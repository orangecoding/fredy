/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Banner, Button, Checkbox, Input, Modal, Select, Toast } from '@douyinfe/semi-ui-19';

import { useActions, useSelector } from '../../../services/state/store.js';
import { normalizeHost, resolveProviderForUrl } from '../../../services/jobs/providerUrl.js';
import { labelWithFlags } from '../../../services/countryFlags.js';
import { isTourJobId } from '../../../services/tour/tourJob.js';
import { errorMessage } from '../../../services/xhr.js';
import { useScreenWidth } from '../../../hooks/screenWidth.js';
import { useTranslation } from '../../../services/i18n/i18n.jsx';

import './AddListingModal.less';

/**
 * Add one listing by pasting its link (#492).
 *
 * The listing is stored under one of the user's jobs, which is where its deal type, addresses and
 * price alerts come from, so the dialog asks for the job as well as the link. Everything the server
 * could refuse for a reason the user can see coming - a portal Fredy does not know, one it cannot
 * read single adverts from yet - is said under the field while they paste, so the button is never
 * pressed just to learn that.
 *
 * One instance serves the listings page, owned by it like the application dialog.
 *
 * @param {Object} props
 * @param {boolean} props.visible
 * @param {() => void} props.onClose
 * @returns {React.ReactElement}
 */
export default function AddListingModal({ visible, onClose }) {
  const t = useTranslation();
  const actions = useActions();
  const navigate = useNavigate();
  const providers = useSelector((state) => state.provider);
  const jobs = useSelector((state) => state.jobsData.jobs);
  const isMobile = useScreenWidth() <= 850;

  const [url, setUrl] = useState('');
  const [jobId, setJobId] = useState(null);
  const [watch, setWatch] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState(null);
  // Which submit the state on screen belongs to. Closing counts as moving on, so an answer that
  // arrives after the dialog was closed only raises a toast instead of reopening anything.
  const request = useRef(0);

  useEffect(() => {
    if (!visible) return;
    setUrl('');
    setJobId(null);
    setWatch(true);
    setSubmitting(false);
    setOutcome(null);
  }, [visible]);

  // A shared job is somebody else's search, and the tour job disappears when the tour ends: neither
  // is a place to keep a listing.
  const eligibleJobs = useMemo(() => (jobs ?? []).filter((job) => !job.isOnlyShared && !isTourJobId(job.id)), [jobs]);

  const portal = resolveProviderForUrl(url, providers);
  const urlState = describeUrl(url, portal);

  // Until the user picks one: the only job there is, else the first that already searches the
  // pasted portal, which is most often where the listing was missed.
  const suggestedJobId = useMemo(() => {
    if (eligibleJobs.length === 1) return eligibleJobs[0].id;
    if (portal == null) return null;
    return eligibleJobs.find((job) => (job.provider ?? []).some((entry) => entry.id === portal.id))?.id ?? null;
  }, [eligibleJobs, portal]);
  const chosenJobId = jobId ?? suggestedJobId;

  const close = () => {
    request.current += 1;
    onClose();
  };

  const submit = async () => {
    const token = request.current + 1;
    request.current = token;
    setSubmitting(true);
    setOutcome(null);
    let result;
    try {
      result = await actions.listingsData.addListing({ url: url.trim(), jobId: chosenJobId, watch });
    } catch (exception) {
      // 400 and 403 still carry the status, the rest (a dropped connection, a 500) do not.
      result = exception?.json?.status ? exception.json : { status: 'failed', message: errorMessage(exception, null) };
    }
    const current = token === request.current;
    if (current) setSubmitting(false);

    if (result.status === 'created') {
      Toast.success(t('listings.add.created'));
      if (current) {
        onClose();
        navigate(`/listings/listing/${result.listingId}`);
      }
      return;
    }
    if (current) {
      setOutcome(result);
    } else {
      Toast.error(outcomeMessage(result, t, portal?.name));
    }
  };

  const canSubmit = urlState.tone === 'ok' && chosenJobId != null && !submitting;

  const footer = (
    <div className="addListingModal__footer">
      <Button onClick={close}>{t('common.cancel')}</Button>
      {eligibleJobs.length > 0 && (
        <Button theme="solid" type="primary" loading={submitting} disabled={!canSubmit} onClick={submit}>
          {submitting ? t('listings.add.reading') : t('listings.add.submit')}
        </Button>
      )}
    </div>
  );

  return (
    <Modal
      title={t('listings.add.title')}
      visible={visible}
      onCancel={close}
      footer={footer}
      width={isMobile ? '95%' : '34rem'}
    >
      {eligibleJobs.length === 0 ? (
        <div className="addListingModal__noJobs">
          <Banner
            type="info"
            fullMode={false}
            closeIcon={null}
            title={t('listings.add.noJobsTitle')}
            description={t('listings.add.noJobs')}
          />
          <Button
            theme="solid"
            type="primary"
            onClick={() => {
              close();
              navigate('/jobs/new');
            }}
          >
            {t('listings.add.createJob')}
          </Button>
        </div>
      ) : (
        <div className="addListingModal">
          <div className="addListingModal__field">
            <label className="addListingModal__label" htmlFor="addListingUrl">
              {t('listings.add.urlLabel')}
            </label>
            <Input
              id="addListingUrl"
              type="url"
              autoFocus
              placeholder={t('listings.add.urlPlaceholder')}
              value={url}
              disabled={submitting}
              validateStatus={urlState.tone === 'error' ? 'error' : 'default'}
              onChange={(value) => {
                setUrl(value);
                setOutcome(null);
              }}
              onEnterPress={() => canSubmit && submit()}
            />
            <span className={`addListingModal__detect addListingModal__detect--${urlState.tone}`}>
              {urlMessage(urlState, t)}
            </span>
          </div>

          <div className="addListingModal__field">
            <label className="addListingModal__label" htmlFor="addListingJob">
              {t('listings.add.jobLabel')}
            </label>
            <Select
              id="addListingJob"
              className="addListingModal__control"
              placeholder={t('listings.add.jobPlaceholder')}
              value={chosenJobId ?? undefined}
              disabled={submitting}
              optionList={eligibleJobs.map((job) => ({ value: job.id, label: jobLabel(job, t) }))}
              onChange={(value) => {
                setJobId(value);
                setOutcome(null);
              }}
            />
            <span className="addListingModal__hint">{t('listings.add.jobHint')}</span>
          </div>

          <Checkbox
            className="addListingModal__watch"
            checked={watch}
            disabled={submitting}
            extra={t('listings.add.watchHint')}
            onChange={(event) => setWatch(event.target.checked)}
          >
            {t('listings.add.watch')}
          </Checkbox>

          {submitting && (
            <p className="addListingModal__progress">{t('listings.add.progress', { portal: portal?.name ?? '' })}</p>
          )}

          {outcome?.status === 'duplicate' && (
            <Banner
              className="addListingModal__banner"
              type="info"
              fullMode={false}
              closeIcon={null}
              description={outcomeMessage(outcome, t, portal?.name)}
            >
              <Button
                className="addListingModal__open"
                onClick={() => {
                  close();
                  navigate(`/listings/listing/${outcome.listingId}`);
                }}
              >
                {t('listings.add.openListing')}
              </Button>
            </Banner>
          )}

          {outcome != null && outcome.status !== 'duplicate' && (
            <Banner
              className="addListingModal__banner"
              type={outcome.status === 'project' ? 'warning' : 'danger'}
              fullMode={false}
              closeIcon={null}
              description={outcomeMessage(outcome, t, portal?.name)}
            />
          )}
        </div>
      )}
    </Modal>
  );
}

/**
 * A job as the picker names it: with its deal type, because the listing takes it over. A rental
 * added to a buying search is shown and financed as a purchase, and the name alone rarely says
 * which kind of search a job is.
 *
 * @param {{name: string, dealType?: 'rent'|'buy'|null}} job
 * @param {(key: string) => string} t
 * @returns {string}
 */
function jobLabel(job, t) {
  if (job.dealType === 'rent') return `${job.name} · ${t('jobs.mutation.dealTypeRent')}`;
  if (job.dealType === 'buy') return `${job.name} · ${t('jobs.mutation.dealTypeBuy')}`;
  return job.name;
}

/**
 * What can already be said about the pasted link before anything is sent.
 *
 * @param {string} url
 * @param {{name: string, addByUrl?: boolean}|null} portal The provider its host belongs to.
 * @returns {{tone: 'hint'|'ok'|'warning'|'error', kind: 'empty'|'unparsable'|'unknown'|'unsupported'|'supported', portal: Object|null}}
 */
function describeUrl(url, portal) {
  if (url.trim().length === 0) return { tone: 'hint', kind: 'empty', portal: null };
  if (normalizeHost(url) == null) return { tone: 'error', kind: 'unparsable', portal: null };
  if (portal == null) return { tone: 'error', kind: 'unknown', portal: null };
  if (portal.addByUrl !== true) return { tone: 'warning', kind: 'unsupported', portal };
  return { tone: 'ok', kind: 'supported', portal };
}

/**
 * The line under the link field. Always one line, so the dialog does not jump while typing.
 *
 * @param {ReturnType<typeof describeUrl>} state
 * @param {(key: string, params?: Object) => string} t
 * @returns {string}
 */
function urlMessage(state, t) {
  switch (state.kind) {
    case 'unparsable':
      return t('provider.validationUnparsable');
    case 'unknown':
      return t('listings.add.portalUnknown');
    case 'unsupported':
      return t('listings.add.portalUnsupported', { portal: state.portal.name });
    case 'supported':
      return t('listings.add.detected', { portal: labelWithFlags(state.portal) });
    default:
      return t('listings.add.urlHint');
  }
}

/**
 * The server's answer in the user's words.
 *
 * @param {{status: string, jobName?: string|null, provider?: string, message?: string|null}} outcome
 * @param {(key: string, params?: Object) => string} t
 * @param {string} [portalName] The portal the link names, for an answer about it.
 * @returns {string}
 */
function outcomeMessage(outcome, t, portalName) {
  switch (outcome.status) {
    case 'duplicate':
      return outcome.jobName ? t('listings.add.duplicate', { job: outcome.jobName }) : t('listings.add.duplicateNoJob');
    case 'unknownPortal':
      return t('listings.add.portalUnknown');
    case 'unsupported':
      return t('listings.add.portalUnsupported', { portal: portalName ?? outcome.provider ?? '' });
    case 'project':
      return t('listings.add.project');
    case 'unreadable':
      return t('listings.add.unreadable');
    case 'busy':
      return t('listings.add.busy');
    default:
      return outcome.message || t('listings.add.failed');
  }
}
