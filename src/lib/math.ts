/** Reduces high-dimensional vectors to 2D via power-iteration PCA. */
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

/** Returns cosine similarity in [-1, 1] between two embedding vectors. */
export function getSimilarity(vecA: number[], vecB: number[]): number {
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    if (magA === 0 || magB === 0) return 0;
    return dotProduct / (magA * magB);
}


/** Zeroes out similarity when seniority or department filters are enabled and differ. */
export function applyHardPartition(
    similarity: number,
    seniorityA: number, seniorityB: number, seniorityEnabled: boolean,
    deptA: string, deptB: string, deptEnabled: boolean
): number {
    if (seniorityEnabled && seniorityA !== seniorityB) return 0;
    if (deptEnabled && deptA !== deptB) return 0;
    return similarity;
}
