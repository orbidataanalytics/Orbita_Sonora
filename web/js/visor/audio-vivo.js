import {API_BASE} from '../conexion.js';
import {aHz, espacioPixel, notaInstrumento, renderizarNota, volumenPista} from './audio-pistas.js';
import {notaRGB} from './sonificacion.js';

export class AudioVivo {
    constructor(transporte) {
        this.transporte = transporte;
        this.voces = new Set();
        this.archivoVoces = new Set();
        this.tiempoEnvio = null;
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

    sonar(evento, cuando, archivo = false) {
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
        if (archivo) this.archivoVoces.add(fuente);
        fuente.onended = () => {
            for (const nodo of nodos) nodo.disconnect();
            this.voces.delete(fuente); this.archivoVoces.delete(fuente);
        };
        fuente.start(Math.max(contexto.currentTime + .006, cuando || 0));
    }

    convertir(mensaje) {
        const {x = .5, y = .5, timestamp_ms, duration_ms = 180} = mensaje;
        const general = {x, y, timestamp_ms, duracion: duration_ms / 1000};
        if (mensaje.type === 'note') {
            return [{...general, canal: mensaje.line_id - 1, nota: mensaje.note, velocidad: mensaje.velocity / 127}];
        }
        if (mensaje.type === 'rgb') {
            return mensaje.rgb.map((v, i) => ({
                ...general, canal: i, nota: notaRGB(i, v).midi, velocidad: (v / 255) ** 1.2,
            })).filter(e => e.nota >= 0);
        }
        return [];
    }

    enVivo(mensaje) {
        const contexto = this.transporte.contextoAudio(), eventos = this.convertir(mensaje);
        const marca = mensaje.timestamp_ms;
        let cuando = contexto.currentTime + .055;
        if (typeof marca === 'number') {
            if (this.tiempoEnvio === null || marca < this.tiempoEnvio.marca
                || this.tiempoEnvio.base + (marca - this.tiempoEnvio.marca) / 1000 < contexto.currentTime - .3
                || this.tiempoEnvio.base + (marca - this.tiempoEnvio.marca) / 1000 > contexto.currentTime + 2) {
                this.tiempoEnvio = {marca, base: cuando};
            }
            cuando = Math.max(cuando, this.tiempoEnvio.base + (marca - this.tiempoEnvio.marca) / 1000);
        }
        for (const evento of eventos) this.sonar(evento, cuando);
        return eventos.map(e => ({...e, tiempo: cuando}));
    }

    async reproducirArchivo(eventos, terminar) {
        this.pararArchivo();
        if (!eventos.length) throw new Error('El MIDI no contiene notas utilizables.');
        const contexto = this.transporte.contextoAudio(), version = this.version;
        await contexto.resume();
        if (version !== this.version) return;
        const base = contexto.currentTime + .06;
        let i = 0;
        const fin = eventos.reduce((max, e) => Math.max(max, e.tiempo + e.duracion), 0);
        this.temporizador = setInterval(() => {
            const hasta = contexto.currentTime - base + .11;
            while (i < eventos.length && eventos[i].tiempo <= hasta) {
                this.sonar(eventos[i], base + eventos[i].tiempo, true);
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
        for (const nodo of this.archivoVoces) nodo.stop();
        this.archivoVoces.clear();
    }
}

export class CanalVivo {
    constructor(recibir, estado) {
        this.recibir = recibir;
        this.estado = estado;
        const url = new URL(API_BASE + '/api/daw/vivo');
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        url.pathname += '/' + crypto.randomUUID().replaceAll('-', '');
        this.url = url.href;
    }

    async conectar() {
        const anterior = this.socket;
        if (anterior?.readyState === WebSocket.OPEN || anterior?.readyState === WebSocket.CONNECTING) return;
        const socket = this.socket = new WebSocket(this.url);
        this.estado('Conectando con la API…', false);
        socket.onmessage = evento => {
            const dato = JSON.parse(evento.data);
            if (dato.type === 'ready') this.estado('Conectado · esperando eventos RGB o MIDI', true);
            else if (dato.type === 'error') this.estado(dato.message, true);
            else this.recibir(dato);
        };
        socket.onerror = () => this.estado('No se pudo conectar. Verifica el despliegue de la API en Render.', false);
        socket.onclose = () => {
            if (socket === this.socket) this.estado('Sesión desconectada.', false);
        };
    }

    desconectar() { this.socket?.close(); }

    ejemplo() {
        if (this.socket?.readyState !== WebSocket.OPEN) return;
        const base = Date.now() + 90;
        const colores = [[236, 120, 85], [110, 218, 170], [195, 152, 240], [150, 230, 96], [241, 178, 195]];
        colores.forEach((rgb, i) => this.socket.send(JSON.stringify({type: 'rgb', rgb,
            x: .08 + i * .21, y: .14 + (i % 2) * .51, duration_ms: 220, timestamp_ms: base + i * 270})));
    }
}
