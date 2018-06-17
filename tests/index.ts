// tslint:disable
import loaderFunction, { LoaderContext } from "../src/loader";
import { addParametersToExistingQuery } from "../src/generators";
import * as assert from "assert";
import * as path from "path";

const hash = require("hash-sum");

function generateTemplateHMROutput(scoped: boolean, templatePath: string): string {
  const requiredPath = addParametersToExistingQuery(templatePath, { vue: null, type: "template", lang: "pug" }) +
    (scoped ? "&id=%HASH%&scoped=true" : "");

  return `
    module.hot.accept("${requiredPath}", () => {
      api.rerender("%HASH%", { ...require("${requiredPath}") });
    });
    `.trim();
}

function generateHMRExpectedOutput(templatePaths?: string[], scoped: boolean = false): string {
  return "\n" + `
  /* hot reload */
declare var module: any;

if (module.hot) {
  const api: any = require("${require.resolve("vue-hot-reload-api")}");
  api.install(require("vue"));

  if (api.compatible) {
    module.hot.accept();
    if (!module.hot.data) {
      api.createRecord("%HASH%", (H as any).options);
    } else {
      api.reload("%HASH%", (H as any).options);
    }
    ${(templatePaths || []).map(generateTemplateHMROutput.bind(undefined, scoped)).join(";\n")}
  }
}
  `.trim();
}

const expectedResults: Array<[string, string]> = [
  // 0
  [
    `@Component({ template: ["./test.pug"], styles: identifier, components: { "cart": Cart, }, }) export default class H {}`,
    `@Component({ template: ["./test.pug"], components: { "cart": Cart, }, styles: identifier, __file: "testResource.ts" }) export default class H {}` + generateHMRExpectedOutput(),
  ],
  // 1
  [
    `@Component({ template: "./test.pug", styles: { shorthandProp, test: { scoped: true, style: false } }, components: { "cart": Cart, }, }) export default class H {}`,
    `@Component({ template: "./test.pug", components: { "cart": Cart, }, styles: { shorthandProp, test: { scoped: true, style: false } }, __file: "testResource.ts" }) export default class H {}` + generateHMRExpectedOutput(),
  ],
  // 2
  [
    `@Component({ template: require("./test.pug"), styles: [ identifier ], components: { "cart": Cart, }, }) export default class H {}`,
    `@Component({ components: { "cart": Cart, }, _compiled: true, ...require("./test.pug?vue&type=template&lang=pug"), styles: [ identifier ], __file: "testResource.ts" }) export default class H {}` + generateHMRExpectedOutput(["./test.pug"]),
  ],
  // 3
  [
    `@Component({ template: require("./test.pug?someExistingQuery=true"), styles: [ identifier ], components: { "cart": Cart, }, }) export default class H {}`,
    `@Component({ components: { "cart": Cart, }, _compiled: true, ...require("./test.pug?someExistingQuery=true&vue&type=template&lang=pug"), styles: [ identifier ], __file: "testResource.ts" }) export default class H {}` + generateHMRExpectedOutput(["./test.pug?someExistingQuery=true"]),
  ],
  // 4
  [
    `@Component({ template: ["./test.pug"], ...identifier, components: { "cart": Cart, }, }) export default class H {}`,
    `@Component({ template: ["./test.pug"], ...identifier, components: { "cart": Cart, }, __file: "testResource.ts" }) export default class H {}` + generateHMRExpectedOutput(),
  ],
  // 5
  [
    `@Component({ template: ["./test.pug"], styles: { ...identifier }, components: { "cart": Cart, }, }) export default class H {}`,
    `@Component({ template: ["./test.pug"], components: { "cart": Cart, }, styles: { ...identifier }, __file: "testResource.ts" }) export default class H {}` + generateHMRExpectedOutput(),
  ],
  // 6
  [
    `@Component({ template: ["./test.pug"], styles: [{ ...identifier }, ...second, true], components: { "cart": Cart, }, }) export default class H {}`,
    `@Component({ template: ["./test.pug"], components: { "cart": Cart, }, styles: [{ ...identifier }, ...second, true], __file: "testResource.ts" }) export default class H {}` + generateHMRExpectedOutput(),
  ],
  // 7
  [
    `@Component({ template: require("./test.pug"), styles: [{ ...identifier }, 123, { scoped: true, style: "test.css" }], components: { "cart": Cart, }, }) export default class H {}`,
    `@Component({ components: { "cart": Cart, }, _scopeId: "data-v-%HASH%", _compiled: true, ...require("./test.pug?vue&type=template&lang=pug&id=%HASH%&scoped=true"), styles: [{ ...identifier }, 123, { scoped: true, style: require("test.css?vue&type=style&lang=css&id=%HASH%&scoped=true&index=0") }], __file: "testResource.ts" }) export default class H {}` + generateHMRExpectedOutput(["./test.pug"], true),
  ],
  // 8
  [
    `@Component({ template: require("./test.pug"), styles: [{ scoped: true, style: "test1.css" }, { scoped: false, style: require("test2.css") }], components: { "cart": Cart, }, }) export default class H {}`,
    `@Component({ components: { "cart": Cart, }, _scopeId: "data-v-%HASH%", _compiled: true, ...require("./test.pug?vue&type=template&lang=pug&id=%HASH%&scoped=true"), styles: [{ scoped: true, style: require("test1.css?vue&type=style&lang=css&id=%HASH%&scoped=true&index=0") }, { scoped: false, style: require("test2.css?vue&type=style&lang=css&index=0") }], __file: "testResource.ts" }) export default class H {}` + generateHMRExpectedOutput(["./test.pug"], true),
  ],
  // 9
  [
    `@Component({ template: require("./test.pug"), styles: ["test1.css", 123, false, { scoped: false, style: require("test2.css") }], components: { "cart": Cart, }, }) export default class H {}`,
    `@Component({ components: { "cart": Cart, }, _compiled: true, ...require("./test.pug?vue&type=template&lang=pug"), styles: [{ scoped: false, style: require("test1.css?vue&type=style&lang=css&index=0") }, 123, false, { scoped: false, style: require("test2.css?vue&type=style&lang=css&index=0") }], __file: "testResource.ts" }) export default class H {}` + generateHMRExpectedOutput(["./test.pug"]),
  ],
  // 10
  [
    `@Component({ template: require("./test.pug"), styles: [require("test1.css"), 123, false, { scoped: false, style: require("test2.css") }], components: { "cart": Cart, }, }) export default class H {}`,
    `@Component({ components: { "cart": Cart, }, _compiled: true, ...require("./test.pug?vue&type=template&lang=pug"), styles: [require("test1.css?vue&type=style&lang=css&index=0"), 123, false, { scoped: false, style: require("test2.css?vue&type=style&lang=css&index=0") }], __file: "testResource.ts" }) export default class H {}` + generateHMRExpectedOutput(["./test.pug"]),
  ],
  // 11
  [
    `@Component({ template: require("./test.pug"), styles: { scoped: true, style: someIdentifier }, components: { "cart": Cart, }, }) export default class H {}`,
    `@Component({ components: { "cart": Cart, }, _compiled: true, ...require("./test.pug?vue&type=template&lang=pug"), styles: { scoped: false, style: someIdentifier }, __file: "testResource.ts" }) export default class H {}` + generateHMRExpectedOutput(["./test.pug"]),
  ],
  // 12
  [
    `@Component({ template: require("./test.pug"), styles: { scoped: true, style: require("test.css") }, components: { "cart": Cart, }, }) export default class H {}`,
    `@Component({ components: { "cart": Cart, }, _scopeId: "data-v-%HASH%", _compiled: true, ...require("./test.pug?vue&type=template&lang=pug&id=%HASH%&scoped=true"), styles: { scoped: true, style: require("test.css?vue&type=style&lang=css&id=%HASH%&scoped=true&index=0") }, __file: "testResource.ts" }) export default class H {}` + generateHMRExpectedOutput(["./test.pug"], true),
  ],
  // 13
  [
    `@Component({ template: require("./test.pug"), styles: "test.css", components: { "cart": Cart, }, }) export default class H {}`,
    `@Component({ components: { "cart": Cart, }, _compiled: true, ...require("./test.pug?vue&type=template&lang=pug"), styles: { scoped: false, style: require("test.css?vue&type=style&lang=css&index=0") }, __file: "testResource.ts" }) export default class H {}` + generateHMRExpectedOutput(["./test.pug"]),
  ],
];

function createContext(index: number, source: string, expectedResult: string): LoaderContext {
  return {
    resourcePath: "testResource.ts",
    context: path.resolve(__dirname),

    async() {
      return (error: null, actualResult: string) => {
        assert.strictEqual(actualResult.replace(/\s+/g, ""),
          expectedResult.replace(/\s+/g, ""),
          `Test results #${index} mismatch.\n\nExpected result:\n${expectedResult}\n\nActual result:\n${actualResult}\n`);
      };
    },

  } as LoaderContext;
}

export default function run() {
  const scopeId = `${hash("testResource.ts")}-0`;

  let i: number = 0;
  for (const [source, result] of expectedResults) {
    loaderFunction.call(createContext(i++, source, result.replace(/%HASH%/g, scopeId)), source);
  }
}

run();
