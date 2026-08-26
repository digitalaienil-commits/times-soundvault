import "server-only";

import { ClientSecretCredential } from "@azure/identity";
import { createWriteStream } from "node:fs";
import { mkdir, open, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { assertAudioSignature } from "../signature";
import type {
  CreateStorageUploadInput,
  DeleteDraftObjectInput,
  DeleteGeneratedObjectInput,
  GeneratedStoredObject,
  MaterializedObject,
  MaterializeStoredObjectInput,
  OpenedStoredObject,
  OpenStoredObjectInput,
  StorageProvider,
  StoreGeneratedObjectInput,
  StorageUploadSession,
  StorageUploadSessionReference,
  StorageUploadStatus,
  StoredObject,
  VerifyCompletedUploadInput,
  WriteStorageChunkInput,
} from "../provider";
import { StorageProviderError } from "../provider";

interface OneDriveProviderConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  siteId: string;
  driveId: string;
  rootItemId: string;
}

interface UploadSessionResponse {
  uploadUrl?: string;
  expirationDateTime?: string;
  nextExpectedRanges?: string[];
}

interface GraphDriveItem {
  id?: string;
  name?: string;
  size?: number;
  parentReference?: { driveId?: string; id?: string };
}

const GRAPH_SCOPE = "https://graph.microsoft.com/.default";
const DEFAULT_CHUNK_SIZE = 10 * 1024 * 1024;

export function assertValidOneDriveChunkSize(size: number): void {
  if (size <= 0 || size % (320 * 1024) !== 0) {
    throw new Error("OneDrive chunks must be a positive multiple of 320 KiB");
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter && /^\d+$/.test(retryAfter)) return Number(retryAfter) * 1000;
  return Math.min(250 * 2 ** attempt, 4000) + Math.floor(Math.random() * 100);
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class OneDriveStorageProvider implements StorageProvider {
  readonly kind = "onedrive" as const;
  private readonly credential: ClientSecretCredential | null;
  readonly chunkSize = DEFAULT_CHUNK_SIZE;

  constructor(
    private readonly config: OneDriveProviderConfig,
    private readonly request: typeof fetch = fetch,
    private readonly tokenProvider?: () => Promise<string>,
  ) {
    this.credential = tokenProvider
      ? null
      : new ClientSecretCredential(
          config.tenantId,
          config.clientId,
          config.clientSecret,
        );
    assertValidOneDriveChunkSize(this.chunkSize);
  }

  private async authorizationHeader(): Promise<string> {
    if (this.tokenProvider) return `Bearer ${await this.tokenProvider()}`;
    const token = await this.credential?.getToken(GRAPH_SCOPE);
    if (!token?.token)
      throw new StorageProviderError(
        "PROVIDER_FAILURE",
        "Microsoft Graph token acquisition failed",
      );
    return `Bearer ${token.token}`;
  }

  async createUploadSession(
    input: CreateStorageUploadInput,
  ): Promise<StorageUploadSession> {
    const name = `${input.audioFileId}${input.extension}`;
    const url = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(this.config.driveId)}/items/${encodeURIComponent(this.config.rootItemId)}:/${encodeURIComponent(name)}:/createUploadSession`;
    const response = await this.request(url, {
      method: "POST",
      headers: {
        Authorization: await this.authorizationHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        item: { "@microsoft.graph.conflictBehavior": "fail", name },
      }),
    });
    if (!response.ok)
      throw new StorageProviderError(
        "PROVIDER_FAILURE",
        "Microsoft Graph upload session creation failed",
      );
    const payload = (await response.json()) as UploadSessionResponse;
    if (!payload.uploadUrl)
      throw new StorageProviderError(
        "PROVIDER_FAILURE",
        "Microsoft Graph returned no upload session URL",
      );
    return {
      reference: {
        sessionId: input.sessionId,
        storageKey: name,
        uploadUrl: payload.uploadUrl,
        driveId: this.config.driveId,
        expiresAt: payload.expirationDateTime,
      },
      uploadedByteSize: 0,
    };
  }

  async getUploadStatus(
    reference: StorageUploadSessionReference,
  ): Promise<StorageUploadStatus> {
    if (!reference.uploadUrl)
      throw new StorageProviderError(
        "PROVIDER_FAILURE",
        "OneDrive upload session reference is incomplete",
      );
    const response = await this.request(reference.uploadUrl, { method: "GET" });
    if (response.status === 404 || response.status === 410) {
      return { uploadedByteSize: 0, completed: false, expired: true };
    }
    if (!response.ok)
      throw new StorageProviderError(
        "PROVIDER_FAILURE",
        "Microsoft Graph upload status failed",
      );
    const payload = (await response.json()) as UploadSessionResponse;
    const firstRange = payload.nextExpectedRanges?.[0] ?? "0-";
    const uploadedByteSize = Number(firstRange.split("-")[0] ?? 0);
    return {
      uploadedByteSize,
      completed: false,
      nextExpectedRanges: payload.nextExpectedRanges,
    };
  }

  async writeChunk(
    input: WriteStorageChunkInput,
  ): Promise<StorageUploadStatus> {
    const uploadUrl = input.reference.uploadUrl;
    if (!uploadUrl)
      throw new StorageProviderError(
        "PROVIDER_FAILURE",
        "OneDrive upload session reference is incomplete",
      );
    const chunk = await new Response(input.body).arrayBuffer();
    if (
      chunk.byteLength !== input.end - input.start + 1 ||
      chunk.byteLength > this.chunkSize ||
      (input.end + 1 < input.total && chunk.byteLength % (320 * 1024) !== 0)
    ) {
      throw new StorageProviderError(
        "INVALID_RANGE",
        "OneDrive chunk length is invalid",
      );
    }
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await this.request(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Length": String(chunk.byteLength),
          "Content-Range": `bytes ${input.start}-${input.end}/${input.total}`,
        },
        body: chunk,
      });
      if (response.status === 200 || response.status === 201) {
        const item = (await response.json()) as GraphDriveItem;
        input.reference.itemId = item.id;
        return { uploadedByteSize: input.total, completed: true };
      }
      if (response.status === 202) {
        const payload = (await response.json()) as UploadSessionResponse;
        const next = Number(
          payload.nextExpectedRanges?.[0]?.split("-")[0] ?? input.end + 1,
        );
        return {
          uploadedByteSize: next,
          completed: false,
          nextExpectedRanges: payload.nextExpectedRanges,
        };
      }
      if (response.status === 416) return this.getUploadStatus(input.reference);
      if (response.status === 404 || response.status === 410) {
        throw new StorageProviderError(
          "SESSION_EXPIRED",
          "OneDrive upload session expired",
        );
      }
      if (response.status !== 429 && response.status < 500) {
        throw new StorageProviderError(
          "PROVIDER_FAILURE",
          "OneDrive rejected the upload chunk",
        );
      }
      if (attempt === 3) break;
      await wait(retryDelay(response, attempt));
    }
    throw new StorageProviderError(
      "PROVIDER_FAILURE",
      "OneDrive upload failed after bounded retries",
    );
  }

  async abortUpload(reference: StorageUploadSessionReference): Promise<void> {
    if (!reference.uploadUrl) return;
    const response = await this.request(reference.uploadUrl, {
      method: "DELETE",
    });
    if (!response.ok && response.status !== 404 && response.status !== 410) {
      throw new StorageProviderError(
        "PROVIDER_FAILURE",
        "OneDrive upload cancellation failed",
      );
    }
  }

  async verifyCompletedUpload(
    input: VerifyCompletedUploadInput,
  ): Promise<StoredObject> {
    const driveId = input.reference.driveId;
    const itemId = input.reference.itemId;
    if (driveId !== this.config.driveId || !itemId) {
      throw new StorageProviderError(
        "PROVIDER_FAILURE",
        "OneDrive completion reference is invalid",
      );
    }
    const baseUrl = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`;
    const authorization = await this.authorizationHeader();
    const response = await this.request(baseUrl, {
      headers: { Authorization: authorization },
    });
    if (!response.ok)
      throw new StorageProviderError(
        "PROVIDER_FAILURE",
        "OneDrive item verification failed",
      );
    const item = (await response.json()) as GraphDriveItem;
    if (
      item.id !== itemId ||
      item.name !== input.reference.storageKey ||
      item.size !== input.expectedByteSize ||
      item.parentReference?.driveId !== this.config.driveId ||
      item.parentReference?.id !== this.config.rootItemId
    ) {
      throw new StorageProviderError(
        "SIZE_MISMATCH",
        "OneDrive item does not match the registered upload",
      );
    }
    const contentResponse = await this.request(`${baseUrl}/content`, {
      headers: { Authorization: authorization, Range: "bytes=0-8191" },
    });
    if (!contentResponse.ok)
      throw new StorageProviderError(
        "PROVIDER_FAILURE",
        "OneDrive signature verification failed",
      );
    let signature: Awaited<ReturnType<typeof assertAudioSignature>>;
    try {
      signature = await assertAudioSignature(
        new Uint8Array(await contentResponse.arrayBuffer()),
        input.extension,
      );
    } catch {
      throw new StorageProviderError(
        "INVALID_SIGNATURE",
        "OneDrive file signature is not a valid WAV or MP3",
      );
    }
    return {
      storageBackend: "onedrive",
      storageKey: input.reference.storageKey,
      byteSize: input.expectedByteSize,
      providerDriveId: driveId,
      providerItemId: itemId,
      ...signature,
    };
  }

  async deleteDraftObject(input: DeleteDraftObjectInput): Promise<void> {
    if (!input.reference.itemId) {
      await this.abortUpload(input.reference);
      return;
    }
    const url = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(this.config.driveId)}/items/${encodeURIComponent(input.reference.itemId)}`;
    const response = await this.request(url, {
      method: "DELETE",
      headers: { Authorization: await this.authorizationHeader() },
    });
    if (!response.ok && response.status !== 404) {
      throw new StorageProviderError(
        "PROVIDER_FAILURE",
        "OneDrive draft deletion failed",
      );
    }
  }

  async materializeStoredObject(
    input: MaterializeStoredObjectInput,
  ): Promise<MaterializedObject> {
    if (
      input.providerDriveId !== this.config.driveId ||
      !input.providerItemId
    ) {
      throw new StorageProviderError(
        "PROVIDER_FAILURE",
        "OneDrive source reference is invalid",
      );
    }
    const url = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(this.config.driveId)}/items/${encodeURIComponent(input.providerItemId)}/content`;
    const response = await this.request(url, {
      headers: { Authorization: await this.authorizationHeader() },
    });
    if (response.status === 404) {
      throw new StorageProviderError(
        "SOURCE_MISSING",
        "Stored source audio is unavailable",
      );
    }
    if (!response.ok || !response.body) {
      throw new StorageProviderError(
        "PROVIDER_FAILURE",
        "OneDrive source download failed",
      );
    }
    await mkdir(path.dirname(input.destinationPath), {
      recursive: true,
      mode: 0o700,
    });
    try {
      await pipeline(
        Readable.fromWeb(response.body as never),
        createWriteStream(input.destinationPath, { flags: "wx", mode: 0o600 }),
      );
      return {
        path: input.destinationPath,
        byteSize: (await stat(input.destinationPath)).size,
      };
    } catch (error) {
      await rm(input.destinationPath, { force: true });
      throw error;
    }
  }

  async openStoredObject(
    input: OpenStoredObjectInput,
  ): Promise<OpenedStoredObject> {
    if (
      input.start < 0 ||
      input.end < input.start ||
      !input.providerDriveId ||
      !input.providerItemId ||
      input.providerDriveId !== this.config.driveId
    ) {
      throw new StorageProviderError(
        "INVALID_RANGE",
        "OneDrive stored object range is invalid",
      );
    }
    const url = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(input.providerDriveId)}/items/${encodeURIComponent(input.providerItemId)}/content`;
    const controller = new AbortController();
    const response = await this.request(url, {
      headers: {
        Authorization: await this.authorizationHeader(),
        Range: `bytes=${input.start}-${input.end}`,
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (response.status === 404) {
      throw new StorageProviderError(
        "SOURCE_MISSING",
        "Stored source audio is unavailable",
      );
    }
    if (
      (response.status !== 200 && response.status !== 206) ||
      !response.body
    ) {
      throw new StorageProviderError(
        "PROVIDER_FAILURE",
        "Microsoft Graph audio read failed",
      );
    }
    return {
      body: response.body,
      contentLength: input.end - input.start + 1,
      abort: () => controller.abort(),
    };
  }

  async storeGeneratedObject(
    input: StoreGeneratedObjectInput,
  ): Promise<GeneratedStoredObject> {
    if (
      !/^generated\/(?:previews\/[0-9a-f-]+\.mp3|packages\/[0-9a-f-]+\.zip)$/.test(
        input.storageKey,
      )
    ) {
      throw new StorageProviderError(
        "PROVIDER_FAILURE",
        "Generated OneDrive storage key is invalid",
      );
    }
    const sessionUrl = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(this.config.driveId)}/items/${encodeURIComponent(this.config.rootItemId)}:/${input.storageKey
      .split("/")
      .map(encodeURIComponent)
      .join("/")}:/createUploadSession`;
    const created = await this.request(sessionUrl, {
      method: "POST",
      headers: {
        Authorization: await this.authorizationHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        item: {
          "@microsoft.graph.conflictBehavior": "fail",
          name: path.basename(input.storageKey),
        },
      }),
    });
    if (!created.ok) {
      throw new StorageProviderError(
        "PROVIDER_FAILURE",
        "Generated OneDrive upload session creation failed",
      );
    }
    const session = (await created.json()) as UploadSessionResponse;
    if (!session.uploadUrl) {
      throw new StorageProviderError(
        "PROVIDER_FAILURE",
        "Generated OneDrive upload session is incomplete",
      );
    }
    const handle = await open(input.sourcePath, "r");
    let offset = 0;
    let item: GraphDriveItem | null = null;
    try {
      while (offset < input.expectedByteSize) {
        const length = Math.min(
          this.chunkSize,
          input.expectedByteSize - offset,
        );
        const buffer = Buffer.allocUnsafe(length);
        const { bytesRead } = await handle.read(buffer, 0, length, offset);
        if (bytesRead !== length) {
          throw new StorageProviderError(
            "SIZE_MISMATCH",
            "Generated object changed during OneDrive upload",
          );
        }
        const end = offset + length - 1;
        const response = await this.request(session.uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Length": String(length),
            "Content-Range": `bytes ${offset}-${end}/${input.expectedByteSize}`,
          },
          body: buffer,
        });
        if (![200, 201, 202].includes(response.status)) {
          throw new StorageProviderError(
            "PROVIDER_FAILURE",
            "Generated OneDrive object upload failed",
          );
        }
        if (response.status !== 202)
          item = (await response.json()) as GraphDriveItem;
        offset += length;
      }
    } finally {
      await handle.close();
    }
    if (!item?.id || item.size !== input.expectedByteSize) {
      throw new StorageProviderError(
        "SIZE_MISMATCH",
        "Generated OneDrive item verification failed",
      );
    }
    return {
      storageBackend: "onedrive",
      storageKey: input.storageKey,
      byteSize: input.expectedByteSize,
      providerDriveId: this.config.driveId,
      providerItemId: item.id,
    };
  }

  async deleteGeneratedObject(
    input: DeleteGeneratedObjectInput,
  ): Promise<void> {
    if (
      input.providerDriveId !== this.config.driveId ||
      !input.providerItemId
    ) {
      throw new StorageProviderError(
        "PROVIDER_FAILURE",
        "Generated OneDrive reference is invalid",
      );
    }
    const url = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(this.config.driveId)}/items/${encodeURIComponent(input.providerItemId)}`;
    const response = await this.request(url, {
      method: "DELETE",
      headers: { Authorization: await this.authorizationHeader() },
    });
    if (!response.ok && response.status !== 404) {
      throw new StorageProviderError(
        "PROVIDER_FAILURE",
        "Generated OneDrive object deletion failed",
      );
    }
  }
}
