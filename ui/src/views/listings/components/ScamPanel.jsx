/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';
import { Button, Toast, Typography } from '@douyinfe/semi-ui-19';
import { IconAlertTriangle, IconTickCircle } from '@douyinfe/semi-icons';

import { readScamVerdict, SCAM_OVERRIDES } from '../../../services/listings/scamSignals.js';
import { useActions } from '../../../services/state/store.js';
import { useTranslation } from '../../../services/i18n/i18n.jsx';

import './ScamPanel.less';

const { Text, Title } = Typography;

/**
 * Why Fredy thinks this listing might be a fraud, and the two buttons that overrule it.
 *
 * The reasons are the point. A bare "potential scam" label is worth very little: the reader cannot
 * check it, cannot learn from it, and has no way to tell a real find from a word list tripping over
 * an innocent sentence. Naming what fired turns the warning into something the reader can agree or
 * disagree with in the ad itself, which is also the only way they can make a sensible decision about
 * the two buttons underneath.
 *
 * The buttons are a toggle pair, and pressing the active one again clears the verdict rather than
 * doing nothing. Somebody who marked a listing safe in haste needs a way back that does not involve
 * knowing there is a third state.
 *
 * The panel outlives the warning. Once a listing is marked safe the chip on the card is gone, but
 * this stays, greyed, listing what was found: coming back a week later and being unable to see what
 * was once flagged is worse than a slightly busier page.
 *
 * @param {Object} props
 * @param {Object|null} props.listing A row as the listings API returns it.
 * @param {() => void} [props.onChange] Called after a verdict is stored, so the page can re-read it.
 * @returns {React.ReactElement|null}
 */
export default function ScamPanel({ listing, onChange }) {
  const t = useTranslation();
  const actions = useActions();
  const [saving, setSaving] = React.useState(false);

  const verdict = readScamVerdict(listing);
  if (!verdict.hasAnything) {
    return null;
  }

  /**
   * @param {('scam'|'safe')} next The button that was pressed.
   */
  const decide = async (next) => {
    setSaving(true);
    try {
      // Pressing the active button again is the way out, so it sends null rather than repeating a
      // verdict that is already stored.
      await actions.listingsData.setListingScamOverride(listing.id, verdict.override === next ? null : next);
      onChange?.();
    } catch {
      Toast.error(t('listing.detail.scamSaveError'));
    } finally {
      setSaving(false);
    }
  };

  const isScam = verdict.override === SCAM_OVERRIDES.SCAM;
  const isSafe = verdict.override === SCAM_OVERRIDES.SAFE;

  return (
    <section className={`scamPanel${verdict.suspicious ? '' : ' scamPanel--dismissed'}`}>
      <div className="scamPanel__header">
        <IconAlertTriangle className="scamPanel__icon" />
        <Title heading={5} className="scamPanel__title">
          {verdict.suspicious ? t('listing.detail.scamTitle') : t('listing.detail.scamTitleDismissed')}
        </Title>
      </div>

      {verdict.signals.length > 0 ? (
        <>
          <Text type="tertiary" size="small" className="scamPanel__lead">
            {t('listing.detail.scamLead')}
          </Text>
          <ul className="scamPanel__reasons">
            {verdict.signals.map((signal) => (
              <li key={signal} className="scamPanel__reason">
                {t(`listings.scamSignal.${signal}`)}
              </li>
            ))}
          </ul>
        </>
      ) : (
        // Marked by hand on a listing nothing fired on, so there is no list to show and saying so
        // is better than an empty bullet list.
        <Text type="tertiary" size="small" className="scamPanel__lead">
          {t('listing.detail.scamNoSignals')}
        </Text>
      )}

      <Text type="tertiary" size="small" className="scamPanel__disclaimer">
        {t('listing.detail.scamDisclaimer')}
      </Text>

      <div className="scamPanel__actions">
        <Button
          size="small"
          theme={isScam ? 'solid' : 'borderless'}
          type="danger"
          loading={saving}
          icon={<IconAlertTriangle />}
          onClick={() => decide(SCAM_OVERRIDES.SCAM)}
        >
          {t('listing.detail.scamMarkAsScam')}
        </Button>
        <Button
          size="small"
          theme={isSafe ? 'solid' : 'borderless'}
          type="tertiary"
          loading={saving}
          icon={<IconTickCircle />}
          onClick={() => decide(SCAM_OVERRIDES.SAFE)}
        >
          {t('listing.detail.scamMarkAsSafe')}
        </Button>
      </div>
    </section>
  );
}

ScamPanel.displayName = 'ScamPanel';
