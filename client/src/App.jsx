import { useEffect, useState } from 'react';
import { CalendarClock, Database, RefreshCw, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { plannerApi } from './api/plannerApi.js';
import { DailyCheckIn } from './components/DailyCheckIn.jsx';
import { FeedbackPanel } from './components/FeedbackPanel.jsx';
import { Layout } from './components/Layout.jsx';
import { ScheduleView } from './components/ScheduleView.jsx';
import { TaskForm } from './components/TaskForm.jsx';
import { TaskList } from './components/TaskList.jsx';

const userId = 'user_demo';
const registrationKey = 'smartPlannerRegisteredUser';
const defaultLocalUser = {
  first_name: 'Sara',
  last_name: 'Alhamede',
  email: 'sara@smart-planner.local',
  profile_image: ''
};

export function App() {
  const [localUser, setLocalUser] = useState(() => readRegisteredUser());
  const [profileMode, setProfileMode] = useState(null);
  const [currentPage, setCurrentPage] = useState('planner');
  const [bootstrap, setBootstrap] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [schedule, setSchedule] = useState(null);
  const [scheduleItems, setScheduleItems] = useState([]);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const isRegistered = Boolean(localUser);
  const profileUser = buildProfileUser(localUser, bootstrap?.user);

  useEffect(() => {
    if (isRegistered) {
      loadBootstrap();
    } else {
      setIsLoading(false);
    }
  }, [isRegistered]);

  async function loadBootstrap() {
    setIsLoading(true);
    try {
      const data = await plannerApi.bootstrap(userId);
      setBootstrap(data);
      setTasks(data.tasks || []);
      setSchedule(data.latest_schedule || null);
      setScheduleItems(data.latest_schedule_items || []);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function refreshTasks() {
    const data = await plannerApi.getTasks(userId);
    setTasks(data.tasks || []);
  }

  async function handleDailyLogSubmit(payload) {
    const result = await plannerApi.createDailyLog({ ...payload, user_id: userId });
    setBootstrap((current) => ({ ...(current || {}), latest_daily_log: result.daily_log }));
    setMessage(`Check-in saved. Detected emotion: ${result.daily_log.detected_emotion}.`);
  }

  async function handleTaskSubmit(payload) {
    await plannerApi.createTask({ ...payload, user_id: userId });
    await refreshTasks();
    setMessage(payload.is_fixed_time ? 'Fixed task added.' : 'Flexible task added.');
  }

  async function handleGenerateSchedule() {
    const result = await plannerApi.generateSchedule(userId);
    setSchedule(result.schedule);
    setScheduleItems(result.items || []);
    await refreshTasks();
    setMessage('Schedule generated.');
  }

  async function handleFeedbackSubmit(payload) {
    const result = await plannerApi.submitFeedback({ ...payload, user_id: userId });
    if (result.updated_schedule) {
      setSchedule(result.updated_schedule);
      setScheduleItems(result.updated_items || []);
      setMessage('Feedback saved and schedule refreshed.');
    } else {
      setMessage('Feedback saved.');
    }
    await refreshTasks();
  }

  function handleRegister(payload) {
    const registeredUser = {
      first_name: payload.first_name.trim(),
      last_name: payload.last_name.trim(),
      email: payload.email.trim(),
      profile_image: payload.profile_image || localUser?.profile_image || ''
    };
    localStorage.setItem(registrationKey, JSON.stringify(registeredUser));
    setLocalUser(registeredUser);
    setProfileMode(null);
  }

  function handleUseExistingAccount() {
    localStorage.setItem(registrationKey, JSON.stringify(defaultLocalUser));
    setLocalUser(defaultLocalUser);
  }

  function handleLogout() {
    localStorage.removeItem(registrationKey);
    setLocalUser(null);
    setProfileMode(null);
    setCurrentPage('planner');
    setBootstrap(null);
    setTasks([]);
    setSchedule(null);
    setScheduleItems([]);
    setMessage('');
  }

  if (!isRegistered) {
    return <RegistrationScreen onRegister={handleRegister} onExistingAccount={handleUseExistingAccount} />;
  }

  return (
    <Layout
      user={profileUser}
      monthWeek={getMonthWeek()}
      message={message}
      onEditProfile={() => setProfileMode('edit')}
      onViewProfile={() => setProfileMode('view')}
      onLogout={handleLogout}
      onOpenAbout={() => setCurrentPage('about')}
      onOpenPlanner={() => setCurrentPage('planner')}>
      <main className="workspace">
        {profileMode ? (
          <ProfilePanel
            mode={profileMode}
            user={profileUser}
            onClose={() => setProfileMode(null)}
            onSave={handleRegister}
          />
        ) : null}

        {currentPage === 'about' ? (
          <AboutPage onBack={() => setCurrentPage('planner')} />
        ) : (
          <>
        <section className="toolbar-strip">
          <div>
            <p className="eyebrow">{getMonthWeek().monthName}</p>
            <h1>Smart Planner</h1>
            <span className="toolbar-copy">
              Core scheduling algorithm first. AI helps improve analysis, but the algorithm makes the plan.
            </span>
          </div>
          <button className="primary-action" type="button" onClick={handleGenerateSchedule}>
            <CalendarClock size={18} />
            Generate Schedule
          </button>
        </section>

        {isLoading ? (
          <div className="empty-state">Loading workspace...</div>
        ) : (
          <>
            <section className="insight-strip" aria-label="Planner workflow highlights">
              <article>
                <SlidersHorizontal size={26} />
                <div>
                  <strong>Core algorithm</strong>
                  <span>Rules score tasks by time, deadline, priority, energy, and difficulty.</span>
                </div>
              </article>
              <article>
                <ShieldCheck size={26} />
                <div>
                  <strong>Fixed time protected</strong>
                  <span>Static events block time before flexible tasks are placed.</span>
                </div>
              </article>
              <article>
                <Database size={26} />
                <div>
                  <strong>Database memory</strong>
                  <span>Check-ins, tasks, schedules, and feedback become user history.</span>
                </div>
              </article>
              <article>
                <RefreshCw size={26} />
                <div>
                  <strong>Dynamic feedback loop</strong>
                  <span>User feedback refreshes the next schedule automatically.</span>
                </div>
              </article>
            </section>

            <div className="work-grid">
              <div className="left-column">
                <DailyCheckIn onSubmit={handleDailyLogSubmit} latestLog={bootstrap?.latest_daily_log} />
                <TaskForm onSubmit={handleTaskSubmit} />
              </div>
              <div className="right-column">
                <TaskList tasks={tasks} />
                <ScheduleView
                  schedule={schedule}
                  items={scheduleItems}
                  renderFeedback={(item) => (
                    <FeedbackPanel item={item} onSubmit={handleFeedbackSubmit} />
                  )}
                />
              </div>
            </div>
          </>
        )}
        </>
        )}
      </main>
    </Layout>
  );
}

function RegistrationScreen({ onRegister, onExistingAccount }) {
  const [form, setForm] = useState(defaultLocalUser);

  function submit(event) {
    event.preventDefault();
    onRegister(form);
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-visual" aria-hidden="true">
          <div className="orbit one"></div>
          <div className="orbit two"></div>
          <div className="planner-phone">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
        <div className="auth-content">
          <p className="eyebrow">Welcome</p>
          <h1>Create your Smart Planner account</h1>
          <p>
            Register first to open the main planner interface. Existing users can continue directly to their workspace.
          </p>
          <form className="form-stack" onSubmit={submit}>
            <div className="field-grid two">
              <label>
                First name
                <input
                  value={form.first_name}
                  onChange={(event) => setForm({ ...form, first_name: event.target.value })}
                  required
                />
              </label>
              <label>
                Last name
                <input
                  value={form.last_name}
                  onChange={(event) => setForm({ ...form, last_name: event.target.value })}
                  required
                />
              </label>
            </div>
            <label>
              Email
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                required
              />
            </label>
            <ProfileImageField
              value={form.profile_image}
              onChange={(profileImage) => setForm({ ...form, profile_image: profileImage })}
            />
            <button className="primary-action" type="submit">Register and open planner</button>
            <button className="text-action" type="button" onClick={onExistingAccount}>
              I already have an account
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

function ProfilePanel({ mode, user, onClose, onSave }) {
  const [form, setForm] = useState({
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
    profile_image: user.profile_image || ''
  });
  const isEdit = mode === 'edit';

  function submit(event) {
    event.preventDefault();
    onSave(form);
  }

  return (
    <section className="profile-panel">
      <div className="profile-panel-card">
        <div className="panel-head">
          <div>
            <p className="eyebrow">User Profile</p>
            <h2>{isEdit ? 'Edit information' : 'Profile information'}</h2>
          </div>
          <button className="text-action compact" type="button" onClick={onClose}>Close</button>
        </div>
        <form className="form-stack" onSubmit={submit}>
          <div className="field-grid two">
            <label>
              First name
              <input
                value={form.first_name}
                disabled={!isEdit}
                onChange={(event) => setForm({ ...form, first_name: event.target.value })}
              />
            </label>
            <label>
              Last name
              <input
                value={form.last_name}
                disabled={!isEdit}
                onChange={(event) => setForm({ ...form, last_name: event.target.value })}
              />
            </label>
          </div>
          <label>
            Email
            <input
              type="email"
              value={form.email}
              disabled={!isEdit}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
          </label>
          {isEdit ? (
            <ProfileImageField
              value={form.profile_image}
              onChange={(profileImage) => setForm({ ...form, profile_image: profileImage })}
            />
          ) : (
            <div className="profile-picture-preview">
              <span className="avatar-bubble large">
                {form.profile_image ? <img src={form.profile_image} alt="" /> : `${form.first_name?.[0] || 'S'}${form.last_name?.[0] || 'A'}`}
              </span>
              <strong>Profile picture</strong>
            </div>
          )}
          {isEdit ? <button className="primary-action" type="submit">Save profile</button> : null}
        </form>
      </div>
    </section>
  );
}

function readRegisteredUser() {
  try {
    const saved = localStorage.getItem(registrationKey);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function buildProfileUser(localUser, serverUser) {
  const fullName = localUser
    ? `${localUser.first_name} ${localUser.last_name}`
    : serverUser?.full_name || defaultLocalUser.first_name + ' ' + defaultLocalUser.last_name;

  return {
    ...serverUser,
    first_name: localUser?.first_name || fullName.split(' ')[0],
    last_name: localUser?.last_name || fullName.split(' ').slice(1).join(' '),
    full_name: fullName,
    email: localUser?.email || serverUser?.email || defaultLocalUser.email,
    profile_image: localUser?.profile_image || ''
  };
}

function getMonthWeek(date = new Date()) {
  const monthName = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(date);
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
  const weekNumber = Math.ceil((date.getDate() + firstDay.getDay()) / 7);
  const weeksInMonth = Math.ceil((new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate() + firstDay.getDay()) / 7);

  return {
    monthName,
    weekNumber,
    weeksInMonth,
    label: `Week ${weekNumber}`
  };
}

function ProfileImageField({ value, onChange }) {
  function handleImageChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => onChange(reader.result);
    reader.readAsDataURL(file);
  }

  return (
    <label>
      Profile picture
      <div className="picture-upload">
        <span className="avatar-bubble large">
          {value ? <img src={value} alt="" /> : 'IMG'}
        </span>
        <input type="file" accept="image/*" onChange={handleImageChange} />
      </div>
    </label>
  );
}

function AboutPage({ onBack }) {
  return (
    <section className="about-page">
      <div className="about-page-hero">
        <div className="about-us-large" aria-hidden="true">
          <svg viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeWidth="8" />
            <circle cx="60" cy="39" r="16" fill="currentColor" />
            <path d="M31 80 C35 61 47 54 60 54 C73 54 85 61 89 80Z" fill="currentColor" />
            <path d="M35 99 H85" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
          </svg>
          <strong>ABOUT US</strong>
        </div>
        <div>
          <p className="eyebrow">About The Project</p>
          <h1>Smart Day Planner</h1>
          <p>
            A dynamic daily planning system based on a core scheduling algorithm. The algorithm creates the plan from
            user input, fixed-time constraints, free time windows, priorities, deadlines, energy, and feedback. The AI
            layer is only a helper layer that improves analysis and personalization.
          </p>
          <div className="about-names large">
            <span>Sara Alhamede</span>
            <span>Amina Alfrahen</span>
          </div>
          <button className="primary-action" type="button" onClick={onBack}>
            Back to planner
          </button>
        </div>
      </div>
    </section>
  );
}
