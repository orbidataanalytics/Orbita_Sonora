import {ReproductorVideo} from './reproductor-video.js';
import {coleccionMarcas} from './marcas-sig.js';
import {Catalogo, recurso} from './catalogo.js';
import {VisorGIS, leerGeografia, posicionGeografica} from './gis.js';
import {descargar, Informe} from './informe.js';
import {LectorMedios, liberarVideo} from './medios.js';
import {Paneles} from './paneles.js';
import {SecuenciaSonora, Transporte} from './sonificacion.js';
import {SeleccionArea} from './mascara.js';
import {Rocola} from './rocola.js';
import {EstudioDAW} from './daw.js';
import {ArregloMusical} from './arreglo.js';
import {PartituraMusical} from './partitura-musical.js';
import {VentanaInterpretaciones} from './interpretaciones.js';
import {TAMANOS_ZONA} from './estadistica-zonal.js';
import {NOMBRES_RECORRIDO} from '../recorridos.js';

const porId = id => document.getElementById(id);
const botones = ['play', 'mus-escuchar', 'pausa', 'descargar-wav', 'marcar', 'informe', 'descargar-datos', 'linea-tiempo'];
const tipos = {imagen: 'Imagen', video: 'Video'};
const modoId = {medio: 'ver-medio', mercator: 'ver-mapa', globe: 'ver-globo'};

class AplicacionVisor {
    constructor() {
        this.catalogo = new Catalogo();
        this.lector = new LectorMedios();
        this.transporte = new Transporte((t, activo, preparando) => this.actualizar(t, activo, preparando),
            (avance, modo) => this.progresoAudio(avance, modo));
        this.videoFuente = new ReproductorVideo(porId('video-fuente-panel'), porId('video-sincronizado'), () => this.transporte.pausar());
        this.rocola = new Rocola({
            disco: () => this.secuencia ? this.alternarReproduccion() : this.rocola.abrirCatalogo(),
            reproducir: () => this.reproducir(),
            pausar: () => this.transporte.pausar(),
        });
        this.daw = new EstudioDAW(this.transporte, this.catalogo, {
            reproducir: () => this.reproducir('arreglo'),
            probarPista: canal => this.probarPista(canal),
            cambiarMezcla: (mezcla, rehacer) => this.configurarMusica(mezcla, rehacer),
            informarError: error => this.errorAudio(error),
        });
        this.partitura = new PartituraMusical(() => this.configurarMusica(this.daw.mezcla, true).catch(e => this.estado(e.message, true)),
            tiempo => this.transporte.buscar(tiempo, 'arreglo').catch(e => this.errorAudio(e)), () => this.transporte.pausar());
        this.interpretaciones = new VentanaInterpretaciones(() => {
            this.transporte.pausar();
            this.daw.detenerMIDI();
            this.daw.detenerPrueba();
        });
        this.editorArea = new SeleccionArea(porId('mascara-dialogo'), puntos => this.guardarArea(puntos));
        this.paneles = new Paneles(indice => this.buscar(indice));
        this.gis = new VisorGIS(porId('mapa'), porId('mensaje-mapa'), (indice, tiempo) => this.buscar(indice, tiempo));
        this.entradas = [];
        this.marcas = [];
        this.filtro = 'todos';
        this.vista = 'medio';
        this.portadas = new Map();
        this.enlazar();
    }

    async iniciar() {
        try {
            const [precargados, locales] = await Promise.all([this.catalogo.precargados(), this.catalogo.locales()]);
            this.entradas = [...precargados, ...locales];
            this.pintarPaquetes();
            await this.daw.restaurarGuardada();
            this.pintarMedios();
            this.estado('Listo. Elige un disco en el catálogo.');
        } catch (error) {
            this.estado(error.message, true);
        }
    }

    estado(texto, error = false) {
        porId('estado-app').textContent = texto;
        porId('estado-app').classList.toggle('error', error);
    }

    progreso(valor, mensaje) {
        this.mostrarAvance('medio', valor);
        if (mensaje) this.estado(mensaje);
    }

    mostrarAvance(tipo, valor) {
        porId('progreso-' + tipo + '-fila').hidden = valor === null;
        if (valor === null) return;
        const porcentaje = Math.round(valor);
        porId('progreso-' + tipo).value = porcentaje;
        porId('progreso-' + tipo + '-valor').textContent = porcentaje + ' %';
    }

    progresoAudio(avance, modo) {
        const valor = Math.round(avance * 100);
        this.mostrarAvance('audio', valor);
        porId('progreso-audio-texto').textContent = modo === 'arreglo'
            ? (valor === 100 ? 'Arreglo listo' : 'Generando audio del arreglo')
            : (valor === 100 ? 'Audio RGB generado' : 'Sintetizando píxeles RGB con Tone.js');
        this.daw.progreso(valor, modo);
    }

    informarPartitura(mostrada) {
        const s = this.secuencia;
        const origen = s.datos.copia ? 'Descarga original incluida' : s.datos.normalizado
            ? 'Descarga original decodificada por la API' : 'Archivo abierto';
        const tramo = this.medio.tipo === 'video'
            ? ` · tramo ${s.datos.inicio.toFixed(1)}–${(s.datos.inicio + this.datos.duracion).toFixed(1)} s` : '';
        this.progreso(100, origen + tramo + (mostrada ? ' · Partituras visibles' : ' · Partitura RGB disponible'));
    }

    enlace(id, url) {
        const a = porId(id);
        a.hidden = !url;
        if (url) a.href = recurso(url);
        else a.removeAttribute('href');
    }

    tarjeta(titulo, detalle, activa, portada, accion) {
        const boton = document.createElement('button');
        boton.className = 'tarjeta' + (portada ? '' : ' tarjeta-medio');
        boton.type = 'button';
        boton.setAttribute('aria-current', String(activa));
        let icono;
        if (portada) {
            icono = document.createElement('img');
            icono.alt = '';
            icono.loading = 'lazy';
            icono.src = portada;
            icono.onerror = () => {
                const marcador = document.createElement('span');
                marcador.className = 'sin-portada';
                marcador.textContent = '◉';
                icono.replaceWith(marcador);
            };
        } else {
            icono = document.createElement('span');
            icono.className = 'tipo-icono';
            icono.textContent = detalle.startsWith('Video') ? '▶' : '◫';
        }
        const texto = document.createElement('span');
        const fuerte = document.createElement('strong');
        const pequeno = document.createElement('small');
        fuerte.textContent = titulo;
        pequeno.textContent = detalle;
        texto.append(fuerte, pequeno);
        boton.append(icono, texto);
        boton.addEventListener('click', accion);
        return boton;
    }

    pintarPaquetes() {
        const consulta = porId('buscar-paquete').value.trim().toLocaleLowerCase();
        porId('cuenta-paquetes').textContent = String(this.entradas.length);
        const tarjetas = this.entradas.filter(p => p.titulo.toLocaleLowerCase().includes(consulta)).map(p => {
            if (p.portada_archivo && !this.portadas.has(p.id)) this.portadas.set(p.id, URL.createObjectURL(p.portada_archivo));
            const imagenes = p.imagenes ?? p.medios.filter(m => m.tipo === 'imagen').length;
            const videos = p.videos ?? p.medios.filter(m => m.tipo === 'video').length;
            const portada = this.portadas.get(p.id) || (p.portada && recurso(p.portada));
            const descargas = p.descargas_incluidas ? ` · ${p.descargas_incluidas} descargas incluidas` : '';
            return this.tarjeta(p.titulo, `${imagenes} imágenes · ${videos} videos${descargas}`,
                p.id === this.paquete?.id, portada, () => this.seleccionarPaquete(p));
        });
        porId('lista-paquetes').replaceChildren(...tarjetas);
    }

    pintarMedios() {
        const medios = this.paquete?.medios || [];
        const consulta = porId('buscar-medio').value.trim().toLocaleLowerCase();
        const seleccionados = medios.filter(m => (this.filtro === 'todos' || m.tipo === this.filtro)
            && [m.titulo, m.grupo, m.url, m.archivo?.name].some(t => t?.toLocaleLowerCase().includes(consulta)));
        porId('cuenta-medios').textContent = `${seleccionados.length} / ${medios.length}`;
        const tarjetas = seleccionados.map(medio => this.tarjeta(medio.titulo,
            [tipos[medio.tipo], medio.copia_local && 'Descarga incluida', medio.grupo].filter(Boolean).join(' · '),
            medio.id === this.medio?.id,
            medio.vista_local && medio.tipo === 'imagen' ? recurso(medio.vista_local) : null,
            () => {
                porId('catalogo-dialogo').close();
                this.seleccionarMedio(medio);
            }));
        if (!tarjetas.length) {
            const texto = document.createElement('p');
            texto.className = 'lista-vacia';
            texto.textContent = this.paquete ? 'No hay medios para este filtro.' : 'Elige una página para ver sus imágenes y videos.';
            tarjetas.push(texto);
        }
        if (this.filtro === 'todos') for (const pendiente of this.paquete?.pendientes || []) {
            if (!pendiente.url) continue;
            const a = document.createElement('a');
            a.className = 'boton discreto';
            a.textContent = pendiente.titulo + ' ↗';
            a.href = pendiente.url;
            a.target = '_blank';
            a.rel = 'noopener';
            tarjetas.push(a);
        }
        porId('lista-medios').replaceChildren(...tarjetas);
    }

    async seleccionarPaquete(entrada, abrirMedio = false) {
        if (!entrada) return;
        this.peticionPaquete?.abort();
        this.peticionMedio?.abort();
        const peticion = this.peticionPaquete = new AbortController();
        this.reiniciarMedio();
        this.estado('Abriendo paquete…');
        try {
            const paquete = await this.catalogo.cargar(entrada, peticion.signal);
            if (peticion.signal.aborted) return;
            this.paquete = paquete;
            for (const id of ['abrir-interpretaciones','catalogo-interpretaciones']) porId(id).disabled = false;
            porId('titulo-paquete').textContent = paquete.titulo;
            porId('proveedor').textContent = paquete.proveedor || 'Paquete local';
            this.enlace('fuente-paquete', paquete.fuente);
            this.filtro = 'todos';
            porId('buscar-medio').value = '';
            porId('titulo-submenu').textContent = paquete.titulo;
            this.pintarPaquetes();
            this.marcarFiltro();
            const inicial = paquete.medios.find(m => m.id === paquete.medio_inicial)
                || paquete.medios.find(m => m.tipo === 'imagen') || paquete.medios[0];
            if (abrirMedio) await this.seleccionarMedio(inicial);
            else this.estado('Selecciona la imagen o el video que quieres sonificar.');
        } catch (error) {
            if (!peticion.signal.aborted) this.estado(error.message, true);
        }
    }

    marcarFiltro() {
        document.querySelectorAll('[data-filtro]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filtro === this.filtro)));
        this.pintarMedios();
    }

    reiniciarMedio() {
        this.secuencia = null;
        porId('sonido-estado').textContent = 'Selecciona un medio.';
        this.daw.detenerPrueba();
        this.datos = null;
        this.videoFuente.cargar(null);
        this.progreso(null);
        this.mostrarAvance('audio', null);
        this.geo = null;
        this.marcas = [];
        this.claveMarcas = null;
        this.pintarMarcas();
        this.rocola.estado(false, false);
        this.daw.estado(false, false);
        for (const id of ['abrir-mascara','modo-fondo','tolerancia-fondo','abrir-geo']) porId(id).disabled = true;
        porId('quitar-mascara').hidden = true;
        porId('estado-mascara').textContent = '';
        this.refrescarGeo();
        this.transporte.cargar(null);
        this.partitura.cargar(null);
        this.paneles.limpiar();
        porId('pixel-activo').textContent = '–';
        porId('tiempo-actual').textContent = '0.000 s';
        porId('tiempo-total').textContent = '0.000 s';
        porId('linea-tiempo').value = 0;
        this.gis.configurar(null, null);
        this.gis.indice = 0;
        this.indice = -1;
        this.deshabilitarControles();
    }

    async seleccionarMedio(medio, opcion = 0, reiniciarTramo = true) {
        if (!medio) return;
        this.peticionMedio?.abort();
        const peticion = this.peticionMedio = new AbortController();
        this.reiniciarMedio();
        this.medio = medio;
        this.opcion = opcion;
        this.datos = null;
        this.marcas = [];
        this.pintarMarcas();
        this.pintarMedios();
        porId('titulo-medio').textContent = medio.titulo;
        porId('info-medio').textContent = medio.descripcion || tipos[medio.tipo];
        porId('duracion-fila').hidden = medio.tipo !== 'imagen';
        porId('inicio-fila').hidden = medio.tipo !== 'video';
        if (reiniciarTramo) porId('inicio-video').value = '0';
        const archivos = [medio, ...(medio.variantes || [])];
        const varianteElegida = archivos[opcion] || medio;
        const elegido = varianteElegida === medio ? medio : {...medio, ...varianteElegida,
            titulo: medio.titulo, vista_local: null, copia_local: varianteElegida.copia_local};
        this.enlace('fuente-medio', elegido.url);
        porId('archivo-activo').textContent = elegido.archivo?.name || elegido.nombre || elegido.url?.split('/').at(-1) || '';
        porId('cargar-original').hidden = true;
        const variante = porId('variante');
        variante.replaceChildren(...archivos.map((m, i) => {
            const opcion = document.createElement('option');
            opcion.value = String(i);
            opcion.textContent = (i ? '' : 'Principal · ') + (m.nombre || m.url?.split('/').at(-1) || m.archivo?.name || medio.titulo);
            return opcion;
        }));
        variante.value = String(opcion);
        porId('fila-variante').hidden = archivos.length <= 1;
        this.rocola.montar(medio.titulo, this.paquete.titulo, this.portadas.get(this.paquete.id)
            || (this.paquete.portada_local || this.paquete.portada ? recurso(this.paquete.portada_local || this.paquete.portada) : null));
        this.progreso(10, 'Abriendo el archivo…');
        porId('sonido-estado').textContent = 'Preparando los píxeles.';
        try {
            const geografia = this.catalogo.ajuste(this.clave('geo'));
            const fondo = this.catalogo.ajuste(this.clave('fondo'));
            const datos = await this.lector.cargar(elegido, {
                lado: Number(porId('cuadricula').value), duracion: Number(porId('duracion').value),
                inicio: Number(porId('inicio-video').value),
            }, peticion.signal, (hechos, total) => this.progreso(30 + 45 * hechos / total, `Muestreando fotogramas ${hechos} de ${total}…`),
            mensaje => this.progreso(22, mensaje));
            const [guardada, modoFondo] = await Promise.all([geografia, fondo]);
            if (peticion.signal.aborted) {
                if (datos.video) liberarVideo(datos.video, datos.blob);
                return;
            }
            this.datos = datos;
            this.videoFuente.cargar(datos);
            this.medioLeido = elegido;
            this.fondo = modoFondo || {modo: medio.mascara?.modo || 'alfa', tolerancia: 28, poligono: null};
            porId('modo-fondo').value = this.fondo.modo;
            porId('tolerancia-fondo').value = this.fondo.tolerancia;
            for (const id of ['abrir-mascara','modo-fondo','tolerancia-fondo','abrir-geo']) porId(id).disabled = false;
            this.geo = guardada === undefined ? this.datos.geografia || medio.geografia || null : guardada;
            if (this.geo?.tipo === 'esquinas') {
                try { leerGeografia('esquinas', this.geo.coordenadas.map(p => p.join(',')).join('\n')); }
                catch { this.geo = null; }
            }
            await this.crearSecuencia(peticion.signal);
            if (peticion.signal.aborted || !this.secuencia) return;
            if (medio.tipo === 'video') porId('inicio-video').max = Math.max(0, this.datos.duracionFuente - .05);
            this.mostrarVista('medio');
        } catch (error) {
            if (peticion.signal.aborted) return;
            this.estado(error.name === 'TimeoutError'
                ? 'La conversión tardó demasiado. Prueba una variante MP4/WebM más pequeña.'
                : error.message, true);
            this.progreso(null);
            porId('cargar-original').hidden = !elegido.url;
            porId('sonido-estado').textContent = 'No se pudo abrir la descarga original. Selecciona otra variante o carga el archivo descargado desde tu equipo.';
            this.mostrarVista('medio');
        }
    }

    clave(tipo) {
        return `${tipo}:${this.paquete?.id}:${this.medio?.id}${tipo === 'marcas' ? ':' + porId('recorrido').value + ':' + porId('cuadricula').value + ':' + porId('inicio-video').value + ':' + porId('duracion').value + ':' + porId('velocidad-recorrido').value + ':' + (this.opcion || 0) : ''}`;
    }

    deshabilitarControles() {
        botones.forEach(id => { porId(id).disabled = true; });
        for (const id of ['play', 'mus-escuchar']) porId(id).setAttribute('aria-pressed', 'false');
    }

    async crearSecuencia(signal) {
        if (!this.datos || signal?.aborted) return;
        this.secuencia = null;
        this.transporte.cargar(null);
        this.partitura.cargar(null);
        this.mostrarAvance('audio', null);
        this.rocola.estado(false, false);
        this.daw.estado(false, false);
        porId('sonido-estado').textContent = 'Preparando el recorrido.';
        this.deshabilitarControles();
        this.videoFuente.mover(0, false);
        const velocidad = Number(porId('velocidad-recorrido').value);
        const duracion = (this.medio.tipo === 'imagen' ? Number(porId('duracion').value) : this.datos.duracion) / velocidad;
        const revision = this.revisionSecuencia = Symbol();
        const vigente = () => !signal?.aborted && revision === this.revisionSecuencia;
        porId('herramientas').open = true;
        this.progreso(80, 'Calculando recorrido, máscara y zona sonora…');
        await new Promise(resolve => setTimeout(resolve, 0));
        if (!vigente()) return;
        this.secuencia = new SecuenciaSonora(this.medioLeido, {
            ...this.datos, duracion, velocidad, video: undefined, blob: undefined,
        },
            Number(porId('cuadricula').value), porId('recorrido').value, this.fondo,
            Number(porId('tamano-zona').value), porId('escala-frecuencia').value);
        const s = this.secuencia;
        porId('ritmo-lectura').textContent = `${NOMBRES_RECORRIDO[s.recorrido]} · ${s.pixeles.toLocaleString('es-CO')} celdas · ${(1000 * s.segundos_por_pixel).toLocaleString('es-CO', {maximumFractionDigits: 2})} ms por celda`;
        porId('regla-zona').textContent = s.tamanoZona === 1 ? '1 × 1 usa el RGB de la celda activa.'
            : '70 % de la celda activa y 30 % del promedio de sus vecinos válidos.';
        this.paneles.cargar(this.secuencia);
        this.paneles.actualizarOcupacion(Number(porId('niveles').value), porId('ambito').value);
        this.indice = -1;
        this.gis.indice = 0;
        this.gis.configurar(this.secuencia, this.geo);
        this.progreso(90, 'Generando la partitura de este recorrido…');
        const arreglo = new ArregloMusical(this.secuencia, this.partitura.opciones, this.daw.mezcla);
        const dibujada = this.partitura.cargar(arreglo);
        this.transporte.cargar(this.secuencia, arreglo);
        for (const id of ['descargar-wav', 'informe', 'descargar-datos', 'linea-tiempo']) porId(id).disabled = false;
        this.rocola.estado(true, false);
        this.daw.estado(true, false);
        this.leerMascara();
        this.refrescarGeo();
        this.progreso(95, 'Dibujando la partitura del medio…');
        const secuencia = this.secuencia;
        const clave = this.clave('marcas');
        if (this.claveMarcas !== clave) {
            this.marcas = [];
            this.pintarMarcas();
        }
        const [marcas, mostrada] = await Promise.all([this.catalogo.ajuste(clave), dibujada]);
        if (vigente()) this.informarPartitura(mostrada);
        if (vigente() && clave === this.clave('marcas') && this.secuencia === secuencia && this.claveMarcas !== clave) {
            this.claveMarcas = clave;
            this.marcas = marcas || [];
            this.pintarMarcas();
        }
    }

    async configurarMusica(mezcla, reconstruir) {
        let arreglo = this.transporte.arreglo;
        let dibujada;
        if (this.transporte.secuencia && reconstruir) {
            this.progreso(90, 'Actualizando la partitura…');
            arreglo = new ArregloMusical(this.secuencia, this.partitura.opciones, mezcla);
            dibujada = this.partitura.cargar(arreglo, this.transporte.tiempo, true);
        }
        await this.transporte.configurar(mezcla, arreglo);
        if (dibujada) {
            const mostrada = await dibujada;
            if (this.secuencia && this.transporte.arreglo === arreglo) this.informarPartitura(mostrada);
        }
    }

    leerMascara() {
        const s = this.secuencia;
        if (!s) return;
        const fuera = s.pixeles - s.validos;
        const poligono = this.fondo?.poligono;
        porId('quitar-mascara').hidden = !poligono;
        porId('tolerancia-grupo').hidden = this.fondo.modo !== 'auto';
        const aviso = !fuera && this.fondo.modo === 'auto' ? ' No se detectó un fondo uniforme. Puedes delimitar el área.' : '';
        porId('estado-mascara').textContent = `${s.validos} muestras válidas · ${fuera} excluidas.` + aviso;
    }

    guardarFondo(fondo) {
        this.fondo = fondo;
        porId('modo-fondo').value = fondo.modo;
        this.catalogo.ajustar(this.clave('fondo'), fondo).catch(() => {});
        this.crearSecuencia(this.peticionMedio?.signal).catch(e => this.estado(e.message, true));
    }

    guardarArea(poligono) {
        this.guardarFondo({...this.fondo, poligono, modo: 'area'});
    }

    errorAudio(error) {
        if (error.name === 'AbortError') return;
        this.mostrarAvance('audio', null);
        this.estado(error.message, true);
        porId('sonido-estado').textContent = error.message;
    }

    reproducir(modo = 'arreglo') {
        this.daw.detenerMIDI();
        this.daw.detenerPrueba();
        return this.transporte.reproducir(modo).catch(e => this.errorAudio(e));
    }

    probarPista(canal) {
        this.transporte.pausar();
        this.daw.detenerMIDI();
        return this.daw.escucharPista(canal);
    }

    alternarReproduccion() {
        if (this.transporte.nodo || this.transporte.preparando) this.transporte.pausar();
        else this.reproducir();
    }

    actualizar(tiempo, activo, preparando = false) {
        if (!this.transporte.secuencia) return;
        const s = this.secuencia, esArreglo = this.transporte.modo === 'arreglo';
        const tiempoRGB = Math.min(s.duracion_s, tiempo);
        const indice = s.indice(tiempoRGB);
        if (Number(porId('linea-tiempo').max) !== this.transporte.duracion) {
            porId('linea-tiempo').max = this.transporte.duracion;
            porId('tiempo-total').textContent = this.transporte.duracion.toFixed(3) + ' s';
        }
        porId('linea-tiempo').value = tiempo;
        porId('tiempo-actual').textContent = tiempo.toFixed(3) + ' s';
        porId('pausa').disabled = !activo && !preparando;
        porId('play').disabled = !esArreglo && (activo || preparando);
        porId('mus-escuchar').disabled = esArreglo && (activo || preparando);
        porId('play').setAttribute('aria-pressed', String(!esArreglo && (activo || preparando)));
        porId('mus-escuchar').setAttribute('aria-pressed', String(esArreglo && (activo || preparando)));
        const estado = `${esArreglo ? 'Arreglo para tocar' : 'Sonificación RGB'} · ${tipos[s.medio.tipo]} · ${s.lado} × ${s.lado}`;
        if (porId('sonido-estado').textContent !== estado) porId('sonido-estado').textContent = estado;
        this.rocola.estado(true, activo, preparando);
        this.daw.estado(true, activo, preparando);
        this.paneles.actualizar(indice, tiempoRGB, !activo);
        this.partitura.actualizar(esArreglo ? tiempo : tiempoRGB, esArreglo || (!activo && !preparando));
        this.videoFuente.mover(tiempoRGB, activo && tiempo < s.duracion_s, s.datos.velocidad);
        if (this.indice !== indice) {
            this.indice = indice;
            this.gis.pintar(indice);
            const [x, y] = this.secuencia.coordenadas[indice];
            this.videoFuente.marcar(x, y, this.secuencia.lado);
            const posicion = posicionGeografica(this.geo, x, y, this.secuencia.lado);
            porId('pixel-activo').textContent = `${indice + 1} / ${this.secuencia.pixeles} · columna ${x + 1}, fila ${y + 1}`
                + (posicion ? ` · ${posicion.map(v => v.toFixed(5)).join(', ')}` : '')
                + (this.secuencia.validez[indice] ? '' : ' · Fuera de la máscara');
            porId('marcar').disabled = !this.secuencia.validez[indice];
        }
    }

    buscar(indice, tiempo) {
        if (!this.secuencia) return;
        const punto = Math.max(0, Math.min(this.secuencia.pixeles - 1, indice));
        this.transporte.buscar(tiempo ?? (punto + .5) * this.secuencia.segundos_por_pixel).catch(e => this.errorAudio(e));
    }

    mostrarVista(modo) {
        this.vista = modo;
        for (const [tipo, id] of Object.entries(modoId)) porId(id).setAttribute('aria-pressed', String(tipo === modo));
        porId('escena-medio').hidden = modo !== 'medio';
        porId('mapa').style.visibility = modo === 'medio' ? 'hidden' : 'visible';
        porId('mensaje-mapa').hidden = modo === 'medio';
        if (modo !== 'medio') {
            this.ultimaVistaGIS = modo;
            this.gis.proyectar(modo);
            this.gis.centrar();
        }
    }

    refrescarGeo() {
        porId('geo-estado').textContent = this.geo
            ? `${this.geo.tipo === 'esquinas' ? 'Capa GIS' : 'Punto de referencia'} · ${this.geo.origen}`
            : 'Sin georreferencia';
        porId('centrar').disabled = !this.geo;
        porId('opacidad').disabled = this.geo?.tipo !== 'esquinas';
    }

    async asignarGeo(geo) {
        this.geo = geo;
        this.gis.configurar(this.secuencia, geo);
        this.pintarMarcas();
        this.refrescarGeo();
        this.indice = -1;
        this.actualizar(this.transporte.tiempo, Boolean(this.transporte.nodo));
        if (geo) this.mostrarVista(this.ultimaVistaGIS || 'globe');
        try { await this.catalogo.ajustar(this.clave('geo'), geo); }
        catch { this.estado('La ubicación se aplicó para esta sesión.'); }
    }

    pintarMarcas() {
        const geojson = coleccionMarcas(this.secuencia, this.geo, this.marcas);
        this.gis.marcar(geojson);
        porId('marcas-geojson').disabled = !geojson.features.length;
        porId('marcas-estado').textContent = `${this.marcas.length} marcas · ${geojson.features.length} con coordenadas SIG`;
        porId('lista-marcas').replaceChildren(...this.marcas.map(marca => {
            const fila = document.createElement('span');
            const abrir = document.createElement('button');
            const quitar = document.createElement('button');
            const punto = geojson.features.find(f => f.id === marca.indice);
            abrir.type = quitar.type = 'button';
            abrir.textContent = 'Píxel ' + (marca.indice + 1) + (punto ? ' · ' + punto.geometry.coordinates.map(v => v.toFixed(5)).join(', ') : '');
            abrir.title = marca.nota || 'Ir a la marca';
            abrir.onclick = () => this.buscar(marca.indice, marca.tiempo);
            quitar.textContent = '×';
            quitar.setAttribute('aria-label', 'Quitar marca del píxel ' + (marca.indice + 1));
            quitar.onclick = () => {
                this.marcas = this.marcas.filter(m => m !== marca);
                this.guardarMarcas();
            };
            fila.append(abrir, quitar);
            return fila;
        }));
    }

    guardarMarcas() {
        this.pintarMarcas();
        this.claveMarcas = this.clave('marcas');
        this.catalogo.ajustar(this.claveMarcas, this.marcas).catch(() => this.estado('Las marcas se conservarán durante esta sesión.'));
    }

    informe() {
        return new Informe(this.secuencia, this.paquete, Number(porId('niveles').value), this.marcas, this.geo,
            this.daw.mezcla, this.transporte.arreglo);
    }

    enlazar() {
        for (const [modo, id] of Object.entries(modoId)) porId(id).onclick = () => this.mostrarVista(modo);
        porId('buscar-paquete').oninput = () => this.pintarPaquetes();
        porId('buscar-medio').oninput = () => this.pintarMedios();
        for (const id of ['abrir-interpretaciones','catalogo-interpretaciones']) {
            porId(id).onclick = () => {
                porId('catalogo-dialogo').close();
                this.interpretaciones.abrir(this.paquete).catch(error => this.estado(error.message, true));
            };
        }
        for (const id of ['nav-analisis','abrir-analisis']) porId(id).onclick = () => { porId('herramientas').open = true; };
        porId('herramientas').addEventListener('toggle', () => {
            if (!porId('herramientas').open) return;
            if (this.vista !== 'medio') this.mostrarVista(this.vista);
            if (this.transporte.secuencia) {
                this.actualizar(this.transporte.tiempo, Boolean(this.transporte.nodo), this.transporte.preparando);
            }
        });
        porId('abrir-mascara').onclick = () => {
            if (this.datos && this.secuencia) this.editorArea.abrir(this.datos, this.fondo.poligono, this.secuencia.fotogramaIndice(this.indice));
        };
        porId('modo-fondo').onchange = e => {
            if (!this.secuencia) return;
            if (e.target.value === 'area' && !this.fondo.poligono) {
                e.target.value = this.fondo.modo;
                porId('abrir-mascara').click();
            } else this.guardarFondo({...this.fondo, modo: e.target.value});
        };
        porId('tolerancia-fondo').onchange = e => this.guardarFondo({...this.fondo, tolerancia: Number(e.target.value)});
        porId('quitar-mascara').onclick = () => this.guardarFondo({...this.fondo, modo: 'alfa', poligono: null});
        document.querySelectorAll('[data-filtro]').forEach(boton => {
            boton.onclick = () => { this.filtro = boton.dataset.filtro; this.marcarFiltro(); };
        });
        porId('cargar-original').onclick = () => this.seleccionarMedio(this.medio, this.opcion, false);
        porId('variante').onchange = evento => {
            const indice = Number(evento.target.value);
            this.seleccionarMedio(this.medio, indice);
        };
        porId('play').onclick = () => this.reproducir('rgb');
        porId('mus-escuchar').onclick = () => this.reproducir();
        porId('pausa').onclick = () => this.transporte.pausar();
        porId('linea-tiempo').oninput = e => this.transporte.buscar(Number(e.target.value)).catch(e => this.errorAudio(e));
        porId('volumen').oninput = e => this.transporte.cambiarVolumen(Number(e.target.value));
        porId('opacidad').oninput = e => this.gis.cambiarOpacidad(Number(e.target.value));
        porId('centrar').onclick = () => this.gis.centrar();
        porId('recorrido').replaceChildren(...Object.entries(NOMBRES_RECORRIDO).map(([valor, nombre]) =>
            new Option(nombre, valor, valor === 'filas', valor === 'filas')));
        porId('tamano-zona').replaceChildren(...TAMANOS_ZONA.map(n => new Option(n + ' × ' + n, n, n === 1, n === 1)));
        for (const id of ['recorrido','duracion','tamano-zona','velocidad-recorrido','escala-frecuencia']) porId(id).onchange = () => this.crearSecuencia(this.peticionMedio?.signal).catch(e => this.estado(e.message, true));
        porId('cuadricula').onchange = () => this.seleccionarMedio(this.medio, this.opcion, false);
        porId('cambiar-tramo').onclick = () => {
            if (this.medio?.tipo === 'video') this.seleccionarMedio(this.medio, this.opcion, false);
        };
        for (const id of ['niveles', 'ambito']) porId(id).onchange = () => {
            this.paneles.actualizarOcupacion(Number(porId('niveles').value), porId('ambito').value);
            if (this.transporte.secuencia) this.paneles.actualizar(this.indice, Math.min(this.transporte.tiempo, this.secuencia.duracion_s), true);
        };
        porId('ventana-partitura').onchange = e => {
            this.paneles.ventana = Number(e.target.value);
            this.paneles.inicio = -1;
            if (this.transporte.secuencia) this.paneles.partituras(this.indice, Math.min(this.transporte.tiempo, this.secuencia.duracion_s));
        };
        porId('partitura-tecnica').addEventListener('toggle', () => {
            if (this.transporte.secuencia && porId('partitura-tecnica').open) {
                this.paneles.partituras(this.indice, Math.min(this.transporte.tiempo, this.secuencia.duracion_s));
            }
        });
        porId('marcar').onclick = () => {
            if (!this.secuencia?.validez[this.indice]) return;
            const nota = porId('nota-marca').value.trim();
            this.marcas = this.marcas.filter(m => m.indice !== this.indice);
            this.marcas.push({indice: this.indice, nota, tiempo: Math.min(this.transporte.tiempo, this.secuencia.duracion_s)});
            porId('nota-marca').value = '';
            this.guardarMarcas();
        };
        porId('marcas-geojson').onclick = () => descargar(new Blob([
            JSON.stringify(coleccionMarcas(this.secuencia, this.geo, this.marcas), null, 2),
        ], {type: 'application/geo+json'}), 'orbita-marcas.geojson');
        porId('informe').onclick = () => { this.transporte.pausar(); this.informe().mostrar(); };
        porId('descargar-datos').onclick = () => descargar(
            new Blob([JSON.stringify(this.informe().datos(), null, 2)], {type: 'application/json'}), 'orbita-analisis.json');
        porId('abrir-importar').onclick = e => { e.preventDefault(); porId('importar').showModal(); };
        document.querySelectorAll('[data-cerrar]').forEach(b => { b.onclick = () => porId(b.dataset.cerrar).close(); });
        porId('form-importar').onsubmit = e => this.importar(e);
        porId('abrir-geo').onclick = () => {
            if (!this.medio) return;
            porId('tipo-geo').value = this.geo?.tipo || 'punto';
            const coordenadas = this.geo?.coordenadas;
            porId('coordenadas').value = this.geo?.tipo === 'esquinas' ? coordenadas.map(p => p.join(', ')).join('\n') : coordenadas?.join(', ') || '';
            porId('geo-error').textContent = '';
            porId('georreferencia').showModal();
        };
        porId('form-geo').onsubmit = e => {
            e.preventDefault();
            try {
                const geo = leerGeografia(porId('tipo-geo').value, porId('coordenadas').value);
                this.asignarGeo(geo);
                porId('georreferencia').close();
            } catch (error) { porId('geo-error').textContent = error.message; }
        };
        porId('quitar-geo').onclick = () => { this.asignarGeo(null); porId('georreferencia').close(); };
    }

    async importar(evento) {
        evento.preventDefault();
        const boton = porId('importar-enviar'), estado = porId('importar-estado');
        boton.disabled = true;
        estado.textContent = 'Leyendo las fuentes…';
        try {
            const {paquete, fallos} = await this.catalogo.importar(
                porId('titulo-nuevo').value.trim(), porId('urls').value.split(/\n+/),
                [...porId('archivos').files], porId('portada-nueva').files[0],
            );
            this.entradas.push(paquete);
            evento.target.reset();
            porId('importar').close();
            await this.seleccionarPaquete(paquete, paquete.medios.length === 1);
            if (paquete.medios.length > 1) this.rocola.abrirCatalogo();
            if (fallos.length) this.estado(fallos.join(' · '), true);
        } catch (error) { estado.textContent = error.message; }
        finally { boton.disabled = false; }
    }
}

try {
    const app = new AplicacionVisor();
    app.reiniciarMedio();
    app.iniciar();
} catch (error) {
    porId('estado-app').textContent = 'No se pudo iniciar el visor. ' + error.message;
}
