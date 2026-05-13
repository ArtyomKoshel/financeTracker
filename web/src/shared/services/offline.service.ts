const DB_NAME = 'finance-tracker-offline';
const DB_VERSION = 1;
const CACHE_STORE = 'api-cache';
const QUEUE_STORE = 'mutation-queue';

interface CacheEntry {
  key: string;
  data: unknown;
  timestamp: number;
}

export interface QueuedMutation {
  id?: number;
  method: string;
  endpoint: string;
  body: string | null;
  timestamp: number;
  description: string;
}

const MAX_CACHE_AGE: Record<string, number> = {
  '/bootstrap': 30 * 60_000,
  '/dashboard': 10 * 60_000,
  '/categories': 60 * 60_000,
  '/income-types': 60 * 60_000,
  '/payments': 15 * 60_000,
  '/payments/reminders': 15 * 60_000,
  '/budgets': 15 * 60_000,
  '/budget/monthly': 15 * 60_000,
  '/goals': 15 * 60_000,
  '/settings': 60 * 60_000,
  '/rates': 60 * 60_000,
  '/health': 30 * 60_000,
  '/notes': 15 * 60_000,
  '/notes/folders': 30 * 60_000,
  '/notes/labels': 30 * 60_000,
  '/debts': 30 * 60_000,
  '/envelopes': 15 * 60_000,
  '/accounts': 15 * 60_000,
  '/balance': 10 * 60_000,
};
const DEFAULT_MAX_AGE = 15 * 60_000;

class OfflineService {
  private db: IDBDatabase | null = null;
  private dbReady: Promise<IDBDatabase>;
  private _isOnline = navigator.onLine;
  private listeners = new Set<(online: boolean) => void>();

  constructor() {
    this.dbReady = this.openDB();
    window.addEventListener('online', () => this.setOnline(true));
    window.addEventListener('offline', () => this.setOnline(false));
  }

  get isOnline(): boolean {
    return this._isOnline;
  }

  onStatusChange(fn: (online: boolean) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private setOnline(online: boolean): void {
    if (this._isOnline === online) return;
    this._isOnline = online;
    this.listeners.forEach(fn => fn(online));
  }

  private openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(CACHE_STORE)) {
          db.createObjectStore(CACHE_STORE, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(QUEUE_STORE)) {
          db.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = () => {
        this.db = req.result;
        resolve(req.result);
      };
      req.onerror = () => reject(req.error);
    });
  }

  private async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    return this.dbReady;
  }

  private tx(store: string, mode: IDBTransactionMode): Promise<IDBObjectStore> {
    return this.getDB().then(db => db.transaction(store, mode).objectStore(store));
  }

  // ── Cache ────────────────────────────────────────────

  async cacheResponse(endpoint: string, data: unknown): Promise<void> {
    const key = this.normalizeKey(endpoint);
    const store = await this.tx(CACHE_STORE, 'readwrite');
    const entry: CacheEntry = { key, data, timestamp: Date.now() };
    await this.idbPut(store, entry);
  }

  async getCached<T>(endpoint: string): Promise<T | null> {
    const key = this.normalizeKey(endpoint);
    const store = await this.tx(CACHE_STORE, 'readonly');
    const entry = await this.idbGet<CacheEntry>(store, key);
    if (!entry) return null;

    const maxAge = this.getMaxAge(key);
    if (Date.now() - entry.timestamp > maxAge) return null;

    return entry.data as T;
  }

  async getCachedAnyAge<T>(endpoint: string): Promise<T | null> {
    const key = this.normalizeKey(endpoint);
    const store = await this.tx(CACHE_STORE, 'readonly');
    const entry = await this.idbGet<CacheEntry>(store, key);
    return entry ? (entry.data as T) : null;
  }

  async clearCache(): Promise<void> {
    const store = await this.tx(CACHE_STORE, 'readwrite');
    await this.idbClear(store);
  }

  // ── Mutation Queue ───────────────────────────────────

  async enqueue(mutation: Omit<QueuedMutation, 'id'>): Promise<number> {
    const store = await this.tx(QUEUE_STORE, 'readwrite');
    return this.idbAdd(store, mutation);
  }

  async getQueue(): Promise<QueuedMutation[]> {
    const store = await this.tx(QUEUE_STORE, 'readonly');
    return this.idbGetAll<QueuedMutation>(store);
  }

  async getQueueCount(): Promise<number> {
    const store = await this.tx(QUEUE_STORE, 'readonly');
    return this.idbCount(store);
  }

  async dequeue(id: number): Promise<void> {
    const store = await this.tx(QUEUE_STORE, 'readwrite');
    await this.idbDelete(store, id);
  }

  async clearQueue(): Promise<void> {
    const store = await this.tx(QUEUE_STORE, 'readwrite');
    await this.idbClear(store);
  }

  // ── Background Sync ──────────────────────────────────

  async requestBackgroundSync(): Promise<void> {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      try {
        const reg = await navigator.serviceWorker.ready;
        await (reg as ServiceWorkerRegistration & { sync: { register(tag: string): Promise<void> } }).sync.register('sync-mutations');
      } catch { /* sync not available */ }
    }
  }

  // ── Helpers ──────────────────────────────────────────

  private normalizeKey(endpoint: string): string {
    return endpoint.split('?')[0];
  }

  private getMaxAge(key: string): number {
    return MAX_CACHE_AGE[key] ?? DEFAULT_MAX_AGE;
  }

  private idbPut(store: IDBObjectStore, value: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = store.put(value);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  private idbGet<T>(store: IDBObjectStore, key: string): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  }

  private idbGetAll<T>(store: IDBObjectStore): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result as T[]);
      req.onerror = () => reject(req.error);
    });
  }

  private idbAdd(store: IDBObjectStore, value: unknown): Promise<number> {
    return new Promise((resolve, reject) => {
      const req = store.add(value);
      req.onsuccess = () => resolve(req.result as number);
      req.onerror = () => reject(req.error);
    });
  }

  private idbDelete(store: IDBObjectStore, key: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  private idbCount(store: IDBObjectStore): Promise<number> {
    return new Promise((resolve, reject) => {
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private idbClear(store: IDBObjectStore): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}

export const offlineService = new OfflineService();

export function isOfflineQueued(err: unknown): boolean {
  return (err as Error & { offlineQueued?: boolean })?.offlineQueued === true;
}
