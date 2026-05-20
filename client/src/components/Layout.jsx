import { Bot, CalendarDays, Edit3, Eye, LogOut, Menu, Settings, Sparkles } from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { label: 'Calendar', detail: 'Weekly dashboard', icon: CalendarDays },
  { label: 'AI Notes', detail: 'Smart insights', icon: Bot },
  { label: 'Progress', detail: 'Feedback loop', icon: Sparkles },
  { label: 'Settings', detail: 'Preferences', icon: Settings }
];

export function Layout({
  user,
  message,
  monthWeek,
  onEditProfile,
  onViewProfile,
  onLogout,
  onOpenAbout,
  onOpenPlanner,
  children
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const displayName = user?.full_name || 'Sara Alhamede';
  const [firstName, ...lastNameParts] = displayName.split(' ');
  const lastName = lastNameParts.join(' ');
  const initials = `${firstName?.[0] || 'S'}${lastName?.[0] || 'A'}`.toUpperCase();
  const profileImage = user?.profile_image;
  const currentYear = new Date().getFullYear();

  return (
    <div className={`app-shell ${isMenuOpen ? 'menu-open' : ''}`}>
      <header className="topbar">
        <button
          className="icon-button"
          type="button"
          onClick={() => setIsMenuOpen((value) => !value)}
          aria-label="Open menu"
          aria-expanded={isMenuOpen}>
          <Menu size={26} />
        </button>
        <div className="project-title">
          <strong>Smart Day Planner</strong>
          <small>Dynamic planning system</small>
        </div>
        <div className="brand-block">
          <strong>{monthWeek?.label || 'Current Week'}</strong>
        </div>
        <nav className="top-actions" aria-label="Header actions">
          <button className="about-button" type="button" onClick={onOpenAbout}>
            <AboutUsIcon />
            About
          </button>
          <div className="profile-menu">
            <button className="user-chip" type="button" onClick={() => setIsProfileOpen((value) => !value)}>
              <Avatar initials={initials} profileImage={profileImage} />
              <span className="name-stack">
                <strong>{firstName || 'Sara'}</strong>
                <small>{lastName || 'Alhamede'}</small>
              </span>
            </button>
            {isProfileOpen ? (
              <div className="profile-popover">
                <div className="profile-card-head">
                  <Avatar initials={initials} profileImage={profileImage} large />
                  <div>
                    <strong>{displayName}</strong>
                    <small>{user?.email || 'sara@smart-planner.local'}</small>
                  </div>
                </div>
                <button type="button" onClick={onViewProfile}>
                  <Eye size={16} />
                  View information
                </button>
                <button type="button" onClick={onEditProfile}>
                  <Edit3 size={16} />
                  Edit information
                </button>
                <button className="logout-action" type="button" onClick={onLogout}>
                  <LogOut size={16} />
                  Logout
                </button>
              </div>
            ) : null}
          </div>
        </nav>
      </header>

      <aside className={`sidebar ${isMenuOpen ? 'open' : ''}`}>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              className="sidebar-item"
              type="button"
              key={item.label}
              onClick={() => {
                if (item.label === 'Calendar') {
                  onOpenPlanner?.();
                }
                setIsMenuOpen(false);
              }}>
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
        <footer className="app-footer">
          <strong>Copyright {currentYear} Smart Day Planner. All rights reserved.</strong>
          <span>Sara Alhamede & Amina Alfrahen</span>
          <span>Computer Science Department, Sapir Academic College</span>
        </footer>
      </div>
    </div>
  );
}

function Avatar({ initials, profileImage, large = false }) {
  return (
    <span className={`avatar-bubble ${large ? 'large' : ''}`} aria-hidden="true">
      {profileImage ? <img src={profileImage} alt="" /> : initials}
    </span>
  );
}

function AboutUsIcon() {
  return (
    <svg className="about-us-icon" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="5" />
      <circle cx="32" cy="21" r="8" fill="currentColor" />
      <path d="M18 43 C20 33 26 29 32 29 C38 29 44 33 46 43Z" fill="currentColor" />
      <path d="M20 51 H44" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}
