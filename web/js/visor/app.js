import {coleccionMarcas} from './marcas-sig.js';
import {Catalogo, extension, recurso} from './catalogo.js';
import {VisorGIS, leerGeografia, posicionGeografica} from './gis.js?v=5.8.0';
import {descargar, Informe} from './informe.js?v=5.8.0';
import {LectorMedios} from './medios.js';
import {Paneles} from './paneles.js?v=5.8.0';
import {SecuenciaSonora, Transporte} from './sonificacion.js?v=5.8.0';
import {SeleccionArea} from './mascara.js';
import {Rocola} from './rocola.js?v=5.8.0';
import {EstudioDAW} from './daw.js?v=5.8.0';
import {ArregloMusical, nombreAfinado, tonalidadNombre} from './arreglo.js?v=5.8.0';
import {PartituraMusical} from './partitura-musical.js?v=5.8.0';
import {InterpretacionesEnPantalla} from './interpretaciones.js';
import {letraInicial, sugerirLetra} from './letra.js?v=5.8.0';
import {VozGrabada} from './voz-grabada.js';
import {TAMANOS_ZONA, ZONA_INICIAL} from './estadistica-zonal.js';
import {NOMBRES_RECORRIDO} from '../recorridos.js';

const porId = id => document.getElementById(id);
const botones = ['mus-escuchar', 'pausa', 'marcar', 'informe', 'descargar-datos', 'linea-tiempo'];
const FORMATOS_LOCAL = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif', 'bmp', 'gif']);
const modoId = {medio: 'ver-medio', mercator: 'ver-mapa', globe: 'ver-globo'};

class AplicacionVisor {
    constructor() {
        this.catalogo = new Catalogo();
        this.lector = new LectorMedios();
        this.transporte = new Transporte((t, activo, preparando) => this.actualizar(t, activo, preparando),
            (avance, modo) => this.progresoAudio(avance, modo));
        this.vozGrabada = new VozGrabada(this.transporte);
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
            tiempo => this.transporte.buscar(tiempo, 'arreglo').catch(e => this.errorAudio(e)), () => this.transporte.pausar(),
            () => this.letraActual());
        this.interpretaciones = new InterpretacionesEnPantalla(() => {
            this.transporte.pausar();
            this.daw.detenerMIDI();
            this.daw.detenerPrueba();
        });
        this.editorArea = new SeleccionArea(porId('mascara-dialogo'), puntos => this.guardarArea(puntos));
        this.paneles = new Paneles(indice => this.buscar(indice));
        this.gis = new VisorGIS(porId('mapa'), porId('mensaje-mapa'), (indice, tiempo) => this.buscar(indice, tiempo));
        this.entradas = [];
        this.marcas = [];
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
            this.estado('Elige una imagen de la galería.');
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
            ? (valor === 100 ? 'Arreglo listo' : valor < 34 ? 'Preparando las notas de los instrumentos' : 'Mezclando el arreglo')
            : (valor === 100 ? 'Audio RGB generado' : 'Sintetizando píxeles RGB');
        if (modo === 'arreglo' && this.transporte.preparando) this.rocola.mensaje(`Preparando audio · ${valor} %`);
        this.daw.progreso(valor, modo);
    }

    informarPartitura(mostrada) {
        const s = this.secuencia;
        const origen = s.datos.copia ? 'Descarga original incluida' : s.datos.normalizado
            ? 'Descarga original decodificada por la API' : 'Archivo abierto';
        this.progreso(100, origen + (mostrada ? ' · Partitura visible' : ' · Partitura disponible en MusicXML'));
    }

    enlace(id, url) {
        const a = porId(id);
        a.hidden = !url;
        if (url) a.href = recurso(url);
        else a.removeAttribute('href');
    }

    portada(paquete) {
        const archivo = paquete.portada_archivo;
        if (archivo && !this.portadas.has(paquete.id)) this.portadas.set(paquete.id, URL.createObjectURL(archivo));
        const url = paquete.portada_local || paquete.portada;
        return this.portadas.get(paquete.id) || (url ? recurso(url) : null);
    }

    pintarPaquetes() {
        const tarjetas = this.entradas.flatMap(paquete => {
            const medios = paquete.medios?.filter(m => m.tipo === 'imagen');
            if (medios ? !medios.length : !paquete.imagenes) return [];
            const portada = this.portada(paquete);
            if (!portada) return [];
            const boton = document.createElement('button');
            boton.type = 'button';
            boton.dataset.paquete = paquete.id;
            boton.title = paquete.titulo;
            boton.setAttribute('aria-label', paquete.titulo);
            boton.setAttribute('aria-pressed', String(paquete.id === this.paquete?.id));
            const imagen = document.createElement('img');
            imagen.alt = '';
            imagen.loading = 'lazy';
            imagen.src = portada;
            imagen.onerror = () => boton.remove();
            boton.append(imagen);
            boton.onclick = () => this.seleccionarPaquete(paquete);
            return [boton];
        });
        porId('lista-paquetes').replaceChildren(...tarjetas);
    }

    async seleccionarPaquete(entrada) {
        this.peticionPaquete?.abort();
        this.peticionMedio?.abort();
        const peticion = this.peticionPaquete = new AbortController();
        this.medio = null;
        this.paquete = null;
        this.reiniciarMedio();
        this.interpretaciones.reiniciar();
        this.estado('Abriendo la imagen…');
        try {
            const paquete = await this.catalogo.cargar(entrada, peticion.signal);
            if (peticion.signal.aborted) return;
            const imagenes = paquete.medios.filter(m => m.tipo === 'imagen');
            const medio = imagenes.find(m => m.id === paquete.medio_inicial)
                || imagenes.find(m => m.copia_local) || imagenes[0];
            if (!medio) throw new Error('Este disco requiere una imagen.');
            this.paquete = paquete;
            for (const boton of porId('lista-paquetes').querySelectorAll('button')) {
                boton.setAttribute('aria-pressed', String(boton.dataset.paquete === paquete.id));
            }
            this.interpretaciones.preparar(paquete).catch(error => this.estado(error.message, true));
            await this.seleccionarMedio(medio);
        } catch (error) {
            if (!peticion.signal.aborted) this.estado(error.message, true);
        }
    }

    reiniciarMedio(conservarVoz = false) {
        this.secuencia = null;
        this.reanudarRecorrido = null;
        this.imagenLetra = null;
        this.analisisLetra = null;
        this.letraPersonalizada = false;
        porId('sonido-estado').textContent = 'Selecciona un medio.';
        this.daw.detenerPrueba();
        porId('lectura-panel').hidden = true;
        porId('letra-cancion').hidden = true;
        porId('guitarras-activas').hidden = true;
        porId('original-imagen').replaceChildren();
        this.datos = null;
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
        this.vozGrabada.panel.hidden = true;
        if (!conservarVoz) {
            this.vozGrabada.panel.open = false;
            this.vozGrabada.limpiar();
        }
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

    async seleccionarMedio(medio, opcion = 0, conservarImagen = false) {
        if (!medio) return;
        this.peticionMedio?.abort();
        const peticion = this.peticionMedio = new AbortController();
        const anterior = conservarImagen && this.opcion === opcion ? this.datos : null;
        this.reiniciarMedio(conservarImagen);
        this.medio = medio;
        this.opcion = opcion;
        this.datos = null;
        this.marcas = [];
        this.pintarMarcas();
        const archivos = [medio, ...(medio.variantes || []).filter(a => a.copia_local)];
        const varianteElegida = archivos[opcion] || medio;
        const elegido = {...medio, ...varianteElegida, titulo: this.paquete.titulo,
            copia_local: varianteElegida.copia_local};
        this.enlace('fuente-medio', elegido.url);
        porId('archivo-activo').textContent = elegido.archivo?.name || elegido.nombre || elegido.url?.split('/').at(-1) || '';
        const variante = porId('variante');
        variante.replaceChildren(...archivos.map((m, i) => {
            const opcion = document.createElement('option');
            opcion.value = String(i);
            opcion.textContent = (i ? '' : 'Principal · ') + (m.nombre || m.url?.split('/').at(-1) || m.archivo?.name || medio.titulo);
            return opcion;
        }));
        variante.value = String(opcion);
        porId('fila-variante').hidden = archivos.length <= 1;
        this.rocola.montar(this.paquete.titulo, medio.archivo?.name || 'Imagen seleccionada', this.portada(this.paquete));
        this.progreso(10, 'Abriendo el archivo…');
        porId('sonido-estado').textContent = 'Preparando los píxeles.';
        try {
            const geografia = this.catalogo.ajuste(this.clave('geo'));
            const fondo = this.catalogo.ajuste(this.clave('fondo'));
            const datos = await this.lector.cargar(elegido, {
                lado: Number(porId('cuadricula').value), duracion: Number(porId('duracion').value),
                inicio: 0, imagen: anterior,
            }, peticion.signal, undefined, mensaje => this.progreso(22, mensaje));
            const [guardada, modoFondo] = await Promise.all([geografia, fondo]);
            if (peticion.signal.aborted) return;
            this.datos = datos;
            datos.imagen.alt = this.paquete.titulo;
            porId('original-imagen').replaceChildren(datos.imagen);
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
            this.mostrarVista('medio');
        } catch (error) {
            if (peticion.signal.aborted) return;
            this.estado(error.name === 'TimeoutError' ? 'La imagen tardó demasiado en abrir.' : error.message, true);
            this.progreso(null);
            porId('sonido-estado').textContent = 'Abre otra imagen o carga una desde tu equipo.';
            this.mostrarVista('medio');
        }
    }

    clave(tipo) {
        return `${tipo}:${this.paquete?.id}:${this.medio?.id}${tipo === 'marcas' ? ':' + porId('recorrido').value + ':' + porId('cuadricula').value + ':0' + ':' + porId('duracion').value + ':' + porId('velocidad-recorrido').value + ':' + (this.opcion || 0) : ''}`;
    }

    deshabilitarControles() {
        botones.forEach(id => { porId(id).disabled = true; });
        porId('mus-escuchar').setAttribute('aria-pressed', 'false');
    }

    async crearSecuencia(signal) {
        if (!this.datos || signal?.aborted) return;
        if (this.transporte.nodo || this.transporte.preparando) this.reanudarRecorrido = this.transporte.modo;
        this.secuencia = null;
        this.transporte.cargar(null);
        this.partitura.cargar(null);
        this.mostrarAvance('audio', null);
        this.rocola.estado(false, false);
        this.daw.estado(false, false);
        const recorrido = porId('recorrido').value;
        const lado = Number(porId('cuadricula').value);
        const mensaje = 'Leyendo · ' + NOMBRES_RECORRIDO[recorrido];
        porId('sonido-estado').textContent = mensaje;
        this.rocola.mensaje(mensaje);
        const letra = porId('letra-sugerida');
        letra.disabled = true;
        this.deshabilitarControles();
        const velocidad = Number(porId('velocidad-recorrido').value);
        const duracion = Number(porId('duracion').value) / velocidad;
        const revision = this.revisionSecuencia = Symbol();
        const vigente = () => !signal?.aborted && revision === this.revisionSecuencia;
        this.progreso(80, 'Calculando recorrido, máscara y zona sonora…');
        await new Promise(resolve => setTimeout(resolve, 0));
        if (!vigente()) return;
        if (this.datos.fotogramas[0].width !== lado) {
            this.datos.fotogramas = [this.lector.muestrear(this.datos.imagen, lado)];
        }
        this.secuencia = new SecuenciaSonora(this.medioLeido, {
            ...this.datos, duracion, velocidad, video: undefined, blob: undefined,
        },
            lado, recorrido, this.fondo, Number(porId('tamano-zona').value), porId('escala-frecuencia').value);
        const s = this.secuencia;
        porId('regla-zona').textContent = s.tamanoZona === 1 ? 'El ritmo responde a los cambios de color durante el recorrido.'
            : '70 % del píxel y 30 % de sus vecinos válidos. El contraste local cambia el ritmo de la guitarra.';
        this.paneles.cargar(this.secuencia);
        porId('lectura-panel').hidden = false;
        this.paneles.actualizarOcupacion(Number(porId('niveles').value), porId('ambito').value);
        this.indice = -1;
        this.gis.indice = 0;
        this.gis.configurar(this.secuencia, this.geo);
        this.progreso(90, 'Generando la partitura de este recorrido…');
        const arreglo = new ArregloMusical(this.secuencia, this.partitura.opciones, this.daw.mezcla);
        const dibujada = this.partitura.cargar(arreglo);
        this.transporte.cargar(this.secuencia, arreglo);
        this.vozGrabada.panel.hidden = false;
        this.vozGrabada.refrescar();
        for (const id of ['descargar-datos', 'linea-tiempo']) porId(id).disabled = false;
        this.rocola.estado(true, false);
        this.daw.estado(true, false);
        this.leerMascara();
        this.refrescarGeo();
        const modo = this.reanudarRecorrido;
        this.reanudarRecorrido = null;
        if (modo) this.reproducir(modo);
        this.progreso(95, 'Dibujando la partitura del medio…');
        const secuencia = this.secuencia;
        const clave = this.clave('marcas');
        if (this.claveMarcas !== clave) {
            this.marcas = [];
            this.pintarMarcas();
        }
        const [marcas, mostrada, letraGuardada] = await Promise.all([
            this.catalogo.ajuste(clave), dibujada, this.catalogo.ajuste(this.clave('letra')),
        ]);
        if (vigente()) {
            if (this.imagenLetra !== this.datos.imagen) {
                this.imagenLetra = this.datos.imagen;
                this.letraPersonalizada = typeof letraGuardada === 'string';
                const sugerencia = letraInicial(this.paquete, s);
                letra.value = this.letraPersonalizada ? letraGuardada : sugerencia.texto;
                porId('letra-estado').textContent = this.letraPersonalizada ? '' : sugerencia.tema;
                if (porId('letra-incluir').checked) this.analizarLetra();
            }
            letra.disabled = false;
            porId('letra-cancion').hidden = false;
            porId('informe').disabled = false;
            this.informarPartitura(mostrada);
        }
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
        if (dibujada) this.vozGrabada.refrescar();
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
        this.rocola.mensaje(error.message);
    }

    reproducir(modo = 'arreglo') {
        this.interpretaciones.cerrar();
        this.daw.detenerMIDI();
        this.daw.detenerPrueba();
        return this.transporte.reproducir(modo).catch(e => this.errorAudio(e));
    }

    probarPista(canal) {
        this.transporte.pausar();
        this.interpretaciones.cerrar();
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
        porId('mus-escuchar').disabled = esArreglo && (activo || preparando);
        porId('mus-escuchar').setAttribute('aria-pressed', String(esArreglo && (activo || preparando)));
        const recorrido = NOMBRES_RECORRIDO[s.recorrido];
        const estado = `${preparando ? 'Preparando audio · ' : activo ? 'Sonando · ' : ''}${recorrido} · ${s.lado} × ${s.lado}`;
        if (porId('sonido-estado').textContent !== estado) {
            porId('sonido-estado').textContent = estado;
            this.rocola.mensaje(estado);
        }
        this.rocola.estado(true, activo, preparando);
        this.daw.estado(true, activo, preparando);
        this.paneles.actualizar(indice, !activo);
        this.partitura.actualizar(esArreglo ? tiempo : tiempoRGB, esArreglo || (!activo && !preparando));
        this.mostrarNotasGuitarras(tiempo);
        if (this.indice !== indice) {
            this.indice = indice;
            this.gis.pintar(indice);
            const [x, y] = this.secuencia.coordenadas[indice];
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

    mostrarNotasGuitarras(tiempo) {
        const arreglo = this.transporte.arreglo;
        if (!arreglo) return;
        porId('guitarras-activas').hidden = false;
        const unidad = tiempo / arreglo.unidad;
        for (const pista of arreglo.pistas) {
            const letra = 'RGB'[pista.canal];
            const evento = pista.eventos.find(e => unidad >= e.inicio && unidad < e.inicio + e.duracion);
            const salida = porId('nota-guitarra-' + letra.toLowerCase());
            const nota = evento ? nombreAfinado(evento.nota, arreglo.fifths < 0) : 'Silencio';
            const texto = `${pista.nombre} · ${nota}`;
            if (salida.textContent !== texto) salida.textContent = texto;
            salida.title = tonalidadNombre(arreglo.opciones);
        }
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

    letraActual() {
        return porId('letra-incluir').checked ? porId('letra-sugerida').value.trim() : '';
    }

    analizarLetra() {
        const imagen = this.imagenLetra;
        if (!imagen || !this.secuencia || this.letraPersonalizada || this.analisisLetra) return;
        const salida = porId('letra-estado');
        salida.textContent = 'Analizando la imagen para la letra…';
        this.analisisLetra = sugerirLetra(this.paquete, this.secuencia).then(({tema, texto}) => {
            if (this.imagenLetra !== imagen || this.letraPersonalizada) return;
            porId('letra-sugerida').value = texto;
            salida.textContent = tema;
        }).catch(() => {
            if (this.imagenLetra === imagen && !this.letraPersonalizada) salida.textContent = 'Letra basada en los colores de la imagen.';
        });
    }

    informe() {
        return new Informe(this.secuencia, this.paquete, Number(porId('niveles').value), this.marcas, this.geo,
            this.daw.mezcla, this.transporte.arreglo, this.letraActual(), 'todos', this.partitura.voz);
    }

    enlazar() {
        for (const [modo, id] of Object.entries(modoId)) porId(id).onclick = () => this.mostrarVista(modo);
        for (const id of ['abrir-daw','partitura-daw']) porId(id).onclick = () => { porId('daw-panel').open = true; };
        porId('abrir-importar').onclick = () => porId('archivos').click();
        porId('archivos').onchange = () => this.importar();
        porId('letra-incluir').onchange = e => {
            porId('letra-sugerida').hidden = !e.target.checked;
            porId('letra-estado').hidden = !e.target.checked;
            this.partitura.mostrarCantante(e.target.checked);
            if (e.target.checked) this.analizarLetra();
        };
        porId('letra-sugerida').oninput = () => {
            this.letraPersonalizada = true;
            porId('letra-estado').textContent = '';
        };
        porId('letra-sugerida').onchange = e => {
            if (!this.secuencia) return;
            this.catalogo.ajustar(this.clave('letra'), e.target.value).catch(() => {
                this.estado('El navegador no pudo guardar el cambio de letra.');
            });
        };
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
        porId('variante').onchange = evento => {
            const indice = Number(evento.target.value);
            this.seleccionarMedio(this.medio, indice, true);
        };
        porId('mus-escuchar').onclick = () => this.reproducir();
        porId('pausa').onclick = () => this.transporte.pausar();
        porId('linea-tiempo').oninput = e => this.transporte.buscar(Number(e.target.value)).catch(e => this.errorAudio(e));
        porId('volumen').oninput = e => this.transporte.cambiarVolumen(Number(e.target.value));
        porId('centrar').onclick = () => this.gis.centrar();
        porId('recorrido').replaceChildren(...Object.entries(NOMBRES_RECORRIDO).map(([valor, nombre]) =>
            new Option(nombre, valor, valor === 'filas', valor === 'filas')));
        porId('tamano-zona').replaceChildren(...TAMANOS_ZONA.map(n => new Option(n + ' × ' + n, n, n === ZONA_INICIAL, n === ZONA_INICIAL)));
        for (const id of ['recorrido', 'cuadricula', 'duracion', 'tamano-zona', 'velocidad-recorrido', 'escala-frecuencia']) {
            porId(id).onchange = () => this.crearSecuencia(this.peticionMedio?.signal).catch(e => this.estado(e.message, true));
        }
        for (const id of ['niveles', 'ambito']) porId(id).onchange = () => {
            this.paneles.actualizarOcupacion(Number(porId('niveles').value), porId('ambito').value);
            if (this.transporte.secuencia) this.paneles.actualizar(this.indice, true);
        };
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
        document.querySelectorAll('[data-cerrar]').forEach(b => { b.onclick = () => porId(b.dataset.cerrar).close(); });
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

    async importar() {
        const control = porId('archivos');
        const archivo = control.files[0];
        control.value = '';
        if (!archivo) return;
        if (!FORMATOS_LOCAL.has(extension(archivo.name))) {
            this.estado('Carga una imagen JPG, PNG, WebP, AVIF, BMP o GIF.', true);
            return;
        }
        try {
            const {paquete, fallos} = await this.catalogo.importar('', [], [archivo], null);
            this.entradas.push(paquete);
            this.pintarPaquetes();
            await this.seleccionarPaquete(paquete);
            if (fallos.length) this.estado(fallos.join(' · '), true);
        } catch (error) { this.estado(error.message, true); }
    }
}

try {
    const app = new AplicacionVisor();
    app.reiniciarMedio();
    app.iniciar();
} catch (error) {
    porId('estado-app').textContent = 'No se pudo iniciar el visor. ' + error.message;
}
