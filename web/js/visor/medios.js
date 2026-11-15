import {endpoint, extension, recurso, solicitar} from './catalogo.js';

const nativas = new Set(['jpg', 'jpeg', 'jpe', 'jfif', 'png', 'apng', 'gif', 'webp', 'bmp', 'avif', 'ico']);
const LIMITE_SEGUNDOS = 60;
const informarNada = () => {};

function comprobar(signal) {
    if (signal?.aborted) throw signal.reason;
}

function esperar(elemento, evento, signal, plazo = 30000) {
    return new Promise((resolve, reject) => {
        comprobar(signal);
        const timer = setTimeout(() => terminar(new Error('La fuente tardó demasiado en responder.')), plazo);
        const listo = () => terminar();
        const fallo = () => terminar(new Error('El navegador no pudo abrir el archivo.'));
        const abortar = () => terminar(signal.reason);
        function terminar(error) {
            clearTimeout(timer);
            elemento.removeEventListener(evento, listo);
            elemento.removeEventListener('error', fallo);
            signal?.removeEventListener('abort', abortar);
            if (error) reject(error);
            else resolve();
        }
        elemento.addEventListener(evento, listo, {once: true});
        elemento.addEventListener('error', fallo, {once: true});
        signal?.addEventListener('abort', abortar, {once: true});
    });
}

export function lienzo(ancho, alto = ancho) {
    const canvas = document.createElement('canvas');
    canvas.width = ancho;
    canvas.height = alto;
    return canvas;
}

export function liberarVideo(video, blob) {
    video.pause();
    video.removeAttribute('src');
    video.load();
    if (blob) URL.revokeObjectURL(blob);
}

export class LectorMedios {
    async decodificarImagen(url, signal) {
        const imagen = new Image();
        imagen.crossOrigin = 'anonymous';
        const lista = esperar(imagen, 'load', signal);
        imagen.src = url;
        try {
            await lista;
            const prueba = lienzo(1);
            const ctx = prueba.getContext('2d', {willReadFrequently: true});
            ctx.drawImage(imagen, 0, 0, 1, 1);
            ctx.getImageData(0, 0, 1, 1);
            return imagen;
        } catch (error) {
            imagen.removeAttribute('src');
            throw error;
        }
    }

    async abrirImagen(medio, signal, informar) {
        const url = medio.url ? recurso(medio.url) : null;
        const copia = medio.copia_local ? recurso(medio.copia_local) : null;
        const archivo = medio.archivo;
        const ext = extension(archivo?.name || url || '');
        if (nativas.has(ext) && (archivo || url || copia)) {
            const blob = archivo && URL.createObjectURL(archivo);
            try {
                for (const origen of [blob, copia, url].filter(Boolean)) {
                    try {
                        const imagen = await this.decodificarImagen(origen, signal);
                        return {imagen, ancho: imagen.naturalWidth, alto: imagen.naturalHeight, copia: origen === copia};
                    } catch {
                        comprobar(signal);
                    }
                }
            } finally {
                if (blob) URL.revokeObjectURL(blob);
            }
        }
        informar('Leyendo los píxeles de la imagen con la API…');
        const respuesta = await this.normalizar(medio, 'imagen', signal);
        const meta = JSON.parse(respuesta.headers.get('X-Orbita-Imagen') || '{}');
        const blob = URL.createObjectURL(await respuesta.blob());
        try {
            return {...meta, imagen: await this.decodificarImagen(blob, signal), normalizado: true};
        } finally {
            URL.revokeObjectURL(blob);
        }
    }

    async normalizar(medio, tipo, signal, inicio = 0) {
        signal = AbortSignal.any([signal, AbortSignal.timeout(150000)].filter(Boolean));
        if (medio.archivo) {
            const cuerpo = new FormData();
            cuerpo.append('archivo', medio.archivo, medio.archivo.name);
            cuerpo.append('tipo', tipo);
            if (tipo === 'video') cuerpo.append('inicio', String(inicio));
            return solicitar(endpoint('archivo'), {method: 'POST', body: cuerpo, signal});
        }
        return solicitar(endpoint(tipo, {url: recurso(medio.url), ...(tipo === 'video' ? {convertir: 'true', inicio} : {})}), {signal});
    }

    async decodificarVideo(url, signal) {
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.crossOrigin = 'anonymous';
        const listo = esperar(video, 'loadeddata', signal, 22000);
        video.src = url;
        try {
            await listo;
            if (!Number.isFinite(video.duration) || video.duration <= 0) {
                throw new Error('El video no tiene una duración definida.');
            }
            const prueba = lienzo(1);
            const ctx = prueba.getContext('2d', {willReadFrequently: true});
            ctx.drawImage(video, 0, 0, 1, 1);
            ctx.getImageData(0, 0, 1, 1);
            return video;
        } catch (error) {
            video.removeAttribute('src');
            video.load();
            throw error;
        }
    }

    async abrirVideo(medio, signal, inicio, informar) {
        const ruta = medio.url;
        const url = ruta ? recurso(ruta) : null;
        const copia = medio.copia_local ? recurso(medio.copia_local) : null;
        const esperaConversion = url && /(?:h265|hevc|prores)|\.(?:mov|avi|mkv)$/i.test(ruta);
        let blob = medio.archivo && URL.createObjectURL(medio.archivo);
        const intentos = [blob, copia, url].filter(Boolean);
        if (url && !esperaConversion && new URL(url).origin !== location.origin) intentos.push(endpoint('video', {url}));
        try {
            for (const intento of intentos) {
                try {
                    const video = await this.decodificarVideo(intento, signal);
                    return {video, blob, copia: intento === copia, normalizado: false};
                } catch (error) {
                    comprobar(signal);
                }
            }
            if (blob) URL.revokeObjectURL(blob);
            informar('La API está convirtiendo el tramo del video original…');
            const respuesta = await this.normalizar(medio, 'video', signal, inicio);
            const metadatos = JSON.parse(respuesta.headers.get('X-Orbita-Video-Meta') || '{}');
            blob = URL.createObjectURL(await respuesta.blob());
            const video = await this.decodificarVideo(blob, signal);
            return {video, blob, normalizado: true, metadatos};
        } catch (error) {
            if (blob) URL.revokeObjectURL(blob);
            throw error;
        }
    }

    muestrear(origen, lado) {
        const canvas = lienzo(lado);
        const ctx = canvas.getContext('2d', {willReadFrequently: true});
        ctx.drawImage(origen, 0, 0, lado, lado);
        return ctx.getImageData(0, 0, lado, lado);
    }

    async cargar(medio, opciones, signal, progreso = informarNada, informar = informarNada) {
        const {lado, duracion, inicio} = opciones;
        if (medio.tipo === 'imagen') {
            const imagen = opciones.imagen || await this.abrirImagen(medio, signal, informar);
            return {
                ...imagen, fotogramas: [this.muestrear(imagen.imagen, lado)],
                duracion, inicio: 0, duracionFuente: 0,
            };
        }
        const {video, blob, copia, normalizado, metadatos} = await this.abrirVideo(medio, signal, inicio, informar);
        try {
            const desde = normalizado ? 0 : Math.min(Math.max(0, inicio), Math.max(0, video.duration - .05));
            const total = Math.min(LIMITE_SEGUNDOS, video.duration - desde);
            const inicioFuente = metadatos?.inicio_s ?? desde;
            const cantidad = Math.min(120, Math.max(1, Math.ceil(total * 6)));
            const fotogramas = [];
            for (let indice = 0; indice < cantidad; indice++) {
                comprobar(signal);
                const tiempo = desde + indice / cantidad * total;
                if (Math.abs(video.currentTime - tiempo) > .0001) {
                    const listo = esperar(video, 'seeked', signal, 16000);
                    video.currentTime = tiempo;
                    await listo;
                }
                fotogramas.push(this.muestrear(video, lado));
                if (indice % 5 === 0 || indice === cantidad - 1) progreso(indice + 1, cantidad);
            }
            return {
                fotogramas, video, blob, ancho: video.videoWidth, alto: video.videoHeight,
                duracion: total, duracionFuente: metadatos?.duracion_fuente_s ?? video.duration,
                inicio: inicioFuente, inicioReproductor: desde, copia, normalizado,
            };
        } catch (error) {
            liberarVideo(video, blob);
            throw error;
        }
    }
}
