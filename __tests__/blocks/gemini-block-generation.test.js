/**
 * gemini-block-generation.test.js
 *
 * Validates that realistic Gemini Planning-Agent outputs round-trip through
 * validateBlockPlan(). Uses recorded fixtures so CI stays offline and
 * deterministic. When the Planning Agent prompt changes, re-record fixtures
 * via a dev script (not wired in Phase 0).
 */
const fixtures = require('./__fixtures__/gemini-block-outputs.json');
const { validateBlockPlan, BLOCK_TYPES } = require('../../lib/validateBlockPlan');

describe('Gemini block-plan output validation (fixture-backed)', () => {
  it('fixture set includes at least one sample for every canonical block_type', () => {
    const seenTypes = new Set();
    for (const p of fixtures.prompts) {
      for (const b of p.output.blocks) seenTypes.add(b.block_type);
    }
    // Every sample fixture type should be canonical.
    for (const t of seenTypes) expect(BLOCK_TYPES).toContain(t);
    // And together they should cover at least 7 of the 9 types.
    expect(seenTypes.size).toBeGreaterThanOrEqual(7);
  });

  describe.each(fixtures.prompts)('valid prompt: $id', ({ id, output }) => {
    it('validates cleanly', () => {
      const r = validateBlockPlan(output);
      if (!r.valid) {
        // Surface errors clearly on failure.
        throw new Error(`${id} failed validation: ${r.errors.join('; ')}`);
      }
      expect(r.valid).toBe(true);
      expect(r.normalized.blocks.length).toBe(output.blocks.length);
    });
  });

  describe.each(fixtures.malformedOutputs)('malformed prompt: $id', ({ output }) => {
    it('is rejected', () => {
      const r = validateBlockPlan(output);
      expect(r.valid).toBe(false);
      expect(r.errors.length).toBeGreaterThan(0);
    });
  });
});
