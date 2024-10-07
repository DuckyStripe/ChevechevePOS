// webpack.config.js

const path = require('path');
const webpack = require('webpack');

module.exports = {
  // ... otras configuraciones ...
  resolve: {
    fallback: {
      "crypto": require.resolve("crypto-browserify"),
      "buffer": require.resolve("buffer/"),
      "stream": require.resolve("stream-browserify"),
      // Puedes agregar otros módulos Node.js que necesites implementar si fuera necesario.
    }
  },
  plugins: [
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
    }),
  ],
  // ... otras configuraciones ...
};
