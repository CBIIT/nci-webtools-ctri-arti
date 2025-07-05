// Tests for conversation models
import { BaseModel, Project, Conversation, Message, Resource } from "../../models/models.js";

describe('BaseModel', () => {
  test('creates model with auto-generated ID and timestamps', () => {
    const model = new BaseModel();
    
    expect(model.id).toBeTruthy();
    expect(model.created).toBeTruthy();
    expect(model.updated).toBeTruthy();
    expect(typeof model.id).toBe('string');
    expect(new Date(model.created)).toBeInstanceOf(Date);
    expect(new Date(model.updated)).toBeInstanceOf(Date);
  });

  test('accepts custom data in constructor', () => {
    const customData = {
      id: 'custom-id',
      created: '2023-01-01T00:00:00.000Z',
      customField: 'test'
    };
    
    const model = new BaseModel(customData);
    
    expect(model.id).toBe('custom-id');
    expect(model.created).toBe('2023-01-01T00:00:00.000Z');
    expect(model.customField).toBe('test');
  });

  test('update method modifies data and timestamp', () => {
    const model = new BaseModel();
    const originalUpdated = model.updated;
    
    // Wait a tiny bit to ensure timestamp changes
    setTimeout(() => {
      model.update({ newField: 'value' });
      
      expect(model.newField).toBe('value');
      expect(model.updated).not.toBe(originalUpdated);
    }, 1);
  });

  test('toJSON returns all properties', () => {
    const model = new BaseModel({ testProp: 'test' });
    const json = model.toJSON();
    
    expect(json).toHaveProperty('id');
    expect(json).toHaveProperty('created');
    expect(json).toHaveProperty('updated');
    expect(json).toHaveProperty('testProp', 'test');
  });

  test('fromJSON creates instance from data', () => {
    const data = {
      id: 'test-id',
      created: '2023-01-01T00:00:00.000Z',
      testProp: 'test'
    };
    
    const model = BaseModel.fromJSON(data);
    
    expect(model).toBeInstanceOf(BaseModel);
    expect(model.id).toBe('test-id');
    expect(model.testProp).toBe('test');
  });
});

describe('Project', () => {
  test('creates project with default values', () => {
    const project = new Project();
    
    expect(project.name).toBe('Untitled Project');
    expect(project.description).toBe('');
    expect(project.isDefault).toBe(false);
    expect(project.context).toHaveProperty('systemPrompt', '');
    expect(project.context).toHaveProperty('files', []);
    expect(project.context).toHaveProperty('customText', '');
    expect(project.apiConfig).toHaveProperty('baseUrl', '/api/model');
    expect(project.mcpConfig).toHaveProperty('enabled', false);
    expect(project.settings).toHaveProperty('model');
  });

  test('accepts custom project data', () => {
    const projectData = {
      name: 'Test Project',
      description: 'A test project',
      isDefault: true,
      context: {
        systemPrompt: 'Custom prompt',
        files: ['file1'],
        customText: 'Custom text'
      }
    };
    
    const project = new Project(projectData);
    
    expect(project.name).toBe('Test Project');
    expect(project.description).toBe('A test project');
    expect(project.isDefault).toBe(true);
    expect(project.context.systemPrompt).toBe('Custom prompt');
    expect(project.context.files).toEqual(['file1']);
  });

  test('has flexible API configuration', () => {
    const project = new Project({
      apiConfig: {
        baseUrl: 'https://api.example.com',
        headers: { 'Authorization': 'Bearer token' },
        variables: { model: 'gpt-4' }
      }
    });
    
    expect(project.apiConfig.baseUrl).toBe('https://api.example.com');
    expect(project.apiConfig.headers).toHaveProperty('Authorization');
    expect(project.apiConfig.variables).toHaveProperty('model', 'gpt-4');
  });

  test('has MCP server configuration', () => {
    const project = new Project({
      mcpConfig: {
        enabled: true,
        endpoint: 'ws://localhost:8080',
        tools: ['search', 'calc']
      }
    });
    
    expect(project.mcpConfig.enabled).toBe(true);
    expect(project.mcpConfig.endpoint).toBe('ws://localhost:8080');
    expect(project.mcpConfig.tools).toEqual(['search', 'calc']);
  });
});

describe('Conversation', () => {
  test('creates conversation with defaults', () => {
    const conv = new Conversation();
    
    expect(conv.projectId).toBe('default');
    expect(conv.title).toBe('New Conversation');
    expect(conv.summary).toBe('');
    expect(conv.messageCount).toBe(0);
    expect(conv.tags).toEqual([]);
    expect(conv.archived).toBe(false);
    expect(conv.starred).toBe(false);
    expect(conv.lastMessageAt).toBe(conv.created);
  });

  test('accepts custom conversation data', () => {
    const convData = {
      projectId: 'proj-123',
      title: 'Test Chat',
      summary: 'A test conversation',
      tags: ['important', 'work'],
      starred: true
    };
    
    const conv = new Conversation(convData);
    
    expect(conv.projectId).toBe('proj-123');
    expect(conv.title).toBe('Test Chat');
    expect(conv.summary).toBe('A test conversation');
    expect(conv.tags).toEqual(['important', 'work']);
    expect(conv.starred).toBe(true);
  });

  test('addMessage increments count and updates timestamp', async () => {
    const conv = new Conversation();
    const originalCount = conv.messageCount;
    const originalTime = conv.lastMessageAt;
    
    // Wait to ensure timestamp changes (millisecond precision)
    await new Promise(resolve => setTimeout(resolve, 2));
    
    conv.addMessage();
    
    expect(conv.messageCount).toBe(originalCount + 1);
    expect(conv.lastMessageAt).not.toBe(originalTime);
    expect(conv.updated).toBe(conv.lastMessageAt);
    expect(new Date(conv.lastMessageAt).getTime()).toBeGreaterThan(new Date(originalTime).getTime());
  });
});

describe('Message', () => {
  test('creates message with required fields', () => {
    const messageData = {
      conversationId: 'conv-123',
      role: 'user',
      content: 'Hello world'
    };
    
    const message = new Message(messageData);
    
    expect(message.conversationId).toBe('conv-123');
    expect(message.role).toBe('user');
    expect(message.content).toBe('Hello world');
    expect(message.timestamp).toBeTruthy();
    expect(message.isStreaming).toBe(false);
    expect(message.isComplete).toBe(true);
    expect(message.metadata).toHaveProperty('model', null);
    expect(message.metadata).toHaveProperty('usage', null);
    expect(message.toolResults).toEqual([]);
  });

  test('supports assistant messages with tool use', () => {
    const messageData = {
      conversationId: 'conv-123',
      role: 'assistant',
      content: 'I\'ll search for that.',
      metadata: {
        model: 'claude-3',
        usage: { inputTokens: 10, outputTokens: 20 },
        toolUses: [{ name: 'search', input: { query: 'test' } }]
      },
      toolResults: [{ toolUseId: '1', content: [{ text: 'Results' }] }]
    };
    
    const message = new Message(messageData);
    
    expect(message.role).toBe('assistant');
    expect(message.metadata.model).toBe('claude-3');
    expect(message.metadata.toolUses).toHaveLength(1);
    expect(message.toolResults).toHaveLength(1);
    expect(message.toolResults[0].toolUseId).toBe('1');
  });

  test('supports streaming state', () => {
    const message = new Message({
      conversationId: 'conv-123',
      role: 'assistant',
      content: 'Partial response...',
      isStreaming: true,
      isComplete: false
    });
    
    expect(message.isStreaming).toBe(true);
    expect(message.isComplete).toBe(false);
  });
});

describe('Resource', () => {
  test('creates resource with required fields', () => {
    const resourceData = {
      projectId: 'proj-123',
      name: 'test.txt',
      type: 'file',
      content: 'File content'
    };
    
    const resource = new Resource(resourceData);
    
    expect(resource.projectId).toBe('proj-123');
    expect(resource.name).toBe('test.txt');
    expect(resource.type).toBe('file');
    expect(resource.content).toBe('File content');
    expect(resource.mimeType).toBe('');
    expect(resource.size).toBe(0);
    expect(resource.tags).toEqual([]);
    expect(resource.folder).toBe('');
  });

  test('supports different resource types', () => {
    const fileResource = new Resource({
      projectId: 'proj-123',
      name: 'document.pdf',
      type: 'file',
      mimeType: 'application/pdf',
      size: 1024,
      metadata: {
        originalName: 'My Document.pdf',
        extractedText: 'PDF content here'
      }
    });
    
    expect(fileResource.type).toBe('file');
    expect(fileResource.mimeType).toBe('application/pdf');
    expect(fileResource.size).toBe(1024);
    expect(fileResource.metadata.extractedText).toBe('PDF content here');
  });

  test('hasTextContent checks for available text', () => {
    const textResource = new Resource({
      projectId: 'proj-123',
      name: 'note.txt',
      type: 'text',
      content: 'Text content'
    });
    
    const pdfResource = new Resource({
      projectId: 'proj-123',
      name: 'doc.pdf',
      type: 'file',
      metadata: { extractedText: 'Extracted text' }
    });
    
    const emptyResource = new Resource({
      projectId: 'proj-123',
      name: 'empty.txt',
      type: 'file'
    });
    
    expect(textResource.hasTextContent()).toBe(true);
    expect(pdfResource.hasTextContent()).toBe(true);
    expect(emptyResource.hasTextContent()).toBe(false);
  });

  test('getSearchableText combines all text fields', () => {
    const resource = new Resource({
      projectId: 'proj-123',
      name: 'test document',
      type: 'file',
      content: 'main content',
      metadata: {
        extractedText: 'extracted text',
        summary: 'document summary'
      },
      tags: ['important', 'work']
    });
    
    const searchText = resource.getSearchableText();
    
    expect(searchText).toContain('test document');
    expect(searchText).toContain('main content');
    expect(searchText).toContain('extracted text');
    expect(searchText).toContain('document summary');
    expect(searchText).toContain('important work');
  });

  test('handles organization fields', () => {
    const resource = new Resource({
      projectId: 'proj-123',
      name: 'work-file.doc',
      type: 'file',
      tags: ['work', 'draft'],
      folder: 'documents/work'
    });
    
    expect(resource.tags).toEqual(['work', 'draft']);
    expect(resource.folder).toBe('documents/work');
  });
});