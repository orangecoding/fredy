import React from 'react';

import { reduxStore } from './services/rematch/store';
import { HashRouter } from 'react-router-dom';
import { createHashHistory } from 'history';
import { Provider } from 'react-redux';
import { createRoot } from 'react-dom/client';
const container = document.getElementById('fredy');
const root = createRoot(container);

const history = createHashHistory();

import App from './App';

import './Index.less';

root.render(
  <Provider store={reduxStore}>
    <HashRouter history={history}>
      <App />
    </HashRouter>
  </Provider>
);
