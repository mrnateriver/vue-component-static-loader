import webpack from "webpack";
import * as ts from "typescript";

/**
 * A shorter alias for Webpack context typing.
 */
export type LoaderContext = webpack.loader.LoaderContext;

/**
 * An interface for loader configuration object.
 */
export interface ILoaderOptions {
  /**
   * Whether the loader is used for production build. Affects component ID generation method and disables Webpack HMR
   * if this flag is enabled.
   *
   * Default: false.
   */
  production: boolean;
  /**
   * The name of the decorator expression.
   *
   * Default: "Component".
   */
  decoratorName: string;
  /**
   * The name of the parameter in decorator argument object that specifies a template that's used for the component.
   *
   * Default: "template".
   */
  templateParameterName: string;
  /**
   * The name of the parameter in decorator argument object that specifies styles that are used for the component.
   *
   * Default: "styles".
   */
  stylesParameterName: string;
  /**
   * Whether to generate Webpack HMR code. Doesn't affect anything if production build is enabled.
   *
   * Default: true.
   */
  hotReload: boolean;
}

/**
 * An interface of options used for rewriting source files.
 */
export interface IRewriteOptions extends ILoaderOptions {
  /**
   * A full path of the processed file.
   */
  sourceFile: string;
  /**
   * A short path of the processed file, relative to the Webpack context or current process working directory.
   */
  shortFilePath: string;
  /**
   * Component's scope identifier. Used for scoped styles and template.
   */
  scopeId: string;
  /**
   * Whether to inject module identifier in component options.
   */
  injectModuleIdentifier: boolean;
  /**
   * Module identifier of the component. Necessary only for Vue SSR, thus enabled only if build target is Node.js.
   */
  moduleIdentifier: string;
}

/**
 * An interface of an object that describes one of the component's styles.
 */
export interface IStyleDescriptor {
  /**
   * Whether this style is scoped.
   */
  scoped: boolean;
  /**
   * Either a path of the stylesheet file or a stylesheet require() call expression.
   */
  style: string | ts.Expression;
}

/**
 * An interface of the component decorator argument object.
 */
export interface IComponentDecoratorParameters {
  /**
   * Component's scope identifier.
   */
  _scopeId?: string;
  /**
   * Whether this component's template will be compiled before runtime.
   */
  _compiled?: boolean;
  /**
   * Component's template contents or require() call expression.
   */
  template?: string | ts.Expression;
  /**
   * An array or a single style descriptor of the component.
   */
  styles?: string | IStyleDescriptor | ts.Expression | Array<string | IStyleDescriptor | ts.Expression>;

  /**
   * Any other options that are not processed by this loader.
   */
  [otherKeys: string]: any;
}

/**
 * An interface of the object that's returned by the decorator parameters parser function.
 */
export interface IDecoratorParametersTransformationResult {
  /**
   * An instance of the scope ID property expression if it's needed.
   */
  scopeProperty?: ts.PropertyAssignment;
  /**
   * An instance of the "compiled" flag property if it's needed.
   */
  compiledProperty?: ts.PropertyAssignment;
  /**
   * An instance of the "styles" property if it's needed.
   */
  stylesProperty?: ts.PropertyAssignment;
  /**
   * An instance of the "template" property spread assignment expression if template was specified.
   */
  templateSpreadAssignment?: ts.SpreadAssignment;
}

/**
 * An interface of an object that represents parsed file URL.
 */
export interface IParsedQueriedFilename {
  /**
   * A file path parsed from URL.
   */
  file: string;
  /**
   * An arbitrary object with parameters parsed from the query part of the URL.
   */
  query?: IArbitraryObject;
}

/**
 * An interface of an object that represents the results of parsing specified component styles.
 */
export interface IParsedStyleDescriptors {
  /**
   * An array of style descriptors transformed into final AST expressions.
   */
  descriptors: ts.Expression;
  /**
   * Whether any of the parsed styles are scoped.
   */
  scoped: boolean;
}

/**
 * An interface of an arbitrary JS object.
 */
export interface IArbitraryObject {
  /**
   * An internal field that's used to definitely differentiate any arbitrary object from TS AST node when parsing.
   */
  __thisIsNotAnASTNode: boolean;
  /**
   * Any field.
   */
  [key: string]: any;
}
