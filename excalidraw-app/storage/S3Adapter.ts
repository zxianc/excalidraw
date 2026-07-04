import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

import { DOC_CONSTANTS } from "../document/constants";

import type { StorageAdapter } from "./StorageAdapter";
import type {
  DocumentMeta,
  DocumentData,
  Manifest,
  SyncConfig,
} from "../document/types";

export class S3Adapter implements StorageAdapter {
  private client: S3Client;
  private config: SyncConfig;

  constructor(config: SyncConfig) {
    this.config = config;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region || "us-east-1",
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
      forcePathStyle: true,
    });
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

  private async getObject(key: string): Promise<string | null> {
    try {
      const resp = await this.client.send(
        new GetObjectCommand({
          Bucket: this.config.bucket,
          Key: this.key(key),
        }),
      );
      const bytes = await resp.Body!.transformToByteArray();
      return new TextDecoder().decode(bytes);
    } catch (err: any) {
      if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw err;
    }
  }

  private async putObject(
    key: string,
    body: string,
    contentType = "application/json",
  ): Promise<string | null> {
    const resp = await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: this.key(key),
        Body: body,
        ContentType: contentType,
      }),
    );
    return resp.ETag ?? null;
  }

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
    await this.putObject(this.docPath(meta), JSON.stringify(data));
  }

  async deleteDocument(id: string): Promise<void> {
    const manifest = await this.getManifest();
    if (!manifest || !manifest.documents[id]) {
      return;
    }
    const meta = manifest.documents[id];
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: this.key(this.docPath(meta)),
      }),
    );
  }

  async getManifest(): Promise<Manifest | null> {
    const json = await this.getObject(DOC_CONSTANTS.MANIFEST_FILENAME);
    if (!json) {
      return null;
    }
    return JSON.parse(json) as Manifest;
  }

  async saveManifest(manifest: Manifest): Promise<void> {
    await this.putObject(
      DOC_CONSTANTS.MANIFEST_FILENAME,
      JSON.stringify(manifest),
    );
  }

  async getRemoteVersion(docId: string): Promise<string | null> {
    const manifest = await this.getManifest();
    if (!manifest || !manifest.documents[docId]) {
      return null;
    }
    const meta = manifest.documents[docId];
    try {
      const resp = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.config.bucket,
          Key: this.key(this.docPath(meta)),
        }),
      );
      return resp.ETag ?? null;
    } catch (err: any) {
      if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw err;
    }
  }

  async testConnection(): Promise<void> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.config.bucket,
          Key: this.key(DOC_CONSTANTS.MANIFEST_FILENAME),
        }),
      );
    } catch (err: any) {
      if (err.name !== "NotFound" && err.$metadata?.httpStatusCode !== 404) {
        throw new Error(
          `S3 connection failed: ${err.message || "Unknown error"}`,
        );
      }
    }
  }
}
