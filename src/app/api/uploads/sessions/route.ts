import { getDatabase } from "@/lib/database/database";
import { getApiUser, safeUploadError } from "@/lib/domain/uploads/api";
import { createUploadDraftBatch } from "@/lib/domain/uploads/repository";
import { parseStorageConfig } from "@/lib/storage/config";
import { createStorageProvider } from "@/lib/storage/factory";

export async function POST(request: Request) {
  const user = await getApiUser();
  if (user instanceof Response) return user;
  try {
    const input = await request.json();
    const config = parseStorageConfig();
    const created = await createUploadDraftBatch(
      getDatabase(),
      user,
      input,
      config,
      createStorageProvider(),
    );
    return Response.json(created, { status: 201 });
  } catch (error) {
    return safeUploadError(error);
  }
}
