import {coordenadasRecorrido} from '../recorridos.js';
import {MascaraMedio} from './mascara.js';
import {aMidi, mezclaInicial, renderizarArreglo, volumenPista} from './audio-pistas.js?v=5.8.0';
import {renderizarRGB} from './sintesis-rgb.js?v=5.8.0';
import {MediaZonal, TAMANOS_ZONA} from './estadistica-zonal.js';
import {precargarMuestras, prepararMuestras} from './muestras.js?v=5.8.0';

export const BANDAS = [
    {canal: 'R', min_hz: 20, max_hz: 250, clave: 'fa'},
    {canal: 'G', min_hz: 350, max_hz: 500, clave: 'sol'},
    {canal: 'B', min_hz: 600, max_hz: 20000, clave: 'sol'},
];
function prepararFrecuencias(escala) {
    return BANDAS.map(({min_hz: min, max_hz: max}) => Float64Array.from({length: 256}, (_, nivel) => {
        if (nivel === 0) return 0;
        const fraccion = (nivel - 1) / 254;
        return escala === 'lineal' ? min + (max - min) * fraccion : min * (max / min) ** fraccion;
    }));
}

const FRECUENCIAS_LOG = prepararFrecuencias('logaritmica');
const FRECUENCIAS_LINEALES = prepararFrecuencias('lineal');
export function notaRGB(canal, valor) {
    const hz = FRECUENCIAS_LOG[canal][Math.max(0, Math.min(255, Math.round(valor)))];
    return {hz: hz || null, midi: hz ? aMidi(hz) : -2};
}

export class SecuenciaSonora {
    constructor(medio, datos, lado, recorrido, seleccion = {}, tamanoZona = 1, escala = 'logaritmica') {
        this.medio = medio;
        this.datos = datos;
        this.lado = lado;
        this.recorrido = recorrido;
        this.pixeles = lado ** 2;
        this.duracion_s = datos.duracion;
        this.segundos_por_pixel = this.duracion_s / this.pixeles;
        this.coordenadas = coordenadasRecorrido(lado, recorrido);
        this.inversa = new Uint32Array(this.pixeles);
        this.intensidades = new Uint8Array(this.pixeles * 3);
        this.intensidadesSonoras = new Uint8Array(this.pixeles * 3);
        this.contrastes = new Uint8Array(this.pixeles);
        this.tamanoZona = TAMANOS_ZONA.includes(tamanoZona) ? tamanoZona : 1;
        this.escala = escala === 'lineal' ? 'lineal' : 'logaritmica';
        this.tablas = this.escala === 'lineal' ? FRECUENCIAS_LINEALES : FRECUENCIAS_LOG;
        this.actividad = new Uint8Array(this.pixeles);
        this.validez = new Uint8Array(this.pixeles);
        const mascara = new MascaraMedio(lado, seleccion.modo || 'alfa', seleccion.tolerancia ?? 28, seleccion.poligono);
        this.fotogramas = datos.fotogramas.map(fotograma => mascara.aplicar(fotograma));
        this.mascara = {...seleccion, fondosRetirados: mascara.fondosRetirados, fotogramas: mascara.fotogramas};
        this.construir();
        this.validos = this.validez.reduce((s, v) => s + v, 0);
    }

    construir() {
        const zona = this.tamanoZona > 1 ? new MediaZonal(this.lado, this.tamanoZona) : null;
        let fotogramaAnterior = -1;
        for (const [indice, [x, y]] of this.coordenadas.entries()) {
            const posicion = y * this.lado + x;
            this.inversa[posicion] = indice;
            const fotograma = this.fotogramaIndice(indice);
            const rgba = this.fotogramas[fotograma].data, alfa = rgba[4 * posicion + 3] / 255;
            if (fotograma !== fotogramaAnterior) {
                zona?.preparar(rgba);
                fotogramaAnterior = fotograma;
            }
            this.validez[indice] = Number(alfa > 0);
            const propios = [0, 1, 2].map(c => Math.round(rgba[4 * posicion + c] * alfa));
            const perfil = alfa && zona ? zona.leer(x, y, propios) : null;
            this.contrastes[indice] = perfil?.contraste ?? 0;
            const sonoros = perfil?.rgb ?? propios;
            for (let canal = 0; canal < 3; canal++) {
                this.intensidades[3 * indice + canal] = propios[canal];
                this.intensidadesSonoras[3 * indice + canal] = sonoros[canal];
                this.actividad[indice] ||= Number(propios[canal] > 0);
            }
        }
    }

    partituraDatos() {
        return {bandas: Object.fromEntries(BANDAS.map((banda, canal) => {
            const eventos = Array.from({length: this.pixeles}, (_, indice) => {
                const nivel = this.intensidadesSonoras[indice * 3 + canal];
                const hz = this.tablas[canal][nivel];
                return [indice, indice + 1, hz ? aMidi(hz) : -2, hz || null, nivel / 255];
            });
            return [banda.canal, {...banda, eventos}];
        }))};
    }

    indice(tiempo) {
        return Math.max(0, Math.min(this.pixeles - 1, Math.floor(tiempo / this.duracion_s * this.pixeles)));
    }

    fotogramaIndice(indice) {
        return Math.min(this.fotogramas.length - 1, Math.floor(indice / this.pixeles * this.fotogramas.length));
    }

    fotograma(indice) {
        return this.fotogramas[this.fotogramaIndice(indice)];
    }

    segundoFuente(tiempo) {
        if (this.medio.tipo !== 'video') return null;
        return this.datos.inicio + Math.min(this.duracion_s, Math.max(0, tiempo)) * (this.datos.velocidad ?? 1);
    }

    firma(indice) {
        return Array.from(this.intensidades.slice(3 * indice, 3 * indice + 3));
    }

    frecuencia(indice, canal) {
        return this.tablas[canal][this.intensidadesSonoras[3 * indice + canal]];
    }

    frecuencias(indice) {
        return BANDAS.map((_, canal) => this.frecuencia(indice, canal));
    }

    firmaSonora(indice) {
        return Array.from(this.intensidadesSonoras.slice(3 * indice, 3 * indice + 3));
    }

    datosAudio(mezcla) {
        return {
            intensidades: this.intensidadesSonoras, tablas: this.tablas, coordenadas: this.coordenadas,
            lado: this.lado, duracion: this.duracion_s, mezcla,
        };
    }
}

async function sintetizarArreglo(arreglo, mezcla, vozGrabada, avance, signal) {
    const s = arreglo.secuencia;
    const datos = {pistas: arreglo.eventosAudio(), duracion: arreglo.duracion, mezcla, vozGrabada,
        lectura: {intensidades: s.intensidadesSonoras, validez: s.validez, duracion: s.duracion_s}};
    const audible = datos.pistas.some((eventos, i) => eventos.length && volumenPista(mezcla, i)
        && (mezcla.pistas[i].instrumento !== 'muestra' || mezcla.pistas[i].muestra));
    if (!audible && !vozGrabada) throw new Error('No hay notas audibles. Revisa el área seleccionada y las pistas del DAW.');
    avance(.12);
    datos.muestras = await prepararMuestras(datos, signal);
    signal.throwIfAborted();
    avance(.34);
    const progresoMezcla = valor => avance(.34 + .66 * valor);
    if (typeof Worker === 'function') {
        try {
            return await mezclarEnWorker(datos, progresoMezcla, signal);
        } catch {
            signal.throwIfAborted();
        }
    }
    return renderizarArreglo(datos, progresoMezcla);
}

function mezclarEnWorker(datos, progreso, signal) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./audio-worker.js?v=5.8.0', import.meta.url), {type: 'module'});
        const cerrar = () => {
            worker.terminate();
            signal.removeEventListener('abort', cancelar);
        };
        const cancelar = () => { cerrar(); reject(signal.reason); };
        signal.addEventListener('abort', cancelar, {once: true});
        worker.onmessage = ({data}) => {
            if (data.resultado) { cerrar(); resolve(data.resultado); }
            else progreso(data.avance);
        };
        worker.onerror = evento => {
            evento.preventDefault();
            cerrar();
            reject(new Error('No se pudo preparar el arreglo en segundo plano.'));
        };
        worker.onmessageerror = () => { cerrar(); reject(new Error('No se pudo leer el audio del arreglo.')); };
        try {
            worker.postMessage(datos);
        } catch (error) {
            cerrar();
            reject(error);
        }
    });
}

const MODOS_REPRODUCCION = ['arreglo', 'rgb'];

export class Transporte {
    constructor(notificar, avance = () => {}) {
        this.notificar = notificar;
        this.avance = avance;
        this.tiempo = 0;
        this.volumen = .67;
        this.mezcla = mezclaInicial();
        precargarMuestras(this.mezcla);
        this.modo = 'arreglo';
        this.audios = new Map();
        this.nodo = null;
        this.raf = null;
        this.generacion = 0;
    }

    cargar(secuencia, arreglo = null) {
        this.pausar(false);
        this.invalidarAudio();
        this.secuencia = secuencia;
        this.arreglo = arreglo;
        this.modo = arreglo ? 'arreglo' : 'rgb';
        this.tiempo = 0;
        this.notificar(0, false);
    }

    invalidarAudio(modo) {
        for (const [clave, audio] of this.audios) {
            if (modo && clave !== modo) continue;
            this.audios.delete(clave);
            audio.trabajo.abort();
        }
    }

    get duracion() {
        return (this.modo === 'arreglo' ? this.arreglo?.duracion : this.secuencia?.duracion_s) ?? 0;
    }

    async configurar(mezcla, arreglo = this.arreglo, vozGrabada = this.vozGrabada) {
        const anterior = this.mezcla;
        const comun = ['reverb', 'espacio', 'filtroY'].some(k => anterior[k] !== mezcla[k])
            || mezcla.pistas.some((pista, i) =>
                ['volumen', 'panorama', 'mute', 'solo'].some(k => anterior.pistas[i][k] !== pista[k]));
        const cambioArreglo = comun || arreglo !== this.arreglo || vozGrabada !== this.vozGrabada
            || mezcla.pistas.some((pista, i) => anterior.pistas[i].muestra !== pista.muestra);
        const afecta = this.modo === 'rgb' ? comun : cambioArreglo;
        const reanudar = afecta && (this.nodo || this.preparando);
        if (afecta) this.pausar(false);
        this.mezcla = mezcla;
        if (mezcla.pistas.some((pista, i) => anterior.pistas[i].instrumento !== pista.instrumento)) precargarMuestras(mezcla);
        this.arreglo = arreglo;
        this.vozGrabada = vozGrabada;
        if (comun) this.invalidarAudio('rgb');
        if (cambioArreglo) this.invalidarAudio('arreglo');
        if (!afecta) {
            this.notificar(this.tiempo, Boolean(this.nodo), this.preparando);
            return;
        }
        this.tiempo = Math.min(this.tiempo, this.duracion);
        this.notificar(this.tiempo, false);
        if (reanudar) await this.reproducir(this.modo);
    }

    async sintetizar(modo) {
        if (!MODOS_REPRODUCCION.includes(modo)) throw new Error('Elige arreglo o píxeles RGB.');
        if (!this.secuencia || modo === 'arreglo' && !this.arreglo) throw new Error('Selecciona un medio.');
        const guardado = this.audios.get(modo);
        if (guardado) {
            this.avance(guardado.progreso, modo);
            return guardado.promesa;
        }
        const trabajo = new AbortController(), {signal} = trabajo;
        const secuencia = this.secuencia, arreglo = this.arreglo, mezcla = this.mezcla, vozGrabada = this.vozGrabada;
        const audio = {trabajo, buffer: null, progreso: 0};
        const avance = valor => {
            if (signal.aborted) return;
            audio.progreso = valor;
            this.avance(valor, modo);
        };
        this.audios.set(modo, audio);
        audio.promesa = Promise.resolve().then(() => {
            signal.throwIfAborted();
            return modo === 'arreglo' ? sintetizarArreglo(arreglo, mezcla,
                mezcla.pistas.some(p => p.solo) ? null : vozGrabada, avance, signal)
                : renderizarRGB(secuencia.datosAudio(mezcla), avance, signal);
        }).catch(error => {
            if (this.audios.get(modo) === audio) this.audios.delete(modo);
            throw error;
        });
        return audio.promesa;
    }

    contextoAudio() {
        if (!this.contexto) {
            const Contexto = window.AudioContext || window.webkitAudioContext;
            if (!Contexto) throw new Error('El navegador no admite Web Audio.');
            this.contexto = new Contexto();
            this.ganancia = this.contexto.createGain();
            this.ganancia.gain.value = this.volumen;
            this.ganancia.connect(this.contexto.destination);
        }
        return this.contexto;
    }

    async habilitarAudio() {
        const contexto = this.contextoAudio();
        if (contexto.state === 'running') return contexto;
        let timer;
        try {
            const plazo = new Promise((_, rechazar) => {
                timer = setTimeout(() => rechazar(new Error('El navegador no activó el sonido. Pulsa Tocar arreglo de nuevo.')), 5000);
            });
            await Promise.race([contexto.resume(), plazo]);
            return contexto;
        } finally {
            clearTimeout(timer);
        }
    }

    async reproducir(modo) {
        if (!MODOS_REPRODUCCION.includes(modo)) throw new Error('Elige arreglo o píxeles RGB.');
        if (!this.secuencia || modo === 'arreglo' && !this.arreglo) return;
        if (modo === this.modo && (this.nodo || this.preparando)) return;
        if (modo !== this.modo) {
            this.pausar(false);
            if (this.tiempo >= this.duracion - .00001) this.tiempo = 0;
        }
        this.modo = modo;
        const generacion = ++this.generacion;
        const duracion = this.duracion;
        if (this.tiempo >= duracion - .00001) this.tiempo = 0;
        this.preparando = true;
        this.notificar(this.tiempo, false, true);
        try {
            const contexto = await this.habilitarAudio();
            if (generacion !== this.generacion) return;
            const audio = await this.sintetizar(modo);
            if (generacion !== this.generacion) return;
            const estado = this.audios.get(modo);
            if (!estado.buffer) {
                estado.buffer = audio.buffer ?? contexto.createBuffer(audio.canales.length, audio.canales[0].length, audio.tasa);
                if (!audio.buffer) audio.canales.forEach((canal, i) => estado.buffer.copyToChannel(canal, i));
            }
            const nodo = contexto.createBufferSource();
            const envolvente = contexto.createGain();
            nodo.buffer = estado.buffer;
            nodo.connect(envolvente);
            envolvente.connect(this.ganancia);
            this.envolvente = envolvente;
            nodo.onended = () => {
                if (this.nodo !== nodo) return;
                cancelAnimationFrame(this.raf);
                nodo.disconnect();
                envolvente.disconnect();
                this.nodo = null;
                this.envolvente = null;
                this.tiempo = duracion;
                this.notificar(this.tiempo, false);
            };
            this.nodo = nodo;
            const comienzo = contexto.currentTime + .012;
            this.arranque = comienzo - this.tiempo;
            envolvente.gain.setValueAtTime(0, comienzo);
            envolvente.gain.linearRampToValueAtTime(1, comienzo + .008);
            nodo.start(comienzo, this.tiempo);
            this.preparando = false;
            this.actualizar();
        } catch (error) {
            if (generacion === this.generacion) {
                this.preparando = false;
                this.notificar(this.tiempo, false);
                if (error.name !== 'AbortError') throw error;
            }
        }
    }

    tiempoAudio() {
        return Math.max(0, Math.min(this.duracion, this.contexto.currentTime - this.arranque));
    }

    actualizar() {
        if (!this.nodo) return;
        this.tiempo = this.tiempoAudio();
        this.notificar(this.tiempo, true);
        this.raf = requestAnimationFrame(() => this.actualizar());
    }

    pausar(notificar = true) {
        this.generacion++;
        this.preparando = false;
        cancelAnimationFrame(this.raf);
        if (this.nodo) {
            this.tiempo = this.tiempoAudio();
            const nodo = this.nodo, envolvente = this.envolvente;
            this.nodo = this.envolvente = null;
            const ahora = this.contexto.currentTime;
            if (envolvente.gain.cancelAndHoldAtTime) envolvente.gain.cancelAndHoldAtTime(ahora);
            else envolvente.gain.cancelScheduledValues(ahora);
            envolvente.gain.linearRampToValueAtTime(0, ahora + .008);
            nodo.onended = () => {
                nodo.disconnect();
                envolvente.disconnect();
            };
            nodo.stop(ahora + .010);
        }
        if (notificar) this.notificar(this.tiempo, false);
    }

    async buscar(tiempo, modo = this.modo) {
        if (!this.secuencia) return;
        const sonando = Boolean(this.nodo) || this.preparando;
        this.pausar(false);
        this.modo = modo;
        this.tiempo = Math.max(0, Math.min(this.duracion, tiempo));
        this.notificar(this.tiempo, false);
        if (sonando && this.tiempo < this.duracion) await this.reproducir(this.modo);
    }

    cambiarVolumen(valor) {
        this.volumen = valor;
        if (this.ganancia) this.ganancia.gain.setTargetAtTime(valor, this.contexto.currentTime, .025);
    }
}
