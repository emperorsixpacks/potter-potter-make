const webpack = require("webpack");

module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Add TypeScript extensions
      webpackConfig.resolve.extensions = [
        ...webpackConfig.resolve.extensions,
        ".ts",
        ".tsx",
      ];

      // Polyfills for Node core modules
      webpackConfig.resolve.fallback = {
        ...webpackConfig.resolve.fallback,
        crypto: require.resolve("crypto-browserify"),
        stream: require.resolve("stream-browserify"),
        buffer: require.resolve("buffer"),
        vm: require.resolve("vm-browserify"),
      };

      // Global Buffer polyfill (THIS is what fixes Buffer undefined)
      webpackConfig.plugins.push(
        new webpack.ProvidePlugin({
          Buffer: ["buffer", "Buffer"],
          process: "browser-process/browser",
        })
      );

      // Remove broken source-map-loader from CRA
      webpackConfig.module.rules = webpackConfig.module.rules.filter(
        (rule) =>
          !(
            rule.enforce === "pre" &&
            rule.loader &&
            rule.loader.includes("source-map-loader")
          )
      );

      // Extend babel-loader to support TS
      const oneOfRule = webpackConfig.module.rules.find(
        (rule) => rule.oneOf
      );
      if (oneOfRule) {
        const babelLoaderRule = oneOfRule.oneOf.find(
          (rule) =>
            rule.loader && rule.loader.includes("babel-loader")
        );

        if (babelLoaderRule) {
          babelLoaderRule.test = /\.(js|mjs|jsx|ts|tsx)$/;
        }
      }

      return webpackConfig;
    },
  },
};
