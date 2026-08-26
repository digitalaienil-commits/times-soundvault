import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { LocalStorageProvider } from "./local/provider";

describe("local generated media storage", () => {
  const roots: string[] = [];
  afterEach(async () => {
    await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  it("publishes without overwrite, streams ranges, and deletes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "soundvault-generated-"));
    roots.push(root);
    const source = path.join(root, "source.mp3");
    await writeFile(source, Buffer.from("0123456789"));
    const provider = new LocalStorageProvider(path.join(root, "private"));
    const stored = await provider.storeGeneratedObject({
      storageKey: "generated/previews/00000000-0000-4000-8000-000000000001.mp3",
      sourcePath: source,
      contentType: "audio/mpeg",
      expectedByteSize: 10,
    });
    await expect(
      provider.storeGeneratedObject({
        storageKey: stored.storageKey,
        sourcePath: source,
        contentType: "audio/mpeg",
        expectedByteSize: 10,
      }),
    ).rejects.toMatchObject({ code: "STORAGE_CONFLICT" });
    const opened = await provider.openStoredObject({
      storageKey: stored.storageKey,
      start: 2,
      end: 5,
    });
    expect(await new Response(opened.body).text()).toBe("2345");
    await provider.deleteGeneratedObject({ storageKey: stored.storageKey });
    await expect(
      stat(path.join(root, "private", stored.storageKey)),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(source, "utf8")).toBe("0123456789");
  });
});
