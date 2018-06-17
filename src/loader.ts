import {
  IComponentDecoratorParameters,
  ILoaderOptions,
  IRewriteOptions,
  ISourceFileComponentsHMRDescriptors,
  LoaderContext,
} from "./types";
import {
  addPropertyAssignment, generateComponentsHotReloadCalls, generateComponentsTemplateHotReloadCalls,
  removeProperty,
  transformDecoratorParameters,
  updateDecoratorParametersObject,
} from "./generators";
import {
  extractDecoratorParameters,
  extractTemplateRequirePath,
  findParametersInObjectLiteral,
  isExportedClass,
} from "./parsers";
import { getOptions } from "loader-utils";
import * as path from "path";
import * as ts from "typescript";

// tslint:disable-next-line:no-var-requires
const hash = require("hash-sum");

/**
 * Exports for using this loader from TypeScript.
 */
export * from "./types";

/**
 * The main entry point for the loader.
 * Receives options and source file contents from Webpack processing pipeline.
 */
export default function (this: LoaderContext, content: string) {
  if (this.cacheable) {
    this.cacheable();
  }
  const callback = this.async();

  const defaultOptions = {
    production: this.minimize || process.env.NODE_ENV === "production",
    decoratorName: "Component",
    templateParameterName: "template",
    stylesParameterName: "styles",
    hotReload: true,
  };

  const options: ILoaderOptions = Object.assign(defaultOptions, getOptions(this)) as ILoaderOptions;

  // an extremely simple way to prevent useless processing if there's no decorator in source file
  if (!(new RegExp(`@${options.decoratorName}`)).test(content)) {
    callback!(null, content);
    return;
  }

  // consider current bundle as an SSR one if target is Node.js
  const isServer = this.target === "node";

  const shortFilePath = path.relative(this.context || process.cwd(), this.resourcePath).replace(/^(\.\.[\\\/])+/, "");

  const scopeId = hash(
    options.production
      ? (shortFilePath + "\n" + content)
      : shortFilePath,
  );

  const sourceFile = ts.createSourceFile(this.resourcePath, content, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);

  const { componentsDescriptors, content: rewrittenContent } = rewrite({
    sourceFile: this.resourcePath,
    shortFilePath,
    injectModuleIdentifier: this.target === "node",
    moduleIdentifier: hash(this.request),
    ...defaultOptions,
    scopeId,
  }, sourceFile);
  content = rewrittenContent;

  // after components' code is processed, generate HMR code, but only if necessary
  const needsHotReload = (
    !isServer &&
    !options.production &&
    options.hotReload !== false
  );

  if (needsHotReload) {
    const hotReloadAPIPath: string = JSON.stringify(require.resolve("vue-hot-reload-api"));

    content += `\n
/* hot reload */
declare var module: any;

if (module.hot) {
  const api: any = require(${hotReloadAPIPath});
  api.install(require("vue"));

  if (api.compatible) {
    module.hot.accept();
    if (!module.hot.data) {
      ${generateComponentsHotReloadCalls(componentsDescriptors, "createRecord")}
    } else {
      ${generateComponentsHotReloadCalls(componentsDescriptors, "reload")}
    }
    ${generateComponentsTemplateHotReloadCalls(componentsDescriptors)}
  }
}`.trim();
  }

  callback!(null, content);
}

/**
 * Parses the specified source file AST and returns the transformed source code.
 *
 * @param {IRewriteOptions} options
 * @param {ts.Node} root
 * @returns {{componentsDescriptors: ISourceFileComponentsHMRDescriptors; content: string}}
 */
function rewrite(options: IRewriteOptions,
                 root: ts.Node): { componentsDescriptors: ISourceFileComponentsHMRDescriptors; content: string; } {
  let foundComponents: number = 0;
  const componentsDescriptors: ISourceFileComponentsHMRDescriptors = {};

  /**
   * A subroutine for recursive traversing of the AST.
   *
   * @param {ts.Node} node
   */
  function traverse(node: ts.Node): void {
    node.forEachChild((innerNode: ts.Node) => {
      // parsing class declarations and their decorators
      // ts.isBindingElement(innerNode): for some reason some BindingPattern nodes (for example, ObjectBindingPattern
      // in functions' arguments) don't have a parent node, and this leads to an error in ts.getCombinedModifierFlags.
      // Since we don't need those nodes anyway, just ignore them
      if (!ts.isBindingElement(innerNode) &&
        !ts.isObjectBindingPattern(innerNode) && !ts.isArrayBindingPattern(innerNode) &&
        isExportedClass(innerNode) && innerNode.decorators) {

        // get the class name from the node or generate one if class is anonymous (for example, default export)
        let className: string;
        if (innerNode.name) {
          className = innerNode.name.text;
        } else {
          className = `Component_${options.scopeId}_${foundComponents + 1}`;
          innerNode.name = ts.createIdentifier(className);
        }

        const parametersObject = extractDecoratorParameters(innerNode.decorators, options.decoratorName);
        if (parametersObject) {
          const parameterNames = {
            _scopeId: "_scopeId",
            _compiled: "_compiled",
            template: options.templateParameterName,
            styles: options.stylesParameterName,
          };

          const parameters = findParametersInObjectLiteral(parametersObject, Object.values(parameterNames));
          const componentDecoratorParameters: IComponentDecoratorParameters = {};

          let name: keyof typeof parameterNames;
          // tslint:disable-next-line:forin
          for (name in parameterNames) {
            componentDecoratorParameters[name] = parameters[parameterNames[name]];
          }

          // even if scope ID was specified manually in decorator options, we'll still overwrite it with a generated
          // one for consistency and simplicity of this loader
          componentDecoratorParameters._scopeId = `${options.scopeId}-${foundComponents++}`;

          const transformedProperties = transformDecoratorParameters(componentDecoratorParameters);

          let templatePath: string | null = null;
          if (transformedProperties.templateSpreadAssignment) {
            templatePath = extractTemplateRequirePath(transformedProperties.templateSpreadAssignment);
          }
          componentsDescriptors[className] = {
            scopeId: componentDecoratorParameters._scopeId,
            templateFilePath: templatePath,
          };

          updateDecoratorParametersObject(transformedProperties, parameterNames, parametersObject);

          if (options.injectModuleIdentifier) {
            // if component is being compiled for SSR, inject module ID
            removeProperty("_moduleId", parametersObject);
            addPropertyAssignment(
              ts.createPropertyAssignment("_moduleId",
                ts.createLiteral(`${options.moduleIdentifier}-${foundComponents - 1}`)),
              parametersObject,
            );
          }

          if (!options.production) {
            // finally add the file path to component options for Vue debug calls
            removeProperty("__file", parametersObject);
            addPropertyAssignment(
              ts.createPropertyAssignment("__file", ts.createLiteral(options.shortFilePath)),
              parametersObject,
            );
          }
        }

      } else {
        traverse(innerNode);
      }
    });
  }

  traverse(root);

  const astPrinter = ts.createPrinter({
    newLine: ts.NewLineKind.LineFeed,
  });

  const resultSourceFile = ts.createSourceFile(options.sourceFile, "", ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);

  return {
    componentsDescriptors,
    content: astPrinter.printNode(ts.EmitHint.SourceFile, root, resultSourceFile),
  };
}
