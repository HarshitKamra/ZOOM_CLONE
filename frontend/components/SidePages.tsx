"use client";

import { useEffect, useState } from "react";
import { formatClock, groupMeetings, invitation } from "@/lib/format";
import type { Meeting } from "@/lib/types";
import Avatar from "./Avatar";
import { CaretIcon, CloseIcon, CopyIcon, GearIcon, MoreIcon, SearchIcon, ZoomIcon } from "./icons";

const CONTACTS = [
  { id: "sam", name: "Sam Rivera", email: "sam.rivera@example.com", color: "#F26D21" },
];

function ProBanner({ onUpgrade, onClose }: { onUpgrade: () => void; onClose: () => void }) {
  return (
    <aside className="wp-banner">
      <img src="/brand/meeting-preview.jpg" alt="" />
      <div className="wp-copy">
        <strong>Workplace Pro</strong>
        <p>Including Clips, AI tools, cloud recording, and advanced meetings.</p>
        <span className="wp-price">₹1239/mo/user, annual · Save up to 16%</span>
      </div>
      <div className="wp-actions">
        <button className="btn-primary slim" onClick={onUpgrade}>
          Upgrade
        </button>
        <button className="icon-btn" aria-label="More about Workplace Pro" onClick={onUpgrade}>
          <ZoomIcon name="chevron-small-right" size={16} />
        </button>
        <button className="icon-btn" aria-label="Dismiss" onClick={onClose}>
          <CloseIcon size={14} />
        </button>
      </div>
    </aside>
  );
}

export function ChatPage({ onUpgrade, onNotice }: { onUpgrade: () => void; onNotice: (message: string) => void }) {
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<"chat" | "new" | null>(null);
  const [prompt, setPrompt] = useState(true);
  const [clearOut, setClearOut] = useState(false);
  const [banner, setBanner] = useState(true);
  const [draft, setDraft] = useState("");
  const [threads, setThreads] = useState<{ id: string; name: string; lines: { mine: boolean; body: string }[] }[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = threads.find((thread) => thread.id === activeId) || null;

  const folders = [
    { id: "apps", label: "Apps" },
    { id: "chats", label: "Chats & Channels" },
    { id: "starred", label: "Starred" },
    { id: "spaces", label: "Shared spaces" },
  ];

  function toggleFolder(id: string) {
    setOpen((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function newChat() {
    setMenu(null);
    setThreads((prev) => (prev.some((thread) => thread.id === "sam") ? prev : [{ id: "sam", name: "Sam Rivera", lines: [] }, ...prev]));
    setOpen((prev) => ({ ...prev, chats: true }));
    setActiveId("sam");
    setFilter("all");
  }

  function send() {
    const body = draft.trim();
    if (!body || !active) return;
    setThreads((prev) =>
      prev.map((thread) => (thread.id === active.id ? { ...thread, lines: [...thread.lines, { mine: true, body }] } : thread)),
    );
    setDraft("");
  }

  return (
    <div className="side-page">
      <div className="split-page">
        <section className="list-pane">
          <div className="pane-head">
            <button className="pane-title" data-pop-trigger onClick={() => setMenu(menu === "chat" ? null : "chat")}>
              Chat <CaretIcon size={12} />
            </button>
            {menu === "chat" && (
              <div className="menu-pop pane-menu" data-pop>
                <button onClick={() => setMenu(null)}>Chat</button>
              </div>
            )}
            <div className="pane-tools">
              <button className="icon-btn" aria-label="Chat settings" onClick={() => onNotice("Chat settings aren't part of this demo")}>
                <GearIcon size={16} />
              </button>
              <button className="plus-round" aria-label="New chat" data-pop-trigger onClick={() => setMenu(menu === "new" ? null : "new")}>
                <ZoomIcon name="plus" size={14} />
              </button>
              {menu === "new" && (
                <div className="menu-pop pane-menu new-menu" data-pop>
                  <button onClick={newChat}>New chat</button>
                </div>
              )}
            </div>
          </div>
          <div className="chip-row">
            <button className={filter === "all" ? "chip on" : "chip"} onClick={() => setFilter("all")}>
              All
            </button>
            <button className={filter === "mentions" ? "chip icon on" : "chip icon"} aria-label="Mentions" onClick={() => setFilter("mentions")}>
              @
            </button>
            <button className={filter === "dms" ? "chip icon on" : "chip icon"} aria-label="Direct messages" onClick={() => setFilter("dms")}>
              <ZoomIcon name="chat" size={16} />
            </button>
            <button className={filter === "starred" ? "chip icon on" : "chip icon"} aria-label="Starred" onClick={() => setFilter("starred")}>
              <ZoomIcon name="star" size={16} />
            </button>
            <button className="chip icon" aria-label="More filters" onClick={() => setFilter("all")}>
              <MoreIcon size={16} />
            </button>
          </div>
          <div className="folder-list">
            {filter !== "all" ? (
              <p className="folder-empty">Nothing in this filter</p>
            ) : (
              folders.map((folder) => (
                <div key={folder.id}>
                  <button className={open[folder.id] ? "folder open" : "folder"} onClick={() => toggleFolder(folder.id)}>
                    <ZoomIcon name="chevron-right-v2" size={12} />
                    {folder.label}
                  </button>
                  {open[folder.id] && folder.id === "chats" && threads.length > 0 && (
                    <div className="thread-list">
                      {threads.map((thread) => (
                        <button
                          key={thread.id}
                          className={activeId === thread.id ? "thread on" : "thread"}
                          onClick={() => setActiveId(thread.id)}
                        >
                          <Avatar name={thread.name} size={28} />
                          <span>{thread.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {open[folder.id] && (folder.id !== "chats" || threads.length === 0) && (
                    <p className="folder-empty">No {folder.label.toLowerCase()} yet</p>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
        <section className="stage">
          {prompt && (
            <div className="storage-card">
              <button className="storage-x" aria-label="Close" onClick={() => setPrompt(false)}>
                <CloseIcon size={14} />
              </button>
              <h3>
                <ZoomIcon name="classic-doc" size={16} /> Local Data Storage
              </h3>
              <p>
                Data will be stored locally to improve app performance and enable offline functionality. Not recommended on
                public or shared computers.
              </p>
              <div className="storage-row">
                <label>
                  <input type="checkbox" checked={clearOut} onChange={(event) => setClearOut(event.target.checked)} />
                  Clear data on logout
                </label>
                <div className="storage-actions">
                  <button className="btn-ghost slim" onClick={() => setPrompt(false)}>
                    Disable
                  </button>
                  <button className="btn-primary slim" onClick={() => setPrompt(false)}>
                    Enable
                  </button>
                </div>
              </div>
            </div>
          )}
          {active ? (
            <div className="thread-view">
              <header>{active.name}</header>
              <div className="thread-lines">
                {active.lines.length === 0 && <p>This is the start of your chat with {active.name}.</p>}
                {active.lines.map((line, index) => (
                  <p key={index} className={line.mine ? "mine" : ""}>
                    {line.body}
                  </p>
                ))}
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  send();
                }}
              >
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={`Message ${active.name}`}
                  aria-label={`Message ${active.name}`}
                />
              </form>
            </div>
          ) : (
            <div className="empty-hero">
              <div className="bubbles" aria-hidden="true">
                <span className="bubble back" />
                <span className="bubble front">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
              <p>Start chatting by clicking or creating a chat in the left sidebar.</p>
            </div>
          )}
        </section>
      </div>
      {banner && <ProBanner onUpgrade={onUpgrade} onClose={() => setBanner(false)} />}
    </div>
  );
}

export function ContactsPage({
  onUpgrade,
  onMeet,
  onNotice,
}: {
  onUpgrade: () => void;
  onMeet: () => void;
  onNotice: (message: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [banner, setBanner] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 700);
    return () => window.clearTimeout(timer);
  }, []);

  const needle = query.trim().toLowerCase();
  const people = CONTACTS.filter(
    (person) => !needle || person.name.toLowerCase().includes(needle) || person.email.includes(needle),
  );
  const person = people.find((item) => item.id === selected) || null;

  return (
    <div className="side-page">
      <div className="split-page">
        <section className="list-pane contacts-pane">
          <div className="contact-search">
            <SearchIcon size={16} />
            <input
              placeholder="Search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search contacts"
            />
            <button className="plus-round" aria-label="Add contact" data-pop-trigger onClick={() => setAddOpen((open) => !open)}>
              <ZoomIcon name="plus" size={14} />
            </button>
            {addOpen && (
              <div className="menu-pop pane-menu add-menu" data-pop>
                <button
                  onClick={() => {
                    setAddOpen(false);
                    onNotice("Inviting contacts isn't part of this demo");
                  }}
                >
                  Invite a contact
                </button>
              </div>
            )}
          </div>
          {loading ? (
            <div className="contact-loading">
              <span className="spin" />
              <span>Loading</span>
            </div>
          ) : (
            <div className="thread-list">
              {people.length === 0 && <p className="folder-empty">No contacts</p>}
              {people.map((item) => (
                <button
                  key={item.id}
                  className={selected === item.id ? "thread on" : "thread"}
                  onClick={() => setSelected(item.id)}
                >
                  <Avatar name={item.name} color={item.color} size={32} />
                  <span>{item.name}</span>
                </button>
              ))}
            </div>
          )}
        </section>
        <section className="stage">
          {person ? (
            <div className="contact-card">
              <Avatar name={person.name} color={person.color} size={72} />
              <h2>{person.name}</h2>
              <p>{person.email}</p>
              <button className="btn-primary" onClick={onMeet}>
                Meet
              </button>
            </div>
          ) : (
            <div className="empty-hero">
              <div className="contact-art" aria-hidden="true">
                <span className="contact-sheet">
                  <span className="contact-head" />
                  <span className="contact-line" />
                </span>
                <span className="tab red" />
                <span className="tab gold" />
                <span className="tab green" />
                <span className="tab blue" />
              </div>
              <p>View Contact info by clicking a contact in the left panel</p>
            </div>
          )}
        </section>
      </div>
      {banner && <ProBanner onUpgrade={onUpgrade} onClose={() => setBanner(false)} />}
    </div>
  );
}

export function MeetingsPage({
  personal,
  upcoming,
  recent,
  onStart,
  onCopyInvite,
  onSchedule,
  onSummarise,
  onBack,
  onUpgrade,
  onNotice,
}: {
  personal: Meeting;
  upcoming: Meeting[];
  recent: Meeting[];
  onStart: (meeting: Meeting) => void;
  onCopyInvite: (meeting: Meeting) => void;
  onSchedule: () => void;
  onSummarise: (meeting: Meeting) => void;
  onBack: () => void;
  onUpgrade: () => void;
  onNotice: (message: string) => void;
}) {
  const [tab, setTab] = useState<"upcoming" | "previous">("upcoming");
  const [selectedCode, setSelectedCode] = useState(personal.code);
  const [menu, setMenu] = useState(false);
  const [inviteOn, setInviteOn] = useState(false);
  const [banner, setBanner] = useState(true);

  const rows = (tab === "upcoming" ? upcoming : recent).filter((meeting) => meeting.code !== personal.code);
  const selected =
    [...(tab === "upcoming" ? [personal] : []), ...rows].find((meeting) => meeting.code === selectedCode) ||
    (tab === "upcoming" ? personal : rows[0]) ||
    null;

  function pickTab(next: "upcoming" | "previous") {
    setTab(next);
    setMenu(false);
    setInviteOn(false);
    setSelectedCode(next === "upcoming" ? personal.code : recent.find((meeting) => meeting.code !== personal.code)?.code || "");
  }

  return (
    <div className="side-page">
      <div className="split-page">
        <section className="list-pane">
          <div className="pane-head">
            <button className="icon-btn" aria-label="Back" onClick={onBack}>
              <ZoomIcon name="chevron-small-left" size={16} />
            </button>
            <button className="pane-title" data-pop-trigger onClick={() => setMenu((open) => !open)}>
              {tab === "upcoming" ? "Upcoming" : "Previous"} <CaretIcon size={12} />
            </button>
            {menu && (
              <div className="menu-pop pane-menu" data-pop>
                <button onClick={() => pickTab("upcoming")}>Upcoming</button>
                <button onClick={() => pickTab("previous")}>Previous</button>
              </div>
            )}
            {tab === "upcoming" && (
              <button className="header-link schedule-link" onClick={onSchedule}>
                Schedule
              </button>
            )}
          </div>
          {tab === "upcoming" && (
            <button
              className={selected?.code === personal.code ? "pmi-card on" : "pmi-card"}
              onClick={() => {
                setSelectedCode(personal.code);
                setInviteOn(false);
              }}
            >
              <strong>{personal.display_code}</strong>
              <span>My Personal Meeting ID (PMI)</span>
            </button>
          )}
          <div className="folder-list">
            {rows.length === 0 ? (
              <p className="meet-none">{tab === "upcoming" ? "No upcoming meetings" : "No previous meetings"}</p>
            ) : (
              groupMeetings(rows, tab === "previous").map((group) => (
                <div key={group.label}>
                  <h3 className="group-title meet-group">{group.label}</h3>
                  {group.items.map((meeting) => (
                    <button
                      key={meeting.code}
                      className={selected?.code === meeting.code ? "meet-pick on" : "meet-pick"}
                      onClick={() => {
                        setSelectedCode(meeting.code);
                        setInviteOn(false);
                      }}
                    >
                      <strong>{meeting.title}</strong>
                      <span>
                        {meeting.status === "live" && tab === "upcoming"
                          ? "Now"
                          : formatClock(tab === "previous" ? meeting.ended_at || meeting.scheduled_at : meeting.scheduled_at)}
                      </span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
          <button className="add-cal" onClick={() => onNotice("Calendar connect isn't part of this demo")}>
            <ZoomIcon name="calendar" size={14} /> Add a calendar
          </button>
        </section>
        <section className="stage meet-detail">
          {selected ? (
            <div>
              <h2>{selected.is_personal ? "My Personal Meeting ID (PMI)" : selected.title}</h2>
              <p className="meet-id">{selected.display_code}</p>
              <div className="meet-actions">
                <button className="btn-primary" onClick={() => onStart(selected)}>
                  {selected.status === "live" && tab === "upcoming" ? "Join" : "Start"}
                </button>
                <button className="btn-ghost" onClick={() => onCopyInvite(selected)}>
                  <CopyIcon size={16} /> Copy Invitation
                </button>
                {tab === "previous" ? (
                  <button className="btn-ghost" onClick={() => onSummarise(selected)}>
                    Summarise
                  </button>
                ) : (
                  <button className="btn-ghost" onClick={() => onNotice("Editing a meeting isn't part of this demo")}>
                    <ZoomIcon name="edit" size={16} /> Edit
                  </button>
                )}
              </div>
              <button className="invite-toggle" onClick={() => setInviteOn((open) => !open)}>
                {inviteOn ? "Hide Meeting Invitation" : "Show Meeting Invitation"}
              </button>
              {inviteOn && <pre className="invite-body">{invitation(selected, window.location.origin)}</pre>}
            </div>
          ) : (
            <p className="meet-none">Select a meeting</p>
          )}
        </section>
      </div>
      {banner && <ProBanner onUpgrade={onUpgrade} onClose={() => setBanner(false)} />}
    </div>
  );
}
