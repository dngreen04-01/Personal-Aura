// Pure state machine for walking a greeting tree returned by /api/agent/greet.
// Tree shape:
//   { text, chips, branches: [{ chip, text, nextChips?, nextBranches?, showsWorkoutCard?, handoffToCoach?, prefillMessage? }] }
//
// Usage:
//   const player = createGreetingPlayer(tree);
//   player.firstTurn() -> { text, chips } | null  (null if tree is empty)
//   player.advance(chipText) -> advancement object describing what to do next

export function createGreetingPlayer(tree) {
  let level = 'root';                  // 'root' | 'branch' | 'done'
  let currentBranch = null;            // current branch node when level === 'branch'

  function firstTurn() {
    if (!tree?.text || !Array.isArray(tree.chips)) return null;
    return { text: tree.text, chips: tree.chips };
  }

  function advance(chipText) {
    if (level === 'done') {
      return { kind: 'done' };
    }

    if (level === 'root') {
      const branch = tree.branches?.find(b => b.chip === chipText);
      if (!branch) return { kind: 'unknown-chip' };
      currentBranch = branch;

      if (branch.handoffToCoach) {
        level = 'done';
        return {
          kind: 'handoff',
          text: branch.text,
          prefillMessage: branch.prefillMessage || chipText,
        };
      }

      if (Array.isArray(branch.nextChips) && branch.nextChips.length > 0) {
        level = 'branch';
        return {
          kind: 'message',
          text: branch.text,
          chips: branch.nextChips,
          showsWorkoutCard: false,
        };
      }

      // Terminal: show workout card
      level = 'done';
      return {
        kind: 'message',
        text: branch.text,
        chips: null,
        showsWorkoutCard: !!branch.showsWorkoutCard,
      };
    }

    // level === 'branch'
    const leaf = currentBranch.nextBranches?.find(b => b.chip === chipText);
    if (!leaf) return { kind: 'unknown-chip' };
    level = 'done';
    return {
      kind: 'message',
      text: leaf.text,
      chips: null,
      showsWorkoutCard: !!leaf.showsWorkoutCard,
    };
  }

  function isDone() {
    return level === 'done';
  }

  return { firstTurn, advance, isDone };
}
