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
  | "Task"
  | "Person";

export type CaptureRecord = {
  id: string;
  title: string;
  content: string;
  type: CaptureType;
  createdAt: string;
  updatedAt: string;
};

const STORAGE_KEY = "myos.captures.v1";
const captureTypes = new Set<CaptureType>([
  "Capture", "Knowledge", "Idea", "Project", "Decision", "Milestone",
  "Goal", "Journal", "Book", "Resource", "Task", "Person",
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
    && typeof record.updatedAt === "string";
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
