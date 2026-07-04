import { describe, it, expect } from "vitest";

import { ConfigCrypto } from "../ConfigCrypto";

import type { SyncConfig } from "../../document/types";

const makeConfig = (): SyncConfig => ({
  type: "s3",
  endpoint: "https://s3.example.com",
  bucket: "my-bucket",
  accessKey: "AKIAIOSFODNN7EXAMPLE",
  secretKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  region: "us-east-1",
});

describe("ConfigCrypto", () => {
  it("should encrypt and decrypt a config roundtrip", async () => {
    const config = makeConfig();
    const password = "my-secure-password";
    const encrypted = await ConfigCrypto.encrypt(config, password);
    expect(typeof encrypted).toBe("string");
    expect(encrypted.length).toBeGreaterThan(0);
    const decrypted = await ConfigCrypto.decrypt(encrypted, password);
    expect(decrypted).toEqual(config);
  });

  it("should fail to decrypt with wrong password", async () => {
    const config = makeConfig();
    const encrypted = await ConfigCrypto.encrypt(config, "correct-password");
    await expect(
      ConfigCrypto.decrypt(encrypted, "wrong-password"),
    ).rejects.toThrow();
  });

  it("should produce different ciphertext for same input (random IV)", async () => {
    const config = makeConfig();
    const password = "password";
    const enc1 = await ConfigCrypto.encrypt(config, password);
    const enc2 = await ConfigCrypto.encrypt(config, password);
    expect(enc1).not.toBe(enc2);
  });

  it("should extract and return config on decrypt regardless of validation", async () => {
    const encrypted = await ConfigCrypto.encrypt(
      { notAConfig: true } as any,
      "password",
    );
    const result = await ConfigCrypto.decrypt(encrypted, "password");
    expect(result).toBeDefined();
  });
});
