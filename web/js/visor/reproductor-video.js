import {liberarVideo} from './medios.js';

export class ReproductorVideo {
    constructor(panel, selector, alReproducir) {
        this.panel = panel;
        this.selector = selector;
        this.alReproducir = alReproducir;
        this.selector.onchange = () => {
            if (!this.video) return;
            this.video.pause();
            this.video.controls = !this.selector.checked;
            if (!this.selector.checked) this.video.playbackRate = 1;
            this.video.muted = this.selector.checked;
            this.mover(this.tiempo, this.activo);
        };
        this.panel.addEventListener('toggle', () => this.mover(this.tiempo, this.activo));
    }

    cargar(datos) {
        if (this.video) {
            liberarVideo(this.video, this.blob);
            this.video.remove();
        }
        this.video = datos?.video;
        this.blob = datos?.blob;
        this.inicio = datos?.inicioReproductor ?? datos?.inicio ?? 0;
        this.duracion = datos?.duracion ?? 0;
        this.tiempo = 0;
        this.activo = false;
        this.panel.hidden = !this.video;
        this.panel.open = Boolean(this.video);
        if (!this.video) return;
        this.selector.checked = true;
        this.video.controls = false;
        this.video.muted = true;
        this.video.setAttribute('aria-label', 'Video fuente');
        this.video.addEventListener('seeked', () => this.posicionarCursor(), {passive: true});
        this.video.addEventListener('play', () => {
            if (!this.selector.checked) this.alReproducir();
        });
        this.panel.querySelector('.video-escena').prepend(this.video);
        this.mover(0, false);
    }

    marcar(x, y, lado) {
        this.pixel = {x: (x + .5) / lado, y: (y + .5) / lado};
        this.posicionarCursor();
    }

    posicionarCursor() {
        const cursor = this.panel.querySelector('.video-cursor');
        const video = this.video;
        cursor.hidden = !video || !this.selector.checked || !this.pixel;
        if (cursor.hidden || !video.videoWidth || !video.clientWidth) return;
        const escala = Math.min(video.clientWidth / video.videoWidth, video.clientHeight / video.videoHeight);
        const ancho = video.videoWidth * escala, alto = video.videoHeight * escala;
        cursor.style.left = ((video.clientWidth - ancho) / 2 + this.pixel.x * ancho) + 'px';
        cursor.style.top = ((video.clientHeight - alto) / 2 + this.pixel.y * alto) + 'px';
    }

    mover(tiempo, activo, velocidad = this.velocidad ?? 1) {
        this.velocidad = velocidad;
        this.tiempo = tiempo;
        this.activo = activo;
        const video = this.video;
        if (!video) return;
        if (!this.panel.open) { video.pause(); return; }
        this.posicionarCursor();
        if (!this.selector.checked) return;
        const objetivo = this.inicio + Math.min(tiempo * velocidad, this.duracion);
        video.playbackRate = velocidad;
        const reproduciendo = activo && tiempo * velocidad < this.duracion;
        if (Math.abs(video.currentTime - objetivo) > (reproduciendo ? .18 : .015)) video.currentTime = objetivo;
        if (reproduciendo && video.paused && !this.arrancando) {
            this.arrancando = video.play().catch(() => {}).finally(() => { this.arrancando = null; });
        } else if (!reproduciendo) video.pause();
    }
}
