#!/usr/bin/env python3
"""Re-merge function signatures that live only in supabase/types.reference.ts
into the generated src/integrations/supabase/types.ts.

The generated file is rebuilt from the live database on every migration, which
drops signatures for routines that exist only in the reference schema. Run this
after any migration to restore them."""
import re, sys

GEN = 'src/integrations/supabase/types.ts'
REF = 'supabase/types.reference.ts'

def block(lines):
    start = lines.index('    Functions: {')
    depth = 0
    for j in range(start, len(lines)):
        depth += lines[j].count('{') - lines[j].count('}')
        if depth == 0:
            return start, j
    raise SystemExit('unterminated Functions block')

def entries(lines, s, e):
    out, i = {}, s + 1
    while i < e:
        m = re.match(r'      (\w+):', lines[i])
        if not m:
            i += 1
            continue
        j = i + 1
        while j < e and not re.match(r'      \w+:', lines[j]):
            j += 1
        out[m.group(1)] = lines[i:j]
        i = j
    return out

g = open(GEN).read().split('\n')
r = open(REF).read().split('\n')
gs, ge = block(g)
rs, re_ = block(r)
have, ref = entries(g, gs, ge), entries(r, rs, re_)
missing = sorted(k for k in ref if k not in have)
add = [ln for k in missing for ln in ref[k]]
open(GEN, 'w').write('\n'.join(g[:ge] + add + g[ge:]))
print(f'restored {len(missing)} function signatures')
