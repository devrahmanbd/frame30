import { BLUEPRINT_PRESETS } from "@/lib/theme-blueprints";
import { biTextKeysOf } from "@/lib/builder-ast";
const p = BLUEPRINT_PRESETS.find(x=>x.key==="atelier")!;
const out = new Set<string>();
const walk=(s:any)=>{for(const k of biTextKeysOf(s.type)){const v=s.props?.[k];if(typeof v==="string"&&v.trim()&&!s.props[k+"Bn"]&&!s.props["bn"+k[0].toUpperCase()+k.slice(1)])out.add(v);}
 for(const key of Object.keys(s.props??{})){const v=(s.props as any)[key]; if(Array.isArray(v))v.forEach((c:any)=>c&&c.type&&walk(c));}
 (s.children??[]).forEach(walk);};
for(const t of Object.values(p.templates) as any[]) [...t.header,...t.main,...t.footer].forEach(walk);
console.log(JSON.stringify([...out],null,1));
console.error("count",out.size);
