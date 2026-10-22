/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import logo from '../../assets/logo.png';
import logoWhite from '../../assets/logo_white.png';
import { normalizeTheme } from '../../services/theme/theme.js';
import { useSelector } from '../../services/state/store';

import './Logo.less';

/**
 * The wordmark, in whichever of its two cuts the surface behind it calls for.
 *
 * `white` says the logo sits on a dark surface. In the light theme that surface is no longer dark,
 * so the flag is read together with the theme rather than on its own - otherwise the white cut ends
 * up on paper and the wordmark disappears while the heart next to it stays perfectly visible.
 *
 * Read from the store, the way App.jsx reads the theme it applies, so a switch re-renders it. Before
 * the settings arrive (the login screen) that is the default, which is also what the body ships with.
 *
 * @param {Object} [props]
 * @param {number} [props.width=350]
 * @param {boolean} [props.white=false] The surface behind the logo is dark in the dark theme.
 * @returns {React.ReactElement}
 */
export default function Logo({ width = 350, white = false } = {}) {
  const theme = normalizeTheme(useSelector((state) => state.userSettings.settings.theme));
  const src = white && theme === 'dark' ? logoWhite : logo;
  return <img src={src} width={width} className="logo" alt="Fredy Logo" />;
}
