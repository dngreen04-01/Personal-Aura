// Agent name constants and shared utilities

const AGENTS = {
  orchestrator: 'orchestrator',
  planning: 'planning',
  memory: 'memory',
  visual: 'visual',
  motivation: 'motivation',
};

/**
 * Build a standardized agent response (superset of coach response shape).
 */
function buildAgentResponse({ text, functionCall = null, swapSuggestion = null, agentsUsed = [], latency = {} }) {
  return {
    text,
    functionCall,
    swapSuggestion,
    agentsUsed,
    latency,
  };
}

/**
 * Log agent interaction as structured JSON (non-blocking).
 * In Cloud Run, structured JSON logs are automatically parsed.
 */
function logInteraction({ userMessage, agentsInvoked, orchestratorLatencyMs, totalLatencyMs }) {
  const entry = {
    type: 'agent-interaction',
    timestamp: new Date().toISOString(),
    userMessage: userMessage ? userMessage.substring(0, 200) : null,
    agentsInvoked,
    orchestratorLatencyMs,
    totalLatencyMs,
  };
  // Non-blocking log
  process.nextTick(() => {
    console.log(JSON.stringify(entry));
  });
}

module.exports = { AGENTS, buildAgentResponse, logInteraction };
