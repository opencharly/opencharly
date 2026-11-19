#!/usr/bin/env python3
"""Every total in a document must equal the parts listed beneath it.
Reads a markdown file, finds (a) markdown tables whose rows each carry 5 numeric-ish
cells, and (b) sentences of the form 'N <noun>s (a from X + b from Y)'.
Exits nonzero on any disagreement. This is the check three review rounds asked for."""
import re, sys

path = sys.argv[1]
text = open(path, encoding='utf-8').read()
lines = text.split('\n')
fail = 0

# --- check 1: any markdown table with 4+ numeric columns must have rows that sum to
#     its bold total row, if one exists.
i = 0
while i < len(lines):
    if lines[i].startswith('|') and i+1 < len(lines) and re.match(r'^\|[\s:|-]+\|$', lines[i+1]):
        hdr = lines[i]
        ncols = hdr.count('|') - 1
        rows, total = [], None
        j = i + 2
        while j < len(lines) and lines[j].startswith('|'):
            cells = [c.strip() for c in lines[j].split('|')[1:-1]]
            nums = [re.sub(r'[^0-9]', '', c) for c in cells]
            if 'Total' in lines[j]:
                total = nums
            elif sum(1 for n in nums if n) >= 3:
                rows.append(nums)
            j += 1
        if total and rows:
            for k, t in enumerate(total):
                if not t: continue
                s = sum(int(r[k]) for r in rows if k < len(r) and r[k])
                if s and int(t) != s:
                    print(f"FAIL {path}:{i+1}: total column {k+1} says {t}, rows sum to {s}")
                    fail += 1
        i = j
    else:
        i += 1

# --- check 2: "N Xs (a from A + b from B)" -- the stated total must equal a+b
for m in re.finditer(r'(\d+)\s+[\w\- ]{0,24}?\(([^)]*\d+[^)]*)\)', text):
    stated = int(m.group(1))
    parts = [int(x) for x in re.findall(r'\d+', m.group(2))]
    if parts and 'from' in m.group(2):
        if sum(parts) != stated:
            print(f"FAIL {path}: '{m.group(0)[:70]}' says {stated}, parts sum to {sum(parts)}")
            fail += 1

print(f"check-totals: {fail} finding(s)")
sys.exit(1 if fail else 0)
