"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, createMeeting, getHome } from "@/lib/api";
import { copyText, invitation, normalizeCode, PENDING_JOIN, sortRecent, sortUpcoming } from "@/lib/format";
import { loadPrefs, type Prefs } from "@/lib/prefs";
import type { HomeData, Meeting, PendingJoin } from "@/lib/types";
import { useToast } from "@/lib/useToast";
import Avatar from "./Avatar";
import { InviteDialog, JoinDialog, ScheduleDialog, SettingsDialog } from "./Dialogs";
import {
  BellIcon,
  BoardIcon,
  CalendarIcon,
  CameraOffIcon,
  CaretIcon,
  ChatNavIcon,
  CloseIcon,
  ContactsIcon,
  GearIcon,
  HomeIcon,
  InfoIcon,
  Logo,
  MeetingsIcon,
  MoreIcon,
  RecordIcon,
  SearchIcon,
  ZoomIcon,
} from "./icons";
import { ChatPage, ContactsPage, MeetingsPage } from "./SidePages";

type View =
  | { name: "home" }
  | { name: "meetings"; tab: "upcoming" | "previous" }
  | { name: "summaries" }
  | { name: "chat" }
  | { name: "contacts" }
  | { name: "placeholder"; id: "whiteboards" | "recordings" | "notes" };

const PLACES = {
  whiteboards: {
    title: "Whiteboards",
    body: "Whiteboards aren't part of this demo.",
  },
  recordings: {
    title: "Recordings",
    body: "Use Record inside a meeting. The file downloads to this computer when you stop.",
  },
  notes: {
    title: "My Notes",
    body: "Notes aren't part of this demo.",
  },
};

function dayStamp(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

function onDay(iso: string | null, day: Date) {
  if (!iso) return false;
  return dayStamp(new Date(iso)) === dayStamp(day);
}

function clockRange(meeting: Meeting) {
  const startIso = meeting.scheduled_at || meeting.started_at || meeting.ended_at;
  if (!startIso) return "Now";
  const start = new Date(startIso);
  const end = new Date(start.getTime() + meeting.duration_minutes * 60_000);
  const fmt = (value: Date) => value.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${fmt(start)} – ${fmt(end)}`;
}

function summaryText(meeting: Meeting) {
  const when = meeting.ended_at || meeting.scheduled_at || meeting.started_at;
  const stamp = when
    ? new Date(when).toLocaleString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "an unscheduled time";
  return `${meeting.title} with ${meeting.host_name} lasted ${meeting.duration_minutes} minutes, starting ${stamp}. Meeting ID ${meeting.display_code}. This demo has no transcript, so the summary is taken from the meeting details.`;
}

export default function Dashboard() {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<HomeData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState<View>({ name: "home" });
  const [dialog, setDialog] = useState<"join" | "schedule" | "settings" | null>(null);
  const [invite, setInvite] = useState<Meeting | null>(null);
  const [menu, setMenu] = useState<"new" | "profile" | "bell" | "products" | "cal" | "picker" | null>(null);
  const [pickerMonth, setPickerMonth] = useState(() => new Date());
  const [now, setNow] = useState(() => new Date());
  const [dayOffset, setDayOffset] = useState(0);
  const [summaryMeeting, setSummaryMeeting] = useState<Meeting | null>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [usePmi, setUsePmi] = useState(false);
  const [promoOn, setPromoOn] = useState(true);
  const [past, setPast] = useState<View[]>([]);
  const [future, setFuture] = useState<View[]>([]);
  const [prefs, setPrefs] = useState<Prefs>({ videoOnJoin: true, muteOnJoin: false });
  const searchRef = useRef<HTMLInputElement>(null);
  const dataRef = useRef<HomeData | null>(null);
  dataRef.current = data;

  async function refresh() {
    try {
      const next = await getHome();
      setData(next);
      setLoadError("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load";
      if (!dataRef.current) setLoadError(message);
      else toast.show(message);
    }
  }

  useEffect(() => {
    setPrefs(loadPrefs());
    const clock = window.setInterval(() => setNow(new Date()), 1000);
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    void refresh();
    return () => {
      window.clearInterval(clock);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!menu) return;
    const onDoc = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("[data-pop]") || target.closest("[data-pop-trigger]")) return;
      setMenu(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  function openView(next: View) {
    setPast((items) => [...items, view]);
    setFuture([]);
    setView(next);
  }

  function goBack() {
    if (!past.length) return;
    const prev = past[past.length - 1];
    setPast(past.slice(0, -1));
    setFuture([view, ...future]);
    setView(prev);
  }

  function goForward() {
    if (!future.length) return;
    const [next, ...rest] = future;
    setFuture(rest);
    setPast([...past, view]);
    setView(next);
  }

  function go(pending: PendingJoin) {
    sessionStorage.setItem(PENDING_JOIN, JSON.stringify(pending));
    router.push(`/meeting/${normalizeCode(pending.code)}?go=1`);
  }

  function startExisting(meeting: Meeting, extra?: { video?: boolean; share?: boolean }) {
    if (!data) return;
    go({
      code: meeting.code,
      name: data.user.name,
      passcode: meeting.passcode || undefined,
      hostKey: meeting.host_key,
      audio: !prefs.muteOnJoin,
      video: extra?.video ?? prefs.videoOnJoin,
      share: extra?.share,
    });
  }

  async function startInstant(video: boolean, share = false) {
    try {
      const meeting = await createMeeting({ instant: true, title: "", duration_minutes: 60 });
      go({
        code: meeting.code,
        name: data?.user.name || "Harshit Kamra",
        passcode: meeting.passcode || undefined,
        hostKey: meeting.host_key,
        audio: !prefs.muteOnJoin,
        video,
        share,
      });
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : "Could not start the meeting");
    }
  }

  async function copyInvite(meeting: Meeting) {
    await copyText(invitation(meeting, window.location.origin));
    toast.show("Invitation copied");
  }

  async function copyLink(meeting: Meeting) {
    await copyText(window.location.origin + (meeting.invite_path || `/j/${meeting.code}`));
    toast.show("Link copied");
  }

  if (!data && loadError) {
    return (
      <div className="boot">
        <Logo size={48} />
        <h1>Can&apos;t reach the meeting server</h1>
        <p>{loadError}</p>
        <p className="hint">
          From the backend folder, run <code>uvicorn app.main:app --reload --port 8000</code>
        </p>
        <button className="btn-primary" onClick={() => void refresh()}>
          Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="boot">
        <Logo size={48} />
        <p>Loading…</p>
      </div>
    );
  }

  const upcoming = sortUpcoming(data.upcoming);
  const recent = sortRecent(data.recent);
  const pool = [data.personal_meeting, ...upcoming, ...recent];
  const needle = query.trim().toLowerCase();
  const hits = needle
    ? pool
        .filter((meeting) => {
          const digits = needle.replace(/\D/g, "");
          return (
            meeting.title.toLowerCase().includes(needle) ||
            meeting.display_code.toLowerCase().includes(needle) ||
            (digits.length >= 3 && meeting.code.includes(digits))
          );
        })
        .slice(0, 8)
    : [];

  const selected = new Date(now);
  selected.setDate(selected.getDate() + dayOffset);
  const agendaLabel =
    dayOffset === 0
      ? "Today"
      : dayOffset === 1
        ? "Tomorrow"
        : dayOffset === -1
          ? "Yesterday"
          : selected.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const dayUpcoming = upcoming.filter(
    (meeting) =>
      (dayOffset === 0 && meeting.status === "live") || onDay(meeting.scheduled_at || meeting.started_at, selected),
  );
  const clock = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const dateLine = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  const rail = [
    { id: "home", label: "Home", icon: <HomeIcon />, onClick: () => openView({ name: "home" }), active: view.name === "home" },
    { id: "chat", label: "Chat", icon: <ChatNavIcon />, onClick: () => openView({ name: "chat" }), active: view.name === "chat" },
    { id: "meetings", label: "Meetings", icon: <MeetingsIcon />, onClick: () => openView({ name: "meetings", tab: "upcoming" }), active: view.name === "meetings" },
    { id: "contacts", label: "Contacts", icon: <ContactsIcon />, onClick: () => openView({ name: "contacts" }), active: view.name === "contacts" },
  ];

  return (
    <div className="app zoom-app">
      <header className="zoom-header">
        <button className="brand-name" onClick={() => openView({ name: "home" })} aria-label="Zoom Workplace home">
          <img src="/brand/zoom-logo.svg" alt="" className="zoom-logo" />
          <span className="brand-rule" aria-hidden="true" />
          <span className="workplace-label">Workplace</span>
        </button>
        <div className="header-menu">
          <button
            className="header-link"
            data-pop-trigger
            onClick={() => setMenu(menu === "products" ? null : "products")}
          >
            Discover Products <CaretIcon size={10} />
          </button>
          {menu === "products" && (
            <div className="menu-pop header-pop" data-pop>
              <button onClick={() => { setMenu(null); openView({ name: "meetings", tab: "upcoming" }); }}>Meetings</button>
              <button onClick={() => { setMenu(null); openView({ name: "chat" }); }}>Team Chat</button>
              <button onClick={() => { setMenu(null); openView({ name: "placeholder", id: "whiteboards" }); }}>
                <BoardIcon size={16} /> Whiteboards
              </button>
              <button onClick={() => { setMenu(null); openView({ name: "contacts" }); }}>Contacts</button>
              <button onClick={() => { setMenu(null); openView({ name: "placeholder", id: "recordings" }); }}>Recordings</button>
              <button onClick={() => { setMenu(null); openView({ name: "summaries" }); }}>Summaries</button>
              <button onClick={() => { setMenu(null); openView({ name: "placeholder", id: "notes" }); }}>My Notes</button>
            </div>
          )}
        </div>
        <button className="header-link pricing-link" onClick={() => toast.show("Pricing isn't part of this demo")}>Pricing</button>
        <div className="hist-btns">
          <button className="icon-btn" aria-label="Back" disabled={!past.length} onClick={goBack}>
            <ZoomIcon name="chevron-small-left" size={16} />
          </button>
          <button className="icon-btn" aria-label="Forward" disabled={!future.length} onClick={goForward}>
            <ZoomIcon name="chevron-small-right" size={16} />
          </button>
        </div>
        <button className="icon-btn" aria-label="Search" onClick={() => searchRef.current?.focus()}>
          <SearchIcon size={18} />
        </button>
        <div className="header-right">
          <div className="search">
            <input
              ref={searchRef}
              placeholder="Search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => window.setTimeout(() => setSearchOpen(false), 180)}
              aria-label="Search meetings"
            />
            <kbd>Ctrl+K</kbd>
            {searchOpen && needle && (
              <div className="search-results" data-pop>
                {hits.length === 0 && <p className="hint">No meetings match</p>}
                {hits.map((meeting) => (
                  <button key={meeting.code} onClick={() => startExisting(meeting)}>
                    <strong>{meeting.title}</strong>
                    <span>{meeting.display_code}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="header-link admin-link" onClick={() => toast.show("Admin Center isn't part of this demo")}>
            Admin Center
          </button>
          <button className="btn-ghost header-download" onClick={() => toast.show("Download isn't part of this demo")}>
            Download
          </button>
          <button className="btn-primary header-upgrade" onClick={() => toast.show("Upgrades aren't part of this demo")}>
            Upgrade
          </button>
          <div className="top-actions">
            <button
              className="icon-btn"
              data-pop-trigger
              aria-label="Notifications"
              onClick={() => setMenu(menu === "bell" ? null : "bell")}
            >
              <BellIcon />
            </button>
            <button
              className="avatar-btn"
              data-pop-trigger
              aria-label="Profile"
              onClick={() => setMenu(menu === "profile" ? null : "profile")}
            >
              <Avatar name={data.user.name} color={data.user.avatar_color} size={32} />
            </button>
            {menu === "bell" && (
              <div className="menu-pop anchor" data-pop>
                <p className="hint">No new notifications</p>
              </div>
            )}
            {menu === "profile" && (
              <div className="menu-pop anchor profile-menu" data-pop>
                <div className="profile-head">
                  <Avatar name={data.user.name} color={data.user.avatar_color} size={48} />
                  <div className="profile-meta">
                    <strong>{data.user.name}</strong>
                    <span>{data.user.email}</span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setMenu(null);
                    setDialog("settings");
                  }}
                >
                  Settings
                </button>
                <button onClick={() => toast.show("This demo stays signed in as Harshit Kamra")}>Sign out</button>
              </div>
            )}
          </div>
        </div>
      </header>
      <div className="zoom-body">
        <aside className="sidebar">
          <nav className="nav">
            {rail.map((item) => (
              <button key={item.id} className={item.active ? "nav-item active" : "nav-item"} onClick={item.onClick}>
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
          <div className="side-spacer" />
          <button className="nav-item" onClick={() => setDialog("settings")}>
            <GearIcon />
            <span>Settings</span>
          </button>
        </aside>
        <div className={view.name === "chat" || view.name === "contacts" || view.name === "meetings" ? "content zoom-canvas fill" : "content zoom-canvas"}>
          {view.name === "home" && (
            <div className="zoom-home">
              <div className="zoom-clock">{clock}</div>
              <div className="zoom-date">{dateLine}</div>
              <div className="actions zoom-actions">
                <div className="action">
                  <button
                    className="action-btn orange"
                    aria-label="New meeting"
                    onClick={() => {
                      setMenu(null);
                      if (usePmi) startExisting(data.personal_meeting);
                      else void startInstant(prefs.videoOnJoin);
                    }}
                  >
                    <CameraOffIcon size={28} />
                  </button>
                  <button
                    className="action-caption"
                    data-pop-trigger
                    onClick={() => setMenu(menu === "new" ? null : "new")}
                  >
                    New meeting <CaretIcon size={10} />
                  </button>
                  {menu === "new" && (
                    <div className="menu-pop pmi-menu" data-pop>
                      <label className="pmi-check">
                        <input type="checkbox" checked={usePmi} onChange={(event) => setUsePmi(event.target.checked)} />
                        Use my Personal Meeting ID (PMI)
                      </label>
                      <button onClick={() => startExisting(data.personal_meeting)}>
                        <span>{data.user.personal_display_code}</span>
                        <ZoomIcon name="chevron-small-right" size={14} />
                      </button>
                    </div>
                  )}
                </div>
                <button className="action" onClick={() => setDialog("join")}>
                  <span className="action-btn blue">
                    <ZoomIcon name="plus-squircle" size={28} />
                  </span>
                  <span>Join</span>
                </button>
                <button className="action" onClick={() => setDialog("schedule")}>
                  <span className="action-btn blue cal-btn">
                    <span className="cal-face" aria-hidden="true">
                      <span className="cal-rings">
                        <i />
                        <i />
                      </span>
                      <span className="cal-page">{now.getDate()}</span>
                    </span>
                  </span>
                  <span>Schedule</span>
                </button>
              </div>
              <div className="hub-row home-hubs">
                <button className="hub-card" onClick={() => openView({ name: "placeholder", id: "recordings" })}>
                  <span className="hub-icon rec">
                    <RecordIcon size={16} />
                  </span>
                  Recordings
                </button>
                <button className="hub-card" onClick={() => openView({ name: "summaries" })}>
                  <span className="hub-icon sum">
                    <ZoomIcon name="ai-companion" size={18} />
                  </span>
                  Summaries
                </button>
                <button className="hub-card" onClick={() => openView({ name: "placeholder", id: "notes" })}>
                  <span className="hub-icon notes">
                    <ZoomIcon name="edit" size={18} />
                  </span>
                  My Notes
                </button>
              </div>
              {promoOn && (
                <section className="pro-card">
                  <button className="pro-x" aria-label="Dismiss" onClick={() => setPromoOn(false)}>
                    <CloseIcon size={14} />
                  </button>
                  <div>
                    <div className="pro-kicker">
                      <Logo size={18} /> Workplace Pro
                    </div>
                    <h3>Limited time offer!</h3>
                    <p>Take an additional 15% off when you upgrade to Zoom Workplace Pro annual!</p>
                    <button className="btn-primary" onClick={() => toast.show("Upgrades aren't part of this demo")}>
                      Get offer
                    </button>
                  </div>
                  <div className="pro-photo">
                    <img src="/brand/meeting-preview.jpg" alt="" />
                  </div>
                </section>
              )}
              <div className="cal-banner">
                <InfoIcon size={18} />
                <p>
                  You haven&apos;t connected your calendar yet.{" "}
                  <button type="button" onClick={() => toast.show("Calendar connect isn't part of this demo")}>
                    Connect now
                  </button>{" "}
                  to manage all your meetings and events in one place.
                </p>
              </div>
              <section className="home-agenda">
                <div className="cal-toolbar">
                  <button
                    className="cal-today"
                    data-pop-trigger
                    aria-label="Open calendar"
                    aria-expanded={menu === "picker"}
                    onClick={() => {
                      if (menu === "picker") {
                        setMenu(null);
                        return;
                      }
                      const base = new Date();
                      base.setDate(base.getDate() + dayOffset);
                      setPickerMonth(new Date(base.getFullYear(), base.getMonth(), 1));
                      setMenu("picker");
                    }}
                  >
                    <CalendarIcon size={16} />
                    {agendaLabel}
                  </button>
                  {menu === "picker" && (
                    <div className="menu-pop date-pop" data-pop>
                      <div className="date-head">
                        <button
                          type="button"
                          aria-label="Previous month"
                          onClick={() => setPickerMonth((value) => new Date(value.getFullYear(), value.getMonth() - 1, 1))}
                        >
                          <ZoomIcon name="chevron-small-left" size={14} />
                        </button>
                        <strong>
                          {pickerMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                        </strong>
                        <button
                          type="button"
                          aria-label="Next month"
                          onClick={() => setPickerMonth((value) => new Date(value.getFullYear(), value.getMonth() + 1, 1))}
                        >
                          <ZoomIcon name="chevron-small-right" size={14} />
                        </button>
                      </div>
                      <div className="date-week">
                        {["S", "M", "T", "W", "T", "F", "S"].map((label, index) => (
                          <span key={index}>{label}</span>
                        ))}
                      </div>
                      <div className="date-grid">
                        {Array.from({ length: 42 }, (_, index) => {
                          const first = new Date(pickerMonth.getFullYear(), pickerMonth.getMonth(), 1);
                          const day = new Date(first);
                          day.setDate(1 - first.getDay() + index);
                          const stamp = dayStamp(day);
                          const selectedStamp = dayStamp(selected);
                          const hasMeeting = [...upcoming, ...recent].some((meeting) =>
                            onDay(meeting.scheduled_at || meeting.started_at || meeting.ended_at, day),
                          );
                          const classes = [
                            "date-day",
                            day.getMonth() === pickerMonth.getMonth() ? "" : "outside",
                            stamp === selectedStamp ? "selected" : "",
                            stamp === dayStamp(now) ? "today" : "",
                            hasMeeting ? "marked" : "",
                          ]
                            .filter(Boolean)
                            .join(" ");
                          return (
                            <button
                              key={stamp}
                              type="button"
                              className={classes}
                              onClick={() => {
                                setDayOffset(Math.round((stamp - dayStamp(now)) / 86_400_000));
                                setMenu(null);
                              }}
                            >
                              {day.getDate()}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <button className="icon-btn" aria-label="Previous day" onClick={() => setDayOffset((value) => value - 1)}>
                    <ZoomIcon name="chevron-small-left" size={14} />
                  </button>
                  <button className="icon-btn" aria-label="Next day" onClick={() => setDayOffset((value) => value + 1)}>
                    <ZoomIcon name="chevron-small-right" size={14} />
                  </button>
                  <button
                    className="icon-btn cal-more"
                    data-pop-trigger
                    aria-label="Calendar options"
                    onClick={() => setMenu(menu === "cal" ? null : "cal")}
                  >
                    <MoreIcon size={18} />
                  </button>
                  {menu === "cal" && (
                    <div className="menu-pop cal-menu" data-pop>
                      <button
                        onClick={() => {
                          setMenu(null);
                          setDayOffset(0);
                        }}
                      >
                        Today
                      </button>
                      <button
                        onClick={() => {
                          setMenu(null);
                          openView({ name: "meetings", tab: "upcoming" });
                        }}
                      >
                        All upcoming
                      </button>
                      <button
                        onClick={() => {
                          setMenu(null);
                          openView({ name: "meetings", tab: "previous" });
                        }}
                      >
                        All recent
                      </button>
                    </div>
                  )}
                </div>
                <div className="agenda-block">
                  <h3>Upcoming</h3>
                  {dayUpcoming.length === 0 ? (
                    <p className="day-empty">No upcoming meetings</p>
                  ) : (
                    dayUpcoming.map((meeting) => (
                      <article key={meeting.code} className="day-item">
                        <div className="day-info">
                          <span className="day-topic">{meeting.title}</span>
                          <span className="day-when">{meeting.status === "live" ? "Now" : clockRange(meeting)}</span>
                        </div>
                        <button className="btn-primary slim" onClick={() => startExisting(meeting)}>
                          {meeting.status === "live" ? "Join" : "Start"}
                        </button>
                      </article>
                    ))
                  )}
                </div>
                <div className="agenda-block">
                  <h3>Recent</h3>
                  {recent.length === 0 ? (
                    <p className="day-empty">No recent meetings</p>
                  ) : (
                    recent.map((meeting) => (
                      <article key={meeting.code} className="day-item">
                        <div className="day-info">
                          <span className="day-topic">{meeting.title}</span>
                          <span className="day-when">{clockRange(meeting)}</span>
                        </div>
                        <button className="btn-ghost slim" onClick={() => setSummaryMeeting(meeting)}>
                          Summarise
                        </button>
                        <button className="btn-primary slim" onClick={() => startExisting(meeting)}>
                          Start
                        </button>
                      </article>
                    ))
                  )}
                </div>
              </section>
            </div>
          )}
          {view.name === "meetings" && (
            <MeetingsPage
              personal={data.personal_meeting}
              upcoming={upcoming}
              recent={recent}
              onStart={startExisting}
              onCopyInvite={(meeting) => void copyInvite(meeting)}
              onSchedule={() => setDialog("schedule")}
              onSummarise={setSummaryMeeting}
              onBack={() => openView({ name: "home" })}
              onUpgrade={() => toast.show("Upgrades aren't part of this demo")}
              onNotice={toast.show}
            />
          )}
          {view.name === "summaries" && (
            <div className="page-pad sheet">
              <div className="section-head">
                <h2>Summaries</h2>
              </div>
              {recent.length === 0 ? (
                <p className="empty-inline">No meeting summaries yet</p>
              ) : (
                recent.map((meeting) => (
                  <article key={meeting.code} className="meeting-row">
                    <div className="meeting-time">{clockRange(meeting)}</div>
                    <div className="meeting-main">
                      <div className="meeting-title">{meeting.title}</div>
                      <div className="meeting-sub">Meeting ID: {meeting.display_code}</div>
                    </div>
                    <button className="btn-primary" onClick={() => setSummaryMeeting(meeting)}>
                      Summarise
                    </button>
                  </article>
                ))
              )}
            </div>
          )}
          {view.name === "chat" && (
            <ChatPage onUpgrade={() => toast.show("Upgrades aren't part of this demo")} onNotice={toast.show} />
          )}
          {view.name === "contacts" && (
            <ContactsPage
              onUpgrade={() => toast.show("Upgrades aren't part of this demo")}
              onNotice={toast.show}
              onMeet={() => void startInstant(prefs.videoOnJoin)}
            />
          )}
          {view.name === "placeholder" && (
            <div className="empty page-pad">
              <h2>{PLACES[view.id].title}</h2>
              <p>{PLACES[view.id].body}</p>
            </div>
          )}
        </div>
      </div>
      {dialog === "join" && (
        <JoinDialog
          prefs={prefs}
          onClose={() => setDialog(null)}
          onJoin={(pending) => {
            setDialog(null);
            go(pending);
          }}
        />
      )}
      {dialog === "schedule" && (
        <ScheduleDialog
          userName={data.user.name}
          onClose={() => setDialog(null)}
          onCreated={(meeting) => {
            setDialog(null);
            setInvite(meeting);
            void refresh();
            toast.show("Meeting scheduled");
          }}
        />
      )}
      {dialog === "settings" && (
        <SettingsDialog
          user={data.user}
          prefs={prefs}
          onClose={() => setDialog(null)}
          onSave={(next) => {
            setPrefs(next);
            setDialog(null);
            toast.show("Settings saved");
          }}
        />
      )}
      {invite && <InviteDialog meeting={invite} onClose={() => setInvite(null)} />}
      {summaryMeeting && (
        <div className="overlay" onMouseDown={() => setSummaryMeeting(null)}>
          <div className="dialog" data-pop onMouseDown={(event) => event.stopPropagation()}>
            <div className="dialog-h">
              <h2>Summary</h2>
            </div>
            <div className="dialog-b">
              <strong>{summaryMeeting.title}</strong>
              <p>{summaryText(summaryMeeting)}</p>
            </div>
            <div className="dialog-f">
              <button className="btn-primary" onClick={() => setSummaryMeeting(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {toast.node}
    </div>
  );
}
