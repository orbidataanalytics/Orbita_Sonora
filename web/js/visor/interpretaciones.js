import {API_BASE} from '../conexion.js';
import {recurso, solicitar} from './catalogo.js';

const porId = id => document.getElementById(id);
const CARPETA = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const NOMBRE_MP4 = /^[a-z0-9]+(?:_[a-z0-9]+)*\.mp4$/;
const MIB = 1024 ** 2;

function carpetaDe(paquete) {
    if (CARPETA.test(paquete.carpeta_videos || '')) return paquete.carpeta_videos;
    if (paquete.svs_id && /^\d+$/.test(String(paquete.svs_id))) return 'svs_' + paquete.svs_id;
    return String(paquete.id).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'paquete';
}

class VideosPublicados {
    constructor(carpeta, signal) {
        this.carpeta = carpeta;
        this.ruta = 'videos/' + carpeta + '/';
        this.signal = signal;
    }

    async json(url, timeout) {
        const signal = AbortSignal.any([this.signal, AbortSignal.timeout(timeout)]);
        return (await solicitar(url, {signal})).json();
    }

    async predeterminado() {
        const nombre = 'interpretacion.mp4';
        const signal = AbortSignal.any([this.signal, AbortSignal.timeout(3000)]);
        const r = await fetch(recurso(this.ruta + nombre), {method: 'HEAD', signal});
        return r.ok && r.headers.get('content-type')?.startsWith('video/') ? [nombre] : [];
    }

    async listar() {
        const consultas = [
            this.predeterminado(),
            this.json(recurso('videos/catalogo.json'), 3000).then(d => d[this.carpeta] || []),
            this.json(API_BASE + '/api/interpretaciones/' + this.carpeta, 6500).then(d => d.videos),
        ];
        if (location.hostname === 'orbidataanalytics.github.io') {
            consultas.push(this.json('https://api.github.com/repos/orbidataanalytics/OrbitaSonora/contents/'
                + this.ruta.slice(0, -1) + '?ref=main', 4000).then(d => d.filter(e => e.type === 'file').map(e => e.name)));
        }
        const resultados = await Promise.allSettled(consultas);
        return [...new Set(resultados.flatMap(r => r.status === 'fulfilled' ? r.value || [] : []))]
            .filter(nombre => typeof nombre === 'string' && NOMBRE_MP4.test(nombre)).sort();
    }
}

export class VentanaInterpretaciones {
    constructor(pausar) {
        this.pausar = pausar;
        this.dialogo = porId('interpretaciones');
        this.video = porId('interpretacion-video');
        this.selector = porId('interpretacion-selector');
        this.formulario = porId('mezclar-interpretacion');
        this.enlace = porId('interpretacion-descargar');
        this.selector.onchange = () => this.verPublicado();
        this.formulario.onsubmit = evento => this.mezclar(evento);
        this.video.addEventListener('play', () => this.pausar());
        this.video.addEventListener('error', () => {
            if (!this.video.src || this.video.hidden) return;
            porId('interpretacion-listado-estado').textContent = 'No se pudo reproducir el MP4. Comprueba que la publicación terminó y que el archivo usa H.264.';
        });
        this.dialogo.addEventListener('close', () => {
            this.listado?.abort();
            this.mezcla?.abort();
            this.video.pause();
        });
        this.crearControles();
    }

    crearControles() {
        const etiquetas = [['Rojo · Percusión', 'rojo', 'r', '#f58f92'],
            ['Verde · Requinto o guitarra', 'verde', 'g', '#91d9a7'],
            ['Azul · Bajo', 'azul', 'b', '#9bb8f7']];
        porId('interpretacion-pistas').replaceChildren(...etiquetas.map(([nombre, archivo, sufijo, color]) => {
            const panel = document.createElement('div');
            panel.className = 'daw-pista';
            panel.style.setProperty('--color-pista', color);
            panel.innerHTML = `<h3>${nombre}</h3>
                <label>Archivo de audio <input type="file" name="${archivo}" accept="audio/*" required></label>
                <label>Ganancia (dB) <input type="number" name="vol_${sufijo}" min="-30" max="9" step="0.5" value="-3" required></label>
                <label>Ajuste (ms) <input type="number" name="ms_${sufijo}" min="-10000" max="10000" value="0" required></label>`;
            return panel;
        }));
    }

    async abrir(paquete) {
        if (!paquete) return;
        const carpeta = carpetaDe(paquete);
        this.pausar();
        this.listado?.abort();
        if (this.carpeta !== carpeta) {
            this.limpiarSalida();
            this.formulario.reset();
        }
        this.carpeta = carpeta;
        const peticion = this.listado = new AbortController();
        const listado = new VideosPublicados(carpeta, peticion.signal);
        this.ruta = listado.ruta;
        porId('interpretacion-paquete').textContent = paquete.titulo;
        porId('interpretacion-carpeta').textContent = listado.ruta;
        const estado = porId('interpretacion-listado-estado');
        estado.textContent = 'Buscando videos publicados…';
        porId('interpretacion-selector-grupo').hidden = true;
        if (!this.objeto) this.ver(null);
        if (!this.dialogo.open) this.dialogo.showModal();
        const nombres = await listado.listar();
        if (peticion.signal.aborted) return;
        this.selector.replaceChildren(...nombres.map(nombre => new Option(nombre.slice(0, -4).replaceAll('_', ' '), nombre)));
        porId('interpretacion-selector-grupo').hidden = !nombres.length;
        estado.textContent = nombres.length ? '' : 'Aún no hay videos publicados para este paquete.';
        if (nombres.length && !this.objeto) this.verPublicado();
    }

    ver(url) {
        this.video.pause();
        this.video.hidden = !url;
        if (url) this.video.src = url;
        else this.video.removeAttribute('src');
        this.video.load();
    }

    verPublicado() {
        if (NOMBRE_MP4.test(this.selector.value)) this.ver(recurso(this.ruta + this.selector.value));
    }

    limpiarSalida() {
        if (this.objeto) URL.revokeObjectURL(this.objeto);
        this.objeto = null;
        this.enlace.hidden = true;
        this.enlace.removeAttribute('href');
        porId('interpretacion-estado').textContent = '';
    }

    async mezclar(evento) {
        evento.preventDefault();
        const estado = porId('interpretacion-estado'), boton = porId('interpretacion-mezclar');
        const datos = new FormData(this.formulario), nombre = datos.get('nombre');
        if (!NOMBRE_MP4.test(nombre)) { estado.textContent = 'Usa un nombre como ensayo_01.mp4.'; return; }
        for (const [campo, maximo] of [['video', 95], ['rojo', 36], ['verde', 36], ['azul', 36]]) {
            const archivo = datos.get(campo);
            if (!archivo.size || archivo.size > maximo * MIB) {
                estado.textContent = `Selecciona un archivo para ${campo} de hasta ${maximo} MiB.`;
                return;
            }
        }
        this.mezcla?.abort();
        const peticion = this.mezcla = new AbortController();
        boton.disabled = true;
        estado.textContent = 'Enviando el video y mezclando las tres pistas…';
        try {
            const signal = AbortSignal.any([peticion.signal, AbortSignal.timeout(270000)]);
            const respuesta = await solicitar(API_BASE + '/api/interpretaciones/mezclar', {method: 'POST', body: datos, signal});
            const archivo = await respuesta.blob();
            if (peticion.signal.aborted) return;
            if (archivo.type !== 'video/mp4') throw new Error('El servidor no devolvió un MP4.');
            this.limpiarSalida();
            this.objeto = URL.createObjectURL(archivo);
            this.enlace.href = this.objeto;
            this.enlace.download = nombre;
            this.enlace.hidden = false;
            this.ver(this.objeto);
            estado.textContent = 'Mezcla lista. Descarga el MP4 y guárdalo en ' + this.ruta;
        } catch (error) {
            if (!peticion.signal.aborted) estado.textContent = error.name === 'TimeoutError' ? 'El mezclador tardó demasiado. Prueba un clip más corto.' : error.message;
        } finally {
            if (this.mezcla === peticion) boton.disabled = false;
        }
    }
}
