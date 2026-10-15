#!/bin/bash
# Generate a random alphanumeric seed with the shell and print patterns worth mining.
# Usage: seed.sh <out-file> [length=120]
# The string is inspiration only. Never put it (or a recognisable piece of it) on screen.
set -euo pipefail
OUT="${1:?usage: seed.sh <out-file> [length]}"; LEN="${2:-120}"
S=$(LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c "$LEN" || true)   # tr gets SIGPIPE (141) when head closes; expected
mkdir -p "$(dirname "$OUT")"; echo "$S" > "$OUT"
python3 - "$S" <<'PY'
import sys, re, collections
s = sys.argv[1]; low = s.lower()
d = ''.join(re.findall(r'\d', s))
print(f"seed ({len(s)} chars) saved. rows of 20:")
for i in range(0, len(s), 20): print("  ", s[i:i+20])
print("digits:", d, "| count", len(d), "| sum", sum(map(int, d)) if d else 0)
print("digit runs:", re.findall(r'\d{2,}', s))
print("upper runs:", re.findall(r'[A-Z]{3,}', s), "| lower runs:", re.findall(r'[a-z]{3,}', s))
print("doubles:", [(m.start(), m.group()) for m in re.finditer(r'(.)\1', s)])
pal = sorted({s[i:j] for i in range(len(s)) for j in range(i + 3, min(len(s), i + 9)) if s[i:j] == s[i:j][::-1]}, key=len)
print("palindromes:", pal)
print("most common:", collections.Counter(s).most_common(6))
reps = [w for w, c in collections.Counter(low[i:i+3] for i in range(len(s) - 2)).items() if c > 1]
print("repeated trigrams (case-insensitive):", reps)
if d:
    ds = sum(map(int, d))
    print("digit sum appears in string:", str(ds) in s)
f = [n for n in range(2, 13) if len(s) % n == 0]
print("length factors:", [f"{n}x{len(s)//n}" for n in f])
words = ["ad","ads","ai","api","bot","buy","cli","cpl","cron","data","seo","serp","sql","url","win","lead","run","ship","log","git",
         "top","map","key","rank","hide","go","we","up","job","web","net","pix","bid","tam","gtm","roi","mrr","x"]
hits = []
for w in words:
    for m in re.finditer(w, low):
        if len(w) > 1: hits.append((w, m.start(), s[max(0, m.start()-3):m.end()+3]))
print("hidden words:", hits[:20])
print("letter+digit pairs:", re.findall(r'[A-Za-z]\d', s)[:12])
PY
