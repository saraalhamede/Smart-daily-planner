import { Router } from 'express';
import {
  createDailyLog,
  createTask,
  generateSchedule,
  getBootstrap,
  getTasks,
  submitFeedback
} from '../services/plannerService.js';

export const apiRouter = Router();

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

apiRouter.post('/daily-logs', async (req, res, next) => {
  try {
    res.status(201).json({ daily_log: await createDailyLog(req.body) });
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

apiRouter.post('/schedules/generate', async (req, res, next) => {
  try {
    res.status(201).json(await generateSchedule(req.body));
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
