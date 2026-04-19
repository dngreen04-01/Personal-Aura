// aura-workout.jsx — live workout screen with exercise card + rest timer variations

const WorkoutScreen = ({
  workout, exerciseIdx, setIdx, onLogSet, onExit,
  cardVariant = 'a', restVariant = 'bottomsheet',
  restSecondsLeft, isResting, onSkipRest, onExtendRest,
  variant,
}) => {
  const exercise = workout.exercises[exerciseIdx];
  const currentSet = setIdx + 1;
  const totalSets = exercise.sets;
  const progressPct = ((exerciseIdx + (setIdx / totalSets)) / workout.exercises.length) * 100;

  const [weight, setWeight] = React.useState(exercise.targetWeight);
  const [reps, setReps] = React.useState(typeof exercise.reps === 'string' && exercise.reps.includes('–')
    ? parseInt(exercise.reps.split('–')[0]) : parseInt(exercise.reps) || 10);

  // Reset on exercise/set change
  React.useEffect(() => {
    setWeight(exercise.targetWeight);
    setReps(typeof exercise.reps === 'string' && exercise.reps.includes('–')
      ? parseInt(exercise.reps.split('–')[0]) : parseInt(exercise.reps) || 10);
  }, [exerciseIdx, setIdx]);

  return (
    <div style={{
      width: '100%', height: '100%', position: 'relative', overflow: 'hidden',
      background: AURA.bgDark, color: AURA.textPrimary,
      display: 'flex', flexDirection: 'column',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      {/* Top bar */}
      <div style={{
        padding: '62px 16px 10px', display: 'flex',
        alignItems: 'center', justifyContent: 'space-between',
      }}>
        <button onClick={onExit} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: AURA.textSecondary, padding: 8, margin: -8,
        }}>
          <Icon name="close" size={22} color={AURA.textSecondary} />
        </button>
        <div style={{ fontSize: 12, color: AURA.textSecondary, fontWeight: 600 }}>
          <span style={{ color: AURA.primary, fontWeight: 800 }}>Ex {exerciseIdx + 1}</span>
          <span style={{ opacity: 0.5 }}> / {workout.exercises.length}</span>
          <span style={{ margin: '0 8px', opacity: 0.4 }}>·</span>
          <span style={{ letterSpacing: 1, textTransform: 'uppercase', fontSize: 10, fontWeight: 800, color: AURA.textMuted }}>
            Push
          </span>
        </div>
        <div style={{ width: 22 }} />
      </div>

      {/* Progress bar */}
      <div style={{ padding: '0 16px 16px' }}>
        <div style={{ height: 3, background: AURA.borderLight, borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            width: `${progressPct}%`, height: '100%',
            background: AURA.primary, transition: 'width 0.4s ease',
          }} />
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 120px' }}>
        <ExerciseCard
          exercise={exercise}
          currentSet={currentSet}
          totalSets={totalSets}
          weight={weight}
          setWeight={setWeight}
          reps={reps}
          setReps={setReps}
          onLog={() => onLogSet(weight, reps)}
          variant={cardVariant}
          theme={variant}
        />

        {/* Coach tip */}
        {exercise.id === 'bench' && (
          <div style={{
            marginTop: 16,
            padding: 14,
            background: AURA.primaryGhost,
            border: `1px solid ${AURA.borderSubtle}`,
            borderRadius: 14,
            display: 'flex', gap: 10,
          }}>
            <AuraOrb size={22} />
            <div style={{ flex: 1, fontSize: 13, lineHeight: 1.5, color: AURA.textPrimary }}>
              {renderMd("Last week: **80×5**, 2 reps in reserve. You've got this — drive through the heels.")}
            </div>
          </div>
        )}

        {/* Up next */}
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: AURA.textMuted, textTransform: 'uppercase', marginBottom: 8 }}>
            Up next
          </div>
          {workout.exercises.slice(exerciseIdx + 1, exerciseIdx + 4).map((ex, i) => (
            <div key={ex.id} style={{
              padding: '12px 14px', marginBottom: 6,
              background: AURA.bgCard,
              border: `1px solid ${AURA.borderLight}`,
              borderRadius: 12,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{
                width: 24, height: 24, borderRadius: 6,
                background: AURA.bgCardSolid,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, color: AURA.textSecondary,
              }}>{exerciseIdx + 2 + i}</div>
              <div style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{ex.name}</div>
              <div style={{ fontSize: 12, color: AURA.textSecondary, fontWeight: 600 }}>
                {ex.sets}×{ex.reps}
              </div>
            </div>
          ))}
          {workout.exercises.length - exerciseIdx - 1 === 0 && (
            <div style={{ fontSize: 13, color: AURA.textSecondary, padding: 12 }}>
              Last one — then you're done.
            </div>
          )}
        </div>
      </div>

      {/* Rest timer overlay variants */}
      {isResting && (
        <RestTimer
          secondsLeft={restSecondsLeft}
          totalSeconds={exercise.rest}
          onSkip={onSkipRest}
          onExtend={onExtendRest}
          nextSet={currentSet}
          totalSets={totalSets}
          exercise={exercise}
          variant={restVariant}
        />
      )}
    </div>
  );
};

// ─── Exercise card — 3 layout variants ───────────────────────
const ExerciseCard = ({ exercise, currentSet, totalSets, weight, setWeight, reps, setReps, onLog, variant, theme }) => {
  // Variant A: Big number focus — hero weight display
  // Variant B: Two-column — weight + reps side by side
  // Variant C: Editorial — big typographic layout

  if (variant === 'b') {
    return <ExerciseCardB {...{ exercise, currentSet, totalSets, weight, setWeight, reps, setReps, onLog, theme }} />;
  }
  if (variant === 'c') {
    return <ExerciseCardC {...{ exercise, currentSet, totalSets, weight, setWeight, reps, setReps, onLog, theme }} />;
  }
  return <ExerciseCardA {...{ exercise, currentSet, totalSets, weight, setWeight, reps, setReps, onLog, theme }} />;
};

// Variant A — Hero weight, stepper, compact reps
const ExerciseCardA = ({ exercise, currentSet, totalSets, weight, setWeight, reps, setReps, onLog }) => {
  const hasWeight = exercise.targetWeight !== null;
  return (
    <div style={{
      background: AURA.bgCard,
      border: `1px solid ${AURA.borderLight}`,
      borderRadius: 20,
      padding: 20,
    }}>
      {/* Category chip */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
          padding: '4px 8px', borderRadius: 6,
          background: AURA.primaryFaint, color: AURA.primary,
          textTransform: 'uppercase',
        }}>{exercise.category}</div>
        {exercise.lastPR && (
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 1,
            padding: '4px 8px', borderRadius: 6,
            background: AURA.bgCardSolid, color: AURA.textSecondary,
            textTransform: 'uppercase',
          }}>Last: {exercise.lastPR.weight ? `${exercise.lastPR.weight}kg × ${exercise.lastPR.reps}` : `${exercise.lastPR.reps} reps`}</div>
        )}
      </div>

      <h2 style={{
        fontSize: 26, fontWeight: 800, letterSpacing: -0.7,
        margin: '0 0 4px', lineHeight: 1.1,
      }}>{exercise.name}</h2>
      <div style={{ fontSize: 13, color: AURA.textSecondary, marginBottom: 18 }}>
        Set {currentSet} of {totalSets} · Target {exercise.reps} reps
      </div>

      {/* Set dots */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 22 }}>
        {Array.from({ length: totalSets }).map((_, i) => (
          <div key={i} style={{
            flex: 1, height: 6, borderRadius: 3,
            background: i < currentSet - 1 ? AURA.primary
              : i === currentSet - 1 ? AURA.primaryDim
              : AURA.borderLight,
          }} />
        ))}
      </div>

      {/* Weight hero */}
      {hasWeight && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: AURA.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>
            Target weight
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <button onClick={() => setWeight(Math.max(0, weight - 2.5))} style={stepperBtnStyle()}>
              <Icon name="chevronLeft" size={22} color={AURA.primary} stroke={2.5} />
            </button>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{
                fontSize: 72, fontWeight: 800,
                color: AURA.primary, letterSpacing: -3,
                lineHeight: 1, fontVariantNumeric: 'tabular-nums',
              }}>{weight}</div>
              <div style={{ fontSize: 13, color: AURA.textSecondary, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 4 }}>
                {exercise.unit}
              </div>
            </div>
            <button onClick={() => setWeight(weight + 2.5)} style={stepperBtnStyle()}>
              <Icon name="chevronRight" size={22} color={AURA.primary} stroke={2.5} />
            </button>
          </div>
          {exercise.lastPR && weight > exercise.lastPR.weight && (
            <div style={{ textAlign: 'center', fontSize: 12, color: AURA.primary, fontWeight: 700, marginTop: 2, letterSpacing: 0.3 }}>
              +{(weight - exercise.lastPR.weight).toFixed(1)}kg from last PR · {renderMd('**new record**')}
            </div>
          )}
        </>
      )}

      {/* Reps stepper */}
      <div style={{ display: 'flex', gap: 10, marginTop: 20, alignItems: 'center',
        padding: 12, background: AURA.bgCardSolid, borderRadius: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: AURA.textMuted, textTransform: 'uppercase' }}>Reps done</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: AURA.textPrimary, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{reps}</div>
        </div>
        <button onClick={() => setReps(Math.max(1, reps - 1))} style={smallStepBtn()}>−</button>
        <button onClick={() => setReps(reps + 1)} style={smallStepBtn()}>+</button>
      </div>

      <button onClick={onLog} style={logBtnStyle()}>
        <Icon name="check" size={18} color={AURA.bgDark} stroke={3} />
        Log set {currentSet}
      </button>

      {exercise.cue && (
        <div style={{ marginTop: 14, fontSize: 12, color: AURA.textSecondary, fontStyle: 'italic', textAlign: 'center' }}>
          {exercise.cue}
        </div>
      )}
    </div>
  );
};

// Variant B — Split layout, weight+reps equal
const ExerciseCardB = ({ exercise, currentSet, totalSets, weight, setWeight, reps, setReps, onLog }) => {
  const hasWeight = exercise.targetWeight !== null;
  return (
    <div style={{
      background: AURA.bgCard,
      border: `1px solid ${AURA.borderLight}`,
      borderRadius: 20, padding: 20,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: AURA.primary, textTransform: 'uppercase' }}>{exercise.category}</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5, margin: '4px 0 2px', lineHeight: 1.15 }}>{exercise.name}</h2>
          <div style={{ fontSize: 12, color: AURA.textSecondary }}>Set {currentSet}/{totalSets}</div>
        </div>
        {exercise.lastPR?.weight && (
          <div style={{
            padding: '6px 10px', background: AURA.bgCardSolid,
            borderRadius: 10, textAlign: 'right',
          }}>
            <div style={{ fontSize: 9, letterSpacing: 1.5, color: AURA.textMuted, fontWeight: 700 }}>LAST PR</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: AURA.textPrimary }}>{exercise.lastPR.weight}kg</div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        {hasWeight && (
          <ValueTile label="Weight" value={weight} unit={exercise.unit}
            onDec={() => setWeight(Math.max(0, weight - 2.5))}
            onInc={() => setWeight(weight + 2.5)}
            highlight={exercise.lastPR && weight > exercise.lastPR.weight}
          />
        )}
        <ValueTile label="Reps" value={reps} unit={exercise.reps === 'AMRAP' ? 'max' : `of ${exercise.reps}`}
          onDec={() => setReps(Math.max(1, reps - 1))}
          onInc={() => setReps(reps + 1)}
        />
      </div>

      <button onClick={onLog} style={logBtnStyle()}>
        <Icon name="check" size={18} color={AURA.bgDark} stroke={3} />
        Log set {currentSet}
      </button>

      {exercise.cue && (
        <div style={{ marginTop: 12, fontSize: 12, color: AURA.textSecondary, fontStyle: 'italic' }}>
          💡 {exercise.cue}
        </div>
      )}
    </div>
  );
};

// Variant C — Editorial, minimal, big typography
const ExerciseCardC = ({ exercise, currentSet, totalSets, weight, setWeight, reps, setReps, onLog }) => {
  const hasWeight = exercise.targetWeight !== null;
  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, color: AURA.textMuted, textTransform: 'uppercase', marginBottom: 12 }}>
        — {exercise.category} · Set {String(currentSet).padStart(2, '0')}/{String(totalSets).padStart(2, '0')}
      </div>
      <h2 style={{
        fontFamily: 'Fraunces, Georgia, serif',
        fontSize: 34, fontWeight: 500, letterSpacing: -1,
        margin: '0 0 20px', lineHeight: 1.05, color: AURA.textPrimary,
      }}>{exercise.name}</h2>

      {/* Set dots */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
        {Array.from({ length: totalSets }).map((_, i) => (
          <div key={i} style={{
            flex: 1, height: 2,
            background: i < currentSet - 1 ? AURA.primary
              : i === currentSet - 1 ? AURA.primaryDim
              : AURA.borderLight,
          }} />
        ))}
      </div>

      {hasWeight && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, justifyContent: 'center' }}>
            <button onClick={() => setWeight(Math.max(0, weight - 2.5))} style={editorialStepBtn()}>−</button>
            <div style={{
              fontFamily: 'Fraunces, Georgia, serif',
              fontSize: 96, fontWeight: 300, letterSpacing: -4,
              color: AURA.textPrimary, lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
            }}>{weight}</div>
            <div style={{
              fontFamily: 'Fraunces, Georgia, serif',
              fontSize: 24, fontStyle: 'italic', color: AURA.textSecondary,
            }}>{exercise.unit}</div>
            <button onClick={() => setWeight(weight + 2.5)} style={editorialStepBtn()}>+</button>
          </div>
          <div style={{ textAlign: 'center', fontSize: 11, letterSpacing: 3, color: AURA.textMuted, textTransform: 'uppercase', marginTop: 6, fontWeight: 700 }}>
            × {reps} reps
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setReps(Math.max(1, reps - 1))} style={{ ...logBtnStyle(), background: AURA.bgCard, color: AURA.textPrimary, border: `1px solid ${AURA.borderLight}` }}>
          − rep
        </button>
        <button onClick={() => setReps(reps + 1)} style={{ ...logBtnStyle(), background: AURA.bgCard, color: AURA.textPrimary, border: `1px solid ${AURA.borderLight}` }}>
          + rep
        </button>
      </div>

      <button onClick={onLog} style={logBtnStyle()}>
        Complete set {currentSet}
      </button>
    </div>
  );
};

const ValueTile = ({ label, value, unit, onDec, onInc, highlight }) => (
  <div style={{
    flex: 1, padding: 14, borderRadius: 14,
    background: highlight ? AURA.primaryFaint : AURA.bgCardSolid,
    border: `1px solid ${highlight ? AURA.borderSubtle : 'transparent'}`,
  }}>
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: AURA.textMuted, textTransform: 'uppercase' }}>{label}</div>
    <div style={{
      fontSize: 40, fontWeight: 800, lineHeight: 1,
      color: highlight ? AURA.primary : AURA.textPrimary,
      letterSpacing: -1.5, margin: '6px 0', fontVariantNumeric: 'tabular-nums',
    }}>{value}</div>
    <div style={{ fontSize: 11, color: AURA.textSecondary, marginBottom: 10 }}>{unit}</div>
    <div style={{ display: 'flex', gap: 6 }}>
      <button onClick={onDec} style={smallStepBtn()}>−</button>
      <button onClick={onInc} style={smallStepBtn()}>+</button>
    </div>
  </div>
);

// ─── Rest timer — 3 variants ─────────────────────────────────
const RestTimer = ({ secondsLeft, totalSeconds, onSkip, onExtend, nextSet, totalSets, exercise, variant }) => {
  if (variant === 'fullscreen') return <RestFullscreen {...{ secondsLeft, totalSeconds, onSkip, onExtend, nextSet, totalSets, exercise }} />;
  if (variant === 'inline') return <RestInline {...{ secondsLeft, totalSeconds, onSkip, onExtend, nextSet, totalSets, exercise }} />;
  return <RestBottomSheet {...{ secondsLeft, totalSeconds, onSkip, onExtend, nextSet, totalSets, exercise }} />;
};

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

const RestBottomSheet = ({ secondsLeft, totalSeconds, onSkip, onExtend, nextSet, totalSets, exercise }) => {
  const pct = (secondsLeft / totalSeconds) * 100;
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 0,
      background: AURA.bgMid,
      borderTop: `1px solid ${AURA.borderSubtle}`,
      borderRadius: '24px 24px 0 0',
      padding: '16px 20px 36px',
      animation: 'slideUp 0.35s ease',
      boxShadow: '0 -20px 60px rgba(0,0,0,0.5)',
    }}>
      <div style={{ width: 36, height: 4, borderRadius: 2, background: AURA.borderLight, margin: '0 auto 14px' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `conic-gradient(${AURA.primary} ${pct}%, ${AURA.borderLight} ${pct}%)`,
        }}>
          <div style={{
            position: 'absolute', inset: 4, borderRadius: '50%',
            background: AURA.bgMid,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
            letterSpacing: -0.5, color: AURA.primary,
          }}>{fmt(secondsLeft)}</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: AURA.textMuted, textTransform: 'uppercase' }}>Resting</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: AURA.textPrimary, marginTop: 2 }}>
            Up: Set {nextSet} of {totalSets}
          </div>
          <div style={{ fontSize: 12, color: AURA.textSecondary, marginTop: 2 }}>
            {exercise.name}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={onExtend} style={restBtn()}>+15s</button>
        <button onClick={onSkip} style={{ ...restBtn(), background: AURA.primary, color: AURA.bgDark, flex: 2 }}>
          Skip rest · Begin set
        </button>
      </div>
    </div>
  );
};

const RestFullscreen = ({ secondsLeft, totalSeconds, onSkip, onExtend, nextSet, totalSets, exercise }) => {
  const pct = (secondsLeft / totalSeconds) * 100;
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 10,
      background: `radial-gradient(ellipse at center, ${AURA.bgMid} 0%, ${AURA.bgDark} 80%)`,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '40px 24px 36px', animation: 'fadeIn 0.3s',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, color: AURA.textMuted, textTransform: 'uppercase', marginBottom: 12 }}>
        Rest
      </div>
      <div style={{ position: 'relative', width: 260, height: 260, marginBottom: 20 }}>
        <svg width={260} height={260} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={130} cy={130} r={120} stroke={AURA.borderLight} strokeWidth={3} fill="none" />
          <circle cx={130} cy={130} r={120} stroke={AURA.primary} strokeWidth={3} fill="none"
            strokeDasharray={2 * Math.PI * 120}
            strokeDashoffset={(2 * Math.PI * 120) * (1 - pct / 100)}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1s linear' }}
          />
        </svg>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            fontSize: 84, fontWeight: 300, color: AURA.primary,
            letterSpacing: -3, fontVariantNumeric: 'tabular-nums',
            fontFamily: 'Fraunces, Georgia, serif', lineHeight: 1,
          }}>{fmt(secondsLeft)}</div>
          <div style={{ fontSize: 12, color: AURA.textMuted, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginTop: 6 }}>
            Until next set
          </div>
        </div>
      </div>
      <div style={{ textAlign: 'center', marginBottom: 24, maxWidth: 300 }}>
        <div style={{ fontSize: 13, color: AURA.textSecondary, marginBottom: 4 }}>Up next</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: AURA.textPrimary, letterSpacing: -0.5 }}>
          Set {nextSet} · {exercise.targetWeight}{exercise.unit}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 360 }}>
        <button onClick={onExtend} style={restBtn()}>+15s</button>
        <button onClick={onSkip} style={{ ...restBtn(), background: AURA.primary, color: AURA.bgDark, flex: 2 }}>
          Begin set
        </button>
      </div>
    </div>
  );
};

const RestInline = ({ secondsLeft, totalSeconds, onSkip, onExtend, nextSet, exercise }) => {
  const pct = (secondsLeft / totalSeconds) * 100;
  return (
    <div style={{
      position: 'absolute', left: 12, right: 12, bottom: 22,
      background: AURA.bgCardSolid,
      border: `1px solid ${AURA.borderSubtle}`,
      borderRadius: 16, overflow: 'hidden',
      boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
      animation: 'slideUp 0.3s',
    }}>
      <div style={{ height: 2, background: AURA.borderLight }}>
        <div style={{ width: `${pct}%`, height: '100%', background: AURA.primary, transition: 'width 1s linear' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12 }}>
        <Icon name="timer" size={18} color={AURA.primary} />
        <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>
          Rest · <span style={{ color: AURA.primary, fontVariantNumeric: 'tabular-nums' }}>{fmt(secondsLeft)}</span>
        </div>
        <button onClick={onExtend} style={{ ...restBtn(), padding: '6px 10px', fontSize: 12, flex: 'none' }}>+15s</button>
        <button onClick={onSkip} style={{ ...restBtn(), padding: '6px 12px', fontSize: 12, background: AURA.primary, color: AURA.bgDark, flex: 'none' }}>
          Begin
        </button>
      </div>
    </div>
  );
};

// ─── Button styles ───────────────────────────────────────────
function stepperBtnStyle() {
  return {
    width: 44, height: 44, borderRadius: 22,
    background: AURA.bgCardSolid, border: `1px solid ${AURA.borderLight}`,
    color: AURA.primary, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
}
function smallStepBtn() {
  return {
    width: 40, height: 40, borderRadius: 10,
    background: AURA.bgDark, border: `1px solid ${AURA.borderLight}`,
    color: AURA.primary, cursor: 'pointer', fontSize: 22, fontWeight: 700,
    fontFamily: 'inherit',
  };
}
function editorialStepBtn() {
  return {
    width: 32, height: 32, borderRadius: 16,
    background: 'transparent', border: `1px solid ${AURA.borderLight}`,
    color: AURA.primary, cursor: 'pointer',
    fontSize: 20, fontFamily: 'Fraunces, Georgia, serif',
  };
}
function logBtnStyle() {
  return {
    width: '100%', marginTop: 18, padding: 16,
    background: AURA.primary, color: AURA.bgDark,
    border: 'none', borderRadius: 14,
    fontSize: 16, fontWeight: 700, cursor: 'pointer',
    fontFamily: 'inherit', letterSpacing: -0.2,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  };
}
function restBtn() {
  return {
    flex: 1, padding: '12px',
    background: AURA.bgCardSolid, color: AURA.textPrimary,
    border: `1px solid ${AURA.borderLight}`, borderRadius: 12,
    fontSize: 14, fontWeight: 700, cursor: 'pointer',
    fontFamily: 'inherit',
  };
}

Object.assign(window, { WorkoutScreen, ExerciseCard, RestTimer });
