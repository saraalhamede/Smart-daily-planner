USE smart_day_planner;

SET @should_seed := (SELECT COUNT(*) = 0 FROM tasks);

INSERT INTO users (user_id, full_name, email, password_hash, profile_image, created_at, updated_at)
SELECT 'user_demo', 'Sara Alhamede', 'sara@smart-planner.local', 'dev:demo123', NULL, '2026-05-18 08:00:00', '2026-05-18 08:00:00'
WHERE @should_seed = 1
  AND NOT EXISTS (SELECT 1 FROM users WHERE user_id = 'user_demo');

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
  notifications_enabled,
  created_at,
  updated_at
)
SELECT
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
  TRUE,
  '2026-05-18 08:00:00',
  '2026-05-18 08:00:00'
WHERE @should_seed = 1
  AND EXISTS (SELECT 1 FROM users WHERE user_id = 'user_demo')
  AND NOT EXISTS (SELECT 1 FROM user_preferences WHERE user_id = 'user_demo');

INSERT INTO daily_checkins (
  checkin_id,
  user_id,
  checkin_date,
  mood_level,
  energy_level,
  sleep_hours,
  stress_level,
  is_tired,
  planning_start,
  planning_end,
  mood_text_original,
  detected_language,
  detected_emotion,
  predicted_energy_level,
  ai_advice,
  created_at
)
SELECT *
FROM (
  SELECT 'checkin_demo_20260518' AS checkin_id, 'user_demo' AS user_id, '2026-05-18' AS checkin_date, 4 AS mood_level, 4 AS energy_level, 7.50 AS sleep_hours, 2 AS stress_level, FALSE AS is_tired, '08:30:00' AS planning_start, '18:00:00' AS planning_end, 'Ready for a focused week.' AS mood_text_original, 'en' AS detected_language, 'motivated' AS detected_emotion, 4 AS predicted_energy_level, 'Use the morning for the most important task.' AS ai_advice, '2026-05-18 08:10:00' AS created_at
  UNION ALL SELECT 'checkin_demo_20260519', 'user_demo', '2026-05-19', 3, 3, 6.50, 3, FALSE, '09:00:00', '18:00:00', 'A normal day with a little pressure.', 'en', 'neutral', 3, 'Keep tasks medium sized and add breaks.', '2026-05-19 08:30:00'
  UNION ALL SELECT 'checkin_demo_20260520', 'user_demo', '2026-05-20', 3, 2, 5.75, 4, TRUE, '09:30:00', '17:00:00', 'Tired and stressed about deadlines.', 'en', 'stressed', 2, 'Move difficult work later and keep sessions short.', '2026-05-20 08:45:00'
  UNION ALL SELECT 'checkin_demo_20260521', 'user_demo', '2026-05-21', 4, 4, 7.00, 2, FALSE, '08:30:00', '18:30:00', 'Feeling better today.', 'en', 'positive', 4, 'This is a good day for high priority work.', '2026-05-21 08:20:00'
  UNION ALL SELECT 'checkin_demo_20260522', 'user_demo', '2026-05-22', 3, 3, 6.75, 3, FALSE, '09:00:00', '17:30:00', 'Balanced but busy.', 'en', 'focused', 3, 'Protect one deep work block before lunch.', '2026-05-22 08:25:00'
  UNION ALL SELECT 'checkin_demo_20260523', 'user_demo', '2026-05-23', 5, 4, 8.00, 1, FALSE, '10:00:00', '16:00:00', 'Calm weekend planning.', 'en', 'calm', 4, 'Use the relaxed energy for review tasks.', '2026-05-23 09:40:00'
  UNION ALL SELECT 'checkin_demo_20260524', 'user_demo', '2026-05-24', 4, 4, 7.25, 2, FALSE, '08:00:00', '18:00:00', 'Ready to test the database planner.', 'en', 'motivated', 4, 'Start with fixed items, then place flexible study blocks.', '2026-05-24 08:00:00'
) AS seed
WHERE @should_seed = 1
  AND NOT EXISTS (SELECT 1 FROM daily_checkins WHERE checkin_id = seed.checkin_id);

INSERT INTO tasks (
  task_id,
  user_id,
  title,
  description,
  category,
  priority_level,
  difficulty_level,
  estimated_duration_minutes,
  remaining_duration_minutes,
  task_type,
  task_date,
  deadline,
  status,
  is_completed,
  is_fixed_time,
  fixed_date,
  fixed_start_time,
  fixed_end_time,
  completed_on,
  completed_at,
  actual_duration_minutes,
  created_at,
  updated_at
)
SELECT *
FROM (
  SELECT 'task_demo_math' AS task_id, 'user_demo' AS user_id, 'Finish calculus practice' AS title, 'Complete the derivative worksheet.' AS description, 'study' AS category, 4 AS priority_level, 3 AS difficulty_level, 60 AS estimated_duration_minutes, 0 AS remaining_duration_minutes, 'flexible' AS task_type, '2026-05-18' AS task_date, '2026-05-21 23:59:00' AS deadline, 'completed' AS status, TRUE AS is_completed, FALSE AS is_fixed_time, NULL AS fixed_date, NULL AS fixed_start_time, NULL AS fixed_end_time, '2026-05-21' AS completed_on, '2026-05-21 16:30:00' AS completed_at, 70 AS actual_duration_minutes, '2026-05-18 08:15:00' AS created_at, '2026-05-21 16:30:00' AS updated_at
  UNION ALL SELECT 'task_demo_project', 'user_demo', 'Database connection project', 'Connect planner UI actions to MySQL through the Express API.', 'coding', 5, 4, 90, 90, 'flexible', '2026-05-20', '2026-05-27 23:59:00', 'pending', FALSE, FALSE, NULL, NULL, NULL, NULL, NULL, NULL, '2026-05-20 09:00:00', '2026-05-20 09:00:00'
  UNION ALL SELECT 'task_demo_lab', 'user_demo', 'Attend database lab', 'Fixed class time for the database lab.', 'study', 5, 2, 90, 90, 'fixed', '2026-05-24', NULL, 'pending', FALSE, TRUE, '2026-05-24', '09:00:00', '10:30:00', NULL, NULL, NULL, '2026-05-23 18:00:00', '2026-05-23 18:00:00'
  UNION ALL SELECT 'task_demo_reading', 'user_demo', 'Read AI notes chapter', 'Read and summarize the recommendation systems chapter.', 'study', 3, 2, 45, 45, 'flexible', '2026-05-24', NULL, 'pending', FALSE, FALSE, NULL, NULL, NULL, NULL, NULL, NULL, '2026-05-24 08:05:00', '2026-05-24 08:05:00'
  UNION ALL SELECT 'task_demo_presentation', 'user_demo', 'Prepare progress presentation', 'Draft three slides about planner progress and feedback.', 'writing', 4, 3, 75, 75, 'flexible', '2026-05-23', '2026-05-25 18:00:00', 'pending', FALSE, FALSE, NULL, NULL, NULL, NULL, NULL, NULL, '2026-05-23 11:00:00', '2026-05-23 11:00:00'
) AS seed
WHERE @should_seed = 1
  AND NOT EXISTS (SELECT 1 FROM tasks WHERE task_id = seed.task_id);

INSERT INTO schedules (schedule_id, user_id, daily_checkin_id, schedule_date, generated_at, status, schedule_note)
SELECT 'sched_demo_20260524', 'user_demo', 'checkin_demo_20260524', '2026-05-24', '2026-05-24 08:05:00', 'active', 'Fixed lab time is protected first. Flexible work is placed around your stronger energy windows.'
WHERE @should_seed = 1
  AND NOT EXISTS (SELECT 1 FROM schedules WHERE schedule_id = 'sched_demo_20260524');

INSERT INTO schedule_items (
  schedule_item_id,
  schedule_id,
  task_id,
  title,
  category,
  difficulty_level,
  priority_level,
  start_time,
  end_time,
  energy_slot,
  task_kind,
  reason,
  status,
  started_at,
  completed_at,
  actual_duration_minutes,
  created_at
)
SELECT *
FROM (
  SELECT 'item_demo_lab' AS schedule_item_id, 'sched_demo_20260524' AS schedule_id, 'task_demo_lab' AS task_id, 'Attend database lab' AS title, 'study' AS category, 2 AS difficulty_level, 5 AS priority_level, '2026-05-24 09:00:00' AS start_time, '2026-05-24 10:30:00' AS end_time, 'morning' AS energy_slot, 'fixed' AS task_kind, 'Fixed-time task kept at its required time.' AS reason, 'completed' AS status, '2026-05-24 09:00:00' AS started_at, '2026-05-24 10:40:00' AS completed_at, 100 AS actual_duration_minutes, '2026-05-24 08:05:00' AS created_at
  UNION ALL SELECT 'item_demo_reading', 'sched_demo_20260524', 'task_demo_reading', 'Read AI notes chapter', 'study', 2, 3, '2026-05-24 11:00:00', '2026-05-24 11:45:00', 'late_morning', 'flexible', 'Short focused block after the fixed lab.', 'waiting', NULL, NULL, NULL, '2026-05-24 08:05:00'
  UNION ALL SELECT 'item_demo_project', 'sched_demo_20260524', 'task_demo_project', 'Database connection project', 'coding', 4, 5, '2026-05-24 13:00:00', '2026-05-24 14:30:00', 'afternoon', 'flexible', 'High priority deadline work placed after a break.', 'waiting', NULL, NULL, NULL, '2026-05-24 08:05:00'
) AS seed
WHERE @should_seed = 1
  AND NOT EXISTS (SELECT 1 FROM schedule_items WHERE schedule_item_id = seed.schedule_item_id);

INSERT INTO task_subtasks (subtask_id, user_id, task_id, schedule_item_id, title, is_completed, sort_order, created_at)
SELECT *
FROM (
  SELECT 'sub_demo_project_1' AS subtask_id, 'user_demo' AS user_id, 'task_demo_project' AS task_id, 'item_demo_project' AS schedule_item_id, 'Verify API route names' AS title, FALSE AS is_completed, 1 AS sort_order, '2026-05-24 08:05:00' AS created_at
  UNION ALL SELECT 'sub_demo_project_2', 'user_demo', 'task_demo_project', 'item_demo_project', 'Test save and reload from MySQL', FALSE, 2, '2026-05-24 08:05:00'
  UNION ALL SELECT 'sub_demo_reading_1', 'user_demo', 'task_demo_reading', 'item_demo_reading', 'Read chapter summary', FALSE, 1, '2026-05-24 08:05:00'
  UNION ALL SELECT 'sub_demo_lab_1', 'user_demo', 'task_demo_lab', 'item_demo_lab', 'Attend session', TRUE, 1, '2026-05-24 08:05:00'
) AS seed
WHERE @should_seed = 1
  AND NOT EXISTS (SELECT 1 FROM task_subtasks WHERE subtask_id = seed.subtask_id);

INSERT INTO task_resources (resource_id, user_id, task_id, schedule_item_id, resource_type, label, value, preview_url, created_at)
SELECT *
FROM (
  SELECT 'res_demo_project_1' AS resource_id, 'user_demo' AS user_id, 'task_demo_project' AS task_id, 'item_demo_project' AS schedule_item_id, 'link' AS resource_type, 'Local API health check' AS label, 'http://localhost:3000/api/health' AS value, NULL AS preview_url, '2026-05-24 08:10:00' AS created_at
  UNION ALL SELECT 'res_demo_reading_1', 'user_demo', 'task_demo_reading', 'item_demo_reading', 'link', 'Course notes', 'https://example.com/course-notes', NULL, '2026-05-24 08:10:00'
) AS seed
WHERE @should_seed = 1
  AND NOT EXISTS (SELECT 1 FROM task_resources WHERE resource_id = seed.resource_id);

INSERT INTO task_feedback (
  feedback_id,
  user_id,
  task_id,
  schedule_item_id,
  outcome,
  completed,
  actual_duration_minutes,
  difficulty_feedback,
  energy_after,
  mood_after,
  comment,
  created_at
)
SELECT 'feedback_demo_lab', 'user_demo', 'task_demo_lab', 'item_demo_lab', 'completed', TRUE, 100, 2, 4, 4, 'The lab took a little longer than planned, but it was useful.', '2026-05-24 10:45:00'
WHERE @should_seed = 1
  AND NOT EXISTS (SELECT 1 FROM task_feedback WHERE feedback_id = 'feedback_demo_lab');

INSERT INTO ai_notes (note_id, user_id, note_date, schedule_id, related_task_id, note_type, title, message, source, created_at)
SELECT *
FROM (
  SELECT 'note_demo_1' AS note_id, 'user_demo' AS user_id, '2026-05-24' AS note_date, 'sched_demo_20260524' AS schedule_id, NULL AS related_task_id, 'recommendation' AS note_type, 'Daily schedule advice' AS title, 'Your energy is strongest before mid-afternoon, so the database task is best after the fixed lab and a break.' AS message, 'rule_based' AS source, '2026-05-24 08:06:00' AS created_at
  UNION ALL SELECT 'note_demo_2', 'user_demo', '2026-05-24', 'sched_demo_20260524', 'task_demo_project', 'time_management', 'Deadline task stays visible', 'The database connection task has a future deadline and will keep appearing until it is completed.', 'rule_based', '2026-05-24 08:07:00'
  UNION ALL SELECT 'note_demo_3', 'user_demo', '2026-05-20', NULL, NULL, 'mood', 'Stress pattern detected', 'On low sleep days, the planner should prefer shorter work blocks and easier tasks first.', 'rule_based', '2026-05-20 18:00:00'
) AS seed
WHERE @should_seed = 1
  AND NOT EXISTS (SELECT 1 FROM ai_notes WHERE note_id = seed.note_id);

INSERT INTO daily_evaluations (
  evaluation_id,
  user_id,
  schedule_id,
  evaluation_date,
  total_tasks,
  completed_tasks,
  unfinished_tasks,
  completion_percentage,
  productivity_score,
  planned_minutes,
  actual_minutes,
  average_mood,
  average_energy,
  average_stress,
  message,
  created_at,
  updated_at
)
SELECT *
FROM (
  SELECT 'eval_demo_20260518' AS evaluation_id, 'user_demo' AS user_id, NULL AS schedule_id, '2026-05-18' AS evaluation_date, 3 AS total_tasks, 2 AS completed_tasks, 1 AS unfinished_tasks, 67 AS completion_percentage, 72 AS productivity_score, 180 AS planned_minutes, 195 AS actual_minutes, 4.00 AS average_mood, 4.00 AS average_energy, 2.00 AS average_stress, 'Good start to the week.' AS message, '2026-05-18 19:00:00' AS created_at, '2026-05-18 19:00:00' AS updated_at
  UNION ALL SELECT 'eval_demo_20260519', 'user_demo', NULL, '2026-05-19', 4, 2, 2, 50, 58, 210, 230, 3.00, 3.00, 3.00, 'Moderate progress with room for tighter planning.', '2026-05-19 19:00:00', '2026-05-19 19:00:00'
  UNION ALL SELECT 'eval_demo_20260520', 'user_demo', NULL, '2026-05-20', 3, 1, 2, 33, 45, 160, 190, 3.00, 2.00, 4.00, 'Stress was high, so lighter scheduling is recommended.', '2026-05-20 19:00:00', '2026-05-20 19:00:00'
  UNION ALL SELECT 'eval_demo_20260521', 'user_demo', NULL, '2026-05-21', 4, 4, 0, 100, 92, 240, 250, 4.00, 4.00, 2.00, 'Excellent completion and stable energy.', '2026-05-21 19:00:00', '2026-05-21 19:00:00'
  UNION ALL SELECT 'eval_demo_20260522', 'user_demo', NULL, '2026-05-22', 3, 2, 1, 67, 70, 180, 185, 3.00, 3.00, 3.00, 'Good progress with balanced workload.', '2026-05-22 19:00:00', '2026-05-22 19:00:00'
  UNION ALL SELECT 'eval_demo_20260523', 'user_demo', NULL, '2026-05-23', 2, 2, 0, 100, 90, 120, 110, 5.00, 4.00, 1.00, 'Strong review day.', '2026-05-23 17:00:00', '2026-05-23 17:00:00'
  UNION ALL SELECT 'eval_demo_20260524', 'user_demo', 'sched_demo_20260524', '2026-05-24', 3, 1, 2, 33, 54, 225, 100, 4.00, 4.00, 2.00, 'The day is still in progress. Complete more scheduled tasks to raise the score.', '2026-05-24 10:45:00', '2026-05-24 10:45:00'
) AS seed
WHERE @should_seed = 1
  AND NOT EXISTS (SELECT 1 FROM daily_evaluations WHERE evaluation_id = seed.evaluation_id);
