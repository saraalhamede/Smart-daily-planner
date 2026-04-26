CREATE TABLE users (
  user_id VARCHAR(40) PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  preferred_language VARCHAR(20) DEFAULT 'en',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_preferences (
  preference_id VARCHAR(40) PRIMARY KEY,
  user_id VARCHAR(40) NOT NULL,
  wake_up_time TIME DEFAULT '07:00:00',
  sleep_time TIME DEFAULT '22:30:00',
  preferred_study_start TIME DEFAULT '09:00:00',
  preferred_study_end TIME DEFAULT '18:00:00',
  break_duration_minutes INT DEFAULT 10,
  max_daily_tasks INT DEFAULT 6,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE daily_logs (
  log_id VARCHAR(40) PRIMARY KEY,
  user_id VARCHAR(40) NOT NULL,
  log_date DATE NOT NULL,
  mood_level TINYINT NOT NULL,
  energy_level TINYINT NOT NULL,
  stress_level TINYINT NOT NULL,
  sleep_hours DECIMAL(4,2),
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
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE tasks (
  task_id VARCHAR(40) PRIMARY KEY,
  user_id VARCHAR(40) NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT,
  category VARCHAR(80),
  priority_level TINYINT NOT NULL DEFAULT 3,
  difficulty_level TINYINT NOT NULL DEFAULT 3,
  estimated_duration_minutes INT,
  remaining_duration_minutes INT,
  deadline DATETIME,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  is_fixed_time BOOLEAN NOT NULL DEFAULT FALSE,
  fixed_date DATE,
  fixed_start_time TIME,
  fixed_end_time TIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE schedules (
  schedule_id VARCHAR(40) PRIMARY KEY,
  user_id VARCHAR(40) NOT NULL,
  daily_log_id VARCHAR(40),
  schedule_date DATE NOT NULL,
  generated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  schedule_note TEXT,
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (daily_log_id) REFERENCES daily_logs(log_id)
);

CREATE TABLE schedule_items (
  schedule_item_id VARCHAR(40) PRIMARY KEY,
  schedule_id VARCHAR(40) NOT NULL,
  task_id VARCHAR(40) NOT NULL,
  start_time DATETIME NOT NULL,
  end_time DATETIME NOT NULL,
  energy_slot VARCHAR(20),
  task_kind VARCHAR(20) DEFAULT 'flexible',
  reason TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'planned',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (schedule_id) REFERENCES schedules(schedule_id),
  FOREIGN KEY (task_id) REFERENCES tasks(task_id)
);

CREATE TABLE feedback (
  feedback_id VARCHAR(40) PRIMARY KEY,
  user_id VARCHAR(40) NOT NULL,
  task_id VARCHAR(40) NOT NULL,
  schedule_item_id VARCHAR(40),
  completed BOOLEAN NOT NULL,
  actual_duration_minutes INT,
  difficulty_feedback TINYINT,
  energy_after TINYINT,
  mood_after TINYINT,
  comment TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (task_id) REFERENCES tasks(task_id),
  FOREIGN KEY (schedule_item_id) REFERENCES schedule_items(schedule_item_id)
);
