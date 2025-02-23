// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import React from 'react';

import { reduxStore } from './services/rematch/store';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import { HashRouter } from 'react-router-dom';
import { createHashHistory } from 'history';
import { Provider } from 'react-redux';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import { createRoot } from 'react-dom/client';
import en_US from '@douyinfe/semi-ui/lib/es/locale/source/en_US';
import { LocaleProvider } from '@douyinfe/semi-ui';

const container = document.getElementById('fredy');
const root = createRoot(container);
const history = createHashHistory();

// @ts-expect-error TS(6142): Module './App' was resolved to 'C:/Programmierzeug... Remove this comment to see the full error message
import App from './App';

import './Index.less';

root.render(
  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  <Provider store={reduxStore}>
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <HashRouter history={history}>
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <LocaleProvider locale={en_US}>
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <App />
      </LocaleProvider>
    </HashRouter>
  </Provider>
);
