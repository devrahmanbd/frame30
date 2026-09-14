import { BLUEPRINT_PRESETS } from "@/lib/theme-blueprints";
import { biTextKeysOf } from "@/lib/builder-ast";
import { bnKey } from "@/lib/bitext";
const p = BLUEPRINT_PRESETS.find(x=>x.key==="atelier")!;
let total=0, done=0; const missing:string[]=[];
const walk=(s:any)=>{for(const k of biTextKeysOf(s.type)){const v=s.props?.[k];if(typeof v==="string"&&v.trim()){total++;const bn=s.props[bnKey(k)];if(typeof bn==="string"&&bn.trim())done++;else missing.push(v);}}
 for(const key of Object.keys(s.props??{})){const v=(s.props as any)[key]; if(Array.isArray(v))v.forEach((c:any)=>c&&c.type&&walk(c));}
 (s.children??[]).forEach(walk);};
for(const t of Object.values(p.templates) as any[]) [...t.header,...t.main,...t.footer].forEach(walk);
console.log({total,done,pct:done/total, missing:[...new Set(missing)]});
