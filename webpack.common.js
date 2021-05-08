const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const path = require('path');

module.exports = {
  entry: path.join(__dirname, 'ui', 'src') + '/Index.js',
  resolve: {
    extensions: ['.js'],
  },
  plugins: [
    new CleanWebpackPlugin(),
    new CopyPlugin({
      patterns: [{ from: path.join(__dirname, 'ui', 'src') + '/index.html', to: path.join(__dirname, 'ui', 'public') }],
    }),
  ],
  output: {
    path: path.join(__dirname, 'ui', 'public'),
    publicPath: '/',
    filename: 'fredy.bundle.js',
  },
  performance: { hints: false },
  module: {
    rules: [
      {
        test: /\.js?$/,
        exclude: /(node_modules|bower_components)/,
        use: [{ loader: 'babel-loader' }],
      },
      {
        test: /\.(css|less)$/i,
        use: ['style-loader', 'css-loader', 'less-loader'],
      },
      {
        test: /\.(png|jpg|gif|svg|eot|ttf|woff|woff2)$/,
        use: [{ loader: 'url-loader?limit=3000!image-webpack?bypassOnDebug&optimizationLevel=7&interlaced=false' }],
      },
    ],
  },
};
