
// IndexedDB Wrapper for managing large binary assets (Images/Video/Audio)
// This bypasses the 5MB localStorage limit, allowing for GBs of storage.

const DB_NAME = 'CosmoStudioDB';
const DB_VERSION = 1;
const STORE_NAME = 'assets';

// Initialize DB
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

// RISK REPORT FIX: Quota Check
const checkQuotaSafe = async (payloadSize: number): Promise<boolean> => {
    if (navigator.storage && navigator.storage.estimate) {
        try {
            const { usage, quota } = await navigator.storage.estimate();
            if (usage && quota) {
                const remaining = quota - usage;
                if (remaining < payloadSize) {
                    console.error(`Storage Quota Exceeded. Required: ${payloadSize}, Available: ${remaining}`);
                    return false;
                }
                // Warning threshold at 80% usage
                if (usage / quota > 0.8) {
                    console.warn("Storage usage is above 80%.");
                }
            }
        } catch (e) {
            // Fallback if estimate fails, proceed with caution
            return true;
        }
    }
    return true;
};

// Save a heavy asset (Base64 string)
export const saveAsset = async (key: string, data: string): Promise<void> => {
  // Check quota roughly (Base64 is char count * 1 byte approx in JS string, though memory is 2 bytes/char)
  // We just check if we have rough headroom.
  const isSafe = await checkQuotaSafe(data.length);
  if (!isSafe) {
      throw new Error("Disk Quota Exceeded. Please delete old projects to free up space.");
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(data, key);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// Retrieve a heavy asset
export const getAsset = async (key: string): Promise<string | null> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
};

// Delete an asset
export const deleteAsset = async (key: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(key);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// Clear all assets (Factory Reset)
export const clearAssets = async (): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
     const tx = db.transaction(STORE_NAME, 'readwrite');
     const store = tx.objectStore(STORE_NAME);
     const request = store.clear();
     
     request.onsuccess = () => resolve();
     request.onerror = () => reject(request.error);
  });
}
