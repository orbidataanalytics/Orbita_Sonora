import {aHz, TASA_AUDIO, volumenPista} from './audio-pistas.js';

const INSTRUMENTOS_GRABADOS = new Set(['guitarra', 'guitarraAcero', 'guitarraElectrica', 'piano']);
const RAIZ = new URL('../../muestras/', import.meta.url);
const bancos = new Map();
const LIBERACION = .045;

async function solicitarArchivo(ruta) {
    const respuesta = await fetch(new URL(ruta, RAIZ), {signal: AbortSignal.timeout(15000)});
    if (!respuesta.ok) throw new Error('No se pudo cargar el archivo instrumental ' + ruta + '.');
    return respuesta;
}

function cargarBanco(instrumento) {
    if (!bancos.has(instrumento)) {
        const tarea = (async () => {
            const catalogo = await (await solicitarArchivo('catalogo.json')).json();
            const lector = new OfflineAudioContext(1, 1, TASA_AUDIO);
            const notas = await Promise.all(Object.entries(catalogo[instrumento]).map(async ([midi, {archivo}]) => {
                const datos = await (await solicitarArchivo(archivo)).arrayBuffer();
                return [midi, await lector.decodeAudioData(datos)];
            }));
            return Object.fromEntries(notas);
        })().catch(error => {
            bancos.delete(instrumento);
            throw error;
        });
        bancos.set(instrumento, tarea);
    }
    return bancos.get(instrumento);
}

async function interpretar(instrumento, eventos, duracion, signal) {
    const Tone = globalThis.Tone;
    if (!Tone?.Sampler) throw new Error('No se pudo cargar Tone.js para reproducir las notas grabadas.');
    const urls = await cargarBanco(instrumento);
    signal?.throwIfAborted();
    const longitud = Math.max(1, Math.ceil(duracion * TASA_AUDIO));
    const contexto = new Tone.OfflineContext(new OfflineAudioContext(1, longitud, TASA_AUDIO));
    const sampler = new Tone.Sampler({
        urls, context: contexto, attack: .006, release: LIBERACION, curve: 'linear',
    }).toDestination();
    try {
        for (const {midi, desde, hasta} of eventos) {
            sampler.triggerAttackRelease(aHz(midi), Math.max(.018, hasta - desde - LIBERACION), desde, 1);
        }
        const audio = await contexto.render();
        signal?.throwIfAborted();
        return audio.getChannelData(0).slice();
    } finally {
        sampler.dispose();
        contexto.dispose();
    }
}

export async function prepararMuestras({pistas, duracion, mezcla}, signal) {
    return Promise.all(pistas.map((eventos, i) => {
        const instrumento = mezcla.pistas[i].instrumento;
        return eventos.length && volumenPista(mezcla, i) && INSTRUMENTOS_GRABADOS.has(instrumento)
            ? interpretar(instrumento, eventos, duracion, signal) : null;
    }));
}

export async function notaGrabada(contexto, instrumento, midi, nivel) {
    if (!INSTRUMENTOS_GRABADOS.has(instrumento)) return null;
    const duracion = .75;
    const datos = await interpretar(instrumento, [{midi, desde: 0, hasta: duracion}], duracion);
    const buffer = contexto.createBuffer(1, datos.length, TASA_AUDIO);
    buffer.copyToChannel(datos.map(valor => valor * .52 * nivel), 0);
    return buffer;
}
