// Consent Crafter Basic Test
import ConsentCrafter, { defaultPromptTemplates } from "../../../../pages/tools/consent-crafter/index.js";

describe('Consent Crafter', () => {
  test('renders without errors', () => {
    const result = ConsentCrafter();
    expect(result).toBeTruthy();
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