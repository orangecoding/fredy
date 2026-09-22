/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { IconUser, IconHome } from '@douyinfe/semi-icons';

import { useTranslation } from '../../services/i18n/i18n.jsx';

import './ScopeBadge.less';

/**
 * Whose settings a page is changing.
 *
 * Deliberately a chip beside the heading rather than a band above the content. Administration used
 * to carry a full-width coloured band saying the same sentence on all seven of its tabs, and it was
 * removed for good reason: a band reads as "something happened", takes a line of its own and
 * repeats itself on every visit. Four words next to the title repeat themselves too, but they cost
 * nothing to skip and they are where the reader is already looking.
 *
 * It matters because every settings page is its own route. Somebody arriving on
 * `/settings/application` from a link never sees the sentence under the heading of `/settings`,
 * and "which of these two areas am I in" is the question the whole page hangs on.
 *
 * No accent fill: this says where you are, it is not something to press.
 *
 * The personal one says "only for you" rather than naming the account. There is exactly one person
 * reading it and they know who they are, and on the default installation the name is `admin` - so
 * "Only for admin" read as a role, which is the opposite of what the chip is there to say.
 *
 * @param {Object} props
 * @param {'user'|'instance'} props.scope
 * @returns {React.ReactElement}
 */
export default function ScopeBadge({ scope }) {
  const t = useTranslation();
  const isUser = scope === 'user';

  return (
    <span className={`scopeBadge scopeBadge--${isUser ? 'user' : 'instance'}`}>
      {isUser ? <IconUser size="small" /> : <IconHome size="small" />}
      {isUser ? t('settings.scopeUser') : t('settings.scopeInstance')}
    </span>
  );
}

ScopeBadge.displayName = 'ScopeBadge';
