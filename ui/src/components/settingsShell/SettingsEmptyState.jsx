/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import './SettingsEmptyState.less';

/**
 * What a settings section says when it holds nothing yet.
 *
 * Three things, in this order: what is missing, what that costs, and the one button that fixes it.
 * An empty table says only the first, and on the notification page that is the page every new user
 * has to visit before a single job can reach them.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.icon
 * @param {string} props.title
 * @param {string} props.description
 * @param {React.ReactNode} props.action
 * @returns {React.ReactElement}
 */
export default function SettingsEmptyState({ icon, title, description, action }) {
  return (
    <div className="settingsEmptyState">
      <span className="settingsEmptyState__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="settingsEmptyState__title">{title}</span>
      <p className="settingsEmptyState__text">{description}</p>
      <span className="settingsEmptyState__action">{action}</span>
    </div>
  );
}

SettingsEmptyState.displayName = 'SettingsEmptyState';
