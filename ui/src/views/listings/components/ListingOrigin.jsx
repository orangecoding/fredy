/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Tooltip } from '@douyinfe/semi-ui-19';
import { IconHelpCircle } from '@douyinfe/semi-icons';

import { buildOriginFacts } from '../listingFacts.js';
import { useTranslation, useLocale } from '../../../services/i18n/i18n.jsx';
import './ListingOrigin.less';

/**
 * Fredy's own bookkeeping about this row: which portal it came from, which search found it, when.
 *
 * None of it is a property of the flat, which is the whole reason it has its own card. In the old
 * single list the name of a search job sat between the living space and the number of rooms at the
 * same weight, and a reader had no way to tell which two of the three described the thing they
 * were thinking of renting.
 *
 * @param {Object} props
 * @param {Object} props.listing
 * @returns {React.ReactElement|null}
 */
export default function ListingOrigin({ listing }) {
  const t = useTranslation();
  const locale = useLocale();
  const facts = buildOriginFacts(listing, { t, locale });

  if (facts.length === 0) return null;

  return (
    <section className="listing-card listing-origin">
      <h2 className="listing-card__label">{t('listing.detail.originTitle')}</h2>

      <dl className="listing-origin__list">
        {facts.map((fact) => (
          <div key={fact.id} className="listing-origin__row">
            <dt className="listing-origin__label">
              {fact.label}
              {fact.helpText && (
                <Tooltip content={fact.helpText} position="top">
                  <IconHelpCircle
                    className="listing-origin__help"
                    role="img"
                    aria-label={t('listing.detail.explain', { field: fact.label })}
                  />
                </Tooltip>
              )}
            </dt>
            <dd className="listing-origin__value">
              {fact.href ? (
                <a href={fact.href} target="_blank" rel="noopener noreferrer" className="listing-origin__link">
                  {fact.value}
                </a>
              ) : fact.chip ? (
                <span className="listing-origin__chip">{fact.value}</span>
              ) : (
                fact.value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

ListingOrigin.displayName = 'ListingOrigin';
