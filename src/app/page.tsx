"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { CaptureRecord, CaptureType, loadCaptures, ProjectStatus, storeCaptures } from "@/lib/capture-storage";

const captureTypes: CaptureType[] = ["Capture", "Knowledge", "Idea", "Project", "Decision", "Milestone", "Goal", "Journal", "Book", "Resource", "Task", "Person"];
const navigation = ["Home", "Timeline", "Knowledge", "Projects", "Decisions", "Milestones", "Ideas"];
type TimelineView = "year" | "month" | "day";
const projectStatuses: ProjectStatus[] = ["Idea", "Planning", "Active", "Paused", "Completed", "Cancelled", "Archived"];

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<CaptureRecord | null>(null);
  const [timelineView, setTimelineView] = useState<TimelineView>("month");
  const [timelineDate, setTimelineDate] = useState("");
  const [timelineType, setTimelineType] = useState("All types");
  const editor = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      // localStorage is client-only, so initialize captures after hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCaptures(loadCaptures());
    } catch {
      setStorageBlocked(true);
      setStorageError("Saved data could not be read. It remains in this browser and was not changed.");
    } finally {
      setReady(true);
    }
  }, []);


  useEffect(() => {
    if (captureOpen) editor.current?.focus();
  }, [captureOpen]);

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (event.key === "Escape") {
        setCommandOpen(false);
        setCaptureOpen(false);
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

  function persistCaptures(next: CaptureRecord[]) {
    if (storageBlocked) return;
    setCaptures(next);
    try {
      storeCaptures(next);
      setStorageError("");
    } catch {
      setStorageError("This browser could not save your latest changes. Copy any new text before closing this page.");
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
    setSelected(null);
    setCaptureOpen(true);
  }

  function saveCapture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (storageBlocked || (!title.trim() && !content.trim())) return;
    const cleanTitle = title.trim() || content.trim().split("\n")[0].slice(0, 80) || "Untitled capture";
    const now = new Date().toISOString();
    let next: CaptureRecord[];
    if (editingId) {
      next = captures.map((item) => item.id === editingId
        ? { ...item, title: cleanTitle, content: content.trim(), type, updatedAt: now,
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
        ...(type === "Project" ? { projectStatus } : { projectIds }),
        ...(type === "Knowledge" ? { relatedIds } : {}),
      };
      next = [capture, ...captures];
    }
    persistCaptures(next);
    setCaptureOpen(false);
    setEditingId(null);
    setActive("Home");
    setQuery("");
  }

  function deleteCapture(capture: CaptureRecord) {
    if (storageBlocked) return;
    if (!window.confirm(`Delete “${capture.title}”? This cannot be undone.`)) return;
    persistCaptures(captures.filter((item) => item.id !== capture.id).map((item) => ({
      ...item,
      projectIds: item.projectIds?.filter((id) => id !== capture.id),
      relatedIds: item.relatedIds?.filter((id) => id !== capture.id),
    })));
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
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#home" onClick={() => setActive("Home")}><span className="brand-mark">m</span><span>myos<span className="brand-period">.</span></span></a>
        <button className="capture-button" onClick={() => openNewCapture()}><span className="plus">＋</span> Capture <span className="capture-shortcut">N</span></button>
        <div className="nav-label">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Primary navigation">{navigation.map((item) => <button key={item} className={`nav-item ${active === item ? "selected" : ""}`} onClick={() => { if (item === "Timeline") { showTimeline(); return; } setActive(item); setQuery(""); }}><span className="nav-icon">{icons[item]}</span>{item}{item === "Knowledge" && <span className="nav-count">{captures.filter((capture) => capture.type === "Knowledge").length}</span>}</button>)}</nav>
        <button className={`nav-item search-nav ${active === "Search" ? "selected" : ""}`} onClick={() => { setCommandQuery(""); setActive("Search"); setQuery(""); document.getElementById("global-search")?.focus(); }}><span className="nav-icon"><SearchIcon /></span>Search<span className="search-shortcut">⌘ K</span></button>
        <div className="sidebar-bottom"><div className="privacy-note"><span className="privacy-dot"/><span>Saved on this device<br/><small>Not synced or backed up.</small></span></div><div className="profile-button"><span className="avatar">m</span><span className="profile-name">My workspace<small>Local storage</small></span></div></div>
      </aside>

      <section className="main-column">
        <header className="topbar"><div className="breadcrumb"><span>MYOS</span><span className="crumb-slash">/</span><strong>{active}</strong></div><div className="topbar-right"><span className="today-label">Your personal archive</span><button className="top-capture" onClick={() => openNewCapture()}>＋ <span>Capture</span></button></div></header>
        <div className="page-content">
          <section className="welcome"><div><div className="eyebrow"><span className="eyebrow-line"/> YOUR PERSONAL SPACE</div><h1>{active === "Home" ? captures.length ? "A little more clarity." : "Start with a thought." : active}</h1><p className="welcome-copy">{active === "Home" ? "Your thoughts, decisions, and progress — all in one place." : active === "Timeline" ? "A quiet record of what you have learned, made, and lived." : `Everything you have collected in ${active.toLowerCase()}.`}</p></div><div className="welcome-date"><span className="date-day">MY</span><span className="date-month">PERSONAL<br/>ARCHIVE</span></div></section>

          <section className="search-panel" aria-label="Search your personal knowledge"><div className="search-leading"><SearchIcon /></div><input id="global-search" aria-label="Search everything" value={query} onChange={(event) => { setQuery(event.target.value); if (event.target.value) setActive("Search"); }} placeholder="Search anything you have saved…"/><button className="search-key" onClick={() => { setCommandQuery(""); setCommandOpen(true); }}>⌘ K</button><span className="search-divider"/><span className="filter-button" aria-hidden="true">⌕</span></section>

          <div className="section-heading"><div><div className="section-kicker">{active === "Timeline" ? "PERSONAL HISTORY" : ready ? `${captures.length} SAVED ${captures.length === 1 ? "ITEM" : "ITEMS"}` : "LOADING YOUR SPACE"}</div><h2>{query ? "Search results" : active === "Timeline" ? timelineRangeLabel(timelineDate || localDateValue(new Date()), timelineView) : active === "Home" ? "Recent captures" : active}</h2></div>{active === "Timeline" ? <div className="timeline-controls"><button className="timeline-nav-button" aria-label="Previous period" onClick={() => moveTimeline(-1)}>‹</button><input aria-label="Jump to date" type="date" value={timelineDate || localDateValue(new Date())} onChange={(event) => setTimelineDate(event.target.value)}/><button className="timeline-nav-button" aria-label="Next period" onClick={() => moveTimeline(1)}>›</button><select aria-label="Timeline view" value={timelineView} onChange={(event) => setTimelineView(event.target.value as TimelineView)}><option value="year">Year</option><option value="month">Month</option><option value="day">Day</option></select><select aria-label="Filter captures by type" value={timelineType} onChange={(event) => setTimelineType(event.target.value)}><option>All types</option>{captureTypes.map((captureType) => <option key={captureType}>{captureType}</option>)}</select><button className="timeline-today" onClick={() => setTimelineDate(localDateValue(new Date()))}>Today</button></div> : active === "Projects" ? <button className="date-link" onClick={() => openNewCapture("Project")}>＋ New project</button> : <button className="date-link" onClick={showTimeline}>Timeline <span>→</span></button>}</div>

          {storageError && <p className="storage-alert" role="status">{storageError}</p>}
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

      {captureOpen && <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCaptureOpen(false); }}><section className="capture-dialog" role="dialog" aria-modal="true" aria-labelledby="capture-heading"><div className="dialog-top"><div className="dialog-mark">＋</div><button className="dialog-close" aria-label="Close capture" onClick={() => { setCaptureOpen(false); setEditingId(null); }}>×</button></div><div className="dialog-eyebrow">{editingId ? "MAKE AN UPDATE" : "A THOUGHT TO KEEP"}</div><h2 id="capture-heading">{editingId ? "Edit this capture." : "Capture a thought."}</h2><p className="dialog-copy">{editingId ? "Your changes are saved on this device." : "Start with what matters. You can add details later."}</p><form onSubmit={saveCapture}><input className="title-input" aria-label="Capture title" placeholder="Give it a title (optional)" maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)}/><textarea ref={editor} className="capture-editor" aria-label="Capture content" placeholder="What’s on your mind?" value={content} onChange={(event) => setContent(event.target.value)}/>
        {type === "Project" && <label className="association-select">PROJECT STATUS <select value={projectStatus} onChange={(event) => setProjectStatus(event.target.value as ProjectStatus)}>{projectStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>}
        {type !== "Project" && projects.length > 0 && <fieldset className="association-fieldset"><legend>IN PROJECTS <span>Optional</span></legend><div className="association-options">{projects.filter((project) => project.id !== editingId).map((project) => <label key={project.id}><input type="checkbox" checked={projectIds.includes(project.id)} onChange={(event) => setProjectIds((current) => event.target.checked ? [...current, project.id] : current.filter((id) => id !== project.id))}/><span>{project.title}</span></label>)}</div></fieldset>}
        {type === "Knowledge" && captures.some((item) => item.type === "Knowledge" && item.id !== editingId) && <fieldset className="association-fieldset"><legend>RELATED KNOWLEDGE <span>Optional</span></legend><div className="association-options">{captures.filter((item) => item.type === "Knowledge" && item.id !== editingId).map((item) => <label key={item.id}><input type="checkbox" checked={relatedIds.includes(item.id)} onChange={(event) => setRelatedIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))}/><span>{item.title}</span></label>)}</div></fieldset>}
        <div className="dialog-bottom"><label className="type-select-label">TYPE <select value={type} onChange={(event) => setType(event.target.value as CaptureType)}>{captureTypes.map((option) => <option key={option}>{option}</option>)}</select></label><button className="save-button" type="submit" disabled={storageBlocked || (!title.trim() && !content.trim())}>{editingId ? "Save changes" : "Save capture"} <span>↗</span></button></div></form><div className="local-note">Saved on this device · not synced</div></section></div>}

      {selected && <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section className="detail-dialog" role="dialog" aria-modal="true" aria-labelledby="detail-heading"><div className="dialog-top"><span className={`type-label label-${selected.type.toLowerCase()}`}>{selected.type.toUpperCase()}</span><button className="dialog-close" aria-label="Close details" onClick={() => setSelected(null)}>×</button></div><h2 id="detail-heading">{selected.title}</h2><p className="detail-date">Created {dateLabel(selected.createdAt)}{selected.updatedAt !== selected.createdAt ? ` · Updated ${dateLabel(selected.updatedAt)}` : ""}{selected.type === "Project" ? ` · ${selected.projectStatus ?? "Active"}` : ""}</p><div className="detail-content">{selected.content || <span className="detail-empty">No additional content.</span>}</div>
        {selected.type === "Project" && <section className="related-section"><div className="related-heading">PROJECT CONTEXT <span>{linkedToProject(selected.id).length}</span></div>{linkedToProject(selected.id).length ? linkedToProject(selected.id).map((item) => <button className="related-item" key={item.id} onClick={() => setSelected(item)}><span className={`type-label label-${item.type.toLowerCase()}`}>{item.type}</span><strong>{item.title}</strong><span>→</span></button>) : <p className="related-empty">Captures linked to this project will appear here.</p>}</section>}
        {selected.type === "Knowledge" && <section className="related-section"><div className="related-heading">RELATED KNOWLEDGE <span>{relatedKnowledge(selected).length}</span></div>{relatedKnowledge(selected).length ? relatedKnowledge(selected).map((item) => <button className="related-item" key={item.id} onClick={() => setSelected(item)}><span className="type-label label-knowledge">KNOWLEDGE</span><strong>{item.title}</strong><span>→</span></button>) : <p className="related-empty">Connect this to another knowledge entry when it is useful.</p>}</section>}
        {selected.type !== "Project" && (selected.projectIds ?? []).some((id) => projects.some((project) => project.id === id)) && <section className="related-section"><div className="related-heading">IN PROJECTS</div>{projects.filter((project) => (selected.projectIds ?? []).includes(project.id)).map((project) => <button className="related-item" key={project.id} onClick={() => setSelected(project)}><span className="type-label label-project">PROJECT</span><strong>{project.title}</strong><span>→</span></button>)}</section>}
        <div className="detail-actions"><button className="delete-button" disabled={storageBlocked} onClick={() => deleteCapture(selected)}>Delete</button><button className="save-button" onClick={() => editCapture(selected)}>Edit capture</button></div></section></div>}

      {commandOpen && <div className="overlay command-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCommandOpen(false); }}><section className="command-dialog" role="dialog" aria-modal="true" aria-label="Command menu"><div className="command-input-row"><SearchIcon/><input autoFocus aria-label="Enter command or search" placeholder="Search, or type a command…" value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} onKeyDown={handleCommandKey}/><kbd>ESC</kbd></div><div className="command-group-label">CREATE SOMETHING</div><div className="command-grid">{captureTypes.map((item) => <button key={item} onClick={() => selectCommand(item)}><span>＋</span> {item}</button>)}</div><div className="command-group-label retrieval-label">GO SOMEWHERE</div><button className="command-search-row" onClick={() => selectCommand("Search")}><SearchIcon/><span>Search your space</span><kbd>↵</kbd></button></section></div>}
    </main>
  );
}
