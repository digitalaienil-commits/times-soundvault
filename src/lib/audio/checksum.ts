import "server-only";

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

export async function calculateFileSha256(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  const source = createReadStream(filePath);
  for await (const chunk of source) hash.update(chunk as Buffer);
  return hash.digest("hex");
}
