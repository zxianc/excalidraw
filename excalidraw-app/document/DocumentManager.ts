import { DOC_CONSTANTS } from "./constants";

import type { StorageAdapter } from "../storage/StorageAdapter";
import type { DocumentMeta, DocumentData, FolderNode, Manifest } from "./types";

const generateId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const createEmptyManifest = (): Manifest => ({
  folders: {
    root: {
      id: "root",
      name: "Root",
      parentId: null,
      children: [],
      documents: [],
    },
  },
  documents: {},
});

export class DocumentManager {
  private adapter: StorageAdapter;
  private manifest: Manifest = createEmptyManifest();
  private activeDocId: string | null = null;

  constructor(adapter: StorageAdapter) {
    this.adapter = adapter;
  }

  async init(): Promise<void> {
    const existing = await this.adapter.getManifest();
    if (existing) {
      this.manifest = existing;
    } else {
      this.manifest = createEmptyManifest();
      await this.persistManifest();
    }
    const savedActive = localStorage.getItem(DOC_CONSTANTS.ACTIVE_DOC_KEY);
    if (savedActive && this.manifest.documents[savedActive]) {
      this.activeDocId = savedActive;
    }
  }


  /**
   * Reload the manifest from storage after a fullSync.
   */
  async reloadManifest(): Promise<void> {
    const refreshed = await this.adapter.getManifest();
    if (refreshed) {
      this.manifest = refreshed;
    }
  }

  getManifest(): Manifest {
    // Return a shallow clone so React detects state changes immediately
    return {
      ...this.manifest,
      folders: { ...this.manifest.folders },
      documents: { ...this.manifest.documents },
    };
  }
  getActiveDocumentId(): string | null {
    return this.activeDocId;
  }

  setActiveDocument(id: string): void {
    if (!this.manifest.documents[id]) {
      throw new Error(`Document ${id} not found`);
    }
    this.activeDocId = id;
    localStorage.setItem(DOC_CONSTANTS.ACTIVE_DOC_KEY, id);
  }

  createDocumentSync(name?: string, parentFolderId?: string): DocumentMeta {
    const id = generateId();
    const now = Date.now();
    const meta: DocumentMeta = {
      id,
      name: name || DOC_CONSTANTS.DEFAULT_DOC_NAME,
      folderId: parentFolderId || DOC_CONSTANTS.ROOT_FOLDER_ID,
      createdAt: now,
      updatedAt: now,
      remoteVersion: null,
      dirty: false,
    };
    this.manifest.documents[id] = meta;
    const targetFolder = this.manifest.folders[meta.folderId];
    if (targetFolder) {
      targetFolder.documents.push(id);
    }
    // persist in background
    this.persistManifest();
    this.adapter.saveDocument(
      id,
      { elements: [], appState: {}, files: {} },
      meta,
    );
    return meta;
  }

  async finalizeCreateDocument(_meta: DocumentMeta): Promise<void> {
    // Already persisted optimistically, just a hook for future use
  }

  async createDocument(name?: string): Promise<DocumentMeta> {
    const meta = this.createDocumentSync(name);
    await this.finalizeCreateDocument(meta);
    return meta;
  }

  async loadDocumentData(id: string): Promise<DocumentData | null> {
    const data = await this.adapter.loadDocument(id);
    if (data) {
      // Defensive sanitize: appState stored via JSON loses non-serializable
      // fields like collaborators (Map → {}). Force a valid Map so the
      // Excalidraw component does not crash on forEach.
      data.appState = {
        ...data.appState,
        collaborators: new Map(),
      };
    }
    return data;
  }

  async saveDocumentData(id: string, data: DocumentData): Promise<void> {
    const meta = this.manifest.documents[id];
    if (!meta) {
      throw new Error(`Document ${id} not found`);
    }
    meta.updatedAt = Date.now();
    meta.dirty = true;
    this.manifest.documents[id] = meta;
    await this.adapter.saveDocument(id, data, meta);
    // DO NOT persist manifest here — only META_STORE matters for
    // syncDocument reads. Writing the full manifest on every save
    // races with syncDocument's manifest update and can overwrite
    // the synced remoteVersion with stale null values.
  }

  async markSynced(id: string, remoteVersion: string): Promise<void> {
    const meta = this.manifest.documents[id];
    if (!meta) {
      return;
    }
    meta.dirty = false;
    meta.remoteVersion = remoteVersion;
    this.manifest.documents[id] = meta;
    await this.persistManifest();
  }

  async deleteDocument(id: string): Promise<void> {
    const meta = this.manifest.documents[id];
    if (!meta) {
      return;
    }
    const folder = this.manifest.folders[meta.folderId];
    if (folder) {
      folder.documents = folder.documents.filter((dId) => dId !== id);
    }
    delete this.manifest.documents[id];
    await this.adapter.deleteDocument(id);
    await this.persistManifest();
    if (this.activeDocId === id) {
      this.activeDocId = null;
      localStorage.removeItem(DOC_CONSTANTS.ACTIVE_DOC_KEY);
    }
  }

  async renameDocument(id: string, newName: string): Promise<void> {
    const meta = this.manifest.documents[id];
    if (!meta) {
      return;
    }
    meta.name = newName;
    meta.updatedAt = Date.now();
    this.manifest.documents[id] = meta;
    await this.persistManifest();
  }

  async duplicateDocument(id: string): Promise<DocumentMeta> {
    const original = this.manifest.documents[id];
    if (!original) {
      throw new Error(`Document ${id} not found`);
    }
    const data = await this.adapter.loadDocument(id);
    const newMeta = await this.createDocument(`${original.name} (copy)`);
    if (data) {
      await this.moveDocument(newMeta.id, original.folderId);
      await this.adapter.saveDocument(
        newMeta.id,
        data,
        this.manifest.documents[newMeta.id],
      );
    }
    return this.manifest.documents[newMeta.id];
  }

  async moveDocument(docId: string, targetFolderId: string): Promise<void> {
    const meta = this.manifest.documents[docId];
    const targetFolder = this.manifest.folders[targetFolderId];
    if (!meta || !targetFolder) {
      return;
    }
    const oldFolder = this.manifest.folders[meta.folderId];
    if (oldFolder) {
      oldFolder.documents = oldFolder.documents.filter((id) => id !== docId);
    }
    if (!targetFolder.documents.includes(docId)) {
      targetFolder.documents.push(docId);
    }
    meta.folderId = targetFolderId;
    meta.updatedAt = Date.now();
    this.manifest.documents[docId] = meta;
    await this.persistManifest();
  }

  createFolderSync(name: string, parentId?: string): FolderNode {
    const id = generateId();
    const effectiveParentId = parentId || DOC_CONSTANTS.ROOT_FOLDER_ID;
    const folder: FolderNode = {
      id,
      name,
      parentId: effectiveParentId,
      children: [],
      documents: [],
    };
    this.manifest.folders[id] = folder;
    const parent = this.manifest.folders[effectiveParentId];
    if (parent && !parent.children.includes(id)) {
      parent.children.push(id);
    }
    // persist in background
    this.persistManifest();
    return folder;
  }

  async finalizeCreateFolder(_folder: FolderNode): Promise<void> {
    // Already persisted optimistically, just a hook for future use
  }

  async createFolder(name: string, parentId?: string): Promise<FolderNode> {
    const folder = this.createFolderSync(name, parentId);
    await this.finalizeCreateFolder(folder);
    return folder;
  }

  async renameFolder(id: string, newName: string): Promise<void> {
    const folder = this.manifest.folders[id];
    if (!folder || id === "root") {
      return;
    }
    folder.name = newName;
    this.manifest.folders[id] = folder;
    await this.persistManifest();
  }

  async deleteFolder(id: string): Promise<void> {
    const folder = this.manifest.folders[id];
    if (!folder || id === "root") {
      return;
    }
    for (const childId of folder.children) {
      await this.deleteFolder(childId);
    }
    for (const docId of folder.documents) {
      await this.deleteDocument(docId);
    }
    if (folder.parentId) {
      const parent = this.manifest.folders[folder.parentId];
      if (parent) {
        parent.children = parent.children.filter((cId) => cId !== id);
      }
    }
    delete this.manifest.folders[id];
    await this.persistManifest();
  }

  getDirtyDocuments(): DocumentMeta[] {
    return Object.values(this.manifest.documents).filter((d) => d.dirty);
  }
  getDocumentsInFolder(folderId: string): DocumentMeta[] {
    const folder = this.manifest.folders[folderId];
    if (!folder) {
      return [];
    }
    return folder.documents
      .map((id) => this.manifest.documents[id])
      .filter(Boolean);
  }

  private async persistManifest(): Promise<void> {
    await this.adapter.saveManifest(this.manifest);
  }
}
