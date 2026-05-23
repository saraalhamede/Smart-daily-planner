import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { apiRouter } from './routes/api.js';

dotenv.config({ override: true });

export function createApp() {
  const app = express();
  const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim());

  app.use(cors({
    origin(origin, callback) {
      const isLocalDev = /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin || '');
      if (!origin || allowedOrigins.includes(origin) || isLocalDev) {
        callback(null, true);
        return;
      }
      callback(new Error('Not allowed by CORS'));
    }
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
