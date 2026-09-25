const DATABASE_NAME = "myos.attachments.v1";
const STORE_NAME = "files";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open attachment storage."));
  });
}

async function withStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = action(transaction.objectStore(STORE_NAME));
    let result: T;
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(request.error ?? new Error("Attachment storage request failed."));
    transaction.oncomplete = () => {
      database.close();
      resolve(result as T);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Attachment storage transaction failed."));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error("Attachment storage transaction was cancelled."));
    };
  });
}

export function storeAttachment(id: string, blob: Blob): Promise<IDBValidKey> {
  return withStore("readwrite", (store) => store.put(blob, id));
}

export function loadAttachment(id: string): Promise<Blob | undefined> {
  return withStore("readonly", (store) => store.get(id));
}

export function removeAttachment(id: string): Promise<undefined> {
  return withStore("readwrite", (store) => store.delete(id));
}
