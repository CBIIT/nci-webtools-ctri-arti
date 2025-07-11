import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { fileToBase64, splitFilename } from "/utils/parsers.js";
import { runTool, getClientContext } from "/utils/tools.js";
import { readStream } from "/utils/files.js";
import { jsonToXml } from "/utils/xml.js";
import { systemPrompt, tools } from "./config.js";
import { getDB } from "/models/database.js";

/**
 * Normalize message content to array format, handling various edge cases
 * @param {any} content - Raw content from storage
 * @returns {Array} - Normalized content array
 */
export function normalizeMessageContent(content) {
  // Handle null/undefined
  if (content === null || content === undefined) {
    return [{ text: "" }];
  }
  
  // If already an array, return as-is
  if (Array.isArray(content)) {
    return content.length > 0 ? content : [{ text: "" }];
  }
  
  // If it's a string, try to parse as JSON first
  if (typeof content === 'string') {
    // Empty string
    if (content.trim() === '') {
      return [{ text: "" }];
    }
    
    // Try JSON parsing
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return parsed.length > 0 ? parsed : [{ text: "" }];
      }
      // If parsed but not array, treat as text
      return [{ text: String(parsed) }];
    } catch (error) {
      // Not JSON, treat as plain text
      return [{ text: content }];
    }
  }
  
  // For any other type, convert to string
  return [{ text: String(content) }];
}

export function useChat() {
  const [messages, setMessages] = createStore([]);
  const [conversation, setConversation] = createStore({ id: null, title: "", messages });
  const [conversations, setConversations] = createStore([]);
  const [loading, setLoading] = createSignal(false);
  const [userEmail, setUserEmail] = createSignal(null);
  const [db, setDB] = createSignal(null);

  // Initialize user session and database
  const initializeDatabase = async () => {
    try {
      const { user } = await fetch("/api/session").then((res) => res.json());
      if (user?.email) {
        setUserEmail(user.email);
        const database = await getDB(user.email);
        setDB(database);
        
        // Load conversation from URL if present
        const urlParams = new URLSearchParams(window.location.search);
        const conversationId = urlParams.get('id');
        if (conversationId) {
          await loadConversation(conversationId);
        }
        
        // Load recent conversations for sidebar
        await loadRecentConversations();
      }
    } catch (error) {
      console.error('Failed to initialize database:', error);
    }
  };

  // Initialize on mount
  initializeDatabase();

  // Load conversation from database
  const loadConversation = async (conversationId) => {
    const database = db();
    if (!database) return;

    try {
      const conv = await database.getConversation(conversationId);
      if (conv) {
        setConversation({ 
          id: conv.id, 
          title: conv.title,
          projectId: conv.projectId 
        });
        
        // Load messages for this conversation (with active alternatives)
        const msgs = await database.getConversationMessages(conversationId);
        setMessages(msgs.map(msg => {
          // Normalize content to array format
          const content = normalizeMessageContent(msg.content);
            
          return {
            id: msg.id,
            role: msg.role,
            content,
            timestamp: msg.timestamp,
            metadata: msg.metadata,
            baseMessageId: msg.baseMessageId,
            alternativeIndex: msg.alternativeIndex
          };
        }));
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  };

  // Load recent conversations for sidebar
  const loadRecentConversations = async () => {
    const database = db();
    if (!database) return;

    try {
      const recentConvs = await database.getRecentConversations(20);
      setConversations(recentConvs.map(conv => ({
        id: conv.id,
        title: conv.title,
        lastMessageAt: conv.lastMessageAt,
        messageCount: conv.messageCount
      })));
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  };

  // Update conversation title
  const updateConversation = async (updates) => {
    const database = db();
    if (!database || !conversation.id) return;

    try {
      await database.updateConversation(conversation.id, updates);
      setConversation(prev => ({ ...prev, ...updates }));
      
      // Refresh conversations list if title changed
      if (updates.title) {
        await loadRecentConversations();
      }
    } catch (error) {
      console.error('Failed to update conversation:', error);
    }
  };

  // Delete conversation
  const deleteConversation = async () => {
    const database = db();
    if (!database || !conversation?.id) return;

    const confirmDelete = window.confirm('Are you sure you want to delete this conversation? This action cannot be undone.');
    if (!confirmDelete) return;

    try {
      await database.deleteConversation(conversation.id);
      
      // Clear current conversation
      setConversation({ id: null, title: "", messages: [] });
      setMessages([]);
      
      // Update URL to remove conversation ID
      const url = new URL(window.location);
      url.searchParams.delete('id');
      window.history.replaceState({}, '', url);
      
      // Refresh conversations list
      await loadRecentConversations();
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      alert('Failed to delete conversation. Please try again.');
    }
  };

  // Update URL with conversation ID
  const updateURL = (conversationId) => {
    if (conversationId) {
      const url = new URL(window.location);
      url.searchParams.set('id', conversationId);
      window.history.replaceState({}, '', url);
    }
  };

  /**
   * Continue conversation with AI using existing messages
   * @param {Object} params
   * @param {string} params.model - The model to use.
   * @param {boolean} params.reasoningMode - Whether reasoning mode is enabled.
   * @param {Object} params.context - Additional context for the AI.
   */
  async function continueConversation({ model, reasoningMode = false, context = {} }) {
    const database = db();
    
    try {
      let isComplete = false;
      setLoading(true);

      while (!isComplete) {
        const response = await fetch("/api/model", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model,
            tools,
            system: systemPrompt(getClientContext(context)),
            messages,
            thoughtBudget: reasoningMode ? 8000 : 0,
            stream: true,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const decoder = new TextDecoder();
        let assistantMessage = { role: "assistant", content: [] };
        setMessages(messages.length, assistantMessage);
        
        // Store assistant message immediately when created
        let assistantMessageId = null;
        if (database && conversation.id) {
          try {
            const storedMessage = await database.addMessage(conversation.id, {
              role: assistantMessage.role,
              content: assistantMessage.content
            });
            assistantMessageId = storedMessage.id;
            
            // Update the assistant message in state with the database ID
            setMessages(messages.length - 1, "id", storedMessage.id);
            setMessages(messages.length - 1, "timestamp", storedMessage.timestamp);
          } catch (error) {
            console.error('Failed to store initial assistant message:', error);
          }
        }

        // Process streaming chunks from the API
        for await (const chunk of readStream(response)) {
          const values = decoder
            .decode(chunk, { stream: true })
            .trim()
            .split("\n")
            .map((e) => JSON.parse(e));

          for (const value of values) {
            const { contentBlockStart, contentBlockDelta, contentBlockStop, messageStop } = value;
            const toolUse = contentBlockStart?.start?.toolUse;
            const stopReason = messageStop?.stopReason;

            if (toolUse) {
              toolUse.input = "";
              const { contentBlockIndex } = contentBlockStart;
              setMessages(messages.length - 1, "content", contentBlockIndex, { toolUse });
            } else if (contentBlockDelta) {
              const { contentBlockIndex, delta } = contentBlockDelta;
              const { reasoningContent, text, toolUse } = delta;

              if (reasoningContent) {
                if (!messages.at(-1).content[contentBlockIndex]?.reasoningContent) {
                  setMessages(messages.length - 1, "content", contentBlockIndex, {
                    reasoningContent: {
                      reasoningText: {
                        text: "",
                        signature: "",
                      },
                      redactedContent: "",
                    },
                  });
                }
                if (reasoningContent.text) {
                  setMessages(
                    messages.length - 1,
                    "content",
                    contentBlockIndex,
                    "reasoningContent",
                    "reasoningText",
                    "text",
                    (prev) => prev + reasoningContent.text
                  );
                } else if (reasoningContent.signature) {
                  setMessages(
                    messages.length - 1,
                    "content",
                    contentBlockIndex,
                    "reasoningContent",
                    "reasoningText",
                    "signature",
                    (prev) => prev + reasoningContent.signature
                  );
                  setMessages(messages.length - 1, "content", contentBlockIndex, "reasoningContent", "redactedContent", undefined);
                } else if (reasoningContent.redactedContent) {
                  setMessages(
                    messages.length - 1,
                    "content",
                    contentBlockIndex,
                    "reasoningContent",
                    "redactedContent",
                    (prev) => prev + reasoningContent.redactedContent
                  );
                  setMessages(messages.length - 1, "content", contentBlockIndex, "reasoningContent", "reasoningText", undefined);
                }
              } else if (text) {
                if (!messages.at(-1).content[contentBlockIndex]?.text) {
                  setMessages(messages.length - 1, "content", contentBlockIndex, { text: "" });
                }
                setMessages(messages.length - 1, "content", contentBlockIndex, "text", (prev) => prev + text);
              } else if (toolUse) {
                setMessages(messages.length - 1, "content", contentBlockIndex, "toolUse", "input", (prev) => prev + toolUse.input);
              }
            } else if (contentBlockStop) {
              const { contentBlockIndex } = contentBlockStop;
              const { toolUse } = messages.at(-1).content[contentBlockIndex];
              const parse = (input) => {
                try {
                  return JSON.parse(input);
                } catch (e) {
                  return { error: e.message, input };
                }
              };
              if (toolUse) setMessages(messages.length - 1, "content", contentBlockIndex, "toolUse", "input", (prev) => parse(prev));
            } else if (stopReason) {
              // Update the stored assistant message with final content
              if (database && conversation.id && assistantMessageId) {
                try {
                  const currentAssistantMessage = messages.at(-1);
                  if (currentAssistantMessage && currentAssistantMessage.role === 'assistant') {
                    // Deep clone the content to remove any reactive references
                    const serializedContent = JSON.parse(JSON.stringify(currentAssistantMessage.content));
                    await database.updateMessage(assistantMessageId, {
                      content: serializedContent
                    });
                  }
                } catch (error) {
                  console.error('Failed to update assistant message:', error);
                }
              }
              
              if (stopReason === "tool_use") {
                const toolUses = messages
                  .at(-1)
                  .content.filter((c) => c.toolUse)
                  .map((c) => c.toolUse);
                const toolResults = await Promise.all(toolUses.map((t) => runTool(t)));
                const toolResultsMessage = {
                  role: "user",
                  content: toolResults.map((r) => ({ toolResult: r })),
                };
                setMessages(messages.length, toolResultsMessage);
                
                // Store tool results message immediately when created
                if (database && conversation.id) {
                  try {
                    const storedToolMessage = await database.addMessage(conversation.id, {
                      role: toolResultsMessage.role,
                      content: toolResultsMessage.content
                    });
                    
                    // Update the tool results message in state with the database ID
                    setMessages(messages.length - 1, "id", storedToolMessage.id);
                    setMessages(messages.length - 1, "timestamp", storedToolMessage.timestamp);
                  } catch (error) {
                    console.error('Failed to store tool results message:', error);
                  }
                }
              } else {
                isComplete = true;
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Error in AI conversation:", error);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Submit a message along with optional files.
   * @param {Object} params
   * @param {string} params.message - The text message.
   * @param {FileList} [params.inputFiles] - Any files attached.
   * @param {boolean} params.reasoningMode - Whether reasoning mode is enabled.
   * @param {string} params.model - The model to use.
   */
  async function submitMessage({ message, inputFiles, reasoningMode, model, context = {}, reset = () => {} }) {
    // CRITICAL FIX: Wait for database to be initialized before proceeding
    let database = db();
    // await database.init();
    let retries = 0;
    while (!database && retries < 10) {
      await new Promise(resolve => setTimeout(resolve, 100));
      database = db();
      retries++;
    }
    
    if (!database) {
      console.error('Database not initialized after waiting');
      // Continue without database for now, but this should be fixed
    }
    
    const text = jsonToXml({
      message: {
        text: message,
        metadata: {
          timestamp: new Date().toLocaleString(),
          reminders:
            "Search and browse for current information if needed. If necessary, interleave tool calls with the think tool to perform complex analysis. Only update the workspace when necessary. Always include APA-style source citations with full URLs when sources are used.",
        },
      },
    });
    const userMessage = {
      role: "user",
      content: [{ text }],
    };

    // Create new conversation if this is the first message
    if (!messages.length && database) {
      try {
        const newConversation = await database.createConversation({
          title: message.length > 50 ? message.substring(0, 50) + '...' : message
        });
        
        setConversation({ 
          id: newConversation.id, 
          title: newConversation.title,
          projectId: newConversation.projectId 
        });
        
        // Update URL with new conversation ID
        updateURL(newConversation.id);
        
        // Refresh conversations list
        await loadRecentConversations();
      } catch (error) {
        console.error('Failed to create conversation:', error);
        // Fallback to local storage behavior
        setConversation({ id: Math.random().toString(36).substr(2, 9), title: message });
      }
    } else if (!messages.length) {
      // Fallback if no database
      setConversation({ id: Math.random().toString(36).substr(2, 9), title: message });
    }

    if (inputFiles && inputFiles.length) {
      for (const file of inputFiles) {
        const byteLengthLimit = 1024 * 1024 * 5; // 5MB
        const imageTypes = ["png", "jpeg", "gif", "webp"];
        const documentTypes = ["pdf", "csv", "doc", "docx", "xls", "xlsx", "html", "txt", "md"];
        let [name, format] = splitFilename(file.name);
        name = name.replace(/[^a-zA-Z0-9\s\[\]\(\)\-]/g, "_").replace(/\s{2,}/g, " ") + new Date().getTime();
        const bytes = await fileToBase64(file, true);
        const contentType = imageTypes.includes(format) ? "image" : "document";
        if (!documentTypes.concat(imageTypes).includes(format)) format = "txt";
        if (file.size > byteLengthLimit) {
          console.warn(`File ${file.name} exceeds the 5MB limit and will not be sent.`);
          continue;
        }
        userMessage.content.unshift({
          [contentType]: { name, format, source: { bytes } },
        });
      }
    }

    // Update the state with the user message
    setMessages(messages.length, userMessage);
    reset?.();
    
    // Store user message in database (as array)
    if (database && conversation.id) {
      try {
        const storedUserMessage = await database.addMessage(conversation.id, {
          role: userMessage.role,
          content: userMessage.content // Store as array directly
        });
        
        // CRITICAL FIX: Update the message in state with the database ID
        setMessages(messages.length - 1, {
          ...userMessage,
          id: storedUserMessage.id,
          timestamp: storedUserMessage.timestamp
        });
      } catch (error) {
        console.error('Failed to store user message:', error);
      }
    }

    // Continue conversation with AI
    await continueConversation({ model, reasoningMode, context });
  }

  // ===== BRANCHING FUNCTIONALITY =====
  
  /**
   * Create a message alternative (branch)
   * @param {number} messageIndex - Index of message to branch from
   * @param {string} newText - New message text
   */
  async function createMessageBranch(messageIndex, newText) {
    const database = db();
    if (!database || !conversation.id) return;
    
    try {
      const originalMessage = messages[messageIndex];
      if (!originalMessage || originalMessage.role !== 'user') {
        throw new Error('Can only branch from user messages');
      }
      
      // Create alternative in database
      const alternative = await database.createMessageAlternative(
        originalMessage.id,
        [{ text: newText }]
      );
      
      // Set the new alternative as active
      await database.setActiveAlternative(conversation.id, originalMessage.id, alternative.alternativeIndex);
      
      // Reload conversation messages to reflect the change
      await loadConversationMessages();
      
    } catch (error) {
      console.error('Failed to create message branch:', error);
    }
  }

  /**
   * Create message branch and continue conversation from that point
   * @param {number} messageIndex - Index of message to branch from  
   * @param {string} newText - New message text
   * @param {string} model - Model to use for continuation
   * @param {boolean} reasoningMode - Whether to use reasoning mode
   */
  async function createMessageBranchAndContinue(messageIndex, newText, model = 'us.anthropic.claude-sonnet-4-20250514-v1:0', reasoningMode = false) {
    const database = db();
    if (!database || !conversation.id) return;
    
    try {
      const originalMessage = messages[messageIndex];
      if (!originalMessage || originalMessage.role !== 'user') {
        throw new Error('Can only branch from user messages');
      }
      
      // Create alternative in database
      const alternative = await database.createMessageAlternative(
        originalMessage.id,
        [{ text: newText }]
      );
      
      // Set the new alternative as active
      await database.setActiveAlternative(conversation.id, originalMessage.id, alternative.alternativeIndex);
      
      // Remove all messages after the branched message from the database
      const messagesToRemove = messages.slice(messageIndex + 1);
      for (const msg of messagesToRemove) {
        if (msg.id) {
          await database.deleteMessage(msg.id);
        }
      }
      
      // Reload conversation messages to get the truncated conversation
      await loadConversationMessages();
      
      // Continue conversation with AI using the edited message
      await continueConversation({ model, reasoningMode });
      
    } catch (error) {
      console.error('Failed to create message branch and continue:', error);
    }
  }
  
  /**
   * Navigate to next alternative for a message
   * @param {number} messageIndex - Index of message in current view
   */
  async function switchToNextAlternative(messageIndex) {
    const database = db();
    if (!database || !conversation.id) return;
    
    try {
      const message = messages[messageIndex];
      if (!message) return;
      
      // Get the base message ID (could be the message itself or its base)
      const baseMessageId = message.baseMessageId || message.id;
      
      const switched = await database.switchToNextAlternative(conversation.id, baseMessageId);
      if (switched) {
        await loadConversationMessages();
      }
    } catch (error) {
      console.error('Failed to switch to next alternative:', error);
    }
  }
  
  /**
   * Navigate to previous alternative for a message
   * @param {number} messageIndex - Index of message in current view
   */
  async function switchToPrevAlternative(messageIndex) {
    const database = db();
    if (!database || !conversation.id) return;
    
    try {
      const message = messages[messageIndex];
      if (!message) return;
      
      // Get the base message ID (could be the message itself or its base)
      const baseMessageId = message.baseMessageId || message.id;
      
      const switched = await database.switchToPrevAlternative(conversation.id, baseMessageId);
      if (switched) {
        await loadConversationMessages();
      }
    } catch (error) {
      console.error('Failed to switch to previous alternative:', error);
    }
  }
  
  /**
   * Get alternative information for a message
   * @param {number} messageIndex - Index of message in current view
   * @returns {Promise<Object>} Alternative info
   */
  async function getAlternativeInfo(messageIndex) {
    const database = db();
    if (!database || !conversation.id) return null;
    
    try {
      const message = messages[messageIndex];
      if (!message) return null;
      
      // Get the base message ID (could be the message itself or its base)
      const baseMessageId = message.baseMessageId || message.id;
      
      return await database.getAlternativeInfo(conversation.id, baseMessageId);
    } catch (error) {
      console.error('Failed to get alternative info:', error);
      return null;
    }
  }
  
  /**
   * Load conversation messages with active alternatives
   */
  async function loadConversationMessages() {
    const database = db();
    if (!database || !conversation.id) return;
    
    try {
      const msgs = await database.getConversationMessages(conversation.id);
      setMessages(msgs.map(msg => {
        // Normalize content to array format
        const content = normalizeMessageContent(msg.content);
          
        return {
          id: msg.id,
          role: msg.role,
          content,
          timestamp: msg.timestamp,
          metadata: msg.metadata,
          baseMessageId: msg.baseMessageId,
          alternativeIndex: msg.alternativeIndex
        };
      }));
    } catch (error) {
      console.error('Failed to load conversation messages:', error);
    }
  }

  return { 
    messages, 
    submitMessage, 
    conversation, 
    updateConversation, 
    deleteConversation,
    conversations, 
    loading,
    loadConversation,
    userEmail,
    // Branching functions
    createMessageBranch,
    createMessageBranchAndContinue,
    switchToNextAlternative,
    switchToPrevAlternative,
    getAlternativeInfo,
    loadConversationMessages
  };
}

