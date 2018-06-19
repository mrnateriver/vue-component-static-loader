import Vue, { ComponentOptions } from "vue";
import BaseComponentDecorator, { componentFactory, VueClass } from "vue-class-component";

/**
 * A declaration of the Vue SSR context that's available during SSR execution.
 */
declare const __VUE_SSR_CONTEXT__: { [key: string]: any; } | undefined;

/**
 * An interface of the object that's returned from importing styles with manual injection.
 */
interface IInjectableStyle {
  __inject__(): void;
}

/**
 * An interface of an object describing one of the component's styles.
 */
interface IComponentDecoratorStyleDefinition {
  scoped: boolean;
  style: IInjectableStyle | any;
}

/**
 * A type of component's style descriptor.
 * If style is specified as a string, it's interpreted as a file path.
 */
export type ComponentDecoratorStyleDescriptor = string | IComponentDecoratorStyleDefinition;

/**
 * A declaration of available component decorator options.
 * Parameters starting with underscore are not meant for direct usage and will be replaced by the loader in
 * this package.
 */
export type ComponentDecoratorOptions<V extends Vue> = ComponentOptions<V> & {
  template?: any;
  styles?: ComponentDecoratorStyleDescriptor | ComponentDecoratorStyleDescriptor[];

  _moduleId?: string;
  _scopeId?: string;
  _compiled?: boolean;

  __file?: string;

} & ThisType<V>;

/**
 * Vue component decorator.
 * A class with this decorator will be transformed into extended Vue constructor function at runtime.
 *
 * This is a declaration of decorator signature in factory mode. This signature is used when decorator is applied as a call
 * expression.
 *
 * @param {ComponentDecoratorOptions<V>} options
 * @returns {(target: VC) => VC}
 */
function Component<V extends Vue>(options: ComponentDecoratorOptions<V>): <VC extends VueClass<V>>(target: VC) => VC;
/**
 * Vue component decorator.
 * A class with this decorator will be transformed into extended Vue constructor function at runtime.
 *
 * This is a declaration of decorator signature in statement mode. This signature is used when decorator is applied without
 * parenthesis.
 *
 * @param {VC} target
 * @returns {VC}
 */
function Component<VC extends VueClass<Vue>>(target: VC): VC;

/**
 * Vue component decorator.
 * A class with this decorator will be transformed into extended Vue constructor function at runtime.
 *
 * @param {any} options
 * @returns {any}
 */
function Component(options: any): any {
  // If decorator is applied without any parameters, simply pass it down to default implementation
  if (typeof options === "function") {
    return componentFactory(options);
  }

  return <VC extends VueClass<Vue>>(componentClass: VC): VC => {
    const decoratorOptions = options as ComponentDecoratorOptions<Vue>;

    // If module ID is specified then the current environment is SSR. In this case we need to add component hooks for
    // injecting styles if necessary
    if (decoratorOptions._moduleId) {
      const injectableStyles: IInjectableStyle[] = [];

      /**
       * Checks if an imported style is manually injectable.
       *
       * @param style
       * @returns {boolean}
       */
      const isInjectable = (style: any): style is IInjectableStyle => {
        return typeof style === "object" && typeof style.__inject__ === "function";
      };

      /**
       * Checks whether the specified style descriptor is valid.
       *
       * @param style
       * @returns {boolean}
       */
      const isDescriptor = (style: any): style is IComponentDecoratorStyleDefinition => {
        return typeof style.scoped === "boolean" && typeof style.style === "object";
      };

      /**
       * Adds the specified style to the list of injectable styles.
       *
       * @param style
       */
      const inject = (style: any): void => {
        if (isDescriptor(style)) {
          style = style.style;
        }

        if (isInjectable(style)) {
          injectableStyles.push(style);
        }
      };

      if (decoratorOptions.styles instanceof Array) {
        for (const style of decoratorOptions.styles) {
          inject(style);
        }
      } else if (decoratorOptions.styles) {
        inject(decoratorOptions.styles);
      }

      if (injectableStyles.length) {
        // The following procedure is mostly taken from vue-loader/lib/runtime/componentNormalizer.js
        const hook = function (this: Vue & ComponentOptions<Vue>, context?: any): void {
          context = context ||
            (this.$vnode && (this.$vnode as any).ssrContext) ||
            (this.parent && this.parent.$vnode && (this.parent.$vnode as any).ssrContext);

          if (!context && typeof __VUE_SSR_CONTEXT__ !== "undefined") {
            context = __VUE_SSR_CONTEXT__;
          }

          for (const style of injectableStyles) {
            style.__inject__.call(this, context);
          }

          if (context && context._registeredComponents) {
            context._registeredComponents.add(decoratorOptions._moduleId!);
          }
        };

        options._ssrRegister = hook;

        const existing = options.beforeCreate;
        options.beforeCreate = existing ? [].concat(existing, hook as any) : [hook];

        // Default implementation of componentFactory overwrites hooks defined in the class with ones defined in
        // decorator options, so to prevent that we'll manually add this hook to an array
        const descriptor = Object.getOwnPropertyDescriptor(componentClass.prototype, "beforeCreate");
        if (descriptor && typeof descriptor.value === "function") {
          options.beforeCreate.push(descriptor.value);
        }
      }
    }

    return componentFactory(componentClass, options) as VC;
  };
}

/**
 * A declared extension of the decorator function for registering Vue hooks.
 * This declaration is needed for TypeScript type checking to allow assigning properties to function object.
 */
declare namespace Component {
  /**
   * Registers specified method names as Vue component hooks.
   * Such hooks will not be injected into `methods` collection, but rather will be left declared
   * in component's options.
   *
   * @param {string[]} keys
   */
  function registerHooks(keys: string[]): void;
}
Component.registerHooks = BaseComponentDecorator.registerHooks;

export default Component;
