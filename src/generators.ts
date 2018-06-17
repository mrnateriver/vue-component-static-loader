import {
  IArbitraryObject,
  IComponentDecoratorParameters,
  IDecoratorParametersTransformationResult,
  IParsedStyleDescriptors, ISourceFileComponentsHMRDescriptors,
} from "./types";
import {
  additionalObjectLiteralAssignmentsKey,
  getVueLoaderParameters,
  isNodeObject, isStyleDescriptor,
  parseRequiredFilename,
} from "./parsers";
import * as ts from "typescript";
import * as qs from "qs";

/**
 * Generates a code for a call to "vue-hot-reload-api" for reloading component options.
 * Receives a dictionary of class names of components defined in processed source file as keys and tuples with
 * scope ID and template file paths as values.
 *
 * @param {ISourceFileComponentsHMRDescriptors} componentsHMRDescriptors
 * @param {"createRecord" | "reload"} methodName
 * @returns {string}
 */
export function generateComponentsHotReloadCalls(componentsHMRDescriptors: ISourceFileComponentsHMRDescriptors,
                                                 methodName: "createRecord" | "reload"): string {
  return Object.keys(componentsHMRDescriptors).map((className: string): string => {
    return `api.${methodName}("${componentsHMRDescriptors[className].scopeId}", (${className} as any).options);`;
  }).join("\n");
}

/**
 * Generates a code for a call to "vue-hot-reload-api" for reloading component templates.
 * Receives a dictionary of class names of components defined in processed source file as keys and tuples with
 * scope ID and template file paths as values.
 *
 * @param {ISourceFileComponentsHMRDescriptors} componentsHMRDescriptors
 * @returns {string}
 */
export function generateComponentsTemplateHotReloadCalls(componentsHMRDescriptors: ISourceFileComponentsHMRDescriptors): string {
  return Object.values(componentsHMRDescriptors).map(({ scopeId, templateFilePath }): string => {
    if (templateFilePath) {
      return `
    module.hot.accept(${JSON.stringify(templateFilePath)}, () => {
      api.rerender("${scopeId}", { ...require(${JSON.stringify(templateFilePath)}) });
    });`.trim();
    } else {
      return "";
    }
  }).filter(Boolean).join("\n");
}

/**
 * Creates an arbitrary object with parameters assigned from the specified one.
 * This function is necessary for insertion of special parameter that differentiates resulting objects from TS AST
 * node objects.
 *
 * @param {object} arg
 * @returns {IArbitraryObject}
 */
export function createArbitraryObject(arg: object = {}): IArbitraryObject {
  return Object.assign({
    __thisIsNotAnASTNode: true,
  }, arg);
}

/**
 * Creates a property assignment expression AST node with the specified identifier name and arbitrary value.
 *
 * @param {string} key
 * @param value
 * @returns {ts.PropertyAssignment}
 */
export function constructPropertyAssignment(key: string, value: any): ts.PropertyAssignment {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return ts.createPropertyAssignment(key, ts.createLiteral(value));

  } else if (value && typeof value === "object") {
    if (value instanceof Array) {
      return ts.createPropertyAssignment(key, ts.createArrayLiteral(value.map((entry: any): ts.Expression => {
        const propertyAssignment = constructPropertyAssignment(key, entry);
        return propertyAssignment.initializer;
      }), true));

    } else if (isNodeObject(value)) {
      return ts.createPropertyAssignment(key, value as ts.Expression);

    } else {
      return ts.createPropertyAssignment(key, constructObjectLiteral(value));
    }

  } else {
    return ts.createPropertyAssignment(key, ts.createNull());
  }
}

/**
 * Creates an object literal expression AST node from the specified arbitrary object.
 *
 * @param {IArbitraryObject} object
 * @returns {ts.ObjectLiteralExpression}
 */
export function constructObjectLiteral(object: IArbitraryObject): ts.ObjectLiteralExpression {
  return ts.createObjectLiteral((Object.keys(object).map((key: string): ts.ObjectLiteralElementLike[] | null => {
    if (key === additionalObjectLiteralAssignmentsKey) {
      return object[additionalObjectLiteralAssignmentsKey] as ts.PropertyAssignment[];
    } else if (key !== "__thisIsNotAnASTNode") {
      return [constructPropertyAssignment(key, object[key])];
    }
    return null;

  }).filter(Boolean) as ts.ObjectLiteralElementLike[][])
    .reduce((previousValue: ts.ObjectLiteralElementLike[], currentValue: ts.ObjectLiteralElementLike[]) => {
      return previousValue.concat(currentValue);
    }, []), true);
}

/**
 * Parses specified URL, adds the specified parameters to its query part and returns the result as a new URL string.
 *
 * @param {string} filePath
 * @param {object} additionalParameters
 * @returns {string}
 */
export function addParametersToExistingQuery(filePath: string, additionalParameters: object): string {
  const { file, query: existingQuery } = parseRequiredFilename(filePath);

  const query = existingQuery ? Object.assign(existingQuery, additionalParameters) : additionalParameters;

  return `${file}?${qs.stringify(query, { strictNullHandling: true, addQueryPrefix: false })}`;
}

/**
 * Parses specified component decorator parameters and transforms them to the form that's usable by the Vue runtime.
 * The result basically imitates what "vue-loader" does for SFC.
 *
 * @param {IComponentDecoratorParameters} parameters
 * @returns {IDecoratorParametersTransformationResult}
 */
export function transformDecoratorParameters(parameters: IComponentDecoratorParameters): IDecoratorParametersTransformationResult {
  // Some transformation notes:
  // 1. If there are scoped styles, but the template is specified as a string literal, scoping is ignored, since a
  //    string template is interpreted as-is and is not parsed for applying scoping attributes;
  // 2. Styles specified with string literals are interpreted as unscoped file paths.

  const result: IDecoratorParametersTransformationResult = {};

  /**
   * A subroutine for creating a require() call expression with specified file path and query parameters.
   *
   * @param {string} filePath
   * @param {object} params
   * @returns {ts.CallExpression}
   */
  function createRequire(filePath: string, params: object): ts.CallExpression {
    const requiredPath = addParametersToExistingQuery(filePath, params);
    return ts.createCall(ts.createIdentifier("require"), undefined, [ts.createLiteral(requiredPath)]);
  }

  /**
   * A subroutine for creating a require() call expression specifically for importing template files.
   *
   * @param {string} filePath
   * @param {boolean} scoped
   * @returns {ts.CallExpression}
   */
  function createTemplateRequire(filePath: string, scoped: boolean): ts.CallExpression {
    return createRequire(filePath, getVueLoaderParameters(filePath, parameters._scopeId!, scoped, "template"));
  }

  /**
   * A subroutine for creating a require() call expression specifically for importing stylesheet files.
   *
   * @param {string} filePath
   * @param {boolean} scoped
   * @returns {ts.CallExpression}
   */
  function createStyleRequire(filePath: string, scoped: boolean): ts.CallExpression {
    return createRequire(filePath,
      getVueLoaderParameters(filePath, parameters._scopeId!, scoped, "style", { index: 0 }));
  }

  /**
   * Parses an expression of style definition and returns whether it can be scoped and an expression for this stylesheet
   * file import.
   *
   * @param {ts.Expression} expression
   * @param {boolean} scoped
   * @returns {{scoped: boolean; style: ts.Expression}}
   */
  function parseStyleExpression(expression: ts.Expression,
                                scoped: boolean): { scoped: boolean; style: ts.Expression } {
    if (ts.isCallExpression(expression)) {
      const call = expression.expression;
      if (ts.isIdentifier(call) && call.text === "require") {
        // parse only require() calls with a string literal expression as the only argument
        return parseStyleCallExpression(expression, scoped);
      }
    }

    // but if the style is specified in any other way leave it as it is
    return { scoped: false, style: expression };
  }

  /**
   * Parses a stylesheet require() call and returns whether it can be scoped and a transformed require() call
   * expression with the necessary query parameters.
   *
   * @param {ts.CallExpression} expression
   * @param {boolean} scoped
   * @returns {{scoped: boolean; style: ts.CallExpression}}
   */
  function parseStyleCallExpression(expression: ts.CallExpression,
                                    scoped: boolean): { scoped: boolean; style: ts.CallExpression } {
    const callArguments = expression.arguments;
    if (callArguments.length === 1) {
      const argument = callArguments[0];
      if (ts.isStringLiteral(argument)) {
        return { scoped, style: createStyleRequire(argument.text, scoped) };
      }
    }

    return { scoped: false, style: expression };
  }

  /**
   * Parses anything that is specified as a styles parameter in component decorator options and returns a sanitized
   * array of all parsed styles and whether any of them are scoped.
   *
   * @param {any} descriptors
   * @returns {IParsedStyleDescriptors}
   */
  function parseStyleDescriptors(descriptors: typeof parameters.style): IParsedStyleDescriptors {
    let parseResult: ts.Expression = descriptors as ts.Expression;
    let parseScoped: boolean = false;

    if (typeof descriptors === "string") {
      // if the descriptor is a string literal, simply transform it to unscoped require() call
      parseResult = constructObjectLiteral(createArbitraryObject({
        scoped: false,
        style: createStyleRequire(descriptors, false),
      }));

    } else if (typeof descriptors === "object") {
      if (descriptors instanceof Array) {
        // with this slightly convoluted construct we parse each descriptor in the array and then reduce whether any
        // of the parsed descriptors were scoped
        const generalResult: { descriptors: ts.Expression[]; scoped: boolean; }
          = descriptors.map(parseStyleDescriptors)
          .reduce((previousValue, currentValue) => {
              return {
                descriptors: previousValue.descriptors.concat([currentValue.descriptors]),
                scoped: previousValue.scoped || currentValue.scoped,
              };
            },
            { descriptors: [] as ts.Expression[], scoped: false });

        // generalResult.descriptors will be an array, thus constructPropertyAssignment() will return a property
        // assignment expression with that array literal as an initializer; we only need that array literal, so we
        // create a property expression with any arbitrary name
        parseResult = constructPropertyAssignment("any", generalResult.descriptors).initializer;
        parseScoped = generalResult.scoped;

      } else if (isStyleDescriptor(descriptors)) {
        parseScoped = descriptors.scoped;

        if (typeof descriptors.style === "string") {
          parseResult = constructObjectLiteral(createArbitraryObject(Object.assign(descriptors, {
            style: createStyleRequire(descriptors.style, parseScoped),
          })));

        } else {
          const parsedExpression = parseStyleExpression(descriptors.style, parseScoped);
          parseScoped = parsedExpression.scoped;

          parseResult = constructObjectLiteral(createArbitraryObject(Object.assign(descriptors, parsedExpression)));
        }

      } else if (isNodeObject(descriptors)) {
        parseResult = parseStyleExpression(descriptors, false).style;

      } else {
        // if there's way of parsing the descriptor simply leave it as-is
        parseResult = constructObjectLiteral(descriptors);
      }
    }

    return { descriptors: parseResult, scoped: parseScoped };
  }

  let templateScoped: boolean = false;
  if (parameters.styles) {
    const { descriptors: styleDescriptors, scoped: stylesScoped } = parseStyleDescriptors(parameters.styles);
    templateScoped = stylesScoped;

    result.stylesProperty = ts.createPropertyAssignment("styles", styleDescriptors);
  }

  if (typeof parameters.template === "object") {
    // template parameter is only parsed if it's a require() call expression...
    if (ts.isCallExpression(parameters.template)) {
      const call = parameters.template.expression;
      if (ts.isIdentifier(call) && call.text === "require") {
        let callExpression: ts.CallExpression = parameters.template;
        let compiled: boolean = false;

        const callArguments = parameters.template.arguments;
        if (callArguments.length === 1) {
          const argument = callArguments[0];
          if (ts.isStringLiteral(argument)) {
            // ... and also if it has a string literal as the only argument
            callExpression = createTemplateRequire(argument.text, templateScoped);
            compiled = true;
          }
        }

        if (compiled) {
          result.compiledProperty = ts.createPropertyAssignment("_compiled", ts.createTrue());
          result.templateSpreadAssignment = ts.createSpreadAssignment(callExpression);
        }
      }
    }
  }

  if (templateScoped) {
    // specify scope ID only if it's necessary, since otherwise it will be included in generated DOM during SSR even
    // if component doesn't have any scoped styles
    result.scopeProperty = ts.createPropertyAssignment("_scopeId", ts.createLiteral(`data-v-${parameters._scopeId}`));
  }

  return result;
}

/**
 * Removes the specified property from the specified object literal expression.
 *
 * @param {string} propertyName
 * @param {ts.ObjectLiteralExpression} existingObject
 */
export function removeProperty(propertyName: string, existingObject: ts.ObjectLiteralExpression): void {
  let propertyIndex: number = -1;
  existingObject.properties.forEach((property: ts.ObjectLiteralElementLike, index: number) => {
    if (ts.isPropertyAssignment(property)) {
      // parse only properties with names known at compile-time
      if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) {
        const existingPropertyName: string = property.name.text;
        if (existingPropertyName === propertyName) {
          propertyIndex = index;
          return;
        }
      }
    }
  });

  if (propertyIndex >= 0) {
    const beforeSlice = existingObject.properties.slice(0, propertyIndex);
    const afterSlice = existingObject.properties.slice(propertyIndex + 1);

    existingObject.properties = ts.updateObjectLiteral(
      existingObject,
      beforeSlice.concat(afterSlice),
    ).properties;
  }
}

/**
 * Adds the specified property assignment expression to the specified object literal expression.
 *
 * @param {ts.SpreadAssignment | ts.PropertyAssignment | ts.PropertyAssignment[]} property
 * @param {ts.ObjectLiteralExpression} existingObject
 */
export function addPropertyAssignment(property: ts.SpreadAssignment | ts.PropertyAssignment | ts.PropertyAssignment[],
                                      existingObject: ts.ObjectLiteralExpression): void {
  existingObject.properties = ts.updateObjectLiteral(
    existingObject,
    existingObject.properties.concat(property instanceof Array ? property : [property]),
  ).properties;
}

/**
 * Updates component decorator parameters object literal expression according to parsing results.
 *
 * @param {IDecoratorParametersTransformationResult} parameters
 * @param {{_scopeId: string; _compiled: string; template: string; styles: string}} parameterNames
 * @param {ts.ObjectLiteralExpression} existingObject
 */
export function updateDecoratorParametersObject(parameters: IDecoratorParametersTransformationResult,
                                                parameterNames: {
                                                  _scopeId: string;
                                                  _compiled: string;
                                                  template: string;
                                                  styles: string;
                                                },
                                                existingObject: ts.ObjectLiteralExpression): void {
  if (parameters.scopeProperty) {
    // прежде всего, добавим в параметры декоратора идентификатор компонента
    removeProperty(parameterNames._scopeId, existingObject);
    addPropertyAssignment(parameters.scopeProperty, existingObject);
  }

  if (parameters.compiledProperty) {
    removeProperty(parameterNames._compiled, existingObject);
    addPropertyAssignment(parameters.compiledProperty, existingObject);
  }

  if (parameters.templateSpreadAssignment) {
    // если присутствуют свойства для шаблона, то нужно заменить изначальный параметр template
    removeProperty(parameterNames.template, existingObject);
    addPropertyAssignment(parameters.templateSpreadAssignment, existingObject);
  }

  if (parameters.stylesProperty) {
    removeProperty(parameterNames.styles, existingObject);
    addPropertyAssignment(parameters.stylesProperty, existingObject);
  }
}
