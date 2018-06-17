const path = require("path");

function resolve (dir) {
  return path.join(__dirname, dir);
}

module.exports = {
  mode: process.env.NODE_ENV === "production" ? "production" : "development",
  target: "node",

  entry: "./src/loader.ts",

  output: {
    path: path.resolve(__dirname, "dist/commonjs"),
    filename: "loader.js",
    libraryTarget: "commonjs2"
  },

  // source maps won't hurt, so generate them anyway
  devtool: "source-map",

  // don't minimize output in any mode since this package is intended for use in Node.js and it will ease debug
  optimization: {
    minimize: false
  },

  // TypeScript configuration
  resolve: {
    extensions: [".ts"]
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        include: [
          resolve("src"),
          resolve("test")
        ],
        use: [
          /**
           * Rely on Babel for transpiling JS emitted from TSC, since it's *believed* that it does a better job than TSC
           */
          {
            loader: "babel-loader",
            options: {
              babelrc: false,
              cacheDirectory: true,
              presets: [
                ["env", { "targets": { "node": 8 } }]
              ],
              "plugins": [
                // This plugin is necessary for { ...objectSpread } expressions, since Webpack crashes on them when it
                // parses input files
                ["transform-object-rest-spread", { "useBuiltIns": true }]
              ]
            }
          },
          "ts-loader"
        ]
      }
    ]
  },

  // externalize everything
  externals: [/^\w.*$/i]
};
