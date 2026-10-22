/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useState } from 'react';
import { Modal, Tooltip } from '@douyinfe/semi-ui-19';
import { IconGithubLogo, IconCoinMoneyStroked, IconCreditCardStroked } from '@douyinfe/semi-icons';
import { useActions, useSelector } from '../../services/state/store';
import { useTranslation } from '../../services/i18n/i18n.jsx';
import heart from '../../assets/heart.png';

import './Donate.less';

/**
 * The three places the money can go, ordered by how committing they are: GitHub Sponsors and
 * Ko-fi both offer a recurring option, PayPal is the one-off tip for everyone who wants neither
 * an account nor a subscription. Each carries its own POI because they are not interchangeable.
 *
 * @type {Array<{href: string, label: string, poi: string, Icon: import('react').ElementType}>}
 */
const DONATION_TARGETS = [
  {
    href: 'https://github.com/sponsors/orangecoding',
    label: 'donate.github',
    poi: 'DONATION_GITHUB_CLICKED',
    Icon: IconGithubLogo,
  },
  {
    href: 'https://ko-fi.com/orangecoding',
    label: 'donate.kofi',
    poi: 'DONATION_KOFI_CLICKED',
    Icon: IconCoinMoneyStroked,
  },
  {
    href: 'https://paypal.me/chriztian',
    label: 'donate.paypal',
    poi: 'DONATION_PAYPAL_CLICKED',
    Icon: IconCreditCardStroked,
  },
];

/**
 * The support entry in the sidebar: a button that opens a dialog with the three donation
 * targets. Everything sits behind that one click on purpose - Fredy asks once, visibly, and
 * never interrupts on its own.
 *
 * @param {object} props
 * @param {boolean} props.collapsed Whether the sidebar is collapsed to its icon rail.
 * @returns {import('react').ReactElement}
 */
export default function Donate({ collapsed }) {
  const t = useTranslation();
  const actions = useActions();
  const pois = useSelector((state) => state.tracking.pois);
  const [visible, setVisible] = useState(false);

  const open = () => {
    setVisible(true);
    actions.tracking.trackPoi(pois.DONATION_MODAL_OPENED);
  };

  // One of the sidebar's quiet utility rows. The heart out of the logo rather than a drawn outline,
  // so the one red thing in the sidebar is the same heart the brand is.
  const trigger = (
    <button
      type="button"
      className="navigate__utility"
      onClick={open}
      aria-label={collapsed ? t('donate.button') : undefined}
    >
      <span className="navigate__utilityIcon">
        <img className="donate__heart-icon" src={heart} alt="" />
      </span>
      {!collapsed && <span>{t('donate.button')}</span>}
    </button>
  );

  return (
    <>
      {/* In the rail the label is gone and a bare heart could mean anything, so it says what it is
          on hover, like every other icon there. */}
      {collapsed ? (
        <Tooltip content={t('donate.button')} position="right">
          {trigger}
        </Tooltip>
      ) : (
        trigger
      )}

      <Modal visible={visible} onCancel={() => setVisible(false)} footer={null} centered width={460}>
        <div className="donate__content">
          <img className="donate__heart" src={heart} width={54} alt="" />
          <h3 className="donate__title">{t('donate.title')}</h3>
          <p className="donate__paragraph">{t('donate.paragraph1')}</p>
          <p className="donate__paragraph">{t('donate.paragraph2')}</p>
          <div className="donate__targets">
            {DONATION_TARGETS.map(({ href, label, poi, Icon }) => (
              <a
                key={label}
                className="donate__target"
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => actions.tracking.trackPoi(pois[poi])}
              >
                <Icon size="large" />
                {t(label)}
              </a>
            ))}
          </div>
          <p className="donate__fine">{t('donate.fine')}</p>
        </div>
      </Modal>
    </>
  );
}
