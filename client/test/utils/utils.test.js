// Simple tests for general utilities
import { 
  truncate, 
  capitalize, 
  setCookie,
  getCookie,
  autoscroll,
  getMarked
} from "../../utils/utils.js";

describe('Text Utilities', () => {
  test('truncate works with default params', () => {
    const longText = 'a'.repeat(15000);
    const result = truncate(longText);
    expect(result.length).toBeLessThan(longText.length);
    expect(result).toContain('... (truncated)');
  });

  test('truncate with custom length and suffix', () => {
    const text = 'Hello world this is a test';
    const result = truncate(text, 10, '...');
    expect(result).toBe('Hello worl...');
  });

  test('truncate returns original if under limit', () => {
    const text = 'Short text';
    const result = truncate(text, 100);
    expect(result).toBe(text);
  });

  test('capitalize works correctly', () => {
    expect(capitalize('hello world')).toBe('Hello World');
    expect(capitalize('SUPER USER')).toBe('Super User');
    expect(capitalize('mixED cAsE')).toBe('Mixed Case');
    expect(capitalize('single')).toBe('Single');
  });

  test('capitalize handles empty/undefined', () => {
    expect(capitalize('')).toBe('');
    expect(capitalize(undefined)).toBe('');
  });
});

describe('Cookie Utilities', () => {
  beforeEach(() => {
    // Clear cookies before each test
    document.cookie.split(";").forEach(cookie => {
      const eqPos = cookie.indexOf("=");
      const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
      document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
    });
  });

  test('setCookie and getCookie work together', () => {
    setCookie('testKey', 'testValue');
    expect(getCookie('testKey')).toBe('testValue');
  });

  test('getCookie returns null for non-existent cookie', () => {
    expect(getCookie('nonExistentKey')).toBeNull();
  });

  test('setCookie with custom expiration', () => {
    setCookie('shortLived', 'value', 1); // 1 second
    expect(getCookie('shortLived')).toBe('value');
  });
});

describe('Autoscroll Utility', () => {
  test('autoscroll function exists', () => {
    // Simple existence test - autoscroll requires window.scrollTo which isn't fully supported in JSDOM
    expect(typeof autoscroll).toBe('function');
  });
});

describe('Markdown Utility', () => {
  test('getMarked returns configured marked instance', () => {
    const marked = getMarked();
    expect(marked).toBeTruthy();
    expect(typeof marked.parse).toBe('function');
  });

  test('getMarked adds target="_blank" to links', () => {
    const marked = getMarked();
    const result = marked.parse('[Test Link](https://example.com)');
    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer"');
  });
});