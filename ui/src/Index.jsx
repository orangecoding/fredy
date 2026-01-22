/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';

import { HashRouter } from 'react-router-dom';
import { createRoot } from 'react-dom/client';
import en_US from '@douyinfe/semi-ui-19/lib/es/locale/source/en_US';
import { LocaleProvider } from '@douyinfe/semi-ui-19';
import App from './App';
import './Index.less';

const container = document.getElementById('fredy');
const root = createRoot(container);

root.render(
  <HashRouter>
    <LocaleProvider locale={en_US}>
      <App />
    </LocaleProvider>
  </HashRouter>,
);
