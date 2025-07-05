// Simple tests for tools utilities
import { 
  runTool,
  editor,
  getClientContext
} from "../../utils/tools.js";

describe('Tool Runner', () => {
  test('runTool handles successful tool execution', async () => {
    const mockTools = {
      testTool: () => Promise.resolve('success')
    };
    
    const toolUse = {
      toolUseId: 'test123',
      name: 'testTool',
      input: { test: 'data' }
    };

    const result = await runTool(toolUse, mockTools);
    
    expect(result.toolUseId).toBe('test123');
    expect(result.content[0].json.results).toBe('success');
  });

  test('runTool handles tool errors', async () => {
    const mockTools = {
      errorTool: () => Promise.reject(new Error('Tool failed'))
    };
    
    const toolUse = {
      toolUseId: 'error123',
      name: 'errorTool',
      input: {}
    };

    const result = await runTool(toolUse, mockTools);
    
    expect(result.toolUseId).toBe('error123');
    expect(result.content[0].text).toContain('Error running errorTool');
    expect(result.content[0].text).toContain('Tool failed');
  });

  test('runTool handles missing tool', async () => {
    const toolUse = {
      toolUseId: 'missing123',
      name: 'nonExistentTool',
      input: {}
    };

    const result = await runTool(toolUse, {});
    
    expect(result.toolUseId).toBe('missing123');
    expect(result.content).toBeTruthy();
    expect(result.content[0]).toBeTruthy();
    // Missing tool returns undefined results, not an error
    expect(result.content[0].json).toBeTruthy();
    expect(result.content[0].json.results).toBeUndefined();
  });
});

describe('Editor Tool', () => {
  test('editor create command works', () => {
    const mockStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    };

    const result = editor({
      command: 'create',
      path: 'test.txt',
      file_text: 'Hello world'
    }, mockStorage);

    expect(result).toContain('Successfully created file: test.txt');
  });

  test('editor view command works', () => {
    const mockStorage = {
      getItem: () => 'Line 1\nLine 2\nLine 3',
      setItem: () => {},
      removeItem: () => {}
    };
    
    const result = editor({
      command: 'view',
      path: 'test.txt'
    }, mockStorage);

    expect(result).toContain('1: Line 1');
    expect(result).toContain('2: Line 2');
    expect(result).toContain('3: Line 3');
  });

  test('editor view returns error for missing file', () => {
    const mockStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    };
    
    const result = editor({
      command: 'view',
      path: 'missing.txt'
    }, mockStorage);

    expect(result).toBe('File not found: missing.txt');
  });

  test('editor requires path parameter', () => {
    const result = editor({
      command: 'create'
    });

    expect(result).toBe('Error: File path is required');
  });

  test('editor requires command parameter', () => {
    const result = editor({
      path: 'test.txt'
    });

    expect(result).toBe('Error: Command is required');
  });
});

describe('Client Context', () => {
  test('getClientContext returns object with expected properties', () => {
    const context = getClientContext();
    
    expect(context).toHaveProperty('time');
    expect(context).toHaveProperty('language');
    expect(context).toHaveProperty('platform');
    expect(context).toHaveProperty('memory');
    expect(context).toHaveProperty('hardwareConcurrency');
    expect(context).toHaveProperty('main');
    
    expect(typeof context.time).toBe('string');
    expect(typeof context.main).toBe('string');
  });

  test('getClientContext accepts important parameter', () => {
    const important = { test: 'data' };
    const context = getClientContext(important);
    
    expect(context.main).toContain('important');
  });
});