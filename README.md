# Smart Day Planner / المخطط الذكي اليومي

## مقدمة
هذا المشروع هو مشروع التخرج الخاص بنا، وفكرته الأساسية هي بناء نظام ذكي يساعد المستخدم على تنظيم يومه بشكل ديناميكي اعتمادًا على:

- مستوى الطاقة
- الحالة المزاجية
- التوتر
- عدد ساعات النوم
- نوع المهمة وصعوبتها
- المواعيد النهائية
- التغذية الراجعة بعد تنفيذ المهام

الفكرة الأساسية ليست فقط إنشاء To-Do List عادي، بل إنشاء **جدول يومي ذكي** يتغير حسب حالة المستخدم الفعلية أثناء اليوم.

---

## الهدف من المشروع
هدف المشروع هو:

- مساعدة المستخدم على تنظيم يومه بطريقة أفضل
- توزيع المهام حسب الطاقة والمزاج وليس فقط حسب الوقت
- حماية المهام ذات الوقت الثابت مثل المحاضرات أو العمل
- إعادة جدولة بقية اليوم بشكل ديناميكي عند تغيّر حالة المستخدم
- تحسين التوصيات مع الوقت بناءً على تاريخ المستخدم وبياناته السابقة

---

## الفكرة الأساسية التي اعتمدناها
اعتمدنا اليوم على مبدأ مهم جدًا:

> **مدخلات المستخدم هي المصدر الأساسي للجدولة والتخصيص، أما قواعد البيانات والدatasets الخارجية فهي فقط لتحسين دقة النظام وذكائه مع الوقت.**

هذا يعني أن النظام لا يعتمد على بيانات جاهزة بدل المستخدم، بل يعتمد أولًا على ما يدخله المستخدم يوميًا، ثم يستخدم البيانات الخارجية والبيانات التاريخية كطبقة تحسين.

---

## أنواع البيانات في المشروع

### 1. بيانات المستخدم اليومية
هذه البيانات يدخلها المستخدم يوميًا أو أثناء اليوم:

- mood
- energy level
- stress level
- sleep hours
- tired or not
- mood text / note
- planning start / end (اختياري)

### 2. بيانات المهام
كل مهمة تحتوي على:

- title
- description
- priority
- difficulty
- estimated duration
- deadline
- category
- هل المهمة ثابتة الوقت أم مرنة

### 3. بيانات feedback
بعد تنفيذ المهمة أو عدم إنهائها، يدخل المستخدم:

- completed / not completed
- actual duration
- difficulty after task
- energy after task
- mood after task
- comment

---

## نوعا المهام في المشروع
اليوم ثبتنا نقطة مهمة جدًا في منطق المشروع:

### أ. Fixed-Time Tasks
وهي المهام ذات الوقت الثابت، مثل:

- محاضرة
- دوام
- اجتماع
- موعد

هذه المهام يجب أن:

- تحجز وقتها أولًا
- لا يسمح بوضع أي مهمة أخرى فوقها
- تعتبر فترات blocked في الجدول

### ب. Flexible Tasks
وهي المهام التي يستطيع النظام توزيعها في الفراغات المتبقية من اليوم.

أمثلة:

- كتابة ملخص
- دراسة
- مراجعة
- برمجة
- ترتيب ملاحظات

---

## كيف يعمل النظام
منطق المشروع الذي اتفقنا عليه اليوم هو:

```text
User Input
→ Save to Database
→ AI / Rule-based Analysis
→ Smart Scheduler
→ Daily Schedule
→ User Feedback
→ Database Update
→ Dynamic Rescheduling
→ Better Personalization Over Time
```

---

## منطق الجدولة الذي اعتمدناه اليوم
اليوم عملنا على منطق واضح للـ Scheduler:

1. قراءة بيانات المستخدم اليومية
2. قراءة جميع المهام المفتوحة
3. فصل المهام إلى:
   - fixed-time tasks
   - flexible tasks
4. حجز المهام الثابتة أولًا
5. استخراج الفترات الفارغة بين المهام الثابتة
6. ترتيب المهام المرنة حسب:
   - priority
   - deadline urgency
   - difficulty
   - energy fit
   - feedback history
7. توزيع المهام المرنة في الفترات الفارغة فقط
8. عدم السماح بأي تعارض زمني مع المهام الثابتة

---

## القاعدة الأساسية في التوزيع
اعتمدنا المنطق التالي:

- إذا كانت الطاقة عالية → وضع المهام الصعبة أولًا
- إذا كانت الطاقة متوسطة → وضع المهام المتوسطة
- إذا كانت الطاقة منخفضة → وضع المهام السهلة أولًا
- إذا كان deadline قريبًا → زيادة أولوية المهمة
- إذا كانت المهمة طويلة وصعبة → تقسيمها إلى blocks أقصر
- إذا كان المستخدم متعبًا أو مضغوطًا → زيادة الحذر في الجدولة

---

## أهم تحسين قمنا به اليوم: Dynamic Rescheduling
أحد أهم الأشياء التي طورناها اليوم هو أن الـ feedback لا يتم حفظه فقط، بل يجب أن يؤدي إلى:

> **إعادة جدولة بقية اليوم بشكل ديناميكي**

يعني إذا كان عندي جدول، والمستخدم أنهى أو لم يُنهِ مهمة، وأدخل feedback، فالنظام يجب أن:

1. يحفظ الـ feedback
2. يحدث بيانات المهمة
3. يعيد حساب حالة المستخدم
4. يعيد جدولة ما تبقى من اليوم

---

## كيف أصبحت الـ Feedback أذكى
في البداية كان الـ feedback بسيطًا، ثم اتفقنا اليوم على جعله أذكى من خلال إضافة:

- actual_duration_minutes
- difficulty_feedback
- energy_after
- mood_after
- comment

ثم استخدمنا هذه القيم في إعادة الجدولة.

### مثال
إذا كانت المهمة:

- لم تكتمل
- difficulty_feedback = 5
- energy_after = 1
- mood_after = 2

فالنظام يجب أن:

- يخفض التوقع لمستوى الطاقة في بقية اليوم
- يضع المهام السهلة أولًا
- يقلل طول جلسات المهام الصعبة
- يزيد فترات الراحة قليلًا
- يحدث remaining time للمهمة غير المكتملة

---

## كيف نتعامل مع المهام غير المكتملة
إذا قال المستخدم إن المهمة لم تكتمل:

- لا نحذف المهمة
- لا نعتبرها completed
- نبقيها pending
- نقلل remaining_duration_minutes حسب الوقت الذي تم إنجازه

مثال:

- estimated duration = 90
- actual duration = 30
- المهمة لم تكتمل

فتصبح:

- remaining duration = 60

وبالتالي يتم إعادة توزيع الجزء المتبقي لاحقًا.

---

## قاعدة البيانات التي اتفقنا عليها
اليوم حددنا أن قاعدة البيانات النهائية يجب أن تحتوي على جداول مثل:

### Users
لتخزين بيانات المستخدم الأساسية

### UserPreferences
لتخزين تفضيلات المستخدم مثل:

- wake up time
- sleep time
- preferred study hours
- break duration

### DailyLogs
لتخزين:

- mood
- energy
- stress
- sleep
- tired
- mood note
- detected emotion
- predicted energy

### Tasks
لتخزين:

- task title
- description
- category
- priority
- difficulty
- estimated duration
- remaining duration
- deadline
- fixed-time info

### Schedules
لتخزين كل جدول يتم إنشاؤه

### ScheduleItems
لتخزين عناصر الجدول نفسها:

- start time
- end time
- task kind
- reason

### Feedback
لتخزين:

- completed
- actual duration
- difficulty after
- energy after
- mood after
- comment

---

## دور الـ AI في المشروع
اليوم أكدنا أن الـ AI في المشروع سيكون على شكل طبقات/أدوار:

### 1. Mood & Energy Analysis
تحليل نص المستخدم أو حالته العامة

### 2. Task Categorization
تصنيف المهمة:

- study
- coding
- writing
- routine

### 3. Time Estimation
اقتراح وقت تقريبي للمهمة إذا لم يحدده المستخدم

### 4. Smart Scheduling
استخدام نتائج التحليل مع القواعد لبناء جدول يومي

### 5. Feedback-Based Learning
تحسين الجدولة القادمة بناءً على أداء المستخدم

---

## datasets التي اتفقنا على استخدامها
اتفقنا على أن datasets الخارجية ستستخدم لتحسين النظام فقط، وليس لتبديل مدخلات المستخدم.

استخدامها سيكون كالتالي:

- emotion datasets → لتحسين تحليل النصوص المزاجية
- todo/task datasets → لتحسين تصنيف المهام
- time estimation datasets → لتحسين تقدير الوقت
- survey dataset الذي جمعناه → لاستخدامه كـ calibration و research support

### استخدام dataset الذي جمعناه
قلنا اليوم إن dataset الاستبيان الخاص بنا سيفيد في:

- إثبات العلاقة بين النوم والطاقة
- تحليل العلاقة بين التوتر والإنتاجية
- دعم منطق القواعد الأولية للنظام
- إعطاء project justification في العرض والتقرير

لكن:

> **التخصيص الحقيقي سيأتي من بيانات المستخدم الفعلية وتاريخه داخل النظام**

---

## الـ Tech Stack الحالي والمستقبلي

### ما تم بناؤه كمفهوم/Prototype
اليوم كنا نبني ونفكر بمستوى Prototype منطقي، وليس نسخة React النهائية.

### الاتجاه النهائي الذي اتفقنا عليه

- Frontend: React
- Backend: Node.js + Express
- Database: MySQL
- AI service in future: Python

### لماذا Python مستقبلًا
اتفقنا أن Python ستكون أفضل لطبقة الـ AI لاحقًا لأن:

- مكتبات ML/NLP أقوى
- التعامل مع datasets أسهل
- استخدام models من HuggingFace/Kaggle أسهل
- يمكن جعلها microservice منفصلة

التدفق النهائي سيكون مثلًا:

```text
React
→ Node/Express
→ MySQL
→ Python AI Service
```

---

## ماذا أنجزنا اليوم خطوة بخطوة

### الخطوة 1
ثبتنا فكرة المشروع الأساسية وأن:

- user input هو الأساس
- datasets لتحسين النتائج

### الخطوة 2
حددنا جداول قاعدة البيانات الرئيسية وعلاقاتها

### الخطوة 3
وضحنا أن هناك نوعين من المهام:

- fixed-time
- flexible

### الخطوة 4
عدلنا منطق الجدولة حتى:

- يحجز المهام الثابتة أولًا
- يمنع التضارب
- يوزع المهام المرنة في الفراغات فقط

### الخطوة 5
حولنا feedback من مجرد تخزين إلى trigger لإعادة الجدولة

### الخطوة 6
طورنا feedback ليصبح أذكى باستخدام:

- actual duration
- energy after
- mood after
- difficulty after

### الخطوة 7
استخدمنا feedback لتعديل:

- الطاقة المتوقعة لبقية اليوم
- طول جلسات العمل
- ترتيب المهام
- remaining duration للمهمة

### الخطوة 8
ثبتنا أن الشكل مهم، لكن اليوم كان التركيز الأكبر على المنطق وليس التصميم النهائي

---

## ملاحظات مهمة تعلمناها اليوم

### 1. الشكل الحالي ليس النهائي
لاحظنا أن الواجهة الحالية كانت أكثر منطقية ووظيفية، وليست Design نهائي جاهز للعرض.

### 2. المنطق أهم في هذه المرحلة
اليوم كان التركيز على:

- scheduler behavior
- conflict prevention
- feedback loop
- dynamic rescheduling

### 3. React لم يتم بناؤه بعد
أكدنا أن النسخة الحالية ليست React، وإنما كانت بهدف فهم منطق المشروع أولًا.

---

## ماذا سنعمل لاحقًا
في الجلسات القادمة يمكن أن نكمل بأحد المسارات التالية:

### المسار 1: تحسين الواجهة
- تصميم أجمل
- weekly calendar
- ترتيب أفضل للعناصر
- مظهر أكثر احترافية

### المسار 2: التحويل إلى React + Express + MySQL
- بناء frontend حقيقي بـ React
- بناء backend منظم بـ Express
- ربط قاعدة البيانات بـ MySQL

### المسار 3: إضافة طبقة AI مستقبلًا
- Python service
- emotion model
- task categorization model
- time estimation model

---

## أمثلة اختبار مهمة

### مثال 1: طاقة منخفضة
```text
Mood = 2
Energy = 1
Stress = 4
Sleep = 4
Tired = Yes
```

النتيجة المتوقعة:
- تقديم المهام السهلة
- تقليل ضغط الجدول

### مثال 2: Task ثابتة
```text
University class
12:00 - 13:00
```

النتيجة:
- لا يسمح بوضع مهام مرنة داخل هذه الفترة

### مثال 3: Feedback منخفض
```text
Completed = No
Actual duration = 30
Difficulty after = 5
Energy after = 1
Mood after = 2
```

النتيجة:
- إعادة جدولة بقية اليوم
- تقديم مهمة أسهل
- تقليل remaining time للمهمة الحالية

---

## ملاحظة Git مهمة
في نهاية اليوم ظهر معنا خطأ Git بخصوص:

```text
HEAD is not a commit
```

وهذا لأن المشروع لا يحتوي على **first commit** بعد.

الحل:

```bash
git add .
git commit -m "Initial project setup"
git switch -c first-version
```

---

## الخلاصة
اليوم كان من أهم الأيام في فهم **عقل المشروع**.

أهم ما خرجنا به:

- user input هو الأساس
- fixed tasks يجب أن تُحجز أولًا
- flexible tasks توضع في الفراغات فقط
- feedback يجب أن يغير الجدول
- feedback المفصل يجعل الجدولة أذكى
- الشكل مهم، لكن المنطق كان الأولوية اليوم
- الاتجاه النهائي هو React + Express + MySQL + Python AI لاحقًا

هذا الـ README يلخص كل ما فهمناه وثبتناه اليوم، ويمكن استخدامه كمرجع أثناء دراسة المشروع أو عند شرحه لاحقًا.

## Current Database Integration Status - 2026-05-24

This section documents the current end-to-end database work for the Smart Day Planner.

### Current Architecture

```text
React Frontend
-> Node.js / Express API
-> MySQL Database
```

Future AI path:

```text
Node.js / Express API
-> Python AI Service
```

The Python AI service has now started. It is used as a supportive analysis layer, while the final scheduling decisions remain controlled by the Node.js rule-based scheduler.

### Python AI Service - Started 2026-05-24

Python service folder:

```text
ai_service/
```

Run the AI service:

```bash
npm run ai
```

Default AI service URL:

```text
http://127.0.0.1:8000
```

AI service health endpoint:

```text
GET /ai/health
```

Current Python AI endpoints:

- `POST /ai/analyze-mood`
- `POST /ai/classify-task`
- `POST /ai/estimate-time`
- `POST /ai/generate-schedule`
- `POST /ai/generate-subtasks`
- `POST /ai/generate-advice`

Current backend proxy/support endpoints:

- `POST /api/ai/analyze-mood`
- `POST /api/ai/classify-task`
- `POST /api/ai/estimate-time`
- `POST /api/ai/generate-schedule`
- `POST /api/ai/generate-subtasks`
- `POST /api/ai/generate-advice`

Current AI implementation mode:

- rule-based baseline modules
- clean API contracts
- safe backend fallback if Python is offline
- future-ready structure for RoBERTa, BERT, DistilBERT, or regression models

Important design rule:

```text
Python AI gives predictions and hints.
Node.js rule-based scheduler makes the final schedule.
```

AI modules currently scaffolded:

- Mood and energy analysis
- Task categorization
- Time estimation
- Scheduler support hints
- Subtask generation for Task Breakdown
- Personalized advice generation for existing AI Notes sections

AI outputs are saved in MySQL when used by real planner actions.

New AI database tables:

- ai_predictions
- emotion_logs
- energy_predictions
- recommendations
- scheduling_results

AI advice is saved in the existing `ai_notes` table.

Important `ai_notes` fields:

- `note_id`
- `user_id`
- `note_date`
- `note_type`
- `title`
- `message`
- `scope`
- `priority`
- `related_task_id`
- `source`
- `created_at`

Task Breakdown update:

- The Task In Progress checklist is no longer hardcoded.
- When the user starts a scheduled task, the backend sends the task title, description, category, difficulty level, and estimated duration to the Python AI service.
- Python returns small actionable subtasks.
- The backend saves them in `task_subtasks`.
- The UI displays the saved subtasks as checkboxes.
- Progress is calculated as completed subtasks divided by total subtasks.
- Checking a subtask updates `task_subtasks.is_completed` in MySQL.

AI Advice update:

- No new AI Notes page was created.
- The existing sidebar AI Notes section loads broad daily/weekly/monthly recommendations from the backend.
- The existing Daily Details `AI Notes & Advice` container loads advice for the selected day.
- The backend collects real context from MySQL before generating advice:
  - daily check-in
  - mood level
  - energy level
  - stress level
  - sleep hours
  - waiting tasks
  - in-progress task
  - completed tasks
  - unfinished tasks
  - productivity score
  - task feedback
  - deadline tasks
- The backend sends that context to the Python AI service endpoint `POST /ai/generate-advice`.
- The Python service returns advice messages with `advice_type`, `title`, `message`, `priority`, `scope`, `related_date`, and optional `related_task_id`.
- The backend saves advice into `ai_notes` with `source = ai_model`.
- If Python is offline, the backend uses a safe Node rule-based fallback so the UI still works.
- Duplicate advice is skipped when the same saved note already exists for the same date, scope, type, task, title, and message.

### MySQL Database

The main database is:

```text
smart_day_planner
```

The schema file is:

```text
database/schema.sql
```

The seed file is:

```text
database/seed.sql
```

Current tables:

- users
- user_preferences
- daily_checkins
- tasks
- schedules
- schedule_items
- task_feedback
- task_subtasks
- task_resources
- ai_notes
- daily_evaluations

The database schema now supports:

- user registration and login
- default user preferences
- daily check-ins
- flexible and fixed-time tasks
- generated schedules
- schedule items
- task movement between waiting, in progress, completed, and removed
- subtasks
- task resources
- task feedback
- AI notes
- daily evaluations
- weekly dashboard data
- monthly calendar data
- progress and feedback loop data

### Environment Variables

The backend reads MySQL settings from `.env`.

Required variables:

```bash
PORT=3000
CLIENT_ORIGIN=http://127.0.0.1:5173
DATA_STORE=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=smart_day_planner
```

Important: keep the real MySQL password in `.env`; do not write the real password into committed files.

### Demo Account

Seeded demo account:

```text
Email: sara@smart-planner.local
Password: demo123
```

This account is created by `database/schema.sql` if the database is empty, and `database/seed.sql` adds richer demo data only when the database has no tasks.

### Project Commands

Install dependencies:

```bash
npm install
```

Run database migration:

```bash
npm run db:migrate
```

Run demo seed:

```bash
npm run db:seed
```

Run backend server:

```bash
npm run server
```

Run React frontend:

```bash
npm run dev
```

Build frontend:

```bash
npm run build:client
```

Backend syntax check:

```bash
npm run check
```

### Backend API Routes

Health:

- `GET /api/health`

Auth:

- `POST /api/auth/register`
- `POST /api/auth/login`

Weekly Dashboard:

- `GET /api/dashboard/week?userId=&date=`

Calendar:

- `GET /api/calendar/month?userId=&month=&year=`

Selected Day Input:

- `GET /api/day/:date?userId=`
- `GET /api/checkins?userId=`
- `POST /api/checkins`
- `POST /api/tasks`
- `PUT /api/tasks/:taskId`
- `DELETE /api/tasks/:taskId`

Schedule:

- `POST /api/schedules/generate`
- `GET /api/schedules/:date?userId=`

Daily Details:

- `GET /api/day/:date/details?userId=`
- `PATCH /api/schedule-items/:scheduleItemId/status`
- `POST /api/feedback`
- `GET /api/feedback?userId=`
- `POST /api/resources`
- `DELETE /api/resources/:resourceId`
- `PATCH /api/subtasks/:subtaskId`

AI Notes:

- `GET /api/ai-notes?userId=&period=`
- `POST /api/ai/generate-advice`

Progress:

- `GET /api/progress?userId=&period=`

Settings:

- `GET /api/settings/:userId`
- `PUT /api/settings/:userId`

Older compatibility routes still exist for some data:

- `GET /api/bootstrap?userId=`
- `GET /api/daily-checkins?userId=`
- `POST /api/daily-checkins`
- `GET /api/preferences/:userId`
- `PUT /api/preferences/:userId`

### Frontend Database Connection Work

The frontend API wrapper is:

```text
client/src/api/plannerApi.js
```

The React app now calls backend APIs instead of relying only on local/mock planner data for:

- login
- register
- settings save/load
- daily check-in save/load
- selected day load
- add task
- update task
- remove task
- generate schedule
- daily details load
- start task
- complete task
- restore task
- remove waiting task
- submit feedback
- update subtasks
- add/delete resources
- weekly dashboard load
- calendar month load
- AI notes load
- progress page load

Local storage is still used only for lightweight UI/session state:

- current registered browser user session
- notification read/removed state

Planner data itself is saved through the backend and MySQL.

### Important Rules Implemented

- Only one task can be `in_progress` per user/day.
- Past days are review-only.
- Fixed-time tasks can move automatically based on time.
- Flexible tasks can be manually started.
- Removed tasks are marked as removed instead of losing history.
- Feedback is saved and kept as history.
- Subtasks and resources are connected to schedule items.
- Daily evaluations are saved after schedule generation and feedback changes.
- Multi-day deadline tasks are stored once and displayed dynamically until completed.
- Generate Schedule requires a saved daily check-in and at least one available task.

### Files Added In This Database Phase

- `database/seed.sql`
- `server/src/scripts/runSqlFile.js`

### Main Files Updated In This Database Phase

- `database/schema.sql`
- `server/src/app.js`
- `server/src/index.js`
- `server/src/data/store.js`
- `server/src/data/mysqlStore.js`
- `server/src/logic/scheduler.js`
- `server/src/routes/api.js`
- `server/src/services/plannerService.js`
- `client/src/api/plannerApi.js`
- `client/src/App.jsx`
- `client/src/components/DailyCheckIn.jsx`
- `package.json`

### Verification Completed

The following checks passed:

- `npm run db:migrate`
- `npm run db:seed`
- `npm run check`
- `node --check server/src/routes/api.js`
- `node --check server/src/services/plannerService.js`
- `node --check server/src/scripts/runSqlFile.js`
- `npm run build:client`
- `GET /api/health`
- CORS preflight from `http://127.0.0.1:5173` to the backend

End-to-end API test passed for:

- health check
- register
- login
- settings save/load
- check-in save/load
- task add/load
- task update
- schedule generate/load
- daily details load
- schedule item status update
- subtask update
- resource add/delete
- feedback save/load
- weekly dashboard
- calendar month
- AI notes
- progress
- task remove

The temporary API test user was deleted after verification.

Frontend server verified:

```text
http://127.0.0.1:5173
```

Backend server verified:

```text
http://127.0.0.1:3000
```

### Remaining Notes

- A real click-through browser test was not completed because the in-app browser tool was unavailable in the session.
- The API, MySQL connection, CORS, migration, seed, and React production build were verified.
- Python AI service integration is intentionally left for a later phase.

## Development Change Log

### 2026-05-29
- Improved the Daily Details schedule-generation behavior without changing the UI design.
- Updated the rule-based scheduler so it does not add an unnecessary break at the beginning of a good-energy day.
- Breaks are now added only when useful, such as after long work, hard tasks, multiple tasks, high stress, low energy, tired state, or difficult feedback.
- Break blocks remain independent schedule items with `task_kind = "break"` and do not count as normal waiting, completed, unfinished, or productivity tasks.
- Added varied break suggestions such as drinking water, taking a screen break, stretching, eating something light, preparing for the next task, or doing a breathing reset.
- Updated scheduler scoring so previous feedback affects future task ordering and break placement.
- Negative feedback, difficult tasks, low energy after feedback, and time overruns now make the next plan more careful.
- Positive feedback allows the scheduler to continue normally without adding unnecessary recovery breaks.
- Improved current-day scheduling so generated tasks and breaks respect the valid planning window and avoid past time slots.
- Fixed duplicate schedule behavior by archiving/replacing old generated schedule items for the selected day instead of showing duplicated tasks after edit/regenerate.
- Allowed deadline tasks to be started before the deadline by creating a real schedule block when the user chooses to work on them early.
- Made break/free-time cards visible in the Waiting flow and Daily Timeline while disabling normal task actions for them.
- Updated the Python AI subtask generator so simple tasks are not divided into unnecessary subtasks.
- Simple/routine tasks such as short low-difficulty tasks now show `No breakdown needed for this simple task.`
- Complex tasks still receive AI-generated subtasks based on title, description, category, difficulty, priority, and estimated duration.
- Improved complex task breakdowns so presentation/design/project tasks get meaningful ordered steps instead of simple sentence splitting.
- Updated the Node AI fallback to follow the same subtask rules when the Python AI service is unavailable.
- Updated backend subtask saving so old AI-generated subtasks are cleared when a task is now considered simple.
- Updated the Task In Progress UI logic so empty subtasks are treated as an intentional simple-task state, not as endless loading.
- Updated break cards to display the scheduler's saved break suggestion.
- Fixed the Restore Task dropdown layering so restore options appear above completed task cards and stay clickable.
- Restarted and verified both backend and Python AI services.
- Verified `/api/health` shows server, MySQL, and AI service are connected.
- Verified Python AI `POST /ai/generate-subtasks` returns no subtasks for simple tasks and useful steps for complex presentation tasks.
- Verified `npm run check` and `npm run build:client` pass.

### 2026-05-25
- Added Python AI advice endpoint `POST /ai/generate-advice`.
- Added backend proxy endpoint `POST /api/ai/generate-advice`.
- Connected the existing sidebar AI Notes section to generate and save broader advice from real MySQL data.
- Connected the existing Daily Details `AI Notes & Advice` container to generate and display selected-day advice.
- Added `scope` and `priority` fields to `ai_notes`.
- The backend now builds advice context from daily check-ins, task progress, feedback, daily evaluations, deadlines, and current task state.
- Saved generated advice into `ai_notes` with `source = ai_model`.
- Added duplicate protection so opening AI Notes or Daily Details does not keep inserting the same advice.
- Kept the scheduler final decisions rule-based; AI advice remains supportive.
- Fixed Daily Details completed-task visibility so completed deadline tasks only appear on their real completion day.
- Added deadline display to the Completed Task Details popup, with `No deadline` when the task has no deadline.
- Added `actual_started_at`, `actual_completed_at`, and `completed_date` support in the schema.
- Updated flexible task timing so actual duration is calculated from the real start action to the real finish action.
- Daily Evaluation and Progress planned-vs-actual calculations now use the saved actual duration.
- Fixed Weekly Dashboard day-circle completion so 100% days are full green circles and day progress uses `completedTasks / totalTasks * 100`.
- Fixed `is_tired` parsing in Node, Python, and the Daily Check-In form so `false` / `0` is not treated as tired.
- Updated mood/energy advice so high energy, good sleep, low stress, and positive mood produce positive energy guidance instead of low-energy advice.
- Expanded Daily Details AI advice rules for strong energy, full completion, unfinished tasks, overruns, difficult feedback, deadlines, and active tasks.
- Filtered stale low-energy saved notes from Daily Details when the selected day check-in clearly indicates strong energy.

### 2026-05-24
- Updated Task Breakdown so subtasks are generated dynamically by the Python AI service when a task starts.
- Added Python endpoint `POST /ai/generate-subtasks`.
- Added backend proxy endpoint `POST /api/ai/generate-subtasks`.
- Added `order_index` and `generated_by_ai` fields to `task_subtasks`.
- Stopped inserting hardcoded default subtasks during schedule creation.
- Saved AI-generated subtasks to MySQL and returned them to the Daily Details UI.
- Removed static fallback subtasks from the Task In Progress UI.
- Verified subtask checkbox updates still persist and progress reaches 100% when all subtasks are checked.
- Started the Python AI service layer under `ai_service/`.
- Added Python endpoints for mood analysis, task classification, time estimation, and scheduler support hints.
- Added backend AI proxy routes under `/api/ai/...`.
- Connected daily check-in saving to Python mood analysis with Node rule-based fallback.
- Connected task creation to Python task classification and optional time estimation.
- Connected schedule generation to Python scheduler hints while keeping final scheduling rule-based in Node.
- Added MySQL tables for AI predictions, emotion logs, energy predictions, recommendations, and scheduling results.
- Added `npm run ai` and `npm run dev:ai` scripts.
- Added `.env.example` with safe database and AI service configuration keys.
- Created and verified the MySQL schema for the main planner tables.
- Added a reusable SQL runner script for migration and seeding.
- Added demo seed data for the demo account, daily check-ins, tasks, schedule items, feedback, resources, AI notes, and evaluations.
- Added package scripts for `npm run server`, `npm run dev`, `npm run db:migrate`, and `npm run db:seed`.
- Added backend page-level routes for weekly dashboard, calendar, selected day, daily details, AI notes, progress, and settings.
- Added the `/api/health` endpoint to confirm server and database connection.
- Updated the frontend API wrapper to call the new backend routes.
- Connected Weekly Dashboard, Calendar, Selected Day Input, Daily Details, AI Notes, Progress, and Settings to backend data.
- Updated Daily Check-In so saved check-in data can reload from the database into the form.
- Added clear frontend console errors and backend error responses for API failures.
- Verified CORS from the React frontend to the Express API.
- Verified an end-to-end API flow from registration through feedback and progress using a temporary test user.
- Confirmed the React production build succeeds after the database wiring work.

### 2026-05-20
- Added the project name `Smart Day Planner` at the beginning of the header.
- Improved the hamburger menu user experience by changing it from a full sliding sidebar to a compact floating menu.
- The menu now closes after the user selects a menu item.
- Increased the project title size in the header for better visibility.
- Updated the menu behavior so opening it shifts the dashboard content to the right instead of covering the dashboard.
- Replaced the selected-day placeholder with a real selected day input page.
- The selected day page reuses the existing Daily Check-In and Task containers.
- Daily Check-In is now saved with the selected day date.
- Tasks can now be connected to a selected day using `task_date`.
- Fixed-time tasks on the selected day automatically use that selected date and only ask for start and end time.
- Added a `Generate Daily Schedule` button that saves selected-day input, runs scheduling, and navigates to a generated-result placeholder.
- Added `task_date` support to the backend task model and database schema.
- Swapped the selected-day header layout so the selected day details appear on the left and the back button appears on the right.
- Disabled schedule generation until the required Daily Check-In and Task fields are completed.
- Kept the Daily Check-In mood note visible after saving so the user can still review it before generating the schedule.
- Created the Daily Details Interface layout after schedule generation.
- Added Daily Details containers for Waiting Tasks, Task In Progress, Completed Tasks, Daily Timeline, and AI Notes & Advice.
- Clicking a weekly day that already has a generated plan now opens the Daily Details page instead of the selected-day input page.
- The Daily Details page is view/manage only and does not include Daily Check-In or Add Task forms.
- Added an `Added Tasks` preview container inside the selected-day Tasks section.
- `Add Task` now stores tasks locally in the selected-day preview list before generation instead of saving immediately and disappearing.
- Added edit and delete actions for selected-day preview tasks.
- `Generate Daily Schedule` now uses the tasks from the `Added Tasks` preview list and is disabled until at least one task is added.
- Task form validation now keeps typed data visible when required fields are missing.
- Moved the `Added Tasks` preview inside the Tasks container so added tasks are visible immediately under the form.
- Removed the unnecessary `Open Daily Planner` button from the top of the Weekly Task Management dashboard.
- Added Daily Details task movement behavior between `waiting`, `in_progress`, and `completed`.
- Waiting tasks now support local edit/update and flexible tasks can be started manually.
- Task In Progress now allows finishing the task or returning it back to Waiting Tasks.
- Fixed-time tasks now move automatically into progress at their scheduled start time and complete automatically after their end time.
- The Daily Details page prevents more than one task from being in progress at the same time.
- Redesigned the Task In Progress container with clear active task details, badges, progress bar, static subtask breakdown, resources UI, and expandable feedback flow.
- Task progress now updates visually when subtasks are checked, and the Finish Task action is highlighted when all subtasks are complete.
- Updated Task In Progress feedback so it opens as a centered popup modal instead of expanding inside the active task card.
- The feedback popup now uses a blurred/darker background, close button, submit button, and keeps the active task card layout clean.
- Feedback submission now closes the popup automatically and moves the task to Completed, keeps it In Progress, or returns it to Waiting according to the selected result.
- Fixed Task Resources so `Add image` and `Add link` use the current typed input value and immediately show the added resource chip.
- Updated `Add image` in Task Resources to open a local computer file picker and show the selected image as a preview chip.
- Added internet image URL support in Task Resources.
- Made added links clickable so they open in a new browser tab.
- Added remove buttons for image and link resource chips.
- Redesigned the Completed Tasks container with compact completed task cards, planned vs actual duration, completion time, and task evaluation messages.
- Added a Daily Evaluation summary with completed count, total planned tasks, completion percentage, productivity score, and a friendly daily message.
- Added a read-only Completed Task Details popup with task metadata, timing, progress, completed breakdown, resources, feedback, and system evaluation.
- Updated the Daily Evaluation productivity score to display as a circular progress indicator with color based on score range.
- Added a `Restore Task` menu for completed tasks so users can return a completed task to In Progress or Waiting without losing history, feedback, subtasks, or resources.
- Added Review Mode for past days so ended days open as read-only daily history pages with active task management disabled.
- Added a soft `Remove Task` action for Waiting Tasks with a confirmation popup; only waiting tasks can be removed.
- Added multi-day deadline continuation so one task can appear dynamically from its start day until its deadline without duplicating task data.
- Deadline tasks now show waiting/overdue labels such as `2 days left`, `Deadline today`, and `Overdue`.
- Completing or removing a deadline task locally prevents it from appearing again in future waiting lists during the current session.
- Added a separate monthly `Calendar` page from the sidebar, independent from the Weekly Dashboard.
- The Calendar page now shows month navigation, productivity colors, day indicators, deadline strips, filters, today highlight, and a compact monthly summary.
- Bootstrap now returns all daily logs so the Calendar can display month-level mood/stress and AI insight indicators.
- Added a separate `AI Notes` dashboard page from the sidebar.
- AI Notes now shows daily/weekly/monthly insight modes, KPI cards, productivity insights, energy patterns, mood/stress trends, time-management comparisons, focus recommendations, and adaptive scheduler suggestions.
- The AI Notes page uses analytics-style cards and mini charts instead of a chatbot layout.
- Added a separate `Settings` dashboard page from the sidebar.
- Settings now includes Profile, Schedule Preferences, Notifications, AI Preferences, Appearance, Privacy & Data, and System sections.
- Settings are saved to local storage, keep user changes after refresh, and profile settings update the header user information.
- Added a separate `Progress / Feedback Loop` dashboard page from the sidebar.
- Progress now shows daily/weekly/monthly filters, productivity score cards, task completion trends, planned vs actual time, feedback before/after impact, energy and stress trends, and a smart learning summary.
- The Progress page explains how feedback improves future scheduling and how the system learns from user behavior.

### 2026-05-19
- Added registration-first flow before opening the main planner.
- Added user profile menu with view information, edit information, profile picture upload, and logout.
- Added separate About page for the project and team details.
- Updated the header week display to show the current week of the month without the project name.
- Added the Weekly Task Management dashboard as the first screen after login.
- Added current-week circular day cards with date, day name, progress fill, today highlight, future neutral state, and new-user empty state.
- Added weekly unfinished tasks, weekly productivity review, and anger/stress overview cards.
- Added navigation from weekly day circles to a prepared daily-detail page.
- Added footer with copyright, student names, and Sapir Academic College department details.
- Added a Weekly Dashboard back button inside the Daily Planner page.

> Keep updating this section after every important implementation change.
