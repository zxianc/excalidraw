export const DOC_CONSTANTS = {
  /** IndexedDB store name for documents */
  IDB_STORE: "excalidraw-documents",
  /** IndexedDB store name for manifest */
  IDB_MANIFEST: "excalidraw-manifest",
  /** localStorage key for active document ID */
  ACTIVE_DOC_KEY: "excalidraw-active-doc",
  /** localStorage key for sync config */
  SYNC_CONFIG_KEY: "excalidraw-sync-config",
  /** Default folder ID */
  ROOT_FOLDER_ID: "root",
  /** Manifest filename on remote */
  MANIFEST_FILENAME: "__manifest.json",
  /** Config filename on remote */
  CONFIG_FILENAME: "__config.json",
  /** Assets folder on remote */
  ASSETS_FOLDER: "assets",
  /** Auto-save debounce (ms) */
  AUTO_SAVE_DEBOUNCE: 500,
  /** Sync debounce (ms) */
  SYNC_DEBOUNCE: 2000,
  /** Sidebar width (px) */
  SIDEBAR_WIDTH: 240,
  /** Default new document name */
  DEFAULT_DOC_NAME: "Untitled",
} as const;
