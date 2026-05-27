export function pca2D(vectors: number[][]): Array<[number, number]> {
    const n = vectors.length;
    if (n < 2) return vectors.map(() => [0, 0]);
    const d = vectors[0].length;

    const mean = new Array(d).fill(0);
    for (const v of vectors) for (let i = 0; i < d; i++) mean[i] += v[i] / n;
    const X = vectors.map(v => v.map((x, i) => x - mean[i]));

    const mmul = (u: number[]) => {
        const scores = X.map(row => row.reduce((s, x, i) => s + x * u[i], 0));
        const out = new Array(d).fill(0);
        for (let k = 0; k < n; k++) for (let i = 0; i < d; i++) out[i] += scores[k] * X[k][i] / n;
        return out;
    };
    const norm = (v: number[]) => { const s = Math.sqrt(v.reduce((a, x) => a + x * x, 0)); return s < 1e-12 ? v : v.map(x => x / s); };
    const orth = (v: number[], u: number[]) => { const dt = v.reduce((s, x, i) => s + x * u[i], 0); return v.map((x, i) => x - dt * u[i]); };

    let pc1 = norm(X[0].slice());
    for (let i = 0; i < 60; i++) pc1 = norm(mmul(pc1));

    let pc2 = norm(orth(X[n > 1 ? 1 : 0].slice(), pc1));
    for (let i = 0; i < 60; i++) pc2 = norm(orth(mmul(pc2), pc1));

    return X.map(v => [
        v.reduce((s, x, i) => s + x * pc1[i], 0),
        v.reduce((s, x, i) => s + x * pc2[i], 0),
    ]);
}

export function getSimilarity(vecA: number[], vecB: number[]): number {
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    if (magA === 0 || magB === 0) return 0;
    return dotProduct / (magA * magB);
}

export type FailureType = 'acronym' | 'drift' | 'crossdept' | 'conflation' | 'format';

export const FAILURE_COLORS: Record<FailureType, string> = {
  acronym:    '#f59e0b',
  drift:      '#eab308',
  crossdept:  '#ff2d55',
  conflation: '#8b5cf6',
  format:     '#06b6d4',
};

export const FAILURE_LABELS: Record<FailureType, string> = {
  acronym:    'Acronym Blindspot — model fails to resolve abbreviations',
  drift:      'Functional Title Drift — informal title lacks token gravity',
  crossdept:  'Cross-Dept Over-Similarity — seniority token overrides dept boundary',
  conflation: 'Seniority Conflation — VP and Director nearly indistinguishable',
  format:     'Format Sensitivity — syntax gap suppresses semantic similarity',
};

export const FAILURE_DESCRIPTIONS: Record<FailureType, string> = {
  acronym:    'Abbreviated titles (CRO, CFO) embed far from their full-form equivalents.',
  drift:      'Titles without anchor tokens like "VP" or "Director" drift away from their peer cluster.',
  crossdept:  'Same-level titles from different departments score higher than expected — the model over-indexes on the seniority token.',
  conflation: 'VP and Director in the same department are nearly indistinguishable in the embedding space.',
  format:     '"VP of X" and "X VP" score measurably lower across departments than two "VP of X" titles — pure syntax, not semantics.',
};

function hasOfPreposition(title: string): boolean {
  return / of /i.test(title);
}

interface JobTitle {
  rawTitle: string;
  department: string;
  seniority: number;
  vector: number[];
}

const FAILURE_PRIORITY: FailureType[] = ['acronym', 'drift', 'crossdept', 'conflation', 'format'];

export function detectFailures(
  personas: JobTitle[],
  scores: number[][],
): { titleFlags: Map<number, FailureType[]>; cellFlags: Map<string, FailureType> } {
  const titleSets = new Map<number, Set<FailureType>>();
  const cellFlags = new Map<string, FailureType>();
  const n = personas.length;

  const addTitle = (i: number, type: FailureType) => {
    if (!titleSets.has(i)) titleSets.set(i, new Set());
    titleSets.get(i)!.add(type);
  };

  // Direct title-level failures
  for (let i = 0; i < n; i++) {
    const { rawTitle, seniority } = personas[i];
    if (/^[A-Z]{2,5}$/.test(rawTitle)) {
      addTitle(i, 'acronym');
      continue;
    }
    const peers = scores[i].filter((s, j) => j !== i && personas[j].seniority === seniority && s > 0);
    if (peers.length > 0) {
      const mean = peers.reduce((a, b) => a + b, 0) / peers.length;
      if (mean < 0.42) addTitle(i, 'drift');
    }
  }

  // Cell-level failures — also badge the titles on both axes
  for (let ri = 0; ri < n; ri++) {
    for (let ci = 0; ci < n; ci++) {
      if (ri === ci) continue;
      const score = scores[ri][ci];
      if (score <= 0) continue;
      const a = personas[ri];
      const b = personas[ci];
      const key = `${ri},${ci}`;

      let cellType: FailureType | null = null;
      if (a.seniority === b.seniority && a.department !== b.department && score > 0.80) {
        cellType = 'crossdept';
      } else if (a.seniority !== b.seniority && a.department === b.department && score > 0.72) {
        cellType = 'conflation';
      } else if (
        a.seniority === b.seniority &&
        a.department !== b.department &&
        hasOfPreposition(a.rawTitle) !== hasOfPreposition(b.rawTitle) &&
        score < 0.65
      ) {
        cellType = 'format';
      }

      if (cellType) {
        cellFlags.set(key, cellType);
        addTitle(ri, cellType);
        addTitle(ci, cellType);
      }
    }
  }

  // Convert sets to ordered arrays
  const titleFlags = new Map<number, FailureType[]>();
  for (const [i, types] of titleSets) {
    titleFlags.set(i, FAILURE_PRIORITY.filter(t => types.has(t)));
  }

  return { titleFlags, cellFlags };
}

export function applyHardPartition(
    similarity: number,
    seniorityA: number, seniorityB: number, seniorityEnabled: boolean,
    deptA: string, deptB: string, deptEnabled: boolean
): number {
    if (seniorityEnabled && seniorityA !== seniorityB) return 0;
    if (deptEnabled && deptA !== deptB) return 0;
    return similarity;
}
