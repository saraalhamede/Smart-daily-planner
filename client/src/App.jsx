import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Database,
  BrainCircuit,
  Gauge,
  Flame,
  ListChecks,
  Lock,
  Palette,
  Pencil,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingUp,
  Trash2,
  Bell,
  UserRound,
  BarChart3,
  Activity,
  AlertTriangle
} from 'lucide-react';
import { plannerApi } from './api/plannerApi.js';
import { DailyCheckIn } from './components/DailyCheckIn.jsx';
import { FeedbackPanel } from './components/FeedbackPanel.jsx';
import { Layout } from './components/Layout.jsx';
import { ScheduleView } from './components/ScheduleView.jsx';
import { TaskForm } from './components/TaskForm.jsx';
import { TaskList } from './components/TaskList.jsx';

const demoUserId = 'user_demo';
const registrationKey = 'smartPlannerRegisteredUser';
const notificationReadKey = 'smartPlannerReadNotifications';
const notificationRemovedKey = 'smartPlannerRemovedNotifications';
const notificationFilters = ['All', 'Unread', 'Tasks', 'System', 'Overdue'];
const defaultLocalUser = {
  user_id: demoUserId,
  first_name: 'Sara',
  last_name: 'Alhamede',
  full_name: 'Sara Alhamede',
  email: 'sara@smart-planner.local',
  profile_image: ''
};
const defaultSettings = {
  profile: {
    display_name: 'Sara Alhamede',
    email: 'sara@smart-planner.local',
    password: '',
    bio: '',
    mode: 'Student'
  },
  schedule: {
    wake_up_time: '07:00',
    sleep_time: '22:30',
    work_start: '09:00',
    work_end: '18:00',
    break_duration: 15,
    focus_length: 60,
    planning_start: '07:00',
    planning_end: '22:30'
  },
  notifications: {
    task_reminders: true,
    deadline_reminders: true,
    daily_checkin: true,
    break_reminders: true,
    schedule_generation: false,
    weekly_summary: true,
    sound: true,
    silent_start: '22:00',
    silent_end: '07:00'
  },
  ai: {
    recommendations: true,
    notes_frequency: 'Weekly',
    adaptive_scheduling: true,
    daily_summary: true,
    feedback_adaptation: true,
    personality: 'Friendly'
  },
  appearance: {
    mode: 'Light',
    theme: 'Blue / Teal',
    density: 'Comfortable',
    font_size: 'Medium',
    layout: 'Dashboard'
  },
  privacy: {
    privacy_mode: false,
    ai_data_usage: true,
    resource_management: true
  },
  system: {
    language: 'English',
    time_format: '24h',
    first_day: 'Sunday',
    timezone: 'Asia/Jerusalem'
  }
};

export function App() {
  const [localUser, setLocalUser] = useState(() => readRegisteredUser());
  const [profileMode, setProfileMode] = useState(null);
  const [currentPage, setCurrentPage] = useState('weekly');
  const [detailsBackPage, setDetailsBackPage] = useState('weekly');
  const [plannerSettings, setPlannerSettings] = useState(() => readPlannerSettings());
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedDayTasks, setSelectedDayTasks] = useState({});
  const [bootstrap, setBootstrap] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [schedule, setSchedule] = useState(null);
  const [scheduleItems, setScheduleItems] = useState([]);
  const [message, setMessage] = useState('');
  const [readNotificationIds, setReadNotificationIds] = useState(() => readStoredList(notificationReadKey));
  const [removedNotificationIds, setRemovedNotificationIds] = useState(() => readStoredList(notificationRemovedKey));
  const [isLoading, setIsLoading] = useState(true);
  const isRegistered = Boolean(localUser);
  const activeUserId = localUser?.user_id || demoUserId;
  const profileUser = buildProfileUser(localUser, bootstrap?.user);
  const notifications = buildNotifications({
    tasks,
    schedule,
    scheduleItems,
    latestLog: bootstrap?.latest_daily_log,
    dailyLogs: bootstrap?.daily_logs || [],
    readIds: readNotificationIds,
    removedIds: removedNotificationIds
  });
  const unreadNotificationCount = notifications.filter((notification) => notification.status === 'unread').length;

  useEffect(() => {
    if (isRegistered) {
      loadBootstrap();
    } else {
      setIsLoading(false);
    }
  }, [isRegistered, activeUserId]);

  useEffect(() => {
    if (!isRegistered || currentPage !== 'weekly') return undefined;
    let isCancelled = false;
    setIsLoading(true);
    plannerApi.getWeeklyDashboard(activeUserId, toDateKey(new Date()))
      .then((data) => {
        if (!isCancelled) {
          applyPlannerData(data);
        }
      })
      .catch((error) => {
        if (!isCancelled) {
          console.error('[App] Failed to load weekly dashboard', error);
          setMessage(error.message);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [isRegistered, activeUserId, currentPage]);

  useEffect(() => {
    if (!isRegistered || currentPage !== 'settings') return undefined;
    let isCancelled = false;
    plannerApi.getSettings(activeUserId)
      .then((data) => {
        if (!isCancelled) {
          applyPlannerData(data);
        }
      })
      .catch((error) => {
        if (!isCancelled) {
          console.error('[App] Failed to load settings', error);
          setMessage(error.message);
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [isRegistered, activeUserId, currentPage]);

  function applyPlannerData(data = {}) {
    const dailyLogs = data.daily_logs || data.daily_checkins;
    const nextScheduleItems = data.schedule_items || data.items;

    setBootstrap((current) => {
      const next = { ...(current || {}) };
      if (data.user) next.user = data.user;
      if (data.preferences) next.preferences = data.preferences;
      if (data.tasks) next.tasks = data.tasks;
      if (dailyLogs) {
        next.daily_logs = dailyLogs;
        next.daily_checkins = dailyLogs;
        next.latest_daily_log = getLatestByDate(dailyLogs, 'log_date') || next.latest_daily_log || null;
        next.latest_daily_checkin = next.latest_daily_log;
      }
      if (data.schedules) next.schedules = data.schedules;
      if (data.latest_schedule) next.latest_schedule = data.latest_schedule;
      if (Object.prototype.hasOwnProperty.call(data, 'schedule')) {
        next.latest_schedule = data.schedule || next.latest_schedule || null;
      }
      if (nextScheduleItems) {
        next.schedule_items = nextScheduleItems;
        next.latest_schedule_items = nextScheduleItems;
      }
      if (data.ai_notes) next.ai_notes = data.ai_notes;
      if (data.daily_evaluations) next.daily_evaluations = data.daily_evaluations;
      if (data.task_feedback) next.task_feedback = data.task_feedback;
      return next;
    });

    if (data.tasks) setTasks(data.tasks);
    if (nextScheduleItems) setScheduleItems(nextScheduleItems);
    if (data.latest_schedule) setSchedule(data.latest_schedule);
    if (Object.prototype.hasOwnProperty.call(data, 'schedule')) setSchedule(data.schedule || null);
    if (data.preferences) {
      setPlannerSettings((current) => preferencesToSettings(data.preferences, current, data.user || profileUser));
    }
  }

  function handlePageDataLoaded(data) {
    applyPlannerData(data);
  }

  function handlePageLoadError(error) {
    console.error('[App] Failed to load page data', error);
    setMessage(error.message);
  }

  function handleSelectedDayDataLoaded(dayKey, data = {}) {
    const dayTasks = data.tasks || [];
    const dailyLog = data.daily_checkin || data.daily_log || null;
    const dayItems = data.schedule_items || data.items || [];

    if (dayTasks.length > 0) {
      setSelectedDayTasks((current) => ({ ...current, [dayKey]: dayTasks }));
      setTasks((currentTasks) => dayTasks.reduce(
        (items, task) => upsertById(items, task, 'task_id'),
        currentTasks
      ));
    }

    setBootstrap((current) => {
      const next = { ...(current || {}) };
      if (dailyLog) {
        const nextLogs = upsertById(next.daily_logs || [], dailyLog, 'log_id');
        next.daily_logs = nextLogs;
        next.daily_checkins = nextLogs;
        next.latest_daily_log = getLatestByDate(nextLogs, 'log_date') || dailyLog;
        next.latest_daily_checkin = next.latest_daily_log;
      }
      if (data.ai_notes) next.ai_notes = mergeById(next.ai_notes || [], data.ai_notes, 'note_id');
      if (data.daily_evaluation) next.daily_evaluations = upsertById(next.daily_evaluations || [], data.daily_evaluation, 'evaluation_id');
      return next;
    });

    if (Object.prototype.hasOwnProperty.call(data, 'schedule')) {
      setSchedule(data.schedule || null);
    }
    if (dayItems.length > 0) {
      setScheduleItems((currentItems) => mergeById(currentItems, dayItems, 'schedule_item_id'));
    }
  }

  async function loadBootstrap() {
    setIsLoading(true);
    try {
      const data = await plannerApi.bootstrap(activeUserId);
      applyPlannerData(data);
    } catch (error) {
      console.error('[App] Failed to load planner data', error);
      setMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function refreshTasks() {
    const data = await plannerApi.getTasks(activeUserId);
    setTasks(data.tasks || []);
  }

  async function handleDailyLogSubmit(payload) {
    const result = await plannerApi.createDailyLog({ ...payload, user_id: activeUserId });
    setBootstrap((current) => {
      const nextLogs = upsertById(current?.daily_logs || [], result.daily_log, 'log_id');
      return {
        ...(current || {}),
        daily_logs: nextLogs,
        daily_checkins: nextLogs,
        latest_daily_log: result.daily_log,
        latest_daily_checkin: result.daily_log
      };
    });
    setMessage(`Check-in saved. Detected emotion: ${result.daily_log.detected_emotion}.`);
    return result;
  }

  async function handleTaskSubmit(payload) {
    const result = await plannerApi.createTask({ ...payload, user_id: activeUserId });
    await refreshTasks();
    setMessage(payload.is_fixed_time ? 'Fixed task added.' : 'Flexible task added.');
    return result;
  }

  async function handleSelectedDayTaskSave(dayKey, payload, existingTask) {
    const normalized = normalizeSelectedDayTask(payload, dayKey);
    const result = existingTask?.task_id
      ? await plannerApi.updateTask(existingTask.task_id, { ...normalized, user_id: activeUserId })
      : await plannerApi.createTask({ ...normalized, user_id: activeUserId });
    await refreshTasks();
    const savedTask = result.task;
    setSelectedDayTasks((current) => ({
      ...current,
      [dayKey]: upsertById(current[dayKey] || [], savedTask, 'task_id')
    }));
    setMessage(existingTask?.task_id ? 'Task updated in database.' : 'Task saved to database.');
    return savedTask;
  }

  async function handleSelectedDayTaskDelete(dayKey, task) {
    if (task?.task_id) {
      await plannerApi.removeTask(task.task_id);
      await refreshTasks();
    }
    setSelectedDayTasks((current) => ({
      ...current,
      [dayKey]: (current[dayKey] || []).filter((item) => getPreviewTaskId(item) !== getPreviewTaskId(task))
    }));
    setMessage('Task removed from the selected day.');
  }

  async function handleGenerateSchedule() {
    const result = await plannerApi.generateSchedule({ user_id: activeUserId });
    setSchedule(result.schedule);
    setScheduleItems(result.items || []);
    await loadBootstrap();
    setMessage('Schedule generated.');
    return result;
  }

  async function handleGenerateSelectedDay(day, checkInDraft, addedTasks) {
    const dailyLogResult = await handleDailyLogSubmit({
      ...getDefaultCheckInDraft(),
      ...(checkInDraft || {}),
      log_date: day.key
    });

    const result = await plannerApi.generateSchedule({
      user_id: activeUserId,
      daily_log_id: dailyLogResult.daily_log.log_id,
      schedule_date: day.key
    });
    setSchedule(result.schedule);
    await loadBootstrap();
    setMessage('Daily schedule generated for the selected day.');
    setSelectedDayTasks((current) => ({ ...current, [day.key]: [] }));
    setCurrentPage('generated');
    return result;
  }

  async function handleFeedbackSubmit(payload) {
    const result = await plannerApi.submitFeedback({ ...payload, user_id: activeUserId });
    if (result.updated_schedule) {
      setSchedule(result.updated_schedule);
      setScheduleItems(result.updated_items || []);
      setMessage('Feedback saved and schedule refreshed.');
    } else {
      setMessage('Feedback saved.');
    }
    await loadBootstrap();
  }

  async function handleRegister(payload) {
    if (!localUser && payload.password) {
      const result = await plannerApi.register({
        ...payload,
        full_name: `${payload.first_name || ''} ${payload.last_name || ''}`.trim()
      });
      const registeredUser = normalizeAuthUser(result.user);
      localStorage.setItem(registrationKey, JSON.stringify(registeredUser));
      setLocalUser(registeredUser);
      setBootstrap((current) => ({ ...(current || {}), user: result.user, preferences: result.preferences }));
      setPlannerSettings(preferencesToSettings(result.preferences, plannerSettings, result.user));
      setProfileMode(null);
      return;
    }

    const registeredUser = {
      user_id: localUser?.user_id || demoUserId,
      first_name: payload.first_name.trim(),
      last_name: payload.last_name.trim(),
      full_name: `${payload.first_name.trim()} ${payload.last_name.trim()}`.trim(),
      email: payload.email.trim(),
      profile_image: payload.profile_image || localUser?.profile_image || ''
    };
    const result = await plannerApi.updateUser(activeUserId, {
      ...registeredUser,
      password: payload.password || ''
    });
    const savedUser = normalizeAuthUser(result.user);
    localStorage.setItem(registrationKey, JSON.stringify(savedUser));
    setLocalUser(savedUser);
    setBootstrap((current) => ({ ...(current || {}), user: result.user }));
    setProfileMode(null);
  }

  async function handleUseExistingAccount(payload = {}) {
    const result = await plannerApi.login({
      email: payload.email || defaultLocalUser.email,
      password: payload.password || 'demo123'
    });
    const nextUser = normalizeAuthUser(result.user);
    localStorage.setItem(registrationKey, JSON.stringify(nextUser));
    setLocalUser(nextUser);
    setBootstrap((current) => ({ ...(current || {}), user: result.user, preferences: result.preferences }));
    setPlannerSettings(preferencesToSettings(result.preferences, plannerSettings, result.user));
  }

  function handleLogout() {
    localStorage.removeItem(registrationKey);
    setLocalUser(null);
    setProfileMode(null);
    setCurrentPage('weekly');
    setDetailsBackPage('weekly');
    setSelectedDay(null);
    setSelectedDayTasks({});
    setBootstrap(null);
    setTasks([]);
    setSchedule(null);
    setScheduleItems([]);
    setMessage('');
  }

  function handleMarkNotificationRead(notificationId) {
    updateStoredList(notificationReadKey, setReadNotificationIds, (current) => (
      current.includes(notificationId) ? current : [...current, notificationId]
    ));
  }

  function handleRemoveNotification(notificationId) {
    updateStoredList(notificationRemovedKey, setRemovedNotificationIds, (current) => (
      current.includes(notificationId) ? current : [...current, notificationId]
    ));
  }

  function handleNotificationAction(notification) {
    handleMarkNotificationRead(notification.id);

    if (notification.action?.type === 'page') {
      setCurrentPage(notification.action.page);
      return;
    }

    if (notification.action?.type === 'day') {
      const dayKey = notification.action.dayKey || toDateKey(new Date());
      setSelectedDay(buildNotificationDay(dayKey));
      setDetailsBackPage('notifications');
      setCurrentPage(
        isPastDayKey(dayKey) || hasGeneratedPlanForDay(dayKey, schedule, scheduleItems, tasks)
          ? 'generated'
          : 'day'
      );
    }
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
      onOpenCalendar={() => setCurrentPage('calendar')}
      onOpenAiNotes={() => setCurrentPage('ai-notes')}
      onOpenNotifications={() => setCurrentPage('notifications')}
      onOpenSettings={() => setCurrentPage('settings')}
      onOpenProgress={() => setCurrentPage('progress')}
      notificationUnreadCount={unreadNotificationCount}
      onOpenPlanner={() => setCurrentPage('weekly')}>
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
          <AboutPage onBack={() => setCurrentPage('weekly')} />
        ) : currentPage === 'calendar' ? (
          <CalendarPage
            userId={activeUserId}
            tasks={tasks}
            scheduleItems={scheduleItems}
            dailyLogs={bootstrap?.daily_logs || []}
            dailyEvaluations={bootstrap?.daily_evaluations || []}
            isLoading={isLoading}
            onDataLoaded={handlePageDataLoaded}
            onError={handlePageLoadError}
            onSelectDay={(day) => {
              setSelectedDay(day);
              setDetailsBackPage('calendar');
              setCurrentPage('generated');
            }}
          />
        ) : currentPage === 'ai-notes' ? (
          <AiNotesPage
            userId={activeUserId}
            tasks={tasks}
            scheduleItems={scheduleItems}
            dailyLogs={bootstrap?.daily_logs || []}
            aiNotes={bootstrap?.ai_notes || []}
            latestLog={bootstrap?.latest_daily_log}
            isLoading={isLoading}
            onDataLoaded={handlePageDataLoaded}
            onError={handlePageLoadError}
          />
        ) : currentPage === 'notifications' ? (
          <NotificationsPage
            notifications={notifications}
            isLoading={isLoading}
            onMarkRead={handleMarkNotificationRead}
            onRemove={handleRemoveNotification}
            onAction={handleNotificationAction}
          />
        ) : currentPage === 'settings' ? (
          <SettingsPage
            user={profileUser}
            settings={plannerSettings}
            onSave={async (nextSettings, nextProfile) => {
              const result = await plannerApi.saveSettings(activeUserId, { settings: nextSettings });
              setPlannerSettings(nextSettings);
              setBootstrap((current) => ({ ...(current || {}), preferences: result.preferences }));
              if (nextProfile) {
                await handleRegister(nextProfile);
              }
              const refreshed = await plannerApi.getSettings(activeUserId);
              applyPlannerData(refreshed);
              setMessage('Changes saved successfully.');
            }}
          />
        ) : currentPage === 'progress' ? (
          <ProgressPage
            userId={activeUserId}
            tasks={tasks}
            scheduleItems={scheduleItems}
            dailyLogs={bootstrap?.daily_logs || []}
            dailyEvaluations={bootstrap?.daily_evaluations || []}
            latestLog={bootstrap?.latest_daily_log}
            isLoading={isLoading}
            onDataLoaded={handlePageDataLoaded}
            onError={handlePageLoadError}
          />
        ) : currentPage === 'weekly' ? (
          <WeeklyDashboard
            tasks={tasks}
            scheduleItems={scheduleItems}
            latestLog={bootstrap?.latest_daily_log}
            dailyLogs={bootstrap?.daily_logs || []}
            dailyEvaluations={bootstrap?.daily_evaluations || []}
            isLoading={isLoading}
            onSelectDay={(day) => {
              setSelectedDay(day);
              setDetailsBackPage('weekly');
              setCurrentPage(
                isPastDayKey(day.key) || hasGeneratedPlanForDay(day.key, schedule, scheduleItems, tasks)
                  ? 'generated'
                  : 'day'
              );
            }}
          />
        ) : currentPage === 'day' ? (
          <SelectedDayInputPage
            userId={activeUserId}
            day={selectedDay}
            onBack={() => setCurrentPage('weekly')}
            onDailyLogSubmit={handleDailyLogSubmit}
            onGenerate={handleGenerateSelectedDay}
            latestLog={getDailyLogForDay(bootstrap?.daily_logs || [], selectedDay?.key) || bootstrap?.latest_daily_log}
            addedTasks={getSelectedDayInputTasks(tasks, selectedDay?.key, selectedDayTasks)}
            onSaveTask={handleSelectedDayTaskSave}
            onDeleteTask={handleSelectedDayTaskDelete}
            onDayDataLoaded={handleSelectedDayDataLoaded}
            onError={handlePageLoadError}
          />
        ) : currentPage === 'generated' ? (
          <DailyDetailsPage
            userId={activeUserId}
            day={selectedDay}
            schedule={schedule}
            items={scheduleItems}
            tasks={tasks}
            latestLog={bootstrap?.latest_daily_log}
            aiNotes={bootstrap?.ai_notes || []}
            onBack={() => setCurrentPage('day')}
            onWeekly={() => setCurrentPage(detailsBackPage)}
            overviewBackLabel={detailsBackPage === 'calendar' ? 'Back to calendar' : 'Back to weekly dashboard'}
            onTaskStatusChange={(taskId, updates) => {
              if (!taskId) return;
              setTasks((currentTasks) => currentTasks.map((task) => (
                task.task_id === taskId
                  ? { ...task, ...updates, updated_at: new Date().toISOString() }
                  : task
              )));
            }}
            onDataRefresh={loadBootstrap}
          />
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
          <div className="toolbar-actions">
            <button className="secondary-action" type="button" onClick={() => setCurrentPage('weekly')}>
              <ArrowLeft size={18} />
              Weekly Dashboard
            </button>
            <button className="primary-action" type="button" onClick={handleGenerateSchedule}>
              <CalendarClock size={18} />
              Generate Schedule
            </button>
          </div>
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
                  items={scheduleItems.filter((item) => !schedule?.schedule_id || item.schedule_id === schedule.schedule_id)}
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

function WeeklyDashboard({ tasks, scheduleItems, latestLog, dailyLogs = [], dailyEvaluations = [], isLoading, onSelectDay }) {
  const weekDays = getCurrentWeekDays();
  const weeklyData = buildWeeklyDashboardData({ tasks, scheduleItems, latestLog, dailyLogs, dailyEvaluations, weekDays });

  if (isLoading) {
    return <div className="empty-state">Loading weekly dashboard...</div>;
  }

  return (
    <section className="weekly-dashboard">
      <div className="weekly-hero">
        <div>
          <p className="eyebrow">{weeklyData.rangeLabel}</p>
          <h1>Current Week</h1>
          <span className="toolbar-copy">Your weekly task management dashboard at a glance.</span>
        </div>
      </div>

      {weeklyData.isNewUser ? (
        <div className="new-user-note">
          <strong>No results yet</strong>
          <span>Start adding tasks and daily check-ins to see your weekly progress.</span>
        </div>
      ) : null}

      <section className="day-circle-section" aria-label="Current week days">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">7 Day View</p>
            <h2>Current Week</h2>
          </div>
          {weeklyData.isNewUser ? <span className="soft-pill">No results yet</span> : null}
        </div>

        <div className="day-circle-grid">
          {weeklyData.days.map((day) => (
            <button
              className={`day-circle ${day.tone} ${day.isToday ? 'today' : ''} ${day.isFuture ? 'future' : ''}`}
              key={day.key}
              type="button"
              style={{
                '--progress': `${day.visualProgress}%`,
                '--day-color': day.color
              }}
              onClick={() => onSelectDay(day)}>
              <span className="day-progress-fill" aria-hidden="true"></span>
              <span className="day-circle-content">
                <strong>{day.dayName}</strong>
                <small>{day.shortDate}</small>
                <em>{day.label}</em>
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="weekly-content-grid">
        <section className="weekly-card unfinished-card">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">Task Follow Up</p>
              <h2>Unfinished Tasks This Week, you doing well</h2>
            </div>
            <ListChecks size={30} />
          </div>

          {weeklyData.isNewUser ? (
            <p className="no-results">No results yet</p>
          ) : weeklyData.unfinishedTasks.length === 0 ? (
            <p className="no-results">No unfinished tasks yet</p>
          ) : (
            <div className="unfinished-list">
              {weeklyData.unfinishedTasks.map((task) => (
                <article className="weekly-task-card" key={task.task_id}>
                  <div>
                    <strong>{task.title}</strong>
                    <span>{task.relatedDay}</span>
                  </div>
                  <div className="chip-line">
                    {task.deadline ? <span>Deadline {formatDeadline(task.deadline)}</span> : null}
                    <span>Priority {task.priority_level || 3}</span>
                    {task.difficulty_level ? <span>Difficulty {task.difficulty_level}</span> : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="weekly-card review-card">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">Weekly Review</p>
              <h2>Weekly Productivity Review</h2>
            </div>
            <Target size={30} />
          </div>

          {weeklyData.isNewUser || weeklyData.review.score === null ? (
            <p className="no-results">No results yet</p>
          ) : (
            <>
              <div className="productivity-score">
                <span>{weeklyData.review.score}%</span>
                <strong>Overall productivity score</strong>
              </div>
              <div className="review-stat-grid">
                <article>
                  <strong>{weeklyData.review.completed}</strong>
                  <span>Completed tasks</span>
                </article>
                <article>
                  <strong>{weeklyData.review.unfinished}</strong>
                  <span>Unfinished tasks</span>
                </article>
                <article>
                  <strong>{weeklyData.review.bestDay}</strong>
                  <span>Best productivity day</span>
                </article>
              </div>
              <p className="review-message">{weeklyData.review.message}</p>
            </>
          )}
        </section>

        <section className="weekly-card anger-card">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">Stress Signal</p>
              <h2>Anger Level This Week</h2>
            </div>
            <Flame size={30} />
          </div>

          {weeklyData.isNewUser || !weeklyData.hasStressData ? (
            <p className="no-results">No results yet</p>
          ) : (
            <div className="anger-list">
              {weeklyData.days.map((day) => (
                <div className="anger-row" key={day.key}>
                  <span>{day.dayName}</span>
                  <div className="anger-track" aria-label={`${day.dayName} anger level ${day.stressLevel || 0}`}>
                    <i style={{ width: `${day.stressLevel ? day.stressLevel * 20 : 0}%` }}></i>
                  </div>
                  <strong>{stressLabel(day.stressLevel)}</strong>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function CalendarPage({
  userId,
  tasks = [],
  scheduleItems = [],
  dailyLogs = [],
  dailyEvaluations = [],
  isLoading,
  onSelectDay,
  onDataLoaded,
  onError
}) {
  const [visibleMonth, setVisibleMonth] = useState(() => new Date());
  const [filters, setFilters] = useState({
    tasks: true,
    productivity: true,
    mood: true,
    deadlines: true,
    meetings: true,
    ai: true
  });
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState('');
  const calendarData = buildCalendarMonthData({ visibleMonth, tasks, scheduleItems, dailyLogs, dailyEvaluations });

  useEffect(() => {
    if (!userId) return undefined;
    let isCancelled = false;
    setPageLoading(true);
    setPageError('');
    plannerApi.getCalendarMonth(userId, visibleMonth.getMonth() + 1, visibleMonth.getFullYear())
      .then((data) => {
        if (!isCancelled) {
          onDataLoaded?.(data);
        }
      })
      .catch((error) => {
        if (!isCancelled) {
          console.error('[CalendarPage] Failed to load month data', error);
          setPageError(error.message);
          onError?.(error);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setPageLoading(false);
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [userId, visibleMonth]);

  function moveMonth(direction) {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1));
  }

  function toggleFilter(name) {
    setFilters((current) => ({ ...current, [name]: !current[name] }));
  }

  if (isLoading || pageLoading) {
    return <div className="empty-state">Loading calendar...</div>;
  }

  return (
    <section className="calendar-page">
      <div className="calendar-hero">
        <div>
          <p className="eyebrow">Monthly Calendar</p>
          <h1>{calendarData.monthLabel}</h1>
          <span className="toolbar-copy">Track productivity, deadlines, mood, and task progress across the month.</span>
        </div>
        <div className="calendar-nav">
          <button type="button" onClick={() => moveMonth(-1)} aria-label="Previous month">
            <ChevronLeft size={18} />
          </button>
          <button type="button" onClick={() => setVisibleMonth(new Date())}>
            Today
          </button>
          <button type="button" onClick={() => moveMonth(1)} aria-label="Next month">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {calendarData.isNewUser ? (
        <div className="new-user-note">
          <strong>No activity yet</strong>
          <span>Start adding tasks and daily check-ins to see your monthly progress.</span>
        </div>
      ) : null}

      {pageError ? (
        <div className="new-user-note">
          <strong>Could not load calendar data</strong>
          <span>{pageError}</span>
        </div>
      ) : null}

      <div className="calendar-layout">
        <aside className="month-summary-card">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">Month Summary</p>
              <h2>Progress Overview</h2>
            </div>
            <CalendarDays size={30} />
          </div>
          <div className="month-summary-grid">
            <article>
              <strong>{calendarData.summary.completedTasks}</strong>
              <span>Completed tasks</span>
            </article>
            <article>
              <strong>{calendarData.summary.averageProductivity}%</strong>
              <span>Productivity average</span>
            </article>
            <article>
              <strong>{calendarData.summary.bestDay}</strong>
              <span>Most productive day</span>
            </article>
            <article>
              <strong>{calendarData.summary.currentStreak}</strong>
              <span>Current streak</span>
            </article>
            <article>
              <strong>{calendarData.summary.focusHours}h</strong>
              <span>Total focus hours</span>
            </article>
          </div>
        </aside>

        <section className="calendar-board-card">
          <div className="calendar-filter-row" aria-label="Calendar filters">
            {calendarData.filterOptions.map((filter) => (
              <button
                className={filters[filter.key] ? 'active' : ''}
                type="button"
                key={filter.key}
                onClick={() => toggleFilter(filter.key)}>
                <span>{filter.icon}</span>
                {filter.label}
              </button>
            ))}
          </div>

          <div className="calendar-weekdays" aria-hidden="true">
            {calendarData.weekdays.map((weekday) => <span key={weekday}>{weekday}</span>)}
          </div>

          <div className="month-grid">
            {calendarData.days.map((day) => (
              <button
                className={`month-day-card ${day.isCurrentMonth ? '' : 'outside'} ${day.productivityTone} ${day.isToday ? 'today' : ''}`}
                type="button"
                key={day.key}
                onClick={() => onSelectDay(day)}>
                <span className="month-day-head">
                  <strong>{day.dayNumber}</strong>
                  {day.isToday ? <em>Today</em> : null}
                </span>

                {filters.productivity ? (
                  <span className="mini-progress" aria-label={`${day.progress}% productivity`}>
                    <i style={{ width: `${day.progress}%` }}></i>
                  </span>
                ) : null}

                <span className="calendar-indicators">
                  {filters.tasks && day.taskCount > 0 ? <small title="Tasks exist">T{day.taskCount}</small> : null}
                  {filters.deadlines && day.deadlineCount > 0 ? <small title="Deadline exists">D{day.deadlineCount}</small> : null}
                  {filters.meetings && day.meetingCount > 0 ? <small title="Meeting exists">M</small> : null}
                  {filters.mood && day.highStress ? <small className="stress" title="High stress">S</small> : null}
                  {filters.ai && day.hasAiInsight ? <small className="ai" title="AI insight exists">AI</small> : null}
                </span>

                {filters.deadlines && day.deadlineCount > 0 ? (
                  <span className={`deadline-strip ${day.deadlineTone || ''}`} aria-hidden="true"></span>
                ) : null}
              </button>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function AiNotesPage({
  userId,
  tasks = [],
  scheduleItems = [],
  dailyLogs = [],
  aiNotes = [],
  latestLog,
  isLoading,
  onDataLoaded,
  onError
}) {
  const [period, setPeriod] = useState('weekly');
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState('');
  const insights = buildAiNotesInsights({ tasks, scheduleItems, dailyLogs, latestLog, period });
  const visibleNotes = filterAiNotesByPeriod(aiNotes, period);

  useEffect(() => {
    if (!userId) return undefined;
    let isCancelled = false;
    setPageLoading(true);
    setPageError('');
    plannerApi.getAiNotes(userId, period)
      .then((data) => {
        if (!isCancelled) {
          onDataLoaded?.(data);
        }
      })
      .catch((error) => {
        if (!isCancelled) {
          console.error('[AiNotesPage] Failed to load AI notes', error);
          setPageError(error.message);
          onError?.(error);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setPageLoading(false);
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [userId, period]);

  if (isLoading || pageLoading) {
    return <div className="empty-state">Loading AI notes...</div>;
  }

  return (
    <section className="ai-notes-page">
      <div className="ai-notes-hero">
        <div>
          <p className="eyebrow">AI Notes</p>
          <h1>Smart Insights</h1>
          <span className="toolbar-copy">
            Adaptive observations about productivity, energy, mood, time planning, and focus behavior.
          </span>
        </div>
        <div className="period-switch" aria-label="AI notes period">
          {['daily', 'weekly', 'monthly'].map((item) => (
            <button
              className={period === item ? 'active' : ''}
              type="button"
              key={item}
              onClick={() => setPeriod(item)}>
              {item}
            </button>
          ))}
        </div>
      </div>

      {insights.hasEnoughData ? null : (
        <div className="ai-empty-state">
          <BrainCircuit size={42} />
          <div>
            <strong>No enough data yet for personalized insights.</strong>
            <span>Start completing tasks and daily check-ins to help the system learn your patterns.</span>
          </div>
        </div>
      )}

      {pageError ? (
        <div className="ai-empty-state">
          <AlertTriangle size={42} />
          <div>
            <strong>Could not load AI notes.</strong>
            <span>{pageError}</span>
          </div>
        </div>
      ) : null}

      <div className="ai-kpi-grid">
        {insights.kpis.map((item) => (
          <article className={`ai-kpi-card ${item.tone}`} key={item.label}>
            <item.icon size={24} />
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </article>
        ))}
      </div>

      <div className="ai-insight-grid">
        <InsightCard
          icon={TrendingUp}
          title="Productivity Insights"
          eyebrow="Work rhythm"
          headline={insights.productivity.headline}
          description={insights.productivity.description}
          visual={<MiniBars values={insights.productivity.chart} tone="productivity" />}
        />
        <InsightCard
          icon={Gauge}
          title="Energy Pattern Insights"
          eyebrow="Focus energy"
          headline={insights.energy.headline}
          description={insights.energy.description}
          visual={<MiniLine values={insights.energy.chart} />}
        />
        <InsightCard
          icon={Flame}
          title="Mood / Stress Insights"
          eyebrow="Emotional trend"
          headline={insights.mood.headline}
          description={insights.mood.description}
          visual={<MoodTrendDots values={insights.mood.chart} />}
        />
        <InsightCard
          icon={Clock3}
          title="Time Management Insights"
          eyebrow="Plan vs actual"
          headline={insights.time.headline}
          description={insights.time.description}
          visual={<DurationCompare planned={insights.time.planned} actual={insights.time.actual} />}
        />
      </div>

      <div className="ai-recommendation-grid">
        <section className="ai-recommendation-card">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">Saved Notes</p>
              <h2>Database AI Notes</h2>
            </div>
            <Database size={30} />
          </div>
          <div className="recommendation-list">
            {visibleNotes.length === 0 ? (
              <article>
                <Sparkles size={17} />
                <span>No saved AI notes for this period yet.</span>
              </article>
            ) : visibleNotes.slice(0, 6).map((note) => (
              <article key={note.note_id}>
                <Sparkles size={17} />
                <span>{note.title}: {note.message}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="ai-recommendation-card">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">Focus Recommendations</p>
              <h2>Better Work Pattern</h2>
            </div>
            <Target size={30} />
          </div>
          <div className="recommendation-list">
            {insights.recommendations.map((item) => (
              <article key={item}>
                <Sparkles size={17} />
                <span>{item}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="ai-recommendation-card adaptive-card">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">Smart Adaptive Suggestions</p>
              <h2>How the Scheduler Adapts</h2>
            </div>
            <BrainCircuit size={30} />
          </div>
          <div className="adaptive-flow">
            {insights.adaptiveSuggestions.map((item, index) => (
              <article key={item}>
                <strong>{index + 1}</strong>
                <span>{item}</span>
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function NotificationsPage({ notifications = [], isLoading, onMarkRead, onRemove, onAction }) {
  const [activeFilter, setActiveFilter] = useState('All');
  const filteredNotifications = filterNotifications(notifications, activeFilter);
  const unreadCount = notifications.filter((notification) => notification.status === 'unread').length;

  if (isLoading) {
    return <div className="empty-state">Loading notifications...</div>;
  }

  return (
    <section className="notifications-page">
      <div className="notifications-hero">
        <div>
          <p className="eyebrow">Notifications</p>
          <h1>Needs Attention</h1>
          <span className="toolbar-copy">Important reminders, unfinished tasks, deadlines, and system updates in one place.</span>
        </div>
        <div className="notifications-count-card">
          <Bell size={28} />
          <strong>{unreadCount}</strong>
          <span>Unread</span>
        </div>
      </div>

      <div className="notification-filter-row" aria-label="Notification filters">
        {notificationFilters.map((filter) => (
          <button
            className={activeFilter === filter ? 'active' : ''}
            type="button"
            key={filter}
            onClick={() => setActiveFilter(filter)}>
            {filter}
          </button>
        ))}
      </div>

      {filteredNotifications.length === 0 ? (
        <div className="notifications-empty">
          <CheckCircle2 size={42} />
          <div>
            <strong>You are all caught up.</strong>
            <span>No notifications yet.</span>
          </div>
        </div>
      ) : (
        <div className="notification-list">
          {filteredNotifications.map((notification) => (
            <NotificationCard
              notification={notification}
              key={notification.id}
              onMarkRead={onMarkRead}
              onRemove={onRemove}
              onAction={onAction}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function NotificationCard({ notification, onMarkRead, onRemove, onAction }) {
  const Icon = getNotificationIcon(notification);
  const isUnread = notification.status === 'unread';

  function markRead() {
    onMarkRead(notification.id);
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      markRead();
    }
  }

  return (
    <article
      className={`notification-card ${notification.tone || ''} ${isUnread ? 'unread' : 'read'}`}
      role="button"
      tabIndex={0}
      onClick={markRead}
      onKeyDown={handleKeyDown}>
      <span className="notification-unread-dot" aria-hidden="true"></span>
      <span className="notification-icon">
        <Icon size={22} />
      </span>
      <div className="notification-main">
        <div className="notification-title-row">
          <strong>{notification.title}</strong>
          <span className={`notification-status ${notification.status}`}>{notification.status}</span>
        </div>
        <p>{notification.message}</p>
        {notification.taskTitle ? <span className="notification-related">Task: {notification.taskTitle}</span> : null}
        <div className="notification-meta">
          <span>{notification.type === 'task' ? 'Task notification' : 'System notification'}</span>
          <time>{formatNotificationTime(notification.createdAt)}</time>
        </div>
      </div>
      <div className="notification-actions">
        {notification.actionLabel ? (
          <button
            className="notification-action-button"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onAction(notification);
            }}>
            {notification.actionLabel}
          </button>
        ) : null}
        <button
          className="notification-remove-button"
          type="button"
          aria-label={`Remove ${notification.title}`}
          onClick={(event) => {
            event.stopPropagation();
            onRemove(notification.id);
          }}>
          <Trash2 size={16} />
        </button>
      </div>
    </article>
  );
}

function InsightCard({ icon: Icon, eyebrow, title, headline, description, visual }) {
  return (
    <article className="ai-insight-card">
      <div className="ai-insight-head">
        <Icon size={26} />
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
      </div>
      <div className="ai-visual-slot">{visual}</div>
      <strong>{headline}</strong>
      <span>{description}</span>
    </article>
  );
}

function MiniBars({ values, tone }) {
  return (
    <div className={`mini-bars ${tone || ''}`} aria-hidden="true">
      {values.map((value, index) => (
        <i key={`${value}-${index}`} style={{ height: `${Math.max(12, value)}%` }}></i>
      ))}
    </div>
  );
}

function MiniLine({ values }) {
  const points = values.map((value, index) => {
    const x = values.length <= 1 ? 50 : (index / (values.length - 1)) * 100;
    const y = 100 - Math.max(8, Math.min(92, value));
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg className="mini-line" viewBox="0 0 100 100" aria-hidden="true">
      <polyline points={points} />
      {values.map((value, index) => {
        const x = values.length <= 1 ? 50 : (index / (values.length - 1)) * 100;
        const y = 100 - Math.max(8, Math.min(92, value));
        return <circle cx={x} cy={y} r="3.8" key={`${value}-${index}`} />;
      })}
    </svg>
  );
}

function MoodTrendDots({ values }) {
  return (
    <div className="mood-dot-row" aria-hidden="true">
      {values.map((value, index) => (
        <i className={value >= 4 ? 'high' : value >= 3 ? 'medium' : 'low'} key={`${value}-${index}`}></i>
      ))}
    </div>
  );
}

function DurationCompare({ planned, actual }) {
  const maxValue = Math.max(planned, actual, 1);
  return (
    <div className="duration-compare" aria-hidden="true">
      <span>
        <em style={{ width: `${(planned / maxValue) * 100}%` }}></em>
        Planned {planned}m
      </span>
      <span>
        <em style={{ width: `${(actual / maxValue) * 100}%` }}></em>
        Actual {actual}m
      </span>
    </div>
  );
}

function SettingsPage({ user, settings, onSave }) {
  const [draft, setDraft] = useState(() => mergeSettingsWithUser(settings, user));
  const [sectionNote, setSectionNote] = useState('');

  useEffect(() => {
    setDraft(mergeSettingsWithUser(settings, user));
  }, [settings, user]);

  function updateSection(section, updates) {
    setDraft((current) => ({
      ...current,
      [section]: {
        ...current[section],
        ...updates
      }
    }));
  }

  function saveChanges(event) {
    event.preventDefault();
    const nextProfile = buildProfileFromSettings(draft.profile, user);
    onSave(draft, nextProfile);
    setSectionNote('Changes saved successfully.');
  }

  function exportSettings() {
    const blob = new Blob([JSON.stringify({ user, settings: draft }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'smart-planner-settings.json';
    link.click();
    URL.revokeObjectURL(url);
    setSectionNote('User settings exported.');
  }

  return (
    <section className="settings-page">
      <div className="settings-hero">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Planner Preferences</h1>
          <span className="toolbar-copy">Customize scheduling behavior, notifications, appearance, AI, privacy, and system settings.</span>
        </div>
        <button className="primary-action" type="button" onClick={saveChanges}>
          Save Changes
        </button>
      </div>

      {sectionNote ? <p className="settings-save-note">{sectionNote}</p> : null}

      <form className="settings-grid" onSubmit={saveChanges}>
        <SettingsCard icon={UserRound} title="Profile" eyebrow="Account">
          <ProfileImageField
            value={draft.profile.profile_image}
            onChange={(profileImage) => updateSection('profile', { profile_image: profileImage })}
          />
          <div className="field-grid two">
            <label>
              Display name
              <input
                value={draft.profile.display_name}
                onChange={(event) => updateSection('profile', { display_name: event.target.value })}
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={draft.profile.email}
                onChange={(event) => updateSection('profile', { email: event.target.value })}
              />
            </label>
          </div>
          <div className="field-grid two">
            <label>
              Password
              <input
                type="password"
                placeholder="New password"
                value={draft.profile.password}
                onChange={(event) => updateSection('profile', { password: event.target.value })}
              />
            </label>
            <label>
              Mode
              <select
                value={draft.profile.mode}
                onChange={(event) => updateSection('profile', { mode: event.target.value })}>
                <option>Student</option>
                <option>Work</option>
                <option>Personal</option>
              </select>
            </label>
          </div>
          <label>
            Short bio
            <textarea
              value={draft.profile.bio}
              onChange={(event) => updateSection('profile', { bio: event.target.value })}
              placeholder="A short note about your planning style"
            />
          </label>
        </SettingsCard>

        <SettingsCard icon={CalendarClock} title="Schedule Preferences" eyebrow="Planner rules">
          <div className="field-grid two">
            <label>
              Wake-up time
              <input type="time" value={draft.schedule.wake_up_time} onChange={(event) => updateSection('schedule', { wake_up_time: event.target.value })} />
            </label>
            <label>
              Sleep time
              <input type="time" value={draft.schedule.sleep_time} onChange={(event) => updateSection('schedule', { sleep_time: event.target.value })} />
            </label>
            <label>
              Study/work start
              <input type="time" value={draft.schedule.work_start} onChange={(event) => updateSection('schedule', { work_start: event.target.value })} />
            </label>
            <label>
              Study/work end
              <input type="time" value={draft.schedule.work_end} onChange={(event) => updateSection('schedule', { work_end: event.target.value })} />
            </label>
            <label>
              Break duration
              <input type="number" min="5" step="5" value={draft.schedule.break_duration} onChange={(event) => updateSection('schedule', { break_duration: event.target.value })} />
            </label>
            <label>
              Focus session length
              <input type="number" min="15" step="15" value={draft.schedule.focus_length} onChange={(event) => updateSection('schedule', { focus_length: event.target.value })} />
            </label>
            <label>
              Planning start
              <input type="time" value={draft.schedule.planning_start} onChange={(event) => updateSection('schedule', { planning_start: event.target.value })} />
            </label>
            <label>
              Planning end
              <input type="time" value={draft.schedule.planning_end} onChange={(event) => updateSection('schedule', { planning_end: event.target.value })} />
            </label>
          </div>
        </SettingsCard>

        <SettingsCard icon={Bell} title="Notifications" eyebrow="Reminders">
          <div className="toggle-grid">
            {[
              ['task_reminders', 'Task reminders'],
              ['deadline_reminders', 'Deadline reminders'],
              ['daily_checkin', 'Daily check-in reminder'],
              ['break_reminders', 'Break reminders'],
              ['schedule_generation', 'Schedule generation reminder'],
              ['weekly_summary', 'Weekly productivity summary'],
              ['sound', 'Notification sound']
            ].map(([key, label]) => (
              <ToggleSetting
                checked={draft.notifications[key]}
                key={key}
                label={label}
                onChange={(checked) => updateSection('notifications', { [key]: checked })}
              />
            ))}
          </div>
          <div className="field-grid two">
            <label>
              Silent mode starts
              <input type="time" value={draft.notifications.silent_start} onChange={(event) => updateSection('notifications', { silent_start: event.target.value })} />
            </label>
            <label>
              Silent mode ends
              <input type="time" value={draft.notifications.silent_end} onChange={(event) => updateSection('notifications', { silent_end: event.target.value })} />
            </label>
          </div>
        </SettingsCard>

        <SettingsCard icon={BrainCircuit} title="AI Preferences" eyebrow="Smart layer">
          <div className="toggle-grid">
            {[
              ['recommendations', 'AI recommendations'],
              ['adaptive_scheduling', 'Smart adaptive scheduling'],
              ['daily_summary', 'Daily AI summary'],
              ['feedback_adaptation', 'Feedback-based adaptation']
            ].map(([key, label]) => (
              <ToggleSetting
                checked={draft.ai[key]}
                key={key}
                label={label}
                onChange={(checked) => updateSection('ai', { [key]: checked })}
              />
            ))}
          </div>
          <div className="field-grid two">
            <label>
              AI notes frequency
              <select value={draft.ai.notes_frequency} onChange={(event) => updateSection('ai', { notes_frequency: event.target.value })}>
                <option>Daily</option>
                <option>Weekly</option>
                <option>Monthly</option>
              </select>
            </label>
            <label>
              AI personality style
              <select value={draft.ai.personality} onChange={(event) => updateSection('ai', { personality: event.target.value })}>
                <option>Motivational</option>
                <option>Minimal</option>
                <option>Strict</option>
                <option>Friendly</option>
              </select>
            </label>
          </div>
        </SettingsCard>

        <SettingsCard icon={Palette} title="Appearance" eyebrow="Interface">
          <div className="field-grid two">
            <label>
              Mode
              <select value={draft.appearance.mode} onChange={(event) => updateSection('appearance', { mode: event.target.value })}>
                <option>Light</option>
                <option>Dark</option>
                <option>Auto</option>
              </select>
            </label>
            <label>
              Theme colors
              <select value={draft.appearance.theme} onChange={(event) => updateSection('appearance', { theme: event.target.value })}>
                <option>Blue / Teal</option>
                <option>Calm Green</option>
                <option>Warm Sunrise</option>
                <option>Soft Purple</option>
              </select>
            </label>
            <label>
              UI density
              <select value={draft.appearance.density} onChange={(event) => updateSection('appearance', { density: event.target.value })}>
                <option>Comfortable</option>
                <option>Compact</option>
                <option>Spacious</option>
              </select>
            </label>
            <label>
              Font size
              <select value={draft.appearance.font_size} onChange={(event) => updateSection('appearance', { font_size: event.target.value })}>
                <option>Small</option>
                <option>Medium</option>
                <option>Large</option>
              </select>
            </label>
          </div>
        </SettingsCard>

        <SettingsCard icon={ShieldCheck} title="Privacy & Data" eyebrow="Control">
          <div className="toggle-grid">
            <ToggleSetting
              checked={draft.privacy.privacy_mode}
              label="Privacy mode"
              onChange={(checked) => updateSection('privacy', { privacy_mode: checked })}
            />
            <ToggleSetting
              checked={draft.privacy.ai_data_usage}
              label="Allow AI data usage for insights"
              onChange={(checked) => updateSection('privacy', { ai_data_usage: checked })}
            />
            <ToggleSetting
              checked={draft.privacy.resource_management}
              label="Manage uploaded resources"
              onChange={(checked) => updateSection('privacy', { resource_management: checked })}
            />
          </div>
          <div className="settings-action-row">
            <button type="button" onClick={exportSettings}>Export user data</button>
            <button type="button" onClick={() => setSectionNote('Delete history will be connected to the database later.')}>Delete history</button>
            <button type="button" onClick={() => setSectionNote('Completed task history cleanup will be connected later.')}>Clear completed tasks</button>
          </div>
        </SettingsCard>

        <SettingsCard icon={SlidersHorizontal} title="System" eyebrow="Global">
          <div className="field-grid two">
            <label>
              Language
              <select value={draft.system.language} onChange={(event) => updateSection('system', { language: event.target.value })}>
                <option>English</option>
                <option>Hebrew</option>
                <option>Arabic</option>
              </select>
            </label>
            <label>
              Time format
              <select value={draft.system.time_format} onChange={(event) => updateSection('system', { time_format: event.target.value })}>
                <option>24h</option>
                <option>12h</option>
              </select>
            </label>
            <label>
              First day of week
              <select value={draft.system.first_day} onChange={(event) => updateSection('system', { first_day: event.target.value })}>
                <option>Sunday</option>
                <option>Monday</option>
              </select>
            </label>
            <label>
              Timezone
              <select value={draft.system.timezone} onChange={(event) => updateSection('system', { timezone: event.target.value })}>
                <option>Asia/Jerusalem</option>
                <option>UTC</option>
                <option>Europe/London</option>
                <option>America/New_York</option>
              </select>
            </label>
          </div>
        </SettingsCard>

        <div className="settings-save-row">
          <button className="primary-action" type="submit">Save Changes</button>
        </div>
      </form>
    </section>
  );
}

function ProgressPage({
  userId,
  tasks = [],
  scheduleItems = [],
  dailyLogs = [],
  dailyEvaluations = [],
  latestLog,
  isLoading,
  onDataLoaded,
  onError
}) {
  const [period, setPeriod] = useState('weekly');
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState('');
  const progress = buildProgressDashboardData({ tasks, scheduleItems, dailyLogs, dailyEvaluations, latestLog, period });

  useEffect(() => {
    if (!userId) return undefined;
    let isCancelled = false;
    setPageLoading(true);
    setPageError('');
    plannerApi.getProgress(userId, period)
      .then((data) => {
        if (!isCancelled) {
          onDataLoaded?.(data);
        }
      })
      .catch((error) => {
        if (!isCancelled) {
          console.error('[ProgressPage] Failed to load progress data', error);
          setPageError(error.message);
          onError?.(error);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setPageLoading(false);
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [userId, period]);

  if (isLoading || pageLoading) {
    return <div className="empty-state">Loading progress dashboard...</div>;
  }

  return (
    <section className="progress-page">
      <div className="progress-hero">
        <div>
          <p className="eyebrow">Progress / Feedback Loop</p>
          <h1>Learning Progress</h1>
          <span className="toolbar-copy">
            See how your productivity improves and how feedback changes future schedules.
          </span>
        </div>
        <div className="period-switch" aria-label="Progress period">
          {['daily', 'weekly', 'monthly'].map((item) => (
            <button
              className={period === item ? 'active' : ''}
              type="button"
              key={item}
              onClick={() => setPeriod(item)}>
              {item}
            </button>
          ))}
        </div>
      </div>

      {progress.hasEnoughData ? null : (
        <div className="progress-empty-state">
          <BarChart3 size={42} />
          <div>
            <strong>No progress data yet.</strong>
            <span>Complete tasks and submit feedback to see your progress.</span>
          </div>
        </div>
      )}

      {pageError ? (
        <div className="progress-empty-state">
          <AlertTriangle size={42} />
          <div>
            <strong>Could not load progress data.</strong>
            <span>{pageError}</span>
          </div>
        </div>
      ) : null}

      <div className="progress-score-grid">
        <ProgressScoreCard label="Today's productivity" value={progress.todayScore} tone={progress.todayScore >= 70 ? 'good' : progress.todayScore >= 45 ? 'medium' : 'low'} />
        <ProgressScoreCard label="Weekly average" value={progress.weeklyAverage} tone={progress.weeklyAverage >= 70 ? 'good' : progress.weeklyAverage >= 45 ? 'medium' : 'low'} />
        <ProgressScoreCard label="Monthly average" value={progress.monthlyAverage} tone={progress.monthlyAverage >= 70 ? 'good' : progress.monthlyAverage >= 45 ? 'medium' : 'low'} />
        <article className="progress-best-day-card">
          <Target size={28} />
          <strong>{progress.bestDay}</strong>
          <span>Best productive day</span>
        </article>
      </div>

      <div className="progress-dashboard-grid">
        <section className="progress-card productivity-progress-card">
          <ProgressCardHeader icon={TrendingUp} eyebrow="Productivity Progress" title="Productivity Over Time" />
          <MiniLine values={progress.productivityTrend} />
          <p>{progress.improvementMessage}</p>
        </section>

        <section className="progress-card task-trend-card">
          <ProgressCardHeader icon={CheckCircle2} eyebrow="Task Completion Trends" title="Completion Status" />
          <div className="task-trend-layout">
            <div className="donut-score" style={{ '--score': `${progress.completionPercentage}%`, '--score-color': progress.completionPercentage >= 70 ? 'var(--green)' : progress.completionPercentage >= 45 ? 'var(--amber)' : 'var(--rose)' }}>
              <span>{progress.completionPercentage}%</span>
              <small>Complete</small>
            </div>
            <div className="task-stat-list">
              <span><strong>{progress.completedTasks}</strong> Completed tasks</span>
              <span><strong>{progress.unfinishedTasks}</strong> Unfinished tasks</span>
              <span><strong>{progress.overdueTasks}</strong> Overdue tasks</span>
            </div>
          </div>
        </section>

        <section className="progress-card planned-actual-card">
          <ProgressCardHeader icon={Clock3} eyebrow="Planned vs Actual Time" title="Time Accuracy" />
          <DurationCompare planned={progress.plannedMinutes} actual={progress.actualMinutes} />
          <p>{progress.timeInsight}</p>
        </section>

        <section className="progress-card feedback-impact-card">
          <ProgressCardHeader icon={RefreshCw} eyebrow="Feedback Impact" title="Before Feedback → After Feedback" />
          <div className="feedback-before-after">
            <article>
              <strong>Before Feedback</strong>
              <span>{progress.feedbackBefore}</span>
            </article>
            <i aria-hidden="true">→</i>
            <article>
              <strong>After Feedback</strong>
              <span>{progress.feedbackAfter}</span>
            </article>
          </div>
        </section>

        <section className="progress-card energy-mood-card">
          <ProgressCardHeader icon={Activity} eyebrow="Energy & Mood Progress" title="Energy, Mood, Stress" />
          <div className="energy-mood-grid">
            <div>
              <strong>Energy</strong>
              <MiniLine values={progress.energyTrend} />
            </div>
            <div>
              <strong>Stress</strong>
              <MoodTrendDots values={progress.stressTrend} />
            </div>
          </div>
          <p>{progress.energyMoodMessage}</p>
        </section>

        <section className="progress-card learning-summary-card">
          <ProgressCardHeader icon={BrainCircuit} eyebrow="Smart Learning Summary" title="What The System Learned" />
          <div className="learning-list">
            {progress.learningSummary.map((item) => (
              <article key={item}>
                <Sparkles size={17} />
                <span>{item}</span>
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function ProgressScoreCard({ label, value, tone }) {
  return (
    <article className={`progress-score-card ${tone}`}>
      <div className="score-ring" style={{ '--score': `${value}%` }}>
        <strong>{value}%</strong>
      </div>
      <span>{label}</span>
    </article>
  );
}

function ProgressCardHeader({ icon: Icon, eyebrow, title }) {
  return (
    <div className="progress-card-head">
      <Icon size={28} />
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
    </div>
  );
}

function SettingsCard({ icon: Icon, eyebrow, title, children }) {
  return (
    <section className="settings-card">
      <div className="settings-card-head">
        <Icon size={28} />
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
      </div>
      <div className="settings-card-body">{children}</div>
    </section>
  );
}

function ToggleSetting({ label, checked, onChange }) {
  return (
    <label className="toggle-setting">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={Boolean(checked)}
        onChange={(event) => onChange(event.target.checked)}
      />
      <i aria-hidden="true"></i>
    </label>
  );
}

function SelectedDayInputPage({
  userId,
  day,
  onBack,
  onDailyLogSubmit,
  onGenerate,
  latestLog,
  addedTasks,
  onSaveTask,
  onDeleteTask,
  onDayDataLoaded,
  onError
}) {
  const [checkInDraft, setCheckInDraft] = useState(getDefaultCheckInDraft());
  const [taskDraft, setTaskDraft] = useState(null);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState('');
  const dayKey = day?.key || toDateKey(new Date());
  const dayTitle = formatSelectedDayHeading(day);
  const editingTask = addedTasks.find((task) => getPreviewTaskId(task) === editingTaskId) || null;
  const validation = validateSelectedDayInput(checkInDraft, addedTasks);
  const canGenerate = validation.isValid && !isGenerating;
  const isReviewMode = isPastDayKey(dayKey);

  useEffect(() => {
    if (!userId || !dayKey) return undefined;
    let isCancelled = false;
    setPageLoading(true);
    setPageError('');
    plannerApi.getDay(userId, dayKey)
      .then((data) => {
        if (!isCancelled) {
          onDayDataLoaded?.(dayKey, data);
        }
      })
      .catch((error) => {
        if (!isCancelled) {
          console.error('[SelectedDayInputPage] Failed to load selected day', error);
          setPageError(error.message);
          onError?.(error);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setPageLoading(false);
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [userId, dayKey]);

  async function handleTaskPreviewSubmit(task) {
    await onSaveTask(dayKey, task, editingTask);
    setEditingTaskId(null);
  }

  function handleEditTask(task) {
    setEditingTaskId(getPreviewTaskId(task));
  }

  async function handleDeleteTask(taskId) {
    const task = addedTasks.find((item) => getPreviewTaskId(item) === taskId);
    const confirmed = window.confirm('Delete this task from Added Tasks?');
    if (!confirmed) return;

    await onDeleteTask(dayKey, task);
    if (editingTaskId === taskId) {
      setEditingTaskId(null);
    }
  }

  async function handleGenerateClick() {
    if (isReviewMode || !validation.isValid) return;
    setIsGenerating(true);
    try {
      await onGenerate({ ...(day || {}), key: dayKey }, checkInDraft, addedTasks);
    } finally {
      setIsGenerating(false);
    }
  }

  if (isReviewMode) {
    return (
      <section className="selected-day-page">
        <div className="selected-day-hero">
          <div>
            <p className="eyebrow">Selected Day</p>
            <h1>{dayTitle}</h1>
            <span>This day has already ended, so it is available as a read-only review.</span>
          </div>
          <button className="text-action compact" type="button" onClick={onBack}>
            <ArrowLeft size={16} />
            Back to weekly dashboard
          </button>
        </div>

        <div className="review-mode-banner">
          <Lock size={18} />
          <div>
            <strong>Review Mode — This day has already ended.</strong>
            <span>Add Task, Daily Check-In saving, and Generate Schedule are disabled for past days.</span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="selected-day-page">
      <div className="selected-day-hero">
        <div>
          <p className="eyebrow">Selected Day</p>
          <h1>{dayTitle}</h1>
          <span>Fill the daily check-in and add the tasks for this specific day.</span>
        </div>
        <button className="text-action compact" type="button" onClick={onBack}>
          <ArrowLeft size={16} />
          Back to weekly dashboard
        </button>
      </div>

      <div className="selected-day-grid">
        <DailyCheckIn
          onSubmit={onDailyLogSubmit}
          latestLog={datePart(latestLog?.log_date) === dayKey ? latestLog : null}
          selectedDate={dayKey}
          onDraftChange={setCheckInDraft}
        />
        <div className="selected-day-task-column">
          <TaskForm
            onSubmit={handleTaskPreviewSubmit}
            selectedDate={dayKey}
            onDraftChange={setTaskDraft}
            initialValue={editingTask}
            submitLabel={editingTask ? 'Update Task' : 'Add Task'}
            savingLabel={editingTask ? 'Updating...' : 'Adding...'}
            requireCompleteTask
            onCancelEdit={() => setEditingTaskId(null)}
            afterForm={
              <AddedTasksPreview
                tasks={addedTasks}
                onEdit={handleEditTask}
                onDelete={handleDeleteTask}
              />
            }
          />
        </div>
      </div>

      <section className="generate-day-card">
        <div>
          <p className="eyebrow">Next Step</p>
          <h2>Ready to generate this day?</h2>
          <span>The system will save the selected-day input, run the scheduler, and open the result page.</span>
          {pageLoading ? <em className="generate-requirements">Loading saved data for this day...</em> : null}
          {pageError ? <em className="generate-requirements">{pageError}</em> : null}
          {!validation.isValid ? <em className="generate-requirements">{validation.message}</em> : null}
        </div>
        <button className="primary-action" type="button" onClick={handleGenerateClick} disabled={!canGenerate}>
          <CalendarClock size={18} />
          {isGenerating ? 'Generating...' : 'Generate Daily Schedule'}
        </button>
      </section>
    </section>
  );
}

function DailyDetailsPage({
  userId,
  day,
  schedule,
  items = [],
  tasks = [],
  latestLog,
  aiNotes = [],
  onBack,
  onWeekly,
  overviewBackLabel = 'Back to weekly dashboard',
  onTaskStatusChange,
  onDataRefresh
}) {
  const dayKey = day?.key || datePart(schedule?.schedule_date) || toDateKey(new Date());
  const isReviewMode = isPastDayKey(dayKey);
  const [detailItems, setDetailItems] = useState(() => initializeDailyDetailItems({ day, schedule, items, tasks }));
  const [notice, setNotice] = useState('');
  const [editingItemId, setEditingItemId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [activeTaskUi, setActiveTaskUi] = useState(() => buildActiveTaskUiFromItems(initializeDailyDetailItems({ day, schedule, items, tasks })));
  const [dailyAiNotes, setDailyAiNotes] = useState([]);
  const [selectedCompletedItemId, setSelectedCompletedItemId] = useState(null);
  const [restoreMenuItemId, setRestoreMenuItemId] = useState(null);
  const [waitingTaskToRemove, setWaitingTaskToRemove] = useState(null);
  const details = splitDailyDetailItems(detailItems, latestLog);
  const currentTaskId = details.currentTask ? getDetailItemId(details.currentTask) : null;
  const currentTaskUi = details.currentTask
    ? activeTaskUi[currentTaskId] || buildActiveTaskUiState(details.currentTask)
    : null;
  const feedbackTask = !isReviewMode && currentTaskUi?.feedbackOpen ? details.currentTask : null;
  const completedDetailsTask = selectedCompletedItemId
    ? details.completedTasks.find((item) => getDetailItemId(item) === selectedCompletedItemId)
    : null;
  const dailyEvaluation = buildDailyEvaluation(details, activeTaskUi, latestLog);
  const adviceNotes = buildDailyAdviceNotes(details.advice, mergeById(aiNotes, dailyAiNotes, 'note_id'), dayKey, latestLog);

  useEffect(() => {
    const nextItems = initializeDailyDetailItems({ day, schedule, items, tasks });
    setDetailItems(nextItems);
    setNotice('');
    setEditingItemId(null);
    setEditDraft(null);
    setActiveTaskUi(buildActiveTaskUiFromItems(nextItems));
    setDailyAiNotes([]);
    setSelectedCompletedItemId(null);
    setRestoreMenuItemId(null);
    setWaitingTaskToRemove(null);
  }, [dayKey, schedule?.schedule_id, items, tasks]);

  useEffect(() => {
    if (!userId || !dayKey) return undefined;
    let isCancelled = false;
    plannerApi.getDailyDetails(userId, dayKey)
      .then((data) => {
        if (isCancelled) return;
        const nextItems = initializeDailyDetailItems({
          day,
          schedule: data.schedule || schedule,
          items: data.items || data.schedule_items || [],
          tasks: data.tasks || tasks
        });
        setDetailItems(nextItems);
        setActiveTaskUi(buildActiveTaskUiFromItems(nextItems));
        setDailyAiNotes(data.ai_notes || []);
        onDataRefresh?.(data);
      })
      .catch((error) => {
        if (!isCancelled) {
          console.error('[DailyDetailsPage] Failed to load daily details', error);
          setNotice(error.message);
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [userId, dayKey]);

  useEffect(() => {
    function refreshFixedTasks() {
      setDetailItems((currentItems) => {
        const result = applyFixedTimeAutomation(currentItems, new Date());
        if (result.notice) {
          setNotice(result.notice);
        }
        return result.items;
      });
    }

    refreshFixedTasks();
    const timer = window.setInterval(refreshFixedTasks, 15000);
    return () => window.clearInterval(timer);
  }, [dayKey]);

  async function startTask(item) {
    if (isReviewMode) {
      setNotice('Review Mode is read-only. This task cannot be started from a past day.');
      return;
    }

    if (isBreakScheduleItem(item)) {
      setNotice('Breaks are shown in the timeline only and cannot be started like tasks.');
      return;
    }

    if (item.task_kind === 'fixed') {
      setNotice('Fixed-time tasks start automatically at their scheduled time.');
      return;
    }

    if (!item.schedule_item_id) {
      setNotice('This deadline task is visible for planning, but it needs a generated schedule block before it can be started.');
      return;
    }

    const activeTask = detailItems.find((detailItem) => detailItem.status === 'in_progress' && !isBreakScheduleItem(detailItem));
    if (activeTask && getDetailItemId(activeTask) !== getDetailItemId(item)) {
      setNotice('Finish or return the current task before starting another one.');
      return;
    }

    try {
      const startedAt = new Date().toISOString();
      const result = await plannerApi.updateScheduleItemStatus(item.schedule_item_id, {
        status: 'in_progress',
        started_at: startedAt,
        actual_started_at: startedAt
      });
      applyScheduleItemResult(result);
      await onDataRefresh?.();
      setNotice('Task moved to In Progress.');
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function finishTask(item) {
    if (isReviewMode) {
      setNotice('Review Mode is read-only. This task cannot be finished from a past day.');
      return;
    }

    if (isBreakScheduleItem(item)) {
      setNotice('Breaks cannot be completed like tasks.');
      return;
    }

    const completedAt = new Date();
    const completedAtIso = completedAt.toISOString();
    const actualDurationMinutes = calculateActualDurationMinutes(item, completedAt);
    if (item.schedule_item_id) {
      try {
        const result = await plannerApi.updateScheduleItemStatus(item.schedule_item_id, {
          status: 'completed',
          completed_at: completedAtIso,
          actual_completed_at: completedAtIso,
          actual_duration_minutes: actualDurationMinutes
        });
        applyScheduleItemResult(result);
        await onDataRefresh?.();
      } catch (error) {
        setNotice(error.message);
        return;
      }
    } else if (item.task_id) {
      try {
        await plannerApi.updateTask(item.task_id, {
          status: 'completed',
          is_completed: true,
          completed_on: dayKey,
          completed_date: dayKey,
          completed_at: completedAtIso,
          actual_duration_minutes: actualDurationMinutes,
          remaining_duration_minutes: 0
        });
        await onDataRefresh?.();
      } catch (error) {
        setNotice(error.message);
        return;
      }
    }

    setDetailItems((currentItems) => currentItems.map((detailItem) => (
      getDetailItemId(detailItem) === getDetailItemId(item)
        ? {
            ...detailItem,
            status: 'completed',
            completed_at: completedAtIso,
            actual_completed_at: completedAtIso,
            actual_duration_minutes: calculateActualDurationMinutes(detailItem, completedAt)
          }
        : detailItem
    )));
    onTaskStatusChange?.(item.task_id, {
      status: 'completed',
      is_completed: true,
      completed_on: dayKey,
      completed_date: dayKey,
      completed_at: completedAtIso,
      actual_duration_minutes: actualDurationMinutes,
      remaining_duration_minutes: 0
    });
    setNotice('Task moved to Completed Tasks.');
  }

  async function returnToWaiting(item) {
    if (isReviewMode) {
      setNotice('Review Mode is read-only. This task cannot be returned from a past day.');
      return;
    }

    if (isBreakScheduleItem(item)) {
      setNotice('Breaks stay on the timeline and cannot be moved to Waiting Tasks.');
      return;
    }

    if (item.schedule_item_id) {
      try {
        const result = await plannerApi.updateScheduleItemStatus(item.schedule_item_id, { status: 'waiting' });
        applyScheduleItemResult(result);
        await onDataRefresh?.();
      } catch (error) {
        setNotice(error.message);
        return;
      }
    }

    setDetailItems((currentItems) => currentItems.map((detailItem) => (
      getDetailItemId(detailItem) === getDetailItemId(item)
        ? { ...detailItem, status: getWaitingStatusForItem(detailItem, dayKey) }
        : detailItem
    )));
    onTaskStatusChange?.(item.task_id, {
      status: 'pending',
      is_completed: false,
      completed_on: null,
      completed_date: null,
      completed_at: null
    });
    setNotice('Task returned to Waiting Tasks.');
  }

  function updateActiveTaskUi(item, updater) {
    const itemId = getDetailItemId(item);
    setActiveTaskUi((current) => {
      const currentState = current[itemId] || buildActiveTaskUiState(item);
      return {
        ...current,
        [itemId]: typeof updater === 'function' ? updater(currentState) : { ...currentState, ...updater }
      };
    });
  }

  async function toggleSubtask(item, subtaskId) {
    if (isReviewMode) return;

    const currentState = activeTaskUi[getDetailItemId(item)] || buildActiveTaskUiState(item);
    const subtask = currentState.subtasks.find((entry) => entry.id === subtaskId || entry.subtask_id === subtaskId);
    const nextCompleted = !subtask?.completed;

    updateActiveTaskUi(item, (currentState) => ({
      ...currentState,
      subtasks: currentState.subtasks.map((subtask) => (
        subtask.id === subtaskId ? { ...subtask, completed: !subtask.completed } : subtask
      ))
    }));

    if (subtask?.subtask_id) {
      try {
        await plannerApi.updateSubtask(subtask.subtask_id, { is_completed: nextCompleted });
      } catch (error) {
        setNotice(error.message);
      }
    }
  }

  async function addTaskResource(item, type, value) {
    if (isReviewMode) {
      setNotice('Review Mode is read-only. Resources cannot be changed for a past day.');
      return;
    }

    const draftKey = type === 'image' ? 'imageDraft' : 'linkDraft';
    const rawValue = value?.trim();
    if (!rawValue) {
      setNotice(type === 'image' ? 'Add an image URL before saving it.' : 'Add a link before saving it.');
      return;
    }

    if ((type === 'image' || type === 'link') && !isValidHttpUrl(rawValue)) {
      setNotice('Please add a valid internet link that starts with http:// or https://.');
      return;
    }

    try {
      const result = await plannerApi.addResource({
        user_id: userId,
        task_id: item.task_id,
        schedule_item_id: item.schedule_item_id,
        resource_type: type,
        label: shortenUrl(rawValue),
        value: rawValue,
        preview_url: type === 'image' ? rawValue : ''
      });
      updateActiveTaskUi(item, (state) => ({
        ...state,
        [draftKey]: '',
        resources: [...state.resources, normalizeResourceForUi(result.resource)]
      }));
      await onDataRefresh?.();
      setNotice(type === 'image' ? 'Image resource saved.' : 'Link resource saved.');
    } catch (error) {
      setNotice(error.message);
    }
  }

  function addImageResourceFromFile(item, file) {
    if (isReviewMode) {
      setNotice('Review Mode is read-only. Resources cannot be changed for a past day.');
      return;
    }

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setNotice('Please choose an image file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const result = await plannerApi.addResource({
          user_id: userId,
          task_id: item.task_id,
          schedule_item_id: item.schedule_item_id,
          resource_type: 'image',
          label: file.name,
          value: file.name,
          preview_url: reader.result
        });
        updateActiveTaskUi(item, (state) => ({
          ...state,
          resources: [...state.resources, normalizeResourceForUi(result.resource)]
        }));
        await onDataRefresh?.();
        setNotice('Image resource saved.');
      } catch (error) {
        setNotice(error.message);
      }
    };
    reader.onerror = () => setNotice('Could not read this image. Please try another file.');
    reader.readAsDataURL(file);
  }

  async function removeTaskResource(item, resourceId) {
    if (isReviewMode) {
      setNotice('Review Mode is read-only. Resources cannot be changed for a past day.');
      return;
    }

    const state = activeTaskUi[getDetailItemId(item)] || buildActiveTaskUiState(item);
    const resource = state.resources.find((entry) => entry.id === resourceId || entry.resource_id === resourceId);
    try {
      if (resource?.resource_id) {
        await plannerApi.deleteResource(resource.resource_id);
      }
      updateActiveTaskUi(item, (state) => ({
        ...state,
        resources: state.resources.filter((resource) => resource.id !== resourceId && resource.resource_id !== resourceId)
      }));
      await onDataRefresh?.();
      setNotice('Resource removed.');
    } catch (error) {
      setNotice(error.message);
    }
  }

  function openFeedbackPopup(item) {
    if (isReviewMode) {
      setNotice('Review Mode is read-only. New feedback cannot be submitted for a past day.');
      return;
    }

    if (isBreakScheduleItem(item)) {
      setNotice('Feedback is saved for tasks, not breaks.');
      return;
    }

    updateActiveTaskUi(item, { feedbackOpen: true });
  }

  function closeFeedbackPopup(item) {
    updateActiveTaskUi(item, { feedbackOpen: false });
  }

  function updateFeedbackDraft(item, updates) {
    updateActiveTaskUi(item, (currentState) => ({
      ...currentState,
      feedbackDraft: {
        ...currentState.feedbackDraft,
        ...updates
      }
    }));
  }

  async function submitProgressFeedback(item) {
    if (isReviewMode) {
      setNotice('Review Mode is read-only. New feedback cannot be submitted for a past day.');
      return;
    }

    if (isBreakScheduleItem(item)) {
      setNotice('Feedback is saved for tasks, not breaks.');
      return;
    }

    const currentState = activeTaskUi[getDetailItemId(item)] || buildActiveTaskUiState(item);
    const outcome = currentState.feedbackDraft.outcome;
    const feedbackPayload = {
      ...currentState.feedbackDraft,
      user_id: userId,
      task_id: item.task_id,
      schedule_item_id: item.schedule_item_id,
      outcome,
      completed: outcome === 'completed'
    };

    try {
      const result = await plannerApi.submitFeedback(feedbackPayload);
      updateActiveTaskUi(item, (state) => ({
        ...state,
        feedbackOpen: false,
        lastFeedback: { ...currentState.feedbackDraft, ...result.feedback },
        feedbackDraft: getDefaultProgressFeedbackDraft()
      }));
      await onDataRefresh?.();
    } catch (error) {
      setNotice(error.message);
      return;
    }

    if (outcome === 'completed') {
      await finishTask(item);
      setNotice('Feedback saved. Task moved to Completed Tasks.');
      return;
    }

    if (outcome === 'waiting') {
      await returnToWaiting(item);
      setNotice('Feedback saved. Task returned to Waiting Tasks.');
      return;
    }

    setNotice('Feedback saved. Task is still in progress.');
  }

  function beginEdit(item) {
    if (isReviewMode) {
      setNotice('Review Mode is read-only. Past-day tasks cannot be edited.');
      return;
    }

    if (isBreakScheduleItem(item)) {
      setNotice('Breaks cannot be edited like tasks.');
      return;
    }

    setEditingItemId(getDetailItemId(item));
    setEditDraft(buildDailyTaskEditDraft(item));
  }

  function cancelEdit() {
    setEditingItemId(null);
    setEditDraft(null);
  }

  async function saveEdit(item) {
    if (isReviewMode) {
      setNotice('Review Mode is read-only. Past-day tasks cannot be edited.');
      return;
    }

    if (!editDraft?.title?.trim()) {
      setNotice('Task title is required before saving the update.');
      return;
    }

    if (editDraft.start_time && editDraft.end_time && editDraft.start_time >= editDraft.end_time) {
      setNotice('Task end time must be after the start time.');
      return;
    }

    try {
      await plannerApi.updateTask(item.task_id, {
        title: editDraft.title.trim(),
        priority_level: editDraft.priority_level,
        difficulty_level: editDraft.difficulty_level,
        schedule_item_id: item.schedule_item_id,
        start_time: replaceTimePart(item.start_time, editDraft.start_time, dayKey),
        end_time: replaceTimePart(item.end_time, editDraft.end_time, dayKey)
      });
      setDetailItems((currentItems) => currentItems.map((detailItem) => (
        getDetailItemId(detailItem) === getDetailItemId(item)
          ? applyDailyTaskEdit(detailItem, editDraft, dayKey)
          : detailItem
      )));
      await onDataRefresh?.();
      setNotice('Waiting task updated.');
      cancelEdit();
    } catch (error) {
      setNotice(error.message);
    }
  }

  function toggleRestoreMenu(item) {
    if (isReviewMode) return;

    const itemId = getDetailItemId(item);
    setRestoreMenuItemId((currentId) => (currentId === itemId ? null : itemId));
  }

  async function restoreCompletedTask(item, targetStatus) {
    if (isReviewMode) {
      setNotice('Review Mode is read-only. Completed tasks cannot be restored from a past day.');
      setRestoreMenuItemId(null);
      return;
    }

    if (isBreakScheduleItem(item)) {
      setNotice('Breaks cannot be restored like completed tasks.');
      setRestoreMenuItemId(null);
      return;
    }

    const itemId = getDetailItemId(item);
    const restoreTime = new Date().toISOString();

    if (targetStatus === 'in_progress') {
      const activeTask = detailItems.find((detailItem) => detailItem.status === 'in_progress' && !isBreakScheduleItem(detailItem));
      if (activeTask && getDetailItemId(activeTask) !== itemId) {
        setNotice('Finish or return the current task before restoring another task to In Progress.');
        setRestoreMenuItemId(null);
        return;
      }
    }

    if (item.schedule_item_id) {
      try {
        const result = await plannerApi.updateScheduleItemStatus(item.schedule_item_id, {
          status: targetStatus === 'waiting' ? 'waiting' : targetStatus,
          restored_at: restoreTime
        });
        applyScheduleItemResult(result);
        await onDataRefresh?.();
      } catch (error) {
        setNotice(error.message);
        setRestoreMenuItemId(null);
        return;
      }
    }

    setDetailItems((currentItems) => currentItems.map((detailItem) => {
      if (getDetailItemId(detailItem) !== itemId) return detailItem;
      return {
        ...detailItem,
        status: targetStatus === 'waiting' ? getWaitingStatusForItem(detailItem, dayKey) : targetStatus,
        restored_at: restoreTime,
        started_at: targetStatus === 'in_progress' ? restoreTime : detailItem.started_at,
        actual_started_at: targetStatus === 'in_progress' ? restoreTime : detailItem.actual_started_at
      };
    }));
    onTaskStatusChange?.(item.task_id, {
      status: targetStatus === 'in_progress' ? 'in_progress' : 'pending',
      is_completed: false,
      completed_on: null,
      completed_date: null,
      completed_at: null
    });
    setRestoreMenuItemId(null);
    setSelectedCompletedItemId((currentId) => (currentId === itemId ? null : currentId));
    setNotice(targetStatus === 'in_progress'
      ? 'Completed task restored to Task In Progress.'
      : 'Completed task restored to Waiting Tasks.');
  }

  function requestRemoveWaitingTask(item) {
    if (isReviewMode) {
      setNotice('Review Mode is read-only. Waiting tasks cannot be removed from a past day.');
      return;
    }

    if (isBreakScheduleItem(item)) {
      setNotice('Breaks are timeline items and cannot be removed like tasks.');
      return;
    }

    if (item.status !== 'waiting' && item.status !== 'overdue') {
      setNotice('Only waiting tasks can be removed.');
      return;
    }

    setWaitingTaskToRemove(item);
  }

  function cancelRemoveWaitingTask() {
    setWaitingTaskToRemove(null);
  }

  async function confirmRemoveWaitingTask() {
    if (!waitingTaskToRemove) return;
    const itemId = getDetailItemId(waitingTaskToRemove);

    try {
      if (waitingTaskToRemove.schedule_item_id) {
        await plannerApi.updateScheduleItemStatus(waitingTaskToRemove.schedule_item_id, { status: 'removed' });
      } else if (waitingTaskToRemove.task_id) {
        await plannerApi.removeTask(waitingTaskToRemove.task_id);
      }
      await onDataRefresh?.();
    } catch (error) {
      setNotice(error.message);
      return;
    }

    setDetailItems((currentItems) => currentItems.filter((detailItem) => getDetailItemId(detailItem) !== itemId));
    setActiveTaskUi((current) => {
      const next = { ...current };
      delete next[itemId];
      return next;
    });
    setWaitingTaskToRemove(null);
    onTaskStatusChange?.(waitingTaskToRemove.task_id, {
      status: 'removed',
      is_completed: false,
      removed_at: new Date().toISOString()
    });
    setNotice('Waiting task removed.');
  }

  function applyScheduleItemResult(result) {
    if (!result?.items) return;
    const nextItems = initializeDailyDetailItems({
      day,
      schedule,
      items: result.items,
      tasks
    });
    setDetailItems(nextItems);
    setActiveTaskUi((current) => ({
      ...current,
      ...buildActiveTaskUiFromItems(nextItems)
    }));
  }

  return (
    <section className={`daily-details-page ${isReviewMode ? 'review-mode' : ''}`}>
      <div className="daily-details-hero">
        <div>
          <p className="eyebrow">Daily Details</p>
          <h1>{formatSelectedDayHeading(day)}</h1>
          <span>View and manage the generated plan for this day.</span>
        </div>
        <button className="text-action compact" type="button" onClick={onWeekly}>
          <ArrowLeft size={16} />
          {overviewBackLabel}
        </button>
      </div>

      {isReviewMode ? (
        <div className="review-mode-banner">
          <Lock size={18} />
          <div>
            <strong>Review Mode — This day has already ended.</strong>
            <span>You can view history, evaluations, feedback, resources, and details. Active task management is disabled.</span>
          </div>
        </div>
      ) : null}

      {notice ? <p className="daily-notice">{notice}</p> : null}

      <div className="daily-details-grid">
        <section className="daily-details-card waiting-card">
          <DailyDetailsCardHeader icon={ListChecks} eyebrow="Planned" title="Waiting Tasks" />
          {details.waitingTasks.length === 0 ? (
            <p className="no-results">No waiting tasks yet</p>
          ) : (
            <div className="detail-task-list">
              {details.waitingTasks.map((item) => (
                <DailyDetailTaskCard
                  item={item}
                  key={getDetailItemId(item)}
                  mode="waiting"
                  isEditing={editingItemId === getDetailItemId(item)}
                  editDraft={editDraft}
                  onEditDraftChange={(updates) => setEditDraft((current) => ({ ...(current || {}), ...updates }))}
                  onEdit={beginEdit}
                  onSaveEdit={saveEdit}
                  onCancelEdit={cancelEdit}
                  onStart={startTask}
                  onRemove={requestRemoveWaitingTask}
                  isReviewMode={isReviewMode}
                />
              ))}
            </div>
          )}
        </section>

        <section className="daily-details-card progress-card">
          <DailyDetailsCardHeader icon={PlayCircle} eyebrow="Current" title="Task In Progress" />
          {details.currentTask ? (
            <InProgressTaskCard
              item={details.currentTask}
              uiState={activeTaskUi[getDetailItemId(details.currentTask)] || buildActiveTaskUiState(details.currentTask)}
              onToggleSubtask={toggleSubtask}
              onUiChange={updateActiveTaskUi}
              onAddResource={addTaskResource}
              onAddImageResource={addImageResourceFromFile}
              onRemoveResource={removeTaskResource}
              onOpenFeedback={openFeedbackPopup}
              onFinish={finishTask}
              onReturn={returnToWaiting}
              isReviewMode={isReviewMode}
            />
          ) : (
            <p className="no-results">No task in progress</p>
          )}
        </section>

        <section className="daily-details-card completed-card">
          <DailyDetailsCardHeader icon={CheckCircle2} eyebrow="Done" title="Completed Tasks" />
          {details.completedTasks.length === 0 ? (
            <p className="no-results">No completed tasks yet</p>
          ) : (
            <>
              <div className="completed-task-list">
                {details.completedTasks.map((item) => (
                  <CompletedTaskCard
                    item={item}
                    key={getDetailItemId(item)}
                    isRestoreOpen={restoreMenuItemId === getDetailItemId(item)}
                    onOpen={() => setSelectedCompletedItemId(getDetailItemId(item))}
                    onToggleRestore={() => toggleRestoreMenu(item)}
                    onRestore={(targetStatus) => restoreCompletedTask(item, targetStatus)}
                    isReviewMode={isReviewMode}
                  />
                ))}
              </div>
              <DailyEvaluationCard evaluation={dailyEvaluation} />
            </>
          )}
        </section>

        <section className="daily-details-card timeline-card">
          <DailyDetailsCardHeader icon={Clock3} eyebrow="Overview" title="Daily Timeline" />
          {details.timeline.length === 0 ? (
            <p className="no-results">No timeline yet</p>
          ) : (
            <div className="timeline-list">
              {details.timeline.map((item) => (
                <article className={`timeline-row ${isBreakScheduleItem(item) ? 'break' : item.status}`} key={getDetailItemId(item)}>
                  <time>{item.is_deadline_continuation ? 'Flexible' : formatTimeRange(item.start_time, item.end_time)}</time>
                  <div>
                    <strong>{isBreakScheduleItem(item) ? 'Break' : item.title}</strong>
                    <span>{isBreakScheduleItem(item) ? item.reason || 'Short recovery break' : item.reason || 'Planned schedule block'}</span>
                    {item.deadline_label ? <small>{item.deadline_label} - {item.deadline_detail}</small> : null}
                    <em>{isBreakScheduleItem(item) ? 'Break' : formatTaskStatus(item.status)}</em>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="daily-details-card advice-card">
          <DailyDetailsCardHeader icon={Sparkles} eyebrow="Smart Notes" title="AI Notes & Advice" />
          {adviceNotes.length === 0 ? (
            <p className="no-results">No advice yet</p>
          ) : (
            <div className="advice-list">
              {adviceNotes.map((note) => (
                <article key={note}>{note}</article>
              ))}
            </div>
          )}
        </section>
      </div>

      {feedbackTask ? (
        <TaskFeedbackModal
          item={feedbackTask}
          draft={currentTaskUi.feedbackDraft}
          onChange={(updates) => updateFeedbackDraft(feedbackTask, updates)}
          onClose={() => closeFeedbackPopup(feedbackTask)}
          onSubmit={() => submitProgressFeedback(feedbackTask)}
        />
      ) : null}

      {completedDetailsTask ? (
        <CompletedTaskDetailsModal
          item={completedDetailsTask}
          uiState={buildCompletedTaskUiState(completedDetailsTask, activeTaskUi)}
          onClose={() => setSelectedCompletedItemId(null)}
        />
      ) : null}

      {waitingTaskToRemove ? (
        <RemoveWaitingTaskModal
          item={waitingTaskToRemove}
          onCancel={cancelRemoveWaitingTask}
          onConfirm={confirmRemoveWaitingTask}
        />
      ) : null}

      {!isReviewMode ? (
        <button className="secondary-action details-back-action" type="button" onClick={onBack}>
          <ArrowLeft size={18} />
          Back to selected day input
        </button>
      ) : null}
    </section>
  );
}

function AddedTasksPreview({ tasks, onEdit, onDelete }) {
  return (
    <section className="added-tasks-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Preview</p>
          <h2>Added Tasks</h2>
        </div>
        <span className="soft-pill">{tasks.length} added</span>
      </div>

      {tasks.length === 0 ? (
        <p className="empty-state">Please add at least one task before generating the schedule.</p>
      ) : (
        <div className="added-task-list">
          {tasks.map((task) => (
            <article className="added-task-card" key={getPreviewTaskId(task)}>
              <div>
                <strong>{task.title}</strong>
                <span>{task.is_fixed_time ? 'Fixed-time task' : 'Flexible task'}</span>
              </div>
              <div className="chip-line">
                <span>{task.estimated_duration_minutes}m</span>
                <span>Priority {task.priority_level}</span>
                <span>Difficulty {task.difficulty_level}</span>
                {task.is_fixed_time ? <span>{task.fixed_start_time} - {task.fixed_end_time}</span> : null}
              </div>
              <div className="added-task-actions">
                <button type="button" onClick={() => onEdit(task)}>
                  <Pencil size={15} />
                  Edit
                </button>
                <button className="delete" type="button" onClick={() => onDelete(getPreviewTaskId(task))}>
                  <Trash2 size={15} />
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function DailyDetailsCardHeader({ icon: Icon, eyebrow, title }) {
  return (
    <div className="daily-details-card-head">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      <Icon size={26} />
    </div>
  );
}

function CompletedTaskCard({ item, isRestoreOpen, onOpen, onToggleRestore, onRestore, isReviewMode }) {
  const evaluation = buildCompletedTaskEvaluation(item);

  return (
    <article className="completed-task-card">
      <button className="completed-task-open" type="button" onClick={onOpen}>
        <div className="completed-task-main">
          <div>
            <strong>{item.title}</strong>
            <span>{formatTimeRange(item.start_time, item.end_time)}</span>
          </div>
          <em>Completed</em>
        </div>
        <div className="completed-task-stats">
          <span><strong>Planned</strong>{evaluation.plannedLabel}</span>
          <span><strong>Actual</strong>{evaluation.actualLabel}</span>
          <span><strong>Completed</strong>{formatTime(item.completed_at || item.end_time)}</span>
        </div>
        <p className={`task-evaluation-message ${evaluation.tone}`}>{evaluation.message}</p>
      </button>

      <div className="restore-task-area">
        {isReviewMode ? (
          <span className="restore-readonly">
            <Lock size={13} />
            Read-only
          </span>
        ) : (
          <button className="restore-task-button" type="button" onClick={onToggleRestore}>
            <RefreshCw size={14} />
            Restore Task
          </button>
        )}
        {isRestoreOpen && !isReviewMode ? (
          <div className="restore-task-menu">
            <button type="button" onClick={() => onRestore?.('in_progress')}>
              Return to In Progress
            </button>
            <button type="button" onClick={() => onRestore?.('waiting')}>
              Return to Waiting
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function DailyEvaluationCard({ evaluation }) {
  const scoreTone = getProductivityScoreTone(evaluation.productivityScore);

  return (
    <section className="daily-evaluation-card">
      <div className="mini-section-head">
        <div>
          <h4>Daily Evaluation</h4>
          <span>Overall result for the selected day.</span>
        </div>
      </div>

      <div className="daily-evaluation-body">
        <div
          className={`productivity-score-circle ${scoreTone}`}
          style={{ '--score': `${evaluation.productivityScore}%` }}>
          <div>
            <strong>{evaluation.productivityScore}%</strong>
            <span>Productivity</span>
          </div>
        </div>

        <div className="daily-evaluation-summary">
          <span><strong>{evaluation.completedTasks} / {evaluation.totalTasks}</strong>Completed tasks</span>
          <span><strong>{evaluation.completionPercentage}%</strong>Completion</span>
          <p>{evaluation.message}</p>
        </div>
      </div>
    </section>
  );
}

function InProgressTaskCard({
  item,
  uiState,
  onToggleSubtask,
  onUiChange,
  onAddResource,
  onAddImageResource,
  onRemoveResource,
  onOpenFeedback,
  onFinish,
  onReturn,
  isReviewMode = false
}) {
  const completedSubtasks = uiState.subtasks.filter((subtask) => subtask.completed).length;
  const totalSubtasks = uiState.subtasks.length || 1;
  const progress = Math.round((completedSubtasks / totalSubtasks) * 100);
  const readyToFinish = progress === 100;

  return (
    <article className={`in-progress-task-card ${isReviewMode ? 'read-only-card' : ''}`}>
      <div className="active-task-main">
        <div>
          <p className="eyebrow">Active Task</p>
          <h3>{item.title}</h3>
          <span>{formatTimeRange(item.start_time, item.end_time)}</span>
        </div>
        <strong className="status-badge">In Progress</strong>
      </div>

      <div className="active-task-facts">
        <span><strong>Duration</strong>{formatDuration(item.start_time, item.end_time)}</span>
        <span><strong>Type</strong>{formatTaskKind(item.task_kind)}</span>
        <span><strong>Difficulty</strong>{difficultyLabel(item.difficulty_level || item.task?.difficulty_level)}</span>
        <span><strong>Priority</strong>{priorityLabel(item.task?.priority_level || item.priority_level)}</span>
      </div>

      <section className="task-breakdown-box">
        <div className="mini-section-head">
          <div>
            <h4>Task Breakdown</h4>
            <span>Small steps for the current task.</span>
          </div>
          <strong>{progress}%</strong>
        </div>
        <div className="active-progress">
          <i style={{ width: `${progress}%` }}></i>
        </div>
        <p className="progress-copy">Progress: {progress}% - {completedSubtasks}/{uiState.subtasks.length} completed</p>
        <div className="subtask-list">
          {uiState.subtasks.length === 0 ? (
            <span className="subtask-row">Generating task breakdown...</span>
          ) : uiState.subtasks.map((subtask) => (
            <label className="subtask-row" key={subtask.id}>
              <input
                type="checkbox"
                checked={subtask.completed}
                disabled={isReviewMode}
                onChange={() => onToggleSubtask(item, subtask.id)}
              />
              <span>{subtask.title}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="task-resources-box">
        <div className="mini-section-head">
          <div>
            <h4>Task Resources</h4>
            <span>Add quick resources for this task.</span>
          </div>
        </div>
        {!isReviewMode ? (
          <div className="resource-input-grid">
            <div className="image-upload-control">
              <span>Add image</span>
              <label className="image-upload-button">
                Choose image from computer
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    onAddImageResource?.(item, event.target.files?.[0]);
                    event.target.value = '';
                  }}
                />
              </label>
              <div className="inline-add-control">
                <input
                  placeholder="Image URL from internet"
                  value={uiState.imageDraft}
                  onChange={(event) => onUiChange(item, { imageDraft: event.target.value })}
                />
                <button type="button" onClick={() => onAddResource(item, 'image', uiState.imageDraft)}>Add</button>
              </div>
            </div>
            <label>
              Add link
              <div className="inline-add-control">
                <input
                  placeholder="https://..."
                  value={uiState.linkDraft}
                  onChange={(event) => onUiChange(item, { linkDraft: event.target.value })}
                />
                <button type="button" onClick={() => onAddResource(item, 'link', uiState.linkDraft)}>Add</button>
              </div>
            </label>
          </div>
        ) : (
          <p className="resource-empty">Resources are read-only in Review Mode.</p>
        )}
        {uiState.resources.length === 0 ? (
          <p className="resource-empty">No resources added yet.</p>
        ) : (
          <div className="resource-chip-list">
            {uiState.resources.map((resource) => (
              <ResourceChip
                key={resource.id}
                resource={resource}
                onRemove={isReviewMode ? null : () => onRemoveResource?.(item, resource.id)}
              />
            ))}
          </div>
        )}
      </section>

      <div className="detail-task-actions active-actions">
        <button type="button" onClick={() => onOpenFeedback?.(item)} disabled={isReviewMode}>
          Feedback
        </button>
        <button className={readyToFinish ? 'finish-ready' : ''} type="button" onClick={() => onFinish?.(item)} disabled={isReviewMode}>
          <CheckCircle2 size={15} />
          Finish Task
        </button>
        <button className="secondary" type="button" onClick={() => onReturn?.(item)} disabled={isReviewMode}>
          <ArrowLeft size={15} />
          Return to Waiting
        </button>
      </div>

      {readyToFinish ? (
        <p className="ready-to-finish">All subtasks are complete. This task is ready to finish.</p>
      ) : null}
    </article>
  );
}

function ResourceChip({ resource, onRemove }) {
  const chipContent = (
    <>
      {resource.type === 'image' && resource.preview ? (
        <img src={resource.preview} alt={resource.label} />
      ) : null}
      <span>
        <strong>{resource.type === 'image' ? 'Image' : 'Link'}</strong>
        {resource.label}
      </span>
    </>
  );

  return (
    <span className={`resource-chip ${resource.type} ${onRemove ? '' : 'readonly'}`}>
      {resource.type === 'link' ? (
        <a href={resource.value} target="_blank" rel="noreferrer">
          {chipContent}
        </a>
      ) : (
        chipContent
      )}
      {onRemove ? (
        <button type="button" aria-label={`Remove ${resource.label}`} onClick={onRemove}>
          x
        </button>
      ) : null}
    </span>
  );
}

function CompletedTaskDetailsModal({ item, uiState, onClose }) {
  const evaluation = buildCompletedTaskEvaluation(item);
  const completedSubtasks = uiState.subtasks.filter((subtask) => subtask.completed).length;
  const totalSubtasks = uiState.subtasks.length || 1;
  const progress = Math.round((completedSubtasks / totalSubtasks) * 100);
  const feedback = uiState.lastFeedback;
  const deadline = item.task?.deadline || item.deadline;

  return (
    <div className="feedback-modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="feedback-modal-card completed-details-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="completed-task-details-title"
        onClick={(event) => event.stopPropagation()}>
        <div className="feedback-modal-head">
          <div>
            <p className="eyebrow">Read-only summary</p>
            <h2 id="completed-task-details-title">Completed Task Details</h2>
            <span>{item.title}</span>
          </div>
          <button className="modal-close-button" type="button" aria-label="Close completed task details" onClick={onClose}>
            x
          </button>
        </div>

        <div className="completed-details-grid">
          <span><strong>Task type</strong>{formatTaskKind(item.task_kind)}</span>
          <span><strong>Category</strong>{item.task?.category || item.category || 'General'}</span>
          <span><strong>Priority</strong>{priorityLabel(item.task?.priority_level || item.priority_level)}</span>
          <span><strong>Difficulty</strong>{difficultyLabel(item.difficulty_level || item.task?.difficulty_level)}</span>
          <span><strong>Planned start</strong>{formatTime(item.start_time)}</span>
          <span><strong>Planned end</strong>{formatTime(item.end_time)}</span>
          <span><strong>Actual start</strong>{formatDateTime(item.actual_started_at || item.started_at || item.start_time)}</span>
          <span><strong>Actual end</strong>{formatDateTime(item.actual_completed_at || item.completed_at || item.end_time)}</span>
          <span><strong>Planned duration</strong>{evaluation.plannedLabel}</span>
          <span><strong>Actual duration</strong>{evaluation.actualLabel}</span>
          <span><strong>Completion time</strong>{formatDateTime(item.actual_completed_at || item.completed_at || item.end_time)}</span>
          <span><strong>Deadline</strong>{deadline ? formatDateTime(deadline) : 'No deadline'}</span>
          <span><strong>Progress</strong>{progress}%</span>
        </div>

        <section className="completed-details-section">
          <div className="mini-section-head">
            <div>
              <h4>Task Breakdown</h4>
              <span>{completedSubtasks}/{totalSubtasks} completed</span>
            </div>
          </div>
          <div className="completed-check-list">
            {uiState.subtasks.map((subtask) => (
              <span key={subtask.id}>Done - {subtask.title}</span>
            ))}
          </div>
        </section>

        <section className="completed-details-section">
          <div className="mini-section-head">
            <div>
              <h4>Resources</h4>
              <span>Attached images and links</span>
            </div>
          </div>
          {uiState.resources.length === 0 ? (
            <p className="resource-empty">No resources were attached to this task.</p>
          ) : (
            <div className="resource-chip-list">
              {uiState.resources.map((resource) => (
                <ResourceChip key={resource.id} resource={resource} />
              ))}
            </div>
          )}
        </section>

        <section className="completed-details-section">
          <div className="mini-section-head">
            <div>
              <h4>User Feedback</h4>
              <span>Submitted after working on the task</span>
            </div>
          </div>
          {feedback ? (
            <div className="completed-feedback-grid">
              <span><strong>Result</strong>{feedback.outcome === 'completed' ? 'Completed' : formatTaskStatus(feedback.outcome)}</span>
              <span><strong>Difficulty</strong>{feedback.difficulty_feedback || '-'}</span>
              <span><strong>Energy</strong>{feedback.energy_after || '-'}</span>
              <span><strong>Mood</strong>{feedback.mood_after || '-'}</span>
              <p>{feedback.comment || 'No comment was added.'}</p>
            </div>
          ) : (
            <p className="resource-empty">No feedback was submitted for this task yet.</p>
          )}
        </section>

        <p className={`task-evaluation-message ${evaluation.tone}`}>{evaluation.message}</p>
      </section>
    </div>
  );
}

function RemoveWaitingTaskModal({ item, onCancel, onConfirm }) {
  return (
    <div className="feedback-modal-backdrop" role="presentation" onClick={onCancel}>
      <section
        className="feedback-modal-card confirm-remove-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-waiting-task-title"
        onClick={(event) => event.stopPropagation()}>
        <div className="feedback-modal-head">
          <div>
            <p className="eyebrow">Remove waiting task</p>
            <h2 id="remove-waiting-task-title">Are you sure?</h2>
            <span>{item.title}</span>
          </div>
          <button className="modal-close-button" type="button" aria-label="Cancel remove task" onClick={onCancel}>
            x
          </button>
        </div>

        <p className="confirm-remove-copy">Are you sure you want to remove this task?</p>

        <div className="feedback-modal-actions">
          <button className="secondary-action" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="remove-confirm-button" type="button" onClick={onConfirm}>
            <Trash2 size={16} />
            Remove
          </button>
        </div>
      </section>
    </div>
  );
}

function TaskFeedbackModal({ item, draft, onChange, onClose, onSubmit }) {
  return (
    <div className="feedback-modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="feedback-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-feedback-title"
        onClick={(event) => event.stopPropagation()}>
        <div className="feedback-modal-head">
          <div>
            <p className="eyebrow">Focused update</p>
            <h2 id="task-feedback-title">Task Feedback</h2>
            <span>{item.title}</span>
          </div>
          <button className="modal-close-button" type="button" aria-label="Close feedback" onClick={onClose}>
            x
          </button>
        </div>

        <form
          className="feedback-modal-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit?.();
          }}>
          <label>
            Task completed?
            <select value={draft.outcome} onChange={(event) => onChange({ outcome: event.target.value })}>
              <option value="completed">Yes - move to Completed Tasks</option>
              <option value="in_progress">No - keep in progress</option>
              <option value="waiting">No - return to Waiting Tasks</option>
            </select>
          </label>

          <div className="feedback-grid">
            <label>
              Difficulty feedback
              <select value={draft.difficulty_feedback} onChange={(event) => onChange({ difficulty_feedback: event.target.value })}>
                <option value="">Choose level</option>
                <option value="1">1 - very easy</option>
                <option value="2">2 - easy</option>
                <option value="3">3 - medium</option>
                <option value="4">4 - hard</option>
                <option value="5">5 - very hard</option>
              </select>
            </label>
            <label>
              Current energy level
              <select value={draft.energy_after} onChange={(event) => onChange({ energy_after: event.target.value })}>
                <option value="">Choose energy</option>
                <option value="1">1 - very low</option>
                <option value="2">2 - low</option>
                <option value="3">3 - medium</option>
                <option value="4">4 - good</option>
                <option value="5">5 - high</option>
              </select>
            </label>
            <label>
              Current mood
              <select value={draft.mood_after} onChange={(event) => onChange({ mood_after: event.target.value })}>
                <option value="">Choose mood</option>
                <option value="1">1 - very low</option>
                <option value="2">2 - low</option>
                <option value="3">3 - neutral</option>
                <option value="4">4 - good</option>
                <option value="5">5 - great</option>
              </select>
            </label>
          </div>

          <label>
            Optional comment
            <textarea
              placeholder="Write a short note about how the task went..."
              value={draft.comment}
              onChange={(event) => onChange({ comment: event.target.value })}
            />
          </label>

          <div className="feedback-modal-actions">
            <button className="secondary-action" type="button" onClick={onClose}>
              Close
            </button>
            <button className="primary-action" type="submit">
              Submit Feedback
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function DailyDetailTaskCard({
  item,
  mode = 'readonly',
  showProgress = false,
  completed = false,
  isEditing = false,
  editDraft,
  onEditDraftChange,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  onStart,
  onFinish,
  onReturn,
  onRemove,
  isReviewMode = false
}) {
  const isBreak = isBreakScheduleItem(item);
  const isFixed = item.task_kind === 'fixed';
  const deadlineTone = item.deadline_tone ? `deadline-${item.deadline_tone}` : '';
  const statusTone = item.status === 'overdue' ? 'overdue' : '';

  return (
    <article className={`detail-task-card ${completed ? 'completed' : ''} ${deadlineTone} ${statusTone} ${isBreak ? 'break-card' : ''}`}>
      {isEditing && !isBreak ? (
        <DailyTaskEditForm
          draft={editDraft}
          onChange={onEditDraftChange}
          onSave={() => onSaveEdit?.(item)}
          onCancel={onCancelEdit}
        />
      ) : (
        <>
          <div>
            <strong>{isBreak ? 'Break' : item.title}</strong>
            <span>{isBreak ? 'Short recovery break' : item.is_deadline_continuation ? 'Flexible deadline task' : formatTimeRange(item.start_time, item.end_time)}</span>
          </div>
          <div className="chip-line">
            {isBreak ? (
              <>
                <span>break</span>
                <span>Timeline only</span>
              </>
            ) : (
              <>
                <span>{isFixed ? 'fixed-time' : 'flexible'}</span>
                <span>Difficulty {item.difficulty_level || item.task?.difficulty_level || 3}</span>
                <span>Priority {item.task?.priority_level || item.priority_level || 3}</span>
                <span>{formatTaskStatus(item.status)}</span>
              </>
            )}
          </div>
          {item.deadline_label ? (
            <div className={`deadline-reminder ${item.deadline_tone || ''}`}>
              <strong>{item.deadline_label}</strong>
              <span>{item.deadline_detail}</span>
            </div>
          ) : null}
          {showProgress ? (
            <div className="task-progress-line">
              <i style={{ width: `${item.progress || 45}%` }}></i>
            </div>
          ) : null}
          {mode === 'waiting' && isReviewMode && !isBreak ? (
            <span className="restore-readonly inline-readonly">
              <Lock size={13} />
              Read-only history
            </span>
          ) : null}
          {mode === 'waiting' && !isReviewMode && !isBreak ? (
            <div className="detail-task-actions">
              <button type="button" onClick={() => onEdit?.(item)}>
                <Pencil size={15} />
                Edit
              </button>
              <button type="button" onClick={() => onStart?.(item)}>
                <PlayCircle size={15} />
                {isFixed ? 'Auto Start' : 'Start'}
              </button>
              <button className="danger-soft" type="button" onClick={() => onRemove?.(item)}>
                <Trash2 size={15} />
                Remove Task
              </button>
            </div>
          ) : null}
          {mode === 'progress' && !isReviewMode && !isBreak ? (
            <div className="detail-task-actions">
              <button type="button" onClick={() => onFinish?.(item)}>
                <CheckCircle2 size={15} />
                Finish
              </button>
              <button className="secondary" type="button" onClick={() => onReturn?.(item)}>
                <ArrowLeft size={15} />
                Return to Waiting
              </button>
            </div>
          ) : null}
        </>
      )}
      {completed ? <em>Completed</em> : null}
    </article>
  );
}

function DailyTaskEditForm({ draft, onChange, onSave, onCancel }) {
  if (!draft) return null;

  return (
    <form
      className="daily-task-edit-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSave?.();
      }}>
      <label>
        Task title
        <input value={draft.title} onChange={(event) => onChange?.({ title: event.target.value })} />
      </label>
      <div className="field-grid two">
        <label>
          Priority
          <select value={draft.priority_level} onChange={(event) => onChange?.({ priority_level: event.target.value })}>
            <option value="5">Very high</option>
            <option value="4">High</option>
            <option value="3">Medium</option>
            <option value="2">Low</option>
            <option value="1">Very low</option>
          </select>
        </label>
        <label>
          Difficulty
          <select value={draft.difficulty_level} onChange={(event) => onChange?.({ difficulty_level: event.target.value })}>
            <option value="5">Very hard</option>
            <option value="4">Hard</option>
            <option value="3">Medium</option>
            <option value="2">Easy</option>
            <option value="1">Very easy</option>
          </select>
        </label>
      </div>
      <div className="field-grid two">
        <label>
          Start
          <input type="time" value={draft.start_time} onChange={(event) => onChange?.({ start_time: event.target.value })} />
        </label>
        <label>
          End
          <input type="time" value={draft.end_time} onChange={(event) => onChange?.({ end_time: event.target.value })} />
        </label>
      </div>
      <div className="detail-task-actions">
        <button type="submit">
          <CheckCircle2 size={15} />
          Update
        </button>
        <button className="secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function RegistrationScreen({ onRegister, onExistingAccount }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({
    ...defaultLocalUser,
    password: mode === 'login' ? 'demo123' : ''
  });
  const [authMessage, setAuthMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setAuthMessage('');
    setIsSubmitting(true);
    try {
      if (mode === 'login') {
        await onExistingAccount(form);
      } else {
        await onRegister(form);
      }
    } catch (error) {
      setAuthMessage(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setAuthMessage('');
    setForm((current) => ({
      ...current,
      password: nextMode === 'login' ? current.password || 'demo123' : ''
    }));
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
          <h1>{mode === 'login' ? 'Log in to Smart Planner' : 'Create your Smart Planner account'}</h1>
          <p>
            Your planner data is loaded from MySQL by user account, including preferences, tasks, schedules, and feedback.
          </p>
          <div className="period-switch auth-switch" aria-label="Authentication mode">
            <button className={mode === 'login' ? 'active' : ''} type="button" onClick={() => switchMode('login')}>
              Login
            </button>
            <button className={mode === 'register' ? 'active' : ''} type="button" onClick={() => switchMode('register')}>
              Register
            </button>
          </div>
          <form className="form-stack" onSubmit={submit}>
            {authMessage ? <p className="form-validation">{authMessage}</p> : null}

            {mode === 'register' ? (
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
            ) : null}
            <label>
              Email
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                minLength={6}
                required
              />
            </label>
            {mode === 'register' ? (
              <ProfileImageField
                value={form.profile_image}
                onChange={(profileImage) => setForm({ ...form, profile_image: profileImage })}
              />
            ) : null}
            <button className="primary-action" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Please wait...' : mode === 'login' ? 'Login and open planner' : 'Register and open planner'}
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

function readPlannerSettings() {
  return defaultSettings;
}

function readStoredList(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(saved) ? saved.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function updateStoredList(key, setter, updater) {
  setter((current) => {
    const next = updater(current);
    localStorage.setItem(key, JSON.stringify(next));
    return next;
  });
}

function mergeSettings(base, updates) {
  return Object.fromEntries(
    Object.entries(base).map(([section, values]) => [
      section,
      {
        ...values,
        ...(updates?.[section] || {})
      }
    ])
  );
}

function preferencesToSettings(preferences, currentSettings = defaultSettings, user) {
  if (!preferences) return mergeSettingsWithUser(currentSettings, user);
  const savedSettings = typeof preferences.settings_json === 'string'
    ? safeParseJson(preferences.settings_json)
    : preferences.settings_json;
  const merged = mergeSettings(defaultSettings, mergeSettings(currentSettings, savedSettings || {}));
  return mergeSettingsWithUser({
    ...merged,
    schedule: {
      ...merged.schedule,
      wake_up_time: formatTimeInput(preferences.wake_up_time) || merged.schedule.wake_up_time,
      sleep_time: formatTimeInput(preferences.sleep_time) || merged.schedule.sleep_time,
      work_start: formatTimeInput(preferences.preferred_start_time) || merged.schedule.work_start,
      work_end: formatTimeInput(preferences.preferred_end_time) || merged.schedule.work_end,
      break_duration: preferences.break_duration_minutes || merged.schedule.break_duration,
      focus_length: preferences.focus_session_minutes || merged.schedule.focus_length
    },
    notifications: {
      ...merged.notifications,
      task_reminders: Boolean(preferences.notifications_enabled)
    },
    ai: {
      ...merged.ai,
      recommendations: Boolean(preferences.ai_recommendations_enabled)
    },
    appearance: {
      ...merged.appearance,
      theme: preferences.theme || merged.appearance.theme
    },
    system: {
      ...merged.system,
      language: preferences.language || merged.system.language
    }
  }, user);
}

function mergeSettingsWithUser(settings, user) {
  const merged = mergeSettings(defaultSettings, settings);
  return {
    ...merged,
    profile: {
      ...merged.profile,
      display_name: merged.profile.display_name || user?.full_name || defaultLocalUser.first_name + ' ' + defaultLocalUser.last_name,
      email: merged.profile.email || user?.email || defaultLocalUser.email,
      profile_image: merged.profile.profile_image || user?.profile_image || ''
    }
  };
}

function buildProfileFromSettings(profile, user) {
  const displayName = profile.display_name?.trim() || user?.full_name || defaultLocalUser.first_name + ' ' + defaultLocalUser.last_name;
  const [firstName, ...lastNameParts] = displayName.split(/\s+/);
  return {
    user_id: user?.user_id || defaultLocalUser.user_id,
    first_name: firstName || defaultLocalUser.first_name,
    last_name: lastNameParts.join(' ') || user?.last_name || defaultLocalUser.last_name,
    full_name: displayName,
    email: profile.email || user?.email || defaultLocalUser.email,
    profile_image: profile.profile_image || user?.profile_image || ''
  };
}

function normalizeAuthUser(user) {
  const fullName = user?.full_name || defaultLocalUser.full_name;
  const [firstName, ...lastNameParts] = fullName.split(/\s+/);
  return {
    user_id: user?.user_id || defaultLocalUser.user_id,
    first_name: firstName || defaultLocalUser.first_name,
    last_name: lastNameParts.join(' ') || defaultLocalUser.last_name,
    full_name: fullName,
    email: user?.email || defaultLocalUser.email,
    profile_image: user?.profile_image || ''
  };
}

function buildProfileUser(localUser, serverUser) {
  const fullName = localUser
    ? localUser.full_name || `${localUser.first_name} ${localUser.last_name}`
    : serverUser?.full_name || defaultLocalUser.first_name + ' ' + defaultLocalUser.last_name;

  return {
    ...serverUser,
    user_id: localUser?.user_id || serverUser?.user_id || defaultLocalUser.user_id,
    first_name: localUser?.first_name || fullName.split(' ')[0],
    last_name: localUser?.last_name || fullName.split(' ').slice(1).join(' '),
    full_name: fullName,
    email: localUser?.email || serverUser?.email || defaultLocalUser.email,
    profile_image: localUser?.profile_image || ''
  };
}

function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function formatTimeInput(value) {
  return value ? String(value).slice(0, 5) : '';
}

function buildNotifications({
  tasks = [],
  schedule,
  scheduleItems = [],
  latestLog,
  dailyLogs = [],
  readIds = [],
  removedIds = []
}) {
  const readSet = new Set(readIds);
  const removedSet = new Set(removedIds);
  const todayKey = toDateKey(new Date());
  const taskById = new Map(tasks.map((task) => [task.task_id, task]));
  const notifications = [];

  scheduleItems.forEach((item) => {
    const task = taskById.get(item.task_id);
    if (!task || isTaskCompleted(task) || isTaskArchived(task)) return;

    const endDate = new Date(item.end_time);
    const dayKey = datePart(item.start_time) || datePart(schedule?.schedule_date) || datePart(task.task_date) || todayKey;
    if (!isValidDate(endDate) || endDate > new Date() || item.status === 'completed') return;

    notifications.push(createNotification({
      id: `task-feedback-${item.schedule_item_id || task.task_id}`,
      type: 'task',
      tone: 'feedback',
      title: 'Feedback needed',
      message: `${task.title} needs feedback from its planned session.`,
      taskTitle: task.title,
      createdAt: item.end_time,
      actionLabel: 'Open task',
      action: { type: 'day', dayKey }
    }, readSet));
  });

  tasks.forEach((task) => {
    if (!task || isTaskCompleted(task) || isTaskArchived(task)) return;

    const dayKey = datePart(task.task_date) || datePart(task.fixed_date) || todayKey;
    const deadlineState = getDeadlineState(task, todayKey);
    const status = String(task.status || '').toLowerCase();
    const wasUpdatedAfterCreation = Boolean(task.updated_at && task.created_at && task.updated_at !== task.created_at);
    const base = {
      type: 'task',
      taskTitle: task.title,
      createdAt: task.updated_at || task.created_at || task.deadline || new Date().toISOString(),
      actionLabel: 'Open day',
      action: { type: 'day', dayKey }
    };

    if (deadlineState.tone === 'overdue') {
      notifications.push(createNotification({
        ...base,
        id: `task-overdue-${task.task_id}`,
        tone: 'overdue',
        title: 'Overdue task',
        message: `${task.title} is overdue. Deadline has passed.`
      }, readSet));
      return;
    }

    if (['due', 'close', 'warning'].includes(deadlineState.tone)) {
      notifications.push(createNotification({
        ...base,
        id: `task-deadline-${task.task_id}`,
        tone: 'deadline',
        title: 'Close deadline',
        message: `${task.title} is still unfinished. ${formatDeadlineNotificationMessage(deadlineState)}`
      }, readSet));
      return;
    }

    if (status === 'in_progress' || status === 'active') {
      notifications.push(createNotification({
        ...base,
        id: `task-active-feedback-${task.task_id}`,
        tone: 'feedback',
        title: 'Feedback needed',
        message: `${task.title} is in progress. Add feedback when you finish or pause.`
      }, readSet));
      return;
    }

    if (status === 'pending' && wasUpdatedAfterCreation) {
      notifications.push(createNotification({
        ...base,
        id: `task-returned-${task.task_id}`,
        tone: 'waiting',
        title: 'Returned to waiting',
        message: `${task.title} was returned to Waiting Tasks.`
      }, readSet));
      return;
    }

    notifications.push(createNotification({
      ...base,
      id: `task-unfinished-${task.task_id}`,
      tone: 'task',
      title: 'Unfinished task',
      message: `${task.title} is still unfinished.`
    }, readSet));
  });

  if (schedule) {
    notifications.push(createNotification({
      id: `system-schedule-${schedule.schedule_id}`,
      type: 'system',
      tone: 'system',
      title: 'Schedule generated',
      message: `Schedule generated successfully for ${formatDateKeyLabel(datePart(schedule.schedule_date) || todayKey)}.`,
      createdAt: schedule.generated_at || new Date().toISOString(),
      actionLabel: 'View day',
      action: { type: 'day', dayKey: datePart(schedule.schedule_date) || todayKey }
    }, readSet));

    if (schedule.status === 'rescheduled') {
      notifications.push(createNotification({
        id: `system-rescheduled-${schedule.schedule_id}`,
        type: 'system',
        tone: 'system',
        title: 'Schedule updated',
        message: 'Schedule updated after feedback.',
        createdAt: schedule.generated_at || new Date().toISOString(),
        actionLabel: 'View day',
        action: { type: 'day', dayKey: datePart(schedule.schedule_date) || todayKey }
      }, readSet));
    }
  }

  if (latestLog || dailyLogs.length > 0 || tasks.length > 0) {
    notifications.push(createNotification({
      id: `system-ai-note-${latestLog?.log_id || todayKey}`,
      type: 'system',
      tone: 'system',
      title: 'AI note available',
      message: 'A smart note is available from your latest planner activity.',
      createdAt: latestLog?.created_at || latestLog?.log_date || new Date().toISOString(),
      actionLabel: 'Open AI Notes',
      action: { type: 'page', page: 'ai-notes' }
    }, readSet));
  }

  if (tasks.length > 0 || scheduleItems.length > 0 || dailyLogs.length > 0) {
    notifications.push(createNotification({
      id: `system-weekly-summary-${getWeekStartKey(todayKey)}`,
      type: 'system',
      tone: 'system',
      title: 'Weekly summary ready',
      message: 'Your weekly progress summary is ready.',
      createdAt: new Date().toISOString(),
      actionLabel: 'Open Progress',
      action: { type: 'page', page: 'progress' }
    }, readSet));
  }

  return notifications
    .filter((notification) => !removedSet.has(notification.id))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'unread' ? -1 : 1;
      return getNotificationTime(b.createdAt) - getNotificationTime(a.createdAt);
    });
}

function createNotification(notification, readSet) {
  return {
    ...notification,
    status: readSet.has(notification.id) ? 'read' : 'unread'
  };
}

function filterNotifications(notifications, activeFilter) {
  if (activeFilter === 'Unread') return notifications.filter((notification) => notification.status === 'unread');
  if (activeFilter === 'Tasks') return notifications.filter((notification) => notification.type === 'task');
  if (activeFilter === 'System') return notifications.filter((notification) => notification.type === 'system');
  if (activeFilter === 'Overdue') return notifications.filter((notification) => notification.tone === 'overdue');
  return notifications;
}

function getNotificationIcon(notification) {
  if (notification.tone === 'overdue') return AlertTriangle;
  if (notification.tone === 'deadline') return Clock3;
  if (notification.tone === 'feedback' || notification.tone === 'waiting') return RefreshCw;
  if (notification.type === 'task') return ListChecks;
  return Bell;
}

function formatDeadlineNotificationMessage(deadlineState) {
  if (deadlineState.tone === 'due') return 'Deadline is today.';
  if (deadlineState.tone === 'close') return 'Deadline is tomorrow.';
  return `${deadlineState.label}.`;
}

function formatNotificationTime(value) {
  const date = new Date(value);
  if (!isValidDate(date)) return 'Just now';

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function getNotificationTime(value) {
  const date = new Date(value);
  return isValidDate(date) ? date.getTime() : 0;
}

function buildNotificationDay(dayKey) {
  const date = new Date(`${dayKey}T00:00:00`);
  return {
    key: dayKey,
    date,
    dayName: new Intl.DateTimeFormat('en', { weekday: 'short' }).format(date),
    shortDate: formatDateKeyLabel(dayKey)
  };
}

function formatDateKeyLabel(dayKey) {
  if (!dayKey) return 'selected day';
  const [, month, day] = dayKey.split('-');
  return `${day}/${month}`;
}

function getWeekStartKey(dayKey) {
  const date = new Date(`${dayKey}T00:00:00`);
  if (!isValidDate(date)) return dayKey;
  date.setDate(date.getDate() - date.getDay());
  return toDateKey(date);
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

function getCurrentWeekDays(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay());
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return {
      date: day,
      key: toDateKey(day),
      dayName: new Intl.DateTimeFormat('en', { weekday: 'short' }).format(day),
      shortDate: `${String(day.getDate()).padStart(2, '0')}/${String(day.getMonth() + 1).padStart(2, '0')}`
    };
  });
}

function buildWeeklyDashboardData({ tasks = [], scheduleItems = [], latestLog, dailyLogs = [], dailyEvaluations = [], weekDays }) {
  const todayKey = toDateKey(new Date());
  const weekKeys = new Set(weekDays.map((day) => day.key));
  const tasksByDay = new Map(weekDays.map((day) => [day.key, []]));
  const scheduleDateByTask = new Map();

  scheduleItems.forEach((item) => {
    if (!item.task_id || !item.start_time) return;
    const key = toDateKey(new Date(item.start_time));
    if (weekKeys.has(key) && !scheduleDateByTask.has(item.task_id)) {
      scheduleDateByTask.set(item.task_id, key);
    }
  });

  tasks.forEach((task) => {
    if (isTaskArchived(task)) return;
    const key = getTaskWeekDateKey(task, scheduleDateByTask, weekKeys);
    if (key) {
      tasksByDay.get(key)?.push(task);
    }
  });

  const stressByDay = new Map();
  dailyLogs.forEach((log) => {
    const key = datePart(log.log_date || log.checkin_date);
    if (weekKeys.has(key)) {
      stressByDay.set(key, Number.parseInt(log.stress_level, 10) || 0);
    }
  });
  if (latestLog?.log_date && weekKeys.has(datePart(latestLog.log_date))) {
    stressByDay.set(datePart(latestLog.log_date), Number.parseInt(latestLog.stress_level, 10) || 0);
  }
  const evaluationByDay = new Map(dailyEvaluations.map((evaluation) => [
    datePart(evaluation.evaluation_date),
    evaluation
  ]));

  const isNewUser = tasks.length === 0 && scheduleItems.length === 0 && !latestLog;
  const days = weekDays.map((day) => {
    const dayTasks = tasksByDay.get(day.key) || [];
    const totalTasks = dayTasks.length;
    const completedTasks = dayTasks.filter(isTaskCompleted).length;
    const rawProgress = getCompletionPercentage(completedTasks, totalTasks);
    const isFuture = day.key > todayKey;
    const progressTone = getProgressTone(rawProgress, totalTasks, isFuture, isNewUser);

    return {
      ...day,
      isToday: day.key === todayKey,
      isFuture,
      totalTasks,
      completedTasks,
      progress: rawProgress,
      visualProgress: progressTone.visualProgress,
      color: progressTone.color,
      tone: progressTone.tone,
      label: getDayCircleLabel({ isNewUser, isFuture, totalTasks, rawProgress }),
      stressLevel: stressByDay.get(day.key) || 0
    };
  });

  const weeklyTasks = [...tasksByDay.entries()].flatMap(([dayKey, dayTasks]) => {
    const day = days.find((item) => item.key === dayKey);
    return dayTasks.map((task) => ({ task, day }));
  });
  const completed = weeklyTasks.filter(({ task }) => isTaskCompleted(task)).length;
  const unfinished = weeklyTasks.length - completed;
  const weekEvaluations = [...evaluationByDay.entries()]
    .filter(([key]) => weekKeys.has(key))
    .map(([, evaluation]) => Number.parseInt(evaluation.productivity_score, 10))
    .filter((value) => !Number.isNaN(value));
  const score = weekEvaluations.length
    ? Math.round(weekEvaluations.reduce((sum, value) => sum + value, 0) / weekEvaluations.length)
    : weeklyTasks.length ? Math.round((completed / weeklyTasks.length) * 100) : null;
  const bestDay = days
    .filter((day) => day.totalTasks > 0)
    .sort((a, b) => b.progress - a.progress)[0];

  return {
    isNewUser,
    hasStressData: days.some((day) => day.stressLevel > 0),
    rangeLabel: `${weekDays[0].shortDate} - ${weekDays[6].shortDate}`,
    days,
    unfinishedTasks: weeklyTasks
      .filter(({ task }) => !isTaskCompleted(task))
      .map(({ task, day }) => ({
        ...task,
        relatedDay: `${day.dayName} ${day.shortDate}`
      })),
    review: {
      score,
      completed,
      unfinished,
      bestDay: bestDay ? bestDay.dayName : 'No data',
      message: score === null
        ? 'No results yet'
        : score >= 70
          ? 'Good progress this week'
          : 'Try to complete more tasks tomorrow'
    }
  };
}

function buildCalendarMonthData({ visibleMonth, tasks = [], scheduleItems = [], dailyLogs = [], dailyEvaluations = [] }) {
  const monthDate = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const monthKey = toMonthKey(monthDate);
  const todayKey = toDateKey(new Date());
  const calendarDays = getMonthCalendarDays(monthDate);
  const dailyLogByDay = new Map(dailyLogs.map((log) => [datePart(log.log_date), log]));
  const evaluationByDay = new Map(dailyEvaluations.map((evaluation) => [datePart(evaluation.evaluation_date), evaluation]));
  const scheduleItemsByDay = new Map();
  const scheduledDatesByTask = new Map();

  scheduleItems.forEach((item) => {
    const itemDayKey = datePart(item.start_time);
    if (!itemDayKey) return;

    if (!scheduleItemsByDay.has(itemDayKey)) {
      scheduleItemsByDay.set(itemDayKey, []);
    }
    scheduleItemsByDay.get(itemDayKey).push(item);

    if (item.task_id) {
      const dates = scheduledDatesByTask.get(item.task_id) || new Set();
      dates.add(itemDayKey);
      scheduledDatesByTask.set(item.task_id, dates);
    }
  });

  const days = calendarDays.map((day) => {
    const dayTasks = tasks.filter((task) => isCalendarTaskVisibleOnDay(task, day.key, scheduledDatesByTask));
    const dayScheduleItems = scheduleItemsByDay.get(day.key) || [];
    const dailyLog = dailyLogByDay.get(day.key);
    const evaluation = evaluationByDay.get(day.key);
    const totalTasks = dayTasks.length || dayScheduleItems.length;
    const completedTasks = dayTasks.filter(isTaskCompleted).length;
    const progress = evaluation
      ? Number.parseInt(evaluation.completion_percentage || evaluation.productivity_score, 10) || 0
      : totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const deadlineTasks = dayTasks.filter((task) => task.deadline && !isTaskCompleted(task));
    const deadlineTone = getStrongestDeadlineTone(deadlineTasks.map((task) => getDeadlineState(task, day.key).tone));
    const hasData = totalTasks > 0 || dayScheduleItems.length > 0 || Boolean(dailyLog);

    return {
      ...day,
      isToday: day.key === todayKey,
      taskCount: totalTasks,
      completedTasks,
      progress,
      productivityTone: getCalendarProductivityTone(progress, hasData),
      deadlineCount: deadlineTasks.length,
      deadlineTone,
      meetingCount: countMeetings(dayTasks, dayScheduleItems),
      highStress: Number.parseInt(dailyLog?.stress_level, 10) >= 4,
      hasAiInsight: Boolean(dailyLog?.detected_emotion || dailyLog?.predicted_energy_level),
      hasData
    };
  });

  const currentMonthDays = days.filter((day) => day.isCurrentMonth);
  const productiveDays = currentMonthDays.filter((day) => day.taskCount > 0);
  const completedTasksThisMonth = tasks.filter((task) => {
    if (!isTaskCompleted(task)) return false;
    const completedKey = getTaskCompletionDayKey(task) || datePart(task.task_date) || datePart(task.deadline);
    return completedKey?.startsWith(monthKey);
  });
  const averageProductivity = productiveDays.length
    ? Math.round(productiveDays.reduce((sum, day) => sum + day.progress, 0) / productiveDays.length)
    : 0;
  const bestDay = productiveDays.sort((a, b) => b.progress - a.progress)[0];
  const focusHours = completedTasksThisMonth.reduce((sum, task) => {
    const minutes = Number.parseInt(task.actual_duration_minutes || task.estimated_duration_minutes, 10);
    return sum + (Number.isNaN(minutes) ? 0 : minutes);
  }, 0);

  return {
    monthLabel: new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(monthDate),
    weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    filterOptions: [
      { key: 'tasks', label: 'Tasks', icon: 'T' },
      { key: 'productivity', label: 'Productivity', icon: 'P' },
      { key: 'mood', label: 'Mood', icon: 'M' },
      { key: 'deadlines', label: 'Deadlines', icon: 'D' },
      { key: 'meetings', label: 'Meetings', icon: 'C' },
      { key: 'ai', label: 'AI Insights', icon: 'AI' }
    ],
    days,
    isNewUser: tasks.length === 0 && scheduleItems.length === 0 && dailyLogs.length === 0,
    summary: {
      completedTasks: completedTasksThisMonth.length,
      averageProductivity,
      bestDay: bestDay ? `${bestDay.dayName} ${bestDay.shortDate}` : 'No data',
      currentStreak: getCurrentStreak(currentMonthDays),
      focusHours: Math.round((focusHours / 60) * 10) / 10
    }
  };
}

function buildAiNotesInsights({ tasks = [], scheduleItems = [], dailyLogs = [], latestLog, period }) {
  const periodStart = getInsightsPeriodStart(period);
  const filteredLogs = dailyLogs.filter((log) => new Date(datePart(log.log_date) || log.created_at) >= periodStart);
  const filteredTasks = tasks.filter((task) => {
    const taskDate = datePart(task.completed_date) || datePart(task.completed_on) || datePart(task.completed_at) || datePart(task.task_date) || datePart(task.created_at);
    return !taskDate || new Date(`${taskDate}T00:00:00`) >= periodStart;
  });
  const filteredItems = scheduleItems.filter((item) => new Date(item.start_time) >= periodStart);
  const completedTasks = filteredTasks.filter(isTaskCompleted);
  const hasEnoughData = filteredTasks.length >= 2 || filteredLogs.length >= 2 || filteredItems.length >= 2;
  const completionRate = filteredTasks.length ? Math.round((completedTasks.length / filteredTasks.length) * 100) : 0;
  const averageEnergy = averageNumber(filteredLogs.map((log) => log.predicted_energy_level || log.energy_level));
  const averageStress = averageNumber(filteredLogs.map((log) => log.stress_level));
  const productiveHour = getMostProductiveHour(filteredItems, completedTasks);
  const hardTasks = filteredTasks.filter((task) => Number.parseInt(task.difficulty_level, 10) >= 4);
  const plannedMinutes = Math.round(averageNumber(completedTasks.map((task) => task.estimated_duration_minutes)));
  const actualMinutes = Math.round(averageNumber(completedTasks.map((task) => task.actual_duration_minutes || task.estimated_duration_minutes)));
  const difficultyText = hardTasks.length > 0
    ? 'Hard tasks need stronger focus blocks and should be placed in high-energy hours.'
    : 'Medium and easy tasks are currently the safest planning pattern.';

  const recommendations = [
    averageEnergy && averageEnergy <= 2.5
      ? 'Use shorter sessions and add more breaks when energy is low.'
      : 'Schedule difficult tasks earlier in the day while your energy is stable.',
    averageStress && averageStress >= 3.5
      ? 'Reduce task overload tomorrow and keep one flexible recovery block.'
      : 'Keep a balanced task mix to protect mood and focus.',
    actualMinutes > plannedMinutes
      ? 'Give similar tasks more time because recent tasks took longer than planned.'
      : 'Your time estimates are mostly stable, so the scheduler can trust your durations.',
    'Use feedback after each task so future planning becomes more personalized.'
  ];

  return {
    hasEnoughData,
    kpis: [
      { label: 'Completion Rate', value: `${completionRate}%`, tone: completionRate >= 70 ? 'good' : completionRate >= 45 ? 'medium' : 'low', icon: CheckCircle2 },
      { label: 'Avg Energy', value: averageEnergy ? `${averageEnergy.toFixed(1)}/5` : '--', tone: averageEnergy >= 3.5 ? 'good' : averageEnergy >= 2.5 ? 'medium' : 'low', icon: Gauge },
      { label: 'Stress Signal', value: averageStress ? stressLabel(Math.round(averageStress)) : 'none', tone: averageStress >= 4 ? 'low' : averageStress >= 3 ? 'medium' : 'good', icon: Flame },
      { label: 'Focus Window', value: productiveHour, tone: 'good', icon: Clock3 }
    ],
    productivity: {
      headline: completionRate >= 70 ? 'Strong productivity pattern detected.' : 'Productivity still needs more consistent data.',
      description: productiveHour === 'No data'
        ? 'Complete more tasks so the system can find your best working hours.'
        : `You currently complete more work around ${productiveHour}. ${difficultyText}`,
      chart: buildCompletionChart(filteredTasks)
    },
    energy: {
      headline: averageEnergy ? `Average energy is ${averageEnergy.toFixed(1)} out of 5.` : 'Energy pattern is still learning.',
      description: averageEnergy && averageEnergy <= 2.5
        ? 'The scheduler should avoid placing heavy tasks during low-energy periods.'
        : 'Your energy is stable enough for balanced planning with focused work blocks.',
      chart: buildLogMetricChart(filteredLogs, 'energy_level')
    },
    mood: {
      headline: averageStress >= 3.5 ? 'Stress is affecting the planning pattern.' : 'Mood and stress look manageable.',
      description: averageStress >= 3.5
        ? 'High-stress days should use fewer hard tasks and more short breaks.'
        : 'Balanced task days are likely helping keep stress under control.',
      chart: buildLogMetricValues(filteredLogs, 'stress_level')
    },
    time: {
      headline: actualMinutes > plannedMinutes ? 'Tasks are taking longer than planned.' : 'Time estimates look stable.',
      description: actualMinutes > plannedMinutes
        ? 'The system should increase planned time for similar tasks in future schedules.'
        : 'Planned duration and actual duration are close enough for reliable scheduling.',
      planned: plannedMinutes || 30,
      actual: actualMinutes || plannedMinutes || 30
    },
    recommendations,
    adaptiveSuggestions: [
      'Hard tasks are moved toward high-energy hours when the user reports better energy.',
      'The scheduler increases urgency when deadlines get closer.',
      'Recent feedback changes future recommendations instead of replacing the core rule-based algorithm.',
      averageStress >= 3.5
        ? 'Stress increased recently, so future plans should reduce heavy task density.'
        : 'Stress is stable, so future plans can keep a balanced workload.'
    ]
  };
}

function getInsightsPeriodStart(period) {
  const now = new Date();
  if (period === 'daily') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (period === 'monthly') {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  return weekStart;
}

function filterAiNotesByPeriod(aiNotes = [], period) {
  const periodStart = getInsightsPeriodStart(period);
  return aiNotes.filter((note) => {
    const key = datePart(note.note_date || note.created_at);
    return !key || new Date(`${key}T00:00:00`) >= periodStart;
  });
}

function averageNumber(values) {
  const numbers = values
    .map((value) => Number.parseFloat(value))
    .filter((value) => !Number.isNaN(value));
  if (numbers.length === 0) return 0;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function getMostProductiveHour(scheduleItems, completedTasks) {
  const completedIds = new Set(completedTasks.map((task) => task.task_id));
  const hourCounts = new Map();

  scheduleItems.forEach((item) => {
    if (completedIds.size > 0 && item.task_id && !completedIds.has(item.task_id)) return;
    const date = new Date(item.start_time);
    if (!isValidDate(date)) return;
    const hour = date.getHours();
    hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
  });

  if (hourCounts.size === 0) return 'No data';

  const bestHour = [...hourCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return `${String(bestHour).padStart(2, '0')}:00`;
}

function buildCompletionChart(tasks) {
  const recentTasks = tasks.slice(-6);
  const source = recentTasks.length > 0 ? recentTasks : Array.from({ length: 6 }, () => null);
  return source.map((task, index) => {
    if (!task) return [28, 42, 35, 58, 48, 66][index] || 35;
    return isTaskCompleted(task) ? 86 : 32;
  });
}

function buildLogMetricChart(logs, field) {
  const values = buildLogMetricValues(logs, field);
  return values.map((value) => value * 20);
}

function buildLogMetricValues(logs, field) {
  const source = logs.slice(-7);
  if (source.length === 0) return [2, 3, 3, 4, 3, 2, 3];
  return source.map((log) => Number.parseInt(log[field] || log.predicted_energy_level, 10) || 3);
}

function buildProgressDashboardData({ tasks = [], scheduleItems = [], dailyLogs = [], dailyEvaluations = [], latestLog, period }) {
  const periodStart = getInsightsPeriodStart(period);
  const todayKey = toDateKey(new Date());
  const filteredTasks = tasks.filter((task) => {
    const key = datePart(task.completed_date) || datePart(task.completed_on) || datePart(task.completed_at) || datePart(task.task_date) || datePart(task.created_at);
    return !key || new Date(`${key}T00:00:00`) >= periodStart;
  });
  const filteredLogs = dailyLogs.filter((log) => {
    const key = datePart(log.log_date) || datePart(log.created_at);
    return !key || new Date(`${key}T00:00:00`) >= periodStart;
  });
  const completedTasks = filteredTasks.filter(isTaskCompleted);
  const unfinishedTasks = filteredTasks.filter((task) => !isTaskCompleted(task) && !isTaskArchived(task));
  const overdueTasks = unfinishedTasks.filter((task) => getDeadlineState(task, todayKey).tone === 'overdue');
  const completionPercentage = filteredTasks.length ? Math.round((completedTasks.length / filteredTasks.length) * 100) : 0;
  const productivityByDay = dailyEvaluations.length > 0
    ? buildProductivityByDayFromEvaluations(dailyEvaluations)
    : buildProductivityByDay(tasks);
  const todayScore = productivityByDay.get(todayKey) || completionPercentage;
  const weeklyAverage = averageProgressForRange(productivityByDay, getInsightsPeriodStart('weekly'));
  const monthlyAverage = averageProgressForRange(productivityByDay, getInsightsPeriodStart('monthly'));
  const bestDayEntry = [...productivityByDay.entries()].sort((a, b) => b[1] - a[1])[0];
  const plannedMinutes = Math.round(averageNumber(completedTasks.map((task) => task.estimated_duration_minutes))) || 30;
  const actualMinutes = Math.round(averageNumber(completedTasks.map((task) => task.actual_duration_minutes || task.estimated_duration_minutes))) || plannedMinutes;
  const productivityTrend = buildProgressTrend(productivityByDay, period);
  const previousAverage = productivityTrend.length > 1
    ? Math.round(averageNumber(productivityTrend.slice(0, Math.max(1, Math.floor(productivityTrend.length / 2)))))
    : 0;
  const currentAverage = productivityTrend.length > 1
    ? Math.round(averageNumber(productivityTrend.slice(Math.floor(productivityTrend.length / 2))))
    : completionPercentage;
  const improvement = currentAverage - previousAverage;
  const hardTasks = filteredTasks.filter((task) => Number.parseInt(task.difficulty_level, 10) >= 4);
  const energyTrend = buildLogMetricChart(filteredLogs, 'energy_level');
  const stressTrend = buildLogMetricValues(filteredLogs, 'stress_level');
  const averageEnergy = averageNumber(filteredLogs.map((log) => log.predicted_energy_level || log.energy_level || latestLog?.energy_level));
  const averageStress = averageNumber(filteredLogs.map((log) => log.stress_level || latestLog?.stress_level));
  const productiveHour = getMostProductiveHour(scheduleItems.filter((item) => new Date(item.start_time) >= periodStart), completedTasks);
  const hasEnoughData = filteredTasks.length >= 2 || filteredLogs.length >= 2 || scheduleItems.length >= 2 || dailyEvaluations.length >= 1;

  return {
    hasEnoughData,
    todayScore: clampScore(todayScore || 0),
    weeklyAverage: clampScore(weeklyAverage || 0),
    monthlyAverage: clampScore(monthlyAverage || 0),
    bestDay: bestDayEntry ? formatProgressDayLabel(bestDayEntry[0]) : 'No data',
    productivityTrend,
    improvementMessage: improvement > 0
      ? `Productivity improved by ${improvement}% in this ${period} view.`
      : improvement < 0
        ? `Productivity dropped by ${Math.abs(improvement)}%, so the next schedule should be lighter.`
        : 'Productivity is stable. More task history will make this trend smarter.',
    completedTasks: completedTasks.length,
    unfinishedTasks: unfinishedTasks.length,
    overdueTasks: overdueTasks.length,
    completionPercentage,
    plannedMinutes,
    actualMinutes,
    timeInsight: actualMinutes > plannedMinutes
      ? 'Hard or large tasks need more planned time in future schedules.'
      : 'Planned time and actual time are close, so estimates are reliable.',
    feedbackBefore: averageEnergy && averageEnergy <= 2.5 ? 'Hard tasks were still planned normally.' : 'Tasks were planned by priority and deadline.',
    feedbackAfter: averageEnergy && averageEnergy <= 2.5 ? 'The system should move hard tasks later and add shorter sessions.' : 'Feedback helps keep similar tasks in better time windows.',
    energyTrend,
    stressTrend,
    energyMoodMessage: averageStress >= 3.5
      ? 'Stress is high recently. The scheduler should reduce overload and add breaks.'
      : 'Energy and mood look stable enough for balanced planning.',
    learningSummary: [
      productiveHour === 'No data' ? 'More completed tasks will reveal the best working hours.' : `You work better around ${productiveHour}.`,
      hardTasks.length > 0 ? 'Hard tasks should receive longer focus blocks.' : 'Medium tasks are currently easier to complete consistently.',
      actualMinutes > plannedMinutes ? 'Similar tasks should get more time in future schedules.' : 'Current duration estimates are mostly accurate.',
      overdueTasks.length > 0 ? 'Deadline tasks need stronger urgency as the deadline approaches.' : 'Deadline handling is currently under control.',
      averageStress >= 3.5 ? 'Short breaks should be added when stress increases.' : 'Short breaks help protect focus and keep the schedule balanced.'
    ]
  };
}

function buildProductivityByDay(tasks) {
  const byDay = new Map();

  tasks.forEach((task) => {
    const key = datePart(task.completed_date) || datePart(task.completed_on) || datePart(task.completed_at) || datePart(task.task_date) || datePart(task.created_at);
    if (!key) return;
    const current = byDay.get(key) || { total: 0, completed: 0 };
    current.total += 1;
    if (isTaskCompleted(task)) current.completed += 1;
    byDay.set(key, current);
  });

  return new Map([...byDay.entries()].map(([key, value]) => [
    key,
    value.total ? Math.round((value.completed / value.total) * 100) : 0
  ]));
}

function buildProductivityByDayFromEvaluations(evaluations = []) {
  return new Map(evaluations.map((evaluation) => [
    datePart(evaluation.evaluation_date),
    Number.parseInt(evaluation.productivity_score || evaluation.completion_percentage, 10) || 0
  ]));
}

function averageProgressForRange(progressByDay, startDate) {
  const values = [...progressByDay.entries()]
    .filter(([key]) => new Date(`${key}T00:00:00`) >= startDate)
    .map(([, value]) => value);
  return values.length ? Math.round(averageNumber(values)) : 0;
}

function buildProgressTrend(progressByDay, period) {
  const points = period === 'monthly' ? 8 : period === 'daily' ? 6 : 7;
  const sortedValues = [...progressByDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => value)
    .slice(-points);
  if (sortedValues.length > 0) return sortedValues;
  return [18, 28, 40, 38, 52, 60, 66].slice(-points);
}

function formatProgressDayLabel(dayKey) {
  const date = new Date(`${dayKey}T00:00:00`);
  if (!isValidDate(date)) return dayKey;
  return new Intl.DateTimeFormat('en', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit'
  }).format(date);
}

function getMonthCalendarDays(monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return {
      date,
      key: toDateKey(date),
      dayNumber: date.getDate(),
      dayName: new Intl.DateTimeFormat('en', { weekday: 'short' }).format(date),
      shortDate: `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`,
      isCurrentMonth: date.getMonth() === month
    };
  });
}

function isCalendarTaskVisibleOnDay(task, dayKey, scheduledDatesByTask) {
  if (!task || isTaskArchived(task)) return false;

  const scheduledDates = scheduledDatesByTask.get(task.task_id);
  if (isTaskCompleted(task)) {
    const completedKey = getTaskCompletionDayKey(task);
    return completedKey ? completedKey === dayKey : scheduledDates?.has(dayKey) || datePart(task.task_date) === dayKey;
  }

  if (task.is_fixed_time) {
    return datePart(task.fixed_date) === dayKey;
  }

  if (task.deadline) {
    return shouldDisplayDeadlineTaskOnDay(task, dayKey);
  }

  return datePart(task.task_date) === dayKey || scheduledDates?.has(dayKey);
}

function getCalendarProductivityTone(progress, hasData) {
  if (!hasData) return 'neutral';
  if (progress >= 75) return 'high';
  if (progress >= 50) return 'medium';
  return 'low';
}

function getStrongestDeadlineTone(tones) {
  const priority = ['overdue', 'due', 'close', 'warning', 'early'];
  return priority.find((tone) => tones.includes(tone)) || '';
}

function countMeetings(dayTasks, dayScheduleItems) {
  const fixedTaskIds = new Set(dayTasks.filter((task) => task.is_fixed_time).map((task) => task.task_id));
  const fixedScheduleItems = dayScheduleItems.filter((item) => item.task_kind === 'fixed' && !fixedTaskIds.has(item.task_id));
  return fixedTaskIds.size + fixedScheduleItems.length;
}

function getCurrentStreak(days) {
  const sortedDays = [...days].sort((a, b) => a.key.localeCompare(b.key));
  const todayKey = toDateKey(new Date());
  const startIndex = sortedDays.findIndex((day) => day.key === todayKey);
  let index = startIndex >= 0 ? startIndex : sortedDays.length - 1;
  let streak = 0;

  while (index >= 0) {
    if (sortedDays[index].completedTasks <= 0) break;
    streak += 1;
    index -= 1;
  }

  return streak;
}

function toMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getTaskWeekDateKey(task, scheduleDateByTask, weekKeys) {
  if (scheduleDateByTask.has(task.task_id)) {
    return scheduleDateByTask.get(task.task_id);
  }

  const candidates = [
    datePart(task.task_date),
    task.fixed_date,
    datePart(task.deadline)
  ].filter(Boolean);

  return candidates.find((key) => weekKeys.has(key)) || null;
}

function getProgressTone(progress, totalTasks, isFuture, isNewUser) {
  if (isNewUser || totalTasks === 0 || isFuture) {
    return { tone: 'neutral', color: '#d7e2f5', visualProgress: 0 };
  }
  if (progress <= 0) {
    return { tone: 'neutral', color: '#d7e2f5', visualProgress: 0 };
  }
  if (progress === 100) {
    return { tone: 'green', color: '#2ca86b', visualProgress: 100 };
  }
  if (progress < 50) {
    return { tone: 'red', color: '#d95572', visualProgress: Math.max(progress, 12) };
  }
  if (progress <= 70) {
    return { tone: 'orange', color: '#f3ad35', visualProgress: progress };
  }
  return { tone: 'teal', color: '#11a7a4', visualProgress: progress };
}

function getCompletionPercentage(completedTasks, totalTasks) {
  if (!totalTasks) return 0;
  if (completedTasks >= totalTasks) return 100;
  return Math.round((completedTasks / totalTasks) * 100);
}

function getDayCircleLabel({ isNewUser, isFuture, totalTasks, rawProgress }) {
  if (isNewUser) return 'No results';
  if (isFuture && totalTasks > 0) return `${totalTasks} planned`;
  if (totalTasks === 0) return 'No tasks';
  return `${rawProgress}% done`;
}

function isTaskCompleted(task) {
  return Boolean(task?.is_completed) || task?.status === 'completed';
}

function isTaskArchived(task) {
  return ['removed', 'deleted', 'cancelled'].includes(String(task?.status || '').toLowerCase());
}

function isBreakScheduleItem(item = {}) {
  const kind = String(item.task_kind || '').trim().toLowerCase();
  const category = String(item.category || item.task?.category || '').trim().toLowerCase();
  const energySlot = String(item.energy_slot || '').trim().toLowerCase();
  const title = String(item.title || '').trim().toLowerCase();
  return (
    kind === 'break' ||
    category === 'break' ||
    energySlot === 'break' ||
    title === 'break' ||
    title === 'short break' ||
    title === 'rest break'
  );
}

function parseBooleanValue(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase());
  return false;
}

function toDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function datePart(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  return toDateKey(new Date(value));
}

function isPastDayKey(dayKey) {
  return Boolean(dayKey) && dayKey < toDateKey(new Date());
}

function formatDeadline(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function stressLabel(level) {
  if (!level) return 'none';
  if (level <= 2) return 'low';
  if (level === 3) return 'medium';
  return 'high';
}

function getDefaultCheckInDraft() {
  return {
    mood_text_original: '',
    mood_level: 3,
    energy_level: 3,
    stress_level: 3,
    sleep_hours: 7,
    is_tired: false,
    planning_start: '',
    planning_end: ''
  };
}

function normalizeSelectedDayTask(taskDraft, selectedDate) {
  const payload = {
    ...taskDraft,
    task_date: selectedDate
  };
  delete payload.local_id;

  if (payload.is_fixed_time) {
    payload.fixed_date = selectedDate;
  }

  return payload;
}

function upsertById(items, item, key) {
  const value = item?.[key];
  if (!value) return [...items, item];
  const exists = items.some((current) => current?.[key] === value);
  return exists
    ? items.map((current) => (current?.[key] === value ? item : current))
    : [...items, item];
}

function mergeById(items = [], nextItems = [], key) {
  return nextItems.reduce((current, item) => upsertById(current, item, key), items);
}

function getLatestByDate(items = [], field) {
  return [...items]
    .filter((item) => item?.[field])
    .sort((a, b) => new Date(b[field]) - new Date(a[field]))[0] || null;
}

function getPreviewTaskId(task) {
  return task?.task_id || task?.local_id || '';
}

function getDailyLogForDay(logs = [], dayKey) {
  if (!dayKey) return null;
  return logs.find((log) => datePart(log.log_date || log.checkin_date) === dayKey) || null;
}

function getSelectedDayInputTasks(tasks = [], dayKey, selectedDayTasks = {}) {
  if (!dayKey) return [];
  const currentDrafts = selectedDayTasks[dayKey] || [];
  const currentIds = new Set(currentDrafts.map((task) => task.task_id).filter(Boolean));
  const savedTasks = tasks.filter((task) => (
    !currentIds.has(task.task_id) &&
    !isTaskArchived(task) &&
    !isTaskCompleted(task) &&
    (datePart(task.task_date) === dayKey || datePart(task.fixed_date) === dayKey)
  ));
  return [...currentDrafts, ...savedTasks];
}

function buildDailyDetailsData({ day, schedule, items, tasks, latestLog }) {
  const detailItems = initializeDailyDetailItems({ day, schedule, items, tasks });
  return splitDailyDetailItems(detailItems, latestLog);
}

function initializeDailyDetailItems({ day, schedule, items = [], tasks = [] }) {
  const dayKey = day?.key || datePart(schedule?.schedule_date);
  const taskById = new Map(tasks.map((task) => [task.task_id, task]));
  const now = new Date();

  const scheduledItems = items
    .filter((item) => !dayKey || datePart(item.start_time) === dayKey || datePart(schedule?.schedule_date) === dayKey)
    .filter((item) => !isTaskArchived(taskById.get(item.task_id)))
    .filter((item) => shouldDisplayScheduledDetailItemOnDay(item, taskById.get(item.task_id), dayKey))
    .map((item, index) => {
      const task = taskById.get(item.task_id);
      const taskKind = item.task_kind || (task?.is_fixed_time ? 'fixed' : 'flexible');
      const detailItem = {
        ...item,
        detail_id: item.schedule_item_id || item.task_id || `daily_item_${index}`,
        task,
        task_kind: taskKind,
        status: normalizeDailyTaskStatus(item, task, taskKind, now, dayKey)
      };
      return withDeadlineDisplay(detailItem, task, dayKey || datePart(item.start_time));
    });

  const scheduledTaskIds = new Set(scheduledItems.map((item) => item.task_id).filter(Boolean));
  const continuationItems = buildDeadlineContinuationItems({ dayKey, tasks, scheduledTaskIds });

  return [...scheduledItems, ...continuationItems]
    .sort((a, b) => getDetailSortTime(a) - getDetailSortTime(b));
}

function splitDailyDetailItems(detailItems, latestLog) {
  const sortedItems = [...detailItems].sort((a, b) => getDetailSortTime(a) - getDetailSortTime(b));
  const breakItems = sortedItems.filter(isBreakScheduleItem);
  const taskItems = sortedItems.filter((item) => !isBreakScheduleItem(item));
  const currentTask = taskItems.find((item) => item.status === 'in_progress') || null;
  const completedTasks = taskItems.filter((item) => item.status === 'completed');
  const waitingTasks = taskItems.filter((item) => item.status === 'waiting' || item.status === 'overdue');
  const advice = buildDailyAdvice({ waitingTasks, completedTasks, currentTask, latestLog, dayItems: taskItems, breakItems });

  return {
    waitingTasks,
    breakItems,
    currentTask,
    completedTasks,
    timeline: sortedItems,
    advice
  };
}

function buildDailyAdviceNotes(localAdvice = [], aiNotes = [], dayKey, latestLog) {
  const savedNotes = aiNotes
    .filter((note) => datePart(note.note_date || note.created_at) === dayKey)
    .filter((note) => shouldShowSavedAdviceNote(note, latestLog));
  const selectedSavedNotes = selectLatestDailyAdviceNotes(savedNotes)
    .map((note) => `${note.title}: ${note.message}`);
  if (selectedSavedNotes.length > 0) return selectedSavedNotes;
  return localAdvice;
}

function shouldShowSavedAdviceNote(note, latestLog) {
  if (!latestLog) return true;
  const energy = Number.parseInt(latestLog.predicted_energy_level || latestLog.energy_level, 10);
  const stress = Number.parseInt(latestLog.stress_level, 10);
  const sleepHours = Number.parseFloat(latestLog.sleep_hours);
  const mood = Number.parseInt(latestLog.mood_level, 10);
  const isTired = parseBooleanValue(latestLog.is_tired);
  const strongEnergyDay = energy >= 4 && stress <= 2 && sleepHours >= 7 && mood >= 4 && !isTired;
  if (!strongEnergyDay) return true;
  const textValue = `${note.note_type || ''} ${note.title || ''} ${note.message || ''}`.toLowerCase();
  return !textValue.includes('low energy') && !textValue.includes('low-energy') && !textValue.includes('energy is low');
}

function selectLatestDailyAdviceNotes(notes = []) {
  if (notes.length <= 6) return notes;
  const sorted = [...notes].sort((a, b) => new Date(b.created_at || b.note_date || 0) - new Date(a.created_at || a.note_date || 0));
  const latestTime = new Date(sorted[0]?.created_at || sorted[0]?.note_date || 0).getTime();
  const latestBatch = sorted.filter((note) => {
    const noteTime = new Date(note.created_at || note.note_date || 0).getTime();
    return Number.isFinite(noteTime) && Number.isFinite(latestTime) && Math.abs(latestTime - noteTime) <= 120000;
  });
  const currentNotes = latestBatch.length >= 3 ? latestBatch : sorted.slice(0, 6);
  const complexDay = currentNotes.some((note) => {
    const noteType = String(note.note_type || note.advice_type || '').toLowerCase();
    const priority = Number.parseInt(note.priority, 10);
    return priority <= 1 || ['deadline', 'stress', 'time_management', 'feedback'].includes(noteType);
  });
  return currentNotes
    .sort((a, b) => (Number.parseInt(a.priority, 10) || 3) - (Number.parseInt(b.priority, 10) || 3))
    .slice(0, complexDay ? 12 : 6);
}

function shouldDisplayScheduledDetailItemOnDay(item, task, dayKey) {
  if (!dayKey) return true;
  const completionDay = getItemCompletionDayKey(item, task);
  return !completionDay || completionDay === dayKey;
}

function normalizeDailyTaskStatus(item, task, taskKind, now, dayKey) {
  if (isBreakScheduleItem(item)) return 'break';

  if (item.status === 'completed' || task?.is_completed) {
    return getItemCompletionDayKey(item, task) === dayKey ? 'completed' : getWaitingStatusForItem({ ...item, task }, dayKey);
  }
  if (item.status === 'in_progress' || item.status === 'active') return 'in_progress';
  if (item.status === 'overdue') return 'overdue';

  if (taskKind === 'fixed') {
    const start = new Date(item.start_time);
    const end = new Date(item.end_time);
    if (isValidDate(end) && now >= end) return 'completed';
    if (isValidDate(start) && isValidDate(end) && now >= start && now < end) return 'in_progress';
  }

  const itemDayKey = datePart(item.start_time) || datePart(item.task_date);
  if (getDeadlineState(task || item, itemDayKey).tone === 'overdue') return 'overdue';

  return 'waiting';
}

function buildDeadlineContinuationItems({ dayKey, tasks = [], scheduledTaskIds }) {
  if (!dayKey) return [];

  return tasks
    .filter((task) => shouldDisplayDeadlineTaskOnDay(task, dayKey, scheduledTaskIds))
    .map((task, index) => {
      const deadlineState = getDeadlineState(task, dayKey);
      const taskCompleted = isTaskCompleted(task);

      return withDeadlineDisplay({
        detail_id: `deadline_${task.task_id || index}_${dayKey}`,
        schedule_item_id: null,
        task_id: task.task_id,
        title: task.title,
        category: task.category,
        difficulty_level: task.difficulty_level,
        priority_level: task.priority_level,
        start_time: `${dayKey}T23:58:00`,
        end_time: `${dayKey}T23:59:00`,
        energy_slot: 'flexible',
        task_kind: 'flexible',
        status: taskCompleted ? 'completed' : deadlineState.tone === 'overdue' ? 'overdue' : 'waiting',
        reason: taskCompleted
          ? 'Completed on this day and removed from future deadline lists.'
          : deadlineState.tone === 'overdue'
          ? 'Deadline passed, but the task is still unfinished.'
          : 'Continues from its start day until the deadline.',
        task,
        is_deadline_continuation: true
      }, task, dayKey);
    });
}

function shouldDisplayDeadlineTaskOnDay(task, dayKey, scheduledTaskIds = new Set()) {
  if (!task || !task.deadline || task.is_fixed_time) return false;
  if (scheduledTaskIds.has(task.task_id)) return false;
  if (isTaskArchived(task)) return false;
  if (isTaskCompleted(task)) return getTaskCompletionDayKey(task) === dayKey;

  const startKey = getTaskStartDayKey(task);
  if (startKey && dayKey < startKey) return false;

  return true;
}

function withDeadlineDisplay(item, task, dayKey) {
  const deadlineState = getDeadlineState(task || item, dayKey);
  if (!deadlineState.label) return item;

  return {
    ...item,
    status: item.status === 'waiting' && deadlineState.tone === 'overdue' ? 'overdue' : item.status,
    deadline_label: deadlineState.label,
    deadline_detail: deadlineState.detail,
    deadline_tone: deadlineState.tone
  };
}

function getDeadlineState(task, dayKey) {
  const deadlineKey = getTaskDeadlineDayKey(task);
  if (!deadlineKey || !dayKey) {
    return { tone: '', label: '', detail: '' };
  }

  const daysLeft = getCalendarDayDiff(dayKey, deadlineKey);
  const detail = `Deadline: ${formatDeadlineDay(deadlineKey)}`;

  if (daysLeft < 0) {
    return { tone: 'overdue', label: 'Overdue', detail };
  }

  if (daysLeft === 0) {
    return { tone: 'due', label: 'Deadline today', detail };
  }

  if (daysLeft === 1) {
    return { tone: 'close', label: '1 day left', detail };
  }

  return {
    tone: daysLeft <= 3 ? 'warning' : 'early',
    label: `${daysLeft} days left`,
    detail
  };
}

function getWaitingStatusForItem(item, dayKey) {
  return getDeadlineState(item.task || item, dayKey).tone === 'overdue' ? 'overdue' : 'waiting';
}

function getTaskStartDayKey(task) {
  return datePart(task?.task_date) || datePart(task?.created_at);
}

function getTaskDeadlineDayKey(task) {
  return datePart(task?.deadline);
}

function getTaskCompletionDayKey(task) {
  return datePart(task?.completed_date) || datePart(task?.completed_on) || datePart(task?.completed_at);
}

function getItemCompletionDayKey(item, task) {
  return datePart(item?.actual_completed_at) ||
    datePart(item?.completed_at) ||
    getTaskCompletionDayKey(task || item?.task || item);
}

function getCalendarDayDiff(fromKey, toKey) {
  const fromTime = getDayKeyUtcTime(fromKey);
  const toTime = getDayKeyUtcTime(toKey);
  if (fromTime === null || toTime === null) return 0;
  return Math.round((toTime - fromTime) / 86400000);
}

function getDayKeyUtcTime(dayKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey || '')) return null;
  const [year, month, day] = dayKey.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function formatDeadlineDay(dayKey) {
  const date = new Date(`${dayKey}T00:00:00`);
  if (!isValidDate(date)) return dayKey;
  return new Intl.DateTimeFormat('en', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit'
  }).format(date);
}

function getDetailSortTime(item) {
  const date = new Date(item.start_time);
  if (isValidDate(date)) return date.getTime();
  return Number.MAX_SAFE_INTEGER;
}

function applyFixedTimeAutomation(items, now) {
  let notice = '';
  const nextItems = items.map((item) => {
    if (item.task_kind !== 'fixed') return item;

    const start = new Date(item.start_time);
    const end = new Date(item.end_time);
    if (!isValidDate(start) || !isValidDate(end)) return item;
    if (now >= end && item.status !== 'completed') {
      const completedAt = now.toISOString();
      return {
        ...item,
        status: 'completed',
        started_at: item.started_at || item.start_time,
        actual_started_at: item.actual_started_at || item.started_at || item.start_time,
        completed_at: completedAt,
        actual_completed_at: completedAt,
        actual_duration_minutes: calculateActualDurationMinutes({ ...item, actual_started_at: item.actual_started_at || item.started_at || item.start_time }, now)
      };
    }
    return item;
  });

  const fixedToStart = nextItems
    .filter((item) => {
      if (item.task_kind !== 'fixed' || item.status === 'completed') return false;
      const start = new Date(item.start_time);
      const end = new Date(item.end_time);
      return isValidDate(start) && isValidDate(end) && now >= start && now < end;
    })
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))[0];

  if (!fixedToStart) {
    return {
      items: enforceSingleInProgress(nextItems),
      notice
    };
  }

  const fixedId = getDetailItemId(fixedToStart);
  const currentActive = nextItems.find((item) => item.status === 'in_progress' && getDetailItemId(item) !== fixedId);
  const updatedItems = nextItems.map((item) => {
    const itemId = getDetailItemId(item);
    if (itemId === fixedId) {
      if (item.status !== 'in_progress') {
        notice = 'Fixed-time task started and was moved to In Progress.';
      }
      const startedAt = now.toISOString();
      return { ...item, status: 'in_progress', started_at: item.started_at || startedAt, actual_started_at: item.actual_started_at || item.started_at || startedAt };
    }
    if (currentActive && itemId === getDetailItemId(currentActive) && item.task_kind !== 'fixed') {
      notice = 'Fixed-time task started and was moved to In Progress.';
      return { ...item, status: 'waiting' };
    }
    return item;
  });

  return {
    items: enforceSingleInProgress(updatedItems),
    notice
  };
}

function enforceSingleInProgress(items) {
  const activeItems = items.filter((item) => item.status === 'in_progress' && !isBreakScheduleItem(item));
  if (activeItems.length <= 1) return items;

  const preferredActive = activeItems.find((item) => item.task_kind === 'fixed') || activeItems[0];
  const preferredId = getDetailItemId(preferredActive);
  return items.map((item) => {
    if (item.status !== 'in_progress' || getDetailItemId(item) === preferredId) return item;
    return { ...item, status: 'waiting' };
  });
}

function buildDailyTaskEditDraft(item) {
  return {
    title: item.title || '',
    priority_level: String(item.task?.priority_level || item.priority_level || 3),
    difficulty_level: String(item.difficulty_level || item.task?.difficulty_level || 3),
    start_time: formatTimeForInput(item.start_time),
    end_time: formatTimeForInput(item.end_time)
  };
}

function buildActiveTaskUiState(item) {
  const latestFeedback = item?.feedback?.[item.feedback.length - 1] || null;
  return {
    subtasks: item?.subtasks?.length
      ? item.subtasks.map(normalizeSubtaskForUi)
      : [],
    resources: item?.resources?.length
      ? item.resources.map(normalizeResourceForUi)
      : [],
    imageDraft: '',
    linkDraft: '',
    feedbackOpen: false,
    feedbackDraft: getDefaultProgressFeedbackDraft(),
    lastFeedback: latestFeedback
  };
}

function buildActiveTaskUiFromItems(items = []) {
  return Object.fromEntries(items.map((item) => [
    getDetailItemId(item),
    buildActiveTaskUiState(item)
  ]));
}

function normalizeSubtaskForUi(subtask) {
  return {
    ...subtask,
    id: subtask.subtask_id || subtask.id,
    title: subtask.title,
    completed: Boolean(subtask.is_completed ?? subtask.completed)
  };
}

function normalizeResourceForUi(resource) {
  return {
    ...resource,
    id: resource.resource_id || resource.id || createLocalTaskId(),
    type: resource.resource_type || resource.type,
    label: resource.label || shortenUrl(resource.value),
    value: resource.value,
    preview: resource.preview_url || resource.preview || ''
  };
}

function getDefaultProgressFeedbackDraft() {
  return {
    outcome: 'completed',
    difficulty_feedback: '',
    energy_after: '',
    mood_after: '',
    comment: ''
  };
}

function buildCompletedTaskUiState(item, activeTaskUi) {
  const state = activeTaskUi[getDetailItemId(item)] || buildActiveTaskUiState(item);
  return {
    ...state,
    subtasks: state.subtasks.map((subtask) => ({ ...subtask, completed: true }))
  };
}

function buildCompletedTaskEvaluation(item) {
  const plannedMinutes = getPlannedDurationMinutes(item);
  const actualMinutes = getActualDurationMinutes(item);
  const tolerance = Math.max(5, Math.round((plannedMinutes || 0) * 0.15));
  const diff = actualMinutes - plannedMinutes;

  if (!plannedMinutes || !actualMinutes) {
    return {
      plannedMinutes,
      actualMinutes,
      plannedLabel: formatMinutesLabel(plannedMinutes),
      actualLabel: formatMinutesLabel(actualMinutes),
      tone: 'neutral',
      message: 'Task completed. More timing data will improve future evaluation.'
    };
  }

  if (diff > tolerance) {
    return {
      plannedMinutes,
      actualMinutes,
      plannedLabel: formatMinutesLabel(plannedMinutes),
      actualLabel: formatMinutesLabel(actualMinutes),
      tone: 'longer',
      message: 'This task took longer than expected. Consider giving similar tasks more time next time.'
    };
  }

  if (diff < -tolerance) {
    return {
      plannedMinutes,
      actualMinutes,
      plannedLabel: formatMinutesLabel(plannedMinutes),
      actualLabel: formatMinutesLabel(actualMinutes),
      tone: 'faster',
      message: 'Good progress. You finished faster than planned.'
    };
  }

  return {
    plannedMinutes,
    actualMinutes,
    plannedLabel: formatMinutesLabel(plannedMinutes),
    actualLabel: formatMinutesLabel(actualMinutes),
    tone: 'on-time',
    message: 'Great timing. You finished this task as expected.'
  };
}

function buildDailyEvaluation(details, activeTaskUi, latestLog) {
  const totalTasks = details.timeline.filter((item) => !isBreakScheduleItem(item)).length;
  const completedTasks = details.completedTasks.length;
  const unfinishedTasks = Math.max(0, totalTasks - completedTasks);
  const completionPercentage = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const durationScores = details.completedTasks.map((item) => {
    const evaluation = buildCompletedTaskEvaluation(item);
    if (!evaluation.plannedMinutes || !evaluation.actualMinutes) return 70;
    const ratio = Math.abs(evaluation.actualMinutes - evaluation.plannedMinutes) / evaluation.plannedMinutes;
    return Math.max(35, Math.round(100 - Math.min(65, ratio * 100)));
  });
  const durationScore = durationScores.length
    ? Math.round(durationScores.reduce((sum, score) => sum + score, 0) / durationScores.length)
    : 50;
  const feedbackScores = details.completedTasks.map((item) => {
    const feedback = activeTaskUi[getDetailItemId(item)]?.lastFeedback;
    if (!feedback) return 70;
    const energy = Number.parseInt(feedback.energy_after, 10);
    const mood = Number.parseInt(feedback.mood_after, 10);
    const energyScore = Number.isNaN(energy) ? 70 : energy * 20;
    const moodScore = Number.isNaN(mood) ? 70 : mood * 20;
    return Math.round((energyScore + moodScore) / 2);
  });
  const feedbackScore = feedbackScores.length
    ? Math.round(feedbackScores.reduce((sum, score) => sum + score, 0) / feedbackScores.length)
    : 70;
  const energyLevel = Number.parseInt(latestLog?.predicted_energy_level || latestLog?.energy_level, 10);
  const lowEnergyBonus = !Number.isNaN(energyLevel) && energyLevel <= 2 && completionPercentage >= 50 ? 5 : 0;
  const unfinishedPenalty = unfinishedTasks * 4;
  const productivityScore = clampScore(Math.round(
    completionPercentage * 0.52 +
    durationScore * 0.28 +
    feedbackScore * 0.15 +
    lowEnergyBonus -
    unfinishedPenalty
  ));

  return {
    totalTasks,
    completedTasks,
    unfinishedTasks,
    completionPercentage,
    productivityScore,
    message: getDailyEvaluationMessage(productivityScore)
  };
}

function getDailyEvaluationMessage(score) {
  if (score >= 90) {
    return 'Excellent day. You completed almost everything and managed your time very well.';
  }
  if (score >= 70) {
    return 'Good progress. You completed many tasks and stayed mostly on track.';
  }
  if (score >= 50) {
    return 'Moderate day. You completed some tasks, but there is room for better planning.';
  }
  return 'Challenging day. Try using shorter tasks and more breaks tomorrow.';
}

function getProductivityScoreTone(score) {
  if (score >= 90) return 'green';
  if (score >= 70) return 'purple';
  if (score >= 50) return 'orange';
  return 'red';
}

function getPlannedDurationMinutes(item) {
  if (item.is_deadline_continuation) {
    const estimated = Number.parseInt(
      item.task?.remaining_duration_minutes || item.task?.estimated_duration_minutes || item.estimated_duration_minutes,
      10
    );
    if (!Number.isNaN(estimated) && estimated > 0) return estimated;
  }
  return getDurationMinutes(item.start_time, item.end_time);
}

function getActualDurationMinutes(item) {
  const explicit = Number.parseInt(item.actual_duration_minutes || item.task?.actual_duration_minutes, 10);
  if (!Number.isNaN(explicit) && explicit > 0) return explicit;

  const actualStart = item.actual_started_at || item.started_at || item.actual_start_time || item.start_time;
  const actualEnd = item.actual_completed_at || item.completed_at || item.actual_end_time || item.end_time;
  return getDurationMinutes(actualStart, actualEnd) || getPlannedDurationMinutes(item);
}

function calculateActualDurationMinutes(item, completedAt = new Date()) {
  const startedAt = new Date(item.actual_started_at || item.started_at || item.actual_start_time || item.start_time);
  if (isValidDate(startedAt) && isValidDate(completedAt) && completedAt > startedAt) {
    return Math.max(1, Math.round((completedAt - startedAt) / 60000));
  }
  return getPlannedDurationMinutes(item);
}

function getDurationMinutes(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (!isValidDate(startDate) || !isValidDate(endDate) || endDate <= startDate) return 0;
  return Math.max(1, Math.round((endDate - startDate) / 60000));
}

function formatMinutesLabel(minutes) {
  if (!minutes) return '--';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  return `${hours}h ${remainingMinutes}m`;
}

function clampScore(score) {
  return Math.max(0, Math.min(100, score));
}

function applyDailyTaskEdit(item, draft, dayKey) {
  const priorityLevel = Number.parseInt(draft.priority_level, 10) || item.task?.priority_level || 3;
  const difficultyLevel = Number.parseInt(draft.difficulty_level, 10) || item.difficulty_level || 3;

  return {
    ...item,
    title: draft.title.trim(),
    difficulty_level: difficultyLevel,
    start_time: replaceTimePart(item.start_time, draft.start_time, dayKey),
    end_time: replaceTimePart(item.end_time, draft.end_time, dayKey),
    task: {
      ...(item.task || {}),
      title: draft.title.trim(),
      priority_level: priorityLevel,
      difficulty_level: difficultyLevel
    }
  };
}

function replaceTimePart(originalValue, timeValue, fallbackDate) {
  if (!timeValue) return originalValue;
  const dateKey = datePart(originalValue) || fallbackDate || toDateKey(new Date());
  return new Date(`${dateKey}T${timeValue}:00`).toISOString();
}

function formatTimeForInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (isValidDate(date)) {
    return [
      String(date.getHours()).padStart(2, '0'),
      String(date.getMinutes()).padStart(2, '0')
    ].join(':');
  }
  return String(value).slice(0, 5);
}

function getDetailItemId(item) {
  return item.detail_id || item.schedule_item_id || item.task_id || `${item.title}-${item.start_time}`;
}

function formatTaskStatus(status) {
  if (status === 'break') return 'break';
  if (status === 'in_progress') return 'in progress';
  if (status === 'overdue') return 'overdue';
  return status || 'waiting';
}

function formatTaskKind(kind) {
  return kind === 'fixed' ? 'Fixed-time' : 'Flexible';
}

function formatDuration(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (!isValidDate(startDate) || !isValidDate(endDate) || endDate <= startDate) return '--';

  const minutes = Math.round((endDate - startDate) / 60000);
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  return `${hours}h ${remainingMinutes}m`;
}

function priorityLabel(value) {
  const priority = Number.parseInt(value, 10) || 3;
  if (priority >= 5) return 'Very high';
  if (priority === 4) return 'High';
  if (priority === 2) return 'Low';
  if (priority <= 1) return 'Very low';
  return 'Medium';
}

function difficultyLabel(value) {
  const difficulty = Number.parseInt(value, 10) || 3;
  if (difficulty >= 5) return 'Very hard';
  if (difficulty === 4) return 'Hard';
  if (difficulty === 2) return 'Easy';
  if (difficulty <= 1) return 'Very easy';
  return 'Medium';
}

function shortenUrl(value) {
  if (!value) return '';
  return value.length > 34 ? `${value.slice(0, 31)}...` : value;
}

function isValidHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidDate(date) {
  return date instanceof Date && !Number.isNaN(date.getTime());
}

function buildDailyAdvice({ waitingTasks, completedTasks, currentTask, latestLog, dayItems, breakItems = [] }) {
  const notes = [];
  const addNote = (message) => {
    if (message && !notes.includes(message)) notes.push(message);
  };
  const energy = Number.parseInt(latestLog?.predicted_energy_level || latestLog?.energy_level, 10);
  const stress = Number.parseInt(latestLog?.stress_level, 10);
  const mood = Number.parseInt(latestLog?.mood_level, 10);
  const sleepHours = Number.parseFloat(latestLog?.sleep_hours);
  const hasCheckinData = Boolean(latestLog && (
    latestLog.mood_level !== undefined ||
    latestLog.energy_level !== undefined ||
    latestLog.stress_level !== undefined ||
    latestLog.sleep_hours !== undefined
  ));
  const hasTaskData = dayItems.length > 0 || waitingTasks.length > 0 || completedTasks.length > 0 || Boolean(currentTask);

  if (!hasCheckinData && !hasTaskData) {
    return ['No enough data yet: Add a daily check-in and tasks so the planner can generate personalized advice.'];
  }

  const completionPercentage = getCompletionPercentage(completedTasks.length, completedTasks.length + waitingTasks.length + (currentTask ? 1 : 0));
  const overrunCount = completedTasks.filter((item) => getActualDurationMinutes(item) > getPlannedDurationMinutes(item) * 1.25).length;
  const difficultFeedback = dayItems
    .flatMap((item) => Array.isArray(item.feedback) ? item.feedback : [])
    .filter((feedback) => Number.parseInt(feedback.difficulty_feedback, 10) >= 4);

  if (!Number.isNaN(energy) && energy >= 4 && !Number.isNaN(stress) && stress <= 2 && !Number.isNaN(sleepHours) && sleepHours >= 7 && (Number.isNaN(mood) || mood >= 4)) {
    addNote('Your energy is strong today. This is a good time for difficult tasks.');
  }

  if (!Number.isNaN(energy) && energy <= 2) {
    addNote('Your energy is low. Start with easier tasks and use shorter sessions.');
  }

  if (!Number.isNaN(stress) && stress >= 4) {
    addNote('Stress is high today. Avoid grouping too many hard tasks together.');
  }

  if (waitingTasks.length >= 3) {
    addNote('You still have several tasks waiting. Focus on the highest priority task first.');
  }

  if (completionPercentage === 100 && completedTasks.length > 0) {
    addNote('Excellent progress today. You completed all planned tasks.');
  } else if (completedTasks.length > 0 && completedTasks.length >= waitingTasks.length) {
    addNote('Good progress today. Keep using your strongest energy hours for difficult tasks.');
  }

  if (overrunCount > 0) {
    addNote('Some tasks took longer than expected. Similar tasks may need more time next time.');
  }

  if (difficultFeedback.length > 0) {
    addNote('The last task felt difficult. Consider adding a break before the next hard task.');
  }

  if (!currentTask && waitingTasks.length > 0) {
    addNote('Choose the next waiting task when you are ready to continue.');
  } else if (currentTask) {
    addNote(`${currentTask.title} is in progress. Keep the next step small and update feedback when you finish.`);
  }

  if (hasTaskData) {
    if (completedTasks.length > 0) {
      addNote(`You completed ${completedTasks.length} task${completedTasks.length === 1 ? '' : 's'} today. Use feedback from finished work to improve the next plan.`);
    }
    if (waitingTasks.length > 0) {
      addNote(`${waitingTasks.length} task${waitingTasks.length === 1 ? ' is' : 's are'} still waiting. Pick the highest-priority one before adding new work.`);
    }
    if (completionPercentage > 0 && completionPercentage < 100) {
      addNote(`Your current completion is ${completionPercentage}%. Keep the next session focused on one clear task.`);
    }
  } else {
    addNote('No enough data yet: Add tasks or generate a schedule so advice can connect to today\'s plan.');
  }

  if (hasCheckinData) {
    if (!Number.isNaN(sleepHours) && sleepHours >= 7 && (Number.isNaN(energy) || energy >= 3)) {
      addNote('Your sleep looks supportive today. Protect the time block where you feel most alert.');
    }
    if (!Number.isNaN(stress) && stress <= 2) {
      addNote('Stress looks manageable today. This is a good setup for steady focused work.');
    }
    if (!Number.isNaN(mood) && mood >= 4) {
      addNote('Your mood check-in is positive. Use that momentum on work that needs attention and patience.');
    }
  }

  if (breakItems.length > 0) {
    addNote(`Your schedule includes ${breakItems.length} break${breakItems.length === 1 ? '' : 's'}. Keep them as recovery time instead of treating them like tasks.`);
  }

  if (notes.length === 0) {
    addNote('Your current day looks balanced. Keep checking off subtasks and use feedback if anything feels harder than planned.');
  }

  if (hasTaskData && notes.length < 5) {
    addNote(`Plan snapshot: ${completedTasks.length} completed, ${waitingTasks.length} waiting, ${currentTask ? '1 in progress' : 'none in progress'}.`);
  }

  if (hasCheckinData && notes.length < 5) {
    addNote('Keep today realistic: match difficult work with your best energy and move non-urgent tasks if the day gets crowded.');
  }

  return notes;
}

function hasGeneratedPlanForDay(dayKey, schedule, items = [], tasks = []) {
  if (!dayKey) return false;
  return Boolean(schedule) && (
    datePart(schedule.schedule_date) === dayKey ||
    items.some((item) => datePart(item.start_time) === dayKey)
  );
}

function formatTimeRange(start, end) {
  return `${formatTime(start)} - ${formatTime(end)}`;
}

function formatTime(value) {
  if (!value) return '--:--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 5);
  return new Intl.DateTimeFormat('en', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}

function formatDateTime(value) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}

function validateSelectedDayInput(checkInDraft, addedTasks) {
  const sleepHours = Number.parseFloat(checkInDraft?.sleep_hours);
  if (Number.isNaN(sleepHours) || sleepHours < 0) {
    return {
      isValid: false,
      message: 'Complete the Daily Check-In: sleep hours is required.'
    };
  }

  if (!addedTasks || addedTasks.length === 0) {
    return {
      isValid: false,
      message: 'Please add at least one task before generating the schedule.'
    };
  }

  return {
    isValid: true,
    message: ''
  };
}

function createLocalTaskId() {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatSelectedDayHeading(day) {
  if (!day) return 'Selected Day';
  const date = day.date instanceof Date ? day.date : new Date(`${day.key}T00:00:00`);
  const weekday = new Intl.DateTimeFormat('en', { weekday: 'long' }).format(date);
  const shortDate = day.shortDate || `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
  return `${weekday}, ${shortDate}`;
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
