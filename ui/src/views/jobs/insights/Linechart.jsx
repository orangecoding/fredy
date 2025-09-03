import React from 'react';

import Placeholder from '../../../components/placeholder/Placeholder';
import { VChart } from '@visactor/react-vchart';

import './Linechart.less';

const commonSpec = {
  type: 'line',
  xField: 'listings',
  yField: 'listingsNumber',
  seriesField: 'provider',
  legends: { visible: true },
};

const Linechart = function Linechart({ title, series, isLoading = false }) {
  return (
    <Placeholder ready={!isLoading} rows={6}>
      {series == null || series.length === 0 ? (
        <div className="linechart__no__data">No Data for selected timeframe :-/</div>
      ) : (
        <VChart
          spec={{
            ...commonSpec,
            title: {
              visible: true,
              text: title,
            },
            data: { values: series },
          }}
          option={{ mode: 'desktop-browser' }}
        />
      )}
    </Placeholder>
  );
};

export default Linechart;
