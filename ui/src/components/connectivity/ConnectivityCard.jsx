/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Typography } from '@douyinfe/semi-ui-19';

import { useTranslation } from '../../services/i18n/i18n.jsx';
import {
  DISPLAY_TECHNOLOGIES,
  DISPLAY_MOBILE_TECHNOLOGIES,
  FILTERABLE_OPERATORS,
  SOURCE_ATTRIBUTION,
  formatDownstream,
  roundShare,
} from './connectivityFormat.js';
import './connectivity.less';

const { Text } = Typography;

/**
 * What connection a listing's address has, and which mobile networks reach it.
 *
 * The card renders a stored answer and never asks for one itself. The lookup happens once, in the
 * sweep that runs after geocoding, so opening a listing costs nothing - and a listing whose answer
 * has not been filled in yet says so rather than spinning.
 *
 * @param {Object} props
 * @param {import('../../../../lib/services/connectivity/normalize.js').Connectivity|null} [props.connectivity]
 * @returns {React.ReactElement}
 */
export default function ConnectivityCard({ connectivity }) {
  const t = useTranslation();

  if (connectivity == null) {
    return (
      <Text size="small" type="tertiary">
        {t('connectivity.unavailable')}
      </Text>
    );
  }

  const speed = formatDownstream(connectivity.maxDownMbit);
  const share = roundShare(connectivity.sharePercent);
  const attribution = SOURCE_ATTRIBUTION[connectivity.source];
  const mobile = connectivity.mobile;

  return (
    <div className="connectivity">
      {speed == null ? (
        <Text size="small" type="tertiary">
          {t('connectivity.noFixedLine')}
        </Text>
      ) : (
        <div className="connectivity__headline">
          <span className="connectivity__speed">{speed}</span>
          <span className="connectivity__unit">{t('connectivity.mbitPerSecond')}</span>
          {share != null && <span className="connectivity__share">{t('connectivity.householdShare', { share })}</span>}
        </div>
      )}

      <div className="connectivity__row">
        <span className="connectivity__label">{t('connectivity.technologies')}</span>
        <span className="connectivity__chips">
          {DISPLAY_TECHNOLOGIES.map((technology) => {
            const coverage = connectivity.technologies?.[technology];
            // Fibre is the exception: the Swiss register says a square is served by fibre without
            // saying how fast, so a present share and an absent speed still means "yes".
            const available = coverage != null && (coverage.maxDownMbit != null || coverage.sharePercent != null);
            return (
              <span
                key={technology}
                className={`connectivity__chip${available ? ' connectivity__chip--on' : ''}`}
                title={
                  available && coverage.maxDownMbit != null
                    ? t('connectivity.technologyUpTo', { mbit: coverage.maxDownMbit })
                    : undefined
                }
              >
                {t(`connectivity.fixed.${technology}`)}
              </span>
            );
          })}
        </span>
      </div>

      {mobile != null && (
        <>
          <div className="connectivity__row">
            <span className="connectivity__label">{t('connectivity.mobile')}</span>
            <span className="connectivity__chips">
              {DISPLAY_MOBILE_TECHNOLOGIES.filter((technology) => mobile.neutral?.[technology] === true).map(
                (technology) => (
                  <span key={technology} className="connectivity__chip connectivity__chip--on">
                    {t(`connectivity.tech.${technology}`)}
                  </span>
                ),
              )}
              {/* Nothing at all is a statement worth making out loud rather than an empty row. */}
              {DISPLAY_MOBILE_TECHNOLOGIES.every((technology) => mobile.neutral?.[technology] !== true) && (
                <span className="connectivity__chip">{t('connectivity.noMobile')}</span>
              )}
            </span>
          </div>

          {Object.keys(mobile.operators ?? {}).length > 0 && (
            <div className="connectivity__row">
              <span className="connectivity__label">{t('connectivity.operators')}</span>
              <span className="connectivity__chips">
                {FILTERABLE_OPERATORS.filter((code) => mobile.operators?.[code] != null).map((code) => {
                  const best = DISPLAY_MOBILE_TECHNOLOGIES.find(
                    (technology) => mobile.operators[code][technology] === true,
                  );
                  const roaming = (mobile.roamingOnly ?? []).includes(code);
                  return (
                    <span
                      key={code}
                      className={`connectivity__chip connectivity__chip--on${roaming ? ' connectivity__chip--roaming' : ''}`}
                      title={roaming ? t('connectivity.roamingOnly') : undefined}
                    >
                      {t(`connectivity.operator.${code}`)}
                      {best != null && <span>{t(`connectivity.tech.${best}`)}</span>}
                    </span>
                  );
                })}
              </span>
            </div>
          )}

          {/* Switzerland reports how many operators reach a square without naming them, so this is
              all there is to say there - and it is worth saying, because one operator out of three
              means the choice of contract is made for you. */}
          {mobile.operatorCount != null && Object.keys(mobile.operators ?? {}).length === 0 && (
            <div className="connectivity__row">
              <span className="connectivity__label">{t('connectivity.operators')}</span>
              <span className="connectivity__share">
                {t('connectivity.operatorCount', { count: mobile.operatorCount })}
              </span>
            </div>
          )}
        </>
      )}

      {attribution != null && (
        <Text size="small" type="tertiary" className="connectivity__attribution">
          {t('connectivity.sourceNote')}{' '}
          <a href={attribution.href} target="_blank" rel="noreferrer noopener">
            {attribution.label}
          </a>
          {' · '}
          <a href={attribution.extraHref} target="_blank" rel="noreferrer noopener">
            {attribution.extraLabel}
          </a>
        </Text>
      )}
    </div>
  );
}

ConnectivityCard.displayName = 'ConnectivityCard';
