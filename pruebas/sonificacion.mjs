import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

globalThis.document = {querySelector: () => null};
globalThis.location = {hostname: 'localhost', origin: 'http://localhost'};
const {SecuenciaSonora, BANDAS} = await import('../web/js/visor/sonificacion.js');
const {ArregloMusical, opcionesPartitura, TONALIDADES, AFINACIONES} = await import('../web/js/visor/arreglo.js');
const {MusicXML} = await import('../web/js/visor/musicxml.js');
const {mezclaInicial, espacioPixel, renderizarArreglo} = await import('../web/js/visor/audio-pistas.js');
const {coordenadasRecorrido} = await import('../web/js/recorridos.js');
const {coleccionMarcas} = await import('../web/js/visor/marcas-sig.js');
const {calcularInforme} = await import('../web/js/estadisticas.js');

const lado = 16;
const data = new Uint8ClampedArray(lado ** 2 * 4);
for (let i = 0; i < lado ** 2; i++) data.set([180, i, 255 - i, 255], 4 * i);
const fotograma = {data, width: lado, height: lado};
const opciones = opcionesPartitura();
const medio = {tipo: 'video', titulo: 'Matriz de prueba'};
const crear = (recorrido, zona, duracion = 3) => new SecuenciaSonora(medio, {
    fotogramas: [fotograma], duracion, inicio: 20, velocidad: 2,
}, lado, recorrido, {modo: 'alfa'}, zona);
const filas = crear('filas', 1);
const hilbert = crear('hilbert', 1);
const serpentina = crear('serpentina', 3);
const radial = crear('radial', 3);
const zigzag = crear('zigzag', 3);
for (const s of [filas, hilbert, serpentina, radial, zigzag]) {
    assert.equal(new Set(s.coordenadas.map(x => x.join(','))).size, lado ** 2);
    assert(s.partituraDatos().bandas.G.eventos.some(e => e[3] > 0));
    for (let c = 0; c < 3; c++) {
        const {min_hz, max_hz} = BANDAS[c];
        const alturas = s.tablas[c];
        assert.equal(alturas[0], 0);
        assert.equal(alturas[1], min_hz);
        assert.equal(alturas[255], max_hz);
        assert(alturas.every((hz, j) => j === 0 || hz > alturas[j - 1]));
    }
}
assert.deepEqual(filas.coordenadas.slice(lado, lado + 2), [[0, 1], [1, 1]]);
assert.deepEqual(serpentina.coordenadas.slice(lado, lado + 2), [[lado - 1, 1], [lado - 2, 1]]);
assert.deepEqual(filas.firma(0), filas.firmaSonora(0));
for (const tamano of [8, 16, 32, 64, 128]) {
    const puntos = coordenadasRecorrido(tamano, 'hilbert');
    assert.equal(new Set(puntos.map(x => x.join(','))).size, tamano ** 2);
    assert(puntos.every(([x, y], i) => !i || Math.abs(puntos[i - 1][0] - x) + Math.abs(puntos[i - 1][1] - y) === 1));
}
assert.throws(() => coordenadasRecorrido(3, 'hilbert'), /potencia de dos/);
assert.notDeepEqual(radial.coordenadas, zigzag.coordenadas);
assert.notDeepEqual(serpentina.intensidadesSonoras, crear('serpentina', 1).intensidadesSonoras);
const plano = new Uint8ClampedArray(3 ** 2 * 4);
for (let i = 0; i < 9; i++) plano.set([0, 0, 0, 255], i * 4);
plano.set([100, 50, 20, 255], 4 * 4);
const exacta = new SecuenciaSonora(medio, {duracion: 1, fotogramas: [{data: plano,width: 3,height: 3}]}, 3, 'radial', {}, 3);
assert.deepEqual(exacta.firmaSonora(0), [70, 35, 14]);

const mezcla = mezclaInicial();
const arregloGuitarra = new ArregloMusical(filas, opciones, mezcla);
const mezclaPiano = {...mezcla, pistas: mezcla.pistas.map((pista, i) => i === 1 ? {...pista, instrumento: 'piano'} : pista)};
const arregloPiano = new ArregloMusical(filas, opciones, mezclaPiano);
assert(arregloGuitarra.pistas[1].eventos.every(nota => nota.posicion?.traste <= 7));
assert.equal(arregloPiano.pistas[1].afinacion, null);
assert(arregloPiano.eventosAudio(1).length && arregloPiano.eventosAudio(1).every(nota => nota.timbre === 'piano'));
assert.deepEqual(arregloPiano.eventosAudio(0), arregloGuitarra.eventosAudio(0));
assert.deepEqual(arregloPiano.eventosAudio(2), arregloGuitarra.eventosAudio(2));
assert(new MusicXML(arregloPiano).exportar({canal: '1'}).includes('<midi-program>1</midi-program>'));
const audioGuitarra = renderizarArreglo({pistas: arregloGuitarra.eventosAudio(), duracion: arregloGuitarra.duracion, mezcla});
const audioPiano = renderizarArreglo({pistas: arregloPiano.eventosAudio(), duracion: arregloPiano.duracion, mezcla: mezclaPiano});
assert(audioGuitarra.canales[0].some((nivel, i) => Math.abs(nivel - audioPiano.canales[0][i]) > .03));
assert.equal(opciones.bpm, 68);
assert.equal(opciones.figura, 'zonal');
assert(exacta.contrastes[0] > 0);
assert.equal(Math.max(...filas.contrastes), 0);

const mosaico = new Uint8ClampedArray(lado ** 2 * 4);
for (let i = 0; i < lado ** 2; i++) {
    const y = Math.floor(i / lado);
    const textura = y >= lado / 2 && i % 2 === 0;
    mosaico.set(textura ? [230, 15, 10, 255] : [38, 40, 142, 255], i * 4);
}
const escena = new SecuenciaSonora(medio, {duracion: 16, fotogramas: [{data: mosaico, width: lado, height: lado}]},
    lado, 'filas', {}, 5);
const zonal = new ArregloMusical(escena, opciones, mezcla);
const pulsos = zonal.pistas[1].eventos;
assert(pulsos.some(e => e.duracion === 2) && pulsos.some(e => e.duracion === 4));
assert(pulsos.some(e => e.posicion.cuerda <= 3) && pulsos.some(e => e.posicion.cuerda >= 4));
assert(new Set(zonal.armonia.filter(a => a.intensidad.some(Boolean)).map(a => a.nombre)).size > 1);
const rojo = new Uint8ClampedArray(lado ** 2 * 4);
for (let i = 0; i < lado ** 2; i++) rojo.set([200, 0, 0, 255], i * 4);
const escenaRoja = new SecuenciaSonora(medio, {duracion: 4, fotogramas: [{data: rojo, width: lado, height: lado}]},
    lado, 'filas', {}, 5);
const separado = new ArregloMusical(escenaRoja, opciones, mezcla);
assert(separado.pistas[0].eventos.length);
assert(separado.pistas.slice(1).every(p => !p.eventos.length));
assert(mezcla.pistas.every(p => p.instrumento === 'guitarra'));
const voz = zonal.vozCantante();
for (const e of voz.compases.flatMap(c => c.eventos).filter(e => e.nota !== null)) {
    const armonia = zonal.armonia.find(a => a.desde <= e.inicio && e.inicio < a.hasta);
    assert(armonia.clases.includes(e.nota % 12));
    assert(e.nota >= 57 && e.nota <= 72);
}
assert.equal(zonal.eventosAudio().length, 3);
const conVoz = new MusicXML(zonal, voz);
assert(conVoz.exportar().includes('<part id="P4">'));
assert(!conVoz.exportar().includes('<fret>'));
assert(conVoz.exportar({canal: 'guitarra-voz'}).includes('<fret>'));
for (const tonica of Object.keys(TONALIDADES)) {
    for (const modo of ['mayor', 'menor']) {
        for (const afinacion of Object.keys(AFINACIONES).filter(a => a !== 'bajo')) {
            const config = {...opciones, tonica, modo, afinacion, alturas: 7, nivel: 'inicial'};
            const arreglo = new ArregloMusical(serpentina, config, mezcla);
            for (const pista of arreglo.pistas.filter(p => p.afinacion)) {
                assert(pista.eventos.length && pista.eventos.every(e => e.posicion?.traste <= 5));
            }
            assert(arreglo.pistas[2].eventos.length);
            for (const pista of arreglo.pistas) for (const nota of pista.eventos) {
                const acorde = arreglo.armonia.find(a => a.desde <= nota.inicio && nota.inicio < a.hasta);
                assert(acorde.clases.includes(nota.nota % 12));
                assert(nota.inicio + nota.duracion <= acorde.hasta);
            }
            for (const pista of arreglo.pistas) for (const compas of pista.compases) {
                assert.equal(compas.eventos.reduce((s, e) => s + e.duracion, 0), arreglo.unidadesCompas);
            }
            const xml = new MusicXML(arreglo).exportar();
            assert(xml.includes('<part id="P3">') && !xml.includes('<fret>'));
            assert(new MusicXML(arreglo).exportar({canal: '1'}).includes('<fret>'));
        }
    }
}
const audio = secuencia => {
    const arreglo = new ArregloMusical(secuencia, opciones, mezcla);
    const progresos = [];
    const lectura = {intensidades: secuencia.intensidadesSonoras, validez: secuencia.validez, duracion: secuencia.duracion_s};
    const {canales} = renderizarArreglo({pistas: arreglo.eventosAudio(), duracion: arreglo.duracion, mezcla, lectura}, n => progresos.push(n));
    assert(progresos.length > 2 && progresos.at(-1) === 1);
    assert(canales[0].some(x => Math.abs(x) > .01));
    return createHash('sha256').update(Buffer.from(canales[0].buffer)).digest('hex');
};
assert.notEqual(audio(serpentina), audio(radial));
assert.notEqual(audio(filas), audio(hilbert));
assert.notEqual(audio(serpentina), audio(crear('serpentina', 15)));
assert.notEqual(audio(serpentina), audio(crear('serpentina', 3, 2)));
const reverberante = {...mezcla, reverb: .4};
assert(espacioPixel(0, 0, reverberante).wet > espacioPixel(.5, .5, reverberante).wet);
const geo = {tipo: 'punto', coordenadas: [-75.56, 6.25]};
const marca = coleccionMarcas(serpentina, geo, [{indice: 64, tiempo: 1.25}]).features[0];
assert.deepEqual(marca.geometry.coordinates, geo.coordenadas);
assert.equal(marca.properties.video_s, 22.5);
const b64 = valores => Buffer.from(valores).toString('base64');
const informe = calcularInforme({
    pixeles: serpentina.pixeles, rgb_base64: b64(serpentina.intensidades),
    activos_base64: b64(serpentina.actividad), validez_base64: b64(serpentina.validez),
}, 8, []);
assert(informe.firmas.length > 6);
assert(Math.abs(informe.firmas.reduce((s, f) => s + f.porcentaje, 0) - 100) < 1e-6);
console.log('OK 70/30, recorridos, video y GeoJSON, escalas y digitación, partituras, audio y ocupación.');
