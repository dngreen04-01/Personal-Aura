require('dotenv').config();
const express = require('express');
const cors = require('cors');

const coachRouter = require('./routes/coach');
const agentRouter = require('./routes/agent');
const onboardingRouter = require('./routes/onboarding');
const progressRouter = require('./routes/progress');
const programmerRouter = require('./routes/programmer');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/coach', coachRouter);
app.use('/api/agent', agentRouter);
app.use('/api/onboarding', onboardingRouter);
app.use('/api/progress', progressRouter);
app.use('/api/programmer', programmerRouter);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Aura server running on port ${PORT}`);
});
