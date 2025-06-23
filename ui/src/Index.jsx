import React from 'react';

import { reduxStore } from './services/rematch/store';
import { HashRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { createRoot } from 'react-dom/client';
import en_US from '@douyinfe/semi-ui/lib/es/locale/source/en_US';
import { LocaleProvider } from '@douyinfe/semi-ui';

const container = document.getElementById('fredy');
const root = createRoot(container);

import App from './App';

import './Index.less';

root.render(
  <Provider store={reduxStore}>
    <HashRouter>
      <LocaleProvider locale={en_US}>
        <App />
      </LocaleProvider>
    </HashRouter>
  </Provider>
);
