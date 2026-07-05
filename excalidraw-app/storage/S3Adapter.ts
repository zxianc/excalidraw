import COS from "cos-js-sdk-v5";

import { DOC_CONSTANTS } from "../document/constants";

import type { StorageAdapter } from "./StorageAdapter";
import type {
  DocumentMeta,
  DocumentData,
  Manifest,
  SyncConfig,
} from "../document/types";

/**
 * Tencent COS adapter — uses cos-js-sdk-v5 (native COS protocol).
 * Also compatible with S3-compatible object storage via custom Domain.
 */
export class S3Adapter implements StorageAdapter {
  private cos: COS;
  private config: SyncConfig;

  constructor(config: SyncConfig) {
    this.config = config;
    const opts: COS.COSOptions = {
      SecretId: config.accessKey,
      SecretKey: config.secretKey,
      Protocol: "https:",
    };
    if (config.endpoint) {
      const domain = config.endpoint
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "");
      opts.Domain = domain.includes("{Bucket}") ? domain : `{Bucket}.${domain}`;
    }
    this.cos = new COS(opts);
  }

  private key(path: string): string {
    const prefix = this.config.pathPrefix
      ? `${this.config.pathPrefix.replace(/\/+$/, "")}/`
      : "";
    return `${prefix}${path}`;
  }

  private docPath(meta: DocumentMeta): string {
    return `${meta.folderId}/${meta.id}.excalidraw`;
  }

  private getRegion(): string {
    return this.config.region || "ap-guangzhou";
  }

  private async getObject(key: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      this.cos.getObject(
        {
          Bucket: this.config.bucket,
          Region: this.getRegion(),
          Key: this.key(key),
        },
        (err, data) => {
          if (err) {
            if (err.statusCode === 404 || err.code === "NoSuchKey") {
              resolve(null);
            } else {
              reject(err);
            }
          } else {
            resolve(data.Body as string);
          }
        },
      );
    });
  }

  private async putObject(key: string, body: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      this.cos.putObject(
        {
          Bucket: this.config.bucket,
          Region: this.getRegion(),
          Key: this.key(key),
          Body: body,
          ContentType: "application/json",
        },
        (err, data) => {
          if (err) {
            reject(err);
          } else {
            const etag = data.headers?.["etag"] || data.ETag || null;
            resolve(etag);
          }
        },
      );
    });
  }

  // ---- StorageAdapter implementation ----

  async listDocuments(): Promise<DocumentMeta[]> {
    const manifest = await this.getManifest();
    return manifest ? Object.values(manifest.documents) : [];
  }

  async loadDocument(id: string): Promise<DocumentData | null> {
    const manifest = await this.getManifest();
    if (!manifest || !manifest.documents[id]) {
      return null;
    }
    const meta = manifest.documents[id];
    const json = await this.getObject(this.docPath(meta));
    if (!json) {
      return null;
    }
    return JSON.parse(json) as DocumentData;
  }

  async saveDocument(
    id: string,
    data: DocumentData,
    meta: DocumentMeta,
  ): Promise<void> {
    const etag = await this.putObject(this.docPath(meta), JSON.stringify(data));
    console.log(`[S3Adapter.saveDocument] doc=${id} ETag=${etag}`);
  }

  async deleteDocument(id: string): Promise<void> {
    const manifest = await this.getManifest();
    if (!manifest || !manifest.documents[id]) {
      return;
    }
    const meta = manifest.documents[id];
    return new Promise((resolve, reject) => {
      this.cos.deleteObject(
        {
          Bucket: this.config.bucket,
          Region: this.getRegion(),
          Key: this.key(this.docPath(meta)),
        },
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        },
      );
    });
  }

  async getManifest(): Promise<Manifest | null> {
    const json = await this.getObject(DOC_CONSTANTS.MANIFEST_FILENAME);
    if (!json) {
      return null;
    }
    return JSON.parse(json) as Manifest;
  }

  async saveManifest(manifest: Manifest): Promise<void> {
    console.log(
      `[S3Adapter.saveManifest] saving with ${Object.keys(manifest.documents).length} docs`,
    );
    await this.putObject(
      DOC_CONSTANTS.MANIFEST_FILENAME,
      JSON.stringify(manifest),
    );
  }

  async getRemoteVersion(docId: string): Promise<string | null> {
    console.log(`[S3Adapter.getRemoteVersion] docId=${docId}`);
    const manifest = await this.getManifest();
    if (!manifest || !manifest.documents[docId]) {
      console.log(`[S3Adapter.getRemoteVersion] docId=${docId} → null (not in remote manifest)`);
      return null;
    }
    const meta = manifest.documents[docId];
    const key = this.key(this.docPath(meta));
    console.log(`[S3Adapter.getRemoteVersion] docId=${docId} headObject key=${key}`);
    return new Promise((resolve, reject) => {
      this.cos.headObject(
        {
          Bucket: this.config.bucket,
          Region: this.getRegion(),
          Key: key,
        },
        (err, data) => {
          if (err) {
            if (err.statusCode === 404 || err.code === "NotFound") {
              console.log(`[S3Adapter.getRemoteVersion] docId=${docId} → null (404)`);
              resolve(null);
            } else {
              console.error(`[S3Adapter.getRemoteVersion] docId=${docId} error:`, err);
              reject(err);
            }
          } else {
            const etag = data.headers?.["etag"] ?? null;
            console.log(`[S3Adapter.getRemoteVersion] docId=${docId} → ETag=${etag}`);
            resolve(etag);
          }
        },
      );
    });
  }

  async testConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.cos.headObject(
        {
          Bucket: this.config.bucket,
          Region: this.getRegion(),
          Key: this.key(DOC_CONSTANTS.MANIFEST_FILENAME),
        },
        (err) => {
          if (err) {
            if (err.statusCode === 404 || err.code === "NotFound") {
              resolve();
            } else {
              reject(
                new Error(
                  `COS connection failed: ${err.message || "Unknown error"}`,
                ),
              );
            }
          } else {
            resolve();
          }
        },
      );
    });
  }
}
