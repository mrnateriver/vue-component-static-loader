# vue-component-static-loader

> Webpack loader for ES/TS Vue class components that statically parses decorator options and transforms them in a way that mimics vue-loader SFC behaviour, but without **.vue** files.

### Why would you use it
You may find it useful, if:

  1. You're using [TypeScript](https://www.typescriptlang.org) or ES with [decorators](https://tc39.github.io/proposal-decorators) for developing [Vue](https://vuejs.org) applications;
  2. You're using [class components](https://github.com/vuejs/vue-class-component);
  3. You don't like mixing presentation and business logic in the same file (as with [SFC](https://vuejs.org/v2/guide/single-file-components.html));
  4. You want a simple, declarative way of linking those parts to the component.

You may argue that everything that this loader does you can do by hand, so here are some advantages:

  1. You don't have to know and write by hand resource queries for imported templates and stylesheets (and you need them for compiled templates and [scoped styles](https://vue-loader.vuejs.org/guide/scoped-css.html));
  2. Provides consistent and transparent behaviour across both SSR and client-side execution (does almost everything that [vue-loader](https://github.com/vuejs/vue-loader) does for SFC);
  3. Gets rid of the component pitching module in Webpack bundle (a module that re-exports all parts of the SFC);
  4. Allows for declaring several components in one source file.

It's always nicer to type less code and get the same (or better) results.

### Usage

#### Requirements:
  1. Webpack 3+;
  2. TypeScript 2;
  3. vue-loader 15;

Tested with listed versions, but may work with older ones as well. But probably will not.

#### Installation:
```bash
npm install --save-dev vue-component-static-loader
```

Or if you're using [Yarn](https://yarnpkg.com):

```bash
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
Since `template` option is used in Vue components by default, only parameters that are initialized with `require()` calls are transformed into compiled templates.

As for `styles` option, you can initialize it in several ways:

  1. If initialized with a string, then it's interpreted as an unscoped stylesheet file path;
  2. If initialized with a call to `require()`, then it's interpreted as an unscoped stylesheet file import;
  3. If initialized with an object, it's expected to have type `{ scoped: boolean; style: CallExpression | string; }`, in which `style` property should also be either a string or a call to `require()`;
  4. If initialized with an array, it's expected to have any of the above as its elements.

*Note: it's probably better to specify both template and styles as `require()` calls, since most IDEs will allow quick navigation to the imported files.*

Any unrecognized expressions are left as-is without any parsing or transformations.

**Also make sure to use decorator from this package, and not vue-class-component**, because not only it declares necessary types for its parameters, but it also makes necessary runtime operations.

```TypeScript
import Vue from "vue";
import Component from "vue-component-static-loader";

@Component({
  template: require("./HelloComponent.pug"),
  styles: "./HelloComponent.css"
})
export class HelloComponent extends Vue {

}

@Component({
  template: require("./HelloScopedComponent.pug"),
  styles: [
    {
      scoped: true,
      style: require("./HelloScopedComponent.css")
    },
    require("./MaybeSomeCommonStyle.css")
  ]
})
export class HelloScopedComponent extends Vue {

}
```

You can change decorator identifier name, as well as template and styles parameters' names with loader options. Note, however, that those options only affect which names are **scanned** in [AST](https://en.wikipedia.org/wiki/Abstract_syntax_tree) - all of those identifiers will be transformed into their default names in output, since they require runtime processing. This means that if you change decorator's name you'll still have to import `Component` decorator from this package along with your own (you can omit your own one if you don't use the [TypeScript Language Service](https://github.com/Microsoft/TypeScript/wiki/Using-the-Language-Service-API) for parsing your files during development) because it should be visible for the TypeScript compiler that compiles your files after this loader.

### Configuration
The loader accepts several configuration options:

|Name|Type|Default|Description|
|:--:|:--:|:-----:|:----------|
|**`production`**|`{Boolean}`|`false`| Whether the bundle is being built for production. Affects component scope ID generation and whether to include [HMR](https://webpack.js.org/concepts/hot-module-replacement/) code.|
|**`decoratorName`**|`{String}`|`Component`| The name of the decorator expression.|
|**`templateParameterName`**|`{String}`|`template`| The name of the parameter in decorator argument object that specifies a template that's used for the component.|
|**`stylesParameterName`** |`{String}`|`styles`| The name of the parameter in decorator argument object that specifies styles that are used for the component.|
|**`hotReload`**|`{Boolean}`|`false`| Whether to generate Webpack HMR code. Doesn't affect anything if production build is enabled.|

### How does it work

The loader parses ASTs of input files using [TypeScript Compiler API](https://github.com/Microsoft/TypeScript/wiki/Using-the-Compiler-API), searches for exported classes with specified decorator (its identifier can be changed with `decoratorName` loader option) and then transforms initialization expressions of certain parameters in its options so that when further compiled the component will have everything it needs in its options.

Aforementioned sample components will be transformed into the following code (excluding HMR and without the comments, ofcourse):
```TypeScript
import Vue from "vue";
import Component from "vue-component-static-loader";

@Component({
  _compiled: true,

   /* If Webpack is configured correctly this will import 'render' and
      'staticRenderFns' functions into component options, which is what
      vue-loader does. */
  ...require("./test.pug?vue&type=template&lang=pug"),

  /* If bundle is targeted for Node.js (SSR) then this will import
     '__inject__' function which will be used by decorator runtime;
     otherwise the styles will be inserted into document <head>
     immediately if vue-style-loader/style-loader is configured. */
  styles: require("test1.css?vue&type=style&lang=css&index=0"),

  /* This will be the source file name. */
  __file: "inputFile.ts",

  /* And if bundle is targeted for Node.js (SSR) then module ID will
     also be inserted for Vue SSR. */
  // _moduleId: "%HASH%-0"
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

There are three main transformations that take place:
  1. If styles options is specified in decorator, its initializer is transformed so that all styles descriptors are available during runtime. During this phase it's also determined whether there are any scoped styles;
  2. If template option is specified in decorator and has a `require()` call as its initializer, it's considered to be a template import, so imported file path is appended with a query for passing it through [Vue template compiler](https://github.com/vuejs/vue/tree/dev/packages/vue-template-compiler), including flags for scoping if any scoped styles were previously found;
  3. All necessary identifiers and metadata is inserted into decorator options, such as scope identifier, source file short path etc;
  4. If not specified otherwise, HMR code is generated for each found component, as well as their templates. This code is put at the bottom of the output file.

It should be noted that even though all transformations are made by this loader alone, their results still depend on the Webpack configuration that is used for building the project. Most notably, template compilation and styles scoping depend on vue-loader and it's plugin.

Such approach obviously requires additional type declarations for component decorator, since after the source file is transformed it should be further passed to the TypeScript compiler.
For this reason this package depends on a [fork of vue-class-component](https://github.com/mrnateriver/vue-class-component) that exposes additional types that are otherwise inaccessible.

Runtime processing is only performed for Node.js (SSR) target and that is determined by the presence of generated `_moduleId` parameter. During that phase, all styles that export `__inject__` method are injected into the `beforeCreate` Vue hook, as well as into the `_ssrRegister` hook. This behaviour is taken from [vue-loader componentNormalizer](https://github.com/vuejs/vue-loader/blob/master/lib/runtime/componentNormalizer.js).

### Caveats and room for improvement

This project was implemented mostly out of boredom, so naturally it lacks some features, while other ones may have plenty of room for improvement.

Most notable caveats and options for improvement:

  1. Doesn't support [CSS modules](https://vue-loader.vuejs.org/guide/css-modules.html), even though it shouldn't be too hard to implement;
  2. Doesn't support functional components, obviously;
  2. Depends on vue-loader in build pipeline, since it basically only replaces the loading part of components, and compilation of templates and styles is still passed through vue-loader. Didn't have enough will for diving into writing Webpack plugins, loaders and into vue-loader itself so took a shortcut;
  3. Doesn't preserve source files' formatting and doesn't generate a sourcemap so the transformation result is shown in resulting bundle sourcemaps as an original file. Not much of a problem, but unwanted side-effect nevertheless;
  4. Probably has lots of room for performance optimization, for example, it doesn't check for any syntax errors and thus even if it will successfully transform source file the compilation will still fail.

And then there's one inevitable consequence of getting rid of component pitching module: any bundle module that imports the component will be registered as directly dependent on component's module in HMR. With vue-loader and SFC, if you imported some component, Webpack actually imported just a sort of intermediate module (into which the *.vue file itself was turned), and that module in turn imported component's script, template and styles (whose modules were generated during Webpack runtime), joined them together using aforementioned `normalizeComponent` and returned the results. That eliminated direct dependency between importing and imported code of the component.

With this loader, there's no intermediate module, component constructor function is exported directly from it's module. And as a result, if you change the component that's imported into, let's say, some helper or service module, which doesn't have HMR code for reloading itself, the whole chain of imports will be invalidated, and if any of the modules in it don't have self-reloading code the whole page will have to be reloaded.

Most of this issues, if not all, can be fixed, so any PRs or just suggestions are more than welcome.

### License

[MIT](http://opensource.org/licenses/MIT)
