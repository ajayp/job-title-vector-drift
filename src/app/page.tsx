'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  getSimilarity, applyHardPartition, detectFailures,
  FAILURE_COLORS, FAILURE_LABELS, FAILURE_DESCRIPTIONS,
  type FailureType,
} from '@/lib/math';

interface JobTitle {
  id: number;
  rawTitle: string;
  department: string;
  seniority: number;
  vector: number[];
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function cellColor(t: number): string {
  const h = Math.round(lerp(215, 200, t));
  const s = Math.round(lerp(28, 88, t));
  const l = Math.round(lerp(11, 56, t));
  return `hsl(${h}, ${s}%, ${l}%)`;
}

function FailureDot({ type }: { type: FailureType }) {
  return (
    <span
      title={FAILURE_LABELS[type]}
      style={{
        display: 'inline-block',
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: FAILURE_COLORS[type],
        flexShrink: 0,
      }}
    />
  );
}

function Toggle({
  checked,
  onChange,
  label,
  sub,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  sub: string;
}) {
  return (
    <label className="flex items-center gap-4 cursor-pointer select-none group">
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          position: 'relative',
          width: 48,
          height: 26,
          borderRadius: 9999,
          flexShrink: 0,
          outline: 'none',
          transition: 'background 0.2s',
          background: checked ? '#0284c7' : '#334155',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 3,
            left: checked ? 25 : 3,
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: '#ffffff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
            transition: 'left 0.2s',
          }}
        />
      </button>
      <span style={{ fontSize: 15, color: '#cbd5e1' }}>
        {label}{' '}
        <span style={{ fontSize: 13, color: '#475569' }}>{sub}</span>
      </span>
    </label>
  );
}

const FAILURE_ORDER: FailureType[] = ['acronym', 'drift', 'crossdept', 'conflation', 'format'];

export default function Home() {
  const [library, setLibrary] = useState<JobTitle[]>([]);
  const [seniorityPartition, setSeniorityPartition] = useState(false);
  const [deptPartition, setDeptPartition] = useState(false);
  const [hovered, setHovered] = useState<[number, number] | null>(null);
  const [highlighted, setHighlighted] = useState<[number, number] | null>(null);
  const [insightOpen, setInsightOpen] = useState(true);

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

  return (
    <main className="min-h-screen py-10 px-6 lg:px-10 bg-slate-950 text-slate-100">
      <div className="max-w-[1400px] mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-100">Embedding Failure Lab</h1>
          <p className="mt-1 text-slate-400 text-sm">Cosine similarity across job titles via OpenAI embeddings.</p>
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
            <Toggle
              checked={seniorityPartition}
              onChange={setSeniorityPartition}
              label="Seniority partition"
              sub="(zero cross-level)"
            />
            <Toggle
              checked={deptPartition}
              onChange={setDeptPartition}
              label="Department partition"
              sub="(zero cross-dept)"
            />
          </div>

          {uniqueLibrary.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>Low</span>
              <div
                style={{
                  width: 160,
                  height: 10,
                  flexShrink: 0,
                  borderRadius: 9999,
                  background: `linear-gradient(to right, ${cellColor(0)}, ${cellColor(0.5)}, ${cellColor(1)})`,
                }}
              />
              <span style={{ fontSize: 12, color: '#64748b' }}>High</span>
              <span style={{ fontSize: 12, color: '#475569', marginLeft: 8, fontVariantNumeric: 'tabular-nums' }}>
                {minScore.toFixed(2)}–{maxScore.toFixed(2)}
              </span>
            </div>
          )}
        </div>

        {/* Insight Panel */}
        {uniqueLibrary.length > 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60">
            <button
              onClick={() => setInsightOpen(o => !o)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 20px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#94a3b8',
                fontSize: 12,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              <span>Embedding Failure Modes — click any example to highlight in matrix below</span>
              <span style={{
                fontSize: 14,
                transition: 'transform 0.15s',
                transform: insightOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
              }}>▾</span>
            </button>

            {insightOpen && (
              <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                {FAILURE_ORDER.map(type => {
                  const examples = insightExamples[type] ?? [];
                  return (
                    <div key={type} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          display: 'inline-block', width: 8, height: 8,
                          borderRadius: '50%', background: FAILURE_COLORS[type], flexShrink: 0,
                        }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>
                          {FAILURE_LABELS[type].split(' — ')[0]}
                        </span>
                        <span style={{ fontSize: 11, color: '#475569' }}>
                          — colored borders on matrix cells, dots on role labels
                        </span>
                      </div>
                      <p style={{ fontSize: 12, color: '#64748b', margin: 0, paddingLeft: 16 }}>
                        {FAILURE_DESCRIPTIONS[type]}
                      </p>
                      {examples.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 16 }}>
                          {examples.map((ex, idx) => (
                            <button
                              key={idx}
                              onClick={() => setHighlighted([ex.ri, ex.ci])}
                              style={{
                                fontSize: 11,
                                padding: '3px 10px',
                                borderRadius: 9999,
                                border: `1px solid ${FAILURE_COLORS[type]}55`,
                                background: `${FAILURE_COLORS[type]}18`,
                                color: FAILURE_COLORS[type],
                                cursor: 'pointer',
                                fontWeight: 500,
                              }}
                            >
                              {ex.label}
                              {ex.score > 0 && (
                                <span style={{ opacity: 0.6, marginLeft: 5 }}>
                                  {ex.score.toFixed(2)}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Matrix */}
        {library.length > 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
            <div className="overflow-auto max-h-[700px]">
              <table className="border-separate border-spacing-0">
                <thead>
                  <tr>
                    <th
                      className="sticky top-0 left-0 z-30 border-b border-r border-slate-700/50 bg-slate-900 px-5 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-500"
                      style={{ minWidth: 192 }}
                    >
                      Role
                    </th>
                    {titles.map((title, i) => (
                      <th
                        key={i}
                        className="sticky top-0 z-20 border-b border-r border-slate-700/40 bg-slate-900 p-0"
                        style={{ width: 52, minWidth: 52, verticalAlign: 'bottom', position: 'relative' }}
                      >
                        {titleFlags.get(i)?.[0] && (
                          <span
                            title={(titleFlags.get(i) ?? []).map(t => FAILURE_LABELS[t]).join('\n')}
                            style={{
                              position: 'absolute',
                              top: 6,
                              right: 6,
                              display: 'block',
                              width: 7,
                              height: 7,
                              borderRadius: '50%',
                              background: FAILURE_COLORS[titleFlags.get(i)![0]],
                              zIndex: 1,
                            }}
                          />
                        )}
                        <div
                          style={{
                            writingMode: 'vertical-rl',
                            transform: 'rotate(180deg)',
                            paddingTop: 4,
                            paddingBottom: 16,
                            paddingLeft: 10,
                            paddingRight: 10,
                            whiteSpace: 'nowrap',
                            fontSize: 11,
                            fontWeight: 500,
                            color: '#ffffff',
                            letterSpacing: '0.03em',
                          }}
                        >
                          {title}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {titles.map((rowTitle, ri) => (
                    <tr key={ri}>
                      <th
                        className="sticky left-0 z-10 border-b border-r border-slate-700/40 bg-slate-900 px-5 text-left font-medium text-slate-300 whitespace-nowrap"
                        style={{ height: 44, fontSize: 13 }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {rowTitle}
                          {(titleFlags.get(ri) ?? []).map(type => (
                            <FailureDot key={type} type={type} />
                          ))}
                        </span>
                      </th>
                      {scores[ri]?.map((score, ci) => {
                        const t = score > 0 ? normalize(score) : 0;
                        const bg = score > 0 ? cellColor(t) : 'hsl(215,20%,8%)';
                        const isHov = hovered?.[0] === ri && hovered?.[1] === ci;
                        const isHighlighted = highlighted?.[0] === ri && highlighted?.[1] === ci;
                        const cellFailure = cellFlags.get(`${ri},${ci}`);
                        return (
                          <td
                            key={ci}
                            data-highlighted={isHighlighted ? 'true' : undefined}
                            style={{
                              backgroundColor: bg,
                              width: 52,
                              height: 44,
                              textAlign: 'center',
                              verticalAlign: 'middle',
                              borderBottom: '1px solid rgba(148,163,184,0.07)',
                              borderRight: '1px solid rgba(148,163,184,0.07)',
                              cursor: 'default',
                              transition: 'filter 0.08s',
                              filter: isHov ? 'brightness(1.35)' : undefined,
                              outline: isHighlighted
                                ? '2px solid #ffffff'
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
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: t > 0.55 ? '#0f172a' : '#e2e8f0',
                                  userSelect: 'none',
                                }}
                              >
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
          </div>
        )}



      </div>
    </main>
  );
}
