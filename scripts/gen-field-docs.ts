import { readFileSync, writeFileSync } from 'node:fs';
import { ANTENNAS } from '../src/registry';
import { describeFields } from '../src/project/schema';
type Help = {label:string;en:string;ru:string};
const help: Record<string,Help> = JSON.parse(readFileSync(new URL('../docs/field-help.json', import.meta.url),'utf8'));
const names:Record<string,string>={dipole:'Dipole',patch:'Patch',horn:'Horn',array:'Uniform linear array',yagi:'Yagi-Uda',moxon:'Moxon',lpda:'LPDA',gnss:'GNSS helix assembly'};
const units:Record<string,string>={'МГц':'MHz','мм':'mm','Ом':'ohm','дБ':'dB','дБи':'dBi','Ом·мм²/м':'ohm mm²/m','шт':'count','шт.':'count','вит.':'turns','град':'deg','град.':'deg'};
const cell=(x:unknown)=>String(x).replace(/\|/g,'\\|').replace(/\n/g,' ');
const lines=['# Complete field reference','','[Home](../README.md) · [User guide](USER-GUIDE.md) · [Русский](#русский)','','Generated from the live registry. Exact enum values are shown literally, including Cyrillic values. UI labels remain Russian. Fields hidden by a selection are still serialized. Numeric limits describe validation, not guaranteed physical accuracy.',''];
let total=0;
for (const lang of ['en','ru'] as const) {
 if(lang==='ru') lines.push('---','','# Русский','','Справочник генерируется из реестра. Значения enum приведены буквально. Скрытые поля сохраняются. Числовые границы — пределы ввода, а не гарантия точности модели.','');
 for(const a of ANTENNAS) {
  lines.push(`## ${lang==='en'?names[a.id]:a.name} — ${a.id}`,'');
  for(const mode of ['analysis','synthesis'] as const) {
   const def=a[mode]; if(!def) continue;
   lines.push(`### ${mode==='analysis'?'[params]':'[synthesis]'}`,'');
   lines.push(lang==='en'?'| Key | English / UI label | Unit | Default | Allowed / enum | Active when | Meaning |':'| Ключ | Поле | Ед. | Умолчание | Допустимо / enum | Используется при | Значение |','|---|---|---|---|---|---|---|');
   for(const f of describeFields(def.fields)) {
    const h=help[f.key];if(!h?.en||!h?.ru)throw new Error(`Missing translation: ${a.id}/${mode}/${f.key}`);
    if(lang==='en')total++;
    const options=f.options?.map(o=>'`'+o.value+'`').join(', ');
    const allowed=options ?? (f.kind==='elements'?'role, length, diameter, position (mm)':`${f.min??'…'} … ${f.max??'…'}`);
    const d=f.kind==='elements'?'[elements]':f.default;
    let cond=f.condition??(lang==='en'?'always':'всегда');
    if(lang==='en')cond=cond.replace(/ и /g,' and ').replace('зависит от других полей','depends on other fields');
    lines.push('| '+['`'+f.key+'`',lang==='en'?`${h.label} / ${f.label}`:f.label,lang==='en'?(units[f.unit]??f.unit):f.unit,d,allowed,cond,h[lang]].map(cell).join(' | ')+' |');
   }
   lines.push('');
  }
 }
}
lines.push('---','','Field definitions / определений полей: '+total+'.','');
const text=lines.join('\n');
const out=new URL('../docs/FIELDS.md',import.meta.url);
if(process.argv.includes('--check')){
 if(readFileSync(out,'utf8').replace(/\r\n/g,'\n')!==text)throw new Error('Stale FIELDS.md: run npm run docs:generate');
 console.log(`Field documentation current: ${total} definitions, EN/RU`);
} else {writeFileSync(out,text);console.log(`Generated ${total} field definitions, EN/RU`);}
