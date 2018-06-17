import { IArbitraryObject, IParsedQueriedFilename, IStyleDescriptor } from "./types";
import { createArbitraryObject } from "./generators";
import * as ts from "typescript";
import * as path from "path";
import * as qs from "qs";

/**
 * Checks whether the specified object is a component's style descriptor.
 *
 * @param {object} arg
 * @returns {boolean}
 */
export function isStyleDescriptor(arg: any): arg is IStyleDescriptor {
  return (typeof arg === "object" &&
    (typeof arg.scoped === "boolean" || arg.scoped instanceof Boolean) &&
    typeof arg.style !== "undefined" &&
    arg.__thisIsNotAnASTNode);
}

/**
 * Checks whether the specified TS AST node is exported (has the "exported" modifier).
 *
 * @param {ts.Node} node
 * @returns {boolean}
 */
export function isNodeExported(node: ts.Node): boolean {
  return (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) !== 0 ||
    (!!node.parent && node.parent.kind === ts.SyntaxKind.SourceFile);
}

/**
 * Checks whether the specified TS AST node is an exported class declaration.
 *
 * @param {ts.Node} node
 * @returns {boolean}
 */
export function isExportedClass(node: ts.Node): node is ts.ClassDeclaration {
  return isNodeExported(node) && ts.isClassDeclaration(node);
}

/**
 * Checks whether the specified decorator AST node is a call expression decorator with specified name.
 * Extracts and returns a call expression node if there is one.
 *
 * @param {ts.Decorator} decorator
 * @param {string} name
 * @returns {ts.CallExpression | null}
 */
export function isSpecifiedCallExpressionDecorator(decorator: ts.Decorator, name: string): ts.CallExpression | null {
  if (ts.isCallExpression(decorator.expression) &&
    ts.isIdentifier(decorator.expression.expression) &&
    decorator.expression.expression.text === name) {

    return decorator.expression;
  }

  return null;
}

/**
 * Extracts object literal expression of a decorator with the specified name from an array of decorators.
 * Decorators with more than one argument are ignored. If there are several decorators with the same name then
 * argument from the last one is extracted.
 *
 * @param {ts.NodeArray<ts.Decorator>} decorators
 * @param {string} decoratorName
 * @returns {ts.ObjectLiteralExpression | null}
 */
export function extractDecoratorParameters(decorators: ts.NodeArray<ts.Decorator>,
                                           decoratorName: string): ts.ObjectLiteralExpression | null {
  let result: ts.ObjectLiteralExpression | null = null;

  decorators.forEach((decorator: ts.Decorator) => {
    const callExpression = isSpecifiedCallExpressionDecorator(decorator, decoratorName);
    if (callExpression && callExpression.arguments.length === 1) {
      const callExpressionArgument = callExpression.arguments[0];
      if (ts.isObjectLiteralExpression(callExpressionArgument)) {
        result = callExpressionArgument;
      }
    }
  });

  return result;
}

/**
 * The key in the object that's parsed from object literal expression AST node for storing any expressions that are
 * not parsed by this loader.
 *
 * @type {string}
 */
export const additionalObjectLiteralAssignmentsKey = "___additionalAssignmentNodes___";

/**
 * Recursively parses and extracts parameters from the specified object literal expression AST node.
 * Extracts all parameters if an array of parameter names is not specified.
 * Transforms literal and token expressions into their runtime values, but any other expressions are extracted as
 * expression node objects.
 *
 * @param {ts.ObjectLiteralExpression} expression
 * @param {string[]} parameters
 * @returns {IArbitraryObject}
 */
export function findParametersInObjectLiteral(expression: ts.ObjectLiteralExpression,
                                              parameters?: string[]): IArbitraryObject {

  /**
   * A subroutine for either transforming specified expression into its runtime value or recursively traversing
   * object literal expressions.
   *
   * @param {ts.Expression} subExpression
   * @returns {any}
   */
  function grab(subExpression: ts.Expression): any {

    if (ts.isLiteralExpression(subExpression)) {
      if (subExpression.kind === ts.SyntaxKind.NumericLiteral) {
        return Number(subExpression.text);
      } else {
        return String(subExpression.text);
      }

    } else if (ts.isToken(subExpression)) {
      if (subExpression.kind === ts.SyntaxKind.TrueKeyword) {
        return true;
      } else if (subExpression.kind === ts.SyntaxKind.FalseKeyword) {
        return false;
      }

    } else if (ts.isObjectLiteralExpression(subExpression)) {
      return findParametersInObjectLiteral(subExpression);
    }

    return subExpression;
  }

  const result: IArbitraryObject = createArbitraryObject();

  expression.properties.forEach((propertyAssignment: ts.ObjectLiteralElementLike) => {
    if (ts.isPropertyAssignment(propertyAssignment)) {
      // we can only parse properties defined with compile-time values, e.g. identifiers and string literals
      if (ts.isIdentifier(propertyAssignment.name) || ts.isStringLiteral(propertyAssignment.name)) {
        const propertyName: string = propertyAssignment.name.text;

        if (!parameters || parameters.includes(propertyName)) {
          const expressionInitializer = propertyAssignment.initializer;

          if (ts.isArrayLiteralExpression(expressionInitializer)) {
            const traverseArray = (arrayExpression: ts.ArrayLiteralExpression): any[] => {
              const arrayResult: any[] = [];
              arrayExpression.elements.forEach((arrayEntryExpression: ts.Expression) => {
                if (ts.isArrayLiteralExpression(arrayEntryExpression)) {
                  arrayResult.push(traverseArray(arrayEntryExpression));
                } else {
                  arrayResult.push(grab(arrayEntryExpression));
                }
              });
              return arrayResult;
            };

            result[propertyName] = traverseArray(expressionInitializer);

          } else {
            result[propertyName] = grab(expressionInitializer);
          }
        }
      }

    } else {
      if (typeof result[additionalObjectLiteralAssignmentsKey] === "undefined") {
        result[additionalObjectLiteralAssignmentsKey] = [] as ts.ObjectLiteralElement[];
      }
      result[additionalObjectLiteralAssignmentsKey].push(propertyAssignment);
    }
  });

  return result;
}

/**
 * Checks whether the specified object is an AST node object.
 *
 * @param value
 * @returns {boolean}
 */
export function isNodeObject(value: any): boolean {
  return !value.__thisIsNotAnASTNode && typeof value.kind === "number" && typeof value.flags === "number";
}

/**
 * Parses the specified file URL and returns its components.
 *
 * @param {string} file
 * @returns {IParsedQueriedFilename}
 */
export function parseRequiredFilename(file: string): IParsedQueriedFilename {
  const split: string[] = file.split("?");
  if (split.length < 2) {
    return { file: split[0] };
  }

  const query = qs.parse(split[1]);

  return {
    file: split[0],
    query,
  };
}

/**
 * Returns an extension part of the specified filename if present.
 *
 * @param {string} filePath
 * @returns {string | undefined}
 */
export function extractExtension(filePath: string): string | undefined {
  const result = path.extname(filePath).replace(".", "");
  if (result) {
    return result;
  } else {
    return undefined;
  }
}

/**
 * Returns an object with specified vue-loader options.
 *
 * @param {string} filePath
 * @param {string} id
 * @param {boolean} scoped
 * @param {"template" | "style"} type
 * @param {object} extra
 * @returns {object}
 */
export function getVueLoaderParameters(filePath: string,
                                       id: string,
                                       scoped: boolean,
                                       type: "template" | "style",
                                       extra: object = {}): object {
  const fileExtension = extractExtension(filePath);

  const params: any = {
    vue: null,
    type,
    lang: fileExtension ? fileExtension : undefined,
  };

  if (scoped) {
    params.id = id;
    params.scoped = scoped;
  }

  return Object.assign(params, extra);
}

/**
 * Extracts and returns the component's template file path from a spread assignment, generated previously.
 *
 * @param {ts.SpreadAssignment} assignment
 * @returns {string | null}
 */
export function extractTemplateRequirePath(assignment: ts.SpreadAssignment): string | null {
  if (ts.isCallExpression(assignment.expression) && assignment.expression.arguments.length === 1) {
    const argument = assignment.expression.arguments[0];
    if (ts.isStringLiteral(argument)) {
      return argument.text;
    }
  }

  return null;
}
