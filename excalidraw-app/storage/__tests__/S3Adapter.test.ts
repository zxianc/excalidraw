import { describe, it, expect, vi, beforeEach } from "vitest";

import { S3Adapter } from "../S3Adapter";

import type {
  DocumentMeta,
  DocumentData,
  Manifest,
} from "../../document/types";

import type { SyncConfig } from "../../document/types";

vi.mock("@aws-sdk/client-s3", () => {
  const mockSend = vi.fn();
  return {
    S3Client: vi.fn(() => ({ send: mockSend })),
    GetObjectCommand: vi.fn((input: any) => ({ ...input, _type: "GetObject" })),
    PutObjectCommand: vi.fn((input: any) => ({ ...input, _type: "PutObject" })),
    DeleteObjectCommand: vi.fn((input: any) => ({
      ...input,
      _type: "DeleteObject",
    })),
    ListObjectsV2Command: vi.fn((input: any) => ({
      ...input,
      _type: "ListObjectsV2",
    })),
    HeadObjectCommand: vi.fn((input: any) => ({
      ...input,
      _type: "HeadObject",
    })),
  };
});

const makeConfig = (): SyncConfig => ({
  type: "s3",
  endpoint: "https://s3.example.com",
  bucket: "test-bucket",
  accessKey: "AK_TEST",
  secretKey: "SK_TEST",
  region: "us-east-1",
  pathPrefix: "",
});

const makeDocMeta = (): DocumentMeta => ({
  id: "doc-1",
  name: "Test",
  folderId: "root",
  createdAt: 1000,
  updatedAt: 2000,
  version: 1,
  remoteVersion: null,
  dirty: false,
});

const makeDocData = (): DocumentData => ({
  elements: [],
  appState: {},
  files: {},
});

const makeManifest = (): Manifest => ({
  version: 1,
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

describe("S3Adapter", () => {
  let adapter: S3Adapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new S3Adapter(makeConfig());
  });

  it("should construct with config", () => {
    expect(adapter).toBeDefined();
  });

  it("should save and serialize manifest as JSON", async () => {
    const { S3Client } = await import("@aws-sdk/client-s3");
    const mockClient = (S3Client as any).mock.results[0].value;
    mockClient.send.mockResolvedValueOnce({});

    const manifest = makeManifest();
    await adapter.saveManifest(manifest);

    expect(mockClient.send).toHaveBeenCalledTimes(1);
    const cmd = mockClient.send.mock.calls[0][0];
    expect(cmd._type).toBe("PutObject");
    expect(cmd.Bucket).toBe("test-bucket");
    expect(cmd.Key).toBe("__manifest.json");
    expect(JSON.parse(cmd.Body)).toEqual(manifest);
  });

  it("should load and parse manifest from S3", async () => {
    const { S3Client } = await import("@aws-sdk/client-s3");
    const mockClient = (S3Client as any).mock.results[0].value;
    const manifest = makeManifest();
    const body = new TextEncoder().encode(JSON.stringify(manifest));
    mockClient.send.mockResolvedValueOnce({
      Body: { transformToByteArray: () => Promise.resolve(body) },
    });

    const loaded = await adapter.getManifest();
    expect(loaded).toEqual(manifest);
  });

  it("should return null when manifest does not exist (NoSuchKey)", async () => {
    const { S3Client } = await import("@aws-sdk/client-s3");
    const mockClient = (S3Client as any).mock.results[0].value;
    const err = new Error("NoSuchKey");
    (err as any).name = "NoSuchKey";
    mockClient.send.mockRejectedValueOnce(err);

    const loaded = await adapter.getManifest();
    expect(loaded).toBeNull();
  });

  it("should save document data as JSON to correct key", async () => {
    const { S3Client } = await import("@aws-sdk/client-s3");
    const mockClient = (S3Client as any).mock.results[0].value;
    mockClient.send.mockResolvedValueOnce({ ETag: '"abc123"' });

    const meta = makeDocMeta();
    const data = makeDocData();
    await adapter.saveDocument("doc-1", data, meta);

    expect(mockClient.send).toHaveBeenCalledTimes(1);
    const cmd = mockClient.send.mock.calls[0][0];
    expect(cmd._type).toBe("PutObject");
    expect(cmd.Key).toBe("root/doc-1.excalidraw");
  });

  it("should get remote version via HeadObject", async () => {
    const { S3Client } = await import("@aws-sdk/client-s3");
    const mockClient = (S3Client as any).mock.results[0].value;

    const manifest = makeManifest();
    manifest.documents["doc-1"] = makeDocMeta();
    const manifestBody = new TextEncoder().encode(JSON.stringify(manifest));
    mockClient.send.mockResolvedValueOnce({
      Body: { transformToByteArray: () => Promise.resolve(manifestBody) },
    });

    mockClient.send.mockResolvedValueOnce({ ETag: '"version-42"' });

    const version = await adapter.getRemoteVersion("doc-1");
    expect(version).toBe('"version-42"');
    expect(mockClient.send).toHaveBeenCalledTimes(2);
  });
});
