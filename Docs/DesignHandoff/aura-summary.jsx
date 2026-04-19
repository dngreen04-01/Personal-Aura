// aura-summary.jsx — post-workout summary + pre-workout review

const WorkoutSummaryScreen = ({ workout, loggedSets, totalSeconds, onDone, onShare, variant }) => {
  const totalVolume = loggedSets.reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0);
  const totalReps = loggedSets.reduce((sum, s) => sum + (s.reps || 0), 0);
  const prsHit = loggedSets.filter(s => s.isPR).length;
  const mins = Math.floor(totalSeconds / 60);

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      background: AURA.bgDark, color: AURA.textPrimary,
      fontFamily: 'Inter, system-ui, sans-serif',
      overflowY: 'auto',
    }}>
      <div style={{ padding: '56px 16px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={onDone} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: AURA.textSecondary, padding: 8, margin: -8 }}>
          <Icon name="close" size={22} color={AURA.textSecondary} />
        </button>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: AURA.textMuted, textTransform: 'uppercase' }}>
          Session complete
        </div>
        <button onClick={onShare} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: AURA.primary, padding: 8 }}>
          <Icon name="share" size={20} color={AURA.primary} />
        </button>
      </div>

      <div style={{ padding: '20px 20px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 60, marginBottom: 8 }}>💪</div>
        <div style={{
          fontFamily: variant === 'editorial' ? 'Fraunces, Georgia, serif' : 'inherit',
          fontSize: 30, fontWeight: variant === 'editorial' ? 500 : 800,
          letterSpacing: -0.8, lineHeight: 1.15, marginBottom: 8,
        }}>Nice work, {USER.firstName}</div>
        <div style={{ fontSize: 14, color: AURA.textSecondary, lineHeight: 1.5, maxWidth: 280, margin: '0 auto' }}>
          {prsHit > 0
            ? `You hit ${prsHit} new personal ${prsHit === 1 ? 'record' : 'records'}. This is what momentum looks like.`
            : 'Clean session. Consistency > intensity.'}
        </div>
      </div>

      <div style={{ padding: '0 16px 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <SummaryStat label="Volume" value={`${(totalVolume / 1000).toFixed(1)}k`} unit="kg moved" accent />
          <SummaryStat label="Time" value={mins} unit="minutes" />
          <SummaryStat label="Reps" value={totalReps} unit="total" />
        </div>
      </div>

      {prsHit > 0 && (
        <div style={{ padding: '0 16px 16px' }}>
          <div style={{
            padding: 16, borderRadius: 14,
            background: AURA.primaryFaint,
            border: `1px solid ${AURA.borderSubtle}`,
            display: 'flex', gap: 10, alignItems: 'flex-start',
          }}>
            <Icon name="trophy" size={22} color={AURA.primary} />
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5, color: AURA.primary, textTransform: 'uppercase' }}>
                New PR
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4, letterSpacing: -0.3 }}>
                Bench Press · 82.5 kg × 5
              </div>
              <div style={{ fontSize: 12, color: AURA.textSecondary, marginTop: 2 }}>
                +2.5 kg from last week. 8th PR this cycle.
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: '0 16px 16px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: AURA.textMuted, textTransform: 'uppercase', marginBottom: 8 }}>
          Exercise breakdown
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {workout.exercises.map((ex, i) => {
            const sets = loggedSets.filter(s => s.exerciseId === ex.id);
            if (sets.length === 0) return null;
            const hasWeight = sets[0].weight != null;
            return (
              <div key={ex.id} style={{
                padding: '12px 14px',
                background: AURA.bgCard,
                border: `1px solid ${AURA.borderLight}`,
                borderRadius: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.2 }}>{ex.name}</div>
                  <div style={{ fontSize: 11, color: AURA.textSecondary, fontWeight: 600 }}>{sets.length} sets</div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {sets.map((s, j) => (
                    <div key={j} style={{
                      padding: '3px 8px', borderRadius: 6,
                      background: s.isPR ? AURA.primaryFaint : AURA.bgCardSolid,
                      border: s.isPR ? `1px solid ${AURA.borderSubtle}` : 'none',
                      fontSize: 11, fontWeight: 600,
                      color: s.isPR ? AURA.primary : AURA.textSecondary,
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {hasWeight ? `${s.weight}×${s.reps}` : `${s.reps}`}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ padding: '0 16px 40px', display: 'flex', gap: 8 }}>
        <button onClick={onShare} style={{
          flex: 1, padding: 14, background: AURA.primary, color: AURA.bgDark,
          border: 'none', borderRadius: 14, fontSize: 14, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <Icon name="share" size={16} color={AURA.bgDark} />
          Share
        </button>
        <button onClick={onDone} style={{
          flex: 1, padding: 14, background: AURA.bgCard, color: AURA.textPrimary,
          border: `1px solid ${AURA.borderLight}`, borderRadius: 14,
          fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        }}>
          Back to chat
        </button>
      </div>
    </div>
  );
};

const SummaryStat = ({ label, value, unit, accent }) => (
  <div style={{
    padding: 12, borderRadius: 12,
    background: accent ? AURA.primaryFaint : AURA.bgCard,
    border: `1px solid ${accent ? AURA.borderSubtle : AURA.borderLight}`,
    textAlign: 'center',
  }}>
    <div style={{
      fontSize: 24, fontWeight: 800, letterSpacing: -0.6,
      color: accent ? AURA.primary : AURA.textPrimary,
      fontVariantNumeric: 'tabular-nums', lineHeight: 1,
    }}>{value}</div>
    <div style={{ fontSize: 10, color: AURA.textSecondary, marginTop: 4, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
      {unit}
    </div>
  </div>
);

Object.assign(window, { WorkoutSummaryScreen });
