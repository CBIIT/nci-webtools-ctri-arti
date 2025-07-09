// Database tests for conversation branching functionality
import { ConversationDB } from "../../models/database.js";
import { TestEmbedder } from "../../models/embedders.js";
import { Message, Conversation } from "../../models/models.js";

describe('Database Branching Tests', () => {
  let db;
  let conversation;
  
  // Setup function for each test
  async function setupDatabase() {
    // Create a unique database for each test
    const testEmail = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}@example.com`;
    
    db = new ConversationDB(testEmail);
    await db.init(new TestEmbedder());
    
    // Create a test conversation
    conversation = await db.createConversation({
      title: 'Branching Test Conversation'
    });
  }

  // Cleanup function
  async function cleanupDatabase() {
    if (db) {
      await db.close();
    }
  }

  describe('Message Alternative Creation', () => {
    beforeEach(async () => {
      await setupDatabase();
    });

    afterEach(async () => {
      await cleanupDatabase();
    });

    test('creates message alternative with correct branching fields', async () => {
      // Create base message
      const baseMessage = await db.addMessage(conversation.id, {
        role: 'user',
        content: [{ text: 'Original message content' }]
      });

      // Create alternative
      const alternative = await db.createMessageAlternative(
        baseMessage.id,
        [{ text: 'Alternative message content' }]
      );

      expect(alternative.baseMessageId).toBe(baseMessage.id);
      expect(alternative.alternativeIndex).toBe(1);
      expect(alternative.conversationId).toBe(conversation.id);
      expect(alternative.role).toBe(baseMessage.role);
      expect(alternative.content[0].text).toBe('Alternative message content');
    });

    test('creates multiple alternatives with incremental indices', async () => {
      const baseMessage = await db.addMessage(conversation.id, {
        role: 'user',
        content: [{ text: 'Original message' }]
      });

      const alt1 = await db.createMessageAlternative(baseMessage.id, [{ text: 'First alternative' }]);
      const alt2 = await db.createMessageAlternative(baseMessage.id, [{ text: 'Second alternative' }]);
      const alt3 = await db.createMessageAlternative(baseMessage.id, [{ text: 'Third alternative' }]);

      expect(alt1.alternativeIndex).toBe(1);
      expect(alt2.alternativeIndex).toBe(2);
      expect(alt3.alternativeIndex).toBe(3);
      
      expect(alt1.baseMessageId).toBe(baseMessage.id);
      expect(alt2.baseMessageId).toBe(baseMessage.id);
      expect(alt3.baseMessageId).toBe(baseMessage.id);
    });

    test('throws error when base message does not exist', async () => {
      await expect(
        db.createMessageAlternative('nonexistent-id', [{ text: 'Alternative' }])
      ).rejects.toThrow('Message nonexistent-id not found');
    });

    test('preserves complex message content in alternatives', async () => {
      const baseMessage = await db.addMessage(conversation.id, {
        role: 'assistant',
        content: [
          { text: 'Here are the results:' },
          { 
            toolUse: { 
              toolUseId: 'tool-1',
              name: 'search',
              input: { query: 'test search' }
            }
          }
        ],
        metadata: {
          model: 'claude-3',
          usage: { inputTokens: 50, outputTokens: 100 }
        },
        toolResults: [
          {
            toolUseId: 'tool-1',
            content: [{ text: 'Search results here' }]
          }
        ]
      });

      const alternative = await db.createMessageAlternative(baseMessage.id, [
        { text: 'Alternative results:' },
        { 
          toolUse: { 
            toolUseId: 'tool-2',
            name: 'calculate',
            input: { expression: '2+2' }
          }
        }
      ]);

      expect(alternative.content).toHaveLength(2);
      expect(alternative.content[0].text).toBe('Alternative results:');
      expect(alternative.content[1].toolUse.name).toBe('calculate');
      expect(alternative.role).toBe('assistant');
      expect(alternative.conversationId).toBe(baseMessage.conversationId);
    });
  });

  describe('Alternative Retrieval', () => {
    beforeEach(async () => {
      await setupDatabase();
    });

    afterEach(async () => {
      await cleanupDatabase();
    });

    test('getMessageAlternatives returns alternatives in correct order', async () => {
      const baseMessage = await db.addMessage(conversation.id, {
        role: 'user',
        content: [{ text: 'Original' }]
      });

      const alt1 = await db.createMessageAlternative(baseMessage.id, [{ text: 'Alt 1' }]);
      const alt2 = await db.createMessageAlternative(baseMessage.id, [{ text: 'Alt 2' }]);
      const alt3 = await db.createMessageAlternative(baseMessage.id, [{ text: 'Alt 3' }]);

      const alternatives = await db.getMessageAlternatives(baseMessage.id);

      expect(alternatives).toHaveLength(3);
      expect(alternatives[0].id).toBe(alt1.id);
      expect(alternatives[1].id).toBe(alt2.id);
      expect(alternatives[2].id).toBe(alt3.id);
      expect(alternatives[0].alternativeIndex).toBe(1);
      expect(alternatives[1].alternativeIndex).toBe(2);
      expect(alternatives[2].alternativeIndex).toBe(3);
    });

    test('getMessageAlternatives returns empty array for base message with no alternatives', async () => {
      const baseMessage = await db.addMessage(conversation.id, {
        role: 'user',
        content: [{ text: 'Standalone message' }]
      });

      const alternatives = await db.getMessageAlternatives(baseMessage.id);
      expect(alternatives).toEqual([]);
    });
  });

  describe('Conversation Messages with Active Alternatives', () => {
    beforeEach(async () => {
      await setupDatabase();
    });

    afterEach(async () => {
      await cleanupDatabase();
    });

    test('getConversationMessages returns base messages when no alternatives are active', async () => {
      const msg1 = await db.addMessage(conversation.id, {
        role: 'user',
        content: [{ text: 'First message' }]
      });

      const msg2 = await db.addMessage(conversation.id, {
        role: 'assistant',
        content: [{ text: 'Second message' }]
      });

      // Create alternatives but don't activate them
      await db.createMessageAlternative(msg1.id, [{ text: 'First alternative' }]);
      await db.createMessageAlternative(msg2.id, [{ text: 'Second alternative' }]);

      const messages = await db.getConversationMessages(conversation.id);

      expect(messages).toHaveLength(2);
      expect(messages[0].id).toBe(msg1.id);
      expect(messages[0].content[0].text).toBe('First message');
      expect(messages[1].id).toBe(msg2.id);
      expect(messages[1].content[0].text).toBe('Second message');
    });

    test('getConversationMessages returns active alternatives', async () => {
      const msg1 = await db.addMessage(conversation.id, {
        role: 'user',
        content: [{ text: 'Original first' }]
      });

      const msg2 = await db.addMessage(conversation.id, {
        role: 'assistant',
        content: [{ text: 'Original second' }]
      });

      const alt1 = await db.createMessageAlternative(msg1.id, [{ text: 'Alternative first' }]);
      const alt2 = await db.createMessageAlternative(msg2.id, [{ text: 'Alternative second' }]);

      // Set active alternatives
      await db.setActiveAlternative(conversation.id, msg1.id, 1);
      await db.setActiveAlternative(conversation.id, msg2.id, 1);

      const messages = await db.getConversationMessages(conversation.id);

      expect(messages).toHaveLength(2);
      expect(messages[0].id).toBe(alt1.id);
      expect(messages[0].content[0].text).toBe('Alternative first');
      expect(messages[1].id).toBe(alt2.id);
      expect(messages[1].content[0].text).toBe('Alternative second');
    });

    test('getConversationMessages handles mixed active/inactive alternatives', async () => {
      const msg1 = await db.addMessage(conversation.id, {
        role: 'user',
        content: [{ text: 'First original' }]
      });

      const msg2 = await db.addMessage(conversation.id, {
        role: 'assistant',
        content: [{ text: 'Second original' }]
      });

      const msg3 = await db.addMessage(conversation.id, {
        role: 'user',
        content: [{ text: 'Third original' }]
      });

      // Create alternatives for msg1 and msg3
      const alt1 = await db.createMessageAlternative(msg1.id, [{ text: 'First alternative' }]);
      await db.createMessageAlternative(msg3.id, [{ text: 'Third alternative' }]);

      // Only activate alternative for msg1
      await db.setActiveAlternative(conversation.id, msg1.id, 1);

      const messages = await db.getConversationMessages(conversation.id);

      expect(messages).toHaveLength(3);
      expect(messages[0].id).toBe(alt1.id);
      expect(messages[0].content[0].text).toBe('First alternative');
      expect(messages[1].id).toBe(msg2.id);
      expect(messages[1].content[0].text).toBe('Second original');
      expect(messages[2].id).toBe(msg3.id);
      expect(messages[2].content[0].text).toBe('Third original');
    });
  });

  describe('Active Alternative Management', () => {
    beforeEach(async () => {
      await setupDatabase();
    });

    afterEach(async () => {
      await cleanupDatabase();
    });

    test('setActiveAlternative updates conversation activeAlternatives', async () => {
      const baseMessage = await db.addMessage(conversation.id, {
        role: 'user',
        content: [{ text: 'Original' }]
      });

      await db.createMessageAlternative(baseMessage.id, [{ text: 'Alternative 1' }]);
      await db.createMessageAlternative(baseMessage.id, [{ text: 'Alternative 2' }]);

      await db.setActiveAlternative(conversation.id, baseMessage.id, 2);

      const updatedConv = await db.getConversation(conversation.id);
      expect(updatedConv.activeAlternatives[baseMessage.id]).toBe(2);
    });

    test('setActiveAlternative throws error for invalid alternative index', async () => {
      const baseMessage = await db.addMessage(conversation.id, {
        role: 'user',
        content: [{ text: 'Original' }]
      });

      await db.createMessageAlternative(baseMessage.id, [{ text: 'Alternative 1' }]);

      await expect(
        db.setActiveAlternative(conversation.id, baseMessage.id, 5)
      ).rejects.toThrow('Alternative index 5 not found');
    });

    test('setActiveAlternative allows setting back to original (index 0)', async () => {
      const baseMessage = await db.addMessage(conversation.id, {
        role: 'user',
        content: [{ text: 'Original' }]
      });

      await db.createMessageAlternative(baseMessage.id, [{ text: 'Alternative' }]);
      await db.setActiveAlternative(conversation.id, baseMessage.id, 1);
      await db.setActiveAlternative(conversation.id, baseMessage.id, 0);

      const updatedConv = await db.getConversation(conversation.id);
      expect(updatedConv.activeAlternatives[baseMessage.id]).toBe(0);
    });

    test('setActiveAlternative throws error for nonexistent conversation', async () => {
      await expect(
        db.setActiveAlternative('nonexistent-conv', 'msg-id', 1)
      ).rejects.toThrow('Conversation nonexistent-conv not found');
    });

    test('setActiveAlternative throws error for nonexistent base message', async () => {
      await expect(
        db.setActiveAlternative(conversation.id, 'nonexistent-msg', 1)
      ).rejects.toThrow('Message nonexistent-msg not found');
    });
  });

  describe('Alternative Navigation', () => {
    beforeEach(async () => {
      await setupDatabase();
    });

    afterEach(async () => {
      await cleanupDatabase();
    });

    test('switchToNextAlternative moves forward through alternatives', async () => {
      const baseMessage = await db.addMessage(conversation.id, {
        role: 'user',
        content: [{ text: 'Original' }]
      });

      await db.createMessageAlternative(baseMessage.id, [{ text: 'Alt 1' }]);
      await db.createMessageAlternative(baseMessage.id, [{ text: 'Alt 2' }]);

      // Start at original (index 0)
      let result = await db.switchToNextAlternative(conversation.id, baseMessage.id);
      expect(result).toBe(true);

      let conv = await db.getConversation(conversation.id);
      expect(conv.activeAlternatives[baseMessage.id]).toBe(1);

      // Move to second alternative
      result = await db.switchToNextAlternative(conversation.id, baseMessage.id);
      expect(result).toBe(true);

      conv = await db.getConversation(conversation.id);
      expect(conv.activeAlternatives[baseMessage.id]).toBe(2);

      // Can't move beyond last alternative
      result = await db.switchToNextAlternative(conversation.id, baseMessage.id);
      expect(result).toBe(false);

      conv = await db.getConversation(conversation.id);
      expect(conv.activeAlternatives[baseMessage.id]).toBe(2);
    });

    test('switchToPrevAlternative moves backward through alternatives', async () => {
      const baseMessage = await db.addMessage(conversation.id, {
        role: 'user',
        content: [{ text: 'Original' }]
      });

      await db.createMessageAlternative(baseMessage.id, [{ text: 'Alt 1' }]);
      await db.createMessageAlternative(baseMessage.id, [{ text: 'Alt 2' }]);

      // Start at second alternative
      await db.setActiveAlternative(conversation.id, baseMessage.id, 2);

      let result = await db.switchToPrevAlternative(conversation.id, baseMessage.id);
      expect(result).toBe(true);

      let conv = await db.getConversation(conversation.id);
      expect(conv.activeAlternatives[baseMessage.id]).toBe(1);

      // Move to original
      result = await db.switchToPrevAlternative(conversation.id, baseMessage.id);
      expect(result).toBe(true);

      conv = await db.getConversation(conversation.id);
      expect(conv.activeAlternatives[baseMessage.id]).toBe(0);

      // Can't move before original
      result = await db.switchToPrevAlternative(conversation.id, baseMessage.id);
      expect(result).toBe(false);

      conv = await db.getConversation(conversation.id);
      expect(conv.activeAlternatives[baseMessage.id]).toBe(0);
    });

    test('navigation methods return false for nonexistent conversation', async () => {
      const nextResult = await db.switchToNextAlternative('nonexistent', 'msg-id');
      const prevResult = await db.switchToPrevAlternative('nonexistent', 'msg-id');
      
      expect(nextResult).toBe(false);
      expect(prevResult).toBe(false);
    });
  });

  describe('Alternative Information', () => {
    beforeEach(async () => {
      await setupDatabase();
    });

    afterEach(async () => {
      await cleanupDatabase();
    });

    test('getAlternativeInfo provides correct navigation information', async () => {
      const baseMessage = await db.addMessage(conversation.id, {
        role: 'user',
        content: [{ text: 'Original' }]
      });

      await db.createMessageAlternative(baseMessage.id, [{ text: 'Alt 1' }]);
      await db.createMessageAlternative(baseMessage.id, [{ text: 'Alt 2' }]);

      // Test at original (index 0)
      let info = await db.getAlternativeInfo(conversation.id, baseMessage.id);
      expect(info).toEqual({
        currentIndex: 0,
        totalCount: 3,
        canGoPrev: false,
        canGoNext: true,
        hasAlternatives: true
      });

      // Test at middle alternative (index 1)
      await db.setActiveAlternative(conversation.id, baseMessage.id, 1);
      info = await db.getAlternativeInfo(conversation.id, baseMessage.id);
      expect(info).toEqual({
        currentIndex: 1,
        totalCount: 3,
        canGoPrev: true,
        canGoNext: true,
        hasAlternatives: true
      });

      // Test at last alternative (index 2)
      await db.setActiveAlternative(conversation.id, baseMessage.id, 2);
      info = await db.getAlternativeInfo(conversation.id, baseMessage.id);
      expect(info).toEqual({
        currentIndex: 2,
        totalCount: 3,
        canGoPrev: true,
        canGoNext: false,
        hasAlternatives: true
      });
    });

    test('getAlternativeInfo handles message with no alternatives', async () => {
      const baseMessage = await db.addMessage(conversation.id, {
        role: 'user',
        content: [{ text: 'Standalone message' }]
      });

      const info = await db.getAlternativeInfo(conversation.id, baseMessage.id);
      expect(info).toEqual({
        currentIndex: 0,
        totalCount: 1,
        canGoPrev: false,
        canGoNext: false,
        hasAlternatives: false
      });
    });

    test('getAlternativeInfo handles nonexistent conversation', async () => {
      const info = await db.getAlternativeInfo('nonexistent', 'msg-id');
      expect(info.currentIndex).toBe(0);
      expect(info.totalCount).toBe(1);
      expect(info.canGoPrev).toBe(false);
      expect(info.canGoNext).toBe(false);
      expect(info.hasAlternatives).toBe(false);
    });
  });

  describe('Serialization and Persistence', () => {
    beforeEach(async () => {
      await setupDatabase();
    });

    afterEach(async () => {
      await cleanupDatabase();
    });

    test('alternatives persist correctly across database sessions', async () => {
      const testEmail = `persist-test-${Date.now()}@example.com`;
      
      // Create and populate database
      let db1 = new ConversationDB(testEmail);
      await db1.init(new TestEmbedder());
      
      const conv = await db1.createConversation({ title: 'Persistence Test' });
      const baseMsg = await db1.addMessage(conv.id, {
        role: 'user',
        content: [{ text: 'Original message' }]
      });
      
      const alt1 = await db1.createMessageAlternative(baseMsg.id, [{ text: 'Alternative 1' }]);
      const alt2 = await db1.createMessageAlternative(baseMsg.id, [{ text: 'Alternative 2' }]);
      
      await db1.setActiveAlternative(conv.id, baseMsg.id, 1);
      await db1.close();

      // Reopen database and verify data persists
      let db2 = new ConversationDB(testEmail);
      await db2.init(new TestEmbedder());

      const retrievedConv = await db2.getConversation(conv.id);
      expect(retrievedConv.activeAlternatives[baseMsg.id]).toBe(1);

      const alternatives = await db2.getMessageAlternatives(baseMsg.id);
      expect(alternatives).toHaveLength(2);
      expect(alternatives[0].content[0].text).toBe('Alternative 1');
      expect(alternatives[1].content[0].text).toBe('Alternative 2');

      const messages = await db2.getConversationMessages(conv.id);
      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBe(alt1.id);
      expect(messages[0].content[0].text).toBe('Alternative 1');

      await db2.close();
    });

    test('complex activeAlternatives object serializes correctly', async () => {
      const msg1 = await db.addMessage(conversation.id, {
        role: 'user',
        content: [{ text: 'Message 1' }]
      });

      const msg2 = await db.addMessage(conversation.id, {
        role: 'assistant',
        content: [{ text: 'Message 2' }]
      });

      const msg3 = await db.addMessage(conversation.id, {
        role: 'user',
        content: [{ text: 'Message 3' }]
      });

      // Create alternatives
      await db.createMessageAlternative(msg1.id, [{ text: 'Alt 1-1' }]);
      await db.createMessageAlternative(msg1.id, [{ text: 'Alt 1-2' }]);
      await db.createMessageAlternative(msg2.id, [{ text: 'Alt 2-1' }]);
      await db.createMessageAlternative(msg3.id, [{ text: 'Alt 3-1' }]);

      // Set different active alternatives
      await db.setActiveAlternative(conversation.id, msg1.id, 2);
      await db.setActiveAlternative(conversation.id, msg2.id, 0);
      await db.setActiveAlternative(conversation.id, msg3.id, 1);

      // Retrieve and verify
      const retrievedConv = await db.getConversation(conversation.id);
      expect(retrievedConv.activeAlternatives).toEqual({
        [msg1.id]: 2,
        [msg2.id]: 0,
        [msg3.id]: 1
      });

      // Verify the data structure survives serialization
      const serialized = retrievedConv.toJSON();
      const deserialized = Conversation.fromJSON(serialized);
      expect(deserialized.activeAlternatives).toEqual({
        [msg1.id]: 2,
        [msg2.id]: 0,
        [msg3.id]: 1
      });
    });

    test('message alternatives with complex content serialize correctly', async () => {
      const baseMessage = await db.addMessage(conversation.id, {
        role: 'assistant',
        content: [
          { text: 'Processing your request...' },
          {
            toolUse: {
              toolUseId: 'search-1',
              name: 'web_search',
              input: { query: 'SolidJS reactive patterns' }
            }
          }
        ],
        metadata: {
          model: 'claude-3-sonnet',
          usage: { inputTokens: 120, outputTokens: 85 },
          toolUses: [{ name: 'web_search', input: { query: 'SolidJS reactive patterns' } }]
        },
        toolResults: [
          {
            toolUseId: 'search-1',
            content: [{ text: 'Found 15 results about SolidJS patterns...' }]
          }
        ]
      });

      const alternative = await db.createMessageAlternative(baseMessage.id, [
        { text: 'Let me search for that information...' },
        {
          toolUse: {
            toolUseId: 'search-2',
            name: 'knowledge_search',
            input: { query: 'SolidJS reactivity guide' }
          }
        }
      ]);

      // Retrieve alternative and verify all fields are preserved
      const alternatives = await db.getMessageAlternatives(baseMessage.id);
      const retrievedAlt = alternatives[0];

      expect(retrievedAlt.content).toHaveLength(2);
      expect(retrievedAlt.content[0].text).toBe('Let me search for that information...');
      expect(retrievedAlt.content[1].toolUse.name).toBe('knowledge_search');
      expect(retrievedAlt.content[1].toolUse.input.query).toBe('SolidJS reactivity guide');
      expect(retrievedAlt.baseMessageId).toBe(baseMessage.id);
      expect(retrievedAlt.alternativeIndex).toBe(1);
      expect(retrievedAlt.role).toBe('assistant');
      expect(retrievedAlt.conversationId).toBe(conversation.id);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    beforeEach(async () => {
      await setupDatabase();
    });

    afterEach(async () => {
      await cleanupDatabase();
    });

    test('handles empty content arrays in alternatives', async () => {
      const baseMessage = await db.addMessage(conversation.id, {
        role: 'user',
        content: [{ text: 'Original message' }]
      });

      const alternative = await db.createMessageAlternative(baseMessage.id, []);
      
      expect(alternative.content).toEqual([]);
      expect(alternative.baseMessageId).toBe(baseMessage.id);
      expect(alternative.alternativeIndex).toBe(1);
    });

    test('preserves message timestamps in alternatives', async () => {
      const baseMessage = await db.addMessage(conversation.id, {
        role: 'user',
        content: [{ text: 'Original' }]
      });

      const beforeTime = new Date().toISOString();
      const alternative = await db.createMessageAlternative(baseMessage.id, [{ text: 'Alternative' }]);
      const afterTime = new Date().toISOString();

      expect(alternative.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(alternative.timestamp).toBeLessThanOrEqual(afterTime);
      expect(alternative.timestamp).not.toBe(baseMessage.timestamp);
    });

    test('conversation message count includes alternatives', async () => {
      const initialCount = conversation.messageCount;
      
      const baseMessage = await db.addMessage(conversation.id, {
        role: 'user',
        content: [{ text: 'Original' }]
      });

      let updatedConv = await db.getConversation(conversation.id);
      expect(updatedConv.messageCount).toBe(initialCount + 1);

      await db.createMessageAlternative(baseMessage.id, [{ text: 'Alternative' }]);
      
      updatedConv = await db.getConversation(conversation.id);
      expect(updatedConv.messageCount).toBe(initialCount + 2);
    });

    test('alternatives are included in embeddings for search', async () => {
      const baseMessage = await db.addMessage(conversation.id, {
        role: 'user',
        content: [{ text: 'search for cats' }]
      });

      const alternative = await db.createMessageAlternative(baseMessage.id, [
        { text: 'search for dogs instead' }
      ]);

      // Search should find both original and alternative
      const results = await db.search('search for', 10);
      const messageResults = results.filter(r => r.metadata.type === 'message');
      
      expect(messageResults.length).toBeGreaterThanOrEqual(2);
      
      const foundIds = messageResults.map(r => r.metadata.id);
      expect(foundIds).toContain(baseMessage.id);
      expect(foundIds).toContain(alternative.id);
    });

    test('activeAlternatives survives conversation updates', async () => {
      const baseMessage = await db.addMessage(conversation.id, {
        role: 'user',
        content: [{ text: 'Original' }]
      });

      await db.createMessageAlternative(baseMessage.id, [{ text: 'Alternative' }]);
      await db.setActiveAlternative(conversation.id, baseMessage.id, 1);

      // Update other conversation fields
      await db.updateConversation(conversation.id, {
        title: 'Updated Title',
        summary: 'Updated summary',
        starred: true
      });

      const updatedConv = await db.getConversation(conversation.id);
      expect(updatedConv.title).toBe('Updated Title');
      expect(updatedConv.summary).toBe('Updated summary');
      expect(updatedConv.starred).toBe(true);
      expect(updatedConv.activeAlternatives[baseMessage.id]).toBe(1);
    });
  });
});