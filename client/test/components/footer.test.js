// Simple Footer component test
import Footer from "../../components/footer.js";

describe('Footer Component', () => {
  test('renders without errors', () => {
    const result = Footer();
    expect(result).toBeTruthy();
    expect(result.tagName).toBe('FOOTER');
  });

  test('contains contact information', () => {
    const result = Footer();
    expect(result.textContent).toContain('Contact Research Optimizer');
    expect(result.textContent).toContain('1-800-4-CANCER');
  });

  test('contains government links', () => {
    const result = Footer();
    expect(result.textContent).toContain('National Cancer Institute');
    expect(result.textContent).toContain('National Institutes of Health');
  });
});