import { Router } from 'express';
import {
  addTaskResource,
  createDailyLog,
  createTask,
  deleteTaskResource,
  getDailyCheckins,
  getDailyDetails,
  generateSchedule,
  getBootstrap,
  getSchedules,
  getTaskFeedback,
  getTasks,
  getUserPreferences,
  loginUser,
  registerUser,
  removeTask,
  saveUserPreferences,
  submitFeedback,
  updateScheduleItemStatus,
  updateSubtask,
  updateTask,
  updateUserProfile
} from '../services/plannerService.js';

export const apiRouter = Router();

apiRouter.post('/auth/register', async (req, res, next) => {
  try {
    res.status(201).json(await registerUser(req.body));
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/auth/login', async (req, res, next) => {
  try {
    res.json(await loginUser(req.body));
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/bootstrap', async (req, res, next) => {
  try {
    res.json(await getBootstrap(req.query.userId || 'user_demo'));
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/tasks', async (req, res, next) => {
  try {
    res.json({ tasks: await getTasks(req.query.userId || 'user_demo') });
  } catch (error) {
    next(error);
  }
});

apiRouter.put('/users/:userId', async (req, res, next) => {
  try {
    res.json(await updateUserProfile(req.params.userId, req.body));
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/daily-checkins', async (req, res, next) => {
  try {
    res.json(await getDailyCheckins(req.query.userId || 'user_demo'));
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/daily-checkins', async (req, res, next) => {
  try {
    const dailyCheckin = await createDailyLog(req.body);
    res.status(201).json({ daily_checkin: dailyCheckin, daily_log: dailyCheckin });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/daily-logs', async (req, res, next) => {
  try {
    const dailyLog = await createDailyLog(req.body);
    res.status(201).json({ daily_log: dailyLog, daily_checkin: dailyLog });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/tasks', async (req, res, next) => {
  try {
    res.status(201).json({ task: await createTask(req.body) });
  } catch (error) {
    next(error);
  }
});

apiRouter.put('/tasks/:taskId', async (req, res, next) => {
  try {
    res.json({ task: await updateTask(req.params.taskId, req.body) });
  } catch (error) {
    next(error);
  }
});

apiRouter.delete('/tasks/:taskId', async (req, res, next) => {
  try {
    res.json({ task: await removeTask(req.params.taskId) });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/schedules/generate', async (req, res, next) => {
  try {
    res.status(201).json(await generateSchedule(req.body));
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/schedules', async (req, res, next) => {
  try {
    res.json(await getSchedules(req.query.userId || 'user_demo'));
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/daily-details', async (req, res, next) => {
  try {
    res.json(await getDailyDetails(req.query.userId || 'user_demo', req.query.date));
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/feedback', async (req, res, next) => {
  try {
    res.json(await getTaskFeedback(req.query.userId || 'user_demo'));
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/feedback', async (req, res, next) => {
  try {
    res.status(201).json(await submitFeedback(req.body));
  } catch (error) {
    next(error);
  }
});

apiRouter.patch('/schedule-items/:scheduleItemId/status', async (req, res, next) => {
  try {
    res.json(await updateScheduleItemStatus(req.params.scheduleItemId, req.body));
  } catch (error) {
    next(error);
  }
});

apiRouter.patch('/subtasks/:subtaskId', async (req, res, next) => {
  try {
    res.json({ subtask: await updateSubtask(req.params.subtaskId, req.body) });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/resources', async (req, res, next) => {
  try {
    res.status(201).json({ resource: await addTaskResource(req.body) });
  } catch (error) {
    next(error);
  }
});

apiRouter.delete('/resources/:resourceId', async (req, res, next) => {
  try {
    res.json({ resource: await deleteTaskResource(req.params.resourceId) });
  } catch (error) {
    next(error);
  }
});

apiRouter.put('/preferences/:userId', async (req, res, next) => {
  try {
    res.json({ preferences: await saveUserPreferences(req.params.userId, req.body) });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/preferences/:userId', async (req, res, next) => {
  try {
    res.json(await getUserPreferences(req.params.userId));
  } catch (error) {
    next(error);
  }
});
