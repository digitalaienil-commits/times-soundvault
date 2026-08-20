import { describe, expect, it } from "vitest";

import { mapTrackRow } from "./catalog/mapper";
import { mapRightsDeclarationRow } from "./rights/mapper";
import { mapSubmissionRow } from "./submissions/mapper";

const timestamp = new Date("2026-08-20T05:30:00.000Z");

describe("domain DTO mappers", () => {
  it("maps a database Track without exposing raw column names", () => {
    expect(
      mapTrackRow({
        id: "track-1",
        composition_id: null,
        parent_track_id: null,
        asset_kind: "music",
        title: null,
        description: null,
        version_type: "original",
        version_label: null,
        publication_status: "unpublished",
        published_revision_id: null,
        created_by_user_id: "user-1",
        published_at: null,
        row_version: "1",
        created_at: timestamp,
        updated_at: timestamp,
      }),
    ).toMatchObject({
      id: "track-1",
      title: null,
      publicationStatus: "unpublished",
      rowVersion: 1,
    });
  });

  it("rejects malformed domain rows instead of leaking unknown statuses", () => {
    expect(() =>
      mapSubmissionRow({
        id: "submission-1",
        track_id: "track-1",
        batch_id: null,
        owner_user_id: "user-1",
        status: "published",
        current_revision_id: null,
        latest_revision_number: 0,
        row_version: 1,
        title: null,
        asset_kind: "music",
        version_type: "original",
        created_at: timestamp,
        updated_at: timestamp,
      }),
    ).toThrowError(/invalid domain value/);
  });

  it("maps unknown rights without claiming copyright clearance", () => {
    expect(
      mapRightsDeclarationRow({
        id: "rights-1",
        submission_revision_id: "revision-1",
        master_rights_basis: "unknown",
        master_owner_name: null,
        composition_rights_basis: "unknown",
        composition_owner_name: null,
        publisher_name: null,
        territory: null,
        valid_from: null,
        valid_until: null,
        one_stop_clearance: null,
        content_id_eligibility: "unknown",
        source_reference: null,
        notes: null,
        declared_by_user_id: "user-1",
        created_at: timestamp,
        updated_at: timestamp,
      }),
    ).toMatchObject({
      masterRightsBasis: "unknown",
      contentIdEligibility: "unknown",
    });
  });
});
