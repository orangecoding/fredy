/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useRef, useState } from 'react';
import { Select, Tooltip } from '@douyinfe/semi-ui-19';

/**
 * A filter dropdown with its explanation attached, without the two fighting each other.
 *
 * A plain `<Tooltip><Select/></Tooltip>` strobes as soon as the dropdown opens: Semi renders
 * the option list through a React portal, and React dispatches synthetic mouseenter/mouseleave
 * along the *component* tree rather than the DOM tree. Every move between the option list and
 * the page therefore lands on the tooltip trigger and toggles it.
 *
 * So the tooltip is driven by hand instead. `trigger="custom"` stops Semi binding any hover
 * handlers of its own, and visibility comes from native DOM listeners on the wrapper - native
 * enter/leave never cross into the portal, because the portal is not a DOM descendant. The
 * tooltip additionally stays down while the dropdown is open, so it cannot overlap the options.
 *
 * @param {Object} props
 * @param {string} props.help Explanation of what this filter does.
 * @param {string} [props.className] Added to the wrapper element.
 * @param {React.ReactNode} props.children `Select.Option`s.
 */
export default function FilterSelect({ help, className = '', children, ...selectProps }) {
  const wrapper = useRef(null);
  const [hovered, setHovered] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    const node = wrapper.current;
    if (node == null) {
      return undefined;
    }
    const show = () => setHovered(true);
    const hide = () => setHovered(false);
    node.addEventListener('mouseenter', show);
    node.addEventListener('mouseleave', hide);
    return () => {
      node.removeEventListener('mouseenter', show);
      node.removeEventListener('mouseleave', hide);
    };
  }, []);

  return (
    <Tooltip content={help} position="top" trigger="custom" visible={hovered && !dropdownOpen}>
      <span ref={wrapper} className={`listingsOverview__topbar__tooltipWrap ${className}`.trim()}>
        <Select {...selectProps} onDropdownVisibleChange={setDropdownOpen}>
          {children}
        </Select>
      </span>
    </Tooltip>
  );
}

FilterSelect.displayName = 'FilterSelect';
