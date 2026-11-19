#!/usr/bin/env python3
"""check-doc-totals — a document's totals must equal the parts listed beneath them.

Four checks, each earned from a real review finding on PROGRAM/todo-wave-plan.md:

  1. a markdown table's bold Total row must equal the sum of its data rows;
  2. a sentence of the form "N rows (... a from A + b from B)" must have N == a + b;
  3. every section the census lists with open rows must appear somewhere in the prose,
     so a plan cannot list a section and then silently skip it;
  4. a heading that names sections and states a count must have that count equal the
     census sum of the sections it names.

Reads one or more markdown files. Exits 1 on any finding.
"""
import argparse
import re
import sys

TABLE_ROW = r'^\| (\d+)\. [^|]+\| (\d+) \| (\d+) \| \*\*(\d+)\*\* \| (\d+) \|'


def check(path: str) -> int:
    text = open(path, encoding='utf-8').read()
    lines = text.split('\n')
    fail = 0

    # 1. table total row vs data rows
    i = 0
    while i < len(lines):
        if lines[i].startswith('|') and i + 1 < len(lines) and re.match(r'^\|[\s:|-]+\|$', lines[i + 1]):
            rows, total, j = [], None, i + 2
            while j < len(lines) and lines[j].startswith('|'):
                nums = [re.sub(r'[^0-9]', '', c.strip()) for c in lines[j].split('|')[1:-1]]
                if 'Total' in lines[j]:
                    total = nums
                elif sum(1 for n in nums if n) >= 3:
                    rows.append(nums)
                j += 1
            if total and rows:
                for k, t in enumerate(total):
                    if not t:
                        continue
                    s = sum(int(r[k]) for r in rows if k < len(r) and r[k])
                    if s and int(t) != s:
                        print(f"FAIL {path}:{i + 1}: total column {k + 1} says {t}, rows sum to {s}")
                        fail += 1
            i = j
        else:
            i += 1

    # 2. "N rows (a from A + b from B)"
    for m in re.finditer(r'(\d+)\s+[\w\- ]{0,24}?\(([^)]*\d+[^)]*)\)', text):
        if 'from' not in m.group(2):
            continue
        stated = int(m.group(1))
        parts = [int(x) for x in re.findall(r'\d+', m.group(2))]
        if parts and sum(parts) != stated:
            print(f"FAIL {path}: '{m.group(0)[:70]}' says {stated}, parts sum to {sum(parts)}")
            fail += 1

    census = re.findall(TABLE_ROW, text, re.M)

    # 3. every section with open rows must be placed somewhere
    if census:
        placed = set(re.findall(r'§(\d+)', text))
        unplaced = [c[0] for c in census if int(c[3]) > 0 and c[0] not in placed]
        if unplaced:
            print(f"FAIL {path}: sections with open rows that no wave places: "
                  + ', '.join('§' + x for x in unplaced))
            fail += 1

    # 4. a heading's stated count vs the census sum of the sections it names
    rows_map = {c[0]: int(c[3]) for c in census}
    for m in re.finditer(r'^#+ [^\n]*?`[^`]*§\d[^`]*`[^\n]*?\((\d+)[^)]*\)', text, re.M):
        named = re.findall(r'§(\d+)', m.group(0))
        stated = int(m.group(1))
        if named:
            want = sum(rows_map.get(n, 0) for n in named)
            if want != stated:
                print(f"FAIL {path}: heading names {'+'.join(named)} = {want} but states {stated}")
                fail += 1

    return fail


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('files', nargs='*', default=['PROGRAM/todo-wave-plan.md'])
    ap.add_argument('--quiet', action='store_true')
    args = ap.parse_args()
    total = 0
    for path in args.files:
        n = check(path)
        if not args.quiet:
            print(f"check-totals: {path}: {n} finding(s)")
        total += n
    return 1 if total else 0


if __name__ == '__main__':
    sys.exit(main())
