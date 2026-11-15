import {TASA_AUDIO, volumenPista} from './audio-pistas.js?v=5.8.0';

const INSTRUMENTOS_GRABADOS = new Set(['guitarra', 'guitarraAcero', 'guitarraElectrica', 'piano']);
const RAIZ = new URL('../../muestras/', import.meta.url);
const bancos = new Map();
let pedidoCatalogo;
let lector;

async function solicitar(ruta) {
    const respuesta = await fetch(new URL(ruta, RAIZ), {signal: AbortSignal.timeout(6000)});
    if (!respuesta.ok) throw new Error('No se pudo cargar el banco de notas ' + ruta + '.');
    return respuesta;
}

function cargarBanco(instrumento) {
    if (!bancos.has(instrumento)) {
        const pedido = (async () => {
            pedidoCatalogo ??= solicitar('catalogo.json?v=5.8.0').then(respuesta => respuesta.json()).catch(error => {
                pedidoCatalogo = undefined;
                throw error;
            });
            const catalogo = await pedidoCatalogo;
            const {archivo, tasa, muestrasPorNota, midi} = catalogo[instrumento];
            const respuesta = await solicitar(archivo);
            lector ??= new OfflineAudioContext(1, 1, tasa);
            const audio = await lector.decodeAudioData(await respuesta.arrayBuffer());
            return {datos: audio.getChannelData(0), tasa: audio.sampleRate, muestrasPorNota, midi};
        })().catch(error => {
            bancos.delete(instrumento);
            throw error;
        });
        bancos.set(instrumento, pedido);
    }
    return bancos.get(instrumento);
}

function intervalo(semitonos) {
    return globalThis.Tone?.intervalToFrequencyRatio?.(semitonos) ?? 2 ** (semitonos / 12);
}

function recorte(banco, midi) {
    let indice = 0;
    for (let i = 1; i < banco.midi.length; i++) {
        if (Math.abs(midi - banco.midi[i]) < Math.abs(midi - banco.midi[indice])) indice = i;
    }
    const inicio = indice * banco.muestrasPorNota;
    return {inicio, fin: Math.min(banco.datos.length, inicio + banco.muestrasPorNota),
        paso: intervalo(midi - banco.midi[indice]) * banco.tasa / TASA_AUDIO};
}

export function precargarMuestras(mezcla) {
    const instrumentos = new Set(mezcla.pistas.map(pista => pista.instrumento));
    for (const instrumento of instrumentos) {
        if (INSTRUMENTOS_GRABADOS.has(instrumento)) cargarBanco(instrumento).catch(() => {});
    }
}

export function prepararMuestras({pistas, mezcla}, signal) {
    return Promise.all(pistas.map(async (eventos, i) => {
        const instrumento = mezcla.pistas[i].instrumento;
        if (!eventos.length || !volumenPista(mezcla, i) || !INSTRUMENTOS_GRABADOS.has(instrumento)) return null;
        const banco = await cargarBanco(instrumento);
        signal?.throwIfAborted();
        return {datos: banco.datos, notas: eventos.map(evento => recorte(banco, evento.midi))};
    }));
}

export async function notaGrabada(contexto, instrumento, midi, nivel) {
    if (!INSTRUMENTOS_GRABADOS.has(instrumento)) return null;
    const banco = await cargarBanco(instrumento);
    const {inicio, fin, paso} = recorte(banco, midi);
    const longitud = Math.round(.75 * TASA_AUDIO);
    const buffer = contexto.createBuffer(1, longitud, TASA_AUDIO), datos = buffer.getChannelData(0);
    for (let i = 0, posicion = inicio; i < longitud && posicion < fin - 1; i++, posicion += paso) {
        const j = Math.floor(posicion), f = posicion - j;
        const envolvente = Math.min(1, i / 150, (longitud - i - 1) / 2200);
        datos[i] = (banco.datos[j] * (1 - f) + banco.datos[j + 1] * f) * nivel * .52 * envolvente;
    }
    return buffer;
}
