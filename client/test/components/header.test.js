// Simple Header component test
import Header from "../../components/header.js";

describe('Header Component', () => {
  test('renders without errors', () => {
    const result = Header();
    expect(result).toBeTruthy();
    expect(result.tagName).toBe('HEADER');
  });
});