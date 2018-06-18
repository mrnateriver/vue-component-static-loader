# vue-component-static-loader

> Webpack loader for ES/TS Vue [class components](https://github.com/vuejs/vue-class-component) that statically parses decorator options and transforms them in a way that mimics [vue-loader](https://github.com/vuejs/vue-loader) SFC behaviour, but without **.vue** files.

**TODO** NPM badge.

### Usage

#### Requirements:
  1. Webpack 3+;
  2. TypeScript 2;
  3. vue-loader 15;

Tested with listed versions, but may work with older ones as well. But probably will not.

#### Installation:
```
npm i vue-component-static-loader -D
```

Or if you're using [Yarn](https://yarnpkg.com):

```
yarn add vue-component-static-loader --dev
```

Then add it to your Webpack configuration as a loader for TypeScript files (usually matched by `\.tsx?$`) before the compiler itself but **after any linters**, since it doesn't preserve whitespace and may generate code that doesn't match your linting rules.

### Example

#### Webpack sample configuration
```javascript
module.exports = {
    module: {
      rules: [
        {
          test: /\.vue$/,
          loader: "vue-loader",
        },
        {
          test: /\.tsx?$/,
          use: [
            {
              loader: "ts-loader",
              options: {
                appendTsSuffixTo: [/\.vue$/]
              }
            },
            "vue-component-static-loader",
            "tslint-loader"
          ]
        },
        {
          test: /\.pug$/,
          oneOf: [
            // if there's a "vue" string in query then vue-loader pitcher will use vue-template-compiler for compiling markup returned by Pug
            {
              resourceQuery: /^\?vue/,
              use: ["pug-plain-loader"]
            },
            // otherwise return them as plain strings
            {
              use: ["raw-loader", "pug-plain-loader"]
            }
          ]
        },
        {
          test: /\.css$/,
          use: [ "vue-style-loader", "css-loader" ]
        },
      ]
    },
    plugins: [
      new VueLoaderPlugin()
    ]
  };
```

#### Sample component declaration
```TypeScript
import Vue from "vue";
import { Component } from "vue-component-static-loader";

@Component({
  template: require("./HelloComponent.pug"),
  styles: require("./HelloComponent.css")
})
export class HelloComponent extends Vue {

}

@Component({
  template: require("./HelloScopedComponent.pug"),
  styles: {
    scoped: true,
    style: require("./HelloScopedComponent.css")
  }
})
export class HelloScopedComponent extends Vue {

}
```

### Configuration
The loader accepts several configuration options:
|Name|Type|Default|Description|
|:--:|:--:|:-----:|:----------|
|**`production`**|`{Boolean}`|`false`| Whether the bundle is being built for production. Affects component scope ID generation and whether to include [HMR](https://webpack.js.org/concepts/hot-module-replacement/) code.|
|**`decoratorName`**|`{String}`|`Component`| The name of the decorator expression.|
|**`templateParameterName`**|`{String}`|`template`| The name of the parameter in decorator argument object that specifies a template that's used for the component.|
|**`stylesParameterName`** |`{String}`|`styles`| The name of the parameter in decorator argument object that specifies styles that are used for the component.|
|**`hotReload`**|`{Boolean}`|`false`| Whether to generate Webpack [HMR](https://webpack.js.org/concepts/hot-module-replacement/) code. Doesn't affect anything if production build is enabled.|

### How does it work

The loader parses ASTs of input files using [TypeScript Compiler API](https://github.com/Microsoft/TypeScript/wiki/Using-the-Compiler-API), searches for exported classes with specified decorator (its identifier can be changed with `decoratorName` loader option) and then transforms certain parameters in its options so that when further compiled the component will have everything it needs in its options.

Aforementioned sample components will be transformed into the following code (excluding [HMR](https://webpack.js.org/concepts/hot-module-replacement/) and without the comments, ofcourse):
```TypeScript
import Vue from "vue";
import { Component } from "vue-component-static-loader";

@Component({
  _compiled: true,
  ...require("./test.pug?vue&type=template&lang=pug"), // If Webpack is configured correctly this will import 'render' and 'staticRenderFns' functions into component options, which is what vue-loader does
  styles: require("test1.css?vue&type=style&lang=css&index=0"), // If bundle is targeted for Node.js (SSR) then this will import '__inject__' function which will be used by decorator runtime; otherwise the styles will be inserted into document <head> immediately if vue-style-loader/style-loader is configured
  __file: "inputFile.ts", // This will be the source file name
  // _moduleId: "%HASH%-0" // And if bundle is targeted for Node.js (SSR) then module ID will also be inserted for Vue SSR
})
export class HelloComponent extends Vue {
}

@Component({
  _scopeId: "data-v-%HASH%",
  _compiled: true,
  ...require("./HelloScopedComponent.pug?vue&type=template&lang=pug&id=%HASH%&scoped=true"),
  styles: {
    scoped: true,
    style: require("./HelloScopedComponent.css?vue&type=style&lang=css&id=%HASH%&scoped=true&index=0")
  },
  __file: "testResource.ts",
  // _moduleId: "%HASH%-1"
})
export class HelloScopedComponent extends Vue {
}
```

More precisely, there are three main transformations that take place:
1. If styles options is specified in decorator (option identifier can be changed with `stylesParameterName` loader option), its initializer is transformed so that all styles descriptors are available during runtime. During this phase it's also determined whether there are any scoped styles;
2. If template option is specified in decorator (this option identifier can also be changed with `templateParameterName` loader option) and has a `require()` call as its initializer, it's considered to be a template import, so imported file path is appended with a query for passing it through [Vue template compiler](https://github.com/vuejs/vue/tree/dev/packages/vue-template-compiler), including flags for scoping if any scoped styles were previously found;
3. Finally, all necessary identifiers and metadata is inserted into decorator options, such as scope identifier, source file short path etc.

It should be noted that even though all transformations are made by this loader alone, their results still depend on the Webpack configuration that is used for building the project. Most importantly, they depend on [vue-loader](https://github.com/vuejs/vue-loader) being present in module rules.

Such approach obviously requires additional type declarations for component decorator, since after the source file is transformed it should be further passed to the TypeScript compiler.
For this reason this package depends on a fork of [vue-class-component](https://github.com/vuejs/vue-class-component) that exposes additional types that are otherwise inaccessible.

### Caveats and TODOs

**TODO** Describe the current issues and what should be done to perfect it.

### License

[MIT](http://opensource.org/licenses/MIT)
