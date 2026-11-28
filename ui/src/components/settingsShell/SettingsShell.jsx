/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Fragment } from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import Headline from '../headline/Headline.jsx';
import { IconChevronRight } from '../icons/StrokeIcons.jsx';
import { usePhoneLayout } from '../../hooks/screenWidth.js';
import { useTranslation } from '../../services/i18n/i18n.jsx';

import './SettingsShell.less';

/**
 * The frame both settings areas share: a way between the area's pages, the current page's heading,
 * and whatever the current sub-route renders.
 *
 * Every page is a route of its own rather than a tab index, so it is a place you can link to,
 * bookmark and reload onto instead of a pane that resets to the first one on every visit.
 *
 * On a wide screen the pages are a column beside the page, each with its icon. They used to be a
 * strip of tabs under the heading, which at seven pages wrapped into two rows, each with its own rule
 * under it. The column names the area and whose settings it holds once, at its top, so the heading
 * can name the page itself.
 *
 * A phone has no room for the column. The area's own address shows a list of every page instead
 * (`SettingsIndex`, which draws its own heading, so the shell steps aside there), and a page says
 * where it sits with a breadcrumb above its heading. The app bar carries the way back to the list.
 *
 * @param {Object} props
 * @param {string} props.title The area's name, at the top of the column.
 * @param {string} props.hint Whose settings the area holds, under its name.
 * @param {React.ReactNode} [props.badge] Whose settings these are, beside the page heading. See
 *   ScopeBadge. Somebody arriving on a page from a link starts reading there, not in the column.
 * @param {{path: string, label: string, icon?: React.ComponentType, flag?: React.ReactNode}[]} props.tabs
 *   The area's pages, in order. `flag` is a state the page's entry reports, such as debug capture
 *   running.
 * @param {React.ReactNode} [props.banner] Rendered under the heading, for something that really did
 *   just happen.
 * @param {any} [props.context] Passed to the sub-route through `useOutletContext()`.
 * @param {{path: string, label: string}[]} props.crumbs The way from the settings list to this area,
 *   for the phone's breadcrumb. The current page is added to it.
 * @returns {React.ReactElement}
 */
export default function SettingsShell({ title, hint, badge = null, tabs, banner = null, context = undefined, crumbs }) {
  const t = useTranslation();
  const location = useLocation();
  const phone = usePhoneLayout();

  // Longest prefix wins, so '/admin/users/edit/:id' still marks the Users page as current instead of
  // falling through to no selection at all.
  const matched = tabs
    .filter((tab) => location.pathname === tab.path || location.pathname.startsWith(tab.path + '/'))
    .sort((a, b) => b.path.length - a.path.length)[0];

  // The area's own address. On a wide screen it redirects to the first page; on a phone it is the
  // list of every page, which has a heading of its own.
  if (phone && matched == null) {
    return <Outlet context={context} />;
  }

  return (
    <div className={`settingsShell${phone ? '' : ' settingsShell--split'}`}>
      {!phone && (
        <nav className="settingsShell__subnav" aria-label={title}>
          <div className="settingsShell__subnavHeader">
            <span className="settingsShell__subnavTitle">{title}</span>
            <span className="settingsShell__subnavHint">{hint}</span>
          </div>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.path === matched?.path;
            return (
              <Link
                key={tab.path}
                className={`settingsShell__subnavItem${isActive ? ' settingsShell__subnavItem--active' : ''}`}
                to={tab.path}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="settingsShell__subnavIcon">{Icon && <Icon />}</span>
                <span className="settingsShell__subnavLabel">{tab.label}</span>
                {tab.flag}
              </Link>
            );
          })}
        </nav>
      )}

      <div className="settingsShell__main">
        {phone && (
          <nav className="settingsShell__crumbs" aria-label={t('nav.breadcrumb')}>
            {crumbs.map((crumb) => (
              <Fragment key={crumb.path}>
                <Link className="settingsShell__crumb" to={crumb.path}>
                  {crumb.label}
                </Link>
                <IconChevronRight className="settingsShell__crumbSep" />
              </Fragment>
            ))}
            <span className="settingsShell__crumb settingsShell__crumb--current" aria-current="page">
              {matched.label}
            </span>
          </nav>
        )}
        <Headline text={matched?.label ?? title} badge={badge} />
        {banner}
        <div className="settingsShell__content">
          <Outlet context={context} />
        </div>
      </div>
    </div>
  );
}

SettingsShell.displayName = 'SettingsShell';
