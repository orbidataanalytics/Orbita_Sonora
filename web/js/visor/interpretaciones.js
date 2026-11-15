import {recurso, solicitar} from './catalogo.js';

const porId = id => document.getElementById(id);
const CARPETA = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const NOMBRE_MP4 = /^[a-z0-9]+(?:_[a-z0-9]+)*\.mp4$/;
const PRINCIPAL = 'interpretacion.mp4';

function carpetaDe(paquete) {
    if (CARPETA.test(paquete.carpeta_videos || '')) return paquete.carpeta_videos;
    if (/^\d+$/.test(String(paquete.svs_id))) return 'svs_' + paquete.svs_id;
    return String(paquete.id).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'paquete';
}

export class InterpretacionesEnPantalla {
    constructor(alAbrir) {
        this.alAbrir = alAbrir;
        this.video = porId('interpretacion-video');
        this.selector = porId('interpretacion-selector');
        this.boton = porId('abrir-interpretaciones');
        this.estado = porId('interpretacion-listado-estado');
        this.selector.onchange = () => this.verPublicado();
        this.boton.onclick = () => this.verPublicado();
        porId('cerrar-video').onclick = porId('goes-mini').onclick = () => this.cerrar();
        porId('interpretacion-archivo').onchange = evento => this.abrirArchivo(evento.target);
        this.video.addEventListener('play', () => this.alAbrir());
        this.video.addEventListener('error', () => {
            if (this.video.hidden || !this.video.getAttribute('src') || !this.video.error) return;
            this.cerrar();
            this.estado.textContent = 'No se pudo reproducir esta grabación. Usa un MP4 con video H.264 y audio AAC.';
        });
    }

    async preparar(paquete) {
        this.reiniciar();
        const carpeta = carpetaDe(paquete);
        this.ruta = 'videos/' + carpeta + '/';
        const texto = porId('interpretacion-carpeta');
        const codigo = document.createElement('code');
        codigo.textContent = this.ruta + PRINCIPAL;
        texto.replaceChildren('Publicar MP4 en ', codigo);
        texto.hidden = false;
        const peticion = this.peticion = new AbortController();
        const signal = AbortSignal.any([peticion.signal, AbortSignal.timeout(4000)]);
        const resultado = await Promise.allSettled([
            fetch(recurso(this.ruta + PRINCIPAL), {method: 'HEAD', signal})
                .then(r => r.ok && r.headers.get('content-type')?.startsWith('video/') ? [PRINCIPAL] : []),
            solicitar(recurso('videos/catalogo.json'), {signal}).then(r => r.json())
                .then(indice => indice[carpeta]),
        ]);
        if (peticion.signal.aborted) return;
        const nombres = [...new Set(resultado.flatMap(r => r.status === 'fulfilled' && Array.isArray(r.value) ? r.value : []))]
            .filter(nombre => typeof nombre === 'string' && NOMBRE_MP4.test(nombre))
            .sort((a, b) => a === PRINCIPAL ? -1 : b === PRINCIPAL ? 1 : a.localeCompare(b));
        this.selector.replaceChildren(...nombres.map(nombre => new Option(nombre.slice(0, -4).replaceAll('_', ' '), nombre)));
        this.boton.hidden = nombres.length === 0;
        porId('interpretacion-selector-grupo').hidden = nombres.length < 2;
    }

    reiniciar() {
        this.peticion?.abort();
        this.cerrar();
        this.boton.hidden = true;
        porId('interpretacion-carpeta').hidden = true;
        porId('interpretacion-selector-grupo').hidden = true;
        this.selector.replaceChildren();
    }

    verPublicado() {
        const nombre = this.selector.value;
        if (NOMBRE_MP4.test(nombre)) this.reproducir(recurso(this.ruta + nombre));
    }

    abrirArchivo(control) {
        const archivo = control.files[0];
        control.value = '';
        if (!archivo) return;
        if (!/\.mp4$/i.test(archivo.name)) {
            this.estado.textContent = 'Selecciona una grabación MP4.';
            return;
        }
        this.reproducir(URL.createObjectURL(archivo), true);
    }

    reproducir(url, temporal = false) {
        this.cerrar();
        this.alAbrir();
        if (temporal) this.objeto = url;
        this.mostrarVideo(true);
        this.video.src = url;
        this.video.play().catch(error => {
            if (error.name === 'NotAllowedError' && this.video.getAttribute('src') === url) {
                this.estado.textContent = 'Pulsa reproducir en el video.';
            }
        });
    }

    cerrar() {
        this.video.pause();
        if (this.video.getAttribute('src')) {
            this.video.removeAttribute('src');
            this.video.load();
        }
        if (this.objeto) URL.revokeObjectURL(this.objeto);
        this.objeto = null;
        this.mostrarVideo(false);
        this.estado.textContent = '';
    }

    mostrarVideo(activo) {
        this.video.hidden = !activo;
        porId('goes-imagen').hidden = activo;
        porId('goes-estado').hidden = activo;
        porId('goes-mini').hidden = !activo;
        porId('cerrar-video').hidden = !activo;
        porId('pantalla-titulo').textContent = activo ? 'Interpretación' : 'Colombia desde GOES';
    }
}
