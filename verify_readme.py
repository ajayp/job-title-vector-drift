import json, math

with open('src/data/library.json') as f:
    data = json.load(f)

def cosine(a, b):
    dot = sum(x*y for x,y in zip(a,b))
    na = math.sqrt(sum(x*x for x in a))
    nb = math.sqrt(sum(x*x for x in b))
    return dot / (na * nb) if na and nb else 0

by_title = {}
for d in data:
    if d['rawTitle'] not in by_title:
        by_title[d['rawTitle']] = d['vector']

def check(label, a, b, readme_val, tolerance=0.02):
    if a not in by_title:
        print('MISSING TITLE: %s' % a)
        return
    if b not in by_title:
        print('MISSING TITLE: %s' % b)
        return
    actual = cosine(by_title[a], by_title[b])
    ok = abs(actual - readme_val) <= tolerance
    status = 'OK ' if ok else 'FAIL'
    print('[%s] README=%.2f  ACTUAL=%.3f  delta=%.3f  -- %s' % (status, readme_val, actual, actual - readme_val, label))

print('=== Areas of Success ===')
check('HR VP <> VP of HR (low end)',  'HR VP',  'VP of HR',  0.80)
check('HR VP <> VP HR (high end)',    'HR VP',  'VP HR',     0.85)
check('Director of Eng <> VP of Eng','Director of Engineering','VP of Engineering', 0.79)

print()
print('=== What This Exposes table ===')
check('VP of Sales <> VP of Marketing (0.84)', 'VP of Sales', 'VP of Marketing', 0.84)
check('CRO upper bound (0.41)',  'CRO', 'Chief Revenue Officer', 0.41)
check('CRO lower bound (0.16)',  'CRO', 'Engineering Principal', 0.16, tolerance=0.01)
check('Chief Revenue Officer 0.50+', 'Chief Revenue Officer', 'VP of Sales', 0.54)
check('0.05 delta: VP Eng <> Dir Eng', 'VP of Engineering', 'Director of Engineering', 0.79)
check('0.05 delta: VP Eng <> VP Finance', 'VP of Engineering', 'VP of Finance', 0.74)

print()
print('=== Acronym Blindspot ===')
check('Chief Revenue Officer <> VP of Sales (0.50+)', 'Chief Revenue Officer', 'VP of Sales', 0.54)
check('CRO <> VP of Sales (0.24)',     'CRO', 'VP of Sales',       0.24)
check('Software Engineer <> VP Sales (0.34)', 'Software Engineer', 'VP of Sales', 0.34)
check('DevOps Engineer <> VP Sales (0.35)',   'DevOps Engineer',   'VP of Sales', 0.35)

print()
print('=== Syntactic Format Sensitivity ===')
check('VP of Eng <> VP of Finance (0.74)', 'VP of Engineering', 'VP of Finance', 0.74)
check('VP of Eng <> Finance VP (0.55)',    'VP of Engineering', 'Finance VP',    0.55)

print()
print('=== Cross-Departmental Over-Similarity ===')
check('VP of Sales <> VP of Marketing (0.84)', 'VP of Sales', 'VP of Marketing', 0.84)

print()
print('=== Seniority Conflation ===')
check('VP of Eng <> Dir of Eng (0.79)', 'VP of Engineering', 'Director of Engineering', 0.79)
check('VP of Eng <> VP of Finance (0.74)', 'VP of Engineering', 'VP of Finance', 0.74)

print()
print('=== Functional Title Drift ===')
check('Revenue Leader <> VP of Sales (0.54)',   'Revenue Leader', 'VP of Sales',   0.54)
check('VP of Marketing <> VP of Sales (0.84)',  'VP of Marketing', 'VP of Sales',  0.84)
check('Head of People <> VP of HR (0.60)',      'Head of People',  'VP of HR',     0.60)
check('Sales Principal <> VP of Sales (0.59)',  'Sales Principal', 'VP of Sales',  0.594)
check('Sales Principal <> Sales VP (0.66)',     'Sales Principal', 'Sales VP',     0.664)
check('Sales Principal <> VP of Eng (<0.40)',   'Sales Principal', 'VP of Engineering', 0.382, tolerance=0.01)
check('Sales Principal <> VP of HR (<0.40)',    'Sales Principal', 'VP of HR',     0.386, tolerance=0.01)
check('Sales Principal <> VP of Finance (<0.40)','Sales Principal','VP of Finance',0.385, tolerance=0.01)
