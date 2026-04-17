import { expect } from "vitest";
import * as matchers from "vitest-axe/matchers";
import failOnConsole from "vitest-fail-on-console";

expect.extend(matchers);

/**
 * Mocks the DataTransfer class for testing as it is not available in JSDOM
 *
 * @note This only implements the underlying data structure and `files()` method
 * @see MDN documentation: https://developer.mozilla.org/en-US/docs/Web/API/DataTransfer
 */
class DataTransfer {
  items = null;

  constructor() {
    this.items = new (class {
      array;

      constructor() {
        this.array = [];
      }

      add(file) {
        this.array.push(file);
      }

      get length() {
        return this.array.length;
      }
    })();
  }

  get files() {
    return this.items.array;
  }
}

globalThis.DataTransfer = DataTransfer;

/**
 * Stubs HTMLCanvasElement.getContext to suppress jsdom warning
 */
HTMLCanvasElement.prototype.getContext = () => null;

/**
 * Prevents the console.error and console.warn from silently failing
 * in tests by throwing an error when called
 */
failOnConsole({
  shouldFailOnWarn: true,
  shouldFailOnError: true,
});
