/**
 * Schema definition for FedPulse agent data storage
 */
export const SCHEMA = `
  -- Conversations table
  CREATE TABLE IF NOT EXISTS conversation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title VARCHAR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  -- Messages table
  CREATE TABLE IF NOT EXISTS message (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER,
    role VARCHAR,
    content JSON,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );

  -- Indexes for performance
  CREATE INDEX IF NOT EXISTS idx_message_content ON message USING FULLTEXT(content);
  CREATE INDEX IF NOT EXISTS idx_message_conversation ON message(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_conversation_updated ON conversation(updated_at);
`;