#!/usr/bin/env node

/**
 * Manual job runner for local development.
 * Usage: node server/scripts/runJob.js <job-name>
 *
 * Jobs: streak-checker, progress-analyzer, plan-adjuster
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const jobName = process.argv[2];

const JOBS = {
  'streak-checker': () => require('../jobs/streakChecker').runStreakChecker(),
  'progress-analyzer': () => require('../jobs/progressAnalyzer').runProgressAnalyzer(),
  'plan-adjuster': () => require('../jobs/planAdjuster').runPlanAdjuster(),
};

if (!jobName || !JOBS[jobName]) {
  console.error(`Usage: node server/scripts/runJob.js <${Object.keys(JOBS).join('|')}>`);
  process.exit(1);
}

console.log(`Running job: ${jobName}`);

JOBS[jobName]()
  .then(result => {
    console.log('Job result:', JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error('Job failed:', err);
    process.exit(1);
  });
