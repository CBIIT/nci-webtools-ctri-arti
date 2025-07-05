/**
 * Simple IndexedDB mock for testing
 */
export class MockIDBDatabase {
  constructor(name, version) {
    this.name = name;
    this.version = version;
    this.stores = new Map();
    this.indexes = new Map();
    this.objectStoreNames = {
      contains: (name) => this.stores.has(name)
    };
  }

  createObjectStore(name, options = {}) {
    const store = new MockObjectStore(name, options);
    this.stores.set(name, store);
    this.indexes.set(name, new Map());
    
    // Link store to database for index updates
    store._db = this;
    store._storeName = name;
    
    return store;
  }

  async get(storeName, key) {
    const store = this.stores.get(storeName);
    return store ? store.get(key) : null;
  }

  async getAll(storeName) {
    const store = this.stores.get(storeName);
    return store ? store.getAll() : [];
  }

  async getAllFromIndex(storeName, indexName, value) {
    const storeIndexes = this.indexes.get(storeName);
    if (!storeIndexes) return [];
    
    const index = storeIndexes.get(indexName);
    if (!index) return [];
    
    return index.get(value) || [];
  }

  async add(storeName, data) {
    const store = this.stores.get(storeName);
    if (!store) throw new Error(`Store ${storeName} not found`);
    
    const result = store.add(data);
    this._updateIndexes(storeName, data);
    return result;
  }

  async put(storeName, data) {
    const store = this.stores.get(storeName);
    if (!store) throw new Error(`Store ${storeName} not found`);
    
    const result = store.put(data);
    this._updateIndexes(storeName, data);
    return result;
  }

  async delete(storeName, key) {
    const store = this.stores.get(storeName);
    if (!store) return;
    
    const data = store.get(key);
    if (data) {
      store.delete(key);
      this._removeFromIndexes(storeName, data);
    }
  }

  _updateIndexes(storeName, data) {
    const storeIndexes = this.indexes.get(storeName);
    if (!storeIndexes) return;

    const store = this.stores.get(storeName);
    if (!store) return;

    // Update each index for this store
    for (const [indexName, indexMap] of storeIndexes) {
      const indexValue = data[indexName];
      if (indexValue !== undefined) {
        if (!indexMap.has(indexValue)) {
          indexMap.set(indexValue, []);
        }
        // Remove existing entry if updating
        const existingItems = indexMap.get(indexValue);
        const filteredItems = existingItems.filter(item => item.id !== data.id);
        filteredItems.push(data);
        indexMap.set(indexValue, filteredItems);
      }
    }
  }

  _removeFromIndexes(storeName, data) {
    const storeIndexes = this.indexes.get(storeName);
    if (!storeIndexes) return;

    for (const [indexName, indexMap] of storeIndexes) {
      const indexValue = data[indexName];
      if (indexValue !== undefined && indexMap.has(indexValue)) {
        const items = indexMap.get(indexValue);
        const filtered = items.filter(item => item.id !== data.id);
        if (filtered.length === 0) {
          indexMap.delete(indexValue);
        } else {
          indexMap.set(indexValue, filtered);
        }
      }
    }
  }

  close() {
    // Mock close - no-op
  }
}

export class MockObjectStore {
  constructor(name, options = {}) {
    this.name = name;
    this.keyPath = options.keyPath;
    this.data = new Map();
    this.indexes = new Map();
    this._db = null;
    this._storeName = null;
  }

  createIndex(name, keyPath, options = {}) {
    const index = new MockIndex(name, keyPath, options);
    this.indexes.set(name, index);
    
    // Create the index map in the database
    if (this._db && this._storeName) {
      const storeIndexes = this._db.indexes.get(this._storeName);
      if (storeIndexes) {
        storeIndexes.set(name, new Map());
      }
    }
    
    return index;
  }

  get(key) {
    return this.data.get(key) || null;
  }

  getAll() {
    return Array.from(this.data.values());
  }

  add(data) {
    const key = this.keyPath ? data[this.keyPath] : data.id;
    if (this.data.has(key)) {
      throw new Error(`Key ${key} already exists`);
    }
    this.data.set(key, { ...data });
    
    // Update indexes
    if (this._db) {
      this._db._updateIndexes(this._storeName, data);
    }
    
    return key;
  }

  put(data) {
    const key = this.keyPath ? data[this.keyPath] : data.id;
    this.data.set(key, { ...data });
    
    // Update indexes
    if (this._db) {
      this._db._updateIndexes(this._storeName, data);
    }
    
    return key;
  }

  delete(key) {
    return this.data.delete(key);
  }
}

export class MockIndex {
  constructor(name, keyPath, options = {}) {
    this.name = name;
    this.keyPath = keyPath;
    this.unique = options.unique || false;
  }
}

/**
 * Mock openDB function that returns a MockIDBDatabase
 */
export function createMockOpenDB() {
  const mockFn = async (name, version, options = {}) => {
    const db = new MockIDBDatabase(name, version);
    
    // Call upgrade callback if provided
    if (options.upgrade && typeof options.upgrade === 'function') {
      options.upgrade(db, 0, version);
    }
    
    return db;
  };
  
  // Add jest-like mock methods if jest is available
  if (typeof jest !== 'undefined') {
    return jest.fn().mockImplementation(mockFn);
  }
  
  return mockFn;
}

/**
 * Setup mock for idb module
 */
export function setupIndexedDBMock() {
  const mockOpenDB = createMockOpenDB();
  
  // Mock the idb module if jest is available
  if (typeof jest !== 'undefined') {
    jest.doMock('idb', () => ({
      openDB: mockOpenDB
    }));
  }
  
  return mockOpenDB;
}

/**
 * Clean up IndexedDB mocks
 */
export function cleanupIndexedDBMock() {
  if (typeof jest !== 'undefined') {
    jest.dontMock('idb');
  }
}