import React from 'react';

import { HashRouter } from 'react-router-dom';
import { createRoot } from 'react-dom/client';
import en_US from '@douyinfe/semi-ui/lib/es/locale/source/en_US';
import { LocaleProvider } from '@douyinfe/semi-ui';
import { initVChartSemiTheme } from '@visactor/vchart-semi-theme';
import App from './App';
import './Index.less';

const container = document.getElementById('fredy');
const root = createRoot(container);

initVChartSemiTheme({
  defaultMode: 'dark',
});

root.render(
  <HashRouter>
    <LocaleProvider locale={en_US}>
      <App />
    </LocaleProvider>
  </HashRouter>,
);
