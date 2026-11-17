import express from 'express';
import serverless from 'serverless-http';
import { apiRouter } from '../../src/server/routes.ts';
import { seedInitialData } from '../../src/db/seed.ts';

const app = express();
app.use(express.json({ limit: '10mb' }));

let seeded = false;
app.use(async (_req, _res, next) => {
  if (!seeded) {
    seeded = true;
    try {
      await seedInitialData();
    } catch (err) {
      console.error('Seed check error:', err);
    }
  }
  next();
});

app.use('/api', apiRouter);
app.use('/.netlify/functions/api/api', apiRouter);
app.use('/.netlify/functions/api', apiRouter);
app.use('/', apiRouter);

export const handler = serverless(app);
