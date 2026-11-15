import {API_BASE} from '../conexion.js';

const imagenes = new Set('jpg jpeg jpe jfif png apng gif webp bmp dib avif tif tiff geotiff jp2 j2k jpf jpx heic heif ico icns psd tga pcx ppm pgm pbm pnm pam hdr dds exr fits fit fts dng cr2 cr3 crw nef nrw arw srf sr2 raf rw2 orf pef srw dcr kdc erf 3fr mos mrw x3f'.split(' '));
const videos = new Set('mp4 webm mov m4v mkv avi mpg mpeg ogv 3gp mts m2ts wmv flv ts mxf'.split(' '));

export function extension(nombre) {
    return nombre.split(/[?#]/, 1)[0].split('/').at(-1).split('.').at(-1).toLowerCase();
}

export function tipoMedio(nombre, mime = '') {
    if (imagenes.has(extension(nombre)) || mime.startsWith('image/')) return 'imagen';
    if (videos.has(extension(nombre)) || mime.startsWith('video/')) return 'video';
    return null;
}

export function recurso(ruta) {
    return new URL(ruta, new URL('../../../', import.meta.url)).href;
}

export function endpoint(ruta, parametros = {}) {
    const url = new URL(`${API_BASE}/api/visor/${ruta}`);
    for (const [clave, valor] of Object.entries(parametros)) url.searchParams.set(clave, valor);
    return url.href;
}

export async function solicitar(url, opciones) {
    const respuesta = await fetch(url, opciones);
    if (!respuesta.ok) {
        let detalle;
        try {
            detalle = (await respuesta.json()).detail;
        } catch {}
        throw new Error(typeof detalle === 'string' ? detalle : `La fuente respondió HTTP ${respuesta.status}.`);
    }
    return respuesta;
}

export class Catalogo {
    constructor() {
        this.bd = this.abrir();
    }

    abrir() {
        return new Promise((resolve, reject) => {
            const peticion = indexedDB.open('orbita-sonora-visor', 1);
            peticion.onupgradeneeded = () => {
                peticion.result.createObjectStore('paquetes', {keyPath: 'id'});
                peticion.result.createObjectStore('ajustes');
            };
            peticion.onsuccess = () => resolve(peticion.result);
            peticion.onerror = () => reject(peticion.error);
            peticion.onblocked = () => reject(new Error('El almacenamiento del navegador está ocupado.'));
        }).catch(() => null);
    }

    async consultar(almacen, modo, operacion) {
        const base = await this.bd;
        if (!base) throw new Error('El navegador no permite guardar paquetes en esta sesión.');
        return new Promise((resolve, reject) => {
            const transaccion = base.transaction(almacen, modo);
            const peticion = operacion(transaccion.objectStore(almacen));
            transaccion.oncomplete = () => resolve(peticion.result);
            transaccion.onabort = () => reject(transaccion.error);
            transaccion.onerror = () => reject(transaccion.error);
        });
    }

    async precargados() {
        const respuesta = await solicitar(recurso('datos/paquetes/catalogo.json'));
        return (await respuesta.json()).paquetes;
    }

    async locales() {
        try {
            return await this.consultar('paquetes', 'readonly', almacen => almacen.getAll());
        } catch {
            return [];
        }
    }

    async cargar(entrada, signal) {
        if (entrada.medios) return entrada;
        return (await solicitar(recurso(entrada.manifiesto), {signal})).json();
    }

    guardar(paquete) {
        return this.consultar('paquetes', 'readwrite', almacen => almacen.put(paquete));
    }

    async ajustar(clave, valor) {
        return this.consultar('ajustes', 'readwrite', almacen => almacen.put(valor, clave));
    }

    async ajuste(clave) {
        try {
            return await this.consultar('ajustes', 'readonly', almacen => almacen.get(clave));
        } catch {
            return undefined;
        }
    }

    async importar(titulo, urls, archivos, portada) {
        const medios = [];
        const fuentes = [];
        const fallos = [];
        const unicas = [...new Set(urls.map(url => url.trim()).filter(Boolean))];
        for (const url of unicas) {
            try {
                const direccion = new URL(url);
                if (!['http:', 'https:'].includes(direccion.protocol) || direccion.username || direccion.password) {
                    throw new Error('Usa una URL HTTP o HTTPS sin credenciales.');
                }
                const tipo = tipoMedio(direccion.pathname);
                if (tipo) {
                    medios.push({
                        id: crypto.randomUUID(), tipo, titulo: this.nombre(direccion.pathname),
                        url: direccion.href, fuente: direccion.href,
                    });
                } else {
                    const respuesta = await solicitar(endpoint('importar', {url: direccion.href}), {
                        signal: AbortSignal.timeout(65000),
                    });
                    const paquete = await respuesta.json();
                    fuentes.push(paquete);
                    medios.push(...paquete.medios);
                }
            } catch (error) {
                fallos.push(`${url} · ${error.message}`);
            }
        }
        for (const archivo of archivos) {
            const tipo = tipoMedio(archivo.name, archivo.type);
            if (!tipo) {
                fallos.push(`${archivo.name} · formato sin identificar`);
                continue;
            }
            medios.push({id: crypto.randomUUID(), tipo, titulo: this.nombre(archivo.name), archivo});
        }
        if (!medios.length) throw new Error(fallos.join('\n') || 'Ingresa una URL o selecciona al menos un archivo.');
        const primero = medios.find(m => m.tipo === 'imagen');
        const portadaElegida = portada || primero?.archivo || null;
        const paquete = {
            id: crypto.randomUUID(), titulo: titulo || fuentes[0]?.titulo || medios[0].titulo,
            portada: fuentes[0]?.portada || primero?.url || null, portada_archivo: portadaElegida,
            fuente: unicas.length === 1 ? unicas[0] : null, proveedor: 'Paquete agregado',
            pendientes: fuentes.flatMap(f => f.pendientes || []),
            medios: [...new Map(medios.map(m => [m.url || m.id, m])).values()],
        };
        try {
            await this.guardar(paquete);
        } catch {
            fallos.push('El paquete estará disponible durante esta sesión. El navegador no pudo guardarlo.');
        }
        return {paquete, fallos};
    }

    nombre(ruta) {
        const ultimo = ruta.split('/').filter(Boolean).at(-1) || ruta;
        try {
            return decodeURIComponent(ultimo).replace(/\.[^.]+$/, '').replaceAll('_', ' ');
        } catch {
            return ultimo;
        }
    }
}
