import { pool } from './mysqlPool.js';

async function one(sql, params = {}) {
  const [rows] = await pool.execute(sql, params);
  return rows[0] || null;
}

async function many(sql, params = {}) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

function cleanRecord(record) {
  return Object.fromEntries(
    Object.entries(record)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, normalizeMysqlValue(value)])
  );
}

function normalizeMysqlValue(value) {
  if (value instanceof Date) {
    return formatMysqlDateTime(value);
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    return formatMysqlDateTime(new Date(value));
  }
  if (value && typeof value === 'object') {
    return JSON.stringify(value);
  }
  return value;
}

function formatMysqlDateTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-') + ' ' + [
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0')
  ].join(':');
}

async function insert(table, record, executor = pool) {
  const clean = cleanRecord(record);
  const columns = Object.keys(clean);
  const placeholders = columns.map((column) => `:${column}`).join(', ');
  await executor.execute(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
    clean
  );
  return record;
}

async function update(table, idColumn, id, updates, executor = pool) {
  const clean = cleanRecord(updates);
  const columns = Object.keys(clean);
  if (columns.length === 0) return;
  const assignments = columns.map((column) => `${column} = :${column}`).join(', ');
  await executor.execute(
    `UPDATE ${table} SET ${assignments} WHERE ${idColumn} = :id`,
    { ...clean, id }
  );
}

function withLegacyCheckin(row) {
  if (!row) return null;
  return {
    ...row,
    log_id: row.checkin_id,
    daily_log_id: row.checkin_id,
    log_date: row.checkin_date
  };
}

function withLegacySchedule(row) {
  if (!row) return null;
  return {
    ...row,
    daily_log_id: row.daily_checkin_id
  };
}

function buildInClause(values, prefix) {
  const params = {};
  const placeholders = values.map((value, index) => {
    const key = `${prefix}${index}`;
    params[key] = value;
    return `:${key}`;
  });
  return { clause: placeholders.join(', '), params };
}

async function hydrateScheduleItems(items) {
  if (items.length === 0) return [];

  const scheduleItemIds = items.map((item) => item.schedule_item_id).filter(Boolean);
  const taskIds = [...new Set(items.map((item) => item.task_id).filter(Boolean))];

  const [subtasks, resources, feedback] = await Promise.all([
    listSubtasksForScheduleItems(scheduleItemIds),
    listResourcesForScheduleItems(scheduleItemIds),
    listFeedbackForScheduleItems(scheduleItemIds)
  ]);

  const subtasksByItem = groupBy(subtasks, 'schedule_item_id');
  const resourcesByItem = groupBy(resources, 'schedule_item_id');
  const feedbackByItem = groupBy(feedback, 'schedule_item_id');
  const taskById = taskIds.length > 0
    ? new Map((await listTasksByIds(taskIds)).map((task) => [task.task_id, task]))
    : new Map();

  return items.map((item) => ({
    ...item,
    task: taskById.get(item.task_id) || null,
    subtasks: subtasksByItem.get(item.schedule_item_id) || [],
    resources: resourcesByItem.get(item.schedule_item_id) || [],
    feedback: feedbackByItem.get(item.schedule_item_id) || []
  }));
}

function groupBy(rows, key) {
  const grouped = new Map();
  rows.forEach((row) => {
    const value = row[key];
    if (!grouped.has(value)) grouped.set(value, []);
    grouped.get(value).push(row);
  });
  return grouped;
}

async function listTasksByIds(taskIds) {
  if (taskIds.length === 0) return [];
  const { clause, params } = buildInClause(taskIds, 'taskId');
  return many(`SELECT * FROM tasks WHERE task_id IN (${clause})`, params);
}

async function listSubtasksForScheduleItems(scheduleItemIds) {
  if (scheduleItemIds.length === 0) return [];
  const { clause, params } = buildInClause(scheduleItemIds, 'itemId');
  return many(
    `SELECT * FROM task_subtasks
     WHERE schedule_item_id IN (${clause})
     ORDER BY COALESCE(NULLIF(order_index, 0), sort_order) ASC, created_at ASC`,
    params
  );
}

async function listResourcesForScheduleItems(scheduleItemIds) {
  if (scheduleItemIds.length === 0) return [];
  const { clause, params } = buildInClause(scheduleItemIds, 'itemId');
  return many(
    `SELECT * FROM task_resources WHERE schedule_item_id IN (${clause}) ORDER BY created_at ASC`,
    params
  );
}

async function listFeedbackForScheduleItems(scheduleItemIds) {
  if (scheduleItemIds.length === 0) return [];
  const { clause, params } = buildInClause(scheduleItemIds, 'itemId');
  return many(
    `SELECT * FROM task_feedback WHERE schedule_item_id IN (${clause}) ORDER BY created_at ASC`,
    params
  );
}

export const mysqlStore = {
  async healthCheck() {
    const row = await one('SELECT DATABASE() AS database_name, 1 AS connected');
    return {
      connected: row?.connected === 1,
      database: row?.database_name || null,
      store: 'mysql'
    };
  },

  getUser(userId) {
    return one('SELECT * FROM users WHERE user_id = :userId', { userId });
  },

  getUserByEmail(email) {
    return one('SELECT * FROM users WHERE email = :email', { email });
  },

  async insertUserWithPreferences(user, preferences) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await insert('users', user, connection);
      await insert('user_preferences', preferences, connection);
      await connection.commit();
      return { user, preferences };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  async updateUser(userId, updates) {
    await update('users', 'user_id', userId, updates);
    return this.getUser(userId);
  },

  getUserPreferences(userId) {
    return one('SELECT * FROM user_preferences WHERE user_id = :userId', { userId });
  },

  async upsertUserPreferences(record) {
    const clean = cleanRecord(record);
    const columns = Object.keys(clean);
    const placeholders = columns.map((column) => `:${column}`).join(', ');
    const updates = columns
      .filter((column) => column !== 'preference_id' && column !== 'user_id' && column !== 'created_at')
      .map((column) => `${column} = VALUES(${column})`)
      .join(', ');
    await pool.execute(
      `INSERT INTO user_preferences (${columns.join(', ')}) VALUES (${placeholders})
       ON DUPLICATE KEY UPDATE ${updates}`,
      clean
    );
    return this.getUserPreferences(record.user_id);
  },

  async listDailyLogs(userId) {
    const rows = await many(
      'SELECT * FROM daily_checkins WHERE user_id = :userId ORDER BY checkin_date ASC, created_at ASC',
      { userId }
    );
    return rows.map(withLegacyCheckin);
  },

  async getDailyLog(checkinId) {
    const row = await one('SELECT * FROM daily_checkins WHERE checkin_id = :checkinId', { checkinId });
    return withLegacyCheckin(row);
  },

  async getDailyLogByDate(userId, checkinDate) {
    const row = await one(
      'SELECT * FROM daily_checkins WHERE user_id = :userId AND checkin_date = :checkinDate',
      { userId, checkinDate }
    );
    return withLegacyCheckin(row);
  },

  async insertDailyLog(record) {
    const checkin = {
      ...record,
      checkin_id: record.checkin_id || record.log_id,
      checkin_date: record.checkin_date || record.log_date
    };
    delete checkin.log_id;
    delete checkin.log_date;
    delete checkin.daily_log_id;

    const clean = cleanRecord(checkin);
    const columns = Object.keys(clean);
    const placeholders = columns.map((column) => `:${column}`).join(', ');
    const updates = columns
      .filter((column) => !['checkin_id', 'user_id', 'checkin_date', 'created_at'].includes(column))
      .map((column) => `${column} = VALUES(${column})`)
      .join(', ');

    await pool.execute(
      `INSERT INTO daily_checkins (${columns.join(', ')}) VALUES (${placeholders})
       ON DUPLICATE KEY UPDATE ${updates}`,
      clean
    );

    return this.getDailyLogByDate(checkin.user_id, checkin.checkin_date);
  },

  listTasks(userId) {
    return many('SELECT * FROM tasks WHERE user_id = :userId ORDER BY created_at DESC', { userId });
  },

  getTask(taskId) {
    return one('SELECT * FROM tasks WHERE task_id = :taskId', { taskId });
  },

  insertTask(record) {
    return insert('tasks', record);
  },

  async updateTask(taskId, updates) {
    await update('tasks', 'task_id', taskId, { ...updates, updated_at: updates.updated_at || new Date().toISOString() });
    return this.getTask(taskId);
  },

  listFixedTasks(userId, fixedDate) {
    return many(
      `SELECT * FROM tasks
       WHERE user_id = :userId
         AND fixed_date = :fixedDate
         AND is_fixed_time = TRUE
         AND is_completed = FALSE
         AND status NOT IN ('removed', 'deleted')`,
      { userId, fixedDate }
    );
  },

  async listSchedules(userId) {
    const rows = await many(
      'SELECT * FROM schedules WHERE user_id = :userId ORDER BY generated_at ASC',
      { userId }
    );
    return rows.map(withLegacySchedule);
  },

  async getSchedule(scheduleId) {
    const row = await one('SELECT * FROM schedules WHERE schedule_id = :scheduleId', { scheduleId });
    return withLegacySchedule(row);
  },

  async getScheduleByDate(userId, scheduleDate) {
    const row = await one(
      `SELECT * FROM schedules
       WHERE user_id = :userId AND schedule_date = :scheduleDate AND status <> 'replaced'
       ORDER BY generated_at DESC LIMIT 1`,
      { userId, scheduleDate }
    );
    return withLegacySchedule(row);
  },

  async listScheduleItems(scheduleId) {
    const rows = await many(
      'SELECT * FROM schedule_items WHERE schedule_id = :scheduleId ORDER BY start_time ASC',
      { scheduleId }
    );
    return hydrateScheduleItems(rows);
  },

  async listAllScheduleItems(userId) {
    const rows = await many(
      `SELECT si.*
       FROM schedule_items si
       INNER JOIN schedules s ON s.schedule_id = si.schedule_id
       WHERE s.user_id = :userId
         AND s.status <> 'replaced'
         AND si.status <> 'removed'
       ORDER BY si.start_time ASC`,
      { userId }
    );
    return hydrateScheduleItems(rows);
  },

  async listScheduleItemsForDate(userId, scheduleDate) {
    const rows = await many(
      `SELECT si.*
       FROM schedule_items si
       INNER JOIN schedules s ON s.schedule_id = si.schedule_id
       WHERE s.user_id = :userId
         AND DATE(si.start_time) = :scheduleDate
         AND s.status <> 'replaced'
         AND si.status <> 'removed'
       ORDER BY si.start_time ASC`,
      { userId, scheduleDate }
    );
    return hydrateScheduleItems(rows);
  },

  async archiveGeneratedSchedulesForDate(userId, scheduleDate, excludeScheduleId = null) {
    await pool.execute(
      `UPDATE schedules
       SET status = 'replaced'
       WHERE user_id = :userId
         AND schedule_date = :scheduleDate
         AND (:excludeScheduleId IS NULL OR schedule_id <> :excludeScheduleId)
         AND status IN ('active', 'rescheduled')`,
      { userId, scheduleDate, excludeScheduleId }
    );
  },

  async getScheduleItem(scheduleItemId) {
    const rows = await hydrateScheduleItems(await many(
      'SELECT * FROM schedule_items WHERE schedule_item_id = :scheduleItemId',
      { scheduleItemId }
    ));
    return rows[0] || null;
  },

  async updateScheduleItem(scheduleItemId, updates) {
    await update('schedule_items', 'schedule_item_id', scheduleItemId, updates);
    return this.getScheduleItem(scheduleItemId);
  },

  async insertScheduleWithItems(schedule, items) {
    const connection = await pool.getConnection();
    const dbSchedule = {
      ...schedule,
      daily_checkin_id: schedule.daily_checkin_id || schedule.daily_log_id
    };
    delete dbSchedule.daily_log_id;

    try {
      await connection.beginTransaction();
      await insert('schedules', dbSchedule, connection);
      for (const item of items) {
        await insert('schedule_items', item, connection);
      }
      await connection.commit();
      return { schedule: withLegacySchedule(dbSchedule), items: await this.listScheduleItems(dbSchedule.schedule_id) };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  listFeedback(userId) {
    return many('SELECT * FROM task_feedback WHERE user_id = :userId ORDER BY created_at ASC', { userId });
  },

  insertFeedback(record) {
    return insert('task_feedback', record);
  },

  listAiNotes(userId) {
    return many('SELECT * FROM ai_notes WHERE user_id = :userId ORDER BY note_date DESC, created_at DESC', { userId });
  },

  insertAiNote(record) {
    return insert('ai_notes', record);
  },

  insertAiPrediction(record) {
    return insert('ai_predictions', record);
  },

  insertEmotionLog(record) {
    return insert('emotion_logs', record);
  },

  insertEnergyPrediction(record) {
    return insert('energy_predictions', record);
  },

  insertRecommendation(record) {
    return insert('recommendations', record);
  },

  insertSchedulingResult(record) {
    return insert('scheduling_results', record);
  },

  listDailyEvaluations(userId) {
    return many(
      'SELECT * FROM daily_evaluations WHERE user_id = :userId ORDER BY evaluation_date ASC',
      { userId }
    );
  },

  async upsertDailyEvaluation(record) {
    const clean = cleanRecord(record);
    const columns = Object.keys(clean);
    const placeholders = columns.map((column) => `:${column}`).join(', ');
    const updates = columns
      .filter((column) => !['evaluation_id', 'user_id', 'evaluation_date', 'created_at'].includes(column))
      .map((column) => `${column} = VALUES(${column})`)
      .join(', ');
    await pool.execute(
      `INSERT INTO daily_evaluations (${columns.join(', ')}) VALUES (${placeholders})
       ON DUPLICATE KEY UPDATE ${updates}`,
      clean
    );
    return one(
      'SELECT * FROM daily_evaluations WHERE user_id = :user_id AND evaluation_date = :evaluation_date',
      { user_id: record.user_id, evaluation_date: record.evaluation_date }
    );
  },

  getSubtask(subtaskId) {
    return one('SELECT * FROM task_subtasks WHERE subtask_id = :subtaskId', { subtaskId });
  },

  listSubtasksForScheduleItem(scheduleItemId) {
    return many(
      `SELECT * FROM task_subtasks
       WHERE schedule_item_id = :scheduleItemId
       ORDER BY COALESCE(NULLIF(order_index, 0), sort_order) ASC, created_at ASC`,
      { scheduleItemId }
    );
  },

  async replaceSubtasksForScheduleItem(scheduleItemId, subtasks) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute('DELETE FROM task_subtasks WHERE schedule_item_id = :scheduleItemId', { scheduleItemId });
      for (const subtask of subtasks) {
        await insert('task_subtasks', subtask, connection);
      }
      await connection.commit();
      return this.listSubtasksForScheduleItem(scheduleItemId);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  async updateSubtask(subtaskId, updates) {
    await update('task_subtasks', 'subtask_id', subtaskId, updates);
    return this.getSubtask(subtaskId);
  },

  insertResource(record) {
    return insert('task_resources', record);
  },

  async deleteResource(resourceId) {
    const resource = await one('SELECT * FROM task_resources WHERE resource_id = :resourceId', { resourceId });
    await pool.execute('DELETE FROM task_resources WHERE resource_id = :resourceId', { resourceId });
    return resource;
  }
};
