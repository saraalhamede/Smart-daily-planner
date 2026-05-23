import dotenv from 'dotenv';

dotenv.config({ override: true });

const { createApp } = await import('./app.js');
const port = process.env.PORT || 3000;
const app = createApp();

app.listen(port, () => {
  console.log(`Smart Planner API running at http://localhost:${port}`);
});
