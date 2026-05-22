import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Database,
  Flame,
  ListChecks,
  Pencil,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  Trash2
} from 'lucide-react';
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
  const [currentPage, setCurrentPage] = useState('weekly');
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedDayTasks, setSelectedDayTasks] = useState({});
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
    return result;
  }

  async function handleTaskSubmit(payload) {
    const result = await plannerApi.createTask({ ...payload, user_id: userId });
    await refreshTasks();
    setMessage(payload.is_fixed_time ? 'Fixed task added.' : 'Flexible task added.');
    return result;
  }

  async function handleGenerateSchedule() {
    const result = await plannerApi.generateSchedule({ user_id: userId });
    setSchedule(result.schedule);
    setScheduleItems(result.items || []);
    await refreshTasks();
    setMessage('Schedule generated.');
    return result;
  }

  async function handleGenerateSelectedDay(day, checkInDraft, addedTasks) {
    const dailyLogResult = await handleDailyLogSubmit({
      ...getDefaultCheckInDraft(),
      ...(checkInDraft || {}),
      log_date: day.key
    });

    for (const task of addedTasks) {
      await handleTaskSubmit(normalizeSelectedDayTask(task, day.key));
    }

    const result = await plannerApi.generateSchedule({
      user_id: userId,
      daily_log_id: dailyLogResult.daily_log.log_id
    });
    setSchedule(result.schedule);
    setScheduleItems(result.items || []);
    await refreshTasks();
    setMessage('Daily schedule generated for the selected day.');
    setSelectedDayTasks((current) => ({ ...current, [day.key]: [] }));
    setCurrentPage('generated');
    return result;
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
    setCurrentPage('weekly');
    setSelectedDay(null);
    setSelectedDayTasks({});
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
        ) : currentPage === 'weekly' ? (
          <WeeklyDashboard
            tasks={tasks}
            scheduleItems={scheduleItems}
            latestLog={bootstrap?.latest_daily_log}
            isLoading={isLoading}
            onSelectDay={(day) => {
              setSelectedDay(day);
              setCurrentPage(hasGeneratedPlanForDay(day.key, schedule, scheduleItems) ? 'generated' : 'day');
            }}
          />
        ) : currentPage === 'day' ? (
          <SelectedDayInputPage
            day={selectedDay}
            onBack={() => setCurrentPage('weekly')}
            onDailyLogSubmit={handleDailyLogSubmit}
            onGenerate={handleGenerateSelectedDay}
            latestLog={bootstrap?.latest_daily_log}
            addedTasks={selectedDayTasks[selectedDay?.key] || []}
            onAddedTasksChange={(dayKey, nextTasks) => {
              setSelectedDayTasks((current) => ({ ...current, [dayKey]: nextTasks }));
            }}
          />
        ) : currentPage === 'generated' ? (
          <DailyDetailsPage
            day={selectedDay}
            schedule={schedule}
            items={scheduleItems}
            tasks={tasks}
            latestLog={bootstrap?.latest_daily_log}
            onBack={() => setCurrentPage('day')}
            onWeekly={() => setCurrentPage('weekly')}
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

function WeeklyDashboard({ tasks, scheduleItems, latestLog, isLoading, onSelectDay }) {
  const weekDays = getCurrentWeekDays();
  const weeklyData = buildWeeklyDashboardData({ tasks, scheduleItems, latestLog, weekDays });

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

function SelectedDayInputPage({
  day,
  onBack,
  onDailyLogSubmit,
  onGenerate,
  latestLog,
  addedTasks,
  onAddedTasksChange
}) {
  const [checkInDraft, setCheckInDraft] = useState(getDefaultCheckInDraft());
  const [taskDraft, setTaskDraft] = useState(null);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const dayKey = day?.key || toDateKey(new Date());
  const dayTitle = formatSelectedDayHeading(day);
  const editingTask = addedTasks.find((task) => task.local_id === editingTaskId) || null;
  const validation = validateSelectedDayInput(checkInDraft, addedTasks);
  const canGenerate = validation.isValid && !isGenerating;

  async function handleTaskPreviewSubmit(task) {
    const preparedTask = {
      ...task,
      local_id: editingTaskId || task.local_id || createLocalTaskId(),
      task_date: dayKey
    };
    const nextTasks = editingTaskId
      ? addedTasks.map((item) => (item.local_id === editingTaskId ? preparedTask : item))
      : [...addedTasks, preparedTask];

    onAddedTasksChange(dayKey, nextTasks);
    setEditingTaskId(null);
  }

  function handleEditTask(task) {
    setEditingTaskId(task.local_id);
  }

  function handleDeleteTask(taskId) {
    const confirmed = window.confirm('Delete this task from Added Tasks?');
    if (!confirmed) return;

    onAddedTasksChange(dayKey, addedTasks.filter((task) => task.local_id !== taskId));
    if (editingTaskId === taskId) {
      setEditingTaskId(null);
    }
  }

  async function handleGenerateClick() {
    if (!validation.isValid) return;
    setIsGenerating(true);
    try {
      await onGenerate({ ...(day || {}), key: dayKey }, checkInDraft, addedTasks);
    } finally {
      setIsGenerating(false);
    }
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

function DailyDetailsPage({ day, schedule, items = [], tasks = [], latestLog, onBack, onWeekly }) {
  const dayKey = day?.key || datePart(schedule?.schedule_date) || toDateKey(new Date());
  const [detailItems, setDetailItems] = useState(() => initializeDailyDetailItems({ day, schedule, items, tasks }));
  const [notice, setNotice] = useState('');
  const [editingItemId, setEditingItemId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [activeTaskUi, setActiveTaskUi] = useState({});
  const details = splitDailyDetailItems(detailItems, latestLog);
  const currentTaskId = details.currentTask ? getDetailItemId(details.currentTask) : null;
  const currentTaskUi = details.currentTask
    ? activeTaskUi[currentTaskId] || buildActiveTaskUiState(details.currentTask)
    : null;
  const feedbackTask = currentTaskUi?.feedbackOpen ? details.currentTask : null;

  useEffect(() => {
    setDetailItems(initializeDailyDetailItems({ day, schedule, items, tasks }));
    setNotice('');
    setEditingItemId(null);
    setEditDraft(null);
    setActiveTaskUi({});
  }, [dayKey, schedule?.schedule_id, items, tasks]);

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

  function startTask(item) {
    if (item.task_kind === 'fixed') {
      setNotice('Fixed-time tasks start automatically at their scheduled time.');
      return;
    }

    const activeTask = detailItems.find((detailItem) => detailItem.status === 'in_progress');
    if (activeTask && getDetailItemId(activeTask) !== getDetailItemId(item)) {
      setNotice('Finish or return the current task before starting another one.');
      return;
    }

    setDetailItems((currentItems) => currentItems.map((detailItem) => (
      getDetailItemId(detailItem) === getDetailItemId(item)
        ? { ...detailItem, status: 'in_progress' }
        : detailItem
    )));
    setNotice('Task moved to In Progress.');
  }

  function finishTask(item) {
    setDetailItems((currentItems) => currentItems.map((detailItem) => (
      getDetailItemId(detailItem) === getDetailItemId(item)
        ? { ...detailItem, status: 'completed', completed_at: new Date().toISOString() }
        : detailItem
    )));
    setNotice('Task moved to Completed Tasks.');
  }

  function returnToWaiting(item) {
    setDetailItems((currentItems) => currentItems.map((detailItem) => (
      getDetailItemId(detailItem) === getDetailItemId(item)
        ? { ...detailItem, status: 'waiting' }
        : detailItem
    )));
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

  function toggleSubtask(item, subtaskId) {
    updateActiveTaskUi(item, (currentState) => ({
      ...currentState,
      subtasks: currentState.subtasks.map((subtask) => (
        subtask.id === subtaskId ? { ...subtask, completed: !subtask.completed } : subtask
      ))
    }));
  }

  function addTaskResource(item, type, value) {
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

    updateActiveTaskUi(item, (state) => ({
      ...state,
      [draftKey]: '',
      resources: [
        ...state.resources,
        {
          id: createLocalTaskId(),
          type,
          label: shortenUrl(rawValue),
          value: rawValue,
          preview: type === 'image' ? rawValue : ''
        }
      ]
    }));
  }

  function addImageResourceFromFile(item, file) {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setNotice('Please choose an image file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      updateActiveTaskUi(item, (state) => ({
        ...state,
        resources: [
          ...state.resources,
          {
            id: createLocalTaskId(),
            type: 'image',
            label: file.name,
            value: file.name,
            preview: reader.result
          }
        ]
      }));
      setNotice('Image resource added.');
    };
    reader.onerror = () => setNotice('Could not read this image. Please try another file.');
    reader.readAsDataURL(file);
  }

  function removeTaskResource(item, resourceId) {
    updateActiveTaskUi(item, (state) => ({
      ...state,
      resources: state.resources.filter((resource) => resource.id !== resourceId)
    }));
  }

  function openFeedbackPopup(item) {
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

  function submitProgressFeedback(item) {
    const currentState = activeTaskUi[getDetailItemId(item)] || buildActiveTaskUiState(item);
    const outcome = currentState.feedbackDraft.outcome;

    updateActiveTaskUi(item, {
      feedbackOpen: false,
      feedbackDraft: getDefaultProgressFeedbackDraft()
    });

    if (outcome === 'completed') {
      finishTask(item);
      setNotice('Feedback saved. Task moved to Completed Tasks.');
      return;
    }

    if (outcome === 'waiting') {
      returnToWaiting(item);
      setNotice('Feedback saved. Task returned to Waiting Tasks.');
      return;
    }

    setNotice('Feedback saved. Task is still in progress.');
  }

  function beginEdit(item) {
    setEditingItemId(getDetailItemId(item));
    setEditDraft(buildDailyTaskEditDraft(item));
  }

  function cancelEdit() {
    setEditingItemId(null);
    setEditDraft(null);
  }

  function saveEdit(item) {
    if (!editDraft?.title?.trim()) {
      setNotice('Task title is required before saving the update.');
      return;
    }

    if (editDraft.start_time && editDraft.end_time && editDraft.start_time >= editDraft.end_time) {
      setNotice('Task end time must be after the start time.');
      return;
    }

    setDetailItems((currentItems) => currentItems.map((detailItem) => (
      getDetailItemId(detailItem) === getDetailItemId(item)
        ? applyDailyTaskEdit(detailItem, editDraft, dayKey)
        : detailItem
    )));
    setNotice('Waiting task updated.');
    cancelEdit();
  }

  return (
    <section className="daily-details-page">
      <div className="daily-details-hero">
        <div>
          <p className="eyebrow">Daily Details</p>
          <h1>{formatSelectedDayHeading(day)}</h1>
          <span>View and manage the generated plan for this day.</span>
        </div>
        <button className="text-action compact" type="button" onClick={onWeekly}>
          <ArrowLeft size={16} />
          Back to weekly dashboard
        </button>
      </div>

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
            <div className="detail-task-list">
              {details.completedTasks.map((item) => (
                <DailyDetailTaskCard item={item} key={getDetailItemId(item)} completed />
              ))}
            </div>
          )}
        </section>

        <section className="daily-details-card timeline-card">
          <DailyDetailsCardHeader icon={Clock3} eyebrow="Overview" title="Daily Timeline" />
          {details.timeline.length === 0 ? (
            <p className="no-results">No timeline yet</p>
          ) : (
            <div className="timeline-list">
              {details.timeline.map((item) => (
                <article className={`timeline-row ${item.status}`} key={getDetailItemId(item)}>
                  <time>{formatTimeRange(item.start_time, item.end_time)}</time>
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.reason || 'Planned schedule block'}</span>
                    <em>{formatTaskStatus(item.status)}</em>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="daily-details-card advice-card">
          <DailyDetailsCardHeader icon={Sparkles} eyebrow="Smart Notes" title="AI Notes & Advice" />
          {details.advice.length === 0 ? (
            <p className="no-results">No advice yet</p>
          ) : (
            <div className="advice-list">
              {details.advice.map((note) => (
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

      <button className="secondary-action details-back-action" type="button" onClick={onBack}>
        <ArrowLeft size={18} />
        Back to selected day input
      </button>
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
            <article className="added-task-card" key={task.local_id}>
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
                <button className="delete" type="button" onClick={() => onDelete(task.local_id)}>
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
  onReturn
}) {
  const completedSubtasks = uiState.subtasks.filter((subtask) => subtask.completed).length;
  const totalSubtasks = uiState.subtasks.length || 1;
  const progress = Math.round((completedSubtasks / totalSubtasks) * 100);
  const readyToFinish = progress === 100;

  return (
    <article className="in-progress-task-card">
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
          {uiState.subtasks.map((subtask) => (
            <label className="subtask-row" key={subtask.id}>
              <input
                type="checkbox"
                checked={subtask.completed}
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
        {uiState.resources.length === 0 ? (
          <p className="resource-empty">No resources added yet.</p>
        ) : (
          <div className="resource-chip-list">
            {uiState.resources.map((resource) => (
              <ResourceChip
                key={resource.id}
                resource={resource}
                onRemove={() => onRemoveResource?.(item, resource.id)}
              />
            ))}
          </div>
        )}
      </section>

      <div className="detail-task-actions active-actions">
        <button type="button" onClick={() => onOpenFeedback?.(item)}>
          Feedback
        </button>
        <button className={readyToFinish ? 'finish-ready' : ''} type="button" onClick={() => onFinish?.(item)}>
          <CheckCircle2 size={15} />
          Finish Task
        </button>
        <button className="secondary" type="button" onClick={() => onReturn?.(item)}>
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
    <span className={`resource-chip ${resource.type}`}>
      {resource.type === 'link' ? (
        <a href={resource.value} target="_blank" rel="noreferrer">
          {chipContent}
        </a>
      ) : (
        chipContent
      )}
      <button type="button" aria-label={`Remove ${resource.label}`} onClick={onRemove}>
        x
      </button>
    </span>
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
  onReturn
}) {
  const isFixed = item.task_kind === 'fixed';

  return (
    <article className={`detail-task-card ${completed ? 'completed' : ''}`}>
      {isEditing ? (
        <DailyTaskEditForm
          draft={editDraft}
          onChange={onEditDraftChange}
          onSave={() => onSaveEdit?.(item)}
          onCancel={onCancelEdit}
        />
      ) : (
        <>
          <div>
            <strong>{item.title}</strong>
            <span>{formatTimeRange(item.start_time, item.end_time)}</span>
          </div>
          <div className="chip-line">
            <span>{isFixed ? 'fixed-time' : 'flexible'}</span>
            <span>Difficulty {item.difficulty_level || item.task?.difficulty_level || 3}</span>
            <span>Priority {item.task?.priority_level || item.priority_level || 3}</span>
            <span>{formatTaskStatus(item.status)}</span>
          </div>
          {showProgress ? (
            <div className="task-progress-line">
              <i style={{ width: `${item.progress || 45}%` }}></i>
            </div>
          ) : null}
          {mode === 'waiting' ? (
            <div className="detail-task-actions">
              <button type="button" onClick={() => onEdit?.(item)}>
                <Pencil size={15} />
                Edit
              </button>
              <button type="button" onClick={() => onStart?.(item)}>
                <PlayCircle size={15} />
                {isFixed ? 'Auto Start' : 'Start'}
              </button>
            </div>
          ) : null}
          {mode === 'progress' ? (
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

function buildWeeklyDashboardData({ tasks = [], scheduleItems = [], latestLog, weekDays }) {
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
    const key = getTaskWeekDateKey(task, scheduleDateByTask, weekKeys);
    if (key) {
      tasksByDay.get(key)?.push(task);
    }
  });

  const stressByDay = new Map();
  if (latestLog?.log_date && weekKeys.has(datePart(latestLog.log_date))) {
    stressByDay.set(datePart(latestLog.log_date), Number.parseInt(latestLog.stress_level, 10) || 0);
  }

  const isNewUser = tasks.length === 0 && scheduleItems.length === 0 && !latestLog;
  const days = weekDays.map((day) => {
    const dayTasks = tasksByDay.get(day.key) || [];
    const totalTasks = dayTasks.length;
    const completedTasks = dayTasks.filter(isTaskCompleted).length;
    const rawProgress = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;
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
  const score = weeklyTasks.length ? Math.round((completed / weeklyTasks.length) * 100) : null;
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

function getDayCircleLabel({ isNewUser, isFuture, totalTasks, rawProgress }) {
  if (isNewUser) return 'No results';
  if (isFuture && totalTasks > 0) return `${totalTasks} planned`;
  if (totalTasks === 0) return 'No tasks';
  return `${rawProgress}% done`;
}

function isTaskCompleted(task) {
  return Boolean(task.is_completed) || task.status === 'completed';
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

function buildDailyDetailsData({ day, schedule, items, tasks, latestLog }) {
  const detailItems = initializeDailyDetailItems({ day, schedule, items, tasks });
  return splitDailyDetailItems(detailItems, latestLog);
}

function initializeDailyDetailItems({ day, schedule, items = [], tasks = [] }) {
  const dayKey = day?.key || datePart(schedule?.schedule_date);
  const taskById = new Map(tasks.map((task) => [task.task_id, task]));
  const now = new Date();

  return items
    .filter((item) => !dayKey || datePart(item.start_time) === dayKey || datePart(schedule?.schedule_date) === dayKey)
    .map((item, index) => {
      const task = taskById.get(item.task_id);
      const taskKind = item.task_kind || (task?.is_fixed_time ? 'fixed' : 'flexible');
      const detailItem = {
        ...item,
        detail_id: item.schedule_item_id || item.task_id || `daily_item_${index}`,
        task,
        task_kind: taskKind,
        status: normalizeDailyTaskStatus(item, task, taskKind, now)
      };
      return detailItem;
    })
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
}

function splitDailyDetailItems(detailItems, latestLog) {
  const sortedItems = [...detailItems].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  const currentTask = sortedItems.find((item) => item.status === 'in_progress') || null;
  const completedTasks = sortedItems.filter((item) => item.status === 'completed');
  const waitingTasks = sortedItems.filter((item) => item.status === 'waiting');
  const advice = buildDailyAdvice({ waitingTasks, completedTasks, currentTask, latestLog, dayItems: sortedItems });

  return {
    waitingTasks,
    currentTask,
    completedTasks,
    timeline: sortedItems,
    advice
  };
}

function normalizeDailyTaskStatus(item, task, taskKind, now) {
  if (item.status === 'completed' || task?.is_completed) return 'completed';
  if (item.status === 'in_progress' || item.status === 'active') return 'in_progress';

  if (taskKind === 'fixed') {
    const start = new Date(item.start_time);
    const end = new Date(item.end_time);
    if (isValidDate(end) && now >= end) return 'completed';
    if (isValidDate(start) && isValidDate(end) && now >= start && now < end) return 'in_progress';
  }

  return 'waiting';
}

function applyFixedTimeAutomation(items, now) {
  let notice = '';
  const nextItems = items.map((item) => {
    if (item.task_kind !== 'fixed') return item;

    const start = new Date(item.start_time);
    const end = new Date(item.end_time);
    if (!isValidDate(start) || !isValidDate(end)) return item;
    if (now >= end && item.status !== 'completed') {
      return { ...item, status: 'completed', completed_at: now.toISOString() };
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
      return { ...item, status: 'in_progress' };
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
  const activeItems = items.filter((item) => item.status === 'in_progress');
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
  return {
    subtasks: buildExampleSubtasks(item),
    resources: [],
    imageDraft: '',
    linkDraft: '',
    feedbackOpen: false,
    feedbackDraft: getDefaultProgressFeedbackDraft()
  };
}

function buildExampleSubtasks(item) {
  const title = item?.title || 'current task';
  return [
    { id: 'step_1', title: `Plan the main steps for "${title}"`, completed: false },
    { id: 'step_2', title: 'Work on the main part', completed: false },
    { id: 'step_3', title: 'Review and fix issues', completed: false }
  ];
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
  if (status === 'in_progress') return 'in progress';
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

function buildDailyAdvice({ waitingTasks, completedTasks, currentTask, latestLog, dayItems }) {
  if (dayItems.length === 0) return [];

  const notes = [];
  const energy = Number.parseInt(latestLog?.predicted_energy_level || latestLog?.energy_level, 10);
  const stress = Number.parseInt(latestLog?.stress_level, 10);

  if (completedTasks.length > 0 && completedTasks.length >= waitingTasks.length) {
    notes.push('You are progressing well today. Keep your focus window for difficult tasks.');
  }

  if (!Number.isNaN(energy) && energy <= 2) {
    notes.push('Your energy seems low. Try moving heavy tasks later or use shorter focus blocks.');
  }

  if (!Number.isNaN(stress) && stress >= 4) {
    notes.push('Stress is high today. Add short breaks between difficult tasks.');
  }

  if (!currentTask && waitingTasks.length > 0) {
    notes.push('Choose the next waiting task when you are ready to continue.');
  }

  if (notes.length === 0) {
    notes.push('No advice yet');
  }

  return notes;
}

function hasGeneratedPlanForDay(dayKey, schedule, items) {
  if (!dayKey || !schedule || items.length === 0) return false;
  return datePart(schedule.schedule_date) === dayKey || items.some((item) => datePart(item.start_time) === dayKey);
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
