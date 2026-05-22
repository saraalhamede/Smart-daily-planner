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

## Development Change Log

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
