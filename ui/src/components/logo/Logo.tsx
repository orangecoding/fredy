import React from 'react';
import logo from '../../assets/logo.png';
import logoWhite from '../../assets/logo_white.png';

interface LogoProps {
  width?: number;
  white?: boolean;
}

import './Logo.less';

export default function Logo({ width = 350, white = false }: LogoProps = {}) {
  return <img src={white ? logoWhite : logo} width={width} className="logo" />;
}
