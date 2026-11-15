import {readFileSync, writeFileSync} from 'node:fs';
globalThis.document = {querySelector: () => null};
globalThis.location = {hostname: 'localhost', origin: 'http://localhost'};
const R = process.argv[2] + '/web/js/';
const {SecuenciaSonora} = await import(R + 'visor/sonificacion.js');
const {ArregloMusical, opcionesPartitura, nombreAfinado} = await import(R + 'visor/arreglo.js');
const {mezclaInicial} = await import(R + 'visor/audio-pistas.js');
const imgs = JSON.parse(readFileSync('imagenes.json'));
const it = imgs.find(i => i.svs === 5669);
const fot = lado => ({data: new Uint8ClampedArray(Buffer.from(it.grids[lado], 'base64')), width: lado, height: lado});
const out = {};
for (const rec of ['filas', 'hilbert']) {
  const s = new SecuenciaSonora({tipo: 'imagen', titulo: it.titulo}, {fotogramas: [fot(32)], duracion: 24}, 32, rec, {modo: 'alfa'}, 5);
  const a = new ArregloMusical(s, opcionesPartitura(), mezclaInicial());
  out[rec] = {unidad: a.unidad, duracion: a.duracion, coordenadas: s.coordenadas,
    pistas: a.pistas.map(p => p.eventos.map(e => [e.inicio, e.duracion, e.nota, +e.velocidad.toFixed(3), nombreAfinado(e.nota)])),
    armonia: a.armonia.map(z => [z.desde, z.hasta, z.nombre]),
    sonoras: Array.from(s.intensidadesSonoras), propias: Array.from(s.intensidades), contrastes: Array.from(s.contrastes)};
}
// máscara de 5533
const it2 = imgs.find(i => i.svs === 5533);
const s2 = new SecuenciaSonora({tipo: 'imagen', titulo: ''}, {fotogramas: [{data: new Uint8ClampedArray(Buffer.from(it2.grids[32], 'base64')), width: 32, height: 32}], duracion: 24}, 32, 'filas', {modo: 'alfa'}, 1);
out.mascara5533 = Array.from(s2.validez);
// zonas para 5669
out.zonas = {};
for (const z of [1, 5, 9, 21]) {
  const s = new SecuenciaSonora({tipo: 'imagen', titulo: ''}, {fotogramas: [fot(32)], duracion: 24}, 32, 'filas', {modo: 'alfa'}, z);
  out.zonas[z] = {rgb: Array.from(s.intensidadesSonoras), contraste: Array.from(s.contrastes)};
}
writeFileSync('datos5669.json', JSON.stringify(out));
console.log(out.hilbert.pistas.map(p => p.length), out.mascara5533.reduce((a, b) => a + b));
