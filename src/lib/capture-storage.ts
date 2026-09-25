export type CaptureType =
  | "Capture"
  | "Knowledge"
  | "Idea"
  | "Project"
  | "Decision"
  | "Milestone"
  | "Goal"
  | "Journal"
  | "Book"
  | "Resource"
  | "Media"
  | "Task"
  | "Person";

export type CaptureRecord = {
  id: string;
  title: string;
  content: string;
  type: CaptureType;
  createdAt: string;
  updatedAt: string;
  /** Optional links keep older local records readable. */
  projectIds?: string[];
  relatedIds?: string[];
  projectStatus?: ProjectStatus;
  attachments?: CaptureAttachment[];
};

export type CaptureAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  /** Present for files stored in the private Supabase bucket. */
  storagePath?: string;
};

export type ProjectStatus = "Idea" | "Planning" | "Active" | "Paused" | "Completed" | "Cancelled" | "Archived";

const STORAGE_KEY = "myos.captures.v1";
const captureTypes = new Set<CaptureType>([
  "Capture", "Knowledge", "Idea", "Project", "Decision", "Milestone",
  "Goal", "Journal", "Book", "Resource", "Media", "Task", "Person",
]);

function isCaptureRecord(value: unknown): value is CaptureRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string"
    && typeof record.title === "string"
    && typeof record.content === "string"
    && typeof record.type === "string"
    && captureTypes.has(record.type as CaptureType)
    && typeof record.createdAt === "string"
    && typeof record.updatedAt === "string"
    && (record.projectIds === undefined || (Array.isArray(record.projectIds) && record.projectIds.every((id) => typeof id === "string")))
    && (record.relatedIds === undefined || (Array.isArray(record.relatedIds) && record.relatedIds.every((id) => typeof id === "string")))
    && (record.projectStatus === undefined || ["Idea", "Planning", "Active", "Paused", "Completed", "Cancelled", "Archived"].includes(record.projectStatus as string))
    && (record.attachments === undefined || (Array.isArray(record.attachments) && record.attachments.length <= 5 && record.attachments.every((attachment) => {
      if (!attachment || typeof attachment !== "object") return false;
      const file = attachment as Record<string, unknown>;
      return typeof file.id === "string" && typeof file.name === "string" && typeof file.mimeType === "string"
        && (file.mimeType.startsWith("image/") || file.mimeType.startsWith("audio/"))
        && typeof file.size === "number" && Number.isFinite(file.size) && file.size >= 0 && file.size <= 24 * 1024 * 1024;
    }) && record.attachments.reduce((sum, attachment) => sum + (attachment as CaptureAttachment).size, 0) <= 24 * 1024 * 1024));
}

export function loadCaptures(): CaptureRecord[] {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("Saved captures are not in a readable format.");
  if (!parsed.every(isCaptureRecord)) throw new Error("Saved captures are not in a readable format.");
  return parsed;
}

export function storeCaptures(captures: CaptureRecord[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(captures));
}
