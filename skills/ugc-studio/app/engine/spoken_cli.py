"""stdin script -> {"spoken": "...", "words": N}. Same quote removal + spell-out as ugc-video's make_ugc.py."""
import json, re, sys
from spoken import speakable

t = re.sub(r'["“”]', "", sys.stdin.read().strip())
s = " ".join(speakable(t).split())
print(json.dumps({"spoken": s, "words": len(s.split())}))
