import duckdb from "@duckdb/duckdb-wasm";
import { SCHEMA } from './schema.js';

/**
 * Initialize the database with the schema
 */
export async function initDB() {
  const db = await getDuckDb();
  const conn = await db.connect();
  
  try {
    // Execute schema creation statements
    await conn.query(SCHEMA);
    console.log('Database schema initialized');
  } catch (error) {
    console.error('Error initializing database schema:', error);
  } finally {
    conn.close();
  }
}

export async function getDuckDb() {
  const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
  // Select a bundle based on browser checks
  const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
  const worker_url = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker}")`], {type: 'text/javascript'})
  );
  // Instantiate the asynchronus version of DuckDB-Wasm
  const worker = new Worker(worker_url);
  const logger = new duckdb.ConsoleLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  URL.revokeObjectURL(worker_url);
  return db;
}

/**
 * Create a new conversation
 */
export async function createConversation(title = 'New conversation') {
  const db = await getDuckDb();
  const conn = await db.connect();
  
  try {
    const result = await conn.query(`
      INSERT INTO conversations (title, created_at, updated_at) 
      VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id
    `, [title]);
    
    return result.get(0).id;
  } finally {
    conn.close();
  }
}

/**
 * Get all conversations
 */
export async function getAllConversations() {
  const db = await getDuckDb();
  const conn = await db.connect();
  
  try {
    const result = await conn.query(`
      SELECT c.*, 
             (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) AS message_count,
             (SELECT MAX(timestamp) FROM messages WHERE conversation_id = c.id) AS last_message_at
      FROM conversations c
      ORDER BY updated_at DESC
    `);
    
    return result.toArray().map(row => row.toJson()).map(row => ({
      id: row.id,
      title: row.title,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      messageCount: row.message_count,
      lastMessageAt: row.last_message_at ? new Date(row.last_message_at) : null
    }));
  } finally {
    conn.close();
  }
}

/**
 * Get a conversation by ID
 */
export async function getConversation(id) {
  const db = await getDuckDb();
  const conn = await db.connect();
  
  try {
    const result = await conn.query(`
      SELECT * FROM conversations WHERE id = ?
    `, [id]);
    
    if (result.length === 0) {
      return null;
    }
    
    const row = result.get(0);
    return {
      id: row.id,
      title: row.title,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  } finally {
    conn.close();
  }
}

/**
 * Update conversation title
 */
export async function updateConversation(id, title) {
  const db = await getDuckDb();
  const conn = await db.connect();
  
  try {
    await conn.query(`
      UPDATE conversations 
      SET title = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [title, id]);
  } finally {
    conn.close();
  }
}

/**
 * Delete a conversation and all its messages
 */
export async function deleteConversation(id) {
  const db = await getDuckDb();
  const conn = await db.connect();
  
  try {
    // Messages will be deleted due to CASCADE constraint
    await conn.query(`DELETE FROM conversations WHERE id = ?`, [id]);
  } finally {
    conn.close();
  }
}

/**
 * Add a message to a conversation
 */
export async function addMessage(conversationId, message) {
  const db = await getDuckDb();
  const conn = await db.connect();
  
  try {
    // Update conversation timestamp
    await conn.query(`
      UPDATE conversations 
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [conversationId]);
    
    // Store message content as JSON
    const contentJson = JSON.stringify(message.content);
    
    const result = await conn.query(`
      INSERT INTO messages (conversation_id, role, content, timestamp) 
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      RETURNING id
    `, [conversationId, message.role, contentJson]);
    
    return result.get(0).id;
  } finally {
    conn.close();
  }
}

/**
 * Get all messages for a conversation
 */
export async function getConversationMessages(conversationId) {
  const db = await getDuckDb();
  const conn = await db.connect();
  
  try {
    const result = await conn.query(`
      SELECT * FROM messages 
      WHERE conversation_id = ?
      ORDER BY timestamp
    `, [conversationId]);
    
    return result.toArray().map(row => ({
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role,
      content: JSON.parse(row.content),
      timestamp: new Date(row.timestamp)
    }));
  } finally {
    conn.close();
  }
}

/**
 * Search messages across all conversations
 */
export async function searchMessages(query) {
  const db = await getDuckDb();
  const conn = await db.connect();
  
  try {
    const result = await conn.query(`
      SELECT m.*, c.title as conversation_title
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE content MATCH ?
      ORDER BY m.timestamp DESC
      LIMIT 100
    `, [query]);
    
    return result.toArray().map(row => ({
      id: row.id,
      conversationId: row.conversation_id,
      conversationTitle: row.conversation_title,
      role: row.role,
      content: JSON.parse(row.content),
      timestamp: new Date(row.timestamp)
    }));
  } finally {
    conn.close();
  }
}

/**
 * Update conversation title based on first user message
 */
export async function updateTitleFromFirstMessage(conversationId) {
  const db = await getDuckDb();
  const conn = await db.connect();
  
  try {
    // Get first user message
    const result = await conn.query(`
      SELECT content FROM messages
      WHERE conversation_id = ? AND role = 'user'
      ORDER BY timestamp
      LIMIT 1
    `, [conversationId]);
    
    if (result.length === 0) {
      return;
    }
    
    // Extract text from first message content
    const content = JSON.parse(result.get(0).content);
    let title = '';
    
    for (const item of content) {
      if (item.text) {
        title = item.text.substring(0, 50);
        if (item.text.length > 50) title += '...';
        break;
      }
    }
    
    if (title) {
      await conn.query(`
        UPDATE conversations
        SET title = ?
        WHERE id = ?
      `, [title, conversationId]);
    }
  } finally {
    conn.close();
  }
}