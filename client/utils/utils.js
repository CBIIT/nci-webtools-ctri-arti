import { createMemo } from "solid-js";

import { marked } from "marked";

import { TOOLS } from "./tools.js";

// Re-export tools for backward compatibility
export { TOOLS };
window.TOOLS = TOOLS;

// Re-export functions from tools.js and files.js for backward compatibility
export { runTool } from "./tools.js";
export {
  readStream,
  readFile,
  toCsv,
  downloadText,
  downloadJson,
  downloadCsv,
  downloadBlob,
} from "./files.js";

/**
 * Truncates a string to a maximum length and appends a suffix
 * @param {string} str - The string to truncate
 * @param {number} maxLength - The maximum length of the string
 * @param {string} suffix - The suffix to append
 * @returns {string} - The truncated string
 */
export function truncate(str, maxLength = 10_000, suffix = "\n ... (truncated)") {
  return str.length > maxLength ? str.slice(0, maxLength) + suffix : str;
}

/**
 * Capitalizes the first letter of each word in a string while converting the rest to lowercase.
 * Words are separated by spaces.
 *
 * @param {String} str - The string to capitalize
 * @returns {String} The string with each word capitalized
 * @example
 * capitalize("hello world") // returns "Hello World"
 * capitalize("SUPER USER") // returns "Super User"
 */
export function capitalize(str) {
  if (!str) {
    console.error("Capitalize function received undefined string");
    return "";
  }
  return str
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Retries a function with exponential backoff
 * @param {number} maxAttempts - Maximum number of retry attempts
 * @param {number} initialDelay - Initial delay in milliseconds
 * @param {Function} fn - Async function to retry
 * @returns {Promise<any>} - Result of the function execution
 * @throws {Error} - Throws the last error encountered after all retries are exhausted
 */
export async function retry(maxAttempts, initialDelay, fn) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.error(`Attempt ${attempt} failed:`, error);

      if (attempt === maxAttempts) {
        break;
      }

      // Calculate delay with exponential backoff: initialDelay * 2^(attempt-1)
      const delay = initialDelay * Math.pow(2, attempt - 1);

      // Add some jitter to prevent thundering herd problem
      const jitter = Math.random() * 100;

      await new Promise((resolve) => setTimeout(resolve, delay + jitter));
    }
  }

  throw new Error(`Failed after ${maxAttempts} attempts. Last error: ${lastError.message}`);
}

/**
 * Automatically scrolls to bottom when user has scrolled past the specified threshold.
 * @param {number} thresholdPercent - Value between 0-1 representing how close to bottom (0.9 = 90%)
 * @param {Element|string|null} container - DOM element, CSS selector, or null for window scrolling
 * @returns {boolean} - Whether the scroll was performed
 * @example
 * // Window scrolling (default)
 * setInterval(() => autoscroll(0.8), 1000);
 *
 * // Container element scrolling
 * autoscroll(0.9, document.getElementById('chat-box'));
 *
 * // CSS selector scrolling
 * autoscroll(0.9, '#message-container');
 */
export function autoscroll(thresholdPercent = 0.8, container = null) {
  if (typeof container === "string") {
    container = document.querySelector(container);
  }
  const isWindowScroll = !(container instanceof Element);
  const scrollTop = isWindowScroll ? window.scrollY : container.scrollTop;
  const clientHeight = isWindowScroll ? window.innerHeight : container.clientHeight;
  const scrollHeight = isWindowScroll ? document.body.scrollHeight : container.scrollHeight;
  const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;
  if (scrollPercentage >= thresholdPercent) {
    if (isWindowScroll) {
      window.scrollTo(0, scrollHeight);
    } else {
      container.scrollTop = scrollHeight;
    }
    return true;
  }

  return false;
}

/**
 * Returns a configured marked instance with custom renderer
 * @returns {object} - Configured marked instance
 */
export function getMarked() {
  const renderer = new marked.Renderer();
  renderer.link = function (href, title, text) {
    const defaultLink = marked.Renderer.prototype.link.call(this, href, title, text);
    return defaultLink.replace(
      "<a",
      '<a target="_blank" rel="noopener noreferrer" aria-hidden="true" '
    );
  };
  marked.use({ renderer });
  return marked;
}

/**
 * Converts options object to reactive accessor options for SolidJS
 * @param {object|function} options - Options object or accessor function
 * @returns {object} - Object with reactive accessors for each property
 */
export function convertToAccessorOptions(options) {
  // Resolve the options object if it's passed as an accessor
  const resolvedOptions = typeof options === "function" ? options() : options;

  // Create a new object where each property is wrapped in createMemo
  return Object.entries(resolvedOptions).reduce(
    (reactiveOptions, [key, _value]) => {
      // Use createMemo to make each property access reactive
      reactiveOptions[key] = createMemo(() => {
        // If the original options object was itself reactive,
        // accessing it here ensures dependencies are tracked.
        const currentOptions = typeof options === "function" ? options() : options;
        return currentOptions[key]; // Return the current value for this key
      });
      return reactiveOptions;
    },
    {} // Start with an empty object
  );
}

/**
 * Opens a new chat window and copies sessionStorage items to it
 * @param {Event} e - The click event that triggered the new chat
 * @param {string} e.target.href - The URL to open in the new window
 * @returns {void}
 */
export function openInternalLinkInNewTab(e) {
  e.preventDefault();
  const newWindow = window.open(e.target.href, "_blank"); // takes url from href of anchor tag

  newWindow.addEventListener("load", function () {
    // Copy all sessionStorage items
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      const value = sessionStorage.getItem(key);
      newWindow.sessionStorage.setItem(key, value);
    }
  });
}

/**
 * Sets a cookie with the given name, value, expiration time in seconds, and path.
 * @param {string} name
 * @param {string} value
 * @param {number} seconds
 * @param {string} path
 */
export function setCookie(name, value, seconds = 60 * 60 * 24, path = "/") {
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${seconds}; path=${path}`;
}

/**
 * Retrieves the value of a cookie by name.
 * @param {string} name
 * @returns {string|null} The cookie value or null if not found
 */
export function getCookie(name) {
  return (
    document.cookie
      .split("; ")
      .find((row) => row.startsWith(name + "="))
      ?.split("=")[1] || null
  );
}

/**
 * Converts seconds to a formatted string in mm:ss format
 *
 * @param {number} seconds - The number of seconds to convert
 * @returns {string} Formatted time string in mm:ss format
 */
export function secondsToMinuteString(seconds) {
  if (seconds < 0 || !Number.isFinite(seconds)) {
    return "00:00";
  }

  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  const formattedMinutes = minutes.toString().padStart(2, "0");
  const formattedSeconds = remainingSeconds.toString().padStart(2, "0");

  return `${formattedMinutes}:${formattedSeconds}`;
}
