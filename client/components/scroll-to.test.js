import html from "solid-js/html";

import { render } from "@solidjs/testing-library";
import { describe, it, expect } from "vitest";
import { axe } from "vitest-axe";

import ScrollTo from "./scroll-to.js";

describe("Accessibility", () => {
  it("should have no accessibility violations", async () => {
    const { container } = render(() => html`<${ScrollTo} />`);

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("should have no accessibility violations with a custom label", async () => {
    const { container } = render(() => html`<${ScrollTo} label="Go to end" />`);

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe("Basic Functionality", () => {
  it("should render without crashing", () => {
    expect(() => render(() => html`<${ScrollTo} />`)).not.toThrow();
  });
});
