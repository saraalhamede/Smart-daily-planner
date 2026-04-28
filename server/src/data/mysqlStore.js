import { pool } from './mysqlPool.js';

async function one(sql, params = {}) {
  const [rows] = await pool.execute(sql, params);
  return rows[0] || null;
}

async function many(sql, params = {}) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function insert(table, record, executor = pool) {
  const columns = Object.keys(record);
  const placeholders = columns.map((column) => `:${column}`).join(', ');
  await executor.execute(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
    record
  );
  return record;
}

export const mysqlStore = {
  getUser(userId) {
    return one('SELECT * FROM users WHERE user_id = :userId', { userId });
  },

  getUserPreferences(userId) {
    return one('SELECT * FROM user_preferences WHERE user_id = :userId', { userId });
  },

  listDailyLogs(userId) {
    return many('SELECT * FROM daily_logs WHERE user_id = :userId ORDER BY created_at ASC', { userId });
  },

  getDailyLog(logId) {
    return one('SELECT * FROM daily_logs WHERE log_id = :logId', { logId });
  },

  insertDailyLog(record) {
    return insert('daily_logs', record);
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
    const columns = Object.keys(updates);
    if (columns.length === 0) return this.getTask(taskId);
    const assignments = columns.map((column) => `${column} = :${column}`).join(', ');
    await pool.execute(
      `UPDATE tasks SET ${assignments} WHERE task_id = :taskId`,
      { ...updates, taskId }
    );
    return this.getTask(taskId);
  },

  listFixedTasks(userId, fixedDate) {
    return many(
      'SELECT * FROM tasks WHERE user_id = :userId AND fixed_date = :fixedDate AND is_fixed_time = TRUE AND is_completed = FALSE',
      { userId, fixedDate }
    );
  },

  listSchedules(userId) {
    return many('SELECT * FROM schedules WHERE user_id = :userId ORDER BY generated_at ASC', { userId });
  },

  getSchedule(scheduleId) {
    return one('SELECT * FROM schedules WHERE schedule_id = :scheduleId', { scheduleId });
  },

  listScheduleItems(scheduleId) {
    return many('SELECT * FROM schedule_items WHERE schedule_id = :scheduleId ORDER BY start_time ASC', { scheduleId });
  },

  getScheduleItem(scheduleItemId) {
    return one('SELECT * FROM schedule_items WHERE schedule_item_id = :scheduleItemId', { scheduleItemId });
  },

  async insertScheduleWithItems(schedule, items) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await insert('schedules', schedule, connection);
      for (const item of items) {
        await insert('schedule_items', item, connection);
      }
      await connection.commit();
      return { schedule, items };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  listFeedback(userId) {
    return many('SELECT * FROM feedback WHERE user_id = :userId ORDER BY created_at ASC', { userId });
  },

  insertFeedback(record) {
    return insert('feedback', record);
  }
};
