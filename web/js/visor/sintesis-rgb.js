import {espacioPixel, volumenPista} from './audio-pistas.js';

const TASA = 48000;

function crearPista(Tone, contexto, salida, reverb, volumen, frecuencia, plano) {
    const oscilador = new Tone.Oscillator({context: contexto, type: 'sine', frequency: frecuencia});
    const nivel = new Tone.Gain({context: contexto, gain: 0});
    const panorama = new Tone.Panner({context: contexto});
    const filtro = plano ? new Tone.Filter({context: contexto, type: 'lowpass'}) : null;
    const seco = new Tone.Gain({context: contexto, gain: 1});
    const envio = reverb ? new Tone.Gain({context: contexto, gain: 0}) : null;
    oscilador.connect(nivel);
    if (filtro) {
        nivel.connect(filtro);
        filtro.connect(panorama);
    } else nivel.connect(panorama);
    panorama.connect(seco);
    seco.connect(salida);
    if (envio) {
        panorama.connect(envio);
        envio.connect(reverb);
    }
    oscilador.start(0);
    return {oscilador, nivel, panorama, seco, envio, filtro, volumen, frecuencia, amplitud: 0};
}

function impulso(contexto) {
    const n = Math.round(.32 * TASA), buffer = contexto.createBuffer(2, n, TASA);
    let semilla = 127432;
    for (let canal = 0; canal < 2; canal++) {
        const muestras = buffer.getChannelData(canal);
        for (let i = 480; i < n; i++) {
            semilla = (Math.imul(1664525, semilla) + 1013904223) | 0;
            muestras[i] = semilla / 2147483648 * (1 - i / n) ** 4;
        }
    }
    return buffer;
}

function programarCelda(pista, hz, intensidad, siguiente, inicio, fin, espacio) {
    if (hz && hz !== pista.frecuencia) {
        pista.oscilador.frequency.setValueAtTime(hz, inicio);
        pista.frecuencia = hz;
    }
    const amplitud = .30 * pista.volumen * intensidad / 255;
    const borde = Math.min(.00065, (fin - inicio) / 8);
    const ganancia = pista.nivel.gain;
    if (amplitud !== pista.amplitud) {
        ganancia.setValueAtTime(pista.amplitud, inicio);
        ganancia.linearRampToValueAtTime(amplitud, inicio + borde);
    }
    if (amplitud && !siguiente) {
        ganancia.setValueAtTime(amplitud, fin - borde);
        ganancia.linearRampToValueAtTime(0, fin);
        pista.amplitud = 0;
    } else pista.amplitud = amplitud;
    if (espacio.pan !== pista.pan) {
        pista.panorama.pan.setValueAtTime(espacio.pan, inicio);
        pista.pan = espacio.pan;
    }
    if (pista.envio && espacio.wet !== pista.wet) {
        pista.seco.gain.setValueAtTime(1 - espacio.wet, inicio);
        pista.envio.gain.setValueAtTime(espacio.wet, inicio);
        pista.wet = espacio.wet;
    }
    if (pista.filtro && espacio.corte !== pista.corte) {
        pista.filtro.frequency.setValueAtTime(espacio.corte, inicio);
        pista.corte = espacio.corte;
    }
}

export async function renderizarRGB({intensidades, tablas, coordenadas, lado, duracion, mezcla}, avance = () => {}, signal) {
    const Tone = globalThis.Tone;
    if (!Tone?.OfflineContext) throw new Error('No se pudo cargar Tone.js para la síntesis RGB.');
    const muestras = Math.max(1, Math.ceil(duracion * TASA));
    const contexto = new Tone.OfflineContext(new OfflineAudioContext(2, muestras, TASA));
    const salida = new Tone.Gain({context: contexto, gain: 1}).toDestination();
    const reverb = mezcla.reverb > 0 ? new Tone.Convolver({context: contexto, url: impulso(contexto)}).connect(salida) : null;
    const pistas = mezcla.pistas.map((_, canal) => {
        const volumen = volumenPista(mezcla, canal);
        return volumen ? crearPista(Tone, contexto, salida, reverb, volumen, tablas[canal][1], mezcla.filtroY) : null;
    });
    const dt = duracion / coordenadas.length;
    try {
        for (const [indice, [x, y]] of coordenadas.entries()) {
            if (indice % 1024 === 0) {
                signal?.throwIfAborted();
                avance(.9 * indice / coordenadas.length);
                await new Promise(resolve => setTimeout(resolve, 0));
            }
            for (const [canal, pista] of pistas.entries()) {
                if (!pista) continue;
                const pos = indice * 3 + canal, intensidad = intensidades[pos];
                const e = espacioPixel((x + .5) / lado, (y + .5) / lado, mezcla, mezcla.pistas[canal].panorama);
                programarCelda(pista, tablas[canal][intensidad], intensidad, intensidades[pos + 3], indice * dt, (indice + 1) * dt, e);
            }
        }
        signal?.throwIfAborted();
        salida.gain.setValueAtTime(1, duracion - Math.min(.005, duracion / 4));
        salida.gain.linearRampToValueAtTime(0, duracion);
        avance(.93);
        const audio = await contexto.render();
        signal?.throwIfAborted();
        avance(1);
        return {buffer: audio.get(), canales: [audio.getChannelData(0), audio.getChannelData(1)], tasa: TASA};
    } finally {
        for (const pista of pistas) {
            if (!pista) continue;
            [pista.oscilador, pista.nivel, pista.panorama, pista.seco, pista.envio, pista.filtro].forEach(nodo => nodo?.dispose());
        }
        reverb?.dispose();
        salida.dispose();
        contexto.dispose();
    }
}
