/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { HashRouter } from 'react-router-dom';
import { createRoot } from 'react-dom/client';
import en_US from '@douyinfe/semi-ui-19/lib/es/locale/source/en_US';
import { LocaleProvider, semiGlobal } from '@douyinfe/semi-ui-19';
import App from './App';
import './Index.less';

// Semi UI uses react-dom (not react-dom/client) internally for imperative renders
// like Toast, Notification, etc. In React 19, createRoot was removed from react-dom
// and lives only in react-dom/client — inject it so Toast can create its own root.
semiGlobal.config.createRoot = createRoot;

const container = document.getElementById('fredy');
const root = createRoot(container);

root.render(
  <HashRouter>
    <LocaleProvider locale={en_US}>
      <App />
    </LocaleProvider>
  </HashRouter>,
);
