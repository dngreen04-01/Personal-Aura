// Agent name constants and shared utilities

const AGENTS = {
  orchestrator: 'orchestrator',
  planning: 'planning',
  memory: 'memory',
  visual: 'visual',
  motivation: 'motivation',
};

// Per-agent timeout budgets (ms).
// Shared so that router.js and orchestrator.js use consistent values.
const TIMEOUTS = {
  memory: 2000,
  orchestrator: 50000,  // must exceed planningInner + Flash-Lite overhead (~5s + 40s + 5s)
  planning: 45000,      // Pro model: structured JSON + weight estimation (direct router path)
  planningInner: 40000, // Pro model via orchestrator (Flash-Lite already consumed ~2-5s)
  visual: 30000,
  motivation: 500,
};

/**
 * Race a promise against a timeout. Rejects with a descriptive error on timeout.
 */
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

/**
 * Build a standardized agent response (superset of coach response shape).
 */
function buildAgentResponse({ text, functionCall = null, swapSuggestion = null, planModification = null, overloadSuggestion = null, motivationDirective = null, image = null, imageCaption = null, workoutCard = null, agentsUsed = [], latency = {} }) {
  return {
    text,
    functionCall,
    swapSuggestion,
    planModification,
    overloadSuggestion,
    motivationDirective,
    image,
    imageCaption,
    workoutCard,
    agentsUsed,
    latency,
  };
}

/**
 * Log agent interaction as structured JSON (non-blocking).
 * In Cloud Run, structured JSON logs are automatically parsed.
 */
function logInteraction({ userMessage, agentsInvoked, intent, intentSource, orchestratorLatencyMs, planningLatencyMs, motivationLatencyMs, visualLatencyMs, totalLatencyMs }) {
  const entry = {
    type: 'agent-interaction',
    timestamp: new Date().toISOString(),
    userMessage: userMessage ? userMessage.substring(0, 200) : null,
    agentsInvoked,
    intent: intent || null,
    intentSource: intentSource || null,
    orchestratorLatencyMs,
    planningLatencyMs: planningLatencyMs || null,
    motivationLatencyMs: motivationLatencyMs || null,
    visualLatencyMs: visualLatencyMs || null,
    totalLatencyMs,
  };
  // Non-blocking log
  process.nextTick(() => {
    console.log(JSON.stringify(entry));
  });
}

module.exports = { AGENTS, TIMEOUTS, withTimeout, buildAgentResponse, logInteraction };
