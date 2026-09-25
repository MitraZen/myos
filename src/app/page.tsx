"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Capture = { id: number; title: string; content: string; type: string; time: string; project?: string };

const initialCaptures: Capture[] = [
  { id: 1, title: "R8 shrinking and release size", content: "Review how R8 removes unused code and resources before the next Android release.", type: "Knowledge", time: "10:42 AM", project: "Whispr" },
  { id: 2, title: "Keep the capture flow frictionless", content: "Save the thought first. Let metadata and organization happen when they are useful.", type: "Idea", time: "Yesterday", project: "MYOS" },
  { id: 3, title: "Move the MYOS data layer to Supabase", content: "Use Postgres and row level security for private, owner-scoped records.", type: "Decision", time: "Sep 23", project: "MYOS" },
  { id: 4, title: "Whispr 1.4 release", content: "Prepare the next release and revisit store listing screenshots.", type: "Project", time: "Sep 21", project: "Whispr" },
];

const navigation = ["Home", "Timeline", "Knowledge", "Projects", "Decisions", "Milestones", "Ideas"];
const icon: Record<string, string> = { Home: "⌂", Timeline: "◷", Knowledge: "▤", Projects: "▱", Decisions: "◇", Milestones: "✳", Ideas: "✧" };

function SearchIcon() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="1.7"/><path d="m16 16 4.2 4.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>; }

export default function Home() {
  const [captures, setCaptures] = useState(initialCaptures);
  const [active, setActive] = useState("Home");
  const [query, setQuery] = useState("");
  const [captureOpen, setCaptureOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState("Capture");
  const editor = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setCommandOpen(true); }
      if (event.key === "Escape") { setCommandOpen(false); setCaptureOpen(false); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => { if (captureOpen) editor.current?.focus(); }, [captureOpen]);

  const visibleCaptures = useMemo(() => captures.filter((item) => {
    const matchesQuery = `${item.title} ${item.content} ${item.type} ${item.project ?? ""}`.toLowerCase().includes(query.toLowerCase());
    const matchesSection = active === "Home" || active === "Search" || active === "Timeline" || item.type.toLowerCase() === active.toLowerCase() || (active === "Projects" && item.type === "Project");
    return matchesQuery && matchesSection;
  }), [captures, query, active]);

  function saveCapture() {
    if (!content.trim() && !title.trim()) return;
    setCaptures((items) => [{ id: Date.now(), title: title.trim() || content.trim().split("\n")[0].slice(0, 58) || "Untitled capture", content: content.trim(), type, time: "Just now" }, ...items]);
    setTitle(""); setContent(""); setType("Capture"); setCaptureOpen(false); setActive("Home");
  }

  function chooseCommand(command: string) {
    if (command === "Search") { setActive("Search"); setCommandOpen(false); document.getElementById("global-search")?.focus(); return; }
    setType(command); setCommandOpen(false); setCaptureOpen(true);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#home" onClick={() => setActive("Home")}><span className="brand-mark">m</span><span>myos<span className="brand-period">.</span></span></a>
        <button className="capture-button" onClick={() => setCaptureOpen(true)}><span className="plus">＋</span> Capture <span className="capture-shortcut">N</span></button>
        <div className="nav-label">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Primary navigation">{navigation.map((item) => <button key={item} className={`nav-item ${active === item ? "selected" : ""}`} onClick={() => { setActive(item); setQuery(""); }}><span className="nav-icon">{icon[item]}</span>{item}{item === "Knowledge" && <span className="nav-count">12</span>}</button>)}</nav>
        <button className={`nav-item search-nav ${active === "Search" ? "selected" : ""}`} onClick={() => { setActive("Search"); setQuery(""); document.getElementById("global-search")?.focus(); }}><span className="nav-icon"><SearchIcon /></span>Search<span className="search-shortcut">⌘ K</span></button>
        <div className="sidebar-bottom"><div className="privacy-note"><span className="privacy-dot"/><span>Personal workspace<br/><small>Your space, your history.</small></span></div><button className="profile-button"><span className="avatar">A</span><span className="profile-name">My workspace<small>Private space</small></span><span className="profile-menu">···</span></button></div>
      </aside>

      <section className="main-column">
        <header className="topbar"><div className="breadcrumb"><span>MYOS</span><span className="crumb-slash">/</span><strong>{active}</strong></div><div className="topbar-right"><span className="today-label">Thursday, September 25</span><button className="top-capture" onClick={() => setCaptureOpen(true)}>＋ <span>Capture</span></button></div></header>
        <div className="page-content">
          <section className="welcome"><div><div className="eyebrow"><span className="eyebrow-line"/> YOUR PERSONAL SPACE</div><h1>{active === "Home" ? "A little more clarity." : active}</h1><p className="welcome-copy">{active === "Home" ? "Your thoughts, decisions, and progress — all in one place." : active === "Timeline" ? "A quiet record of what you have learned, made, and lived." : `Everything you have collected in ${active.toLowerCase()}.`}</p></div><div className="welcome-date"><span className="date-day">25</span><span className="date-month">THU<br/>SEP</span></div></section>

          <section className="search-panel" aria-label="Search your personal knowledge"><div className="search-leading"><SearchIcon /></div><input id="global-search" aria-label="Search everything" value={query} onChange={(event) => setQuery(event.target.value)} onFocus={() => { if (active === "Home") setActive("Search"); }} placeholder="Search anything you have saved…"/><button className="search-key" onClick={() => setCommandOpen(true)}>⌘ K</button><span className="search-divider"/><button className="filter-button" aria-label="Search filters">☷</button></section>

          <div className="section-heading"><div><div className="section-kicker">YOUR SPACE, IN MOTION</div><h2>{query ? "Search results" : active === "Timeline" ? "Your timeline" : "A day in your life"}</h2></div><button className="date-link" onClick={() => { setActive("Timeline"); setQuery(""); }}>Today <span>⌄</span></button></div>

          <div className="content-grid"><section className="activity-column"><div className="timeline-day"><div className="timeline-date"><span className="timeline-day-num">25</span><span>SEP<br/>THU</span></div><div className="timeline-rule"/><div className="day-activity"><span className="activity-pip"/><span>{visibleCaptures.length ? `${visibleCaptures.length} moments worth keeping` : "Nothing here yet"}</span></div></div>
            {visibleCaptures.length ? <div className="capture-list">{visibleCaptures.map((item) => <article className="capture-row" key={item.id}><div className={`type-marker marker-${item.type.toLowerCase()}`}>{item.type === "Knowledge" ? "▤" : item.type === "Decision" ? "◇" : item.type === "Idea" ? "✧" : item.type === "Project" ? "▱" : "·"}</div><div className="capture-body"><div className="capture-meta"><span className={`type-label label-${item.type.toLowerCase()}`}>{item.type}</span><span className="meta-dot">·</span><span>{item.time}</span>{item.project && <><span className="meta-dot">·</span><span className="project-label">{item.project}</span></>}</div><h3>{item.title}</h3><p>{item.content}</p></div><button className="more-button" aria-label={`More options for ${item.title}`}>···</button></article>)}</div> : <div className="empty-state"><span className="empty-icon">⌕</span><h3>No matches yet</h3><p>Try another search, or capture a thought to start building your library.</p><button onClick={() => setCaptureOpen(true)}>＋ Capture something</button></div>}
            <button className="see-all" onClick={() => { setActive("Timeline"); setQuery(""); }}>View timeline <span>→</span></button>
          </section>

          <aside className="right-rail"><section className="rail-section focus-section"><div className="rail-heading"><span className="rail-icon focus-icon">✳</span><div><span className="rail-kicker">IN FOCUS</span><h3>Active projects</h3></div><button className="rail-more" onClick={() => setActive("Projects")}>···</button></div><button className="project-card" onClick={() => { setActive("Projects"); setQuery("Whispr"); }}><div className="project-card-top"><span className="project-symbol">W</span><span className="status-pill"><i/>In progress</span></div><h4>Whispr</h4><p>Voice, captured simply.</p><div className="project-progress"><span/><span/><span/><span/><span/><span/><span/><span/></div><div className="project-foot"><span>Release 1.4</span><span>6 of 8</span></div></button><button className="project-card secondary-project" onClick={() => { setActive("Projects"); setQuery("MYOS"); }}><div className="project-card-top"><span className="project-symbol myos-symbol">m</span><span className="status-pill planning-pill"><i/>Planning</span></div><h4>MYOS</h4><p>Build a home for your thinking.</p><div className="project-foot"><span>Just getting started</span><span>→</span></div></button><button className="text-action" onClick={() => setActive("Projects")}>All projects <span>→</span></button></section>
          <section className="rail-section remember-section"><div className="rail-heading"><span className="rail-icon remember-icon">↗</span><div><span className="rail-kicker">A SMALL REMINDER</span><h3>Worth another look</h3></div></div><button className="reminder-card" onClick={() => { setActive("Decisions"); setQuery("Supabase"); }}><span className="reminder-type">DECISION · SEP 23</span><strong>Move the MYOS data layer to Supabase</strong><span className="reminder-bottom">Review in 2 weeks <span>→</span></span></button></section>
          <section className="rail-section connections-section"><div className="rail-heading"><span className="rail-icon connection-icon">⌁</span><div><span className="rail-kicker">THREADS TO FOLLOW</span><h3>Suggested connections</h3></div></div><button className="connection-link" onClick={() => { setActive("Search"); setQuery("R8"); }}><span className="connection-dots"><i/><i/><i/></span><span><strong>R8 shrinking</strong><small>connects to Android release</small></span><span className="connection-arrow">↗</span></button></section></aside>
          </div>
          <footer className="page-footer"><span>Small steps add up.</span><span>Made for your life, not your feed.</span></footer>
        </div>
      </section>

      {captureOpen && <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCaptureOpen(false); }}><section className="capture-dialog" role="dialog" aria-modal="true" aria-labelledby="capture-heading"><div className="dialog-top"><div className="dialog-mark">＋</div><button className="dialog-close" aria-label="Close capture" onClick={() => setCaptureOpen(false)}>×</button></div><div className="dialog-eyebrow">A THOUGHT TO KEEP</div><h2 id="capture-heading">Capture a thought.</h2><p className="dialog-copy">Start with what matters. You can add details later.</p><input className="title-input" placeholder="Give it a title (optional)" value={title} onChange={(event) => setTitle(event.target.value)}/><textarea ref={editor} className="capture-editor" placeholder="What’s on your mind?" value={content} onChange={(event) => setContent(event.target.value)}/><div className="dialog-bottom"><label className="type-select-label">TYPE <select value={type} onChange={(event) => setType(event.target.value)}><option>Capture</option><option>Knowledge</option><option>Idea</option><option>Decision</option><option>Project</option><option>Milestone</option><option>Journal</option><option>Goal</option><option>Book</option><option>Resource</option><option>Task</option></select></label><button className="save-button" onClick={saveCapture}>Save capture <span>↗</span></button></div><div className="local-note">Session-only demo · not saved after refresh</div></section></div>}

      {commandOpen && <div className="overlay command-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCommandOpen(false); }}><section className="command-dialog" role="dialog" aria-modal="true" aria-label="Command menu"><div className="command-input-row"><SearchIcon/><input autoFocus placeholder="Search, or type a command…" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { setActive("Search"); setCommandOpen(false); } }}/><kbd>ESC</kbd></div><div className="command-group-label">CREATE SOMETHING</div><div className="command-grid">{["Capture", "Knowledge", "Idea", "Project", "Decision", "Milestone", "Goal", "Journal", "Book", "Resource", "Task", "Person"].map((item) => <button key={item} onClick={() => chooseCommand(item)}><span>＋</span> {item}</button>)}</div><div className="command-group-label retrieval-label">GO SOMEWHERE</div><button className="command-search-row" onClick={() => chooseCommand("Search")}><SearchIcon/><span>Search your space</span><kbd>↵</kbd></button></section></div>}
    </main>
  );
}
