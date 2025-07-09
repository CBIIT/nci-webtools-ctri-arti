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
    expect(conv.activeAlternatives).toEqual({});
  });

  test('accepts custom conversation data', () => {
    const convData = {
      projectId: 'proj-123',
      title: 'Test Chat',
      summary: 'A test conversation',
      tags: ['important', 'work'],
      starred: true,
      activeAlternatives: { 'msg-1': 1, 'msg-2': 0 }
    };
    
    const conv = new Conversation(convData);
    
    expect(conv.projectId).toBe('proj-123');
    expect(conv.title).toBe('Test Chat');
    expect(conv.summary).toBe('A test conversation');
    expect(conv.tags).toEqual(['important', 'work']);
    expect(conv.starred).toBe(true);
    expect(conv.activeAlternatives).toEqual({ 'msg-1': 1, 'msg-2': 0 });
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
    expect(message.baseMessageId).toBeNull();
    expect(message.alternativeIndex).toBe(0);
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

describe('Message Branching', () => {
  test('creates base message with default branching fields', () => {
    const message = new Message({
      conversationId: 'conv-123',
      role: 'user',
      content: [{ text: 'Original message' }]
    });

    expect(message.baseMessageId).toBeNull();
    expect(message.alternativeIndex).toBe(0);
  });

  test('creates alternative message with correct branching fields', () => {
    const baseMessage = new Message({
      conversationId: 'conv-123',
      role: 'user',
      content: [{ text: 'Original message' }]
    });

    const alternative = new Message({
      conversationId: 'conv-123',
      role: 'user',
      content: [{ text: 'Edited message' }],
      baseMessageId: baseMessage.id,
      alternativeIndex: 1
    });

    expect(alternative.baseMessageId).toBe(baseMessage.id);
    expect(alternative.alternativeIndex).toBe(1);
    expect(alternative.conversationId).toBe(baseMessage.conversationId);
    expect(alternative.role).toBe(baseMessage.role);
  });

  test('supports multiple alternatives with incremental indices', () => {
    const baseMessageId = 'base-msg-123';
    
    const alt1 = new Message({
      conversationId: 'conv-123',
      role: 'user',
      content: [{ text: 'First alternative' }],
      baseMessageId: baseMessageId,
      alternativeIndex: 1
    });

    const alt2 = new Message({
      conversationId: 'conv-123',
      role: 'user',
      content: [{ text: 'Second alternative' }],
      baseMessageId: baseMessageId,
      alternativeIndex: 2
    });

    const alt3 = new Message({
      conversationId: 'conv-123',
      role: 'user',
      content: [{ text: 'Third alternative' }],
      baseMessageId: baseMessageId,
      alternativeIndex: 3
    });

    expect(alt1.alternativeIndex).toBe(1);
    expect(alt2.alternativeIndex).toBe(2);
    expect(alt3.alternativeIndex).toBe(3);
    expect(alt1.baseMessageId).toBe(baseMessageId);
    expect(alt2.baseMessageId).toBe(baseMessageId);
    expect(alt3.baseMessageId).toBe(baseMessageId);
  });

  test('preserves all message properties in alternatives', () => {
    const originalMessage = new Message({
      conversationId: 'conv-123',
      role: 'assistant',
      content: [
        { text: 'Original response' },
        { toolUse: { toolUseId: 'tool-1', name: 'search', input: { query: 'test' } } }
      ],
      metadata: {
        model: 'claude-3',
        usage: { inputTokens: 10, outputTokens: 20 }
      },
      toolResults: [{ toolUseId: 'tool-1', content: [{ text: 'Results' }] }]
    });

    const alternative = new Message({
      conversationId: originalMessage.conversationId,
      role: originalMessage.role,
      content: [{ text: 'Alternative response' }],
      baseMessageId: originalMessage.id,
      alternativeIndex: 1,
      metadata: {
        model: 'claude-3',
        usage: { inputTokens: 15, outputTokens: 25 }
      }
    });

    expect(alternative.conversationId).toBe(originalMessage.conversationId);
    expect(alternative.role).toBe(originalMessage.role);
    expect(alternative.baseMessageId).toBe(originalMessage.id);
    expect(alternative.alternativeIndex).toBe(1);
    expect(alternative.metadata.model).toBe('claude-3');
    expect(alternative.metadata.usage.inputTokens).toBe(15);
  });
});

describe('Conversation Branching', () => {
  test('tracks active alternatives for multiple messages', () => {
    const conversation = new Conversation({
      title: 'Branching Test',
      activeAlternatives: {
        'msg-1': 0,  // Original
        'msg-2': 1,  // First alternative
        'msg-3': 2   // Second alternative
      }
    });

    expect(conversation.activeAlternatives['msg-1']).toBe(0);
    expect(conversation.activeAlternatives['msg-2']).toBe(1);
    expect(conversation.activeAlternatives['msg-3']).toBe(2);
  });

  test('updates activeAlternatives via update method', () => {
    const conversation = new Conversation({
      title: 'Update Test',
      activeAlternatives: { 'msg-1': 0 }
    });

    conversation.update({
      activeAlternatives: {
        'msg-1': 1,
        'msg-2': 0
      }
    });

    expect(conversation.activeAlternatives['msg-1']).toBe(1);
    expect(conversation.activeAlternatives['msg-2']).toBe(0);
  });

  test('serializes and deserializes activeAlternatives correctly', () => {
    const originalData = {
      title: 'Serialization Test',
      activeAlternatives: {
        'msg-abc': 2,
        'msg-def': 0,
        'msg-ghi': 1
      }
    };

    const conversation = new Conversation(originalData);
    const serialized = conversation.toJSON();
    const deserialized = Conversation.fromJSON(serialized);

    expect(deserialized.activeAlternatives).toEqual(originalData.activeAlternatives);
    expect(deserialized.title).toBe(originalData.title);
  });
});

describe('Database Branching Integration', () => {
  test('basic branching workflow simulation', async () => {
    // This test simulates the branching workflow without actually using IndexedDB
    // It tests the data structure and logic flow

    // Simulate base message
    const baseMessage = new Message({
      conversationId: 'conv-123',
      role: 'user',
      content: [{ text: 'Original message' }]
    });

    // Simulate creating alternatives
    const alt1 = new Message({
      conversationId: 'conv-123',
      role: 'user',
      content: [{ text: 'First alternative' }],
      baseMessageId: baseMessage.id,
      alternativeIndex: 1
    });

    const alt2 = new Message({
      conversationId: 'conv-123',
      role: 'user',
      content: [{ text: 'Second alternative' }],
      baseMessageId: baseMessage.id,
      alternativeIndex: 2
    });

    // Simulate conversation with active alternatives
    const conversation = new Conversation({
      title: 'Branching Test',
      activeAlternatives: {
        [baseMessage.id]: 1  // Active first alternative
      }
    });

    // Verify structure
    expect(baseMessage.baseMessageId).toBeNull();
    expect(baseMessage.alternativeIndex).toBe(0);
    expect(alt1.baseMessageId).toBe(baseMessage.id);
    expect(alt1.alternativeIndex).toBe(1);
    expect(alt2.baseMessageId).toBe(baseMessage.id);
    expect(alt2.alternativeIndex).toBe(2);
    expect(conversation.activeAlternatives[baseMessage.id]).toBe(1);
  });

  test('message grouping and selection logic', () => {
    // Simulate the core logic for selecting active alternatives
    const baseMessageId = 'msg-123';
    
    // Create message set
    const allMessages = [
      { id: baseMessageId, baseMessageId: null, alternativeIndex: 0, content: [{ text: 'Original' }] },
      { id: 'alt-1', baseMessageId: baseMessageId, alternativeIndex: 1, content: [{ text: 'Alt 1' }] },
      { id: 'alt-2', baseMessageId: baseMessageId, alternativeIndex: 2, content: [{ text: 'Alt 2' }] }
    ];

    // Group by base message (simulate database logic)
    const baseMessages = allMessages.filter(m => !m.baseMessageId);
    const messageGroups = {};
    
    for (const base of baseMessages) {
      messageGroups[base.id] = allMessages
        .filter(m => m.baseMessageId === base.id || m.id === base.id)
        .sort((a, b) => a.alternativeIndex - b.alternativeIndex);
    }

    // Test selection with different active alternatives
    const testCases = [
      { activeIndex: 0, expectedText: 'Original' },
      { activeIndex: 1, expectedText: 'Alt 1' },
      { activeIndex: 2, expectedText: 'Alt 2' }
    ];

    testCases.forEach(({ activeIndex, expectedText }) => {
      const activeAlternatives = { [baseMessageId]: activeIndex };
      
      const selectedMessages = baseMessages.map(base => {
        const alternatives = messageGroups[base.id] || [base];
        const index = activeAlternatives[base.id] || 0;
        return alternatives[index] || base;
      });

      expect(selectedMessages).toHaveLength(1);
      expect(selectedMessages[0].content[0].text).toBe(expectedText);
    });
  });

  test('alternative navigation bounds checking', () => {
    // Test the logic for prev/next navigation
    const scenarios = [
      { currentIndex: 0, totalAlts: 3, canGoPrev: false, canGoNext: true },
      { currentIndex: 1, totalAlts: 3, canGoPrev: true, canGoNext: true },
      { currentIndex: 2, totalAlts: 3, canGoPrev: true, canGoNext: true },
      { currentIndex: 3, totalAlts: 3, canGoPrev: true, canGoNext: false },
      { currentIndex: 0, totalAlts: 0, canGoPrev: false, canGoNext: false }
    ];

    scenarios.forEach(({ currentIndex, totalAlts, canGoPrev, canGoNext }) => {
      // Simulate getAlternativeInfo logic
      const info = {
        currentIndex,
        totalCount: totalAlts + 1, // +1 for original
        canGoPrev: currentIndex > 0,
        canGoNext: currentIndex < totalAlts,
        hasAlternatives: totalAlts > 0
      };

      expect(info.canGoPrev).toBe(canGoPrev);
      expect(info.canGoNext).toBe(canGoNext);
    });
  });
});