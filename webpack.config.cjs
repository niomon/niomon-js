const path = require('path')
const webpack = require('webpack')
const Dotenv = require('dotenv-webpack')
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin")
const nodeExternals = require('webpack-node-externals')

const config = {
  mode: 'development',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  plugins: [
    new NodePolyfillPlugin(),
    new webpack.DefinePlugin({
      'process.env.NODE_DEBUG': JSON.stringify(process.env.NODE_DEBUG),
    }),
    new Dotenv({
      systemvars: true // for CI variables load
    })
  ],
  optimization: {
    usedExports: true,
    sideEffects: true,
  },
  devtool: 'eval-source-map'
}

module.exports = (env, argv) => {
  if (argv.mode === 'production') {
    config.devtool = false
  }

  return [
    {
      entry: './src/ditto/browser.ts',
      output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'ditto.browser.js',
        library: {
          name: 'ditto',
          type: 'umd'
        },
        globalObject: 'this',
        umdNamedDefine: true,
        publicPath: ''
      },
      devServer: {
        port: 10001,
        headers: {'Access-Control-Allow-Origin': '*'},
        client: false,
        webSocketServer: false
      },
      ...config
    },
    {
      entry: './src/index.ts',
      output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'ditto.js',
        library: {
          type: 'commonjs',
        }
      },
      externals: [nodeExternals()],
      ...config
    }
  ]
}
