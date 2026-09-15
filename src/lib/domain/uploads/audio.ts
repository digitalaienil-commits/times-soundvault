import "server-only";

import type { CurrentUser } from "@/types/auth";
import {
  openStoredAudioRow,
  STORED_AUDIO_COLUMNS,
  STORED_AUDIO_PREDICATE,
  type StoredAudioRow,
} from "@/lib/audio/stored-audio";
import { getDatabase } from "@/lib/database/database";

import { canReadUploadSubmission } from "./authorization";

interface SubmissionAudioRow extends StoredAudioRow {
  owner_user_id: string;
}

/**
 * Streams a submission's own source audio to someone already allowed to see
 * that submission.
 *
 * The review route serves the same bytes but admits anyone holding the review
 * permission, because a reviewer works across every submission. This path is
 * for the submission page, which a Producer also opens, so the file is matched
 * to its submission first and the owner rule is applied to the row that came
 * back: a Producer hears their own Master and nobody else's.
 *
 * Source audio stays private and immutable; this reads a byte range and
 * nothing else.
 */
export async function openSubmissionAudio(
  submissionId: string,
  audioFileId: string,
  user: Pick<CurrentUser, "id" | "role">,
  rangeHeader: string | null,
) {
  const result = await getDatabase().query<SubmissionAudioRow>(
    `SELECT ${STORED_AUDIO_COLUMNS}, submission.owner_user_id
     FROM catalog.audio_file file
     LEFT JOIN workflow.upload_session upload ON upload.audio_file_id = file.id
     JOIN catalog.audio_asset asset ON asset.id = file.audio_asset_id
     JOIN workflow.submission_revision revision ON revision.id = asset.submission_revision_id
     JOIN workflow.submission submission ON submission.id = revision.submission_id
       AND submission.current_revision_id = revision.id
     WHERE file.id = $1 AND submission.id = $2 AND ${STORED_AUDIO_PREDICATE}`,
    [audioFileId, submissionId],
  );
  const row = result.rows[0];
  if (!row) return null;
  if (!canReadUploadSubmission(user, row.owner_user_id)) return null;
  return openStoredAudioRow(row, rangeHeader);
}
