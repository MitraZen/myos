"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { CaptureRecord, CaptureType, loadCaptures, storeCaptures } from "@/lib/capture-storage";

const captureTypes: CaptureType[] = ["Capture", "Knowledge", "Idea", "Project", "Decision", "Milestone", "Goal", "Journal", "Book", "Resource", "Task", "Person"];
const navigation = ["Home", "Timeline", "Knowledge", "Projects", "Decisions", "Milestones", "Ideas"];
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<CaptureRecord | null>(null);
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
    setCaptureOpen(true);
    setSelected(null);
    setCommandOpen(false);
  }

  function editCapture(capture: CaptureRecord) {
    setEditingId(capture.id);
    setTitle(capture.title);
    setContent(capture.content);
    setType(capture.type);
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
        ? { ...item, title: cleanTitle, content: content.trim(), type, updatedAt: now }
        : item);
    } else {
      const capture: CaptureRecord = {
        id: crypto.randomUUID(),
        title: cleanTitle,
        content: content.trim(),
        type,
        createdAt: now,
        updatedAt: now,
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
    persistCaptures(captures.filter((item) => item.id !== capture.id));
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
        <nav className="primary-nav" aria-label="Primary navigation">{navigation.map((item) => <button key={item} className={`nav-item ${active === item ? "selected" : ""}`} onClick={() => { setActive(item); setQuery(""); }}><span className="nav-icon">{icons[item]}</span>{item}{item === "Knowledge" && <span className="nav-count">{captures.filter((capture) => capture.type === "Knowledge").length}</span>}</button>)}</nav>
        <button className={`nav-item search-nav ${active === "Search" ? "selected" : ""}`} onClick={() => { setCommandQuery(""); setActive("Search"); setQuery(""); document.getElementById("global-search")?.focus(); }}><span className="nav-icon"><SearchIcon /></span>Search<span className="search-shortcut">⌘ K</span></button>
        <div className="sidebar-bottom"><div className="privacy-note"><span className="privacy-dot"/><span>Saved on this device<br/><small>Not synced or backed up.</small></span></div><div className="profile-button"><span className="avatar">m</span><span className="profile-name">My workspace<small>Local storage</small></span></div></div>
      </aside>

      <section className="main-column">
        <header className="topbar"><div className="breadcrumb"><span>MYOS</span><span className="crumb-slash">/</span><strong>{active}</strong></div><div className="topbar-right"><span className="today-label">Your personal archive</span><button className="top-capture" onClick={() => openNewCapture()}>＋ <span>Capture</span></button></div></header>
        <div className="page-content">
          <section className="welcome"><div><div className="eyebrow"><span className="eyebrow-line"/> YOUR PERSONAL SPACE</div><h1>{active === "Home" ? captures.length ? "A little more clarity." : "Start with a thought." : active}</h1><p className="welcome-copy">{active === "Home" ? "Your thoughts, decisions, and progress — all in one place." : active === "Timeline" ? "A quiet record of what you have learned, made, and lived." : `Everything you have collected in ${active.toLowerCase()}.`}</p></div><div className="welcome-date"><span className="date-day">MY</span><span className="date-month">PERSONAL<br/>ARCHIVE</span></div></section>

          <section className="search-panel" aria-label="Search your personal knowledge"><div className="search-leading"><SearchIcon /></div><input id="global-search" aria-label="Search everything" value={query} onChange={(event) => { setQuery(event.target.value); if (event.target.value) setActive("Search"); }} placeholder="Search anything you have saved…"/><button className="search-key" onClick={() => { setCommandQuery(""); setCommandOpen(true); }}>⌘ K</button><span className="search-divider"/><span className="filter-button" aria-hidden="true">⌕</span></section>

          <div className="section-heading"><div><div className="section-kicker">{ready ? `${captures.length} SAVED ${captures.length === 1 ? "ITEM" : "ITEMS"}` : "LOADING YOUR SPACE"}</div><h2>{query ? "Search results" : active === "Timeline" ? "Your timeline" : active === "Home" ? "Recent captures" : active}</h2></div><button className="date-link" onClick={() => { setActive("Timeline"); setQuery(""); }}>Timeline <span>→</span></button></div>

          {storageError && <p className="storage-alert" role="status">{storageError}</p>}
          <div className="content-grid"><section className="activity-column"><div className="timeline-day"><div className="timeline-date"><span className="timeline-day-num">⌂</span><span>LOCAL<br/>LIBRARY</span></div><div className="timeline-rule"/><div className="day-activity"><span className="activity-pip"/><span>{visibleCaptures.length ? `${visibleCaptures.length} ${visibleCaptures.length === 1 ? "capture" : "captures"}` : ready ? "Your library is quiet" : "Loading"}</span></div></div>
            {visibleCaptures.length ? <div className="capture-list">{visibleCaptures.map((item) => <article className="capture-row" key={item.id}><div className={`type-marker marker-${item.type.toLowerCase()}`}>{item.type === "Knowledge" ? "▤" : item.type === "Decision" ? "◇" : item.type === "Idea" ? "✧" : item.type === "Project" ? "▱" : "·"}</div><button type="button" className="capture-body capture-open-button" aria-label={`Open ${item.title}`} onClick={() => setSelected(item)}><div className="capture-meta"><span className={`type-label label-${item.type.toLowerCase()}`}>{item.type}</span><span className="meta-dot">·</span><span>{dateLabel(item.createdAt)}</span>{item.updatedAt !== item.createdAt && <span className="edited-label">Edited</span>}</div><h3>{item.title}</h3><p>{item.content || "No additional content."}</p></button><button className="more-button" aria-label={`Open ${item.title}`} onClick={(event) => { event.stopPropagation(); setSelected(item); }}>···</button></article>)}</div> : <div className="empty-state"><span className="empty-icon">⌕</span><h3>{ready ? query ? "No matches yet" : "Nothing captured yet" : "Loading your captures…"}</h3><p>{ready ? query ? "Try another search, or capture a thought to start building your library." : "Save the thought first. Add context whenever you are ready." : ""}</p>{ready && !query && <button onClick={() => openNewCapture()}>＋ Capture something</button>}</div>}
            <button className="see-all" onClick={() => { setActive("Timeline"); setQuery(""); }}>View timeline <span>→</span></button>
          </section>

          <aside className="right-rail"><section className="rail-section focus-section"><div className="rail-heading"><span className="rail-icon focus-icon">✳</span><div><span className="rail-kicker">CAPTURE FIRST</span><h3>Make it easy to begin</h3></div></div><div className="rail-note"><p>Write what matters. A title and type are optional; you can organize things later.</p><button className="text-action" onClick={() => openNewCapture()}>Capture a thought <span>→</span></button></div></section>
          <section className="rail-section remember-section"><div className="rail-heading"><span className="rail-icon remember-icon">◷</span><div><span className="rail-kicker">YOUR HISTORY</span><h3>Recent captures</h3></div></div><div className="storage-summary"><strong>{captures.length}</strong><span>{captures.length === 1 ? "item saved" : "items saved"}<small>Only in this browser for now</small></span></div></section>
          <section className="rail-section connections-section"><div className="rail-heading"><span className="rail-icon connection-icon">⌁</span><div><span className="rail-kicker">A NOTE ON STORAGE</span><h3>Local to this device</h3></div></div><p className="rail-copy">Your captures stay in this browser. They are not synced or backed up yet.</p></section></aside>
          </div>
          <footer className="page-footer"><span>Small steps add up.</span><span>Made for your life, not your feed.</span></footer>
        </div>
      </section>

      {captureOpen && <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCaptureOpen(false); }}><section className="capture-dialog" role="dialog" aria-modal="true" aria-labelledby="capture-heading"><div className="dialog-top"><div className="dialog-mark">＋</div><button className="dialog-close" aria-label="Close capture" onClick={() => { setCaptureOpen(false); setEditingId(null); }}>×</button></div><div className="dialog-eyebrow">{editingId ? "MAKE AN UPDATE" : "A THOUGHT TO KEEP"}</div><h2 id="capture-heading">{editingId ? "Edit this capture." : "Capture a thought."}</h2><p className="dialog-copy">{editingId ? "Your changes are saved on this device." : "Start with what matters. You can add details later."}</p><form onSubmit={saveCapture}><input className="title-input" aria-label="Capture title" placeholder="Give it a title (optional)" maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)}/><textarea ref={editor} className="capture-editor" aria-label="Capture content" placeholder="What’s on your mind?" value={content} onChange={(event) => setContent(event.target.value)}/><div className="dialog-bottom"><label className="type-select-label">TYPE <select value={type} onChange={(event) => setType(event.target.value as CaptureType)}>{captureTypes.map((option) => <option key={option}>{option}</option>)}</select></label><button className="save-button" type="submit" disabled={storageBlocked || (!title.trim() && !content.trim())}>{editingId ? "Save changes" : "Save capture"} <span>↗</span></button></div></form><div className="local-note">Saved on this device · not synced</div></section></div>}

      {selected && <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section className="detail-dialog" role="dialog" aria-modal="true" aria-labelledby="detail-heading"><div className="dialog-top"><span className={`type-label label-${selected.type.toLowerCase()}`}>{selected.type.toUpperCase()}</span><button className="dialog-close" aria-label="Close details" onClick={() => setSelected(null)}>×</button></div><h2 id="detail-heading">{selected.title}</h2><p className="detail-date">Created {dateLabel(selected.createdAt)}{selected.updatedAt !== selected.createdAt ? ` · Updated ${dateLabel(selected.updatedAt)}` : ""}</p><div className="detail-content">{selected.content || <span className="detail-empty">No additional content.</span>}</div><div className="detail-actions"><button className="delete-button" disabled={storageBlocked} onClick={() => deleteCapture(selected)}>Delete</button><button className="save-button" onClick={() => editCapture(selected)}>Edit capture</button></div></section></div>}

      {commandOpen && <div className="overlay command-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCommandOpen(false); }}><section className="command-dialog" role="dialog" aria-modal="true" aria-label="Command menu"><div className="command-input-row"><SearchIcon/><input autoFocus aria-label="Enter command or search" placeholder="Search, or type a command…" value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} onKeyDown={handleCommandKey}/><kbd>ESC</kbd></div><div className="command-group-label">CREATE SOMETHING</div><div className="command-grid">{captureTypes.map((item) => <button key={item} onClick={() => selectCommand(item)}><span>＋</span> {item}</button>)}</div><div className="command-group-label retrieval-label">GO SOMEWHERE</div><button className="command-search-row" onClick={() => selectCommand("Search")}><SearchIcon/><span>Search your space</span><kbd>↵</kbd></button></section></div>}
    </main>
  );
}
