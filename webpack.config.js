const path = require("path");

function resolve (dir) {
  return path.join(__dirname, dir);
}

const outputConfig = {
  path: path.resolve(__dirname, "dist/commonjs"),
  filename: "loader.js",
  libraryTarget: "commonjs2"
};

const baseConfig = {
  mode: "production",
  target: "node",

  entry: "./src/loader.ts",
  output: outputConfig,

  devtool: false,

  optimization: {
    // don't minimize output in any mode since this package is intended for use in Node.js and it will ease debug
    minimize: false,
    // don't replace NODE_ENV variable at compile time
    nodeEnv: false,
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
          // Rely on Babel for transpiling JS emitted from TSC, since it's *believed* that it does a better job than TSC
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

module.exports = [
  baseConfig,
  Object.assign({}, baseConfig, {
    entry: "./src/runtime/decorator.ts",
    output: Object.assign({}, outputConfig, { filename: "decorator.js" }),
  }),
];
