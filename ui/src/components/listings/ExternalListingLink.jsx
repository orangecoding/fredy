/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Tooltip } from '@douyinfe/semi-ui-19';
import { IconLink } from '@douyinfe/semi-icons';

import './ExternalListingLink.less';

/**
 * Link to a listing on the portal it was scraped from.
 *
 * Deliberately a semantic anchor instead of a `<button>` + `window.open()`, so the
 * browser keeps its native affordances: middle-click and ctrl/cmd-click open the
 * listing in a background tab, the context menu offers "open link in new tab", and
 * screen readers announce it as a link. A button supports none of that.
 *
 * Visually it mirrors a borderless, icon-only Semi `Button` of size `small` so it
 * blends into the surrounding action rows of the grid cards and table rows.
 *
 * @param {object} props
 * @param {string} [props.href] URL of the listing on the original portal.
 * @param {string} props.label Accessible name, also shown as tooltip.
 * @param {string} [props.className] Additional class name for the anchor.
 * @returns {import('react').ReactElement|null} The link, or `null` when no `href` is known.
 */
const ExternalListingLink = ({ href, label, className }) => {
  if (!href) {
    return null;
  }
  return (
    <Tooltip content={label}>
      <a
        className={`externalListingLink${className ? ` ${className}` : ''}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
      >
        <IconLink />
      </a>
    </Tooltip>
  );
};

export default ExternalListingLink;
