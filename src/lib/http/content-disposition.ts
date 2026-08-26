import path from "node:path";

const RESERVED = /[<>:"/\\|?*\u0000-\u001f\u007f]/g;
const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:[._]|$)/i;

export function safeDownloadFilename(
  preferred: string,
  fallbackExtension?: string,
): string {
  const base = path.basename(preferred).normalize("NFC");
  let clean = base
    .replace(RESERVED, "_")
    .replace(/[. ]+$/g, "")
    .trim();
  if (!clean) clean = `soundvault-download${fallbackExtension ?? ""}`;
  if (WINDOWS_RESERVED.test(clean)) clean = `_${clean}`;
  const extension = path.extname(clean);
  const stem = clean.slice(0, Math.max(0, clean.length - extension.length));
  return `${stem.slice(0, Math.max(1, 160 - extension.length))}${extension}`;
}

export function contentDisposition(
  disposition: "inline" | "attachment",
  preferred: string,
): string {
  const safe = safeDownloadFilename(preferred);
  const ascii =
    safe
      .normalize("NFKD")
      .replace(/[^\x20-\x7e]/g, "_")
      .replace(/["\\]/g, "_") || "soundvault-download";
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}
