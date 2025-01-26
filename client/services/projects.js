import { openDB } from 'idb';

const DB_NAME = 'projects-db';
const STORE_NAME = 'projects';

async function initDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true
        });
      }
    }
  });
}

export async function getProjects() {
  const db = await initDB();
  return db.getAll(STORE_NAME);
}

export async function addProject(project) {
  const db = await initDB();
  return db.add(STORE_NAME, {
    ...project,
    createdAt: new Date().toISOString()
  });
}

export async function deleteProject(id) {
  const db = await initDB();
  return db.delete(STORE_NAME, id);
}

export async function updateProject(id, updates) {
  const db = await initDB();
  return db.put(STORE_NAME, {
    id,
    ...updates,
    updatedAt: new Date().toISOString()
  });
}
