/**
 * Rules for uploaded receipts and agreements (stored in the private bucket).
 * 4 MB keeps a multipart Server Action request under the 4.5 MB body limit of
 * Vercel Functions (the hosting target); larger files need direct-to-storage
 * uploads, which are a later step.
 */
export const MAX_FILE_BYTES = 4 * 1024 * 1024;

const allowed: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
};

export type FileProblem = "noFile" | "fileTooLarge" | "fileType";

/** Checks size, declared type and extension (both must agree). */
export function checkUpload(file: File | null | undefined): FileProblem | null {
  if (!file || file.size === 0) return "noFile";
  if (file.size > MAX_FILE_BYTES) return "fileTooLarge";
  const extensions = allowed[file.type];
  const name = file.name.toLowerCase();
  if (!extensions || !extensions.some((ext) => name.endsWith(ext))) return "fileType";
  return null;
}

/** A storage-safe file name: no folders, no odd characters. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "").slice(-80);
  return cleaned || "file";
}
