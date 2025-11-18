import { MODEL_OPTIONS } from "./model-options.js";

/**
 * Base model class with common functionality
 */
export class BaseModel {
  constructor(data = {}) {
    this.id = data.id || this.generateId();
    this.created = data.created || new Date().toISOString();
    this.updated = data.updated || new Date().toISOString();
    Object.assign(this, data);
  }

  /**
   * Generate unique ID
   * @returns {string}
   */
  generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Update model with new data
   * @param {object} data
   */
  update(data) {
    Object.assign(this, data);
    this.updated = new Date().toISOString();
  }

  /**
   * Convert to JSON for storage
   * @returns {object}
   */
  toJSON() {
    return { ...this };
  }

  /**
   * Create instance from stored data
   * @param {object} data
   * @returns {BaseModel}
   */
  static fromJSON(data) {
    return new this(data);
  }
}

/**
 * Project model - Collections of conversations with custom context
 */
export class Project extends BaseModel {
  constructor(data = {}) {
    super(data);
    this.name = data.name || "Untitled Project";
    this.description = data.description || "";
    this.isDefault = data.isDefault || false;

    // Custom context for all conversations in this project
    this.context = data.context || {
      systemPrompt: "",
      files: [], // Array of resource IDs
      customText: "",
    };

    // Flexible API configuration
    this.apiConfig = data.apiConfig || {
      baseUrl: "/api/model", // Default to local API
      method: "POST",
      headers: {},
      // Template variables that can be used in requests
      variables: {},
    };

    // MCP server configuration
    this.mcpConfig = data.mcpConfig || {
      enabled: false,
      endpoint: "",
      tools: [],
    };

    // Project settings
    this.settings = data.settings || {
      model: MODEL_OPTIONS.AWS_BEDROCK.SONNET.v4_5,
      temperature: 0.7,
      maxContextLength: 100000,
    };
  }
}

/**
 * Conversation model - Individual chat sessions
 */
export class Conversation extends BaseModel {
  constructor(data = {}) {
    super(data);
    this.projectId = data.projectId || "1";
    this.title = data.title || "";
    this.summary = data.summary || "";
    this.messageCount = data.messageCount || 0;
    this.lastMessageAt = data.lastMessageAt || this.created;

    // Conversation-specific overrides
    this.settings = data.settings || {};

    // Metadata for search/organization
    this.tags = data.tags || [];
    this.archived = data.archived || false;
    this.starred = data.starred || false;
  }

  /**
   * Update last message timestamp and increment count
   */
  addMessage() {
    this.messageCount++;
    this.lastMessageAt = new Date().toISOString();
    this.updated = this.lastMessageAt;
  }
}

/**
 * Message model - Individual messages in conversations
 */
export class Message extends BaseModel {
  constructor(data = {}) {
    super(data);
    this.conversationId = data.conversationId;
    this.role = data.role; // "user", "assistant", "system"
    // Content should be Bedrock-compatible array format: [{ text: "..." }, { toolUse: {...} }]
    this.content = data.content || [];
    this.timestamp = data.timestamp || new Date().toISOString();

    // Message metadata
    this.metadata = data.metadata || {
      model: null,
      usage: null, // token usage stats
      toolUses: [], // tools called in this message
      error: null,
    };

    // For assistant messages with tool use
    this.toolResults = data.toolResults || [];

    // Message state
    this.isStreaming = data.isStreaming || false;
    this.isComplete = data.isComplete !== undefined ? data.isComplete : true;
  }
}

/**
 * Resource model - Files, documents, custom text for projects
 */
export class Resource extends BaseModel {
  constructor(data = {}) {
    super(data);
    this.projectId = data.projectId;
    this.name = data.name;
    this.type = data.type; // "file", "url", "text", "document"
    this.mimeType = data.mimeType || "";
    this.size = data.size || 0;

    // Resource content (stored separately for large files)
    this.content = data.content || "";
    this.contentId = data.contentId || null; // Reference to blob storage

    // Metadata
    this.metadata = data.metadata || {
      originalName: "",
      uploadedAt: this.created,
      extractedText: "", // For documents/PDFs
      summary: "",
    };

    // Organization
    this.tags = data.tags || [];
    this.folder = data.folder || "";
  }

  /**
   * Check if resource has extractable text content
   * @returns {boolean}
   */
  hasTextContent() {
    return !!(this.content || this.metadata.extractedText);
  }

  /**
   * Get searchable text for this resource
   * @returns {string}
   */
  getSearchableText() {
    return [
      this.name,
      this.content,
      this.metadata.extractedText,
      this.metadata.summary,
      this.tags.join(" "),
    ]
      .filter(Boolean)
      .join(" ");
  }
}
