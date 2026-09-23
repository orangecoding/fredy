/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { IconArrowUpRight } from '@douyinfe/semi-icons';

import { SECTION_BY_REQUIREMENT, scrollToSection } from './jobSections.js';
import { useTranslation } from '../../../services/i18n/i18n.jsx';

import './JobReadinessBar.less';

/**
 * What is still missing before this job can be saved.
 *
 * `missingRequirements` has always returned a list of named rules and the form has always thrown
 * it away, keeping only `length > 0` to disable the Save button. Both files said so in their own
 * comments for months. This is that list, rendered.
 *
 * Each entry is a button rather than a label: the section it names can be several screens away, and
 * a user who has just been told that a provider is missing should not then have to find it. The
 * arrow says so before it is pressed.
 *
 * Renders nothing once nothing is missing. The save bar around it is then one row of buttons, and a
 * line reading "everything is here" above a button that is finally pressable says nothing the
 * button does not - the same argument that keeps the bar itself away until there is an edit.
 *
 * Lives as the `status` of `SettingsSaveBar`, which is the live region and brings the chrome, so
 * this announces nothing of its own: two nested live regions would have a screen reader read the
 * list twice.
 *
 * @param {Object} props
 * @param {{ key: string }[]} props.missing Straight from `missingRequirements`.
 * @param {(sectionId: string) => void} [props.onJump] Called after scrolling, with the section id.
 * @returns {React.ReactElement|null}
 */
export default function JobReadinessBar({ missing = [], onJump }) {
  const t = useTranslation();

  if (missing.length === 0) {
    return null;
  }

  const jump = (sectionId) => {
    scrollToSection(sectionId);
    onJump?.(sectionId);
  };

  return (
    <div className="jobReadiness">
      <span className="jobReadiness__label">
        <span className="jobReadiness__dot" aria-hidden="true" />
        {t('jobs.mutation.stillOpen')}
      </span>

      <span className="jobReadiness__items">
        {missing.map((requirement) => {
          const label = t(`jobs.mutation.requirement.${requirement.key}`);
          return (
            <button
              key={requirement.key}
              type="button"
              className="jobReadiness__item"
              aria-label={t('jobs.mutation.jumpTo', { name: label })}
              onClick={() => jump(SECTION_BY_REQUIREMENT[requirement.key])}
            >
              {label}
              <IconArrowUpRight aria-hidden="true" />
            </button>
          );
        })}
      </span>
    </div>
  );
}

JobReadinessBar.displayName = 'JobReadinessBar';
