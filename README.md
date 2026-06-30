# Job Title Embedding Failures — why normalization must come first.

![Model](https://img.shields.io/badge/model-text--embedding--3--small-blue) ![Titles](https://img.shields.io/badge/titles-46-green) ![Metric](https://img.shields.io/badge/metric-cosine%20similarity-orange) ![Stack](https://img.shields.io/badge/stack-Next.js%2014%20%2F%20TypeScript-black)

## The Problem

Job titles are self-reported, unstructured, and inconsistent by nature. Whether you're matching candidates on LinkedIn, segmenting contacts in a CRM, or parsing resumes — the same role arrives written a dozen different ways. `VP of MarOps`, `Head of Marketing Operations`, and `Senior Marketing Operations Manager` could all describe the same person at the same seniority level.

The obvious fix is a standard taxonomy — but frameworks like O*NET are too slow to reflect how the market actually evolves. Roles like `GTM Engineer` or `Revenue Architect` don't exist in any official classification yet, which means taxonomy-based normalization has a permanent blind spot for emerging titles.

Embedding-based similarity is the natural alternative — but it doesn't work on raw titles either. Models like `text-embedding-3-small` encode surface form as strongly as meaning, so `CRO` and `Chief Revenue Officer` land in different parts of the vector space, and `VP of Sales` scores closer to `VP of Marketing` than to `Head of Revenue`. Normalization has to happen before embedding, not after. This project stress-tests that assumption against 46 job titles and catalogues the five systematic failure modes — with exact cosine scores — that corrupt any downstream classifier or matching system relying on raw embeddings.

<img width="567" height="455" alt="Network graph — each node is a title, edge thickness scales with cosine similarity" src="screenshots/network-graph.jpg" /> <img width="691" height="297" alt="image" src="https://github.com/user-attachments/assets/cd1dea8e-f294-46b5-820e-a24158097c1c" />



*Each node is a title, edge thickness scales with cosine similarity*

---

## Overview — What This Exposes

Each failure mode is detectable with exact cosine scores — no interpretation required.

| Failure Pattern | How This Project Surfaces It |
|---|---|
| **Functional Title Drift** | Titles without anchor tokens like `VP` or `Director` drift away from their expected cluster, measurably quantified per title |
| **Cross-Departmental Over-Similarity** | The model produces false-positive matches (`VP of Sales` ↔ `VP of Marketing` at **0.84**) that would cause incorrect results in any threshold-based matching pipeline |
| **Seniority Conflation** | A **0.05 delta** separates a seniority boundary from a departmental one; a system calibrated on small data would fail systematically across thousands of titles |
| **Syntactic Format Sensitivity** | The model clusters by surface form as much as by meaning — `"VP of X"` titles score higher with each other than with semantically equivalent `"X VP"` titles (**0.74** vs **0.55**) |
| **Acronym Blindspot** | `CRO` is ambiguous (`Chief Revenue Officer? Chief Risk Officer? Contract Research Org?`) so the embedding averages across meanings and collapses to **0.16–0.41**, while `Chief Revenue Officer` scores **0.50+** — proving that acronym expansion before embedding is mandatory |

## Dashboard

### Failure Analysis
An NxN cosine similarity heatmap across all 46 titles. Hover any cell to see the exact score. Toggle partition modes (seniority / department) to zero out cross-boundary similarities and compare raw embeddings against a hard-partitioned system. The failure panel lists every detected anomaly with the pair, score, and failure type.

<details><summary>📸 Failure mode breakdown</summary>
<img width="979" height="487" alt="Failure mode breakdown" src="screenshots/failure-modes.jpg" />
</details>

<details><summary>📸 Cosine similarity matrix</summary>
<img width="1387" height="655" alt="image" src="https://github.com/user-attachments/assets/c0410431-1952-4f38-beb5-c59dca0bb971" />

*Cosine similarity matrix (left) · Failure mode breakdown (right)*
</details>

### Seniority Gravity
Titles orbit concentric rings by seniority level (L1 IC → L4 VP/C-Suite). Edges connect pairs with cosine similarity ≥ 0.70. Red edges are cross-department false positives — the model treats seniority tokens like `VP` as gravitational anchors, pulling unrelated departments into the same orbit. Purple edges mark seniority conflation between adjacent rings. Hover any dot to see its title and connections.

<details><summary>📸 Seniority Gravity</summary>
<img width="1440" height="1100" alt="Seniority Gravity — titles orbit concentric rings by seniority level, edges connect similar pairs" src="screenshots/seniority-gravity.png" />
</details>

### Embedding Map
A 2D PCA scatter plot of all 46 title vectors, computed client-side via power-iteration PCA. Shows how the model actually clusters titles in its vector space, independent of the similarity scores.

<details><summary>📸 Embedding Map</summary>
<img width="1000" height="500" alt="Embedding Map — 2D PCA scatter plot of all 46 title vectors" src="screenshots/embedding-map.jpg" />
</details>

---

## Findings

**Reading the scores:** production title-matching pipelines typically use a threshold of ~0.75 to flag a match. Scores above that between titles from *different* departments or seniority levels are false positives. That's why a 0.84 between `VP of Sales` and `VP of Marketing` is the key finding — it's above the typical match threshold.

### Areas of Success

| Pair | Score | Signal |
|---|---|---|
| *HR VP / VP HR / VP of HR* | **0.80–0.85** | Word order doesn't change the role — the model gets this right |
| *Director of Engineering* ↔ *VP of Engineering* | **0.79** | Adjacent seniority, same department — strong relationship maintained |

### Failure Cases

#### 🔤 Acronym Blindspot
`CRO` is ambiguous across four expansions — the embedding averages across meanings and collapses into noise. Any pipeline that skips acronym expansion will systematically fail to match C-suite roles.
- *Chief Revenue Officer* vs. other executive titles → **0.50+**
- *CRO* (same role, acronym form) → **0.16–0.41** — scores just **0.24** against VP of Sales, while unrelated *Software Engineer* (**0.34**) scores higher

#### 🔡 Syntactic Format Sensitivity
The model clusters by grammatical pattern as much as by meaning — `"VP of X"` titles score higher with each other than with semantically equivalent `"X VP"` titles.
- *VP of Engineering* ↔ *VP of Finance* (same format, different dept) → **0.74**
- *VP of Engineering* ↔ *Finance VP* (different format, different dept) → **0.55**

#### 🏢 Cross-Departmental Over-Similarity
The model over-indexes on seniority tokens like `VP`, collapsing functional boundaries between unrelated departments.
- *VP of Sales* ↔ *VP of Marketing* → **0.84** — higher than many same-title word-order variants

#### 📊 Seniority Conflation
VP and Director are separated by the same margin as VPs across departments — a **0.05 delta** is the only thing between a seniority boundary and a departmental one.
- *VP of Engineering* ↔ *Director of Engineering* (same dept, different level) → **0.79**
- *VP of Engineering* ↔ *VP of Finance* (same level, different dept) → **0.74**

#### 🌀 Functional Title Drift
Non-canonical titles drift from their formal equivalents. `VP` and `Director` anchor embeddings toward executive space; titles without those tokens drift to a weak centroid.
- *Revenue Leader* ↔ *VP of Sales* → **0.54** — same role; *VP of Marketing* (different dept) scores **0.84** against the same title
- *Head of People* ↔ *VP of HR* → **0.60** — same function, same level
- *Sales Principal* vs. cross-domain VP titles → **< 0.40** despite seniority level 4

---

## Conclusion

Raw embeddings provide a strong baseline for functional grouping but fail at **precise entity resolution** and **seniority mapping**. The five failure modes above are not edge cases — they reflect systematic gaps that appear whenever titles deviate from a canonical `"[Level] of [Department]"` format. Static taxonomies like O*NET can't fill the gap either; they lag too far behind how roles actually evolve in the market. Normalization must happen before embedding, and it cannot rely on a fixed classification alone. A production title-matching system needs at minimum: acronym expansion, title normalization, and a seniority signal that does not rely on the embedding alone.

---

## Usage & Background

### Quick Start

**No API key needed** — embedding vectors are pre-calculated and committed. The matrix loads immediately.

```bash
npm install
npm run dev       # → http://localhost:3000
```

### Extend It

Rename `.env.example` to `.env.local` and add your OpenAI API key.

#### Adding titles to the library

Titles are defined in `cfg/titles.json` — this is the source of truth. `src/data/library.json` is a generated file; do not edit it directly.

Add an entry to `cfg/titles.json`:

```json
{ "rawTitle": "Head of Growth", "department": "Marketing", "seniority": 3 }
```

| Field | Type | Notes |
|---|---|---|
| `rawTitle` | string | The only value sent to the embedding model — `department` and `seniority` are metadata only |
| `department` | string | One of: Engineering, Finance, HR, Legal, Marketing, Operations, Sales |
| `seniority` | number | 1 = IC · 2 = Senior IC / Manager · 3 = Director · 4 = VP / C-Suite |

**How `department` is used:** drives the department hard-partition toggle (zeroes out cross-department scores), cross-dept failure detection (flags same-seniority pairs from different departments scoring > 0.80), and sort order in the matrix.

**How `seniority` is used:** drives the seniority hard-partition toggle (zeroes out cross-level scores), seniority conflation detection (flags same-department pairs at different levels scoring > 0.72), drift detection (flags titles whose average peer score < 0.42), and which ring a title occupies in the Seniority Gravity view.

Then regenerate `library.json` and embed any new titles:

```bash
npm run seed    # rebuild library.json from cfg/titles.json; only calls OpenAI for new titles
npm run clear   # wipe all vector data from library.json (useful before a full re-embed)
```

`npm run seed` is a smart upsert — it carries over existing vectors for titles that haven't changed, so re-running it after adding a single title only makes one API call.

### Background

#### What are embeddings?

An embedding model converts text into a high-dimensional numeric vector — a list of 1,536 numbers in this case. The position of that vector in space encodes meaning: words and phrases the model considers semantically related end up geometrically close together. This is what makes embeddings useful for tasks like search, clustering, and matching.

#### What is cosine similarity?

Cosine similarity measures the angle between two vectors, returning a value between 0.0 and 1.0. A score of **1.0** means the vectors point in exactly the same direction (identical meaning); **0.0** means they are orthogonal (no relationship). The metric ignores vector magnitude, so it compares meaning rather than word count or document length.

```
similarity = (A · B) / (|A| × |B|)
```

<details><summary>📸 Embedding space visualization</summary>
<img width="2032" height="949" alt="image" src="screenshots/embedding-space-visualization.jpg" />
</details>

### Methodology

- **Model:** OpenAI text-embedding-3-small
- **Metric:** Cosine Similarity [0.0 - 1.0]
- **Dataset:** 46 professional job titles across Engineering, Finance, HR, Legal, Marketing, and Sales.

*All scores are properties of `text-embedding-3-small`'s vector space — switching models requires full re-embedding, as a different model may resolve some failure modes while introducing others.*

### Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Embeddings:** OpenAI `text-embedding-3-small` via REST API
- **Analytics:** custom cosine similarity + PCA — no ML library dependency
