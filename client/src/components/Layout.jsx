import { Bot, CalendarDays, Menu, Settings, Sparkles, UserCircle } from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { label: 'Calendar', detail: 'Daily plan', icon: CalendarDays },
  { label: 'AI Notes', detail: 'Smart insights', icon: Bot },
  { label: 'Progress', detail: 'Feedback loop', icon: Sparkles },
  { label: 'Settings', detail: 'Preferences', icon: Settings }
];

export function Layout({ user, message, children }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="icon-button" type="button" onClick={() => setIsMenuOpen((value) => !value)} aria-label="Open menu">
          <Menu size={26} />
        </button>
        <div className="brand-block">
          <span>Smart Day Planner</span>
          <strong>Week 18</strong>
        </div>
        <div className="user-chip">
          <UserCircle size={24} />
          <span>{user?.full_name || 'Sara Alhamede'}</span>
        </div>
      </header>

      <aside className={`sidebar ${isMenuOpen ? 'open' : ''}`}>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button className="sidebar-item" type="button" key={item.label}>
              <Icon size={22} />
              <span>
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
              </span>
            </button>
          );
        })}
      </aside>

      <div className="content-frame">
        {message ? <div className="status-banner">{message}</div> : null}
        {children}
      </div>
    </div>
  );
}
