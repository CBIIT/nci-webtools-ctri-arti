import html from "solid-js/html";
import { render } from "solid-js/web";
import ConsentCrafter from "/pages/tools/consent-crafter/index.js";

describe('Consent Crafter', () => {
  test('renders without errors', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    render(() => html`<${ConsentCrafter} />`, div);
    console.log('div', div);
    
    // const result = ConsentCrafter();
    // expect(result).toBeTruthy();
  });


  test('displays required UI elements', () => {
    const result = ConsentCrafter();
    
    // Should have file input
    expect(result.querySelector('input[type="file"]')).toBeTruthy();
    
    // Should have checkboxes for templates
    const checkboxes = result.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes.length).toBeGreaterThan(0);
    
    // Should have submit button
    expect(result.querySelector('button[type="submit"]')).toBeTruthy();
    
    // Should have reset button
    expect(result.querySelector('button[type="reset"]')).toBeTruthy();
  });
});