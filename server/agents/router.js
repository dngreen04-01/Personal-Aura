const { handleMessage } = require('./orchestrator');
const { AGENTS, buildAgentResponse, logInteraction } = require('./types');

/**
 * Route an incoming request to the appropriate agent(s).
 * Currently dispatches everything to the orchestrator (coach).
 * Future: intent classification, multi-agent dispatch.
 */
async function routeRequest({ message, history, userContext }) {
  const startTime = Date.now();

  // --- Future: intent classification goes here ---
  // const intent = classifyIntent(message);
  // const agents = selectAgents(intent);

  // Memory agent: context normalization (deterministic, <1ms)
  const memoryStart = Date.now();
  // Memory agent runs inside orchestrator.handleMessage() via buildAgentContext()
  const memoryLatency = Date.now() - memoryStart;

  // Dispatch to orchestrator
  const orchestratorStart = Date.now();
  const result = await handleMessage({ message, history, userContext });
  const orchestratorLatency = Date.now() - orchestratorStart;

  const totalLatency = Date.now() - startTime;

  // Log interaction (non-blocking)
  logInteraction({
    userMessage: message,
    agentsInvoked: [AGENTS.orchestrator, AGENTS.memory],
    orchestratorLatencyMs: orchestratorLatency,
    totalLatencyMs: totalLatency,
  });

  return buildAgentResponse({
    text: result.text,
    functionCall: result.functionCall,
    swapSuggestion: result.swapSuggestion,
    agentsUsed: [AGENTS.orchestrator, AGENTS.memory],
    latency: {
      memory: memoryLatency,
      orchestrator: orchestratorLatency,
      total: totalLatency,
    },
  });
}

module.exports = { routeRequest };
