import React from 'react';

import { reduxStore } from './services/rematch/store';
import { HashRouter } from 'react-router-dom';
import { createHashHistory } from 'history';
import { Provider } from 'react-redux';
import ReactDOM from 'react-dom';

const history = createHashHistory();

import App from './App';

import './Index.less';

ReactDOM.render(
  <Provider store={reduxStore}>
    <HashRouter history={history}>
      <App />
    </HashRouter>
  </Provider>,
  document.getElementById('fredy')
);
