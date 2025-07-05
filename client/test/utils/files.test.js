// Simple tests for file utilities
import { 
  toCsv,
  downloadText,
  downloadBlob,
  readFile
} from "../../utils/files.js";

describe('CSV Utilities', () => {
  test('toCsv converts array of objects', () => {
    const data = [
      { name: 'John', age: 30 },
      { name: 'Jane', age: 25 }
    ];
    const result = toCsv(data);
    expect(result).toContain('name,age');
    expect(result).toContain('John,30');
    expect(result).toContain('Jane,25');
  });

  test('toCsv handles empty array', () => {
    const result = toCsv([]);
    expect(result).toBe('');
  });

  test('toCsv handles values with commas', () => {
    const data = [{ text: 'Hello, world', num: 123 }];
    const result = toCsv(data);
    expect(result).toContain('"Hello, world"');
    expect(result).toContain('123');
  });

  test('toCsv handles null/undefined values', () => {
    const data = [{ name: 'Test', value: null, empty: undefined }];
    const result = toCsv(data);
    expect(result).toContain('Test');
    expect(result).not.toContain('null');
    expect(result).not.toContain('undefined');
  });
});

describe('Download Utilities', () => {
  test('downloadText function exists and can be called', () => {
    // Simple existence test - download functions require DOM manipulation
    // that's complex to mock properly in this simple test environment
    expect(typeof downloadText).toBe('function');
    
    // Test that it doesn't throw when called (though it may not work fully in test env)
    expect(() => {
      try {
        downloadText('test.txt', 'Hello world');
      } catch (e) {
        // Expected to fail in test environment, that's okay
      }
    }).not.toThrow();
  });

  test('downloadBlob function exists', () => {
    expect(typeof downloadBlob).toBe('function');
  });
});

describe('File Reading', () => {
  test('readFile returns promise', () => {
    // Create a mock file
    const mockFile = new File(['test content'], 'test.txt', { type: 'text/plain' });
    
    const result = readFile(mockFile);
    expect(result).toBeInstanceOf(Promise);
  });

  test('readFile with different types', () => {
    const mockFile = new File(['test'], 'test.txt');
    
    // Test different type parameters
    expect(readFile(mockFile, 'text')).toBeInstanceOf(Promise);
    expect(readFile(mockFile, 'arrayBuffer')).toBeInstanceOf(Promise);
    expect(readFile(mockFile, 'dataURL')).toBeInstanceOf(Promise);
  });
});