'use client';

import { useState, useEffect, useMemo } from 'react';
import { getSimilarity, applyHardPartition, pca2D } from '@/lib/math';
import {
  detectFailures, FAILURE_COLORS, FAILURE_LABELS, FAILURE_DESCRIPTIONS,
  type FailureType,
} from '@/lib/failures';

const DEPT_COLORS: Record<string, string> = {
  Engineering: '#3b82f6',
  Finance:     '#10b981',
  HR:          '#f59e0b',
  Legal:       '#8b5cf6',
  Marketing:   '#ec4899',
  Operations:  '#f97316',
  Sales:       '#06b6d4',
};

const RING_COLORS: Record<number, string> = {
  1: '#64748b',
  2: '#38bdf8',
  3: '#a78bfa',
  4: '#fbbf24',
};

interface JobTitle {
  rawTitle: string;
  department: string;
  seniority: number;
  vector: number[];
}

// ─── Themes ──────────────────────────────────────────────────────────────────

const DARK = {
  bg:          '#030C1A',
  surface:     '#020A16',
  border:      '#0C1E38',
  borderInner: '#09182C',
  borderRow:   '#0E2444',
  accent:      '#1ED8C0',
  accentDim:   'rgba(30,216,192,0.1)',
  accentGlow:  '#0A6A80',
  text:        '#9ACFDF',
  textBrand:   '#B8D4E8',
  textActive:  '#8AB8CC',
  textMid:     '#6A94B0',
  textSub:     '#4A6D8A',
  textLabel:   '#3D6880',
  textDim:     '#1E3A52',
  textDimmer:  '#142840',
  stripe:      'linear-gradient(to right, #1ED8C0 0%, #0A6A80 55%, transparent 100%)',
  cellText:    (t: number): string => t > 0.6 ? '#030C1A' : '#8ABFCC',
};

const WARM = {
  bg:          '#F2E8D9',
  surface:     '#EAD9C4',
  border:      '#DCCCB0',
  borderInner: '#D0BFA0',
  borderRow:   '#CDB898',
  accent:      '#C14830',
  accentDim:   'rgba(193,72,48,0.10)',
  accentGlow:  '#8C3020',
  text:        '#4A2010',
  textBrand:   '#5A3020',
  textActive:  '#D06040',
  textMid:     '#7A5038',
  textSub:     '#9A7050',
  textLabel:   '#A07850',
  textDim:     '#C4A880',
  textDimmer:  '#D4BC98',
  stripe:      'linear-gradient(to right, #C14830 0%, #8C3020 55%, transparent 100%)',
  cellText:    (t: number): string => t > 0.5 ? '#F2E8D9' : '#3A1A0A',
};

type Theme = typeof DARK;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function cellColor(t: number, warm: boolean): string {
  if (warm) {
    if (t <= 0) return WARM.surface;
    const h = Math.round(lerp(35, 8, t));
    const s = Math.round(lerp(35, 72, t));
    const l = Math.round(lerp(88, 28, t));
    return `hsl(${h}, ${s}%, ${l}%)`;
  }
  if (t <= 0) return '#030C1A';
  const h = Math.round(lerp(215, 168, t));
  const s = Math.round(lerp(65, 90, t));
  const l = Math.round(lerp(8, 56, t));
  return `hsl(${h}, ${s}%, ${l}%)`;
}

const FAILURE_ORDER: FailureType[] = ['acronym', 'drift', 'crossdept', 'conflation', 'format'];

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatBadge({ label, value, C }: { label: string; value: string; C: Theme }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '6px 18px', borderLeft: `1px solid ${C.border}`,
    }}>
      <span style={{
        fontSize: 19, fontWeight: 700, color: C.accent,
        fontFamily: 'var(--font-mono)', lineHeight: 1.1, letterSpacing: '-0.02em',
      }}>
        {value}
      </span>
      <span style={{
        fontSize: 9, color: C.textLabel, textTransform: 'uppercase',
        letterSpacing: '0.1em', fontWeight: 700, marginTop: 2,
      }}>
        {label}
      </span>
    </div>
  );
}

function Toggle({
  checked, onChange, label, sub, C,
}: {
  checked: boolean; onChange: (v: boolean) => void; label: string; sub: string; C: Theme;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          position: 'relative', width: 34, height: 18, borderRadius: 9999,
          flexShrink: 0, outline: 'none', cursor: 'pointer', transition: 'all 0.18s',
          border: `1px solid ${checked ? C.accent : C.textSub}`,
          background: checked ? C.accentDim : 'transparent',
        }}
      >
        <span style={{
          position: 'absolute', top: '50%', transform: 'translateY(-50%)',
          left: checked ? 16 : 2, width: 12, height: 12, borderRadius: '50%',
          background: checked ? C.accent : C.textSub,
          transition: 'left 0.18s, background 0.18s',
        }} />
      </button>
      <div>
        <div style={{ fontSize: 12, color: checked ? C.textActive : C.textSub, fontWeight: 500, lineHeight: 1.3 }}>
          {label}
        </div>
        <div style={{ fontSize: 10, color: C.textLabel, lineHeight: 1.2 }}>{sub}</div>
      </div>
    </label>
  );
}

function FailureCard({
  type, examples, onHighlight, C,
}: {
  type: FailureType;
  examples: Array<{ label: string; ri: number; ci: number; score: number }>;
  onHighlight: (pos: [number, number]) => void;
  C: Theme;
}) {
  const color = FAILURE_COLORS[type];
  const shortLabel = FAILURE_LABELS[type].split(' — ')[0];
  return (
    <div style={{
      borderLeft: `2px solid ${color}`,
      paddingLeft: 12, paddingBlock: 10, paddingRight: 10,
      borderRadius: '0 4px 4px 0',
      background: `${color}09`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
        <span style={{
          width: 5, height: 5, borderRadius: '50%',
          background: color, boxShadow: `0 0 5px ${color}`,
          display: 'inline-block', flexShrink: 0,
        }} />
        <span style={{
          fontSize: 10, fontWeight: 700, color,
          letterSpacing: '0.08em', textTransform: 'uppercase',
        }}>
          {shortLabel}
        </span>
      </div>
      <p style={{ fontSize: 10, color: C.textSub, margin: '0 0 8px', lineHeight: 1.6 }}>
        {FAILURE_DESCRIPTIONS[type]}
      </p>
      {examples.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {examples.map((ex, idx) => (
            <button
              key={idx}
              onClick={() => onHighlight([ex.ri, ex.ci])}
              style={{
                fontSize: 9.5, padding: '3px 8px', borderRadius: 3,
                border: `1px solid ${color}30`, background: `${color}0D`,
                color, cursor: 'pointer', fontFamily: 'var(--font-mono)',
                transition: 'background 0.12s',
              }}
            >
              {ex.label}
              {ex.score > 0 && (
                <span style={{ opacity: 0.5, marginLeft: 4 }}>{ex.score.toFixed(2)}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FailureDot({ type }: { type: FailureType }) {
  return (
    <span
      title={FAILURE_LABELS[type]}
      style={{
        display: 'inline-block', width: 5, height: 5, borderRadius: '50%',
        background: FAILURE_COLORS[type], flexShrink: 0,
        boxShadow: `0 0 4px ${FAILURE_COLORS[type]}`,
      }}
    />
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function Home() {
  const [library, setLibrary] = useState<JobTitle[]>([]);
  const [seniorityPartition, setSeniorityPartition] = useState(false);
  const [deptPartition, setDeptPartition] = useState(false);
  const [hovered, setHovered] = useState<[number, number] | null>(null);
  const [highlighted, setHighlighted] = useState<[number, number] | null>(null);
  const [scatterHovered, setScatterHovered] = useState<number | null>(null);
  const [gravityHovered, setGravityHovered] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'failures' | 'gravity' | 'map'>('failures');
  const [warm, setWarm] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const C = warm ? WARM : DARK;

  const SL: React.CSSProperties = {
    fontSize: 9, color: C.textLabel, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10,
  };

  useEffect(() => {
    document.body.style.background = C.bg;
    document.body.style.color = C.text;
  }, [C.bg, C.text]);

  const uniqueLibrary = useMemo(() => {
    const map = new Map<string, JobTitle>();
    for (const title of library) {
      const current = map.get(title.rawTitle);
      if (!current || title.vector.length > current.vector.length) {
        map.set(title.rawTitle, title);
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => b.seniority - a.seniority || a.department.localeCompare(b.department),
    );
  }, [library]);

  useEffect(() => {
    fetch('/api/persona')
      .then(r => r.json())
      .then(setLibrary);
  }, []);

  const scores = useMemo(
    () =>
      uniqueLibrary.map(row =>
        uniqueLibrary.map(col => {
          if (!row.vector.length || !col.vector.length) return 0;
          const raw = getSimilarity(row.vector, col.vector);
          return applyHardPartition(
            raw,
            row.seniority, col.seniority, seniorityPartition,
            row.department, col.department, deptPartition,
          );
        }),
      ),
    [uniqueLibrary, seniorityPartition, deptPartition],
  );

  const { titleFlags, cellFlags } = useMemo(
    () => detectFailures(uniqueLibrary, scores),
    [uniqueLibrary, scores],
  );

  const scatterData = useMemo(() => {
    if (uniqueLibrary.length < 2) return null;
    const raw = pca2D(uniqueLibrary.map(t => t.vector));
    const PAD = 44, W = 580, H = 360;
    const xs = raw.map(p => p[0]), ys = raw.map(p => p[1]);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    const xSpan = xMax - xMin || 1e-9, ySpan = yMax - yMin || 1e-9;
    const sx = (v: number) => PAD + (v - xMin) / xSpan * (W - 2 * PAD);
    const sy = (v: number) => H - PAD - (v - yMin) / ySpan * (H - 2 * PAD);
    return { W, H, pts: raw.map(([x, y]) => [sx(x), sy(y)] as [number, number]) };
  }, [uniqueLibrary]);

  const gravityData = useMemo(() => {
    if (uniqueLibrary.length < 2) return null;
    const W = 900, H = 840, CX = 450, CY = 420;
    const RADII: Record<number, number> = { 1: 70, 2: 165, 3: 260, 4: 350 };
    const LEVEL_LABELS: Record<number, string> = {
      1: 'IC', 2: 'Senior / Mgr', 3: 'Director', 4: 'VP / C-Suite',
    };
    const THRESHOLD = 0.70;

    const byLevel = new Map<number, number[]>();
    for (let i = 0; i < uniqueLibrary.length; i++) {
      const s = uniqueLibrary[i].seniority;
      if (!byLevel.has(s)) byLevel.set(s, []);
      byLevel.get(s)!.push(i);
    }
    for (const indices of byLevel.values()) {
      indices.sort((a, b) =>
        uniqueLibrary[a].department.localeCompare(uniqueLibrary[b].department),
      );
    }

    const positions = new Array(uniqueLibrary.length).fill(null) as ([number, number] | null)[];
    for (const [level, indices] of byLevel) {
      const r = RADII[level];
      if (r == null) continue;
      const n = indices.length;
      for (let k = 0; k < n; k++) {
        const angle = -Math.PI / 2 + (k / n) * 2 * Math.PI;
        positions[indices[k]] = [CX + r * Math.cos(angle), CY + r * Math.sin(angle)];
      }
    }

    const edges: { ri: number; ci: number; score: number; type?: FailureType }[] = [];
    for (let ri = 0; ri < uniqueLibrary.length; ri++) {
      for (let ci = ri + 1; ci < uniqueLibrary.length; ci++) {
        const s = scores[ri][ci];
        if (s >= THRESHOLD) {
          edges.push({ ri, ci, score: s, type: cellFlags.get(`${ri},${ci}`) });
        }
      }
    }
    edges.sort((a, b) => a.score - b.score);

    return { W, H, CX, CY, RADII, LEVEL_LABELS, THRESHOLD, positions, edges };
  }, [uniqueLibrary, scores, cellFlags]);

  const insightExamples = useMemo(() => {
    type Example = { label: string; ri: number; ci: number; score: number };
    const buckets: Record<FailureType, Example[]> = {
      crossdept: [], conflation: [], format: [], acronym: [], drift: [],
    };

    for (const [key, type] of cellFlags) {
      const [ri, ci] = key.split(',').map(Number);
      if (ri >= ci) continue;
      buckets[type].push({
        label: `${uniqueLibrary[ri].rawTitle} × ${uniqueLibrary[ci].rawTitle}`,
        ri, ci, score: scores[ri][ci],
      });
    }

    for (const [i, types] of titleFlags) {
      for (const type of ['acronym', 'drift'] as const) {
        if (!types.includes(type)) continue;
        const seniority = uniqueLibrary[i].seniority;
        let bestPeerIdx = -1, bestScore = -1;
        for (let j = 0; j < uniqueLibrary.length; j++) {
          if (j !== i && uniqueLibrary[j].seniority === seniority && scores[i][j] > bestScore) {
            bestScore = scores[i][j];
            bestPeerIdx = j;
          }
        }
        if (bestPeerIdx >= 0) {
          buckets[type].push({ label: uniqueLibrary[i].rawTitle, ri: i, ci: bestPeerIdx, score: bestScore });
        }
      }
    }

    return {
      crossdept: buckets.crossdept.sort((a, b) => b.score - a.score).slice(0, 2),
      conflation: buckets.conflation.sort((a, b) => b.score - a.score).slice(0, 2),
      format:    buckets.format.sort((a, b) => a.score - b.score).slice(0, 2),
      acronym:   buckets.acronym.slice(0, 2),
      drift:     buckets.drift.slice(0, 2),
    } as Record<FailureType, Example[]>;
  }, [titleFlags, cellFlags, uniqueLibrary, scores]);

  useEffect(() => {
    if (!highlighted) return;
    const el = document.querySelector('[data-highlighted="true"]') as HTMLElement | null;
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [highlighted]);

  const { minScore, maxScore } = useMemo(() => {
    let min = Infinity, max = -Infinity;
    for (const row of scores)
      for (const s of row)
        if (s > 0) {
          if (s < min) min = s;
          if (s > max) max = s;
        }
    return { minScore: min === Infinity ? 0 : min, maxScore: max === -Infinity ? 1 : max };
  }, [scores]);

  const normalize = (s: number) =>
    maxScore === minScore ? 1 : (s - minScore) / (maxScore - minScore);

  const titles = uniqueLibrary.map(p => p.rawTitle);

  const totalAnomalies = useMemo(() => {
    let count = 0;
    for (const [key] of cellFlags) {
      const [ri, ci] = key.split(',').map(Number);
      if (ri < ci) count++;
    }
    return count + titleFlags.size;
  }, [cellFlags, titleFlags]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100vh', background: C.bg, overflow: 'hidden',
      fontFamily: 'var(--font-syne), system-ui, sans-serif',
      transition: 'background 0.25s, color 0.25s',
    }}>

      {/* Top accent stripe */}
      <div style={{
        height: 2, flexShrink: 0,
        background: C.stripe,
        transition: 'background 0.25s',
      }} />

      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '13px 24px', borderBottom: `1px solid ${C.border}`, flexShrink: 0,
        gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Logo mark */}
          <svg width={24} height={28} viewBox="0 0 24 28" fill="none">
            <polygon points="12,2 22,7.5 22,20.5 12,26 2,20.5 2,7.5"
              stroke={C.accent} strokeWidth={1.5} fill={C.accentDim} />
            <polygon points="12,8 17,11 17,17 12,20 7,17 7,11"
              stroke={C.accent} strokeWidth={0.75} fill={C.accentDim} strokeOpacity={0.5} />
            <circle cx={12} cy={14} r={2} fill={C.accent} fillOpacity={0.9} />
          </svg>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline' }}>
              <span style={{
                fontSize: 15, fontWeight: 800, letterSpacing: '0.14em',
                textTransform: 'uppercase', color: C.textBrand,
              }}>Embedding&nbsp;</span>
              <span style={{
                fontSize: 15, fontWeight: 800, letterSpacing: '0.14em',
                textTransform: 'uppercase', color: C.accent,
              }}>Failure&nbsp;</span>
              <span style={{
                fontSize: 15, fontWeight: 800, letterSpacing: '0.14em',
                textTransform: 'uppercase', color: C.textBrand,
              }}>Lab</span>
            </div>
            <div style={{ fontSize: 10, color: C.textLabel, letterSpacing: '0.05em', marginTop: 2 }}>
              text-embedding-3-small · cosine similarity · semantic failure diagnostics
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Theme toggle */}
          <Toggle
            checked={warm}
            onChange={setWarm}
            label="Warm"
            sub="Document palette"
            C={C}
          />

          <div style={{ display: 'flex', alignItems: 'stretch', borderLeft: `1px solid ${C.border}` }}>
            <StatBadge label="titles"      value={uniqueLibrary.length > 0 ? String(uniqueLibrary.length) : '—'} C={C} />
            <StatBadge label="dimensions"  value="1536" C={C} />
            <StatBadge label="anomalies"   value={uniqueLibrary.length > 0 ? String(totalAnomalies) : '—'} C={C} />
          </div>
        </div>
      </header>

      {/* Tab nav */}
      <div style={{
        display: 'flex', borderBottom: `1px solid ${C.border}`,
        flexShrink: 0, background: C.surface, paddingLeft: 24,
      }}>
        {(['failures', 'gravity', 'map'] as const).map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '11px 20px', background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: activeTab === tab ? `2px solid ${C.accent}` : '2px solid transparent',
              color: activeTab === tab ? C.textActive : C.textLabel,
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.12em', transition: 'color 0.15s',
              fontFamily: 'var(--font-syne)',
            }}
          >
            {['Failure Analysis', 'Seniority Gravity', 'Embedding Map'][i]}
          </button>
        ))}
      </div>

      {/* Content area */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>

        {/* ── FAILURE ANALYSIS ─────────────────────────────────────────── */}
        {activeTab === 'failures' && (
          <>
            {/* Sidebar */}
            <div style={{
              width: sidebarOpen ? 310 : 28, flexShrink: 0,
              borderRight: `1px solid ${C.border}`,
              overflowY: sidebarOpen ? 'auto' : 'hidden',
              overflowX: 'hidden',
              background: C.bg,
              transition: 'width 0.22s ease',
              position: 'relative',
            }}>
              {/* Collapse toggle */}
              <button
                onClick={() => setSidebarOpen(o => !o)}
                title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
                style={{
                  position: 'absolute', top: 14, right: 6,
                  width: 18, height: 18, borderRadius: 3,
                  border: `1px solid ${C.border}`,
                  background: C.surface, color: C.textLabel,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, lineHeight: 1, zIndex: 10, flexShrink: 0,
                  transition: 'color 0.15s, border-color 0.15s',
                }}
              >
                {sidebarOpen ? '‹' : '›'}
              </button>
              <div style={{
                opacity: sidebarOpen ? 1 : 0,
                transition: 'opacity 0.15s ease',
                pointerEvents: sidebarOpen ? 'auto' : 'none',
                padding: '18px 16px',
                display: 'flex', flexDirection: 'column', gap: 22,
                minWidth: 278,
              }}>
              <section>
                <div style={SL}>Partition Controls</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <Toggle
                    checked={seniorityPartition}
                    onChange={setSeniorityPartition}
                    label="Seniority partition"
                    sub="Zero cross-level similarities"
                    C={C}
                  />
                  <Toggle
                    checked={deptPartition}
                    onChange={setDeptPartition}
                    label="Department partition"
                    sub="Zero cross-dept similarities"
                    C={C}
                  />
                </div>
              </section>

              {uniqueLibrary.length > 0 && (
                <section>
                  <div style={SL}>Cosine Similarity Scale</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 9, color: C.textSub, fontFamily: 'var(--font-mono)' }}>
                      {minScore.toFixed(2)}
                    </span>
                    <div style={{
                      flex: 1, height: 5, borderRadius: 3,
                      background: `linear-gradient(to right, ${cellColor(0.04, warm)}, ${cellColor(0.5, warm)}, ${cellColor(1, warm)})`,
                      border: `1px solid ${C.border}`,
                    }} />
                    <span style={{ fontSize: 9, color: C.accent, fontFamily: 'var(--font-mono)' }}>
                      {maxScore.toFixed(2)}
                    </span>
                  </div>
                </section>
              )}

              {uniqueLibrary.length > 0 && (
                <section style={{ flex: 1 }}>
                  <div style={SL}>Detected Failure Modes</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {FAILURE_ORDER.map(type => (
                      <FailureCard
                        key={type}
                        type={type}
                        examples={insightExamples[type] ?? []}
                        onHighlight={setHighlighted}
                        C={C}
                      />
                    ))}
                  </div>
                </section>
              )}
              </div>
            </div>

            {/* Matrix */}
            {library.length > 0 ? (
              <div style={{ flex: 1, overflow: 'auto', background: C.surface }}>
                <table style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                  <thead>
                    <tr>
                      <th style={{
                        position: 'sticky', top: 0, left: 0, zIndex: 30,
                        background: C.surface,
                        borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.borderRow}`,
                        minWidth: 220, padding: '0 14px', textAlign: 'left',
                        fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.12em', color: C.textLabel,
                        fontFamily: 'var(--font-syne)', height: 40,
                      }}>
                        Role
                      </th>
                      {titles.map((title, i) => (
                        <th
                          key={i}
                          style={{
                            position: 'sticky', top: 0, zIndex: 20,
                            background: C.surface,
                            borderBottom: `1px solid ${C.border}`,
                            borderRight: `1px solid ${C.borderInner}`,
                            width: 36, minWidth: 36,
                            verticalAlign: 'bottom', padding: 0,
                          }}
                        >
                          {titleFlags.get(i)?.[0] && (
                            <span style={{
                              position: 'absolute', top: 4, right: 4,
                              width: 4, height: 4, borderRadius: '50%',
                              background: FAILURE_COLORS[titleFlags.get(i)![0]],
                              display: 'block', zIndex: 1,
                              boxShadow: `0 0 4px ${FAILURE_COLORS[titleFlags.get(i)![0]]}`,
                            }} />
                          )}
                          <div style={{
                            writingMode: 'vertical-rl',
                            transform: 'rotate(180deg)',
                            paddingTop: 4, paddingBottom: 12,
                            paddingLeft: 8, paddingRight: 8,
                            whiteSpace: 'nowrap',
                            fontSize: 9.5, fontWeight: 600, color: C.text,
                            letterSpacing: '0.02em',
                          }}>
                            {title}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {titles.map((rowTitle, ri) => (
                      <tr key={ri}>
                        <th style={{
                          position: 'sticky', left: 0, zIndex: 10,
                          background: C.surface,
                          borderBottom: `1px solid ${C.borderInner}`,
                          borderRight: `1px solid ${C.borderRow}`,
                          paddingLeft: 14, paddingRight: 10,
                          textAlign: 'left', height: 30,
                          fontSize: 11, fontWeight: 600, color: C.text,
                          whiteSpace: 'nowrap',
                        }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span style={{
                              width: 2.5, height: 13,
                              background: DEPT_COLORS[uniqueLibrary[ri]?.department] ?? C.textSub,
                              borderRadius: 1, display: 'inline-block', flexShrink: 0, opacity: 0.75,
                            }} />
                            <span>{rowTitle}</span>
                            {(titleFlags.get(ri) ?? []).map(type => (
                              <FailureDot key={type} type={type} />
                            ))}
                          </span>
                        </th>
                        {scores[ri]?.map((score, ci) => {
                          const t = score > 0 ? normalize(score) : 0;
                          const bg = score > 0 ? cellColor(t, warm) : C.surface;
                          const isHov = hovered?.[0] === ri && hovered?.[1] === ci;
                          const isHighlighted = highlighted?.[0] === ri && highlighted?.[1] === ci;
                          const cellFailure = cellFlags.get(`${ri},${ci}`);
                          return (
                            <td
                              key={ci}
                              data-highlighted={isHighlighted ? 'true' : undefined}
                              style={{
                                backgroundColor: bg,
                                width: 36, height: 30,
                                textAlign: 'center', verticalAlign: 'middle',
                                borderBottom: `1px solid ${C.borderInner}`,
                                borderRight: `1px solid ${C.borderInner}`,
                                cursor: 'default',
                                transition: 'filter 0.08s',
                                filter: isHov ? 'brightness(1.28)' : undefined,
                                outline: isHighlighted
                                  ? `2px solid ${C.text}`
                                  : cellFailure
                                  ? `2px solid ${FAILURE_COLORS[cellFailure]}`
                                  : undefined,
                                outlineOffset: '-2px',
                                position: isHighlighted ? 'relative' : undefined,
                                zIndex: isHighlighted ? 5 : undefined,
                              }}
                              onMouseEnter={() => setHovered([ri, ci])}
                              onMouseLeave={() => setHovered(null)}
                              title={`${rowTitle} × ${titles[ci]}: ${score.toFixed(3)}`}
                            >
                              {score > 0 && (
                                <span style={{
                                  fontSize: 7.5, fontWeight: 700,
                                  color: C.cellText(t),
                                  userSelect: 'none',
                                  fontFamily: 'var(--font-mono)',
                                }}>
                                  {score.toFixed(2)}
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: C.textLabel, fontSize: 12, fontFamily: 'var(--font-mono)',
                background: C.surface,
              }}>
                Loading embeddings…
              </div>
            )}
          </>
        )}

        {/* ── SENIORITY GRAVITY ─────────────────────────────────────────── */}
        {activeTab === 'gravity' && gravityData && (
          <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px', background: C.bg }}>
            <div style={{ maxWidth: 960, margin: '0 auto' }}>
              <div style={{ marginBottom: 20, maxWidth: 620 }}>
                <p style={{ margin: '0 0 8px', fontSize: 14, color: C.textMid, lineHeight: 1.7 }}>
                  Titles orbit their seniority ring. Edges connect pairs with cosine similarity ≥ {gravityData.THRESHOLD.toFixed(2)}.
                </p>
                <p style={{ margin: 0, fontSize: 12, color: C.textSub, lineHeight: 1.7 }}>
                  <span style={{ color: FAILURE_COLORS.crossdept }}>Coral edges</span> are cross-department false positives —
                  the model treats seniority tokens like <em>VP</em> as gravitational anchors, pulling unrelated departments
                  into the same orbit. <span style={{ color: FAILURE_COLORS.conflation }}>Purple edges</span> mark seniority
                  conflation between adjacent rings. Hover any dot to see its connections.
                </p>
              </div>

              <div style={{
                borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface,
                padding: '20px', display: 'flex', gap: 24, alignItems: 'flex-start',
              }}>
                <svg
                  viewBox={`0 0 ${gravityData.W} ${gravityData.H}`}
                  style={{ flex: 1, minWidth: 0, height: 'auto', maxWidth: '76%' }}
                >
                  {([1, 2, 3, 4] as const).map((level, idx) => {
                    const r = gravityData.RADII[level];
                    const labelY = gravityData.CY - 8 - idx * 13;
                    return (
                      <g key={level}>
                        <circle
                          cx={gravityData.CX} cy={gravityData.CY} r={r}
                          fill="none"
                          stroke={RING_COLORS[level]}
                          strokeWidth={level === 4 ? 1.5 : 1}
                          strokeDasharray={level === 1 ? undefined : '5 4'}
                          strokeOpacity={0.3}
                        />
                        <line
                          x1={gravityData.CX + r} y1={gravityData.CY}
                          x2={gravityData.CX + r + 6} y2={labelY}
                          stroke={RING_COLORS[level]} strokeWidth={0.75} strokeOpacity={0.35}
                        />
                        <text
                          x={gravityData.CX + r + 9} y={labelY + 3}
                          fontSize={10} fill={RING_COLORS[level]}
                          dominantBaseline="middle"
                          style={{ userSelect: 'none' }} opacity={0.5}
                        >
                          L{level}
                        </text>
                      </g>
                    );
                  })}

                  {gravityData.edges.map(({ ri, ci, score, type }) => {
                    const pa = gravityData.positions[ri];
                    const pb = gravityData.positions[ci];
                    if (!pa || !pb) return null;
                    const isAdj = gravityHovered === ri || gravityHovered === ci;
                    const isOther = gravityHovered !== null && !isAdj;
                    const t = (score - gravityData.THRESHOLD) / (1 - gravityData.THRESHOLD);
                    const opacity = isOther ? 0.02 : isAdj ? 0.85 : t * 0.38 + 0.13;
                    const sw = isAdj ? 2 : t * 2 + 0.5;
                    const color = type ? FAILURE_COLORS[type] : C.borderRow;
                    return (
                      <line
                        key={`${ri}-${ci}`}
                        x1={pa[0]} y1={pa[1]} x2={pb[0]} y2={pb[1]}
                        stroke={color} strokeWidth={sw} strokeOpacity={opacity}
                      />
                    );
                  })}

                  {uniqueLibrary.map((title, i) => {
                    const pos = gravityData.positions[i];
                    if (!pos) return null;
                    const [x, y] = pos;
                    const color = DEPT_COLORS[title.department] ?? C.textSub;
                    const isHov = gravityHovered === i;
                    const adjEdge = gravityHovered !== null
                      ? gravityData.edges.find(
                          e => (e.ri === i || e.ci === i) && (e.ri === gravityHovered || e.ci === gravityHovered),
                        )
                      : undefined;
                    const isAdj = !!adjEdge;
                    const dimmed = gravityHovered !== null && !isHov && !isAdj;

                    const dx = x - gravityData.CX, dy = y - gravityData.CY;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    const OFFSET = 15;
                    const lx = x + (dx / dist) * OFFSET;
                    const ly = y + (dy / dist) * OFFSET;
                    const anchor = dx >= 0 ? 'start' : 'end';

                    return (
                      <g
                        key={i}
                        style={{ cursor: 'default' }}
                        onMouseEnter={() => setGravityHovered(i)}
                        onMouseLeave={() => setGravityHovered(null)}
                      >
                        <circle cx={x} cy={y} r={14} fill="transparent" />
                        <circle
                          cx={x} cy={y} r={isHov ? 6 : 4.5}
                          fill={color}
                          fillOpacity={dimmed ? 0.1 : 0.82}
                          stroke={isHov ? C.text : isAdj ? color : 'none'}
                          strokeWidth={isHov ? 1.5 : 1}
                        />
                        {(isHov || isAdj) ? (
                          <text
                            x={lx} y={ly} fontSize={11} fill={C.textSub}
                            textAnchor={anchor} dominantBaseline="middle"
                            style={{ pointerEvents: 'none', userSelect: 'none' }}
                          >
                            {isHov ? (
                              <>
                                <tspan>{title.rawTitle}</tspan>
                                <tspan x={lx} dy={14} fontSize={9} fill={C.textLabel}>↓ similarity from here</tspan>
                              </>
                            ) : (
                              <>
                                <tspan>{title.rawTitle}</tspan>
                                <tspan fill={C.textLabel}>{adjEdge ? ` · ${adjEdge.score.toFixed(2)}` : ''}</tspan>
                              </>
                            )}
                          </text>
                        ) : (
                          <title>{title.rawTitle} · {title.department} · Level {title.seniority}</title>
                        )}
                      </g>
                    );
                  })}
                </svg>

                {/* Legend */}
                <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 20, paddingTop: 4, minWidth: 120 }}>
                  <div>
                    <div style={SL}>Department</div>
                    {Object.entries(DEPT_COLORS).map(([dept, color]) => (
                      <div key={dept} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block' }} />
                        <span style={{ fontSize: 10, color: C.textSub }}>{dept}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div style={SL}>Edge Type</div>
                    {(['crossdept', 'conflation'] as FailureType[]).map(type => (
                      <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                        <svg width={18} height={6} style={{ flexShrink: 0 }}>
                          <line x1={0} y1={3} x2={18} y2={3} stroke={FAILURE_COLORS[type]} strokeWidth={1.5} />
                        </svg>
                        <span style={{ fontSize: 10, color: C.textSub }}>
                          {type === 'crossdept' ? 'Cross-dept' : 'Conflation'}
                        </span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <svg width={18} height={6} style={{ flexShrink: 0 }}>
                        <line x1={0} y1={3} x2={18} y2={3} stroke={C.borderRow} strokeWidth={1} />
                      </svg>
                      <span style={{ fontSize: 10, color: C.textSub }}>Normal</span>
                    </div>
                  </div>
                  <div>
                    <div style={SL}>Seniority Ring</div>
                    {([4, 3, 2, 1] as const).map(level => (
                      <div key={level} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                        <svg width={16} height={10} style={{ flexShrink: 0 }}>
                          <circle cx={8} cy={5} r={4} fill="none" stroke={RING_COLORS[level]}
                            strokeWidth={1} strokeDasharray={level === 1 ? undefined : '2 2'} />
                        </svg>
                        <span style={{ fontSize: 10, color: RING_COLORS[level], fontWeight: 600 }}>L{level}</span>
                        <span style={{ fontSize: 10, color: C.textLabel }}>{gravityData.LEVEL_LABELS[level]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── EMBEDDING MAP ─────────────────────────────────────────────── */}
        {activeTab === 'map' && scatterData && (
          <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px', background: C.bg }}>
            <div style={{ maxWidth: 840, margin: '0 auto' }}>
              <div style={{ marginBottom: 20, maxWidth: 620 }}>
                <p style={{ margin: '0 0 8px', fontSize: 14, color: C.textMid, lineHeight: 1.7 }}>
                  Each dot is a job title, positioned by what the model &ldquo;thinks&rdquo; it means.
                  Dots that land close together look similar to the model.
                </p>
                <p style={{ margin: 0, fontSize: 12, color: C.textSub, lineHeight: 1.7 }}>
                  Notice how VP titles from different departments cluster together — the model treats
                  seniority level as the dominant signal, overriding department function. Dot size reflects
                  seniority level. Hover any dot to see the title.
                </p>
              </div>

              <div style={{
                borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface,
                padding: '20px', display: 'flex', gap: 24, alignItems: 'flex-start',
              }}>
                <svg
                  viewBox={`0 0 ${scatterData.W} ${scatterData.H}`}
                  style={{ flex: 1, minWidth: 0, height: 'auto' }}
                >
                  {highlighted && scatterData.pts[highlighted[0]] && scatterData.pts[highlighted[1]] && (
                    <line
                      x1={scatterData.pts[highlighted[0]][0]} y1={scatterData.pts[highlighted[0]][1]}
                      x2={scatterData.pts[highlighted[1]][0]} y2={scatterData.pts[highlighted[1]][1]}
                      stroke={C.textSub} strokeWidth={1} strokeOpacity={0.5} strokeDasharray="4 3"
                    />
                  )}
                  {uniqueLibrary.map((title, i) => {
                    const [cx, cy] = scatterData.pts[i];
                    const r = title.seniority * 2.5 + 2.5;
                    const color = DEPT_COLORS[title.department] ?? C.textSub;
                    const isHighlighted = highlighted !== null && (highlighted[0] === i || highlighted[1] === i);
                    const isHov = scatterHovered === i;
                    return (
                      <circle
                        key={i}
                        cx={cx} cy={cy} r={r}
                        fill={color}
                        fillOpacity={isHov || isHighlighted ? 0.9 : 0.55}
                        stroke={isHighlighted ? C.text : isHov ? color : 'none'}
                        strokeWidth={isHighlighted ? 1.5 : 1}
                        style={{ cursor: 'default' }}
                        onMouseEnter={() => setScatterHovered(i)}
                        onMouseLeave={() => setScatterHovered(null)}
                      >
                        <title>{title.rawTitle} · {title.department} · Level {title.seniority}</title>
                      </circle>
                    );
                  })}
                </svg>

                <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 20, paddingTop: 4, minWidth: 110 }}>
                  <div>
                    <div style={SL}>Department</div>
                    {Object.entries(DEPT_COLORS).map(([dept, color]) => (
                      <div key={dept} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block' }} />
                        <span style={{ fontSize: 10, color: C.textSub }}>{dept}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div style={SL}>Seniority</div>
                    {[1, 2, 3, 4].map(s => (
                      <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                        <svg width={20} height={20} style={{ flexShrink: 0 }}>
                          <circle cx={10} cy={10} r={s * 2.5 + 2.5} fill={C.textSub} fillOpacity={0.55} />
                        </svg>
                        <span style={{ fontSize: 10, color: C.textSub }}>Level {s}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
