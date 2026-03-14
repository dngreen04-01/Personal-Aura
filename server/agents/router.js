const { handleMessage } = require('./orchestrator');
const { handleSwapRequest, handlePlanModification, handleProgressiveOverload } = require('./planning');
const { buildAgentContext } = require('./memory');
const { AGENTS, buildAgentResponse, logInteraction } = require('./types');
const { evaluateSet, checkMilestone, buildMotivationDirective } = require('./motivation');

/**
 * Classify user intent via keyword matching (<1ms).
 * Returns: 'swap' | 'plan_modify' | 'overload' | 'chat'
 */
function classifyIntent(message) {
  const lower = (message || '').toLowerCase();

  // Swap: explicit swap requests + pain/injury signals
  const swapKw = ['swap', 'replace', 'alternative', 'substitute', 'switch exercise',
    'different exercise', "can't do", 'hurts', 'injured', 'injury', 'pain'];
  if (swapKw.some(k => lower.includes(k))) return 'swap';

  // Plan modification: workout-level changes
  const planKw = ['modify plan', 'change plan', 'easier workout', 'harder workout',
    'lighter today', 'today lighter', 'make today', 'heavier today', 'today heavier',
    'at home', 'no equipment', 'easier today', 'today easier'];
  if (planKw.some(k => lower.includes(k))) return 'plan_modify';

  // Progressive overload: weight progression queries
  const overloadKw = ['go heavier', 'increase weight', 'add weight', 'weight progression',
    'ready for more', 'should i increase'];
  if (overloadKw.some(k => lower.includes(k))) return 'overload';

  return 'chat';
}

/** Map intent to the appropriate planning handler */
const PLANNING_HANDLERS = {
  swap: handleSwapRequest,
  plan_modify: handlePlanModification,
  overload: handleProgressiveOverload,
};

/**
 * Route an incoming request to the appropriate agent(s).
 * Planning intents → Planning Agent (Gemini Pro) with orchestrator fallback.
 * Chat intents → Orchestrator (Flash-Lite).
 */
async function routeRequest({ message, history, userContext }) {
  const startTime = Date.now();

  const intent = classifyIntent(message);
  const planningHandler = PLANNING_HANDLERS[intent];

  // --- Planning Agent path ---
  if (planningHandler) {
    const agentContext = buildAgentContext(userContext);
    const planningStart = Date.now();

    try {
      const result = await planningHandler(message, agentContext);
      const planningLatency = Date.now() - planningStart;
      const totalLatency = Date.now() - startTime;

      logInteraction({
        userMessage: message,
        agentsInvoked: [AGENTS.orchestrator, AGENTS.memory, AGENTS.planning],
        planningLatencyMs: planningLatency,
        totalLatencyMs: totalLatency,
      });

      return buildAgentResponse({
        text: result.text,
        swapSuggestion: result.swapSuggestion || null,
        planModification: result.planModification || null,
        overloadSuggestion: result.overloadSuggestion || null,
        agentsUsed: [AGENTS.orchestrator, AGENTS.memory, AGENTS.planning],
        latency: {
          planning: planningLatency,
          total: totalLatency,
        },
      });
    } catch (err) {
      // Fallback: let orchestrator handle it via function calling
      console.error(`Planning agent failed (intent: ${intent}), falling back to orchestrator:`, err.message);
    }
  }

  // --- Orchestrator path (default + fallback) ---
  const memoryStart = Date.now();
  const agentContext = buildAgentContext(userContext);
  const memoryLatency = Date.now() - memoryStart;

  const orchestratorStart = Date.now();
  const result = await handleMessage({ message, history, userContext });
  const orchestratorLatency = Date.now() - orchestratorStart;

  // --- Motivation Engine: evaluate after log_set function calls ---
  let motivationDirective = null;
  let motivationLatency = null;
  const agentsUsed = [AGENTS.orchestrator, AGENTS.memory];

  if (result.functionCall) {
    const motivationStart = Date.now();
    try {
      const fc = result.functionCall;
      const evaluation = evaluateSet({
        rpe: fc.rpe,
        goal: agentContext.user.goal,
        currentWeight: fc.weight,
        weightUnit: fc.weight_unit,
        exerciseName: fc.exercise_id,
      });

      let milestone = null;
      if (agentContext.motivation?.exerciseMaxWeight != null) {
        milestone = checkMilestone({
          currentWeight: fc.weight,
          exerciseMaxWeight: agentContext.motivation.exerciseMaxWeight,
          streakData: agentContext.motivation.streakData,
          completedSessions: agentContext.motivation.completedSessions,
        });
      }

      motivationDirective = buildMotivationDirective(evaluation, milestone);
      agentsUsed.push(AGENTS.motivation);
    } catch (err) {
      console.error('Motivation engine error:', err.message);
    }
    motivationLatency = Date.now() - motivationStart;
  }

  const totalLatency = Date.now() - startTime;

  logInteraction({
    userMessage: message,
    agentsInvoked: agentsUsed,
    orchestratorLatencyMs: orchestratorLatency,
    motivationLatencyMs: motivationLatency,
    totalLatencyMs: totalLatency,
  });

  return buildAgentResponse({
    text: result.text,
    functionCall: result.functionCall,
    swapSuggestion: result.swapSuggestion,
    motivationDirective,
    agentsUsed,
    latency: {
      memory: memoryLatency,
      orchestrator: orchestratorLatency,
      motivation: motivationLatency,
      total: totalLatency,
    },
  });
}

module.exports = { routeRequest, classifyIntent };
