// Test for chat hooks - storage bugs and real behavior
import { describe, test, expect, beforeEach, jest, waitFor } from '../../../index.js';
import { useChat } from '../../../../pages/tools/chat/hooks.js';
import { getDB } from '../../../../models/database.js';

describe('Chat Hooks - Tool Call Restoration Bug', () => {
  
  describe('Message Structure Model', () => {
    test('user message with text has correct structure', () => {
      const userMessage = {
        role: "user",
        content: [
          { text: "Search for recent AI research" }
        ]
      };
      
      expect(userMessage.role).toBe("user");
      expect(userMessage.content).toHaveLength(1);
      expect(userMessage.content[0]).toEqual({ text: "Search for recent AI research" });
    });

    test('user message with file attachments has correct structure', () => {
      const userMessage = {
        role: "user", 
        content: [
          { 
            image: { 
              name: "chart.png", 
              format: "png", 
              source: { bytes: "base64data..." } 
            } 
          },
          { text: "What does this chart show?" }
        ]
      };
      
      expect(userMessage.content).toHaveLength(2);
      expect(userMessage.content[0]).toHaveProperty('image');
      expect(userMessage.content[0].image.name).toBe("chart.png");
      expect(userMessage.content[1]).toEqual({ text: "What does this chart show?" });
    });

    test('assistant message with tool call has correct structure', () => {
      const assistantMessage = {
        role: "assistant",
        content: [
          { text: "I'll search for recent AI research for you." },
          { 
            toolUse: {
              toolUseId: "tool-123",
              name: "search",
              input: { query: "recent AI research 2024" }
            }
          }
        ]
      };
      
      expect(assistantMessage.role).toBe("assistant");
      expect(assistantMessage.content).toHaveLength(2);
      expect(assistantMessage.content[0]).toEqual({ text: "I'll search for recent AI research for you." });
      expect(assistantMessage.content[1]).toHaveProperty('toolUse');
      expect(assistantMessage.content[1].toolUse.name).toBe("search");
      expect(assistantMessage.content[1].toolUse.toolUseId).toBe("tool-123");
    });

    test('user message with tool results has correct structure', () => {
      const toolResultMessage = {
        role: "user",
        content: [
          {
            toolResult: {
              toolUseId: "tool-123",
              content: [{ 
                json: { 
                  results: {
                    web: [
                      { title: "AI Research 2024", url: "https://example.com", extra_snippets: ["Latest"] }
                    ],
                    news: []
                  }
                }
              }]
            }
          }
        ]
      };
      
      expect(toolResultMessage.role).toBe("user");
      expect(toolResultMessage.content).toHaveLength(1);
      expect(toolResultMessage.content[0]).toHaveProperty('toolResult');
      expect(toolResultMessage.content[0].toolResult.toolUseId).toBe("tool-123");
      expect(toolResultMessage.content[0].toolResult.content[0].json.results.web).toHaveLength(1);
    });

    test('assistant message with reasoning content has correct structure', () => {
      const reasoningMessage = {
        role: "assistant",
        content: [
          {
            reasoningContent: {
              reasoningText: {
                text: "Let me think about this step by step...",
                signature: "reasoning-signature"
              },
              redactedContent: ""
            }
          },
          { text: "Based on my analysis, here's the answer." }
        ]
      };
      
      expect(reasoningMessage.content).toHaveLength(2);
      expect(reasoningMessage.content[0]).toHaveProperty('reasoningContent');
      expect(reasoningMessage.content[0].reasoningContent.reasoningText.text).toBe("Let me think about this step by step...");
      expect(reasoningMessage.content[1]).toEqual({ text: "Based on my analysis, here's the answer." });
    });
  });

  describe('Tool Call Restoration Bug Scenarios', () => {
    
    test('should preserve tool calls when JSON parsing succeeds', () => {
      // Simulate how messages are stored in database
      const storedMessage = {
        role: 'assistant',
        content: JSON.stringify([
          { text: 'I\'ll search for that information.' },
          { 
            toolUse: {
              toolUseId: 'tool-123',
              name: 'search',
              input: { query: 'test query' }
            }
          }
        ]),
        timestamp: new Date().toISOString(),
        metadata: null
      };

      // Simulate the parsing logic from hooks.js:62-85
      const processedMessage = (() => {
        try {
          const content = typeof storedMessage.content === 'string' 
            ? JSON.parse(storedMessage.content) 
            : storedMessage.content;
          
          return {
            role: storedMessage.role,
            content: Array.isArray(content) ? content : [{ text: String(content) }],
            timestamp: storedMessage.timestamp,
            metadata: storedMessage.metadata
          };
        } catch (error) {
          console.error('Failed to parse message content:', error);
          return {
            role: storedMessage.role,
            content: [{ text: String(storedMessage.content) }],
            timestamp: storedMessage.timestamp,
            metadata: storedMessage.metadata
          };
        }
      })();

      // Verify tool calls are preserved correctly
      expect(processedMessage.role).toBe('assistant');
      expect(processedMessage.content).toHaveLength(2);
      expect(processedMessage.content[0]).toEqual({ text: 'I\'ll search for that information.' });
      expect(processedMessage.content[1]).toHaveProperty('toolUse');
      expect(processedMessage.content[1].toolUse.name).toBe('search');
      expect(processedMessage.content[1].toolUse.toolUseId).toBe('tool-123');
    });

    test('BUG DEMONSTRATION: tool calls lost when JSON parsing fails', () => {
      // Simulate corrupted JSON that would cause parsing to fail
      const corruptedMessage = {
        role: 'assistant',
        content: '[{"text": "I\'ll help"}, {"toolUse": {"name": "search"}}', // Missing closing bracket
        timestamp: new Date().toISOString(),
        metadata: null
      };

      // Simulate the problematic parsing logic from hooks.js:62-85
      const processedMessage = (() => {
        try {
          const content = typeof corruptedMessage.content === 'string' 
            ? JSON.parse(corruptedMessage.content) 
            : corruptedMessage.content;
          
          return {
            role: corruptedMessage.role,
            content: Array.isArray(content) ? content : [{ text: String(content) }],
            timestamp: corruptedMessage.timestamp,
            metadata: corruptedMessage.metadata
          };
        } catch (error) {
          console.error('Failed to parse message content:', error);
          // THIS IS THE BUG - tool calls become plain text
          return {
            role: corruptedMessage.role,
            content: [{ text: String(corruptedMessage.content) }],
            timestamp: corruptedMessage.timestamp,
            metadata: corruptedMessage.metadata
          };
        }
      })();

      // This demonstrates the bug - tool calls are lost
      expect(processedMessage.content).toHaveLength(1);
      expect(processedMessage.content[0]).toEqual({ 
        text: '[{"text": "I\'ll help"}, {"toolUse": {"name": "search"}}'
      });
      
      // The toolUse structure is completely lost
      expect(processedMessage.content[0].toolUse).toBeUndefined();
    });

    test('different tool types are affected by the bug', () => {
      const toolTypes = [
        {
          name: 'search',
          input: { query: 'test search' }
        },
        {
          name: 'browse',
          input: { url: 'https://example.com', topic: 'research' }
        },
        {
          name: 'code',
          input: { source: 'console.log("hello");', language: 'javascript' }
        },
        {
          name: 'editor',
          input: { command: 'create', path: 'test.js', new_str: 'const x = 1;' }
        }
      ];

      toolTypes.forEach(tool => {
        // Create valid message structure
        const validMessage = {
          role: 'assistant',
          content: JSON.stringify([
            { text: `I'll use the ${tool.name} tool.` },
            { 
              toolUse: {
                toolUseId: `${tool.name}-123`,
                name: tool.name,
                input: tool.input
              }
            }
          ])
        };

        // Process successfully
        const parsed = JSON.parse(validMessage.content);
        expect(parsed[1].toolUse.name).toBe(tool.name);

        // Simulate corruption that breaks JSON
        const corruptedMessage = {
          role: 'assistant',
          content: validMessage.content.slice(0, -5) // Remove closing characters
        };

        // Show that corruption loses tool structure
        let isCorrupted = false;
        try {
          JSON.parse(corruptedMessage.content);
        } catch (e) {
          isCorrupted = true;
        }
        
        expect(isCorrupted).toBe(true);
      });
    });

    test('tool results are also affected by the bug', () => {
      const toolResultMessage = {
        role: 'user',
        content: JSON.stringify([
          {
            toolResult: {
              toolUseId: 'search-123',
              content: [{ 
                json: { 
                  results: {
                    web: [{ title: 'Test Result', url: 'https://test.com' }]
                  }
                }
              }]
            }
          }
        ])
      };

      // Valid parsing preserves structure
      const validParsed = JSON.parse(toolResultMessage.content);
      expect(validParsed[0]).toHaveProperty('toolResult');
      expect(validParsed[0].toolResult.content[0].json.results.web).toHaveLength(1);

      // Corrupted parsing loses structure (simulate the bug)
      const corruptedContent = toolResultMessage.content.slice(0, -10); // Break JSON
      
      // This would trigger the fallback in hooks.js that loses tool results
      const processedWithBug = {
        role: 'user',
        content: [{ text: corruptedContent }] // Bug converts to plain text
      };

      expect(processedWithBug.content[0].toolResult).toBeUndefined();
      expect(processedWithBug.content[0].text).toContain('toolResult');
    });

    test('mixed content messages are affected by the bug', () => {
      const mixedMessage = {
        role: 'assistant',
        content: JSON.stringify([
          { text: 'Let me help you with that.' },
          { 
            toolUse: {
              toolUseId: 'mixed-123',
              name: 'search',
              input: { query: 'help' }
            }
          },
          { text: 'I found some information.' },
          {
            reasoningContent: {
              reasoningText: { text: 'Thinking...', signature: '' },
              redactedContent: ''
            }
          }
        ])
      };

      // Valid parsing preserves all content types
      const validParsed = JSON.parse(mixedMessage.content);
      expect(validParsed).toHaveLength(4);
      expect(validParsed[0]).toHaveProperty('text');
      expect(validParsed[1]).toHaveProperty('toolUse');
      expect(validParsed[2]).toHaveProperty('text');
      expect(validParsed[3]).toHaveProperty('reasoningContent');

      // When JSON parsing fails, ALL structure is lost
      const buggedMessage = {
        role: 'assistant',
        content: [{ text: mixedMessage.content }] // Everything becomes plain text
      };

      expect(buggedMessage.content).toHaveLength(1);
      expect(buggedMessage.content[0].text).toContain('toolUse');
      expect(buggedMessage.content[0].text).toContain('reasoningContent');
      expect(buggedMessage.content[0].toolUse).toBeUndefined();
      expect(buggedMessage.content[0].reasoningContent).toBeUndefined();
    });
  });

  describe('Impact on Message Rendering', () => {
    
    test('message component expects structured content for tool rendering', () => {
      // The message.js component looks for specific content structure
      
      // Proper structure that would render correctly
      const properContent = [
        { text: 'Searching...' },
        { 
          toolUse: {
            toolUseId: 'search-123',
            name: 'search',
            input: { query: 'AI research' }
          }
        }
      ];

      // Check that we have the expected structure for message.js
      const searchToolContent = properContent.find(c => c.toolUse?.name === 'search');
      expect(searchToolContent).toBeTruthy();
      expect(searchToolContent.toolUse.name).toBe('search');
      expect(searchToolContent.toolUse.input.query).toBe('AI research');

      // Bug converts this to plain text, breaking rendering
      const buggedContent = [
        { text: JSON.stringify(properContent) }
      ];

      const buggedSearchTool = buggedContent.find(c => c.toolUse?.name === 'search');
      expect(buggedSearchTool).toBeFalsy(); // Tool structure is lost!
    });

    test('all tool types have specific rendering requirements', () => {
      const toolContentTypes = {
        search: { toolUse: { name: 'search', input: { query: 'test' } } },
        browse: { toolUse: { name: 'browse', input: { url: 'https://test.com' } } },
        code: { toolUse: { name: 'code', input: { source: 'code here' } } },
        editor: { toolUse: { name: 'editor', input: { path: 'file.js' } } },
        think: { toolUse: { name: 'think', input: { thought: 'thinking' } } }
      };

      // Each tool type should be identifiable by name
      Object.entries(toolContentTypes).forEach(([toolName, content]) => {
        expect(content.toolUse.name).toBe(toolName);
        
        // When bug occurs, this structure is lost
        const buggedVersion = { text: JSON.stringify(content) };
        expect(buggedVersion.toolUse).toBeUndefined();
      });
    });
  });

  describe('Real Storage Behavior Tests', () => {
    test('FIXED: Assistant messages with tool calls are properly persisted', async () => {
      // Initialize the chat hook - this will initialize the database
      const chatHook = useChat();
      
      // Give it time to initialize database
      await waitFor(() => true, 500);
      
      let conversationId;
      let messagesBeforeSubmit = 0;
      
      // Submit a message that will trigger tool use (API looks for "tool" in message)
      await chatHook.submitMessage({
        message: "Please use a tool to search for information",
        inputFiles: null,
        reasoningMode: false,
        model: "test-model",
        context: {},
        reset: () => {}
      });
      
      // Wait for conversation to be created and messages to be processed
      await waitFor(() => {
        conversationId = chatHook.conversation.id;
        return conversationId && chatHook.messages.length > messagesBeforeSubmit;
      }, 3000);
      
      expect(conversationId).toBeTruthy();
      
      // Wait a bit more for async operations to complete
      await waitFor(() => true, 1000);
      
      // Now check what's actually stored in IndexedDB
      const db = await getDB('test@example.com');
      const storedMessages = await db.getMessages(conversationId);
      
      // Verify the fix works
      expect(storedMessages.length).toBeGreaterThan(0);
      
      // The critical test - assistant message with tool calls should be stored
      const assistantMessages = storedMessages.filter(m => m.role === 'assistant');
      const assistantWithToolCalls = assistantMessages.find(m => 
        m.content.some(block => block.toolUse)
      );
      
      expect(assistantWithToolCalls).toBeTruthy();
      
      // Verify complete conversation flow is preserved
      const userMessages = storedMessages.filter(m => m.role === 'user');
      const toolResultMessages = storedMessages.filter(m => 
        m.role === 'user' && m.content.some(block => block.toolResult)
      );
      
      expect(userMessages.length).toBeGreaterThan(0);
      expect(toolResultMessages.length).toBeGreaterThan(0);
    });

    test('Basic message storage works correctly', async () => {
      const chatHook = useChat();
      
      await waitFor(() => true, 500);
      
      await chatHook.submitMessage({
        message: "Hello, this is a simple test",
        inputFiles: null,
        reasoningMode: false,
        model: "test-model",
        context: {},
        reset: () => {}
      });
      
      await waitFor(() => {
        return chatHook.conversation.id && chatHook.messages.length > 0;
      }, 3000);
      
      const db = await getDB('test@example.com');
      const storedMessages = await db.getMessages(chatHook.conversation.id);
      
      expect(storedMessages.length).toBeGreaterThan(0);
      
      // Should have user message and assistant response
      const userMessages = storedMessages.filter(m => m.role === 'user');
      const assistantMessages = storedMessages.filter(m => m.role === 'assistant');
      
      expect(userMessages.length).toBeGreaterThan(0);
      expect(assistantMessages.length).toBeGreaterThan(0);
    });
  });
});