import {aHz, espacioPixel, notaInstrumento, renderizarNota, volumenPista} from './audio-pistas.js?v=5.8.0';

export class AudioVivo {
    constructor(transporte) {
        this.transporte = transporte;
        this.voces = new Set();
    }

    reverb(contexto) {
        if (this.ambiente) return this.ambiente;
        const nodo = contexto.createConvolver();
        const largo = Math.floor(contexto.sampleRate * .95);
        const impulso = contexto.createBuffer(2, largo, contexto.sampleRate);
        let semilla = 127432;
        for (let canal = 0; canal < 2; canal++) {
            const datos = impulso.getChannelData(canal);
            for (let i = Math.floor(.012 * contexto.sampleRate); i < largo; i++) {
                semilla = (Math.imul(1664525, semilla) + 1013904223) | 0;
                datos[i] = semilla / 2147483648 * (1 - i / largo) ** 4;
            }
        }
        nodo.buffer = impulso;
        nodo.connect(this.transporte.ganancia);
        this.ambiente = nodo;
        return nodo;
    }

    sonar(evento, cuando) {
        const {canal, nota, velocidad, duracion, x, y} = evento;
        const mezcla = this.transporte.mezcla, nivel = volumenPista(mezcla, canal);
        if (!nivel || nota < 0 || !velocidad || this.voces.size >= 64) return;
        const pista = mezcla.pistas[canal], contexto = this.transporte.contextoAudio();
        const instrumento = pista.instrumento, midi = notaInstrumento(nota, instrumento);
        const fuente = contexto.createBufferSource(), plano = contexto.createStereoPanner();
        const seco = contexto.createGain(), humedo = contexto.createGain();
        const espacio = espacioPixel(x, y, mezcla, pista.panorama);
        const wet = espacio.wet;
        plano.pan.value = espacio.pan;
        seco.gain.value = 1 - wet; humedo.gain.value = wet;
        fuente.buffer = renderizarNota(contexto, pista, aHz(midi), Math.min(8, duracion), velocidad * nivel, instrumento);
        const nodos = [fuente, plano, seco, humedo];
        if (espacio.corte) {
            const filtro = contexto.createBiquadFilter();
            filtro.type = 'lowpass'; filtro.frequency.value = espacio.corte;
            fuente.connect(filtro); filtro.connect(plano); nodos.push(filtro);
        } else fuente.connect(plano);
        plano.connect(seco); seco.connect(this.transporte.ganancia);
        if (wet) { plano.connect(humedo); humedo.connect(this.reverb(contexto)); }
        this.voces.add(fuente);
        fuente.onended = () => {
            for (const nodo of nodos) nodo.disconnect();
            this.voces.delete(fuente);
        };
        fuente.start(Math.max(contexto.currentTime + .006, cuando || 0));
    }

    async reproducirArchivo(eventos, terminar) {
        this.pararArchivo();
        if (!eventos.length) throw new Error('El MIDI no contiene notas utilizables.');
        const version = this.version;
        const contexto = await this.transporte.habilitarAudio();
        if (version !== this.version) return;
        const base = contexto.currentTime + .06;
        let i = 0;
        const fin = eventos.reduce((max, e) => Math.max(max, e.tiempo + e.duracion), 0);
        this.temporizador = setInterval(() => {
            const hasta = contexto.currentTime - base + .11;
            while (i < eventos.length && eventos[i].tiempo <= hasta) {
                this.sonar(eventos[i], base + eventos[i].tiempo);
                i++;
            }
            if (i === eventos.length && contexto.currentTime > base + fin) {
                this.pararArchivo();
                terminar();
            }
        }, 35);
    }

    pararArchivo() {
        this.version = (this.version || 0) + 1;
        clearInterval(this.temporizador);
        for (const nodo of this.voces) nodo.stop();
        this.voces.clear();
    }
}
