import { describe, it, expect, beforeEach } from "vitest";
import { DocumentManager } from "../DocumentManager";
import type { StorageAdapter } from "../../storage/StorageAdapter";
import type { Manifest, DocumentData, DocumentMeta } from "../types";

class MockAdapter implements StorageAdapter {
  docs = new Map<string, { data: DocumentData; meta: DocumentMeta }>();
  manifest: Manifest | null = null;
  async listDocuments() { return Array.from(this.docs.values()).map((d) => d.meta); }
  async loadDocument(id: string) { return this.docs.get(id)?.data ?? null; }
  async saveDocument(id: string, data: DocumentData, meta: DocumentMeta) { this.docs.set(id, { data, meta }); }
  async deleteDocument(id: string) { this.docs.delete(id); }
  async getManifest() { return this.manifest; }
  async saveManifest(m: Manifest) { this.manifest = m; }
  async getRemoteVersion() { return null; }
  async testConnection() {}
}

describe("DocumentManager", () => {
  let manager: DocumentManager;
  let adapter: MockAdapter;

  beforeEach(() => {
    adapter = new MockAdapter();
    manager = new DocumentManager(adapter);
  });

  it("should create a new document", async () => {
    await manager.init();
    const doc = await manager.createDocument("My Drawing");
    expect(doc.name).toBe("My Drawing");
    expect(doc.folderId).toBe("root");
    const manifest = manager.getManifest();
    expect(manifest!.documents[doc.id]).toBeDefined();
  });

  it("should create a folder", async () => {
    await manager.init();
    const folder = await manager.createFolder("Project A");
    expect(folder.name).toBe("Project A");
    expect(folder.parentId).toBe("root");
    const manifest = manager.getManifest();
    expect(manifest!.folders[folder.id]).toBeDefined();
  });

  it("should delete a document", async () => {
    await manager.init();
    const doc = await manager.createDocument("To Delete");
    await manager.deleteDocument(doc.id);
    const manifest = manager.getManifest();
    expect(manifest!.documents[doc.id]).toBeUndefined();
  });

  it("should rename a document", async () => {
    await manager.init();
    const doc = await manager.createDocument("Old Name");
    await manager.renameDocument(doc.id, "New Name");
    const manifest = manager.getManifest();
    expect(manifest!.documents[doc.id].name).toBe("New Name");
  });

  it("should move a document to a folder", async () => {
    await manager.init();
    const doc = await manager.createDocument("Movable");
    const folder = await manager.createFolder("Target");
    await manager.moveDocument(doc.id, folder.id);
    const manifest = manager.getManifest();
    expect(manifest!.documents[doc.id].folderId).toBe(folder.id);
    expect(manifest!.folders[folder.id].documents).toContain(doc.id);
    expect(manifest!.folders["root"].documents).not.toContain(doc.id);
  });

  it("should duplicate a document", async () => {
    await manager.init();
    const doc = await manager.createDocument("Original");
    const data: DocumentData = { elements: [], appState: {}, files: {} };
    await manager.saveDocumentData(doc.id, data);
    const dup = await manager.duplicateDocument(doc.id);
    expect(dup.name).toContain("Original");
    expect(dup.id).not.toBe(doc.id);
    const dupData = await adapter.loadDocument(dup.id);
    expect(dupData).not.toBeNull();
  });

  it("should track active document", async () => {
    await manager.init();
    const doc = await manager.createDocument("Active");
    manager.setActiveDocument(doc.id);
    expect(manager.getActiveDocumentId()).toBe(doc.id);
  });
});
