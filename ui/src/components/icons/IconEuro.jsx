/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * A euro coin, for every place the finance feature needs a money icon.
 *
 * Semi Design is a Chinese design system, so its `IconCoinMoney` draws a yen sign and there is no
 * euro icon in the set. Fredy is a German real estate tool that quotes euros everywhere else, so
 * the wrong currency on the icon reads as a bug.
 *
 * Sized and coloured like a Semi icon (1em, `currentColor`) so it drops into the same slots -
 * navigation items, KPI cards, description lists - without any special casing.
 *
 * @param {Object} props Forwarded to the svg element, so `style`, `className` and the rest work.
 */
export default function IconEuro(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      focusable={false}
      aria-hidden={true}
      {...props}
    >
      <path
        d="M12 1a11 11 0 1 1 0 22 11 11 0 0 1 0-22Zm2.2 5.6a5.4 5.4 0 0 0-5.1 3.6H8a1 1 0 0 0 0 2h.7a6.5 6.5 0 0 0 0 1.1H8a1 1 0 1 0 0 2h1.1a5.4 5.4 0 0 0 5.1 3.5c.8 0 1.6-.2 2.3-.5a1 1 0 1 0-.9-1.8c-.4.2-.9.3-1.4.3a3.4 3.4 0 0 1-2.9-1.5h2.4a1 1 0 0 0 0-2h-3.1a4.6 4.6 0 0 1 0-1.1h3.1a1 1 0 0 0 0-2h-2.4a3.4 3.4 0 0 1 2.9-1.6c.5 0 1 .1 1.4.3a1 1 0 1 0 .9-1.8 5.4 5.4 0 0 0-2.3-.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

IconEuro.displayName = 'IconEuro';
