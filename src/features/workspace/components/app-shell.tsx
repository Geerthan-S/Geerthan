"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BriefcaseBusiness,
  CalendarDays,
  CheckSquare2,
  CircleUserRound,
  Command,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  Menu,
  Play,
  Search,
  TimerReset,
  X,
} from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { useWorkspace } from "@/features/workspace/workspace-provider";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";

const navigation = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/today", label: "Today", icon: CalendarDays },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/tasks", label: "Tasks", icon: CheckSquare2 },
  { href: "/sessions", label: "Work sessions", icon: TimerReset },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/activity", label: "Activity", icon: Activity },
];

function Brand() {
  return (
    <Link href="/" className="brand-lockup" aria-label="Personal OS home">
      <span className="brand-mark">
        <BriefcaseBusiness size={18} strokeWidth={1.8} />
      </span>
      <span>
        <strong>Personal OS</strong>
        <small>Work command</small>
      </span>
    </Link>
  );
}

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="primary-nav" aria-label="Primary navigation">
      <p className="nav-label">Workspace</p>
      {navigation.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn("nav-item", active && "is-active")}
          >
            <Icon size={18} strokeWidth={active ? 2 : 1.7} />
            <span>{item.label}</span>
            {item.href === "/inbox" && <InboxCount />}
          </Link>
        );
      })}
    </nav>
  );
}

function InboxCount() {
  const { state } = useWorkspace();
  const count = state.inbox.filter((item) => !item.triaged).length;
  return count ? <span className="nav-count">{count}</span> : null;
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { state, mode } = useWorkspace();
  const running = state.sessions.find((session) => session.status === "running");
  const task = state.tasks.find((item) => item.id === running?.taskId);

  return (
    <div className="sidebar-inner">
      <Brand />
      <Navigation onNavigate={onNavigate} />
      <div className="sidebar-spacer" />
      {running && task ? (
        <Link href="/sessions" className="active-focus-card" onClick={onNavigate}>
          <span className="focus-pulse" />
          <div>
            <small>Focus running</small>
            <strong>{task.title}</strong>
          </div>
          <Play size={16} fill="currentColor" />
        </Link>
      ) : null}
      <div className="sidebar-profile">
        <span className="avatar">G</span>
        <div>
          <strong>{state.profile.name}</strong>
          <small>{mode === "supabase" ? "Live Supabase" : "Local preview"}</small>
        </div>
        <CircleUserRound size={18} />
      </div>
    </div>
  );
}

function CaptureDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { actions } = useWorkspace();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");

  if (!open) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    await actions.addCapture(title.trim(), note.trim());
    setTitle("");
    setNote("");
    onClose();
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <form
        className="capture-dialog glass-panel"
        onSubmit={handleSubmit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">Quick capture</span>
            <h2>Clear it from your head.</h2>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X size={18} />
          </Button>
        </div>
        <label className="field-label" htmlFor="capture-title">
          What needs your attention?
        </label>
        <input
          id="capture-title"
          className="glass-input capture-title-input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Task, idea, follow-up…"
          autoFocus
        />
        <label className="field-label" htmlFor="capture-note">
          Context <span>optional</span>
        </label>
        <textarea
          id="capture-note"
          className="glass-input"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="A sentence is enough."
          rows={3}
        />
        <div className="dialog-actions">
          <span>Saved to Inbox</span>
          <Button type="submit">Capture</Button>
        </div>
      </form>
    </div>
  );
}

function MobileNavigation() {
  const pathname = usePathname();
  const mobileItems = navigation.slice(0, 5);
  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
      {mobileItems.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href;
        return (
          <Link key={item.href} href={item.href} className={cn(active && "is-active")}>
            <Icon size={19} />
            <span>{item.label === "Work sessions" ? "Focus" : item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [captureOpen, setCaptureOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="app-shell">
      <aside className="desktop-sidebar glass-sidebar">
        <Sidebar />
      </aside>

      {mobileOpen ? (
        <div className="mobile-drawer-backdrop" onClick={() => setMobileOpen(false)}>
          <aside className="mobile-drawer glass-sidebar" onClick={(event) => event.stopPropagation()}>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="workspace-frame">
        <header className="topbar">
          <div className="topbar-left">
            <Button
              variant="ghost"
              size="icon"
              className="mobile-menu-button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={20} />
            </Button>
            <div className="mobile-brand"><Brand /></div>
          </div>
          <button className="command-trigger" onClick={() => setCaptureOpen(true)}>
            <Search size={17} />
            <span>Capture anything…</span>
            <kbd><Command size={12} /> K</kbd>
          </button>
          <div className="topbar-date">
            <span>{new Intl.DateTimeFormat("en", { weekday: "long" }).format(new Date())}</span>
            <strong>{new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date())}</strong>
          </div>
        </header>
        <main className="workspace-content">{children}</main>
      </div>

      <MobileNavigation />
      <button className="mobile-capture" onClick={() => setCaptureOpen(true)} aria-label="Quick capture">
        <Inbox size={20} />
      </button>
      <CaptureDialog open={captureOpen} onClose={() => setCaptureOpen(false)} />
    </div>
  );
}
