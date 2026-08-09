export function selectCanonicalScheduleRows(rows = []) {
  const latestBaseScheduleByDate = new Map();

  rows.forEach((row) => {
    if (!row?._schedule_date || row._schedule_status === 'manual') return;
    const current = latestBaseScheduleByDate.get(row._schedule_date);
    if (!current || compareScheduleRows(row, current) > 0) {
      latestBaseScheduleByDate.set(row._schedule_date, row);
    }
  });

  return rows
    .filter((row) => {
      const baseSchedule = latestBaseScheduleByDate.get(row._schedule_date);
      if (row._schedule_status !== 'manual') {
        return baseSchedule?._schedule_id === row._schedule_id;
      }
      return !baseSchedule || compareScheduleRows(row, baseSchedule) >= 0;
    })
    .map(stripScheduleMetadata);
}

export function reconcileScheduleItemsForDate(currentItems = [], completedHistory = [], tasks = [], date) {
  const taskById = new Map(tasks.map((task) => [task.task_id, task]));
  const itemsById = new Map();

  [...currentItems, ...completedHistory].forEach((item) => {
    if (item?.schedule_item_id) itemsById.set(item.schedule_item_id, item);
  });

  const items = [...itemsById.values()].filter((item) => {
    const task = taskById.get(item.task_id) || item.task || null;
    const completionDate = getCompletionDate(item, task);
    return !completionDate || completionDate === date;
  });
  const completedByTask = new Map();

  items.forEach((item) => {
    if (!item.task_id) return;
    const task = taskById.get(item.task_id) || item.task || null;
    if (getCompletionDate(item, task) !== date) return;
    const current = completedByTask.get(item.task_id);
    if (!current || compareCompletedItems(item, current) > 0) {
      completedByTask.set(item.task_id, item);
    }
  });

  const result = items.filter((item) => !item.task_id || !completedByTask.has(item.task_id));
  completedByTask.forEach((item) => {
    const task = taskById.get(item.task_id) || item.task || null;
    result.push({
      ...item,
      status: 'completed',
      completed_at: item.completed_at || task?.completed_at || null,
      actual_completed_at: item.actual_completed_at || item.completed_at || task?.completed_at || null
    });
  });

  return result.sort((a, b) => new Date(a.start_time || 0) - new Date(b.start_time || 0));
}

export function groupScheduleItemsByTask(items = []) {
  const groups = new Map();

  items.forEach((item) => {
    const key = item.task_id || item.schedule_item_id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });

  return [...groups.values()].map((group) => ({
    key: group[0].task_id || group[0].schedule_item_id,
    items: group,
    representative: chooseRepresentative(group),
    planned_minutes: group.reduce((sum, item) => sum + durationMinutes(item.start_time, item.end_time), 0)
  }));
}

function chooseRepresentative(items) {
  return [...items].sort((a, b) => {
    const statusDifference = statusRank(b.status) - statusRank(a.status);
    if (statusDifference !== 0) return statusDifference;
    return new Date(a.start_time || 0) - new Date(b.start_time || 0);
  })[0];
}

function statusRank(status) {
  return {
    in_progress: 4,
    completed: 3,
    overdue: 2,
    waiting: 1
  }[status] || 0;
}

function compareScheduleRows(left, right) {
  const timeDifference = new Date(left._schedule_generated_at || 0) - new Date(right._schedule_generated_at || 0);
  if (timeDifference !== 0) return timeDifference;
  return String(left._schedule_id || '').localeCompare(String(right._schedule_id || ''));
}

function compareCompletedItems(left, right) {
  const statusDifference = Number(left.status === 'completed') - Number(right.status === 'completed');
  if (statusDifference !== 0) return statusDifference;
  const leftTime = new Date(left.actual_completed_at || left.completed_at || left.updated_at || 0);
  const rightTime = new Date(right.actual_completed_at || right.completed_at || right.updated_at || 0);
  return leftTime - rightTime;
}

function stripScheduleMetadata(row) {
  const {
    _schedule_id: _scheduleId,
    _schedule_date: _scheduleDate,
    _schedule_status: _scheduleStatus,
    _schedule_generated_at: _scheduleGeneratedAt,
    ...item
  } = row;
  return item;
}

function getCompletionDate(item, task) {
  return dateOnly(
    item?.actual_completed_at ||
    item?.completed_at ||
    task?.completed_date ||
    task?.completed_on ||
    task?.completed_at
  );
}

function durationMinutes(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) return 0;
  return Math.max(1, Math.round((endDate - startDate) / 60000));
}

function dateOnly(value) {
  if (!value) return null;
  return String(value).slice(0, 10);
}
