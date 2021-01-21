import React from 'react';

import Placeholder from '../../../components/placeholder/Placeholder';
import HighchartsReact from 'highcharts-react-official';
import Highcharts from 'highcharts/highcharts.src.js';

import './Linechart.less';

Highcharts.theme = {
  colors: [
    '#2b908f',
    '#90ee7e',
    '#f45b5b',
    '#7798BF',
    '#aaeeee',
    '#ff0066',
    '#eeaaee',
    '#55BF3B',
    '#DF5353',
    '#7798BF',
    '#aaeeee',
  ],
  chart: {
    backgroundColor: {
      linearGradient: {
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1,
      },
      stops: [
        [0, '#2a2a2b'],
        [1, '#3e3e40'],
      ],
    },
    style: {
      fontFamily: "'Unica One', sans-serif",
    },
    plotBorderColor: '#606063',
  },
  title: {
    style: {
      color: '#E0E0E3',
      textTransform: 'uppercase',
      fontSize: '20px',
    },
  },
  subtitle: {
    style: {
      color: '#E0E0E3',
      textTransform: 'uppercase',
    },
  },
  xAxis: {
    gridLineColor: '#707073',
    labels: {
      style: {
        color: '#E0E0E3',
      },
    },
    lineColor: '#707073',
    minorGridLineColor: '#505053',
    tickColor: '#707073',
    title: {
      style: {
        color: '#A0A0A3',
      },
    },
  },
  yAxis: {
    gridLineColor: '#707073',
    labels: {
      style: {
        color: '#E0E0E3',
      },
    },
    lineColor: '#707073',
    minorGridLineColor: '#505053',
    tickColor: '#707073',
    tickWidth: 1,
    title: {
      style: {
        color: '#A0A0A3',
      },
    },
  },
  tooltip: {
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    style: {
      color: '#F0F0F0',
    },
  },
  plotOptions: {
    series: {
      dataLabels: {
        color: '#F0F0F3',
        style: {
          fontSize: '13px',
        },
      },
      marker: {
        lineColor: '#333',
      },
    },
    boxplot: {
      fillColor: '#505053',
    },
    candlestick: {
      lineColor: 'white',
    },
    errorbar: {
      color: 'white',
    },
  },
  legend: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    itemStyle: {
      color: '#E0E0E3',
    },
    itemHoverStyle: {
      color: '#FFF',
    },
    itemHiddenStyle: {
      color: '#606063',
    },
    title: {
      style: {
        color: '#C0C0C0',
      },
    },
  },
  credits: {
    style: {
      color: '#666',
    },
  },
  labels: {
    style: {
      color: '#707073',
    },
  },

  drilldown: {
    activeAxisLabelStyle: {
      color: '#F0F0F3',
    },
    activeDataLabelStyle: {
      color: '#F0F0F3',
    },
  },

  navigation: {
    buttonOptions: {
      symbolStroke: '#DDDDDD',
      theme: {
        fill: '#505053',
      },
    },
  },

  // scroll charts
  rangeSelector: {
    buttonTheme: {
      fill: '#505053',
      stroke: '#000000',
      style: {
        color: '#CCC',
      },
      states: {
        hover: {
          fill: '#707073',
          stroke: '#000000',
          style: {
            color: 'white',
          },
        },
        select: {
          fill: '#000003',
          stroke: '#000000',
          style: {
            color: 'white',
          },
        },
      },
    },
    inputBoxBorderColor: '#505053',
    inputStyle: {
      backgroundColor: '#333',
      color: 'silver',
    },
    labelStyle: {
      color: 'silver',
    },
  },

  navigator: {
    handles: {
      backgroundColor: '#666',
      borderColor: '#AAA',
    },
    outlineColor: '#CCC',
    maskFill: 'rgba(255,255,255,0.1)',
    series: {
      color: '#7798BF',
      lineColor: '#A6C7ED',
    },
    xAxis: {
      gridLineColor: '#505053',
    },
  },

  scrollbar: {
    barBackgroundColor: '#808083',
    barBorderColor: '#808083',
    buttonArrowColor: '#CCC',
    buttonBackgroundColor: '#606063',
    buttonBorderColor: '#606063',
    rifleColor: '#FFF',
    trackBackgroundColor: '#404043',
    trackBorderColor: '#404043',
  },
};

// Apply the theme
Highcharts.setOptions(Highcharts.theme);

const defaultOptions = {
  title: {
    text: null,
  },
  legend: {
    enabled: true,
  },
  xAxis: {
    //most of the time (if not everytime), the x axis is time
    type: 'datetime',
    crosshair: {
      snap: false,
    },
  },
  yAxis: {
    title: {
      text: null,
    },
    //do not show float numbers
    allowDecimals: false,
  },
  chart: {
    type: 'line',
    zoomType: 'x',
    plotBackgroundColor: null,
    plotBorderWidth: null,
  },
  exporting: {
    enabled: false,
  },
  tooltip: {
    shared: true,
    formatter: null,
  },
  plotOptions: {
    line: {
      animation: false,
      marker: {
        enabled: false,
      },
    },
    series: {
      lineWidth: 1.5,
      connectNulls: true,
      marker: {
        enabled: false,
      },
    },
  },
  series: [],
};

/**
 * Usage of this chart:
 * title: optional (show a title, if null, no title is shown)
 * zoom: optional (if true, zooming in x axis is possible)
 * legend: optional (show / hide the legend)
 * series: mandatory (an array of data to be shown)
 *
 * <Linechart
 *    title="something"
 *    legend={true}
 *    timeframe={week/month/all} --> If this is not set, we assume the timeframe is 'all'
 *    //everything that is "subscribed" to this topic will receive this update
 *    highlightTopic="someTopic"
 *    height={"500px"}
 *    zoom={true}
 *    series={[
 *      {
 *        name: 'something',
 *        data: [x,y],
 *        dashStyle: (OPTIONAL) | solid / 'shortdot'
 *      }
 *    ]}
 * />
 */
const Linechart = function Linechart({ title, series, height, isLoading = false }) {
  const options = () => {
    return {
      ...defaultOptions,
      title: {
        text: title,
      },
      time: {
        useUTC: false,
      },
      legend: {
        enabled: true,
      },
      series: series.map((series) => {
        return {
          ...series,
        };
      }),
      chart: {
        type: 'line',
        zoomType: 'x',
        height: height || '400px',
      },
    };
  };

  return (
    <Placeholder ready={!isLoading} rows={6}>
      {series == null || series.length === 0 ? (
        <div className="linechart__no__data">No Data for selected timeframe :-/</div>
      ) : (
        <HighchartsReact highcharts={Highcharts} options={options()} />
      )}
    </Placeholder>
  );
};

export default Linechart;
