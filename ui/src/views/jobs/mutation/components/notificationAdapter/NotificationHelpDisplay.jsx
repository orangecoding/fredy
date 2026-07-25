/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { MarkdownRender } from '@douyinfe/semi-ui-19';
import { IconChevronDown, IconHelpCircleStroked } from '@douyinfe/semi-icons';

import { useTranslation } from '../../../../../services/i18n/i18n.jsx';

import './NotificationHelpDisplay.less';

/**
 * The selected adapter's setup guide, as a disclosure the user opens while filling in the form.
 *
 * Collapsed by default because this is reference material, not something to read every time: the
 * Telegram guide alone runs to several screens of prose, code and lists, and inlining it pushed
 * the fields the user actually has to fill in below the fold. Someone who already has their token
 * never opens it; someone who does not is one click away, and the open panel scrolls inside itself
 * so the dialog keeps its size either way.
 *
 * Built on native `details`/`summary` rather than a component library accordion: this needs no
 * behaviour beyond open and closed, and the native element brings the semantics, the keyboard
 * handling and the toggle state with it.
 *
 * @param {Object} props
 * @param {string} props.readme Markdown shipped with the adapter.
 */
export default function Help({ readme }) {
  const t = useTranslation();

  if (!readme) {
    return null;
  }

  return (
    <details className="notificationHelp">
      <summary className="notificationHelp__summary">
        <IconHelpCircleStroked className="notificationHelp__icon" />
        <span className="notificationHelp__label">{t('notification.setupInstructions')}</span>
        <IconChevronDown className="notificationHelp__chevron" />
      </summary>
      <div className="notificationHelp__body">
        <MarkdownRender raw={readme} />
      </div>
    </details>
  );
}
