const { getAllUserUids } = require('./firestore');

async function getEligibleUsers(criteria = {}) {
  return getAllUserUids(criteria);
}

async function runForAllUsers(jobFn, filter = {}) {
  const uids = await getEligibleUsers(filter);
  const stats = { total: uids.length, success: 0, failed: 0, skipped: 0, errors: [] };

  for (const uid of uids) {
    try {
      const result = await jobFn(uid);
      if (result === 'skipped') {
        stats.skipped++;
      } else {
        stats.success++;
      }
    } catch (err) {
      stats.failed++;
      stats.errors.push({ uid, error: err.message });
      console.error(JSON.stringify({
        severity: 'ERROR',
        message: `Job failed for user ${uid}`,
        uid,
        error: err.message,
      }));
    }
  }

  return stats;
}

function logJobResult(jobName, stats) {
  console.log(JSON.stringify({
    severity: 'INFO',
    message: `Job ${jobName} completed`,
    jobName,
    ...stats,
    timestamp: new Date().toISOString(),
  }));
}

module.exports = { getEligibleUsers, runForAllUsers, logJobResult };
