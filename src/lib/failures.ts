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

const FAILURE_PRIORITY: FailureType[] = ['acronym', 'drift', 'crossdept', 'conflation', 'format'];

function hasOfPreposition(title: string): boolean {
  return / of /i.test(title);
}

interface JobTitle {
  rawTitle: string;
  department: string;
  seniority: number;
  vector: number[];
}

/**
 * Scans a similarity matrix to detect embedding failure modes.
 * Returns per-title badge lists and per-cell failure types.
 */
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
