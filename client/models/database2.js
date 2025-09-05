/**
 * Simple, KISS approach to user-scoped database with project-based storage
 */
import { openDB, deleteDB } from "idb";
import { DEFAULT_PROJECTS } from "./seed-data.js";

/**
 * User-scoped database with project-based storage
 */
export class Database2 {
  /**
   * Create a new database instance
   * @param {string} userEmail - User's email for database naming
   * @param {number} dbVersion - Database schema version
   */
  constructor(userEmail, dbVersion = 2) {
    if (!userEmail || typeof userEmail !== "string") {
      throw new Error("Valid email required for database");
    }

    this.userEmail = userEmail;
    this.dbName = this.sanitizeDbName(userEmail);
    this.version = dbVersion;
    this.db = null;
  }

  /**
   * Sanitize email for use as database name
   */
  sanitizeDbName(email) {
    return `arti-conv-${email
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/--+/g, "-")
      .replace(/^-|-$/g, "")}`;
  }

  /**
   * Initialize database connection and schema
   */
  async init() {
    this.db = await openDB(this.dbName, this.version, {
      upgrade: async (db, oldVersion, newVersion, transaction) =>
        await this.upgradeSchema(db, oldVersion, newVersion, transaction),
    });

    await this.ensureDefaultProjects();
    return this;
  }

  /**
   * Close database connection
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
  async delete() {
    await this.close();
    await deleteDB(this.dbName);
  }

  /**
   * Database schema setup and migration
   */
  async upgradeSchema(db, oldVersion, newVersion, transaction) {
    console.log(`Upgrading database from version ${oldVersion} to ${newVersion}`);

    // Store definitions used for both migration and fresh install
    const storeConfigs = {
      projects: {
        keyPath: "id",
        autoIncrement: true,
        indexes: ["title", "createdAt", "isDefault"],
      },
      conversations: {
        keyPath: "id",
        autoIncrement: true,
        indexes: ["projectId", "title", "createdAt", "updatedAt"],
      },
      messages: {
        keyPath: "id",
        autoIncrement: true,
        indexes: ["conversationId", "createdAt", "role"],
      },
      resources: {
        keyPath: "id",
        autoIncrement: true,
        indexes: ["projectId", "conversationId", "type", "key"],
      },
    };

    // Migration from v1 to v2
    if (oldVersion === 1) {
      console.log("Migrating from database.js (v1) to database2.js (v2)");

      // 1. Read old data FIRST using the transaction
      let oldConversations = [];
      let oldMessages = [];

      try {
        if (db.objectStoreNames.contains("conversations")) {
          oldConversations = await transaction.objectStore("conversations").getAll();
          console.log(`Found ${oldConversations.length} conversations to migrate`);
        }

        if (db.objectStoreNames.contains("messages")) {
          oldMessages = await transaction.objectStore("messages").getAll();
          console.log(`Found ${oldMessages.length} messages to migrate`);
        }

        // 2. Delete old stores (they have string IDs)
        ["projects", "conversations", "messages", "resources", "embeddings"].forEach((name) => {
          if (db.objectStoreNames.contains(name)) {
            console.log(`Deleting old store: ${name}`);
            db.deleteObjectStore(name);
          }
        });

        // 3. Create new stores with numeric auto-increment IDs and SAVE REFERENCES
        const storeObjects = {};
        for (const [name, config] of Object.entries(storeConfigs)) {
          const store = db.createObjectStore(name, {
            keyPath: config.keyPath,
            autoIncrement: config.autoIncrement,
          });
          storeObjects[name] = store;

          config.indexes.forEach((index) => store.createIndex(index, index, { unique: false }));
        }

        // 4. Migrate data using the STORE REFERENCES
        if (oldConversations.length > 0 || oldMessages.length > 0) {
          const convStore = storeObjects.conversations;
          const msgStore = storeObjects.messages;
          const convMap = new Map(); // Maps old string IDs to new numeric IDs

          // First migrate conversations (all to project 1)
          for (const oldConv of oldConversations) {
            try {
              const now = new Date().toISOString();
              const newId = await convStore.add({
                projectId: 1, // All conversations go to default project
                title: oldConv.title || "Untitled",
                summary: oldConv.summary || "",
                message: "",
                model: "us.anthropic.claude-sonnet-4-20250514-v1:0",
                createdAt: oldConv.created || oldConv.createdAt || now,
                updatedAt: oldConv.updated || oldConv.updatedAt || now,
              });

              convMap.set(oldConv.id, newId);
            } catch (error) {
              console.error(`Error migrating conversation ${oldConv.id}:`, error);
            }
          }

          // Then migrate messages with mapped conversation IDs
          for (const oldMsg of oldMessages) {
            try {
              const newConvId = convMap.get(oldMsg.conversationId);
              if (newConvId) {
                const now = new Date().toISOString();
                await msgStore.add({
                  conversationId: newConvId,
                  role: oldMsg.role,
                  content: oldMsg.content, // Keep as-is
                  metadata: oldMsg.metadata || {},
                  createdAt: oldMsg.created || oldMsg.timestamp || now,
                  updatedAt: oldMsg.updated || oldMsg.timestamp || now,
                });
              }
            } catch (error) {
              console.error(
                `Error migrating message for conversation ${oldMsg.conversationId}:`,
                error
              );
            }
          }

          console.log(
            `Migration completed: ${convMap.size} conversations and ${oldMessages.length} messages processed`
          );
        }
      } catch (error) {
        console.error("Error during migration:", error);
      }
    }
    // Fresh install (oldVersion === 0)
    else if (oldVersion === 0) {
      console.log("Fresh install, creating stores");
      // Create stores for new database
      for (const [name, config] of Object.entries(storeConfigs)) {
        const store = db.createObjectStore(name, {
          keyPath: config.keyPath,
          autoIncrement: config.autoIncrement,
        });
        config.indexes.forEach((index) => store.createIndex(index, index, { unique: false }));
      }
    }
  }

  /**
   * Ensure default projects exist in the database
   */
  async ensureDefaultProjects() {
    const tx = this.db.transaction("projects", "readwrite");
    const store = tx.objectStore("projects");

    for (const projectData of DEFAULT_PROJECTS) {
      const existingProject = await store.get(projectData.id);

      if (!existingProject) {
        const now = new Date().toISOString();
        await store.put({
          ...projectData,
          createdAt: now,
          updatedAt: now,
        });
        console.log(`Created default project: ${projectData.title} with ID ${projectData.id}`);
      }
    }

    await tx.done;
  }

  // Project methods

  async getProject(id) {
    return await this.db.get("projects", Number(id));
  }

  async getProjects() {
    return await this.db.getAll("projects");
  }

  async addProject(data) {
    const now = new Date().toISOString();
    const project = {
      title: data.title || "Untitled Project",
      summary: data.summary || "",
      system: data.system || "",
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    };

    const id = await this.db.add("projects", project);
    return await this.getProject(id);
  }

  async updateProject(id, data) {
    const project = await this.getProject(id);
    if (!project) throw new Error(`Project ${id} not found`);

    if (project.isDefault && "isDefault" in data) {
      throw new Error("Cannot change isDefault status of default projects");
    }

    const updatedProject = {
      ...project,
      ...data,
      updatedAt: new Date().toISOString(),
    };

    await this.db.put("projects", updatedProject);
    return updatedProject;
  }

  async deleteProject(id) {
    const numId = Number(id);
    const project = await this.getProject(numId);
    if (!project) return false;

    if (project.isDefault) {
      throw new Error("Cannot delete default projects");
    }

    // Get all conversations
    const conversations = await this.db.getAllFromIndex("conversations", "projectId", numId);

    // Delete all conversations (which also deletes their messages and resources)
    await Promise.all(conversations.map((c) => this.deleteConversation(c.id)));

    // Get project-level resources
    const resources = await this.db.getAllFromIndex("resources", "projectId", numId);
    const projectLevelResources = resources.filter((r) => r.conversationId === null);

    // Delete resources and project in parallel
    await Promise.all(
      projectLevelResources
        .map((r) => this.db.delete("resources", r.id))
        .concat([this.db.delete("projects", numId)])
    );

    return true;
  }

  // Conversation methods

  async getConversation(id) {
    return await this.db.get("conversations", Number(id));
  }

  async getConversations(projectId) {
    return await this.db.getAllFromIndex("conversations", "projectId", projectId);
  }

  async getAllConversations(limit = 20) {
    const conversations = await this.db.getAll("conversations");
    conversations.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    return conversations.slice(0, limit);
  }

  async addConversation(projectId, data = {}) {
    // Check if project exists (keep this validation for error consistency)
    const project = await this.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);

    const now = new Date().toISOString();
    const conversation = {
      projectId,
      title: data.title || "New Conversation",
      summary: data.summary || "",
      message: data.message || "",
      model: data.model || "us.anthropic.claude-sonnet-4-20250514-v1:0",
      createdAt: now,
      updatedAt: now,
    };

    const id = await this.db.add("conversations", conversation);
    return await this.getConversation(id);
  }

  async updateConversation(id, data) {
    const conversation = await this.getConversation(id);
    if (!conversation) throw new Error(`Conversation ${id} not found`);

    const updatedConversation = {
      ...conversation,
      ...data,
      updatedAt: new Date().toISOString(),
    };

    await this.db.put("conversations", updatedConversation);
    return updatedConversation;
  }

  async deleteConversation(id) {
    const numId = Number(id);
    const conversation = await this.getConversation(numId);
    if (!conversation) return false;

    // Get all related data
    const [messages, resources] = await Promise.all([
      this.db.getAllFromIndex("messages", "conversationId", numId),
      this.db.getAllFromIndex("resources", "conversationId", numId),
    ]);

    // Delete everything in parallel
    await Promise.all(
      messages
        .map((m) => this.db.delete("messages", m.id))
        .concat(resources.map((r) => this.db.delete("resources", r.id)))
        .concat([this.db.delete("conversations", numId)])
    );

    return true;
  }

  // Message methods

  async getMessage(id) {
    return await this.db.get("messages", Number(id));
  }

  async getMessages(conversationId) {
    const messages = await this.db.getAllFromIndex("messages", "conversationId", conversationId);
    messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    return messages;
  }

  async addMessage(conversationId, data) {
    // Check if conversation exists (keep this validation for error consistency)
    const conversation = await this.getConversation(conversationId);
    if (!conversation) throw new Error(`Conversation ${conversationId} not found`);

    const now = new Date().toISOString();
    const message = {
      conversationId,
      role: data.role || "user",
      content: data.content || [],
      metadata: data.metadata || {},
      createdAt: now,
      updatedAt: now,
    };

    const id = await this.db.add("messages", message);

    // Update conversation's updatedAt and save user messages as draft
    await this.updateConversation(conversationId, {
      updatedAt: now,
      ...(message.role === "user" ? { message: JSON.stringify(message.content) } : {}),
    });

    return await this.getMessage(id);
  }

  async updateMessage(id, data) {
    const message = await this.getMessage(id);
    if (!message) throw new Error(`Message ${id} not found`);

    const updatedMessage = {
      ...message,
      ...data,
      updatedAt: new Date().toISOString(),
    };

    await this.db.put("messages", updatedMessage);
    return updatedMessage;
  }

  async deleteMessage(id) {
    const numId = Number(id);
    const message = await this.getMessage(numId);
    if (!message) return false;

    await this.db.delete("messages", numId);
    return true;
  }

  // Resource methods

  async getResource(id) {
    return await this.db.get("resources", Number(id));
  }

  async getResources(projectId, conversationId = null) {
    if (conversationId !== null) {
      return await this.db.getAllFromIndex("resources", "conversationId", conversationId);
    }

    const allProjectResources = await this.db.getAllFromIndex("resources", "projectId", projectId);
    return allProjectResources.filter((resource) => resource.conversationId === null);
  }

  async getResourcesByType(projectId, type) {
    const resources = await this.db.getAllFromIndex("resources", "projectId", projectId);
    return resources.filter((resource) => resource.type === type);
  }

  async addResource(projectId, data, conversationId = null) {
    // Check if project exists (keep this validation for error consistency)
    const project = await this.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);

    // If conversationId is provided, check if conversation exists and belongs to project
    if (conversationId !== null) {
      const conversation = await this.getConversation(conversationId);
      if (!conversation) throw new Error(`Conversation ${conversationId} not found`);

      // Ensure conversation belongs to the specified project
      if (conversation.projectId !== projectId) {
        throw new Error(`Conversation ${conversationId} does not belong to project ${projectId}`);
      }
    }

    const now = new Date().toISOString();
    const resource = {
      projectId,
      conversationId,
      key: data.key || "",
      value: data.value || "",
      type: data.type || "file",
      createdAt: now,
      updatedAt: now,
    };

    const id = await this.db.add("resources", resource);
    return await this.getResource(id);
  }

  async updateResource(id, data) {
    const resource = await this.getResource(id);
    if (!resource) throw new Error(`Resource ${id} not found`);

    const updatedResource = {
      ...resource,
      ...data,
      updatedAt: new Date().toISOString(),
    };

    await this.db.put("resources", updatedResource);
    return updatedResource;
  }

  async deleteResource(id) {
    const numId = Number(id);
    const resource = await this.getResource(numId);
    if (!resource) return false;

    await this.db.delete("resources", numId);
    return true;
  }

  async deleteConversationResources(conversationId) {
    const numId = Number(conversationId);
    const resources = await this.db.getAllFromIndex("resources", "conversationId", numId);

    await Promise.all(resources.map((r) => this.db.delete("resources", r.id)));
    return resources.length;
  }
}

// Database instance cache
const instances = new Map();

/**
 * Get a database instance for a user
 */
export async function getDB(userEmail) {
  if (!instances.has(userEmail)) {
    const db = new Database2(userEmail);
    await db.init();
    instances.set(userEmail, db);
  }

  return instances.get(userEmail);
}

/**
 * Close all database connections
 */
export async function closeAll() {
  for (const [, db] of instances) {
    await db.close();
  }
  instances.clear();
}

export default {
  Database2,
  getDB,
  closeAll,
};
