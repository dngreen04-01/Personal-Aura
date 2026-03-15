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
function logInteraction({ userMessage, agentsInvoked, orchestratorLatencyMs, planningLatencyMs, motivationLatencyMs, visualLatencyMs, totalLatencyMs }) {
  const entry = {
    type: 'agent-interaction',
    timestamp: new Date().toISOString(),
    userMessage: userMessage ? userMessage.substring(0, 200) : null,
    agentsInvoked,
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

module.exports = { AGENTS, buildAgentResponse, logInteraction };
