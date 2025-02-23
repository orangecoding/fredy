import React from 'react';
import { store } from './services/rematch/store';
import { HashRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { createRoot } from 'react-dom/client';
import en_US from '@douyinfe/semi-ui/lib/es/locale/source/en_US';
import { LocaleProvider } from '@douyinfe/semi-ui';
import App from './App';
import './Index.less';

const container = document.getElementById('fredy');
if (container) {
  const root = createRoot(container);
  root.render(
    <Provider store={store}>
      <HashRouter>
        <LocaleProvider locale={en_US}>
          <App />
        </LocaleProvider>
      </HashRouter>
    </Provider>,
  );
} else {
  console.error("Failed to find the root element with ID 'fredy'. Ensure an element with this ID exists in your HTML.");
}
