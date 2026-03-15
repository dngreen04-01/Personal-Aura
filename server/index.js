require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authMiddleware = require('./middleware/auth');
const { requestIdMiddleware, errorHandler } = require('./middleware/errorHandler');
const { createRateLimit } = require('./middleware/rateLimit');

const agentRouter = require('./routes/agent');
const onboardingRouter = require('./routes/onboarding');
const progressRouter = require('./routes/progress');
const programmerRouter = require('./routes/programmer');
const jobRouter = require('./routes/jobs');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(requestIdMiddleware);

// Rate limiters
const aiRateLimit = createRateLimit(20, 60000);
const generalRateLimit = createRateLimit(60, 60000);

// Public endpoints
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Job endpoints — API key auth (Cloud Scheduler)
app.use('/api/jobs', jobRouter);

// Protected API routes — require valid Firebase auth token
app.use('/api/agent', authMiddleware, aiRateLimit, agentRouter);
app.use('/api/onboarding', authMiddleware, aiRateLimit, onboardingRouter);
app.use('/api/progress', authMiddleware, generalRateLimit, progressRouter);
app.use('/api/programmer', authMiddleware, aiRateLimit, programmerRouter);

// Centralized error handler — must be registered last
app.use(errorHandler);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Aura server running on port ${PORT}`);
});
