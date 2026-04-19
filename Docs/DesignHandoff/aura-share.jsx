// aura-share.jsx — Strava-style shareable workout card

const ShareCardScreen = ({ onBack, loggedSets, totalSeconds, variant = 'stats' }) => {
  const totalVolume = loggedSets.reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0);
  const totalReps = loggedSets.reduce((sum, s) => sum + (s.reps || 0), 0);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  const prsHit = loggedSets.filter(s => s.isPR).length;
  const heaviestSet = loggedSets.filter(s => s.weight).sort((a, b) => b.weight - a.weight)[0];

  return (
    <div style={{
      width: '100%', height: '100%', background: AURA.bgDark,
      color: AURA.textPrimary, display: 'flex', flexDirection: 'column',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{ padding: '56px 16px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={onBack} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 8, margin: -8 }}>
          <Icon name="chevronLeft" size={22} color={AURA.textSecondary} />
        </button>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Share</div>
        <div style={{ width: 38 }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px 100px' }}>
        {/* Preview card */}
        <div style={{
          background: '#0a0b04',
          borderRadius: 20,
          overflow: 'hidden',
          border: `1px solid ${AURA.borderLight}`,
          aspectRatio: '4 / 5',
          padding: 20,
          position: 'relative',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* glow decoration */}
          <div style={{
            position: 'absolute', top: -80, right: -80,
            width: 240, height: 240, borderRadius: '50%',
            background: `radial-gradient(circle, ${AURA.primaryFaint}, transparent 60%)`,
            pointerEvents: 'none',
          }} />

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, position: 'relative' }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'linear-gradient(135deg, #d4ff00, #88aa00)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 800, color: AURA.bgDark,
            }}>{USER.firstName[0]}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: -0.2 }}>{USER.firstName}</div>
              <div style={{ fontSize: 10, color: AURA.textSecondary, fontWeight: 600 }}>
                Monday · 8:34 AM · Iron Works
              </div>
            </div>
            <AuraOrb size={20} />
          </div>

          {/* Title */}
          <div style={{
            fontSize: 11, letterSpacing: 2, color: AURA.primary,
            fontWeight: 800, textTransform: 'uppercase', marginBottom: 4,
          }}>Push Session</div>
          <div style={{
            fontSize: 26, fontWeight: 800, letterSpacing: -0.6,
            lineHeight: 1.1, marginBottom: 14,
          }}>{WORKOUT.focus}</div>

          {/* Hero metric */}
          <div style={{
            padding: '16px 0',
            borderTop: `1px solid ${AURA.borderLight}`,
            borderBottom: `1px solid ${AURA.borderLight}`,
            marginBottom: 14,
          }}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: AURA.textMuted, fontWeight: 800, textTransform: 'uppercase' }}>
              New PR · Bench Press
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
              <div style={{
                fontSize: 56, fontWeight: 800, letterSpacing: -2,
                color: AURA.primary, fontVariantNumeric: 'tabular-nums', lineHeight: 1,
              }}>82.5</div>
              <div style={{ fontSize: 20, color: AURA.textSecondary, fontWeight: 700 }}>kg</div>
              <div style={{ fontSize: 16, color: AURA.textSecondary, fontWeight: 600, marginLeft: 6 }}>× 5</div>
              <div style={{ marginLeft: 'auto', fontSize: 12, color: AURA.primary, fontWeight: 700 }}>+2.5kg</div>
            </div>
          </div>

          {/* Stats grid — Strava style */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, rowGap: 10 }}>
            <ShareMetric label="Volume" value={`${(totalVolume / 1000).toFixed(1)}k`} unit="kg" />
            <ShareMetric label="Time" value={`${mins}:${String(secs).padStart(2, '0')}`} unit="" align="right" />
            <ShareMetric label="Total reps" value={totalReps} unit="" />
            <ShareMetric label="Exercises" value={WORKOUT.exercises.length} unit="" align="right" />
          </div>

          {/* Footer */}
          <div style={{ marginTop: 'auto', paddingTop: 14, display: 'flex', alignItems: 'center', gap: 6, borderTop: `1px solid ${AURA.borderLight}` }}>
            <div style={{
              width: 14, height: 14, borderRadius: '50%',
              background: 'linear-gradient(135deg, #d4ff00, #88aa00)',
            }} />
            <div style={{ fontSize: 10, color: AURA.textSecondary, fontWeight: 600, letterSpacing: 0.5 }}>
              Coached by <span style={{ color: AURA.primary, fontWeight: 700 }}>Aura</span>
            </div>
            <div style={{ marginLeft: 'auto', fontSize: 10, color: AURA.textMuted, fontWeight: 600 }}>
              Day {USER.streak} streak 🔥
            </div>
          </div>
        </div>

        {/* Caption */}
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: AURA.textMuted, marginBottom: 6, textTransform: 'uppercase' }}>
            Caption
          </div>
          <div style={{
            padding: 12, background: AURA.bgCard,
            border: `1px solid ${AURA.borderLight}`,
            borderRadius: 12,
            fontSize: 13, color: AURA.textPrimary, lineHeight: 1.5,
          }}>
            New bench PR. 82.5×5 feels clean — first time ever. 12 weeks of consistency adding up. 🙌
          </div>
        </div>

        {/* Destinations */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {['Instagram', 'Twitter', 'Strava'].map(d => (
            <button key={d} style={{
              flex: 1, padding: '10px 6px',
              background: AURA.bgCard,
              border: `1px solid ${AURA.borderLight}`,
              borderRadius: 10, color: AURA.textPrimary,
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'inherit',
            }}>{d}</button>
          ))}
        </div>
      </div>

      {/* Bottom CTA */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '12px 16px 36px',
        background: AURA.bgDark, borderTop: `1px solid ${AURA.borderLight}`,
      }}>
        <button style={{
          width: '100%', padding: 14,
          background: AURA.primary, color: AURA.bgDark,
          border: 'none', borderRadius: 14,
          fontSize: 15, fontWeight: 700, cursor: 'pointer',
          fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <Icon name="share" size={16} color={AURA.bgDark} />
          Share workout
        </button>
      </div>
    </div>
  );
};

const ShareMetric = ({ label, value, unit, align = 'left' }) => (
  <div style={{ textAlign: align }}>
    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.5, color: AURA.textMuted, textTransform: 'uppercase', marginBottom: 2 }}>
      {label}
    </div>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}>
      <div style={{
        fontSize: 22, fontWeight: 800, letterSpacing: -0.5,
        color: AURA.textPrimary, fontVariantNumeric: 'tabular-nums', lineHeight: 1,
      }}>{value}</div>
      {unit && <div style={{ fontSize: 11, color: AURA.textSecondary, fontWeight: 600 }}>{unit}</div>}
    </div>
  </div>
);

Object.assign(window, { ShareCardScreen });
