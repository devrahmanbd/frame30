#!/usr/bin/env python3
"""Restore table/view/enum definitions that exist only in
supabase/types.reference.ts into the generated
src/integrations/supabase/types.ts.

The generated file mirrors the live database, which lags the reference schema
in remixed/forked projects. Typecheck needs the full surface, so missing
entries are merged back in (never overwriting a live definition)."""
import re
import sys

GEN = "src/integrations/supabase/types.ts"
REF = "supabase/types.reference.ts"


def block(lines, header):
    start = lines.index(header)
    depth = 0
    for j in range(start, len(lines)):
        depth += lines[j].count("{") - lines[j].count("}")
        if depth == 0:
            return start, j
    raise SystemExit(f"unterminated block: {header.strip()}")


def entries(lines, s, e):
    out, i = {}, s + 1
    while i < e:
        m = re.match(r"      (\w+):", lines[i])
        if not m:
            i += 1
            continue
        j = i + 1
        while j < e and not re.match(r"      \w+:", lines[j]):
            j += 1
        out[m.group(1)] = lines[i:j]
        i = j
    return out


def merge(gen_lines, ref_lines, header):
    gs, ge = block(gen_lines, header)
    rs, re_ = block(ref_lines, header)
    have, ref = entries(gen_lines, gs, ge), entries(ref_lines, rs, re_)
    missing = sorted(k for k in ref if k not in have)
    add = [ln for k in missing for ln in ref[k]]
    return gen_lines[:ge] + add + gen_lines[ge:], missing


def main():
    gen = open(GEN).read().split("\n")
    ref = open(REF).read().split("\n")
    report = []
    for header in ("    Tables: {", "    Views: {", "    Enums: {"):
        try:
            gen, missing = merge(gen, ref, header)
        except ValueError:
            continue
        report.append(f"{header.strip().rstrip(': {')}: +{len(missing)}")
    open(GEN, "w").write("\n".join(gen))
    print("restored " + ", ".join(report))


if __name__ == "__main__":
    sys.exit(main())
