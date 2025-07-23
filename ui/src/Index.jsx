import React from 'react';

import { reduxStore } from './services/rematch/store';
import { HashRouter } from 'react-router-dom';
import { createHashHistory } from 'history';
import { Provider } from 'react-redux';
import { createRoot } from 'react-dom/client';
import en_US from '@douyinfe/semi-ui/lib/es/locale/source/en_US';
import { LocaleProvider } from '@douyinfe/semi-ui';

const container = document.getElementById('fredy');
const root = createRoot(container);
const history = createHashHistory();

import App from './App';

import './Index.less';

root.render(
  <Provider store={reduxStore}>
    <HashRouter history={history}>
      <LocaleProvider locale={en_US}>
        <App />
      </LocaleProvider>
    </HashRouter>
  </Provider>,
);
