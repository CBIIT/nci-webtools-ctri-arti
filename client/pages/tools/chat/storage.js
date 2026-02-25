import { openDB, deleteDB } from 'idb';

/**
 * Simplified chat storage using IndexedDB with auto-increment numeric IDs
 * for all tables. Provides a clean CRUD interface without complex abstractions.
 */
export class ChatStorage {
  constructor(userEmail) {
    if (!userEmail || typeof userEmail !== 'string') {
      throw new Error('Valid email required for ChatStorage');
    }
    
    this.userEmail = userEmail;
    this.dbName = `arti-chat-${this.sanitizeEmail(userEmail)}`;
    this.db = null;
  }
  
  /**
   * Sanitize email for use in database name
   */
  sanitizeEmail(email) {
    return email
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/--+/g, '-')
      .replace(/^-|-$/g, '');
  }
  
  /**
   * Initialize the database with schema and default projects
   */
  async init() {
    this.db = await openDB(this.dbName, 1, {
      upgrade: this.upgradeDatabase.bind(this)
    });
    
    await this.ensureDefaultProjects();
    return this;
  }
  
  /**
   * Define database schema with auto-increment IDs for all tables
   */
  upgradeDatabase(db) {
    // Projects table with auto-increment ID
    if (!db.objectStoreNames.contains('projects')) {
      const projectStore = db.createObjectStore('projects', { 
        keyPath: 'id', 
        autoIncrement: true 
      });
      projectStore.createIndex('name', 'name', { unique: true });
      projectStore.createIndex('isDefault', 'isDefault');
    }
    
    // Conversations table with auto-increment ID
    if (!db.objectStoreNames.contains('conversations')) {
      const convStore = db.createObjectStore('conversations', { 
        keyPath: 'id', 
        autoIncrement: true 
      });
      convStore.createIndex('projectId', 'projectId');
      convStore.createIndex('updated', 'updated');
      convStore.createIndex('title', 'title');
    }
    
    // Messages table with auto-increment ID
    if (!db.objectStoreNames.contains('messages')) {
      const msgStore = db.createObjectStore('messages', { 
        keyPath: 'id', 
        autoIncrement: true 
      });
      msgStore.createIndex('conversationId', 'conversationId');
      msgStore.createIndex('timestamp', 'timestamp');
      msgStore.createIndex('role', 'role');
    }
    
    // Resources table with auto-increment ID
    if (!db.objectStoreNames.contains('resources')) {
      const resourceStore = db.createObjectStore('resources', { 
        keyPath: 'id', 
        autoIncrement: true 
      });
      resourceStore.createIndex('projectId', 'projectId');
      resourceStore.createIndex('type', 'type');
      resourceStore.createIndex('name', 'name');
    }
  }
  
  /**
   * Ensure default projects exist
   */
  async ensureDefaultProjects() {
    const projects = await this.db.getAll('projects');
    
    if (projects.length === 0) {
      // Create Default project
      await this.db.add('projects', {
        name: 'Default',
        description: 'Default project for general conversations',
        isDefault: true,
        created: new Date().toISOString(),
        context: {
          systemPrompt: 'You are Claude, a helpful AI assistant created by Anthropic.',
          files: [],
          customText: ''
        }
      });
      
      // Create FedPulse project
      await this.db.add('projects', {
        name: 'FedPulse',
        description: 'FedPulse project for U.S. federal website searches',
        isDefault: false,
        created: new Date().toISOString(),
        context: {
          systemPrompt: 'You are Claude, specialized in searching U.S. federal websites for policies, guidelines, executive orders, and other official content.',
          files: [],
          customText: ''
        }
      });
    }
  }
  
  // ============= PROJECT METHODS =============
  
  /**
   * Get the default project
   */
  async getDefaultProject() {
    const allProjects = await this.db.getAll('projects');
    return allProjects.find(p => p.isDefault === true);
  }
  
  /**
   * Get project by name
   */
  async getProjectByName(name) {
    try {
      const projects = await this.db.getAllFromIndex('projects', 'name', name);
      return projects[0];
    } catch (error) {
      // Fallback to manual search if index query fails
      const allProjects = await this.db.getAll('projects');
      return allProjects.find(p => p.name === name);
    }
  }
  
  /**
   * List all projects
   */
  async listProjects() {
    return await this.db.getAll('projects');
  }
  
  /**
   * Get project by ID
   */
  async getProject(id) {
    return await this.db.get('projects', id);
  }
  
  // ============= CONVERSATION METHODS =============
  
  /**
   * Save a new conversation
   */
  async saveConversation(conversation) {
    const now = new Date().toISOString();
    return await this.db.add('conversations', {
      ...conversation,
      messageCount: conversation.messageCount || 0,
      created: now,
      updated: now,
      lastMessageAt: conversation.lastMessageAt || null
    });
  }
  
  /**
   * Get conversation by ID
   */
  async getConversation(id) {
    return await this.db.get('conversations', id);
  }
  
  /**
   * Update conversation
   */
  async updateConversation(id, updates) {
    const conversation = await this.db.get('conversations', id);
    if (!conversation) {
      throw new Error(`Conversation ${id} not found`);
    }
    
    const updated = {
      ...conversation,
      ...updates,
      updated: new Date().toISOString()
    };
    
    return await this.db.put('conversations', updated);
  }
  
  /**
   * List conversations, optionally filtered by project
   */
  async listConversations(projectId) {
    if (projectId) {
      return await this.db.getAllFromIndex('conversations', 'projectId', projectId);
    }
    return await this.db.getAll('conversations');
  }
  
  /**
   * Delete conversation and all its messages
   */
  async deleteConversation(id) {
    const tx = this.db.transaction(['conversations', 'messages'], 'readwrite');
    
    // Delete all messages for this conversation
    const messageIds = await tx.objectStore('messages').index('conversationId').getAllKeys(id);
    for (const messageId of messageIds) {
      await tx.objectStore('messages').delete(messageId);
    }
    
    // Delete the conversation
    await tx.objectStore('conversations').delete(id);
    
    await tx.done;
  }
  
  // ============= MESSAGE METHODS =============
  
  /**
   * Add a message to a conversation
   * Automatically updates conversation metadata
   */
  async addMessage(conversationId, message) {
    const tx = this.db.transaction(['messages', 'conversations'], 'readwrite');
    
    // Add the message
    const messageId = await tx.objectStore('messages').add({
      ...message,
      conversationId,
      timestamp: new Date().toISOString()
    });
    
    // Update conversation metadata
    const conversation = await tx.objectStore('conversations').get(conversationId);
    if (conversation) {
      const now = new Date().toISOString();
      conversation.messageCount = (conversation.messageCount || 0) + 1;
      conversation.lastMessageAt = now;
      conversation.updated = now;
      await tx.objectStore('conversations').put(conversation);
    }
    
    await tx.done;
    return messageId;
  }
  
  /**
   * Get all messages for a conversation
   */
  async getMessages(conversationId) {
    return await this.db.getAllFromIndex('messages', 'conversationId', conversationId);
  }
  
  /**
   * Update a message
   */
  async updateMessage(id, updates) {
    const message = await this.db.get('messages', id);
    if (!message) {
      throw new Error(`Message ${id} not found`);
    }
    
    const updated = {
      ...message,
      ...updates
    };
    
    return await this.db.put('messages', updated);
  }
  
  /**
   * Delete a message
   */
  async deleteMessage(id) {
    const message = await this.db.get('messages', id);
    if (!message) {
      throw new Error(`Message ${id} not found`);
    }
    
    const tx = this.db.transaction(['messages', 'conversations'], 'readwrite');
    
    // Delete the message
    await tx.objectStore('messages').delete(id);
    
    // Update conversation message count
    const conversation = await tx.objectStore('conversations').get(message.conversationId);
    if (conversation && conversation.messageCount > 0) {
      conversation.messageCount -= 1;
      conversation.updated = new Date().toISOString();
      await tx.objectStore('conversations').put(conversation);
    }
    
    await tx.done;
  }
  
  // ============= RESOURCE METHODS =============
  
  /**
   * Add a resource to a project
   */
  async addResource(resource) {
    return await this.db.add('resources', {
      ...resource,
      created: new Date().toISOString()
    });
  }
  
  /**
   * Get resources for a project
   */
  async getResources(projectId) {
    return await this.db.getAllFromIndex('resources', 'projectId', projectId);
  }
  
  /**
   * Get resource by ID
   */
  async getResource(id) {
    return await this.db.get('resources', id);
  }
  
  /**
   * Delete a resource
   */
  async deleteResource(id) {
    return await this.db.delete('resources', id);
  }
  
  // ============= UTILITY METHODS =============
  
  /**
   * Close the database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
  
  /**
   * Delete the entire database
   */
  async deleteDatabase() {
    this.close();
    await deleteDB(this.dbName);
  }
  
  /**
   * Get database statistics
   */
  async getStats() {
    const [projects, conversations, messages, resources] = await Promise.all([
      this.db.count('projects'),
      this.db.count('conversations'),
      this.db.count('messages'),
      this.db.count('resources')
    ]);
    
    return {
      projects,
      conversations,
      messages,
      resources,
      dbName: this.dbName,
      userEmail: this.userEmail
    };
  }
}