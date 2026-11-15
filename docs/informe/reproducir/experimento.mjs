import {readFileSync, writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
globalThis.document = {querySelector: () => null};
globalThis.location = {hostname: 'localhost', origin: 'http://localhost'};
const R = process.argv[2] + '/web/js/';
const {SecuenciaSonora, BANDAS} = await import(R + 'visor/sonificacion.js');
const {ArregloMusical, opcionesPartitura} = await import(R + 'visor/arreglo.js');
const {MusicXML} = await import(R + 'visor/musicxml.js');
const {mezclaInicial, renderizarArreglo} = await import(R + 'visor/audio-pistas.js');
const {coordenadasRecorrido, NOMBRES_RECORRIDO} = await import(R + 'recorridos.js');
const {calcularInforme} = await import(R + 'estadisticas.js');

const imgs = JSON.parse(readFileSync('imagenes.json'));
const fot = (it, lado) => ({data: new Uint8ClampedArray(Buffer.from(it.grids[lado], 'base64')), width: lado, height: lado});
const medio = it => ({tipo: 'imagen', titulo: it.titulo});
const sec = (it, lado = 32, rec = 'filas', zona = 5, dur = 24, esc = 'logaritmica') =>
  new SecuenciaSonora(medio(it), {fotogramas: [fot(it, lado)], duracion: dur}, lado, rec, {modo: 'alfa'}, zona, esc);
const opciones = opcionesPartitura(), mezcla = mezclaInicial();
const brillo = (s, i) => { const r = s.intensidadesSonoras; return (r[3*i] + 2*r[3*i+1] + r[3*i+2]) / 4; };
const media = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
function autocorr(v) { const m = media(v); let n = 0, d = 0; for (let i = 0; i < v.length; i++) { d += (v[i]-m)**2; if (i) n += (v[i]-m)*(v[i-1]-m); } return d ? n / d : 0; }

const res = {imagenes: [], recorridos: {}, rendimiento: [], zonas: [], escalas: {}};
// 1. métricas por imagen (configuración por defecto de la web)
const acordes = {};
for (const it of imgs) {
  const s = sec(it); const t0 = performance.now();
  const a = new ArregloMusical(s, opciones, mezcla); const tArr = performance.now() - t0;
  const pistas = a.pistas.map(p => {
    const notas = p.eventos.map(e => e.nota);
    const saltos = notas.slice(1).map((n, i) => Math.abs(n - notas[i]));
    const trastes = p.eventos.map(e => e.posicion?.traste ?? 0);
    const dyn = {}; p.compases.forEach(c => { if (c.dinamica) dyn[c.dinamica] = (dyn[c.dinamica] || 0) + 1; });
    return {canal: 'RGB'[p.canal], notas: notas.length, min: Math.min(...notas), max: Math.max(...notas),
      distintas: new Set(notas).size, salto_medio: +media(saltos).toFixed(2), traste_max: Math.max(...trastes),
      subdivididas: p.eventos.filter(e => e.duracion < a.paso).length, dinamicas: dyn};
  });
  a.armonia.forEach(z => { if (z.intensidad.some(Boolean)) acordes[z.nombre] = (acordes[z.nombre] || 0) + 1; });
  const enAcorde = a.pistas.flatMap(p => p.eventos).filter(e => a.armonia.find(z => z.desde <= e.inicio && e.inicio < z.hasta).clases.includes(e.nota % 12)).length;
  const total = a.pistas.reduce((x, p) => x + p.eventos.length, 0);
  const t1 = performance.now();
  const audio = renderizarArreglo({pistas: a.eventosAudio(), duracion: a.duracion, mezcla,
    lectura: {intensidades: s.intensidadesSonoras, validez: s.validez, duracion: s.duracion_s}});
  const tAud = performance.now() - t1;
  const inf = calcularInforme({pixeles: s.pixeles, rgb_base64: Buffer.from(s.intensidades).toString('base64'),
    activos_base64: Buffer.from(s.actividad).toString('base64'), validez_base64: Buffer.from(s.validez).toString('base64')}, 8, []);
  const xml = new MusicXML(a).exportar();
  const rms = Math.sqrt(media(Array.from(audio.canales[0], x => x*x)));
  let pico = 0; for (const x of audio.canales[0]) pico = Math.max(pico, Math.abs(x));
  res.imagenes.push({svs: it.svs, titulo: it.titulo, ancho: it.ancho, alto: it.alto, validos: s.validos,
    compases: a.compases, duracion_s: +a.duracion.toFixed(3), acordes_distintos: new Set(a.armonia.map(z => z.nombre)).size,
    notas_total: total, pct_notas_en_acorde: +(100 * enAcorde / total).toFixed(2), pistas,
    firmas_8: inf.firmas.length, firma_top_pct: +inf.firmas[0].porcentaje.toFixed(2),
    estad: Object.fromEntries(Object.entries(inf.estadisticas).map(([k, v]) => [k, {media: +v.media.toFixed(1), sd: +v.desviacion_poblacional.toFixed(1)}])),
    contraste_medio: +media(Array.from(s.contrastes)).toFixed(2),
    t_arreglo_ms: +tArr.toFixed(1), t_audio_ms: +tAud.toFixed(1), musicxml_kb: +(xml.length / 1024).toFixed(1),
    audio_rms: +rms.toFixed(4), audio_pico: +pico.toFixed(4)});
  if (it.svs === 5313) {
    for (const rec of ['filas', 'hilbert']) {
      const s2 = sec(it, 32, rec); const a2 = new ArregloMusical(s2, opciones, mezcla);
      const au = renderizarArreglo({pistas: a2.eventosAudio(), duracion: a2.duracion, mezcla,
        lectura: {intensidades: s2.intensidadesSonoras, validez: s2.validez, duracion: s2.duracion_s}});
      writeFileSync(`audio_5313_${rec}.f32`, Buffer.from(au.canales[0].buffer));
      writeFileSync(`notas_5313_${rec}.json`, JSON.stringify({unidad: a2.unidad, duracion: a2.duracion,
        pistas: a2.pistas.map(p => p.eventos.map(e => [e.inicio, e.duracion, e.nota, +e.velocidad.toFixed(3)])),
        armonia: a2.armonia.map(z => [z.desde, z.hasta, z.nombre])}));
    }
    const s3 = sec(it, 32, 'filas', 1);
    writeFileSync('rgb_5313.json', JSON.stringify({propios: Array.from(s3.intensidades), zona5: Array.from(s.intensidadesSonoras), contraste: Array.from(s.contrastes)}));
  }
}
res.acordes = acordes;
// 2. recorridos: localidad geométrica y suavidad
for (const rec of Object.keys(NOMBRES_RECORRIDO)) {
  const c = coordenadasRecorrido(32, rec);
  const pasos = c.slice(1).map(([x, y], i) => Math.hypot(x - c[i][0], y - c[i][1]));
  const fila = {paso_medio: +media(pasos).toFixed(3), pct_unitarios: +(100 * pasos.filter(p => p === 1).length / pasos.length).toFixed(1),
    paso_max: +Math.max(...pasos).toFixed(2), autocorr: [], delta_brillo: [], salto_melodico: [], notas_G: []};
  for (const it of imgs) {
    const s = sec(it, 32, rec, 1);
    const b = Array.from({length: s.pixeles}, (_, i) => brillo(s, i));
    fila.autocorr.push(autocorr(b));
    fila.delta_brillo.push(media(b.slice(1).map((v, i) => Math.abs(v - b[i]))));
    const a = new ArregloMusical(sec(it, 32, rec, 5), opciones, mezcla);
    const n = a.pistas[1].eventos.map(e => e.nota);
    fila.salto_melodico.push(media(n.slice(1).map((v, i) => Math.abs(v - n[i]))));
    fila.notas_G.push(n.length);
  }
  for (const k of ['autocorr', 'delta_brillo', 'salto_melodico', 'notas_G']) {
    const v = fila[k]; fila[k + '_media'] = +media(v).toFixed(3);
    fila[k + '_sd'] = +Math.sqrt(media(v.map(x => (x - media(v)) ** 2))).toFixed(3);
  }
  fila.autocorr = fila.autocorr.map(x => +x.toFixed(3));
  res.recorridos[rec] = fila;
}
// 3. rendimiento por tamaño de cuadrícula (mediana de 5)
for (const lado of [8, 16, 32, 64, 128]) {
  const ts = {sec: [], arr: [], aud: []};
  for (let k = 0; k < 5; k++) for (const it of imgs.slice(0, 3)) {
    let t = performance.now(); const s = sec(it, lado, lado >= 8 ? 'hilbert' : 'filas'); ts.sec.push(performance.now() - t);
    t = performance.now(); const a = new ArregloMusical(s, opciones, mezcla); ts.arr.push(performance.now() - t);
    if (k === 0) { t = performance.now(); renderizarArreglo({pistas: a.eventosAudio(), duracion: a.duracion, mezcla,
      lectura: {intensidades: s.intensidadesSonoras, validez: s.validez, duracion: s.duracion_s}}); ts.aud.push(performance.now() - t); }
  }
  const med = v => { v.sort((a, b) => a - b); return +v[Math.floor(v.length / 2)].toFixed(2); };
  res.rendimiento.push({lado, celdas: lado * lado, ms_celda: +(24 / lado ** 2 * 1000).toFixed(2), secuencia_ms: med(ts.sec), arreglo_ms: med(ts.arr), audio_ms: med(ts.aud)});
}
// 4. efecto del tamaño de zona sobre la textura y las notas
for (const zona of [1, 3, 5, 7, 9, 15, 21]) {
  const sub = [], cont = [], notas = [];
  for (const it of imgs) { const s = sec(it, 32, 'filas', zona); const a = new ArregloMusical(s, opciones, mezcla);
    cont.push(media(Array.from(s.contrastes))); notas.push(a.pistas.reduce((x, p) => x + p.eventos.length, 0));
    sub.push(100 * a.pistas[1].eventos.filter(e => e.duracion < a.paso).length / Math.max(1, a.pistas[1].eventos.length)); }
  res.zonas.push({zona, contraste: +media(cont).toFixed(2), notas: +media(notas).toFixed(1), pct_subdiv_G: +media(sub).toFixed(1)});
}
// 5. escalas de frecuencia
res.escalas = Object.fromEntries(['logaritmica', 'lineal'].map(e => [e, sec(imgs[1], 32, 'filas', 1, 24, e).tablas.map(t => Array.from(t))]));
res.bandas = BANDAS;
writeFileSync('resultados.json', JSON.stringify(res, null, 1));
console.log(JSON.stringify({imagenes: res.imagenes.map(i => ({svs: i.svs, compases: i.compases, notas: i.notas_total, enacorde: i.pct_notas_en_acorde, acordes: i.acordes_distintos, firmas: i.firmas_8, tA: i.t_arreglo_ms, tAu: i.t_audio_ms})), acordes, rec: Object.fromEntries(Object.entries(res.recorridos).map(([k, v]) => [k, [v.paso_medio, v.pct_unitarios, v.autocorr_media, v.delta_brillo_media, v.salto_melodico_media, v.notas_G_media]])), rend: res.rendimiento, zonas: res.zonas}, null, 0));
