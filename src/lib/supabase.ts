import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CaptureRecord } from "@/lib/capture-storage";
import { loadAttachment } from "@/lib/attachment-storage";

type CloudAttachment = { id: string; capture_id: string; storage_path: string; original_name: string; mime_type: string; size_bytes: number };

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const supabaseConfigured = Boolean(url && key);

let singleton: SupabaseClient | null = null;
export function getSupabase(): SupabaseClient | null {
  if (!url || !key) return null;
  if (!singleton) singleton = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return singleton;
}

export async function loadCloudCaptures(userId: string): Promise<CaptureRecord[]> {
  const client = getSupabase();
  if (!client) throw new Error("Supabase is not configured.");
  const [capturesResult, relationsResult, attachmentsResult] = await Promise.all([
    client.from("captures").select("id,type,title,original_content,created_at,updated_at,project_status").eq("user_id", userId).order("created_at", { ascending: false }),
    client.from("capture_relations").select("source_capture_id,target_capture_id,relationship_type").eq("user_id", userId),
    client.from("capture_attachments").select("id,capture_id,storage_path,original_name,mime_type,size_bytes").eq("user_id", userId),
  ]);
  if (capturesResult.error) throw capturesResult.error;
  if (relationsResult.error) throw relationsResult.error;
  if (attachmentsResult.error) throw attachmentsResult.error;
  const projectLinks = new Map<string, string[]>();
  const relatedLinks = new Map<string, string[]>();
  for (const link of relationsResult.data ?? []) {
    const map = link.relationship_type === "in_project" ? projectLinks : link.relationship_type === "related_knowledge" ? relatedLinks : null;
    if (map) map.set(link.source_capture_id, [...(map.get(link.source_capture_id) ?? []), link.target_capture_id]);
  }
  const attachments = new Map<string, CloudAttachment[]>();
  for (const file of attachmentsResult.data ?? []) attachments.set(file.capture_id, [...(attachments.get(file.capture_id) ?? []), file]);
  return (capturesResult.data ?? []).map((row) => ({
    id: row.id, type: row.type, title: row.title, content: row.original_content,
    createdAt: row.created_at, updatedAt: row.updated_at,
    ...(row.project_status ? { projectStatus: row.project_status } : {}),
    ...(projectLinks.has(row.id) ? { projectIds: projectLinks.get(row.id) } : {}),
    ...(relatedLinks.has(row.id) ? { relatedIds: relatedLinks.get(row.id) } : {}),
    ...(attachments.has(row.id) ? { attachments: attachments.get(row.id)!.map((file) => ({ id: file.id, name: file.original_name, mimeType: file.mime_type, size: Number(file.size_bytes), storagePath: file.storage_path })) } : {}),
  } as CaptureRecord));
}

export async function saveCloudCapture(userId: string, capture: CaptureRecord): Promise<void> {
  const client = getSupabase();
  if (!client) throw new Error("Supabase is not configured.");
  await upsertCaptureRows(userId, [capture]);

  const relations = [
    ...(capture.projectIds ?? []).map((id) => ({ user_id: userId, source_capture_id: capture.id, target_capture_id: id, relationship_type: "in_project" })),
    ...(capture.relatedIds ?? []).map((id) => ({ user_id: userId, source_capture_id: capture.id, target_capture_id: id, relationship_type: "related_knowledge" })),
  ];
  const { error: clearError } = await client.from("capture_relations").delete().eq("user_id", userId).eq("source_capture_id", capture.id);
  if (clearError) throw clearError;
  if (relations.length) {
    const { error: relationError } = await client.from("capture_relations").upsert(relations, { onConflict: "user_id,source_capture_id,target_capture_id,relationship_type" });
    if (relationError) throw relationError;
  }

  for (const attachment of capture.attachments ?? []) {
    const existing = await client.from("capture_attachments").select("id").eq("user_id", userId).eq("id", attachment.id).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) continue;
    const blob = await loadAttachment(attachment.id);
    if (!blob) throw new Error(`Attachment “${attachment.name}” is missing on this device. Re-add it before syncing.`);
    if (blob.size > 18 * 1024 * 1024) throw new Error(`“${attachment.name}” exceeds this bucket’s 18 MB per-file limit.`);
    const ext = attachment.mimeType === "image/webp" ? "webp" : attachment.mimeType === "image/jpeg" ? "jpg" : attachment.mimeType.split("/")[1]?.replace("x-", "") || "bin";
    const path = `${userId}/${capture.id}/${attachment.id}.${ext}`;
    const { error: uploadError } = await client.storage.from("myos-private").upload(path, blob, { contentType: attachment.mimeType, upsert: true });
    if (uploadError) throw uploadError;
    const { error: metadataError } = await client.from("capture_attachments").insert({
      id: attachment.id, user_id: userId, capture_id: capture.id, storage_path: path,
      original_name: attachment.name, mime_type: attachment.mimeType, size_bytes: attachment.size,
    });
    if (metadataError) throw metadataError;
  }

  const retainedIds = new Set((capture.attachments ?? []).map((item) => item.id));
  const priorFiles = await client.from("capture_attachments").select("id,storage_path").eq("user_id", userId).eq("capture_id", capture.id);
  if (priorFiles.error) throw priorFiles.error;
  const removedFiles = (priorFiles.data ?? []).filter((file) => !retainedIds.has(file.id));
  if (removedFiles.length) {
    const { error: storageError } = await client.storage.from("myos-private").remove(removedFiles.map((file) => file.storage_path));
    if (storageError) throw storageError;
    const { error: metadataError } = await client.from("capture_attachments").delete().eq("user_id", userId).in("id", removedFiles.map((file) => file.id));
    if (metadataError) throw metadataError;
  }
}

export async function upsertCaptureRows(userId: string, captures: CaptureRecord[]): Promise<void> {
  if (!captures.length) return;
  const client = getSupabase();
  if (!client) throw new Error("Supabase is not configured.");
  const { error } = await client.from("captures").upsert(captures.map((capture) => ({
    id: capture.id, user_id: userId, type: capture.type, title: capture.title,
    original_content: capture.content, created_at: capture.createdAt, updated_at: capture.updatedAt,
    project_status: capture.type === "Project" ? capture.projectStatus ?? "Active" : null,
  })), { onConflict: "id" });
  if (error) throw error;
}

export async function deleteCloudCapture(userId: string, captureId: string): Promise<void> {
  const client = getSupabase();
  if (!client) throw new Error("Supabase is not configured.");
  const files = await client.from("capture_attachments").select("storage_path").eq("user_id", userId).eq("capture_id", captureId);
  if (files.error) throw files.error;
  if (files.data?.length) {
    const { error } = await client.storage.from("myos-private").remove(files.data.map((file) => file.storage_path));
    if (error) throw error;
  }
  const { error } = await client.from("captures").delete().eq("user_id", userId).eq("id", captureId);
  if (error) throw error;
}

export async function getCloudAttachmentUrl(storagePath: string): Promise<string> {
  const client = getSupabase();
  if (!client) throw new Error("Supabase is not configured.");
  const { data, error } = await client.storage.from("myos-private").createSignedUrl(storagePath, 3600);
  if (error) throw error;
  return data.signedUrl;
}
