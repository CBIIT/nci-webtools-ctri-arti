import html from "solid-js/html";

import { render } from "@solidjs/testing-library";
import { describe, it, expect } from "vitest";
import { axe } from "vitest-axe";

import Alert from "./alert.js";

describe("Accessibility", () => {
  it("should have no accessibility violations", async () => {
    const { container } = render(() => html`<${Alert} type="success" message="Test passed!" />`);

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe("Basic Functionality", () => {
  it("should render without crashing", () => {
    expect(() =>
      render(() => html`<${Alert} type="success" message="Test passed!" />`)
    ).not.toThrow();
  });
});
