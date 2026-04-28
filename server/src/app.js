import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { apiRouter } from './routes/api.js';

dotenv.config();

export function createApp() {
  const app = express();

  app.use(cors({
    origin: process.env.CLIENT_ORIGIN || 'http://127.0.0.1:5173'
  }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api', apiRouter);

  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(error.status || 500).json({
      error: error.message || 'Internal server error'
    });
  });

  return app;
}
