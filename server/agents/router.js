const { handleMessage } = require('./orchestrator');
const { handleSwapRequest, handlePlanModification, handleProgressiveOverload, handleWorkoutModification } = require('./planning');
const { generateExerciseDemo } = require('./visual');
const { buildAgentContext } = require('./memory');
const { AGENTS, TIMEOUTS, withTimeout, buildAgentResponse, logInteraction } = require('./types');
const { evaluateSet, checkMilestone, buildMotivationDirective } = require('./motivation');
const { calculateWorkoutDuration } = require('../../lib/calculateWorkoutDuration');


/**
 * Classify user intent via keyword matching (<1ms).
 * Returns: 'ready' | 'swap' | 'injury' | 'replace' | 'modify' | 'overload' | 'visual' | 'chat'
 */
function classifyIntent(message) {
  const lower = (message || '').toLowerCase();

  // Ready: user accepts workout — check FIRST (highest priority for short phrases)
  const readyKw = ["let's go", "ready", "i'm good", "sounds good", "let's do it",
    "start", "begin", "perfect", "looks good", "good to go", "yes", "yeah", "yep"];
  if (readyKw.some(k => lower.includes(k))) return 'ready';

  // Swap: explicit swap requests
  const swapKw = ['swap', 'alternative', 'substitute', 'switch exercise',
    'different exercise', "can't do"];
  if (swapKw.some(k => lower.includes(k))) return 'swap';

  // Injury/fatigue: adapt workout
  const injuryKw = ["shoulder hurts", "feeling tired", "didn't sleep", "sore from",
    "low energy", "minor injury", "my back", "my knee", "tweaked", "pain in",
    "hurts", "injured", "fatigue", "exhausted", "not feeling great"];
  if (injuryKw.some(k => lower.includes(k))) return 'injury';

  // Replace: new/custom workout requests (check BEFORE modify)
  const replaceKw = ['completely different', 'skip the plan', 'something else entirely',
    'different type of workout', 'outdoor workout', 'want to do yoga',
    'scrap this', 'different workout', 'change everything',
    // Custom workout creation — needs full workoutCard, not planModification
    'custom workout', 'make me a', 'make a workout', 'build me a',
    'new workout', 'want to do', 'rather do', 'instead do'];
  if (replaceKw.some(k => lower.includes(k))) return 'replace';

  // Modify: tweak existing workout
  const modifyKw = ['make it shorter', 'make it longer', 'fewer sets', 'more sets',
    'fewer exercises', 'more exercises', 'less rest', 'more rest', 'lighter',
    'heavier', 'easier', 'harder', 'modify', 'adjust', 'change', 'shorten',
    'add more', 'remove', 'less volume', 'more volume', 'quick workout',
    'change my plan', 'modify plan', 'update plan', 'adjust plan',
    'change my workout', 'change the workout', 'change today',
    'easier workout', 'harder workout', 'shorter workout', 'longer workout',
    'lighter today', 'today lighter', 'make today', 'heavier today', 'today heavier',
    'easier today', 'today easier', 'at home', 'no equipment',
    'only have', 'just have', 'kettlebell', 'dumbbell only', 'bodyweight only',
    'minute workout', 'min workout'];
  if (modifyKw.some(k => lower.includes(k))) return 'modify';

  // Progressive overload: weight progression queries
  const overloadKw = ['go heavier', 'increase weight', 'add weight', 'weight progression',
    'ready for more', 'should i increase'];
  if (overloadKw.some(k => lower.includes(k))) return 'overload';

  // Visual: exercise demo / form check requests
  const visualKw = ['show me', 'what does', 'look like', 'demonstrate', 'form check',
    'how to do', 'proper form', 'exercise demo', 'show form'];
  if (visualKw.some(k => lower.includes(k))) return 'visual';

  return 'chat';
}

/** Map intent to the appropriate planning handler */
const PLANNING_HANDLERS = {
  swap: handleSwapRequest,
  modify: handlePlanModification,
  overload: handleProgressiveOverload,
  replace: handleWorkoutModification,
  injury: handleWorkoutModification,
};

/**
 * Route an incoming request to the appropriate agent(s).
 * Planning intents → Planning Agent (Gemini Pro) with orchestrator fallback.
 * Chat intents → Orchestrator (Flash-Lite).
 */
async function routeRequest({ message, history, userContext }) {
  const startTime = Date.now();

  const intent = classifyIntent(message);
  let intentSource = 'router';

  // --- Ready intent: deterministic response, no LLM needed ---
  if (intent === 'ready') {
    const exercises = userContext.currentDay?.exercises || [];
    const blocks = userContext.currentDay?.blocks;
    const totalLatency = Date.now() - startTime;
    logInteraction({
      userMessage: message,
      agentsInvoked: [AGENTS.memory],
      intent,
      intentSource,
      totalLatencyMs: totalLatency,
    });
    return buildAgentResponse({
      text: "Let's crush it! Here's your workout:",
      workoutCard: {
        focus: userContext.currentDay?.focus || 'Workout',
        blocks,
        exercises,
        estimatedDuration: calculateWorkoutDuration({ blocks, exercises }),
        modificationType: 'original',
      },
      agentsUsed: [AGENTS.memory],
      latency: { total: Date.now() - startTime },
    });
  }

  const planningHandler = PLANNING_HANDLERS[intent];

  // --- Planning Agent path ---
  if (planningHandler) {
    const agentContext = buildAgentContext(userContext);
    const planningStart = Date.now();

    try {
      const result = await withTimeout(
        planningHandler(message, agentContext),
        TIMEOUTS.planning,
        'Planning Agent'
      );
      const planningLatency = Date.now() - planningStart;
      const totalLatency = Date.now() - startTime;

      logInteraction({
        userMessage: message,
        agentsInvoked: [AGENTS.orchestrator, AGENTS.memory, AGENTS.planning],
        intent,
        intentSource,
        planningLatencyMs: planningLatency,
        totalLatencyMs: totalLatency,
      });

      return buildAgentResponse({
        text: result.text,
        swapSuggestion: result.swapSuggestion || null,
        planModification: result.planModification || null,
        overloadSuggestion: result.overloadSuggestion || null,
        workoutCard: result.workoutCard || null,
        agentsUsed: [AGENTS.orchestrator, AGENTS.memory, AGENTS.planning],
        latency: {
          planning: planningLatency,
          total: totalLatency,
        },
      });
    } catch (err) {
      // Fallback: let orchestrator handle it via function calling
      console.error(`Planning agent failed (intent: ${intent}), falling back to orchestrator:`, err.message);
      intentSource = 'orchestrator-fallback';
    }
  }

  // --- Visual Agent path ---
  if (intent === 'visual') {
    const agentContext = buildAgentContext(userContext);
    const visualStart = Date.now();

    try {
      // Extract exercise name: strip visual keywords, fall back to current exercise
      const visualStrip = ['show me', 'what does', 'look like', 'demonstrate', 'form check',
        'how to do', 'proper form', 'exercise demo', 'show form', 'how do i do', 'how do you do'];
      let exerciseName = (message || '').toLowerCase();
      for (const kw of visualStrip) {
        exerciseName = exerciseName.replace(kw, '');
      }
      exerciseName = exerciseName.replace(/[?!.,]/g, '').trim();

      // Fall back to current exercise from context
      if (!exerciseName || exerciseName.length < 2) {
        exerciseName = agentContext.workout?.currentExercise || 'exercise';
      }

      const equipment = agentContext.user?.equipment || null;
      const result = await withTimeout(
        generateExerciseDemo(exerciseName, equipment),
        TIMEOUTS.visual,
        'Visual Agent'
      );
      const visualLatency = Date.now() - visualStart;
      const totalLatency = Date.now() - startTime;

      logInteraction({
        userMessage: message,
        agentsInvoked: [AGENTS.orchestrator, AGENTS.memory, AGENTS.visual],
        intent,
        intentSource,
        visualLatencyMs: visualLatency,
        totalLatencyMs: totalLatency,
      });

      return buildAgentResponse({
        text: result.caption,
        image: result.image,
        imageCaption: result.caption,
        agentsUsed: [AGENTS.orchestrator, AGENTS.memory, AGENTS.visual],
        latency: {
          visual: visualLatency,
          total: totalLatency,
        },
      });
    } catch (err) {
      console.error('Visual agent failed, falling back to orchestrator:', err.message);
      intentSource = 'orchestrator-fallback';
    }
  }

  // --- Orchestrator path (default + fallback) ---
  const memoryStart = Date.now();
  const agentContext = buildAgentContext(userContext);
  const memoryLatency = Date.now() - memoryStart;

  let result;
  const orchestratorStart = Date.now();
  try {
    result = await withTimeout(
      handleMessage({ message, history, userContext }),
      TIMEOUTS.orchestrator,
      'Orchestrator'
    );
  } catch (err) {
    console.error('Orchestrator failed:', err.message);
    const totalLatency = Date.now() - startTime;
    return buildAgentResponse({
      text: "I'm having trouble processing that right now. Could you try rephrasing, or let me know what you'd like to do?",
      agentsUsed: [AGENTS.orchestrator, AGENTS.memory],
      latency: { total: totalLatency },
    });
  }
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
    intent,
    intentSource,
    orchestratorLatencyMs: orchestratorLatency,
    motivationLatencyMs: motivationLatency,
    totalLatencyMs: totalLatency,
  });

  return buildAgentResponse({
    text: result.text,
    functionCall: result.functionCall,
    swapSuggestion: result.swapSuggestion,
    workoutCard: result.workoutCard,
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
