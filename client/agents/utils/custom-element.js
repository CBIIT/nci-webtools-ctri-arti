import { register } from "component-register";
import { createRoot, createSignal } from "solid-js";
import { insert } from "solid-js/web";

/**
 * Create reactive props for the component
 * @param {object} raw
 * @returns {object} props
 */
function createProps(raw) {
  const keys = Object.keys(raw);
  const props = {};

  for (let i = 0; i < keys.length; i++) {
    const [get, set] = createSignal(raw[keys[i]]);
    Object.defineProperty(props, keys[i], {
      get,
      set(v) {
        set(() => v);
      },
    });
  }

  return props;
}

/**
 * Find the context for a given element.
 * @param {any} el
 * @returns {any} context
 */
function lookupContext(el) {
  if (el.assignedSlot && el.assignedSlot._$owner) return el.assignedSlot._$owner;

  let next = el.parentNode;
  while (next && !next._$owner && !(next.assignedSlot && next.assignedSlot._$owner)) next = next.parentNode;

  return next && next.assignedSlot ? next.assignedSlot._$owner : el._$owner;
}

/**
 * Wrap a Solid component to work with Web Components
 * @param {function} ComponentType - The Solid component to wrap
 * @returns {function} - A function that takes raw props and options, and returns a Solid component
 */
export function withSolid(ComponentType) {
  return (rawProps, options) => {
    const { element } = options;

    return createRoot((dispose) => {
      // Create reactive props from raw properties
      const props = createProps(rawProps);
      element.addPropertyChangedCallback((key, val) => (props[key] = val));
      element.addReleaseCallback(() => {
        element.renderRoot.textContent = "";
        dispose();
      });

      // Render the component
      const comp = ComponentType(props, options);
      return insert(element.renderRoot, comp);
    }, lookupContext(element));
  };
}

/**
 * Create a custom element with Solid.js component
 * @param {string} tag
 * @param {any} propsOrComponent
 * @param {any} maybeComponent
 * @returns {function} - A function that creates a custom element
 */
export default function customElement(tag, propsOrComponent, maybeComponent) {
  if (arguments.length === 2) {
    maybeComponent = propsOrComponent;
    propsOrComponent = {};
  }
  return register(tag, propsOrComponent)(withSolid(maybeComponent));
}
