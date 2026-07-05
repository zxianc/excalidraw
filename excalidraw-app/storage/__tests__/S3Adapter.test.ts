import { describe, it, expect, vi, beforeEach } from "vitest";

import { S3Adapter } from "../S3Adapter";

import type {
  DocumentMeta,
  DocumentData,
  Manifest,
} from "../../document/types";

import type { SyncConfig } from "../../document/types";

// Mock cos-js-sdk-v5
const mockCosInstance = {
  getObject: vi.fn(),
  putObject: vi.fn(),
  deleteObject: vi.fn(),
  headObject: vi.fn(),
};

vi.mock("cos-js-sdk-v5", () => ({
  default: vi.fn(() => mockCosInstance),
}));

const makeConfig = (): SyncConfig => ({
  type: "s3",
  endpoint: "https://cos.ap-guangzhou.myqcloud.com",
  bucket: "test-bucket-1252379480",
  accessKey: "AKID_TEST",
  secretKey: "SK_TEST",
  region: "ap-guangzhou",
  pathPrefix: "",
});

const makeDocMeta = (): DocumentMeta => ({
  id: "doc-1",
  name: "Test",
  folderId: "root",
  createdAt: 1000,
  updatedAt: 2000,
  remoteVersion: null,
  dirty: false,
});

const makeDocData = (): DocumentData => ({
  elements: [],
  appState: {},
  files: {},
});

const makeManifest = (): Manifest => ({
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

// Helper: resolve a COS callback with data
function resolveCallback(
  mock: ReturnType<typeof vi.fn>,
  err: any,
  data: any,
  callIndex = 0,
) {
  const cb = mock.mock.calls[callIndex][2]; // params, callback are args 1,2
  if (cb) {
    cb(err, data);
  }
}

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
    mockCosInstance.putObject.mockImplementation((_params: any, cb: any) => {
      cb(null, { statusCode: 200, headers: { etag: '"abc123"' } });
    });

    const manifest = makeManifest();
    await adapter.saveManifest(manifest);

    expect(mockCosInstance.putObject).toHaveBeenCalledTimes(1);
    const call = mockCosInstance.putObject.mock.calls[0];
    expect(call[0].Key).toBe("__manifest.json");
    expect(call[0].Bucket).toBe("test-bucket-1252379480");
    expect(JSON.parse(call[0].Body)).toEqual(manifest);
  });

  it("should load and parse manifest", async () => {
    const manifest = makeManifest();
    mockCosInstance.getObject.mockImplementation((_params: any, cb: any) => {
      cb(null, { statusCode: 200, Body: JSON.stringify(manifest) });
    });

    const loaded = await adapter.getManifest();
    expect(loaded).toEqual(manifest);
  });

  it("should return null when manifest does not exist", async () => {
    mockCosInstance.getObject.mockImplementation((_params: any, cb: any) => {
      cb({ statusCode: 404, code: "NoSuchKey" }, null);
    });

    const loaded = await adapter.getManifest();
    expect(loaded).toBeNull();
  });

  it("should save document data as JSON to correct key", async () => {
    mockCosInstance.putObject.mockImplementation((_params: any, cb: any) => {
      cb(null, { statusCode: 200, headers: { etag: '"xyz"' } });
    });

    const meta = makeDocMeta();
    const data = makeDocData();
    await adapter.saveDocument("doc-1", data, meta);

    expect(mockCosInstance.putObject).toHaveBeenCalledTimes(1);
    const call = mockCosInstance.putObject.mock.calls[0];
    expect(call[0].Key).toBe("root/doc-1.excalidraw");
  });

  it("should get remote version via headObject", async () => {
    const manifest = makeManifest();
    manifest.documents["doc-1"] = makeDocMeta();

    mockCosInstance.getObject.mockImplementation((_params: any, cb: any) => {
      cb(null, { statusCode: 200, Body: JSON.stringify(manifest) });
    });
    mockCosInstance.headObject.mockImplementation((_params: any, cb: any) => {
      cb(null, { statusCode: 200, headers: { etag: '"version-42"' } });
    });

    const version = await adapter.getRemoteVersion("doc-1");
    expect(version).toBe('"version-42"');
    // getManifest + headObject = 2 calls
    expect(mockCosInstance.getObject).toHaveBeenCalledTimes(1);
    expect(mockCosInstance.headObject).toHaveBeenCalledTimes(1);
  });

  it("should return null for remote version when doc not found", async () => {
    const manifest = makeManifest();
    manifest.documents["doc-1"] = makeDocMeta();

    mockCosInstance.getObject.mockImplementation((_params: any, cb: any) => {
      cb(null, { statusCode: 200, Body: JSON.stringify(manifest) });
    });
    mockCosInstance.headObject.mockImplementation((_params: any, cb: any) => {
      cb({ statusCode: 404 }, null);
    });

    const version = await adapter.getRemoteVersion("doc-1");
    expect(version).toBeNull();
  });

  it("should test connection successfully when bucket exists", async () => {
    mockCosInstance.headObject.mockImplementation((_params: any, cb: any) => {
      cb({ statusCode: 404, code: "NotFound" }, null);
    });
    await expect(adapter.testConnection()).resolves.toBeUndefined();
  });

  it("should throw when test connection fails with non-404", async () => {
    mockCosInstance.headObject.mockImplementation((_params: any, cb: any) => {
      cb({ statusCode: 403, message: "Forbidden" }, null);
    });
    await expect(adapter.testConnection()).rejects.toThrow();
  });
});
