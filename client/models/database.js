import { openDB } from "idb";
import { EmbeddingService, TestEmbedder } from "./embedders.js";
import { Project, Conversation, Message, Resource } from "./models.js";

/**
 * Extract searchable text from message content array
 * @param {Array|string} content - Message content in Bedrock format
 * @returns {string} - Searchable text
 */
function extractSearchableText(content) {
  if (!content) return "";
  
  // If it's already a string, return it
  if (typeof content === 'string') return content;
  
  // If it's not an array, convert to string
  if (!Array.isArray(content)) return String(content);
  
  // Extract text from all content blocks
  const textParts = [];
  
  for (const block of content) {
    if (block.text) {
      textParts.push(block.text);
    } else if (block.toolUse && block.toolUse.name) {
      // Include tool names for searchability
      textParts.push(`Tool: ${block.toolUse.name}`);
      if (block.toolUse.input && typeof block.toolUse.input === 'object') {
        // Include tool input parameters
        const inputText = Object.values(block.toolUse.input).join(' ');
        textParts.push(inputText);
      }
    } else if (block.toolResult) {
      // Include tool results if they contain text
      if (Array.isArray(block.toolResult.content)) {
        for (const resultBlock of block.toolResult.content) {
          if (resultBlock.text) {
            textParts.push(resultBlock.text);
          }
        }
      }
    } else if (block.document && block.document.name) {
      // Include document names for searchability
      textParts.push(`Document: ${block.document.name}`);
    } else if (block.image && block.image.name) {
      // Include image names for searchability
      textParts.push(`Image: ${block.image.name}`);
    }
  }
  
  return textParts.join(' ').trim();
}

/**
 * User-scoped conversation database with vector search
 */
export class ConversationDB {
  constructor(userEmail, dbVersion = 1) {
    this.userEmail = userEmail;
    this.dbName = this.sanitizeDbName(userEmail);
    this.version = dbVersion;
    this.db = null;
    this.embeddingService = null;
    this.defaultProject = null;
  }

  /**
   * Sanitize email for use as database name
   * @param {string} email 
   * @returns {string}
   */
  sanitizeDbName(email) {
    if (!email || typeof email !== 'string') {
      throw new Error("Valid email required for database");
    }
    
    // Replace special characters with hyphens and convert to lowercase
    const sanitized = email
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/--+/g, '-')
      .replace(/^-|-$/g, '');
    
    return `arti-conv-${sanitized}`;
  }

  /**
   * Initialize database and embedding service
   * @param {BaseEmbedder} embedder - Custom embedder (defaults to TestEmbedder)
   */
  async init(embedder = new TestEmbedder()) {
    this.db = await openDB(this.dbName, this.version, {
      upgrade: this.upgradeDB.bind(this)
    });

    // Initialize embedding service
    this.embeddingService = new EmbeddingService(embedder);
    await this.loadEmbeddings();
    
    // Ensure default project exists
    await this.ensureDefaultProject();
  }

  /**
   * Database schema upgrade function
   */
  upgradeDB(db, oldVersion, newVersion) {
    // Projects store
    if (!db.objectStoreNames.contains("projects")) {
      const projectStore = db.createObjectStore("projects", { keyPath: "id" });
      projectStore.createIndex("name", "name", { unique: false });
      projectStore.createIndex("created", "created", { unique: false });
      projectStore.createIndex("isDefault", "isDefault", { unique: false });
    }

    // Conversations store
    if (!db.objectStoreNames.contains("conversations")) {
      const convStore = db.createObjectStore("conversations", { keyPath: "id" });
      convStore.createIndex("projectId", "projectId", { unique: false });
      convStore.createIndex("title", "title", { unique: false });
      convStore.createIndex("created", "created", { unique: false });
      convStore.createIndex("updated", "updated", { unique: false });
      convStore.createIndex("lastMessageAt", "lastMessageAt", { unique: false });
      convStore.createIndex("archived", "archived", { unique: false });
    }

    // Messages store
    if (!db.objectStoreNames.contains("messages")) {
      const msgStore = db.createObjectStore("messages", { keyPath: "id" });
      msgStore.createIndex("conversationId", "conversationId", { unique: false });
      msgStore.createIndex("timestamp", "timestamp", { unique: false });
      msgStore.createIndex("role", "role", { unique: false });
    }

    // Resources store
    if (!db.objectStoreNames.contains("resources")) {
      const resourceStore = db.createObjectStore("resources", { keyPath: "id" });
      resourceStore.createIndex("projectId", "projectId", { unique: false });
      resourceStore.createIndex("type", "type", { unique: false });
      resourceStore.createIndex("name", "name", { unique: false });
      resourceStore.createIndex("created", "created", { unique: false });
    }

    // Embeddings store for vector search index
    if (!db.objectStoreNames.contains("embeddings")) {
      db.createObjectStore("embeddings");
    }
  }

  /**
   * Ensure default project exists for this user
   */
  async ensureDefaultProject() {
    // Get all projects and find the default one
    const allProjects = await this.db.getAll("projects");
    const existing = allProjects.filter(p => p.isDefault === true);
    
    if (existing.length === 0) {
      this.defaultProject = new Project({
        name: "Default Project",
        description: "Default project for conversations",
        isDefault: true,
        context: {
          systemPrompt: "You are Claude, a helpful AI assistant created by Anthropic.",
          files: [],
          customText: ""
        }
      });
      
      await this.db.add("projects", this.defaultProject.toJSON());
    } else {
      this.defaultProject = Project.fromJSON(existing[0]);
    }
  }

  /**
   * Get default project for conversations without explicit project
   * @returns {Project}
   */
  getDefaultProject() {
    return this.defaultProject;
  }

  // ===== PROJECT METHODS =====

  /**
   * Create a new project
   * @param {object} projectData 
   * @returns {Promise<Project>}
   */
  async createProject(projectData) {
    const project = new Project(projectData);
    await this.db.add("projects", project.toJSON());
    return project;
  }

  /**
   * Get project by ID
   * @param {string} id 
   * @returns {Promise<Project|null>}
   */
  async getProject(id) {
    const data = await this.db.get("projects", id);
    return data ? Project.fromJSON(data) : null;
  }

  /**
   * Get all projects for user
   * @returns {Promise<Project[]>}
   */
  async getProjects() {
    const data = await this.db.getAll("projects");
    return data.map(d => Project.fromJSON(d));
  }

  /**
   * Update project
   * @param {string} id 
   * @param {object} updates 
   * @returns {Promise<Project>}
   */
  async updateProject(id, updates) {
    const existing = await this.getProject(id);
    if (!existing) throw new Error(`Project ${id} not found`);
    
    existing.update(updates);
    await this.db.put("projects", existing.toJSON());
    return existing;
  }

  /**
   * Delete project and all its conversations
   * @param {string} id 
   */
  async deleteProject(id) {
    const project = await this.getProject(id);
    if (!project) return;
    
    if (project.isDefault) {
      throw new Error("Cannot delete default project");
    }
    
    // Delete all conversations in project
    const conversations = await this.getConversationsByProject(id);
    for (const conv of conversations) {
      await this.deleteConversation(conv.id);
    }
    
    // Delete all resources in project  
    const resources = await this.getResourcesByProject(id);
    for (const resource of resources) {
      await this.deleteResource(resource.id);
    }
    
    await this.db.delete("projects", id);
  }

  // ===== CONVERSATION METHODS =====

  /**
   * Create new conversation
   * @param {object} conversationData 
   * @returns {Promise<Conversation>}
   */
  async createConversation(conversationData = {}) {
    // Use default project if no project specified
    if (!conversationData.projectId) {
      conversationData.projectId = this.defaultProject.id;
    }
    
    const conversation = new Conversation(conversationData);
    await this.db.add("conversations", conversation.toJSON());
    
    // Add to embeddings for search
    if (conversation.title) {
      await this.embeddingService.add(
        `conv:${conversation.id}`,
        conversation.title,
        { type: "conversation", id: conversation.id, projectId: conversation.projectId }
      );
      await this.saveEmbeddings();
    }
    
    return conversation;
  }

  /**
   * Get conversation by ID
   * @param {string} id 
   * @returns {Promise<Conversation|null>}
   */
  async getConversation(id) {
    const data = await this.db.get("conversations", id);
    return data ? Conversation.fromJSON(data) : null;
  }

  /**
   * Get conversations by project
   * @param {string} projectId 
   * @returns {Promise<Conversation[]>}
   */
  async getConversationsByProject(projectId) {
    const data = await this.db.getAllFromIndex("conversations", "projectId", projectId);
    return data.map(d => Conversation.fromJSON(d)).sort((a, b) => 
      new Date(b.lastMessageAt) - new Date(a.lastMessageAt)
    );
  }

  /**
   * Get recent conversations across all projects
   * @param {number} limit 
   * @returns {Promise<Conversation[]>}
   */
  async getRecentConversations(limit = 20) {
    const data = await this.db.getAll("conversations");
    return data
      .map(d => Conversation.fromJSON(d))
      .filter(c => !c.archived)
      .sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt))
      .slice(0, limit);
  }

  /**
   * Update conversation
   * @param {string} id 
   * @param {object} updates 
   * @returns {Promise<Conversation>}
   */
  async updateConversation(id, updates) {
    const existing = await this.getConversation(id);
    if (!existing) throw new Error(`Conversation ${id} not found`);
    
    existing.update(updates);
    await this.db.put("conversations", existing.toJSON());
    
    // Update embeddings if title changed
    if (updates.title) {
      await this.embeddingService.add(
        `conv:${id}`,
        existing.title,
        { type: "conversation", id, projectId: existing.projectId }
      );
      await this.saveEmbeddings();
    }
    
    return existing;
  }

  /**
   * Delete conversation and all messages
   * @param {string} id 
   */
  async deleteConversation(id) {
    // Delete all messages
    const messages = await this.getMessages(id);
    for (const msg of messages) {
      await this.deleteMessage(msg.id);
    }
    
    await this.db.delete("conversations", id);
    
    // Remove from embeddings
    this.embeddingService.remove(`conv:${id}`);
    await this.saveEmbeddings();
  }

  // ===== MESSAGE METHODS =====

  /**
   * Add message to conversation
   * @param {string} conversationId 
   * @param {object} messageData 
   * @returns {Promise<Message>}
   */
  async addMessage(conversationId, messageData) {
    const message = new Message({
      ...messageData,
      conversationId
    });
    
    await this.db.add("messages", message.toJSON());
    
    // Update conversation counts
    const conversation = await this.getConversation(conversationId);
    if (conversation) {
      conversation.addMessage();
      await this.db.put("conversations", conversation.toJSON());
    }
    
    // Add to embeddings for search
    const searchableText = extractSearchableText(message.content);
    if (searchableText) {
      await this.embeddingService.add(
        `msg:${message.id}`,
        searchableText,
        { 
          type: "message", 
          id: message.id, 
          conversationId, 
          role: message.role,
          timestamp: message.timestamp
        }
      );
      await this.saveEmbeddings();
    }
    
    return message;
  }

  /**
   * Get messages for conversation
   * @param {string} conversationId 
   * @returns {Promise<Message[]>}
   */
  async getMessages(conversationId) {
    const data = await this.db.getAllFromIndex("messages", "conversationId", conversationId);
    return data.map(d => Message.fromJSON(d)).sort((a, b) => 
      new Date(a.timestamp) - new Date(b.timestamp)
    );
  }

  /**
   * Update message
   * @param {string} id 
   * @param {object} updates 
   * @returns {Promise<Message>}
   */
  async updateMessage(id, updates) {
    const existing = await this.db.get("messages", id);
    if (!existing) throw new Error(`Message ${id} not found`);
    
    const message = Message.fromJSON(existing);
    message.update(updates);
    await this.db.put("messages", message.toJSON());
    
    // Update embeddings if content changed
    if (updates.content) {
      const searchableText = extractSearchableText(message.content);
      if (searchableText) {
        await this.embeddingService.add(
          `msg:${id}`,
          searchableText,
          { 
            type: "message", 
            id, 
            conversationId: message.conversationId, 
            role: message.role,
            timestamp: message.timestamp
          }
        );
        await this.saveEmbeddings();
      }
    }
    
    return message;
  }

  /**
   * Delete message
   * @param {string} id 
   */
  async deleteMessage(id) {
    await this.db.delete("messages", id);
    this.embeddingService.remove(`msg:${id}`);
    await this.saveEmbeddings();
  }

  // ===== RESOURCE METHODS =====

  /**
   * Add resource to project
   * @param {string} projectId 
   * @param {object} resourceData 
   * @returns {Promise<Resource>}
   */
  async addResource(projectId, resourceData) {
    const resource = new Resource({
      ...resourceData,
      projectId
    });
    
    await this.db.add("resources", resource.toJSON());
    
    // Add to embeddings for search
    const searchText = resource.getSearchableText();
    if (searchText) {
      await this.embeddingService.add(
        `res:${resource.id}`,
        searchText,
        { 
          type: "resource", 
          id: resource.id, 
          projectId, 
          name: resource.name,
          resourceType: resource.type
        }
      );
      await this.saveEmbeddings();
    }
    
    return resource;
  }

  /**
   * Get resources by project
   * @param {string} projectId 
   * @returns {Promise<Resource[]>}
   */
  async getResourcesByProject(projectId) {
    const data = await this.db.getAllFromIndex("resources", "projectId", projectId);
    return data.map(d => Resource.fromJSON(d));
  }

  /**
   * Delete resource
   * @param {string} id 
   */
  async deleteResource(id) {
    await this.db.delete("resources", id);
    this.embeddingService.remove(`res:${id}`);
    await this.saveEmbeddings();
  }

  // ===== SEARCH & EMBEDDING METHODS =====

  /**
   * Vector search across all content
   * @param {string} query 
   * @param {number} limit 
   * @param {string[]} types - Filter by content types
   * @returns {Promise<Array>}
   */
  async search(query, limit = 20, types = null) {
    if (!this.embeddingService) {
      throw new Error("Embedding service not initialized");
    }

    const results = await this.embeddingService.search(query, limit);
    
    // Filter by type if specified
    let filteredResults = results;
    if (types && Array.isArray(types)) {
      filteredResults = results.filter(r => types.includes(r.metadata?.type));
    }

    return filteredResults;
  }

  /**
   * Regenerate all embeddings
   */
  async embed() {
    if (!this.embeddingService) {
      throw new Error("Embedding service not initialized");
    }

    console.log("Regenerating embeddings for user:", this.userEmail);
    
    // Clear existing embeddings
    this.embeddingService = new EmbeddingService(this.embeddingService.embedder);

    // Re-embed all conversations
    const conversations = await this.db.getAll("conversations");
    for (const convData of conversations) {
      const conv = Conversation.fromJSON(convData);
      if (conv.title) {
        await this.embeddingService.add(
          `conv:${conv.id}`,
          conv.title,
          { type: "conversation", id: conv.id, projectId: conv.projectId }
        );
      }
    }

    // Re-embed all messages  
    const messages = await this.db.getAll("messages");
    for (const msgData of messages) {
      const msg = Message.fromJSON(msgData);
      const searchableText = extractSearchableText(msg.content);
      if (searchableText) {
        await this.embeddingService.add(
          `msg:${msg.id}`,
          searchableText,
          { 
            type: "message", 
            id: msg.id, 
            conversationId: msg.conversationId, 
            role: msg.role,
            timestamp: msg.timestamp
          }
        );
      }
    }

    // Re-embed all resources
    const resources = await this.db.getAll("resources");
    for (const resData of resources) {
      const resource = Resource.fromJSON(resData);
      const searchText = resource.getSearchableText();
      if (searchText) {
        await this.embeddingService.add(
          `res:${resource.id}`,
          searchText,
          { 
            type: "resource", 
            id: resource.id, 
            projectId: resource.projectId, 
            name: resource.name,
            resourceType: resource.type
          }
        );
      }
    }

    await this.saveEmbeddings();
    console.log(`Regenerated ${this.embeddingService.hnsw.elementCount} embeddings`);
  }

  /**
   * Load embeddings from storage
   */
  async loadEmbeddings() {
    if (!this.db || !this.embeddingService) return;

    try {
      const data = await this.db.get("embeddings", "service");
      if (data) {
        // Preserve the current embedder instance when restoring
        const currentEmbedder = this.embeddingService.embedder;
        this.embeddingService = EmbeddingService.fromJSON(data, currentEmbedder);
      }
    } catch (error) {
      console.warn("Could not load embeddings:", error);
    }
  }

  /**
   * Save embeddings to storage
   */
  async saveEmbeddings() {
    if (!this.db || !this.embeddingService) return;

    try {
      await this.db.put("embeddings", this.embeddingService.toJSON(), "service");
    } catch (error) {
      console.error("Could not save embeddings:", error);
    }
  }

  /**
   * Close database connection
   */
  async close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

/**
 * Database factory for user-scoped instances
 */
class ConversationDBFactory {
  constructor() {
    this.instances = new Map();
  }

  /**
   * Get or create database instance for user
   * @param {string} userEmail 
   * @param {BaseEmbedder} embedder 
   * @returns {Promise<ConversationDB>}
   */
  async getDB(userEmail, embedder = null) {
    if (!userEmail) {
      throw new Error("User email required");
    }

    if (!this.instances.has(userEmail)) {
      const db = new ConversationDB(userEmail);
      await db.init(embedder);
      this.instances.set(userEmail, db);
    }

    return this.instances.get(userEmail);
  }

  /**
   * Close and remove database instance
   * @param {string} userEmail 
   */
  async closeDB(userEmail) {
    const db = this.instances.get(userEmail);
    if (db) {
      await db.close();
      this.instances.delete(userEmail);
    }
  }

  /**
   * Close all database instances
   */
  async closeAll() {
    for (const [email, db] of this.instances) {
      await db.close();
    }
    this.instances.clear();
  }
}

// Singleton factory instance
export const dbFactory = new ConversationDBFactory();

/**
 * Convenience function to get database for current user
 * @param {string} userEmail 
 * @param {BaseEmbedder} embedder 
 * @returns {Promise<ConversationDB>}
 */
export async function getDB(userEmail, embedder = null) {
  return await dbFactory.getDB(userEmail, embedder);
}