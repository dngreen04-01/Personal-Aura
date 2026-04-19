// aura-progress.jsx — Progress dashboard

const ProgressScreen = ({ onBack, onShare }) => {
  const [tab, setTab] = React.useState('overview');

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      background: AURA.bgDark, color: AURA.textPrimary,
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      {/* Header */}
      <div style={{
        padding: '56px 16px 12px', display: 'flex',
        alignItems: 'center', justifyContent: 'space-between',
      }}>
        <button onClick={onBack} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: AURA.textSecondary, padding: 8, margin: -8,
        }}>
          <Icon name="chevronLeft" size={22} color={AURA.textSecondary} />
        </button>
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.3 }}>Progress</div>
        <button onClick={onShare} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: AURA.textSecondary, padding: 8,
        }}>
          <Icon name="share" size={20} color={AURA.textSecondary} />
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, padding: '0 16px 12px' }}>
        {['overview', 'prs', 'muscles'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '8px 12px', borderRadius: 10,
            background: tab === t ? AURA.primaryFaint : 'transparent',
            border: `1px solid ${tab === t ? AURA.borderSubtle : AURA.borderLight}`,
            color: tab === t ? AURA.primary : AURA.textSecondary,
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
            textTransform: 'uppercase', letterSpacing: 1,
            fontFamily: 'inherit',
          }}>{t}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 40px' }}>
        {tab === 'overview' && <OverviewTab />}
        {tab === 'prs' && <PRsTab />}
        {tab === 'muscles' && <MusclesTab />}
      </div>
    </div>
  );
};

const OverviewTab = () => {
  const latestBench = BENCH_HISTORY[BENCH_HISTORY.length - 1];
  const prevBench = BENCH_HISTORY[BENCH_HISTORY.length - 2];
  const benchDelta = latestBench.weight - prevBench.weight;
  const latestVol = VOLUME_TREND[VOLUME_TREND.length - 1].volume;
  const prevVol = VOLUME_TREND[VOLUME_TREND.length - 2].volume;
  const volDelta = ((latestVol - prevVol) / prevVol * 100).toFixed(1);

  return (
    <>
      {/* Hero stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <HeroStat label="Streak" value={USER.streak} unit="days" icon="flame" accent />
        <HeroStat label="This week" value={`${USER.weekProgress.completed}/${USER.weekProgress.total}`} unit="sessions" icon="activity" />
        <HeroStat label="Volume W/W" value={`+${volDelta}%`} unit={`${(latestVol / 1000).toFixed(1)}k kg`} icon="trending" accent />
        <HeroStat label="Total sessions" value={USER.sessionCount} unit="logged" icon="trophy" />
      </div>

      {/* Aura insight */}
      <div style={{
        padding: 14, marginBottom: 16,
        background: AURA.primaryGhost,
        border: `1px solid ${AURA.borderSubtle}`,
        borderRadius: 14,
        display: 'flex', gap: 10,
      }}>
        <AuraOrb size={24} />
        <div style={{ flex: 1, fontSize: 13, lineHeight: 1.5 }}>
          {renderMd(`Your bench has climbed **22.5 kg in 12 weeks** — that's progression speed usually reserved for first-timers. Volume is trending up too. Keep the 4–6 rep range on the top set.`)}
        </div>
      </div>

      {/* Bench chart */}
      <ChartCard
        title="Bench Press"
        subtitle={`Current: ${latestBench.weight} kg`}
        delta={`+${benchDelta} kg`}
        chart={<LineChart data={BENCH_HISTORY} valueKey="weight" labelKey="date" />}
      />

      {/* Volume chart */}
      <ChartCard
        title="Weekly volume"
        subtitle="Total kg moved, last 8 weeks"
        delta={`+${volDelta}%`}
        chart={<BarChart data={VOLUME_TREND} />}
      />

      {/* Consistency heatmap */}
      <div style={{
        padding: 16, marginTop: 12,
        background: AURA.bgCard,
        border: `1px solid ${AURA.borderLight}`,
        borderRadius: 14,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.3 }}>Consistency</div>
            <div style={{ fontSize: 12, color: AURA.textSecondary, marginTop: 1 }}>Last 12 weeks</div>
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: AURA.primary, letterSpacing: 1, textTransform: 'uppercase' }}>
            {CONSISTENCY.filter(v => v > 0).length} of 84
          </div>
        </div>
        <Heatmap data={CONSISTENCY} />
      </div>
    </>
  );
};

const PRsTab = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
    {PRS.map((pr, i) => (
      <div key={i} style={{
        padding: 16,
        background: pr.isNew ? AURA.primaryFaint : AURA.bgCard,
        border: `1px solid ${pr.isNew ? AURA.borderSubtle : AURA.borderLight}`,
        borderRadius: 14,
        position: 'relative',
      }}>
        {pr.isNew && (
          <div style={{
            position: 'absolute', top: 12, right: 12,
            fontSize: 9, fontWeight: 800, letterSpacing: 1.5,
            padding: '3px 7px', borderRadius: 4,
            background: AURA.primary, color: AURA.bgDark,
          }}>NEW</div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <Icon name="trophy" size={14} color={pr.isNew ? AURA.primary : AURA.textSecondary} />
          <div style={{ fontSize: 12, fontWeight: 600, color: AURA.textSecondary }}>{pr.exercise}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
          <div style={{
            fontSize: 34, fontWeight: 800, letterSpacing: -1,
            color: pr.isNew ? AURA.primary : AURA.textPrimary,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {pr.weight !== null ? pr.weight : pr.reps}
          </div>
          <div style={{ fontSize: 14, color: AURA.textSecondary, fontWeight: 600 }}>
            {pr.weight !== null ? `${pr.unit} × ${pr.reps}` : pr.unit}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <span style={{ color: AURA.textSecondary }}>{pr.date}</span>
          <span style={{ color: AURA.primary, fontWeight: 700 }}>
            +{pr.trend} {pr.unit === 'reps' ? 'reps' : 'kg'}
          </span>
        </div>
      </div>
    ))}
  </div>
);

const MusclesTab = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <div style={{ fontSize: 12, color: AURA.textSecondary, marginBottom: 4, padding: '0 4px' }}>
      Days since last trained · frequency over 4 weeks
    </div>
    {MUSCLE_RECENCY.map((m, i) => {
      const maxSessions = 8;
      const pct = (m.sessions4w / maxSessions) * 100;
      const freshness = m.days === 0 ? 'today' : m.days === 1 ? 'yesterday' : `${m.days}d ago`;
      const color = m.days === 0 ? AURA.primary
        : m.days <= 2 ? 'rgba(212,255,0,0.7)'
        : m.days <= 4 ? 'rgba(212,255,0,0.4)'
        : 'rgba(212,255,0,0.2)';
      return (
        <div key={i} style={{
          padding: '12px 14px',
          background: AURA.bgCard,
          border: `1px solid ${AURA.borderLight}`,
          borderRadius: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{m.group}</div>
            <div style={{ fontSize: 11, color: AURA.textSecondary, fontWeight: 600 }}>
              {freshness} · {m.sessions4w}×
            </div>
          </div>
          <div style={{ height: 6, background: AURA.borderLight, borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 0.4s' }} />
          </div>
        </div>
      );
    })}
  </div>
);

// ─── Stat and chart building blocks ──────────────────────────
const HeroStat = ({ label, value, unit, icon, accent }) => (
  <div style={{
    padding: 14,
    background: accent ? AURA.primaryGhost : AURA.bgCard,
    border: `1px solid ${accent ? AURA.borderSubtle : AURA.borderLight}`,
    borderRadius: 14,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
      <Icon name={icon} size={13} color={accent ? AURA.primary : AURA.textSecondary} />
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: AURA.textSecondary }}>
        {label}
      </div>
    </div>
    <div style={{
      fontSize: 28, fontWeight: 800, letterSpacing: -0.8,
      color: accent ? AURA.primary : AURA.textPrimary,
      fontVariantNumeric: 'tabular-nums', lineHeight: 1.1,
    }}>{value}</div>
    <div style={{ fontSize: 11, color: AURA.textSecondary, marginTop: 2 }}>{unit}</div>
  </div>
);

const ChartCard = ({ title, subtitle, delta, chart }) => (
  <div style={{
    padding: 16, marginTop: 12,
    background: AURA.bgCard,
    border: `1px solid ${AURA.borderLight}`,
    borderRadius: 14,
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.3 }}>{title}</div>
        <div style={{ fontSize: 12, color: AURA.textSecondary, marginTop: 1 }}>{subtitle}</div>
      </div>
      <div style={{
        padding: '4px 8px', borderRadius: 6,
        background: AURA.primaryFaint, color: AURA.primary,
        fontSize: 11, fontWeight: 800, letterSpacing: 0.3,
      }}>{delta}</div>
    </div>
    {chart}
  </div>
);

const LineChart = ({ data, valueKey, labelKey }) => {
  const W = 320, H = 140, pad = 20;
  const values = data.map(d => d[valueKey]);
  const min = Math.min(...values) * 0.95;
  const max = Math.max(...values) * 1.02;
  const xStep = (W - pad * 2) / (data.length - 1);
  const points = data.map((d, i) => ({
    x: pad + i * xStep,
    y: pad + (H - pad * 2) * (1 - (d[valueKey] - min) / (max - min)),
    d,
  }));
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = path + ` L${points[points.length - 1].x},${H - pad} L${pad},${H - pad} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 140, overflow: 'visible' }}>
      <defs>
        <linearGradient id="benchGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={AURA.primary} stopOpacity="0.35" />
          <stop offset="100%" stopColor={AURA.primary} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Grid */}
      {[0, 0.5, 1].map(t => (
        <line key={t} x1={pad} x2={W - pad}
          y1={pad + (H - pad * 2) * t} y2={pad + (H - pad * 2) * t}
          stroke={AURA.borderLight} strokeWidth="1" strokeDasharray="2,4" />
      ))}
      <path d={areaPath} fill="url(#benchGrad)" />
      <path d={path} fill="none" stroke={AURA.primary} strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={i === points.length - 1 ? 5 : 3}
          fill={AURA.bgDark} stroke={AURA.primary} strokeWidth={2} />
      ))}
      {/* labels */}
      <text x={pad} y={H - 4} fontSize="9" fill={AURA.textSecondary}>{data[0][labelKey]}</text>
      <text x={W - pad} y={H - 4} fontSize="9" fill={AURA.textSecondary} textAnchor="end">
        {data[data.length - 1][labelKey]}
      </text>
    </svg>
  );
};

const BarChart = ({ data }) => {
  const W = 320, H = 140, pad = 20;
  const values = data.map(d => d.volume);
  const max = Math.max(...values) * 1.05;
  const barW = (W - pad * 2) / data.length - 4;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 140 }}>
      {data.map((d, i) => {
        const bh = ((d.volume / max) * (H - pad * 2));
        const last = i === data.length - 1;
        return (
          <g key={i}>
            <rect x={pad + i * (barW + 4)} y={H - pad - bh} width={barW} height={bh}
              fill={last ? AURA.primary : 'rgba(212,255,0,0.35)'} rx={2} />
            <text x={pad + i * (barW + 4) + barW / 2} y={H - 4} fontSize="9"
              fill={last ? AURA.primary : AURA.textSecondary} textAnchor="middle" fontWeight={last ? 700 : 400}>
              {d.week}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

const Heatmap = ({ data }) => {
  // 12 columns (weeks) × 7 rows (days)
  const weeks = 12;
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {Array.from({ length: weeks }).map((_, w) => (
        <div key={w} style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
          {Array.from({ length: 7 }).map((_, d) => {
            const val = data[w * 7 + d] || 0;
            const opacity = val === 0 ? 0.08 : 0.2 + val * 0.2;
            return (
              <div key={d} style={{
                aspectRatio: '1', borderRadius: 3,
                background: val === 0 ? AURA.borderLight : `rgba(212,255,0,${opacity})`,
              }} />
            );
          })}
        </div>
      ))}
    </div>
  );
};

Object.assign(window, { ProgressScreen });
