CREATE DATABASE IF NOT EXISTS smart_day_planner;
USE smart_day_planner;

CREATE TABLE IF NOT EXISTS users (
  user_id VARCHAR(40) PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  profile_image LONGTEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_preferences (
  preference_id VARCHAR(40) PRIMARY KEY,
  user_id VARCHAR(40) NOT NULL UNIQUE,
  wake_up_time TIME DEFAULT '07:00:00',
  sleep_time TIME DEFAULT '22:30:00',
  preferred_start_time TIME DEFAULT '09:00:00',
  preferred_end_time TIME DEFAULT '18:00:00',
  break_duration_minutes INT DEFAULT 10,
  focus_session_minutes INT DEFAULT 60,
  language VARCHAR(40) DEFAULT 'English',
  theme VARCHAR(80) DEFAULT 'Blue / Teal',
  ai_recommendations_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  settings_json JSON,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS daily_checkins (
  checkin_id VARCHAR(40) PRIMARY KEY,
  user_id VARCHAR(40) NOT NULL,
  checkin_date DATE NOT NULL,
  mood_level TINYINT NOT NULL,
  energy_level TINYINT NOT NULL,
  sleep_hours DECIMAL(4,2) NOT NULL,
  stress_level TINYINT NOT NULL,
  is_tired BOOLEAN DEFAULT FALSE,
  planning_start TIME,
  planning_end TIME,
  mood_text_original TEXT,
  mood_text_translated TEXT,
  detected_language VARCHAR(20),
  detected_emotion VARCHAR(50),
  predicted_energy_level TINYINT,
  ai_advice TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_daily_checkins_user_date (user_id, checkin_date),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tasks (
  task_id VARCHAR(40) PRIMARY KEY,
  user_id VARCHAR(40) NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT,
  category VARCHAR(80),
  priority_level TINYINT NOT NULL DEFAULT 3,
  difficulty_level TINYINT NOT NULL DEFAULT 3,
  estimated_duration_minutes INT NOT NULL,
  remaining_duration_minutes INT,
  task_type VARCHAR(20) NOT NULL DEFAULT 'flexible',
  task_date DATE,
  deadline DATETIME,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  is_fixed_time BOOLEAN NOT NULL DEFAULT FALSE,
  fixed_date DATE,
  fixed_start_time TIME,
  fixed_end_time TIME,
  completed_on DATE,
  completed_date DATE,
  completed_at DATETIME,
  actual_duration_minutes INT,
  removed_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS schedules (
  schedule_id VARCHAR(40) PRIMARY KEY,
  user_id VARCHAR(40) NOT NULL,
  daily_checkin_id VARCHAR(40),
  schedule_date DATE NOT NULL,
  generated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  schedule_note TEXT,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (daily_checkin_id) REFERENCES daily_checkins(checkin_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS schedule_items (
  schedule_item_id VARCHAR(40) PRIMARY KEY,
  schedule_id VARCHAR(40) NOT NULL,
  task_id VARCHAR(40) NOT NULL,
  title VARCHAR(180) NOT NULL,
  category VARCHAR(80),
  difficulty_level TINYINT,
  priority_level TINYINT,
  start_time DATETIME NOT NULL,
  end_time DATETIME NOT NULL,
  energy_slot VARCHAR(20),
  task_kind VARCHAR(20) DEFAULT 'flexible',
  reason TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'waiting',
  started_at DATETIME,
  actual_started_at DATETIME,
  completed_at DATETIME,
  actual_completed_at DATETIME,
  restored_at DATETIME,
  removed_at DATETIME,
  actual_duration_minutes INT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (schedule_id) REFERENCES schedules(schedule_id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
);

SET @add_tasks_completed_date := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE tasks ADD COLUMN completed_date DATE AFTER completed_on',
    'SELECT 1'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'tasks'
    AND COLUMN_NAME = 'completed_date'
);
PREPARE add_tasks_completed_date_stmt FROM @add_tasks_completed_date;
EXECUTE add_tasks_completed_date_stmt;
DEALLOCATE PREPARE add_tasks_completed_date_stmt;

SET @add_schedule_items_actual_started_at := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE schedule_items ADD COLUMN actual_started_at DATETIME AFTER started_at',
    'SELECT 1'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'schedule_items'
    AND COLUMN_NAME = 'actual_started_at'
);
PREPARE add_schedule_items_actual_started_at_stmt FROM @add_schedule_items_actual_started_at;
EXECUTE add_schedule_items_actual_started_at_stmt;
DEALLOCATE PREPARE add_schedule_items_actual_started_at_stmt;

SET @add_schedule_items_actual_completed_at := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE schedule_items ADD COLUMN actual_completed_at DATETIME AFTER completed_at',
    'SELECT 1'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'schedule_items'
    AND COLUMN_NAME = 'actual_completed_at'
);
PREPARE add_schedule_items_actual_completed_at_stmt FROM @add_schedule_items_actual_completed_at;
EXECUTE add_schedule_items_actual_completed_at_stmt;
DEALLOCATE PREPARE add_schedule_items_actual_completed_at_stmt;

CREATE TABLE IF NOT EXISTS task_subtasks (
  subtask_id VARCHAR(40) PRIMARY KEY,
  user_id VARCHAR(40) NOT NULL,
  task_id VARCHAR(40) NOT NULL,
  schedule_item_id VARCHAR(40),
  title VARCHAR(220) NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  order_index INT NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  generated_by_ai BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE,
  FOREIGN KEY (schedule_item_id) REFERENCES schedule_items(schedule_item_id) ON DELETE CASCADE
);

SET @add_order_index := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE task_subtasks ADD COLUMN order_index INT NOT NULL DEFAULT 0 AFTER is_completed',
    'SELECT 1'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'task_subtasks'
    AND COLUMN_NAME = 'order_index'
);
PREPARE add_order_index_stmt FROM @add_order_index;
EXECUTE add_order_index_stmt;
DEALLOCATE PREPARE add_order_index_stmt;

SET @add_generated_by_ai := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE task_subtasks ADD COLUMN generated_by_ai BOOLEAN NOT NULL DEFAULT FALSE AFTER sort_order',
    'SELECT 1'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'task_subtasks'
    AND COLUMN_NAME = 'generated_by_ai'
);
PREPARE add_generated_by_ai_stmt FROM @add_generated_by_ai;
EXECUTE add_generated_by_ai_stmt;
DEALLOCATE PREPARE add_generated_by_ai_stmt;

CREATE TABLE IF NOT EXISTS task_resources (
  resource_id VARCHAR(40) PRIMARY KEY,
  user_id VARCHAR(40) NOT NULL,
  task_id VARCHAR(40) NOT NULL,
  schedule_item_id VARCHAR(40),
  resource_type VARCHAR(20) NOT NULL,
  label VARCHAR(180),
  value LONGTEXT NOT NULL,
  preview_url LONGTEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE,
  FOREIGN KEY (schedule_item_id) REFERENCES schedule_items(schedule_item_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS task_feedback (
  feedback_id VARCHAR(40) PRIMARY KEY,
  user_id VARCHAR(40) NOT NULL,
  task_id VARCHAR(40) NOT NULL,
  schedule_item_id VARCHAR(40),
  outcome VARCHAR(30) NOT NULL DEFAULT 'completed',
  completed BOOLEAN NOT NULL,
  actual_duration_minutes INT,
  difficulty_feedback TINYINT,
  energy_after TINYINT,
  mood_after TINYINT,
  comment TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE,
  FOREIGN KEY (schedule_item_id) REFERENCES schedule_items(schedule_item_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ai_notes (
  note_id VARCHAR(40) PRIMARY KEY,
  user_id VARCHAR(40) NOT NULL,
  note_date DATE NOT NULL,
  schedule_id VARCHAR(40),
  related_task_id VARCHAR(40),
  note_type VARCHAR(40) NOT NULL,
  title VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  scope VARCHAR(20) NOT NULL DEFAULT 'daily',
  priority TINYINT NOT NULL DEFAULT 3,
  source VARCHAR(40) NOT NULL DEFAULT 'rule_based',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (schedule_id) REFERENCES schedules(schedule_id) ON DELETE SET NULL,
  FOREIGN KEY (related_task_id) REFERENCES tasks(task_id) ON DELETE SET NULL
);

SET @add_ai_notes_scope := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE ai_notes ADD COLUMN scope VARCHAR(20) NOT NULL DEFAULT ''daily'' AFTER message',
    'SELECT 1'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ai_notes'
    AND COLUMN_NAME = 'scope'
);
PREPARE add_ai_notes_scope_stmt FROM @add_ai_notes_scope;
EXECUTE add_ai_notes_scope_stmt;
DEALLOCATE PREPARE add_ai_notes_scope_stmt;

SET @add_ai_notes_priority := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE ai_notes ADD COLUMN priority TINYINT NOT NULL DEFAULT 3 AFTER scope',
    'SELECT 1'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ai_notes'
    AND COLUMN_NAME = 'priority'
);
PREPARE add_ai_notes_priority_stmt FROM @add_ai_notes_priority;
EXECUTE add_ai_notes_priority_stmt;
DEALLOCATE PREPARE add_ai_notes_priority_stmt;

CREATE TABLE IF NOT EXISTS daily_evaluations (
  evaluation_id VARCHAR(40) PRIMARY KEY,
  user_id VARCHAR(40) NOT NULL,
  schedule_id VARCHAR(40),
  evaluation_date DATE NOT NULL,
  total_tasks INT NOT NULL DEFAULT 0,
  completed_tasks INT NOT NULL DEFAULT 0,
  unfinished_tasks INT NOT NULL DEFAULT 0,
  completion_percentage INT NOT NULL DEFAULT 0,
  productivity_score INT NOT NULL DEFAULT 0,
  planned_minutes INT NOT NULL DEFAULT 0,
  actual_minutes INT NOT NULL DEFAULT 0,
  average_mood DECIMAL(5,2),
  average_energy DECIMAL(5,2),
  average_stress DECIMAL(5,2),
  message TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_daily_evaluations_user_date (user_id, evaluation_date),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (schedule_id) REFERENCES schedules(schedule_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ai_predictions (
  prediction_id VARCHAR(40) PRIMARY KEY,
  user_id VARCHAR(40) NOT NULL,
  related_checkin_id VARCHAR(40),
  related_task_id VARCHAR(40),
  related_schedule_id VARCHAR(40),
  module_name VARCHAR(80) NOT NULL,
  model_name VARCHAR(120),
  source VARCHAR(40) NOT NULL DEFAULT 'python_ai_service',
  confidence DECIMAL(5,4),
  input_json JSON,
  output_json JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (related_checkin_id) REFERENCES daily_checkins(checkin_id) ON DELETE SET NULL,
  FOREIGN KEY (related_task_id) REFERENCES tasks(task_id) ON DELETE SET NULL,
  FOREIGN KEY (related_schedule_id) REFERENCES schedules(schedule_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS emotion_logs (
  emotion_log_id VARCHAR(40) PRIMARY KEY,
  user_id VARCHAR(40) NOT NULL,
  checkin_id VARCHAR(40),
  emotion VARCHAR(50),
  predicted_mood VARCHAR(50),
  stress_estimation TINYINT,
  fatigue_detected BOOLEAN NOT NULL DEFAULT FALSE,
  fatigue_score TINYINT,
  source VARCHAR(40) NOT NULL DEFAULT 'python_ai_service',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (checkin_id) REFERENCES daily_checkins(checkin_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS energy_predictions (
  energy_prediction_id VARCHAR(40) PRIMARY KEY,
  user_id VARCHAR(40) NOT NULL,
  checkin_id VARCHAR(40),
  predicted_energy_level TINYINT NOT NULL,
  energy_insight TEXT,
  confidence DECIMAL(5,4),
  source VARCHAR(40) NOT NULL DEFAULT 'python_ai_service',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (checkin_id) REFERENCES daily_checkins(checkin_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS recommendations (
  recommendation_id VARCHAR(40) PRIMARY KEY,
  user_id VARCHAR(40) NOT NULL,
  recommendation_date DATE,
  related_task_id VARCHAR(40),
  related_schedule_id VARCHAR(40),
  recommendation_type VARCHAR(60) NOT NULL,
  title VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  source VARCHAR(40) NOT NULL DEFAULT 'python_ai_service',
  confidence DECIMAL(5,4),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (related_task_id) REFERENCES tasks(task_id) ON DELETE SET NULL,
  FOREIGN KEY (related_schedule_id) REFERENCES schedules(schedule_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS scheduling_results (
  scheduling_result_id VARCHAR(40) PRIMARY KEY,
  user_id VARCHAR(40) NOT NULL,
  schedule_id VARCHAR(40),
  schedule_date DATE NOT NULL,
  ai_hints_json JSON,
  rule_summary_json JSON,
  final_decision_owner VARCHAR(80) NOT NULL DEFAULT 'node_rule_based_scheduler',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (schedule_id) REFERENCES schedules(schedule_id) ON DELETE CASCADE
);

INSERT INTO users (user_id, full_name, email, password_hash, profile_image)
SELECT 'user_demo', 'Sara Alhamede', 'sara@smart-planner.local', 'dev:demo123', NULL
WHERE NOT EXISTS (SELECT 1 FROM users LIMIT 1);

INSERT INTO user_preferences (
  preference_id,
  user_id,
  wake_up_time,
  sleep_time,
  preferred_start_time,
  preferred_end_time,
  break_duration_minutes,
  focus_session_minutes,
  language,
  theme,
  ai_recommendations_enabled,
  notifications_enabled
) SELECT
  'pref_demo',
  'user_demo',
  '07:00:00',
  '22:30:00',
  '09:00:00',
  '18:00:00',
  10,
  60,
  'English',
  'Blue / Teal',
  TRUE,
  TRUE
WHERE EXISTS (SELECT 1 FROM users WHERE user_id = 'user_demo')
  AND NOT EXISTS (SELECT 1 FROM user_preferences WHERE user_id = 'user_demo');
