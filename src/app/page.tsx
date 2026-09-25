"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import type { FormEvent, KeyboardEvent } from "react";
import { CaptureAttachment, CaptureRecord, CaptureType, loadCaptures, ProjectStatus, storeCaptures } from "@/lib/capture-storage";
import { loadAttachment, removeAttachment, storeAttachment } from "@/lib/attachment-storage";
import { AudioRecordingSession, normalizeMedia, startAudioRecording } from "@/lib/media-normalizer";
import { deleteCloudCapture, getCloudAttachmentUrl, getSupabase, loadCloudCaptures, saveCloudCapture, supabaseConfigured, upsertCaptureRows } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

const captureTypes: CaptureType[] = ["Capture", "Knowledge", "Idea", "Project", "Decision", "Milestone", "Goal", "Journal", "Book", "Resource", "Task", "Person"];
const navigation = ["Home", "Timeline", "Knowledge", "Projects", "Decisions", "Milestones", "Ideas"];
type TimelineView = "year" | "month" | "day";
const projectStatuses: ProjectStatus[] = ["Idea", "Planning", "Active", "Paused", "Completed", "Cancelled", "Archived"];
const MAX_CAPTURE_ATTACHMENTS = 5;
const MAX_CAPTURE_ATTACHMENT_BYTES = 24 * 1024 * 1024;

type AttachmentDraft = { attachment: CaptureAttachment; blob: Blob; previewUrl: string };

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRecordingTime(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function localDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function timelineRangeLabel(value: string, view: TimelineView): string {
  const date = new Date(`${value}T12:00:00`);
  if (view === "year") return new Intl.DateTimeFormat(undefined, { year: "numeric" }).format(date);
  if (view === "month") return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(date);
  return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(date);
}
const icons: Record<string, string> = { Home: "⌂", Timeline: "◷", Knowledge: "▤", Projects: "▱", Decisions: "◇", Milestones: "✳", Ideas: "✧" };

function SearchIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="1.7"/><path d="m16 16 4.2 4.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
}

function dateLabel(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toDateString() === date.toDateString();
  const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
  if (sameDay) return time;
  if (yesterday) return `Yesterday · ${time}`;
  return `${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date)} · ${time}`;
}

export default function Home() {
  const [captures, setCaptures] = useState<CaptureRecord[]>([]);
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!supabaseConfigured);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [localImportCount, setLocalImportCount] = useState(0);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [active, setActive] = useState("Home");
  const [query, setQuery] = useState("");
  const [commandQuery, setCommandQuery] = useState("");
  const [captureOpen, setCaptureOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState<CaptureType>("Capture");
  const [projectStatus, setProjectStatus] = useState<ProjectStatus>("Active");
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [relatedIds, setRelatedIds] = useState<string[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<CaptureAttachment[]>([]);
  const [newAttachments, setNewAttachments] = useState<AttachmentDraft[]>([]);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const [attachmentError, setAttachmentError] = useState("");
  const [processingMedia, setProcessingMedia] = useState(false);
  const [savingCapture, setSavingCapture] = useState(false);
  const [recordingAudio, setRecordingAudio] = useState(false);
  const [recordingStartedAt, setRecordingStartedAt] = useState(0);
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<CaptureRecord | null>(null);
  const [timelineView, setTimelineView] = useState<TimelineView>("month");
  const [timelineDate, setTimelineDate] = useState("");
  const [timelineType, setTimelineType] = useState("All types");
  const editor = useRef<HTMLTextAreaElement>(null);
  const attachmentInput = useRef<HTMLInputElement>(null);
  const audioRecording = useRef<AudioRecordingSession | null>(null);
  const preservedLocalCaptures = useRef<CaptureRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    const client = getSupabase();
    const readLocal = () => {
      try {
        const local = loadCaptures();
        preservedLocalCaptures.current = local;
        return local;
      }
      catch {
        setStorageBlocked(true);
        setStorageError("Saved data could not be read. It remains in this browser and was not changed.");
        return [];
      }
    };
    let localCache: CaptureRecord[] = [];
    let activeUser: User | null = null;
    if (!client) {
      localCache = readLocal();
      setCaptures(localCache);
      setReady(true);
      return;
    }
    void client.auth.getSession().then(async ({ data, error }) => {
      if (error) throw error;
      if (cancelled) return;
      const signedInUser = data.session?.user ?? null;
      activeUser = signedInUser;
      setUser(signedInUser);
      if (!signedInUser) { setReady(true); return; }
      const local = readLocal();
      localCache = local;
      const remote = await loadCloudCaptures(signedInUser.id);
      if (cancelled) return;
      setCaptures(remote);
      setLocalImportCount(local.filter((item) => !remote.some((cloud) => cloud.id === item.id)).length);
      setReady(true);
    }).catch((error: unknown) => {
      if (cancelled) return;
      setCaptures(localCache);
      if (activeUser) setLocalImportCount(localCache.length);
      setStorageError(error instanceof Error ? `Supabase could not be reached: ${error.message}` : "Supabase could not be reached.");
      setReady(true);
    }).finally(() => { if (!cancelled) setAuthReady(true); });
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      setUser(session?.user ?? null);
      if (!session?.user) {
        if (event === "SIGNED_OUT") {
          setCaptures([]);
          setLocalImportCount(0);
          setReady(true);
        }
      } else if (event === "SIGNED_IN") {
        // Let the auth callback release its internal lock before making data requests.
        window.setTimeout(() => {
          if (cancelled) return;
          const local = readLocal();
          void loadCloudCaptures(session.user.id).then((remote) => {
            if (cancelled) return;
            setCaptures(remote);
            setLocalImportCount(local.filter((item) => !remote.some((cloud) => cloud.id === item.id)).length);
            setReady(true);
          }).catch((error: unknown) => {
            if (cancelled) return;
            setCaptures(local);
            setLocalImportCount(local.length);
            setStorageError(error instanceof Error ? `Supabase could not be reached: ${error.message}` : "Supabase could not be reached.");
            setReady(true);
          });
        }, 0);
      }
    });
    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);


  useEffect(() => {
    if (captureOpen) editor.current?.focus();
  }, [captureOpen]);

  useEffect(() => {
    if (!selected?.attachments?.length) return;
    let cancelled = false;
    const urls: Record<string, string> = {};
    Promise.all(selected.attachments.map(async (attachment) => {
      try {
        const blob = attachment.storagePath ? null : await loadAttachment(attachment.id);
        if (attachment.storagePath) urls[attachment.id] = await getCloudAttachmentUrl(attachment.storagePath);
        else if (blob) urls[attachment.id] = URL.createObjectURL(blob);
      } catch {
        // A missing local file is surfaced as unavailable in the detail view.
      }
    })).then(() => {
      if (cancelled) Object.values(urls).forEach(URL.revokeObjectURL);
      else setAttachmentUrls(urls);
    });
    return () => {
      cancelled = true;
      Object.values(urls).forEach(URL.revokeObjectURL);
    };
  }, [selected]);

  useEffect(() => {
    if (!recordingAudio || !recordingStartedAt) return;
    const interval = window.setInterval(() => setRecordingElapsed(Math.floor((Date.now() - recordingStartedAt) / 1000)), 500);
    return () => window.clearInterval(interval);
  }, [recordingAudio, recordingStartedAt]);

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (event.key === "Escape") {
        setCommandOpen(false);
        discardCapture();
        setSelected(null);
      }
      if (event.key.toLowerCase() === "n" && !event.ctrlKey && !event.metaKey && !isTyping(event.target)) {
        event.preventDefault();
        openNewCapture();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const visibleCaptures = useMemo(() => captures
    .filter((item) => {
      const text = `${item.title} ${item.content} ${item.type}`.toLowerCase();
      const matchesQuery = text.includes(query.trim().toLowerCase());
      const typeForSection: Record<string, CaptureType> = { Knowledge: "Knowledge", Projects: "Project", Decisions: "Decision", Milestones: "Milestone", Ideas: "Idea" };
      const matchesSection = active === "Home" || active === "Search" || active === "Timeline"
        || item.type === typeForSection[active];
      return matchesQuery && matchesSection;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [captures, query, active]);
  const projects = useMemo(() => captures.filter((item) => item.type === "Project").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [captures]);

  function linkedToProject(projectId: string) {
    return captures.filter((item) => item.id !== projectId && (item.projectIds ?? []).includes(projectId))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  function relatedKnowledge(capture: CaptureRecord) {
    const ids = new Set(capture.relatedIds ?? []);
    return captures.filter((item) => item.type === "Knowledge" && item.id !== capture.id
      && (ids.has(item.id) || (item.relatedIds ?? []).includes(capture.id)));
  }

  const timelineCaptures = useMemo(() => {
    if (active !== "Timeline") return visibleCaptures;
    const selectedDate = timelineDate || localDateValue(new Date());
    const [year, month] = selectedDate.split("-").map(Number);
    return visibleCaptures.filter((item) => {
      const date = new Date(item.createdAt);
      const dateMatches = timelineView === "year" ? date.getFullYear() === year
        : timelineView === "month" ? date.getFullYear() === year && date.getMonth() + 1 === month
        : localDateValue(date) === selectedDate;
      return dateMatches && (timelineType === "All types" || item.type === timelineType);
    });
  }, [active, timelineDate, timelineType, timelineView, visibleCaptures]);

  const captureGroups = useMemo(() => {
    const items = active === "Timeline" ? timelineCaptures : visibleCaptures;
    const groups = new Map<string, CaptureRecord[]>();
    for (const item of items) {
      const localDate = localDateValue(new Date(item.createdAt));
      const key = active !== "Timeline" ? "recent" : timelineView === "year" ? localDate.slice(0, 7) : localDate;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return [...groups.entries()].map(([key, captures]) => {
      const date = new Date(`${key.length === 7 ? `${key}-01` : key}T12:00:00`);
      const label = active !== "Timeline" ? "" : timelineView === "year"
        ? new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(date)
        : new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(date);
      return { key, label, captures };
    });
  }, [active, timelineCaptures, timelineView, visibleCaptures]);

  function showTimeline() {
    setTimelineDate((current) => current || localDateValue(new Date()));
    setActive("Timeline");
    setQuery("");
  }

  function moveTimeline(direction: -1 | 1) {
    const selectedDate = timelineDate || localDateValue(new Date());
    const date = new Date(`${selectedDate}T12:00:00`);
    if (timelineView === "year" || timelineView === "month") {
      const day = date.getDate();
      date.setDate(1);
      if (timelineView === "year") date.setFullYear(date.getFullYear() + direction);
      else date.setMonth(date.getMonth() + direction);
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      date.setDate(Math.min(day, lastDay));
    } else {
      date.setDate(date.getDate() + direction);
    }
    setTimelineDate(localDateValue(date));
  }

  function isTyping(target: EventTarget | null) {
    return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
  }

  function persistCaptures(next: CaptureRecord[]): boolean {
    if (storageBlocked) return false;
    try {
      const nextIds = new Set(next.map((item) => item.id));
      const preserved = user ? preservedLocalCaptures.current.filter((item) => !nextIds.has(item.id)) : [];
      storeCaptures([...preserved, ...next]);
      setCaptures(next);
      setStorageError("");
      return true;
    } catch {
      setStorageError("This browser could not save your latest changes. Copy any new text before closing this page.");
      return false;
    }
  }

  async function signInWithPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (authBusy) return;
    const client = getSupabase();
    if (!client || !authEmail.trim() || !authPassword) return;
    setAuthBusy(true);
    setAuthMessage("");
    const { error } = await client.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword });
    if (error) {
      setAuthMessage(error.message === "Invalid login credentials" ? "That email and password combination was not recognized." : error.message);
      setAuthBusy(false);
    }
  }

  async function importLocalCaptures() {
    if (!user || cloudBusy) return;
    setCloudBusy(true);
    setStorageError("");
    try {
      const local = loadCaptures();
      const knownIds = new Set(captures.map((item) => item.id));
      const additions = local.filter((item) => !knownIds.has(item.id));
      await upsertCaptureRows(user.id, additions);
      for (const capture of additions) await saveCloudCapture(user.id, capture);
      const merged = [...additions, ...captures];
      if (!persistCaptures(merged)) throw new Error("Cloud import finished, but this browser could not update its local copy.");
      preservedLocalCaptures.current = [];
      setLocalImportCount(0);
      setStorageError(additions.length ? `${additions.length} local ${additions.length === 1 ? "capture was" : "captures were"} added to your account.` : "There are no new local captures to import.");
    } catch (error) {
      setStorageError(error instanceof Error ? `Import stopped safely: ${error.message}` : "Import stopped safely. Your local data remains unchanged.");
    } finally { setCloudBusy(false); }
  }

  function clearDraftAttachments() {
    newAttachments.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setNewAttachments([]);
  }

  function discardCapture(force = false) {
    if (!force && (processingMedia || savingCapture || recordingAudio)) return;
    setCaptureOpen(false);
    setEditingId(null);
    setExistingAttachments([]);
    clearDraftAttachments();
    setAttachmentError("");
    setProcessingMedia(false);
    setRecordingAudio(false);
    audioRecording.current?.cancel();
    audioRecording.current = null;
  }

  async function addMedia(files: FileList | null) {
    if (!files) return;
    const remaining = MAX_CAPTURE_ATTACHMENTS - existingAttachments.length - newAttachments.length;
    if (remaining <= 0) {
      setAttachmentError(`A capture can have up to ${MAX_CAPTURE_ATTACHMENTS} attachments.`);
      return;
    }
    const selectedFiles = Array.from(files).slice(0, remaining);
    setAttachmentError("");
    setProcessingMedia(true);
    let totalBytes = existingAttachments.reduce((sum, item) => sum + item.size, 0)
      + newAttachments.reduce((sum, item) => sum + item.attachment.size, 0);
    const processed: AttachmentDraft[] = [];
    try {
      for (const file of selectedFiles) {
        const normalized = await normalizeMedia(file);
        if (totalBytes + normalized.blob.size > MAX_CAPTURE_ATTACHMENT_BYTES) {
          setAttachmentError("Attachments on one capture must stay under 24 MB after optimization.");
          continue;
        }
        const attachment: CaptureAttachment = {
          id: crypto.randomUUID(), name: normalized.name, mimeType: normalized.mimeType, size: normalized.blob.size,
        };
        processed.push({ attachment, blob: normalized.blob, previewUrl: URL.createObjectURL(normalized.blob) });
        totalBytes += normalized.blob.size;
      }
      setNewAttachments((current) => [...current, ...processed]);
      if (files.length > selectedFiles.length) setAttachmentError(`Only ${MAX_CAPTURE_ATTACHMENTS} attachments are allowed per capture.`);
    } catch (error) {
      processed.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      setAttachmentError(error instanceof Error ? error.message : "This file could not be optimized.");
    } finally {
      setProcessingMedia(false);
      if (attachmentInput.current) attachmentInput.current.value = "";
    }
  }

  async function finishRecording(session = audioRecording.current) {
    if (!session) return;
    audioRecording.current = null;
    setRecordingAudio(false);
    setProcessingMedia(true);
    setAttachmentError("");
    try {
      const normalized = await session.stop();
      const totalBytes = existingAttachments.reduce((sum, item) => sum + item.size, 0)
        + newAttachments.reduce((sum, item) => sum + item.attachment.size, 0);
      if (existingAttachments.length + newAttachments.length >= MAX_CAPTURE_ATTACHMENTS) {
        throw new Error(`A capture can have up to ${MAX_CAPTURE_ATTACHMENTS} attachments.`);
      }
      if (totalBytes + normalized.blob.size > MAX_CAPTURE_ATTACHMENT_BYTES) {
        throw new Error("Attachments on one capture must stay under 24 MB after optimization.");
      }
      const attachment: CaptureAttachment = { id: crypto.randomUUID(), name: normalized.name, mimeType: normalized.mimeType, size: normalized.blob.size };
      setNewAttachments((current) => [...current, { attachment, blob: normalized.blob, previewUrl: URL.createObjectURL(normalized.blob) }]);
      setRecordingElapsed(0);
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : "The recording could not be saved.");
    } finally {
      setProcessingMedia(false);
    }
  }

  async function beginRecording() {
    if (processingMedia || savingCapture || recordingAudio || existingAttachments.length + newAttachments.length >= MAX_CAPTURE_ATTACHMENTS) return;
    setAttachmentError("");
    setProcessingMedia(true);
    try {
      const session = await startAudioRecording(() => {
        const current = audioRecording.current;
        if (current) {
          setAttachmentError("The 5-minute recording limit was reached. Saving the audio…");
          void finishRecording(current);
        }
      });
      audioRecording.current = session;
      setRecordingStartedAt(Date.now());
      setRecordingElapsed(0);
      setRecordingAudio(true);
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : "The microphone could not be opened.");
    } finally {
      setProcessingMedia(false);
    }
  }

  function openNewCapture(nextType: CaptureType = "Capture") {
    setEditingId(null);
    setTitle("");
    setContent("");
    setType(nextType);
    setProjectStatus("Active");
    setProjectIds([]);
    setRelatedIds([]);
    setExistingAttachments([]);
    clearDraftAttachments();
    setAttachmentError("");
    setCaptureOpen(true);
    setSelected(null);
    setCommandOpen(false);
  }

  function editCapture(capture: CaptureRecord) {
    setEditingId(capture.id);
    setTitle(capture.title);
    setContent(capture.content);
    setType(capture.type);
    setProjectStatus(capture.projectStatus ?? "Active");
    setProjectIds(capture.projectIds ?? []);
    setRelatedIds(capture.type === "Knowledge" ? captures.filter((item) => item.type === "Knowledge" && item.id !== capture.id
      && ((capture.relatedIds ?? []).includes(item.id) || (item.relatedIds ?? []).includes(capture.id))).map((item) => item.id) : []);
    setExistingAttachments(capture.attachments ?? []);
    clearDraftAttachments();
    setAttachmentError("");
    setSelected(null);
    setCaptureOpen(true);
  }

  function removeNewAttachment(id: string) {
    const item = newAttachments.find((attachment) => attachment.attachment.id === id);
    if (item) URL.revokeObjectURL(item.previewUrl);
    setNewAttachments((current) => current.filter((attachment) => attachment.attachment.id !== id));
  }

  async function saveCapture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingCapture || processingMedia || storageBlocked || (!title.trim() && !content.trim() && !existingAttachments.length && !newAttachments.length)) return;
    const cleanTitle = title.trim() || content.trim().split("\n")[0].slice(0, 80) || newAttachments[0]?.attachment.name || existingAttachments[0]?.name || "Untitled capture";
    const now = new Date().toISOString();
    const storedIds: string[] = [];
    setSavingCapture(true);
    setAttachmentError("");
    try {
      for (const item of newAttachments) {
        await storeAttachment(item.attachment.id, item.blob);
        storedIds.push(item.attachment.id);
      }
      const attachmentList = [...existingAttachments, ...newAttachments.map((item) => item.attachment)];
      let next: CaptureRecord[];
      if (editingId) {
        next = captures.map((item) => item.id === editingId
          ? { ...item, title: cleanTitle, content: content.trim(), type, updatedAt: now,
            attachments: attachmentList.length ? attachmentList : undefined,
            projectStatus: type === "Project" ? projectStatus : undefined,
            projectIds: type === "Project" ? [] : projectIds,
            relatedIds: type === "Knowledge" ? relatedIds : [] }
          : item);
      } else {
        const capture: CaptureRecord = {
          id: crypto.randomUUID(),
          title: cleanTitle,
          content: content.trim(),
          type,
          createdAt: now,
          updatedAt: now,
          ...(attachmentList.length ? { attachments: attachmentList } : {}),
          ...(type === "Project" ? { projectStatus } : { projectIds }),
          ...(type === "Knowledge" ? { relatedIds } : {}),
        };
        next = [capture, ...captures];
      }
      if (!persistCaptures(next)) throw new Error("The capture could not be saved. Your existing attachment files were kept.");
      if (user) {
        const savedCapture = next.find((item) => item.id === (editingId ?? next[0]?.id));
        if (savedCapture) {
          try { await saveCloudCapture(user.id, savedCapture); }
          catch (error) { setStorageError(`Saved on this device, but cloud sync failed: ${error instanceof Error ? error.message : "please retry"}`); }
        }
      }

      const removedAttachments = editingId
        ? (captures.find((item) => item.id === editingId)?.attachments ?? []).filter((item) => !attachmentList.some((current) => current.id === item.id))
        : [];
      await Promise.allSettled(removedAttachments.map((item) => removeAttachment(item.id)));
      discardCapture(true);
      setActive("Home");
      setQuery("");
    } catch (error) {
      await Promise.all(storedIds.map((id) => removeAttachment(id).catch(() => undefined)));
      setAttachmentError(error instanceof Error ? error.message : "The capture or attachment could not be saved.");
    } finally {
      setSavingCapture(false);
    }
  }

  function deleteCapture(capture: CaptureRecord) {
    if (storageBlocked) return;
    if (!window.confirm(`Delete “${capture.title}”? This cannot be undone.`)) return;
    const saved = persistCaptures(captures.filter((item) => item.id !== capture.id).map((item) => ({
      ...item,
      projectIds: item.projectIds?.filter((id) => id !== capture.id),
      relatedIds: item.relatedIds?.filter((id) => id !== capture.id),
    })));
    if (!saved) return;
    void Promise.all((capture.attachments ?? []).map((item) => removeAttachment(item.id).catch(() => undefined)));
    if (user) void deleteCloudCapture(user.id, capture.id).catch((error: unknown) => setStorageError(`Deleted locally, but cloud delete failed: ${error instanceof Error ? error.message : "please retry"}`));
    setSelected(null);
  }

  function selectCommand(command: string) {
    if (command === "Search") {
      setActive("Search");
      setCommandOpen(false);
      setCommandQuery("");
      window.setTimeout(() => document.getElementById("global-search")?.focus(), 0);
      return;
    }
    openNewCapture(command as CaptureType);
  }

  function handleCommandKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      const command = commandQuery.trim().replace(/^\//, "");
      const match = captureTypes.find((candidate) => candidate.toLowerCase() === command.toLowerCase());
      if (match) selectCommand(match);
      else if (command.toLowerCase() === "search") {
        setQuery("");
        setActive("Search");
        setCommandOpen(false);
      } else if (command) {
        setQuery(command);
        setActive("Search");
        setCommandOpen(false);
      }
    }
  }

  return (
    supabaseConfigured && authReady && !user ? <main className="auth-shell"><form className="auth-panel" onSubmit={signInWithPassword}><div className="brand auth-brand"><span className="brand-mark">m</span><span>myos<span className="brand-period">.</span></span></div><div className="eyebrow"><span className="eyebrow-line"/> PRIVATE PERSONAL ARCHIVE</div><h1>Sign in to your space.</h1><p>Your captures stay private to your account and sync across your devices.</p><label htmlFor="auth-email">Email address</label><input id="auth-email" type="email" autoComplete="username" required value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="you@example.com"/><label htmlFor="auth-password">Password</label><input id="auth-password" type="password" autoComplete="current-password" required value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder="Your password"/><button className="save-button" type="submit" disabled={authBusy}>{authBusy ? "Signing in…" : "Sign in"}</button>{authMessage && <p className="auth-message auth-error" role="alert">{authMessage}</p>}{storageError && <p className="auth-message auth-error" role="alert">{storageError}</p>}<small>Your MYOS account is managed privately in Supabase. After sign-in, captures already saved on this device will be offered for import.</small></form></main>
    : supabaseConfigured && !authReady ? <main className="auth-shell"><p>Connecting securely…</p></main>
    :
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#home" onClick={() => setActive("Home")}><span className="brand-mark">m</span><span>myos<span className="brand-period">.</span></span></a>
        <button className="capture-button" onClick={() => openNewCapture()}><span className="plus">＋</span> Capture <span className="capture-shortcut">N</span></button>
        <div className="nav-label">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Primary navigation">{navigation.map((item) => <button key={item} className={`nav-item ${active === item ? "selected" : ""}`} onClick={() => { if (item === "Timeline") { showTimeline(); return; } setActive(item); setQuery(""); }}><span className="nav-icon">{icons[item]}</span>{item}{item === "Knowledge" && <span className="nav-count">{captures.filter((capture) => capture.type === "Knowledge").length}</span>}</button>)}</nav>
        <button className={`nav-item search-nav ${active === "Search" ? "selected" : ""}`} onClick={() => { setCommandQuery(""); setActive("Search"); setQuery(""); document.getElementById("global-search")?.focus(); }}><span className="nav-icon"><SearchIcon /></span>Search<span className="search-shortcut">⌘ K</span></button>
        <div className="sidebar-bottom"><div className="privacy-note"><span className="privacy-dot"/><span>{user ? "Synced to your account" : "Saved on this device"}<br/><small>{user?.email ?? "Not synced or backed up."}</small></span></div><div className="profile-button"><span className="avatar">m</span><span className="profile-name">{user?.email ?? "My workspace"}<small>{user ? "Private cloud sync" : "Local storage"}</small></span>{user && <button className="signout-button" onClick={() => void getSupabase()?.auth.signOut()} aria-label="Sign out">↗</button>}</div></div>
      </aside>

      <section className="main-column">
        <header className="topbar"><div className="breadcrumb"><span>MYOS</span><span className="crumb-slash">/</span><strong>{active}</strong></div><div className="topbar-right"><span className="today-label">Your personal archive</span><button className="top-capture" onClick={() => openNewCapture()}>＋ <span>Capture</span></button></div></header>
        <div className="page-content">
          <section className="welcome"><div><div className="eyebrow"><span className="eyebrow-line"/> YOUR PERSONAL SPACE</div><h1>{active === "Home" ? captures.length ? "A little more clarity." : "Start with a thought." : active}</h1><p className="welcome-copy">{active === "Home" ? "Your thoughts, decisions, and progress — all in one place." : active === "Timeline" ? "A quiet record of what you have learned, made, and lived." : `Everything you have collected in ${active.toLowerCase()}.`}</p></div><div className="welcome-date"><span className="date-day">MY</span><span className="date-month">PERSONAL<br/>ARCHIVE</span></div></section>

          <section className="search-panel" aria-label="Search your personal knowledge"><div className="search-leading"><SearchIcon /></div><input id="global-search" aria-label="Search everything" value={query} onChange={(event) => { setQuery(event.target.value); if (event.target.value) setActive("Search"); }} placeholder="Search anything you have saved…"/><button className="search-key" onClick={() => { setCommandQuery(""); setCommandOpen(true); }}>⌘ K</button><span className="search-divider"/><span className="filter-button" aria-hidden="true">⌕</span></section>

          <div className="section-heading"><div><div className="section-kicker">{active === "Timeline" ? "PERSONAL HISTORY" : ready ? `${captures.length} SAVED ${captures.length === 1 ? "ITEM" : "ITEMS"}` : "LOADING YOUR SPACE"}</div><h2>{query ? "Search results" : active === "Timeline" ? timelineRangeLabel(timelineDate || localDateValue(new Date()), timelineView) : active === "Home" ? "Recent captures" : active}</h2></div>{active === "Timeline" ? <div className="timeline-controls"><button className="timeline-nav-button" aria-label="Previous period" onClick={() => moveTimeline(-1)}>‹</button><input aria-label="Jump to date" type="date" value={timelineDate || localDateValue(new Date())} onChange={(event) => setTimelineDate(event.target.value)}/><button className="timeline-nav-button" aria-label="Next period" onClick={() => moveTimeline(1)}>›</button><select aria-label="Timeline view" value={timelineView} onChange={(event) => setTimelineView(event.target.value as TimelineView)}><option value="year">Year</option><option value="month">Month</option><option value="day">Day</option></select><select aria-label="Filter captures by type" value={timelineType} onChange={(event) => setTimelineType(event.target.value)}><option>All types</option>{captureTypes.map((captureType) => <option key={captureType}>{captureType}</option>)}</select><button className="timeline-today" onClick={() => setTimelineDate(localDateValue(new Date()))}>Today</button></div> : active === "Projects" ? <button className="date-link" onClick={() => openNewCapture("Project")}>＋ New project</button> : <button className="date-link" onClick={showTimeline}>Timeline <span>→</span></button>}</div>

          {storageError && <p className="storage-alert" role="status">{storageError}</p>}
          {user && localImportCount > 0 && <section className="import-banner"><div><strong>{localImportCount} capture{localImportCount === 1 ? "" : "s"} saved on this device</strong><p>Add them to your private account to see them on your other devices. Existing account records will be kept.</p></div><button className="save-button" onClick={() => void importLocalCaptures()} disabled={cloudBusy}>{cloudBusy ? "Adding…" : "Add to my account"}</button></section>}
          <div className="content-grid"><section className="activity-column"><div className="timeline-day"><div className="timeline-date"><span className="timeline-day-num">⌂</span><span>LOCAL<br/>LIBRARY</span></div><div className="timeline-rule"/><div className="day-activity"><span className="activity-pip"/><span>{timelineCaptures.length ? `${timelineCaptures.length} ${timelineCaptures.length === 1 ? "capture" : "captures"}` : ready ? "Your library is quiet" : "Loading"}</span></div></div>
            {active === "Projects" ? <div className="project-list">{projects.map((project) => <button type="button" className="project-list-row" key={project.id} onClick={() => setSelected(project)}><span className="project-list-symbol">▱</span><span className="project-list-copy"><strong>{project.title}</strong><small>{project.content || "No description yet."}</small></span><span className={`project-status status-${(project.projectStatus ?? "Active").toLowerCase()}`}>{project.projectStatus ?? "Active"}</span><span className="project-related-count">{linkedToProject(project.id).length} linked</span><span className="project-list-arrow">→</span></button>)}{projects.length === 0 && <div className="empty-state"><span className="empty-icon">▱</span><h3>{ready ? "Start a project" : "Loading your projects…"}</h3><p>Give an active effort a home. Related captures and knowledge can be linked as you go.</p><button onClick={() => openNewCapture("Project")}>＋ Create a project</button></div>}</div> : timelineCaptures.length ? <div className="capture-list">{captureGroups.map((group) => <section className="capture-group" key={group.key}>{group.label && <h3 className="timeline-group-title">{group.label}</h3>}{group.captures.map((item) => <article className="capture-row" key={item.id}><div className={`type-marker marker-${item.type.toLowerCase()}`}>{item.type === "Knowledge" ? "▤" : item.type === "Decision" ? "◇" : item.type === "Idea" ? "✧" : item.type === "Project" ? "▱" : "·"}</div><button type="button" className="capture-body capture-open-button" aria-label={`Open ${item.title}`} onClick={() => setSelected(item)}><div className="capture-meta"><span className={`type-label label-${item.type.toLowerCase()}`}>{item.type}</span><span className="meta-dot">·</span><span>{dateLabel(item.createdAt)}</span>{item.updatedAt !== item.createdAt && <span className="edited-label">Edited</span>}</div><h3>{item.title}</h3><p>{item.content || "No additional content."}</p></button><button className="more-button" aria-label={`Open ${item.title}`} onClick={(event) => { event.stopPropagation(); setSelected(item); }}>···</button></article>)}</section>)}</div> : <div className="empty-state"><span className="empty-icon">⌕</span><h3>{ready ? query ? "No matches yet" : active === "Timeline" ? "No captures in this period" : "Nothing captured yet" : "Loading your captures…"}</h3><p>{ready ? query ? "Try another search, or capture a thought to start building your library." : active === "Timeline" ? "Choose another date or time range, or capture a thought to start your history." : "Save the thought first. Add context whenever you are ready." : ""}</p>{ready && <button onClick={() => openNewCapture()}>＋ Capture something</button>}</div>}
            {active !== "Timeline" && <button className="see-all" onClick={showTimeline}>View timeline <span>→</span></button>}
          </section>

          <aside className="right-rail"><section className="rail-section focus-section"><div className="rail-heading"><span className="rail-icon focus-icon">✳</span><div><span className="rail-kicker">CAPTURE FIRST</span><h3>Make it easy to begin</h3></div></div><div className="rail-note"><p>Write what matters. A title and type are optional; you can organize things later.</p><button className="text-action" onClick={() => openNewCapture()}>Capture a thought <span>→</span></button></div></section>
          <section className="rail-section remember-section"><div className="rail-heading"><span className="rail-icon remember-icon">◷</span><div><span className="rail-kicker">YOUR HISTORY</span><h3>Recent captures</h3></div></div><div className="storage-summary"><strong>{captures.length}</strong><span>{captures.length === 1 ? "item saved" : "items saved"}<small>Only in this browser for now</small></span></div></section>
          <section className="rail-section connections-section"><div className="rail-heading"><span className="rail-icon connection-icon">⌁</span><div><span className="rail-kicker">A NOTE ON STORAGE</span><h3>Local to this device</h3></div></div><p className="rail-copy">Your captures stay in this browser. They are not synced or backed up yet.</p></section></aside>
          </div>
          <footer className="page-footer"><span>Small steps add up.</span><span>Made for your life, not your feed.</span></footer>
        </div>
      </section>

      {captureOpen && <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) discardCapture(); }}><section className="capture-dialog" role="dialog" aria-modal="true" aria-labelledby="capture-heading"><div className="dialog-top"><div className="dialog-mark">＋</div><button className="dialog-close" aria-label="Close capture" disabled={processingMedia || savingCapture} onClick={() => discardCapture()}>×</button></div><div className="dialog-eyebrow">{editingId ? "MAKE AN UPDATE" : "A THOUGHT TO KEEP"}</div><h2 id="capture-heading">{editingId ? "Edit this capture." : "Capture a thought."}</h2><p className="dialog-copy">{editingId ? "Your changes are saved on this device." : "Start with what matters. You can add details later."}</p><form onSubmit={saveCapture}><input className="title-input" aria-label="Capture title" placeholder="Give it a title (optional)" maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)}/><textarea ref={editor} className="capture-editor" aria-label="Capture content" placeholder="What’s on your mind?" value={content} onChange={(event) => setContent(event.target.value)}/>
        <section className="media-section" aria-label="Capture attachments"><div className="media-section-heading">ATTACHMENTS <span>{existingAttachments.length + newAttachments.length}/{MAX_CAPTURE_ATTACHMENTS}</span></div><input ref={attachmentInput} className="media-input" aria-label="Choose image or audio files" type="file" accept="image/jpeg,image/png,image/webp,audio/*" multiple disabled={processingMedia || savingCapture || recordingAudio || existingAttachments.length + newAttachments.length >= MAX_CAPTURE_ATTACHMENTS} onChange={(event) => void addMedia(event.target.files)}/><div className="media-actions"><button className="media-add-button" type="button" disabled={processingMedia || savingCapture || recordingAudio || existingAttachments.length + newAttachments.length >= MAX_CAPTURE_ATTACHMENTS} onClick={() => attachmentInput.current?.click()}>＋ Add image or audio</button>{recordingAudio ? <button className="record-button recording" type="button" onClick={() => void finishRecording()}><span className="record-indicator"/> Stop &amp; attach <time>{formatRecordingTime(recordingElapsed)}</time></button> : <button className="record-button" type="button" disabled={processingMedia || savingCapture || existingAttachments.length + newAttachments.length >= MAX_CAPTURE_ATTACHMENTS} onClick={() => void beginRecording()}><span className="record-indicator"/> Record audio</button>}</div><p className="media-guidance">Images are resized and compressed. WAV is converted to compact Opus; compressed audio is kept as-is. Recordings use compact audio encoding. Up to 5 files and 24 MB per capture.</p>
          {(existingAttachments.length > 0 || newAttachments.length > 0) && <div className="media-file-list">{existingAttachments.map((item) => <div className="media-file-row" key={item.id}><span className="media-file-kind">{item.mimeType.startsWith("image/") ? "▧" : "♫"}</span><span className="media-file-name">{item.name}<small>{formatBytes(item.size)}</small></span><button type="button" aria-label={`Remove ${item.name}`} disabled={savingCapture || processingMedia || recordingAudio} onClick={() => setExistingAttachments((current) => current.filter((attachment) => attachment.id !== item.id))}>×</button></div>)}{newAttachments.map((item) => <div className="media-file-row" key={item.attachment.id}><span className="media-file-kind">{item.attachment.mimeType.startsWith("image/") ? "▧" : "♫"}</span><span className="media-file-name">{item.attachment.name}<small>{formatBytes(item.attachment.size)} · optimized</small></span><button type="button" aria-label={`Remove ${item.attachment.name}`} disabled={savingCapture || processingMedia || recordingAudio} onClick={() => removeNewAttachment(item.attachment.id)}>×</button>{item.attachment.mimeType.startsWith("audio/") && <audio className="draft-audio" controls preload="metadata" src={item.previewUrl} aria-label={`Play ${item.attachment.name}`}/>}</div>)}</div>}
          {processingMedia && <p className="media-status" role="status">Preparing or optimizing audio…</p>}{recordingAudio && <p className="media-status" role="status">Recording · keep MYOS open; maximum 5 minutes.</p>}{attachmentError && <p className="media-error" role="alert">{attachmentError}</p>}
        </section>
        {type === "Project" && <label className="association-select">PROJECT STATUS <select value={projectStatus} onChange={(event) => setProjectStatus(event.target.value as ProjectStatus)}>{projectStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>}
        {type !== "Project" && projects.length > 0 && <fieldset className="association-fieldset"><legend>IN PROJECTS <span>Optional</span></legend><div className="association-options">{projects.filter((project) => project.id !== editingId).map((project) => <label key={project.id}><input type="checkbox" checked={projectIds.includes(project.id)} onChange={(event) => setProjectIds((current) => event.target.checked ? [...current, project.id] : current.filter((id) => id !== project.id))}/><span>{project.title}</span></label>)}</div></fieldset>}
        {type === "Knowledge" && captures.some((item) => item.type === "Knowledge" && item.id !== editingId) && <fieldset className="association-fieldset"><legend>RELATED KNOWLEDGE <span>Optional</span></legend><div className="association-options">{captures.filter((item) => item.type === "Knowledge" && item.id !== editingId).map((item) => <label key={item.id}><input type="checkbox" checked={relatedIds.includes(item.id)} onChange={(event) => setRelatedIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))}/><span>{item.title}</span></label>)}</div></fieldset>}
        <div className="dialog-bottom"><label className="type-select-label">TYPE <select value={type} onChange={(event) => setType(event.target.value as CaptureType)}>{captureTypes.map((option) => <option key={option}>{option}</option>)}</select></label><button className="save-button" type="submit" disabled={storageBlocked || savingCapture || processingMedia || recordingAudio || (!title.trim() && !content.trim() && !existingAttachments.length && !newAttachments.length)}>{savingCapture ? "Saving…" : editingId ? "Save changes" : "Save capture"} <span>↗</span></button></div></form><div className="local-note">Files are optimized and saved on this device · not synced</div></section></div>}

      {selected && <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section className="detail-dialog" role="dialog" aria-modal="true" aria-labelledby="detail-heading"><div className="dialog-top"><span className={`type-label label-${selected.type.toLowerCase()}`}>{selected.type.toUpperCase()}</span><button className="dialog-close" aria-label="Close details" onClick={() => setSelected(null)}>×</button></div><h2 id="detail-heading">{selected.title}</h2><p className="detail-date">Created {dateLabel(selected.createdAt)}{selected.updatedAt !== selected.createdAt ? ` · Updated ${dateLabel(selected.updatedAt)}` : ""}{selected.type === "Project" ? ` · ${selected.projectStatus ?? "Active"}` : ""}</p><div className="detail-content">{selected.content || <span className="detail-empty">No additional content.</span>}</div>
        {!!selected.attachments?.length && <section className="detail-attachments"><div className="related-heading">ATTACHMENTS <span>{selected.attachments.length}</span></div>{selected.attachments.map((item) => <div className="detail-attachment" key={item.id}><div className="detail-attachment-name"><strong>{item.name}</strong><span>{formatBytes(item.size)}</span>{attachmentUrls[item.id] && <a href={attachmentUrls[item.id]} download={item.name} aria-label={`Download ${item.name}`}>Download</a>}</div>{attachmentUrls[item.id] ? item.mimeType.startsWith("image/") ? <Image className="detail-image" src={attachmentUrls[item.id]} alt={item.name} width={800} height={600} unoptimized/> : item.mimeType.startsWith("audio/") ? <audio className="detail-audio" controls preload="metadata" src={attachmentUrls[item.id]}/> : null : <p className="related-empty">This file is unavailable in the local attachment store.</p>}</div>)}</section>}
        {selected.type === "Project" && <section className="related-section"><div className="related-heading">PROJECT CONTEXT <span>{linkedToProject(selected.id).length}</span></div>{linkedToProject(selected.id).length ? linkedToProject(selected.id).map((item) => <button className="related-item" key={item.id} onClick={() => setSelected(item)}><span className={`type-label label-${item.type.toLowerCase()}`}>{item.type}</span><strong>{item.title}</strong><span>→</span></button>) : <p className="related-empty">Captures linked to this project will appear here.</p>}</section>}
        {selected.type === "Knowledge" && <section className="related-section"><div className="related-heading">RELATED KNOWLEDGE <span>{relatedKnowledge(selected).length}</span></div>{relatedKnowledge(selected).length ? relatedKnowledge(selected).map((item) => <button className="related-item" key={item.id} onClick={() => setSelected(item)}><span className="type-label label-knowledge">KNOWLEDGE</span><strong>{item.title}</strong><span>→</span></button>) : <p className="related-empty">Connect this to another knowledge entry when it is useful.</p>}</section>}
        {selected.type !== "Project" && (selected.projectIds ?? []).some((id) => projects.some((project) => project.id === id)) && <section className="related-section"><div className="related-heading">IN PROJECTS</div>{projects.filter((project) => (selected.projectIds ?? []).includes(project.id)).map((project) => <button className="related-item" key={project.id} onClick={() => setSelected(project)}><span className="type-label label-project">PROJECT</span><strong>{project.title}</strong><span>→</span></button>)}</section>}
        <div className="detail-actions"><button className="delete-button" disabled={storageBlocked} onClick={() => deleteCapture(selected)}>Delete</button><button className="save-button" onClick={() => editCapture(selected)}>Edit capture</button></div></section></div>}

      {commandOpen && <div className="overlay command-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCommandOpen(false); }}><section className="command-dialog" role="dialog" aria-modal="true" aria-label="Command menu"><div className="command-input-row"><SearchIcon/><input autoFocus aria-label="Enter command or search" placeholder="Search, or type a command…" value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} onKeyDown={handleCommandKey}/><kbd>ESC</kbd></div><div className="command-group-label">CREATE SOMETHING</div><div className="command-grid">{captureTypes.map((item) => <button key={item} onClick={() => selectCommand(item)}><span>＋</span> {item}</button>)}</div><div className="command-group-label retrieval-label">GO SOMEWHERE</div><button className="command-search-row" onClick={() => selectCommand("Search")}><SearchIcon/><span>Search your space</span><kbd>↵</kbd></button></section></div>}
    </main>
  );
}
