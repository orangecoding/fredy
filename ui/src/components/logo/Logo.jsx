/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';
import logo from '../../assets/logo.png';
import logoWhite from '../../assets/logo_white.png';

import './Logo.less';

export default function Logo({ width = 350, white = false } = {}) {
  return <img src={white ? logoWhite : logo} width={width} className="logo" alt="Fredy Logo" />;
}
