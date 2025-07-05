// Simple Table component test
import { DataTable } from "../../components/table.js";

describe('DataTable Component', () => {
  const sampleColumns = [
    { key: 'name', title: 'Name' },
    { key: 'age', title: 'Age' }
  ];

  const sampleData = [
    { name: 'John', age: 30 },
    { name: 'Jane', age: 25 }
  ];

  test('renders without errors with empty data', () => {
    const result = DataTable({ columns: sampleColumns, data: [] });
    expect(result).toBeTruthy();
    expect(result.querySelector('table')).toBeTruthy();
  });

  test('renders with sample data', () => {
    const result = DataTable({ columns: sampleColumns, data: sampleData });
    expect(result).toBeTruthy();
    expect(result.textContent).toContain('John');
    expect(result.textContent).toContain('Jane');
  });

  test('shows loading state', () => {
    const result = DataTable({ 
      columns: sampleColumns, 
      data: [], 
      loading: true,
      loadingText: 'Loading data...'
    });
    expect(result.textContent).toContain('Loading data...');
  });

  test('shows pagination controls', () => {
    const result = DataTable({ columns: sampleColumns, data: sampleData });
    expect(result.textContent).toContain('Page');
    expect(result.textContent).toContain('Previous');
    expect(result.textContent).toContain('Next');
  });

  test('handles remote mode', () => {
    const result = DataTable({ 
      columns: sampleColumns, 
      data: sampleData,
      remote: true,
      page: 1,
      totalItems: 100
    });
    expect(result).toBeTruthy();
    expect(result.textContent).toContain('Page 1 of 5'); // 100 items / 20 per page
  });
});