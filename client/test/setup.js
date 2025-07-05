// Test setup - mock browser APIs not available in JSDOM

// Mock DOMMatrix for PDF.js
global.DOMMatrix = class DOMMatrix {
  constructor() {
    this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
  }
};

// Mock fetch for components that use it
global.fetch = () =>
  Promise.resolve({
    ok: true,
    text: () => Promise.resolve(''),
    json: () => Promise.resolve({})
  });

// Mock window.open for components that use it
global.open = () => {};

// Clean up after each test
afterEach(() => {
  document.body.innerHTML = '';
});