// Auditoría WCAG 2.2 de contraste sobre los tokens reales de global.css.
const hex = (h) => [1,3,5].map(i => parseInt(h.slice(i,i+2),16)/255);
const lin = (c) => c <= 0.03928 ? c/12.92 : ((c+0.055)/1.055)**2.4;
const lum = (h) => { const [r,g,b] = hex(h).map(lin); return 0.2126*r + 0.7152*g + 0.0722*b; };
const ratio = (a,b) => { const [x,y] = [lum(a),lum(b)].sort((p,q)=>q-p); return (x+0.05)/(y+0.05); };

const themes = {
  light: { bg:'#fafafa', surface:'#ffffff', 'surface-muted':'#eaedf2', border:'#e9e9eb',
           'border-strong':'#8a8a8f',
           primary:'#0f766e', 'primary-hover':'#115e59', 'primary-fg':'#ffffff',
           accent:'#0369a1', fg:'#0f172a', 'fg-muted':'#475569' },
  dark:  { bg:'#0b1220', surface:'#111a2b', 'surface-muted':'#1a2438', border:'#243049',
           'border-strong':'#5b6b8c',
           primary:'#2dd4bf', 'primary-hover':'#5eead4', 'primary-fg':'#04211f',
           accent:'#38bdf8', fg:'#eaedf2', 'fg-muted':'#a3aec2' },
};

// Combinaciones que el código realmente usa, con su requisito.
// AA: texto normal 4.5 · texto grande (>=18.66px bold o >=24px) 3.0 · gráficos/UI 3.0
const pairs = [
  ['fg',          'bg',            4.5, 'texto principal sobre página'],
  ['fg',          'surface',       4.5, 'texto en tarjetas'],
  ['fg',          'surface-muted', 4.5, 'texto en banda alterna'],
  ['fg-muted',    'bg',            4.5, 'texto secundario sobre página'],
  ['fg-muted',    'surface',       4.5, 'texto secundario en tarjetas'],
  ['fg-muted',    'surface-muted', 4.5, 'texto secundario en banda alterna'],
  ['primary-fg',  'primary',       4.5, 'texto del botón CTA'],
  ['primary-fg',  'primary-hover', 4.5, 'texto del botón CTA en hover'],
  ['accent',      'bg',            4.5, 'links y eyebrow sobre página'],
  ['accent',      'surface',       4.5, 'links en tarjetas'],
  ['accent',      'surface-muted', 4.5, 'links en banda alterna'],
  ['primary',     'surface',       4.5, 'TEXTO en primary (sidebar activo)'],
  ['primary',     'bg',            3.0, 'iconos en primary (gráfico)'],
  // WCAG 1.4.11 (non-text contrast) pide 3:1 al LÍMITE DE UN CONTROL.
  ['border-strong','bg',            3.0, 'borde de input contra su relleno'],
  ['border-strong','surface',       3.0, 'borde de input contra la tarjeta'],
  // `border` es decorativo (separadores, bordes de tarjeta): 1.4.11 no aplica.
  ['border',      'bg',            1.0, 'borde decorativo (exento de 1.4.11)'],
];

let fails = [];
for (const [theme, t] of Object.entries(themes)) {
  console.log(`\n=== tema ${theme} ===`);
  for (const [fgKey, bgKey, req, label] of pairs) {
    const r = ratio(t[fgKey], t[bgKey]);
    const ok = r >= req;
    if (!ok && req >= 3.0) fails.push({ theme, fgKey, bgKey, r, req, label });
    console.log(`  ${ok ? '✓' : '✗'} ${r.toFixed(2).padStart(5)}:1  (min ${req})  ${fgKey} / ${bgKey}  — ${label}`);
  }
}
console.log(`\n${fails.length === 0 ? '✓ sin fallos AA' : `✗ ${fails.length} fallo(s) AA:`}`);
for (const f of fails) console.log(`   ${f.theme}: ${f.fgKey} sobre ${f.bgKey} = ${f.r.toFixed(2)}:1 (necesita ${f.req}) — ${f.label}`);
