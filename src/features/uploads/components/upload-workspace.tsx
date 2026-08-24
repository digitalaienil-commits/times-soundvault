"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CircleAlert,
  Pause,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  CreatedUploadBatch,
  PublicUploadConfig,
  StemType,
} from "@/types/uploads";
import { EDITORIAL_USES, NEWS_FORMATS, STEM_TYPES } from "@/types/uploads";

import {
  extensionForFilename,
  humanizeWorkingTitle,
  isInstrumentalFullMix,
  suggestFileAssignment,
} from "../grouping/grouping";
import { BatchSummary, formatBytes } from "./batch-summary";
import { FileDropZone } from "./file-drop-zone";
import { UploadStepper } from "./upload-stepper";

type ClientStatus =
  | "waiting"
  | "ready"
  | "uploading"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

interface SelectedUploadFile {
  clientId: string;
  file: File;
  groupId: string;
  role: "master" | "stem" | "unassigned";
  stemType: StemType | "";
  customStemLabel: string;
  sortOrder: number;
  validationError: string | null;
  sessionId?: string;
  submissionId?: string;
  uploadedBytes: number;
  status: ClientStatus;
  error?: string;
}

interface TrackGroupState {
  id: string;
  title: string;
  description: string;
  producerNotes: string;
  sourceReference: string;
  format: string;
  editorialUses: string[];
  underDialogue: "yes" | "no" | "unknown";
  loopable: "yes" | "no" | "unknown";
  endingType: "clean_stop" | "final_hit" | "fade" | "open" | "unknown";
  masterRightsBasis:
    "owned" | "exclusive_license" | "non_exclusive_license" | "unknown";
  compositionRightsBasis:
    "owned" | "exclusive_license" | "non_exclusive_license" | "unknown";
  rightsNotes: string;
}

function newGroup(id: string, title: string): TrackGroupState {
  return {
    id,
    title,
    description: "",
    producerNotes: "",
    sourceReference: "",
    format: "",
    editorialUses: [],
    underDialogue: "unknown",
    loopable: "unknown",
    endingType: "unknown",
    masterRightsBasis: "unknown",
    compositionRightsBasis: "unknown",
    rightsNotes: "",
  };
}

function validateBrowserFile(
  file: File,
  config: PublicUploadConfig,
): string | null {
  const extension = extensionForFilename(file.name);
  if (!extension) return "Only WAV and MP3 files are accepted";
  if (file.size === 0) return "Zero-byte files are not accepted";
  if (file.size > config.maxFileBytes)
    return `File exceeds ${formatBytes(config.maxFileBytes)}`;
  if (file.name.length > 255 || /[/\\\0]/.test(file.name))
    return "Filename is not safe";
  if (/\.(exe|js|html|zip)\.(wav|mp3)$/i.test(file.name))
    return "Double-extension files are not accepted";
  return null;
}

async function responseError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
}

export function UploadWorkspace({ config }: { config: PublicUploadConfig }) {
  const [step, setStep] = useState(1);
  const [files, setFiles] = useState<SelectedUploadFile[]>([]);
  const [groups, setGroups] = useState<TrackGroupState[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [createdBatch, setCreatedBatch] = useState<CreatedUploadBatch | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [online, setOnline] = useState(true);
  const [submittedIds, setSubmittedIds] = useState<string[]>([]);
  const idempotencyKeyRef = useRef(crypto.randomUUID());
  const abortControllers = useRef(new Map<string, AbortController>());

  const activeTransfers = files.some((file) => file.status === "uploading");

  useEffect(() => {
    setOnline(navigator.onLine);
    const handleOnline = () => {
      setOnline(true);
      setAnnouncement("Connection restored. Paused uploads can be resumed.");
    };
    const handleOffline = () => {
      setOnline(false);
      for (const controller of abortControllers.current.values())
        controller.abort();
      setFiles((current) =>
        current.map((file) =>
          file.status === "uploading" ? { ...file, status: "paused" } : file,
        ),
      );
      setAnnouncement(
        "You are offline. Active uploads are paused and the draft is preserved.",
      );
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!activeTransfers) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [activeTransfers]);

  const totalBytes = useMemo(
    () => files.reduce((total, item) => total + item.file.size, 0),
    [files],
  );
  const stemCount = files.filter((file) => file.role === "stem").length;

  const addFiles = useCallback(
    (incoming: File[]) => {
      if (incoming.length === 0) return;
      const existingNames = new Set(
        files.map((item) => `${item.file.name}:${item.file.size}`),
      );
      const fresh = incoming.filter(
        (file) => !existingNames.has(`${file.name}:${file.size}`),
      );
      const singleUnassigned = files.length === 0 && fresh.length === 1;
      const groupAdditions = new Map<string, TrackGroupState>();
      const additions = fresh.map((file, index): SelectedUploadFile => {
        const clientId = crypto.randomUUID();
        const suggestion = suggestFileAssignment({
          clientId,
          name: file.name,
          size: file.size,
          type: file.type,
        });
        const groupId = singleUnassigned
          ? crypto.randomUUID()
          : (suggestion.groupKey ?? "");
        if (
          groupId &&
          !groups.some((group) => group.id === groupId) &&
          !groupAdditions.has(groupId)
        ) {
          groupAdditions.set(
            groupId,
            newGroup(
              groupId,
              singleUnassigned
                ? humanizeWorkingTitle(file.name)
                : humanizeWorkingTitle(`${suggestion.groupKey}_MASTER.wav`),
            ),
          );
        }
        return {
          clientId,
          file,
          groupId,
          role: singleUnassigned ? "master" : suggestion.suggestedRole,
          stemType: suggestion.suggestedStemType ?? "",
          customStemLabel: "",
          sortOrder: files.length + index,
          validationError: validateBrowserFile(file, config),
          uploadedBytes: 0,
          status: "waiting",
        };
      });
      if (groupAdditions.size > 0)
        setGroups((current) => [...current, ...groupAdditions.values()]);
      setFiles((current) => [...current, ...additions]);
    },
    [config, files, groups],
  );

  const groupingErrors = useMemo(() => {
    const errors: string[] = [];
    if (files.some((file) => !file.groupId || file.role === "unassigned"))
      errors.push("Every file needs a Track and Master/Stem assignment.");
    for (const group of groups) {
      const grouped = files.filter((file) => file.groupId === group.id);
      const masters = grouped.filter((file) => file.role === "master");
      if (grouped.length > 0 && masters.length !== 1)
        errors.push(`${group.title} needs exactly one Master.`);
      if (grouped.some((file) => file.role === "stem" && !file.stemType))
        errors.push(`${group.title} has a Stem without a type.`);
      if (
        grouped.some(
          (file) => file.stemType === "other" && !file.customStemLabel.trim(),
        )
      )
        errors.push(`${group.title} has an Other Stem without a label.`);
      if (
        grouped.filter((file) => file.role === "stem").length >
        config.maxStemsPerTrack
      )
        errors.push(`${group.title} exceeds the Stem limit.`);
    }
    return [...new Set(errors)];
  }, [config.maxStemsPerTrack, files, groups]);

  const makePayload = useCallback(
    () => ({
      idempotencyKey: idempotencyKeyRef.current,
      label:
        groups.length > 1
          ? `Bulk upload — ${groups.length} tracks`
          : groups[0]?.title,
      acknowledgementAccepted: acknowledged,
      packages: groups
        .filter((group) => files.some((file) => file.groupId === group.id))
        .map((group) => ({
          clientId: group.id,
          workingTitle: group.title,
          files: files
            .filter((file) => file.groupId === group.id)
            .map((item, index) => ({
              clientId: item.clientId,
              originalFilename: item.file.name,
              byteSize: item.file.size,
              claimedMime: item.file.type || "application/octet-stream",
              extension: extensionForFilename(item.file.name),
              role: item.role,
              stemType: item.role === "stem" ? item.stemType : undefined,
              customStemLabel:
                item.role === "stem"
                  ? item.customStemLabel || undefined
                  : undefined,
              sortOrder: index,
            })),
          producerMetadata: {
            workingTitle: group.title,
            description: group.description || undefined,
            producerNotes: group.producerNotes || undefined,
            internalSourceReference: group.sourceReference || undefined,
            format: group.format || undefined,
            editorialUses: group.editorialUses,
            underDialogue: group.underDialogue,
            loopable: group.loopable,
            endingType: group.endingType,
          },
          rights: {
            masterRightsBasis: group.masterRightsBasis,
            compositionRightsBasis: group.compositionRightsBasis,
            notes: group.rightsNotes || undefined,
            contentIdEligibility: "unknown",
          },
        })),
    }),
    [acknowledged, files, groups],
  );

  const saveDraft = useCallback(async (): Promise<CreatedUploadBatch> => {
    if (createdBatch) return createdBatch;
    setSaving(true);
    try {
      const response = await fetch("/api/uploads/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makePayload()),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const created = (await response.json()) as CreatedUploadBatch;
      const byClientId = new Map(
        created.files.map((item) => [item.clientId, item]),
      );
      setFiles((current) =>
        current.map((item) => {
          const createdFile = byClientId.get(item.clientId);
          return createdFile
            ? {
                ...item,
                sessionId: createdFile.session.id,
                submissionId: createdFile.submissionId,
                uploadedBytes: createdFile.session.uploadedByteSize,
                status:
                  createdFile.session.status === "failed" ? "failed" : "ready",
              }
            : item;
        }),
      );
      setCreatedBatch(created);
      setAnnouncement(
        "Draft saved. The upload can be resumed from My Uploads.",
      );
      return created;
    } finally {
      setSaving(false);
    }
  }, [createdBatch, makePayload]);

  const uploadOne = useCallback(
    async (clientId: string, sessionOverride?: string) => {
      const item = files.find((file) => file.clientId === clientId);
      const sessionId = sessionOverride ?? item?.sessionId;
      if (!item || !sessionId || !online) return;
      const controller = new AbortController();
      abortControllers.current.set(clientId, controller);
      setFiles((current) =>
        current.map((file) =>
          file.clientId === clientId
            ? { ...file, status: "uploading", error: undefined }
            : file,
        ),
      );
      setAnnouncement(`Upload started for ${item.file.name}.`);
      try {
        const statusResponse = await fetch(`/api/uploads/${sessionId}/status`, {
          signal: controller.signal,
        });
        if (!statusResponse.ok)
          throw new Error(await responseError(statusResponse));
        const statusPayload = (await statusResponse.json()) as {
          session: { uploadedByteSize: number; status: string };
        };
        let offset = statusPayload.session.uploadedByteSize;
        if (statusPayload.session.status === "completed") {
          setFiles((current) =>
            current.map((file) =>
              file.clientId === clientId
                ? {
                    ...file,
                    status: "completed",
                    uploadedBytes: file.file.size,
                  }
                : file,
            ),
          );
          return;
        }
        const chunkSize = 10 * 1024 * 1024;
        while (offset < item.file.size) {
          const current = files.find((file) => file.clientId === clientId);
          if (current?.status === "paused" || controller.signal.aborted) return;
          const endExclusive = Math.min(offset + chunkSize, item.file.size);
          const chunk = item.file.slice(offset, endExclusive);
          let response: Response | null = null;
          for (let attempt = 0; attempt < 4; attempt += 1) {
            response = await fetch(`/api/uploads/${sessionId}/chunk`, {
              method: "PUT",
              headers: {
                "Content-Range": `bytes ${offset}-${endExclusive - 1}/${item.file.size}`,
              },
              body: chunk,
              signal: controller.signal,
            });
            if (response.ok) break;
            if (response.status !== 429 && response.status < 500) break;
            const retryAfter =
              Number(response.headers.get("retry-after") ?? 0) * 1000;
            await new Promise((resolve) =>
              setTimeout(
                resolve,
                retryAfter || Math.min(250 * 2 ** attempt, 3000),
              ),
            );
          }
          if (!response?.ok)
            throw new Error(
              response ? await responseError(response) : "Upload failed",
            );
          const payload = (await response.json()) as {
            session: { uploadedByteSize: number };
          };
          offset = payload.session.uploadedByteSize;
          setFiles((currentFiles) =>
            currentFiles.map((file) =>
              file.clientId === clientId
                ? { ...file, uploadedBytes: offset }
                : file,
            ),
          );
        }
        const complete = await fetch(`/api/uploads/${sessionId}/complete`, {
          method: "POST",
          signal: controller.signal,
        });
        if (!complete.ok) throw new Error(await responseError(complete));
        setFiles((current) =>
          current.map((file) =>
            file.clientId === clientId
              ? { ...file, status: "completed", uploadedBytes: file.file.size }
              : file,
          ),
        );
        setAnnouncement(`Upload completed for ${item.file.name}.`);
      } catch (error) {
        if ((error as DOMException).name === "AbortError") return;
        setFiles((current) =>
          current.map((file) =>
            file.clientId === clientId
              ? {
                  ...file,
                  status: "failed",
                  error:
                    error instanceof Error ? error.message : "Upload failed",
                }
              : file,
          ),
        );
        setAnnouncement(`Upload failed for ${item.file.name}.`);
      } finally {
        abortControllers.current.delete(clientId);
      }
    },
    [files, online],
  );

  const startUpload = async () => {
    if (!acknowledged) return;
    try {
      const batch = await saveDraft();
      const submissionIds = [
        ...new Set(batch.submissions.map((item) => item.submissionId)),
      ];
      await Promise.all(
        submissionIds.map(async (submissionId) => {
          const response = await fetch(
            `/api/submissions/${submissionId}/acknowledge`,
            { method: "POST" },
          );
          if (!response.ok) throw new Error(await responseError(response));
        }),
      );
      const queue = batch.files.map((item) => item.clientId);
      const sessionsByClientId = new Map(
        batch.files.map((item) => [item.clientId, item.session.id]),
      );
      let cursor = 0;
      const worker = async () => {
        while (cursor < queue.length) {
          const clientId = queue[cursor++];
          if (clientId)
            await uploadOne(clientId, sessionsByClientId.get(clientId));
        }
      };
      await Promise.all(
        Array.from(
          { length: Math.min(config.concurrency, queue.length) },
          worker,
        ),
      );
      setAnnouncement(
        "Batch transfer finished. Completed Track packages can now be submitted.",
      );
    } catch (error) {
      setAnnouncement(
        error instanceof Error ? error.message : "Upload could not start",
      );
    }
  };

  const pauseTransfer = async (item: SelectedUploadFile) => {
    if (!item.sessionId) return;
    abortControllers.current.get(item.clientId)?.abort();
    await fetch(`/api/uploads/${item.sessionId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pause" }),
    });
    setFiles((current) =>
      current.map((file) =>
        file.clientId === item.clientId ? { ...file, status: "paused" } : file,
      ),
    );
    setAnnouncement(`Upload paused for ${item.file.name}.`);
  };

  const cancelTransfer = async (item: SelectedUploadFile) => {
    if (!item.sessionId) return;
    abortControllers.current.get(item.clientId)?.abort();
    const response = await fetch(`/api/uploads/${item.sessionId}/cancel`, {
      method: "POST",
    });
    if (!response.ok) {
      setAnnouncement(await responseError(response));
      return;
    }
    setFiles((current) =>
      current.map((file) =>
        file.clientId === item.clientId
          ? { ...file, status: "cancelled" }
          : file,
      ),
    );
    setAnnouncement(`Upload cancelled for ${item.file.name}.`);
  };

  const submitTrack = async (submissionId: string) => {
    const response = await fetch(`/api/submissions/${submissionId}/submit`, {
      method: "POST",
    });
    if (!response.ok) {
      setAnnouncement(await responseError(response));
      return;
    }
    setSubmittedIds((current) => [...current, submissionId]);
    setAnnouncement("Track submitted for processing.");
  };

  const updateGroup = (groupId: string, update: Partial<TrackGroupState>) => {
    setGroups((current) =>
      current.map((group) =>
        group.id === groupId ? { ...group, ...update } : group,
      ),
    );
  };

  const canContinueFromFiles =
    files.length > 0 &&
    files.every((file) => !file.validationError) &&
    totalBytes <= config.maxBatchBytes;

  return (
    <div className="mt-8 space-y-6">
      <UploadStepper currentStep={step} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <main className="min-w-0 rounded-xl border border-border bg-surface p-4 shadow-soft sm:p-6">
          {step === 1 ? (
            <div className="space-y-5">
              <FileDropZone
                onFiles={addFiles}
                disabled={Boolean(createdBatch)}
              />
              {files.length > 0 ? (
                <div className="overflow-hidden rounded-xl border border-border">
                  <div className="hidden grid-cols-[minmax(0,1fr)_8rem_10rem_3rem] gap-3 bg-muted px-4 py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase sm:grid">
                    <span>File</span>
                    <span>Size</span>
                    <span>Status</span>
                    <span className="sr-only">Action</span>
                  </div>
                  <ul className="divide-y divide-border">
                    {files.map((item) => (
                      <li
                        key={item.clientId}
                        className="grid gap-2 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_8rem_10rem_3rem] sm:items-center sm:gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium break-all">
                            {item.file.name}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.file.type || "MIME not supplied"}
                          </p>
                        </div>
                        <span className="text-sm text-muted-foreground tabular-nums">
                          {formatBytes(item.file.size)}
                        </span>
                        <span
                          className={`text-sm font-medium ${item.validationError ? "text-destructive" : "text-success"}`}
                        >
                          {item.validationError ?? "Accepted for verification"}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-lg"
                          aria-label={`Remove ${item.file.name}`}
                          disabled={Boolean(createdBatch)}
                          onClick={() =>
                            setFiles((current) =>
                              current.filter(
                                (file) => file.clientId !== item.clientId,
                              ),
                            )
                          }
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {totalBytes > config.maxBatchBytes ? (
                <p role="alert" className="text-sm text-destructive">
                  The batch exceeds {formatBytes(config.maxBatchBytes)}.
                </p>
              ) : null}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Organize Tracks</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Filename suggestions are editable. Every package needs
                    exactly one Master.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  onClick={() => {
                    const id = crypto.randomUUID();
                    setGroups((current) => [
                      ...current,
                      newGroup(id, `Track ${current.length + 1}`),
                    ]);
                  }}
                >
                  <Plus aria-hidden="true" />
                  New Track
                </Button>
              </div>
              <ul className="space-y-4">
                {files.map((item, fileIndex) => (
                  <li
                    key={item.clientId}
                    className="rounded-xl border border-border p-4"
                  >
                    <p className="font-medium break-all">{item.file.name}</p>
                    {isInstrumentalFullMix(item.file.name) ? (
                      <p className="mt-1 text-xs text-warning">
                        Instrumental full mixes are separate Tracks, not Stems.
                      </p>
                    ) : null}
                    <div className="mt-4 grid gap-4 sm:grid-cols-3">
                      <label className="text-sm font-medium">
                        Track
                        <select
                          className="mt-2 h-11 w-full rounded-lg border border-input bg-surface px-3"
                          value={item.groupId}
                          onChange={(event) =>
                            setFiles((current) =>
                              current.map((file) =>
                                file.clientId === item.clientId
                                  ? { ...file, groupId: event.target.value }
                                  : file,
                              ),
                            )
                          }
                        >
                          <option value="">Needs assignment</option>
                          {groups.map((group) => (
                            <option key={group.id} value={group.id}>
                              {group.title}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm font-medium">
                        File role
                        <select
                          className="mt-2 h-11 w-full rounded-lg border border-input bg-surface px-3"
                          value={item.role}
                          onChange={(event) =>
                            setFiles((current) =>
                              current.map((file) =>
                                file.clientId === item.clientId
                                  ? {
                                      ...file,
                                      role: event.target
                                        .value as SelectedUploadFile["role"],
                                      stemType:
                                        event.target.value === "master"
                                          ? ""
                                          : file.stemType,
                                    }
                                  : file,
                              ),
                            )
                          }
                        >
                          <option value="unassigned">Needs assignment</option>
                          <option value="master">Master</option>
                          <option value="stem">Stem</option>
                        </select>
                      </label>
                      {item.role === "stem" ? (
                        <label className="text-sm font-medium">
                          Stem type
                          <select
                            className="mt-2 h-11 w-full rounded-lg border border-input bg-surface px-3"
                            value={item.stemType}
                            onChange={(event) =>
                              setFiles((current) =>
                                current.map((file) =>
                                  file.clientId === item.clientId
                                    ? {
                                        ...file,
                                        stemType: event.target
                                          .value as StemType,
                                      }
                                    : file,
                                ),
                              )
                            }
                          >
                            <option value="">Select type</option>
                            {STEM_TYPES.map((type) => (
                              <option key={type} value={type}>
                                {type.replaceAll("_", " ")}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <div />
                      )}
                    </div>
                    {item.stemType === "other" ? (
                      <label className="mt-4 block text-sm font-medium">
                        Custom Stem label
                        <Input
                          className="mt-2"
                          value={item.customStemLabel}
                          maxLength={80}
                          onChange={(event) =>
                            setFiles((current) =>
                              current.map((file) =>
                                file.clientId === item.clientId
                                  ? {
                                      ...file,
                                      customStemLabel: event.target.value,
                                    }
                                  : file,
                              ),
                            )
                          }
                        />
                      </label>
                    ) : null}
                    {item.role === "stem" ? (
                      <div className="mt-3 flex gap-2">
                        <Button
                          type="button"
                          size="icon-lg"
                          variant="ghost"
                          aria-label={`Move ${item.file.name} up`}
                          disabled={fileIndex === 0}
                          onClick={() =>
                            setFiles((current) => {
                              const copy = [...current];
                              [copy[fileIndex - 1], copy[fileIndex]] = [
                                copy[fileIndex]!,
                                copy[fileIndex - 1]!,
                              ];
                              return copy;
                            })
                          }
                        >
                          <ArrowUp aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          size="icon-lg"
                          variant="ghost"
                          aria-label={`Move ${item.file.name} down`}
                          disabled={fileIndex === files.length - 1}
                          onClick={() =>
                            setFiles((current) => {
                              const copy = [...current];
                              [copy[fileIndex], copy[fileIndex + 1]] = [
                                copy[fileIndex + 1]!,
                                copy[fileIndex]!,
                              ];
                              return copy;
                            })
                          }
                        >
                          <ArrowDown aria-hidden="true" />
                        </Button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
              {groupingErrors.length > 0 ? (
                <div
                  role="alert"
                  className="rounded-lg border border-warning/40 bg-muted p-4"
                >
                  <p className="font-medium">Resolve before review</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {groupingErrors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold">Optional Details</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Only the working title is populated from the Master filename.
                  Everything else may stay unknown.
                </p>
              </div>
              {groups
                .filter((group) =>
                  files.some((file) => file.groupId === group.id),
                )
                .map((group, index) => (
                  <details
                    key={group.id}
                    open={index === 0}
                    className="rounded-xl border border-border p-4 sm:p-5"
                  >
                    <summary className="min-h-11 cursor-pointer py-2 font-semibold">
                      {group.title}
                    </summary>
                    <div className="mt-4 grid gap-5">
                      <label className="text-sm font-medium">
                        Working title
                        <Input
                          className="mt-2"
                          value={group.title}
                          onChange={(event) =>
                            updateGroup(group.id, { title: event.target.value })
                          }
                        />
                      </label>
                      <label className="text-sm font-medium">
                        Description
                        <textarea
                          className="mt-2 min-h-24 w-full rounded-lg border border-input bg-surface p-3 text-sm"
                          value={group.description}
                          onChange={(event) =>
                            updateGroup(group.id, {
                              description: event.target.value,
                            })
                          }
                        />
                      </label>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="text-sm font-medium">
                          News format
                          <select
                            className="mt-2 h-11 w-full rounded-lg border border-input bg-surface px-3"
                            value={group.format}
                            onChange={(event) =>
                              updateGroup(group.id, {
                                format: event.target.value,
                              })
                            }
                          >
                            <option value="">Not supplied</option>
                            {NEWS_FORMATS.map((value) => (
                              <option key={value} value={value}>
                                {value.replaceAll("_", " ")}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-sm font-medium">
                          Internal source / reference
                          <Input
                            className="mt-2"
                            value={group.sourceReference}
                            onChange={(event) =>
                              updateGroup(group.id, {
                                sourceReference: event.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                      <fieldset>
                        <legend className="text-sm font-medium">
                          Editorial use (optional)
                        </legend>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {EDITORIAL_USES.map((value) => (
                            <label
                              key={value}
                              className="flex min-h-11 items-center gap-3 rounded-lg border border-border px-3 text-sm"
                            >
                              <input
                                type="checkbox"
                                checked={group.editorialUses.includes(value)}
                                onChange={(event) =>
                                  updateGroup(group.id, {
                                    editorialUses: event.target.checked
                                      ? [...group.editorialUses, value]
                                      : group.editorialUses.filter(
                                          (item) => item !== value,
                                        ),
                                  })
                                }
                              />
                              {value.replaceAll("_", " ")}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      <div className="grid gap-4 sm:grid-cols-3">
                        {(
                          [
                            ["Under dialogue", "underDialogue"],
                            ["Loopable", "loopable"],
                          ] as const
                        ).map(([label, key]) => (
                          <label key={key} className="text-sm font-medium">
                            {label}
                            <select
                              className="mt-2 h-11 w-full rounded-lg border border-input bg-surface px-3"
                              value={group[key]}
                              onChange={(event) =>
                                updateGroup(group.id, {
                                  [key]: event.target.value,
                                } as Partial<TrackGroupState>)
                              }
                            >
                              <option value="unknown">Unknown</option>
                              <option value="yes">Yes</option>
                              <option value="no">No</option>
                            </select>
                          </label>
                        ))}
                        <label className="text-sm font-medium">
                          Ending type
                          <select
                            className="mt-2 h-11 w-full rounded-lg border border-input bg-surface px-3"
                            value={group.endingType}
                            onChange={(event) =>
                              updateGroup(group.id, {
                                endingType: event.target
                                  .value as TrackGroupState["endingType"],
                              })
                            }
                          >
                            {[
                              "unknown",
                              "clean_stop",
                              "final_hit",
                              "fade",
                              "open",
                            ].map((value) => (
                              <option key={value} value={value}>
                                {value.replaceAll("_", " ")}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <details className="rounded-lg bg-muted p-4">
                        <summary className="min-h-11 cursor-pointer py-2 font-medium">
                          Rights and source declaration
                        </summary>
                        <div className="mt-3 grid gap-4 sm:grid-cols-2">
                          {(
                            [
                              ["Master recording rights", "masterRightsBasis"],
                              ["Composition rights", "compositionRightsBasis"],
                            ] as const
                          ).map(([label, key]) => (
                            <label key={key} className="text-sm font-medium">
                              {label}
                              <select
                                className="mt-2 h-11 w-full rounded-lg border border-input bg-surface px-3"
                                value={group[key]}
                                onChange={(event) =>
                                  updateGroup(group.id, {
                                    [key]: event.target.value,
                                  } as Partial<TrackGroupState>)
                                }
                              >
                                {[
                                  "unknown",
                                  "owned",
                                  "exclusive_license",
                                  "non_exclusive_license",
                                ].map((value) => (
                                  <option key={value} value={value}>
                                    {value.replaceAll("_", " ")}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ))}
                        </div>
                        <label className="mt-4 block text-sm font-medium">
                          Rights notes
                          <textarea
                            className="mt-2 min-h-20 w-full rounded-lg border border-input bg-surface p-3"
                            value={group.rightsNotes}
                            onChange={(event) =>
                              updateGroup(group.id, {
                                rightsNotes: event.target.value,
                              })
                            }
                          />
                        </label>
                        <p className="mt-3 text-xs leading-5 text-muted-foreground">
                          These are Producer declarations for internal review.
                          They do not prove ownership or copyright clearance.
                        </p>
                      </details>
                    </div>
                  </details>
                ))}
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold">Review & Upload</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Confirm the package structure before saving the draft or
                  transferring files.
                </p>
              </div>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {groups
                  .filter((group) =>
                    files.some((file) => file.groupId === group.id),
                  )
                  .map((group) => {
                    const groupFiles = files.filter(
                      (file) => file.groupId === group.id,
                    );
                    return (
                      <li key={group.id} className="p-4 sm:p-5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold">{group.title}</p>
                          <span className="text-sm text-muted-foreground">
                            1 Master ·{" "}
                            {
                              groupFiles.filter((file) => file.role === "stem")
                                .length
                            }{" "}
                            Stems
                          </span>
                        </div>
                        <ul className="mt-3 space-y-2">
                          {groupFiles.map((item) => (
                            <li
                              key={item.clientId}
                              className="flex flex-col gap-2 rounded-lg bg-muted px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <span className="text-sm break-all">
                                {item.file.name}
                              </span>
                              <span className="text-xs font-medium text-muted-foreground">
                                {item.role === "stem"
                                  ? item.stemType?.replaceAll("_", " ")
                                  : "Master"}{" "}
                                · {formatBytes(item.file.size)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    );
                  })}
              </ul>
              <label className="flex min-h-14 items-start gap-3 rounded-xl border border-border p-4 text-sm leading-6">
                <input
                  className="mt-1 size-4"
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                />
                <span>
                  I confirm that I am authorised to submit these files for
                  internal review.
                  <span className="mt-1 block text-xs text-muted-foreground">
                    This acknowledgement does not prove ownership or mark
                    copyright clear.
                  </span>
                </span>
              </label>
              {!online ? (
                <p
                  role="status"
                  className="rounded-lg border border-warning/40 bg-muted p-4 text-sm"
                >
                  Offline — transfers are paused. Your saved draft remains
                  available.
                </p>
              ) : null}
              {files.some((file) => file.sessionId) ? (
                <div aria-label="Transfer progress" className="space-y-3">
                  {files
                    .filter((file) => file.sessionId)
                    .map((item) => {
                      const progress =
                        item.file.size > 0
                          ? Math.round(
                              (item.uploadedBytes / item.file.size) * 100,
                            )
                          : 0;
                      return (
                        <div
                          key={item.clientId}
                          className="rounded-lg border border-border p-4"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-medium break-all">
                                {item.file.name}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {item.status === "completed"
                                  ? "Files received"
                                  : item.status}{" "}
                                · {formatBytes(item.uploadedBytes)} /{" "}
                                {formatBytes(item.file.size)}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {item.status === "uploading" ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-11"
                                  onClick={() => pauseTransfer(item)}
                                >
                                  <Pause aria-hidden="true" />
                                  Pause
                                </Button>
                              ) : null}
                              {item.status === "paused" ||
                              item.status === "failed" ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-11"
                                  onClick={() => uploadOne(item.clientId)}
                                >
                                  <RotateCcw aria-hidden="true" />
                                  Retry
                                </Button>
                              ) : null}
                              {item.status !== "completed" &&
                              item.status !== "cancelled" ? (
                                <Button
                                  type="button"
                                  variant="destructive"
                                  className="h-11"
                                  onClick={() => cancelTransfer(item)}
                                >
                                  <Trash2 aria-hidden="true" />
                                  Cancel
                                </Button>
                              ) : null}
                            </div>
                          </div>
                          <div
                            className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
                            role="progressbar"
                            aria-label={`Upload progress for ${item.file.name}`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={progress}
                          >
                            <div
                              className="h-full bg-brand transition-[width]"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          {item.error ? (
                            <p
                              role="alert"
                              className="mt-2 text-sm text-destructive"
                            >
                              {item.error}
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                </div>
              ) : null}
              {createdBatch ? (
                <div className="rounded-xl border border-border p-4">
                  <p className="font-medium">Draft batch saved</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Batch {createdBatch.batchId.slice(0, 8)} is persisted.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button asChild variant="outline" className="h-11">
                      <Link href={`/upload/${createdBatch.batchId}`}>
                        Open saved batch
                      </Link>
                    </Button>
                    {createdBatch.submissions.map((submission) => {
                      const complete = files
                        .filter(
                          (file) =>
                            file.submissionId === submission.submissionId,
                        )
                        .every((file) => file.status === "completed");
                      return complete &&
                        !submittedIds.includes(submission.submissionId) ? (
                        <Button
                          key={submission.submissionId}
                          type="button"
                          className="h-11"
                          onClick={() => submitTrack(submission.submissionId)}
                        >
                          Submit {submission.title} for Processing
                        </Button>
                      ) : submittedIds.includes(submission.submissionId) ? (
                        <span
                          key={submission.submissionId}
                          className="flex min-h-11 items-center text-sm font-medium text-success"
                        >
                          {submission.title}: Submitted
                        </span>
                      ) : null;
                    })}
                  </div>
                </div>
              ) : null}
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 flex-1"
                  disabled={saving || Boolean(createdBatch)}
                  onClick={() =>
                    saveDraft().catch((error) =>
                      setAnnouncement(
                        error instanceof Error
                          ? error.message
                          : "Draft could not be saved",
                      ),
                    )
                  }
                >
                  {saving ? "Saving…" : "Save Draft"}
                </Button>
                <Button
                  type="button"
                  className="h-12 flex-1"
                  disabled={
                    !acknowledged ||
                    saving ||
                    !online ||
                    files.every((file) => file.status === "completed")
                  }
                  onClick={startUpload}
                >
                  {activeTransfers ? "Uploading…" : "Start Upload"}
                </Button>
              </div>
            </div>
          ) : null}

          <div className="mt-8 flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={step === 1 || activeTransfers}
              onClick={() => setStep((current) => Math.max(1, current - 1))}
            >
              <ArrowLeft aria-hidden="true" />
              Back
            </Button>
            {step < 4 ? (
              <Button
                type="button"
                className="h-11"
                disabled={
                  (step === 1 && !canContinueFromFiles) ||
                  (step === 2 && groupingErrors.length > 0)
                }
                onClick={() => setStep((current) => Math.min(4, current + 1))}
              >
                Continue
                <ArrowRight aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        </main>
        <BatchSummary
          tracks={
            groups.filter((group) =>
              files.some((file) => file.groupId === group.id),
            ).length
          }
          files={files.length}
          stems={stemCount}
          bytes={totalBytes}
          storageLabel={config.storageDisplayLabel}
        />
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
      {announcement &&
      /failed|could not|invalid|exceed|denied/i.test(announcement) ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-surface p-4 text-sm text-destructive"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {announcement}
        </div>
      ) : null}
    </div>
  );
}
