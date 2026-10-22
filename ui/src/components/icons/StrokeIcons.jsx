/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The line icons the interface is drawn with: the sidebar, the dashboard and the listing cards.
 *
 * Semi's set is mostly filled glyphs at a heavier weight than the type around them, and it has no
 * calculator, no folded map and no sliders. One set drawn on the same 24 grid with the same 1.7
 * stroke keeps every icon at the weight of the text it sits beside.
 *
 * Every icon is sized like a Semi icon (1em, `currentColor`), so it drops into the same slots, and
 * is hidden from assistive technology: the control it sits in carries the name.
 */

/**
 * The shared frame of a line icon.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children The paths.
 * @param {boolean} [props.filled] Fill the shape with the current colour as well, for an on state
 *   such as a watched star.
 * @returns {React.ReactElement}
 */
function Stroke({ children, filled = false, ...rest }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      focusable={false}
      aria-hidden={true}
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconOverview = (props) => (
  <Stroke {...props}>
    <path d="M3 10.5L12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
  </Stroke>
);

export const IconListings = (props) => (
  <Stroke {...props}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </Stroke>
);

export const IconMap = (props) => (
  <Stroke {...props}>
    <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
    <path d="M9 4v14M15 6v14" />
  </Stroke>
);

export const IconSearches = (props) => (
  <Stroke {...props}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.2-4.2" />
  </Stroke>
);

export const IconFinance = (props) => (
  <Stroke {...props}>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M8 7h8M8 11h2M12 11h2M8 15h2M12 15h2M8 18h2M12 18h2" />
  </Stroke>
);

export const IconSliders = (props) => (
  <Stroke {...props}>
    <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
    <circle cx="15" cy="6" r="2" />
    <circle cx="9" cy="12" r="2" />
    <circle cx="17" cy="18" r="2" />
  </Stroke>
);

export const IconAdmin = (props) => (
  <Stroke {...props}>
    <rect x="3" y="4" width="18" height="7" rx="1.5" />
    <rect x="3" y="13" width="18" height="7" rx="1.5" />
    <path d="M7 7.5h.01M7 16.5h.01" />
  </Stroke>
);

export const IconBell = (props) => (
  <Stroke {...props}>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10 21h4" />
  </Stroke>
);

export const IconSidebar = (props) => (
  <Stroke {...props}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
  </Stroke>
);

export const IconLogout = (props) => (
  <Stroke {...props}>
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
    <path d="M10 17l-5-5 5-5M5 12h11" />
  </Stroke>
);

/**
 * @param {Object} props
 * @param {boolean} [props.filled] Draw the star filled, for a listing on the watch list.
 */
export const IconStar = ({ filled = false, ...props }) => (
  <Stroke filled={filled} {...props}>
    <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
  </Stroke>
);

export const IconExternal = (props) => (
  <Stroke {...props}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Stroke>
);

export const IconCopy = (props) => (
  <Stroke {...props}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a1 1 0 0 1 1-1h10" />
  </Stroke>
);

export const IconMore = (props) => (
  <Stroke {...props}>
    <circle cx="5" cy="12" r="0.6" fill="currentColor" />
    <circle cx="12" cy="12" r="0.6" fill="currentColor" />
    <circle cx="19" cy="12" r="0.6" fill="currentColor" />
  </Stroke>
);

export const IconChevronDown = (props) => (
  <Stroke {...props}>
    <path d="M6 9l6 6 6-6" />
  </Stroke>
);

export const IconChevronUpDown = (props) => (
  <Stroke {...props}>
    <path d="M7 15l5 5 5-5M7 9l5-5 5 5" />
  </Stroke>
);

export const IconArrowRight = (props) => (
  <Stroke {...props}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Stroke>
);

export const IconPlay = (props) => (
  <Stroke filled strokeWidth="0" {...props}>
    <path d="M7 4.5v15l12-7.5z" />
  </Stroke>
);

export const IconWarning = (props) => (
  <Stroke {...props}>
    <path d="M12 3.5l9 16H3z" />
    <path d="M12 10v4M12 17h.01" />
  </Stroke>
);

export const IconHouse = (props) => (
  <Stroke {...props}>
    <path d="M3 10.5L12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
  </Stroke>
);
