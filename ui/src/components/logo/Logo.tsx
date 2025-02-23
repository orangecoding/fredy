// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import React from 'react';
// @ts-expect-error TS(2307): Cannot find module '../../assets/logo.png' or its ... Remove this comment to see the full error message
import logo from '../../assets/logo.png';
// @ts-expect-error TS(2307): Cannot find module '../../assets/logo_white.png' o... Remove this comment to see the full error message
import logoWhite from '../../assets/logo_white.png';

import './Logo.less';

export default function Logo({ width = 350, white = false } = {}) {
  // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
  return <img src={white ? logoWhite : logo} width={width} className="logo" />;
}
