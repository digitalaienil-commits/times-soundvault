import "server-only";

import { getDatabase } from "@/lib/database/database";
import {
  openStoredAudioRow,
  parseAudioByteRange,
  STORED_AUDIO_COLUMNS,
  STORED_AUDIO_PREDICATE,
  type StoredAudioRow,
} from "@/lib/audio/stored-audio";

export { parseAudioByteRange };
export type { ByteRange } from "@/lib/audio/stored-audio";

export async function openReviewAudio(
  audioFileId: string,
  rangeHeader: string | null,
) {
  const result = await getDatabase().query<StoredAudioRow>(
    `SELECT ${STORED_AUDIO_COLUMNS}
     FROM catalog.audio_file file
     LEFT JOIN workflow.upload_session upload ON upload.audio_file_id = file.id
     JOIN catalog.audio_asset asset ON asset.id = file.audio_asset_id
     JOIN workflow.submission_revision revision ON revision.id = asset.submission_revision_id
     JOIN workflow.submission submission ON submission.id = revision.submission_id
       AND submission.current_revision_id = revision.id
     WHERE file.id = $1 AND ${STORED_AUDIO_PREDICATE}
       AND submission.status IN ('ready_for_review', 'in_review')`,
    [audioFileId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return openStoredAudioRow(row, rangeHeader);
}
