type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {}
}

// Storage Access API with handle extensions (newer spec)
// https://developer.mozilla.org/en-US/docs/Web/API/Document/requestStorageAccess
interface StorageAccessOptions {
  localStorage?: boolean;
  sessionStorage?: boolean;
  indexedDB?: boolean;
  locks?: boolean;
  caches?: boolean;
  getDirectory?: boolean;
  estimate?: boolean;
  createObjectURL?: boolean;
  revokeObjectURL?: boolean;
}

interface Document {
  requestStorageAccess(options?: StorageAccessOptions): Promise<StorageAccessHandle | void>;
}

interface StorageAccessHandle {
  localStorage?: Storage;
  sessionStorage?: Storage;
  indexedDB?: IDBFactory;
  locks?: LockManager;
  caches?: CacheStorage;
  getDirectory?: () => Promise<FileSystemDirectoryHandle>;
  estimate?: () => Promise<StorageEstimate>;
  createObjectURL?: (obj: Blob) => string;
  revokeObjectURL?: (url: string) => void;
}
