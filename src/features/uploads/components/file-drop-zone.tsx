"use client";

import { useRef, useState } from "react";
import { FileAudio, UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";

interface FileDropZoneProps {
  onFiles(files: File[]): void;
  disabled?: boolean;
}

export function FileDropZone({ onFiles, disabled }: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <div
      className={`rounded-xl border-2 border-dashed px-5 py-10 text-center transition-colors ${
        dragging ? "border-brand bg-brand-soft" : "border-border bg-surface"
      }`}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        onFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <input
        ref={inputRef}
        id="soundvault-files"
        type="file"
        accept=".wav,.mp3,audio/wav,audio/x-wav,audio/wave,audio/vnd.wave,audio/mpeg"
        multiple
        aria-label="Choose WAV or MP3 files"
        disabled={disabled}
        className="sr-only"
        onChange={(event) => {
          onFiles(Array.from(event.currentTarget.files ?? []));
          event.currentTarget.value = "";
        }}
      />
      <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-muted text-brand">
        {dragging ? (
          <FileAudio aria-hidden="true" />
        ) : (
          <UploadCloud aria-hidden="true" />
        )}
      </div>
      <h2 className="mt-5 text-lg font-semibold text-foreground">
        Add WAV or MP3 files
      </h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
        Drag files here or use the labelled file picker. Masters and optional
        stems can be organized in the next step.
      </p>
      <Button
        type="button"
        size="lg"
        className="mt-5 h-11 px-5"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        Choose files
      </Button>
    </div>
  );
}
