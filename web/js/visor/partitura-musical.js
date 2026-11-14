import {AFINACIONES, COMPASES, TONALIDADES, opcionesPartitura, tonalidadNombre} from './arreglo.js';
import {afinacionTexto, MusicXML} from './musicxml.js';
import {descargar} from './informe.js';
import {NOMBRES_RECORRIDO} from '../recorridos.js';

const porId = id => document.getElementById(id);
const COMPASES_POR_VISTA = 4;
const compasEn = (arreglo, tiempo) => Math.min(arreglo.compases,
    Math.floor(tiempo / (arreglo.unidad * arreglo.unidadesCompas) + 1e-8) + 1);

function bibliotecaPartituras() {
    if (window.opensheetmusicdisplay) return Promise.resolve(window.opensheetmusicdisplay.OpenSheetMusicDisplay);
    return new Promise((resolver, rechazar) => {
        const script = document.createElement('script');
        script.src = new URL('../../vendor/opensheetmusicdisplay.min.js', import.meta.url).href;
        script.onload = () => resolver(window.opensheetmusicdisplay.OpenSheetMusicDisplay);
        script.onerror = () => { script.remove(); rechazar(new Error('El visor de partituras no pudo iniciar. Puedes descargar MusicXML.')); };
        document.head.append(script);
    });
}

export class PartituraMusical {
    constructor(actualizarArreglo, buscar, pausar) {
        this.actualizarArreglo = actualizarArreglo;
        this.buscar = buscar;
        this.pausar = pausar;
        this.opciones = opcionesPartitura();
        this.inicio = 1;
        this.compas = 1;
        this.revision = 0;
        this.pendiente = Promise.resolve();
        this.visor = porId('mus-lienzo');
        this.configurarControles();
    }

    configurarControles() {
        for (const [id, valores] of [
            ['mus-tonica', Object.entries(TONALIDADES).map(([k, t]) => [k, t.nombre])],
            ['mus-compas', Object.keys(COMPASES).map(k => [k, k])],
            ['mus-afinacion', Object.entries(AFINACIONES).filter(([k]) => k !== 'bajo').map(([k, a]) => [k, a.nombre])],
        ]) porId(id).replaceChildren(...valores.map(([k, v]) => new Option(v, k)));
        for (const [clave, valor] of Object.entries(this.opciones)) {
            const control = porId('mus-' + clave);
            if (clave === 'alturas') control.replaceChildren(...Array.from({length: 6}, (_, i) => new Option(String(i + 7), String(i + 7))));
            control.value = valor;
            control.onchange = () => {
                if (!control.checkValidity()) { control.reportValidity(); control.value = this.opciones[clave]; return; }
                this.opciones[clave] = ['bpm', 'alturas'].includes(clave) ? Number(control.value) : control.value;
                porId('mus-pulso').textContent = this.opciones.compas === '6/8' ? 'Negras con puntillo por minuto' : 'Negras por minuto';
                this.actualizarArreglo();
            };
        }
        this.observarAncho();
        porId('mus-parte').onchange = () => this.dibujar();
        porId('mus-seguir').onchange = () => this.mover(this.compas);
        porId('mus-reintentar').onclick = () => {
            this.vistaActual = null;
            this.dibujar();
        };
        porId('mus-anterior').onclick = () => this.navegar(-1);
        porId('mus-siguiente').onclick = () => this.navegar(1);
        porId('mus-saltar').onclick = () => {
            this.buscar((this.inicio - 1) * this.arreglo.unidadesCompas * this.arreglo.unidad);
        };
        porId('mus-exportar').onclick = () => this.exportar();
        porId('mus-imprimir').onclick = () => this.imprimir();
    }

    observarAncho() {
        let anterior = 0;
        const observar = new ResizeObserver(([entrada]) => {
            const ancho = Math.round(entrada.contentRect.width);
            if (ancho < 1 || ancho === anterior) return;
            anterior = ancho;
            if (this.renderizada && this.visor.querySelector('svg')) {
                this.vistaActual = null;
                this.dibujar();
            }
        });
        observar.observe(this.visor);
    }

    cargar(arreglo, tiempo = 0, conservarVista = false) {
        this.arreglo = arreglo;
        const s = arreglo?.secuencia;
        porId('mus-origen').textContent = s ? `${arreglo.titulo} · ${NOMBRES_RECORRIDO[s.recorrido]} · ${s.lado} × ${s.lado} · ${s.datos.velocidad ?? 1}× · ${s.escala === 'lineal' ? 'Escala lineal' : 'Escala logarítmica'}` : '';
        if (arreglo) {
            const opciones = porId('mus-parte').options;
            for (const [i, pista] of arreglo.pistas.entries()) opciones[i + 1].textContent = `${'RGB'[i]} · ${pista.nombre}`;
        }
        this.tiempo = tiempo;
        this.compas = arreglo ? compasEn(arreglo, tiempo) : 1;
        this.inicio = conservarVista && arreglo && !porId('mus-seguir').checked
            ? Math.min(this.inicio, this.inicioCompas(arreglo.compases)) : this.inicioCompas(this.compas);
        for (const id of ['ajustes-partitura', 'mus-parte', 'mus-exportar', 'mus-imprimir', 'mus-saltar']) porId(id).disabled = !arreglo;
        return this.dibujar();
    }

    mover(compas) {
        this.compas = compas;
        const inicio = this.inicioCompas(compas);
        if (porId('mus-seguir').checked && this.inicio !== inicio) {
            this.inicio = inicio;
            this.dibujar();
        } else this.rotulo();
    }

    actualizar(tiempo, coincide = true) {
        this.tiempo = tiempo;
        this.coincide = coincide;
        if (!this.arreglo) return;
        if (!coincide) { this.renderer?.cursor?.hide(); return; }
        const compas = compasEn(this.arreglo, tiempo);
        if (compas !== this.compas) this.mover(compas);
        this.marcarLectura();
    }

    marcarLectura() {
        const cursor = this.renderer?.cursor;
        if (!cursor?.Iterator || this.renderizada !== this.vistaActual) return;
        if (this.coincide === false) { cursor.hide(); return; }
        const a = this.arreglo, tiempo = this.tiempo ?? 0;
        const objetivo = tiempo / (16 * a.unidad) - (this.inicio - 1) * a.unidadesCompas / 16;
        if (this.compas < this.inicio || this.compas >= this.inicio + COMPASES_POR_VISTA) {
            cursor.hide();
            return;
        }
        const rebobinar = this.ultimoTiempoCursor === undefined || objetivo < this.ultimoTiempoCursor - .00001;
        this.ultimoTiempoCursor = objetivo;
        if (rebobinar) {
            cursor.reset();
            this.posicionCursor = 0;
        }
        const marcas = this.tiemposCursor;
        while (this.posicionCursor + 1 < marcas.length && marcas[this.posicionCursor + 1] <= objetivo + .00001) {
            cursor.next();
            this.posicionCursor++;
        }
        if (cursor.Hidden) cursor.show();
        this.visor.querySelector('img[id^="cursorImg"]')?.classList.add('cursor-musical');
    }

    prepararCursor() {
        const cursor = this.renderer.cursor;
        this.tiemposCursor = [];
        if (!cursor?.Iterator) return;
        cursor.reset();
        const it = cursor.Iterator;
        // El bloque visible abarca cuatro compases y cada pulso puede tener varias voces.
        while (!it.EndReached && this.tiemposCursor.length < 256) {
            const tiempo = it.CurrentSourceTimestamp?.RealValue;
            if (!Number.isFinite(tiempo)) break;
            this.tiemposCursor.push(tiempo);
            it.moveToNextVisibleVoiceEntry(false);
        }
        cursor.reset();
        this.posicionCursor = 0;
        this.ultimoTiempoCursor = undefined;
    }

    inicioCompas(compas) {
        return Math.floor((compas - 1) / COMPASES_POR_VISTA) * COMPASES_POR_VISTA + 1;
    }

    navegar(direccion) {
        porId('mus-seguir').checked = false;
        this.inicio += direccion * COMPASES_POR_VISTA;
        this.dibujar();
    }

    rotulo() {
        const total = this.arreglo?.compases ?? 0;
        const hasta = Math.min(this.inicio + COMPASES_POR_VISTA - 1, total);
        porId('mus-compases').textContent = total ? `${this.inicio}–${hasta} de ${total} · Activo ${this.compas}` : '';
        porId('mus-anterior').disabled = !total || this.inicio <= 1;
        porId('mus-siguiente').disabled = hasta >= total;
        return hasta;
    }

    abrirBiblioteca() {
        this.biblioteca ??= bibliotecaPartituras().catch(error => { this.biblioteca = null; throw error; });
        return this.biblioteca;
    }

    dibujar() {
        const hasta = this.rotulo();
        const estado = porId('mus-estado');
        if (!this.arreglo) {
            ++this.revision;
            this.vistaActual = null;
            this.renderizada = null;
            this.renderer = null;
            this.visor.replaceChildren();
            this.visor.hidden = true;
            estado.textContent = 'Selecciona un medio.';
            porId('mus-afinaciones').hidden = true;
            porId('mus-reintentar').hidden = true;
            return;
        }
        this.visor.hidden = false;
        const canal = porId('mus-parte').value;
        const compacto = this.visor.clientWidth < 620;
        const vista = `${canal}:${this.inicio}:${hasta}:${compacto}`;
        if (this.vistaActual?.arreglo === this.arreglo && this.vistaActual.vista === vista) return this.pendiente;
        this.vistaActual = {arreglo: this.arreglo, vista};
        const revision = ++this.revision;
        const xml = new MusicXML(this.arreglo).exportar({canal, desde: this.inicio, hasta, titulo: false, leyenda: !compacto});
        const afinaciones = porId('mus-afinaciones');
        afinaciones.hidden = !compacto;
        afinaciones.textContent = compacto ? this.pistasVisibles(canal).filter(p => p.afinacion)
            .map(p => `${'RGB'[p.canal]} grave a aguda ${afinacionTexto(p.afinacion)}`).join(' / ') : '';
        estado.textContent = 'Preparando pentagramas…';
        porId('mus-reintentar').hidden = true;
        this.pendiente = this.pendiente.then(async () => {
            if (revision !== this.revision) return;
            const Visualizador = await this.abrirBiblioteca();
            if (revision !== this.revision) return;
            this.renderer ??= new Visualizador(this.visor, {
                backend: 'svg', drawTitle: false, drawComposer: false, drawCredits: false, autoResize: false,
                cursorsOptions: [{type: 0, color: '#59a8a0', alpha: .35, follow: false}],
            });
            this.renderer.setOptions({drawPartNames: !compacto, drawPartAbbreviations: true});
            await this.renderer.load(xml);
            if (revision !== this.revision) return;
            this.renderer.zoom = compacto ? .69 : .9;
            this.renderer.render();
            const hoja = this.visor.querySelector('svg');
            if (!hoja || Number(hoja.getAttribute('width')) <= 0) throw new Error('La hoja quedó sin ancho de dibujo.');
            this.prepararCursor();
            this.renderizada = this.vistaActual;
            this.marcarLectura();
            estado.textContent = this.resumen(canal);
            return true;
        }).catch(error => {
            if (revision !== this.revision) return;
            this.visor.replaceChildren();
            this.visor.hidden = true;
            this.renderer = null;
            estado.textContent = 'El pentagrama no se pudo mostrar. Puedes reintentar o exportar la partitura MusicXML.';
            porId('mus-reintentar').hidden = false;
            console.warn('Órbita Sonora · partitura', error);
            return false;
        });
        return this.pendiente;
    }

    pistasVisibles(canal) {
        return canal === 'todos' ? this.arreglo.pistas : [this.arreglo.pistas[Number(canal)]];
    }

    resumen(canal) {
        const a = this.arreglo;
        const pistas = this.pistasVisibles(canal).map(p => p.nombre + (p.percusion ? '' : ` (${p.alturas.length} alturas)`));
        return `${tonalidadNombre(a.opciones)} · ${a.opciones.compas} · ${a.opciones.bpm} por minuto · ${pistas.join(' / ')}`;
    }

    exportar() {
        const canal = porId('mus-parte').value;
        const contenido = new MusicXML(this.arreglo).exportar({canal});
        const parte = canal === 'todos' ? 'general' : 'rgb'[Number(canal)];
        descargar(new Blob([contenido], {type: 'application/vnd.recordare.musicxml+xml'}), `orbita-partitura-${parte}.musicxml`);
    }

    async imprimir() {
        const boton = porId('mus-imprimir'), salida = porId('partitura-impresion');
        const arreglo = this.arreglo, canal = porId('mus-parte').value;
        const resumen = this.resumen(canal);
        this.pausar();
        boton.disabled = true;
        try {
            const Visualizador = await this.abrirBiblioteca();
            const cabecera = document.createElement('header');
            const titulo = document.createElement('h1');
            titulo.textContent = arreglo.titulo;
            const descripcion = document.createElement('p');
            descripcion.textContent = resumen;
            cabecera.append(titulo, descripcion);
            for (const pista of arreglo.pistas) {
                if (!pista.afinacion || canal !== 'todos' && Number(canal) !== pista.canal) continue;
                const p = document.createElement('p');
                p.textContent = pista.nombre + ' · Cuerdas al aire de grave a aguda ' + afinacionTexto(pista.afinacion);
                cabecera.append(p);
            }
            const hoja = document.createElement('div');
            salida.replaceChildren(cabecera, hoja);
            const renderer = new Visualizador(hoja, {
                backend: 'svg', pageFormat: 'A4_P', drawTitle: false, drawComposer: false, drawCredits: false, autoResize: false,
            });
            await renderer.load(new MusicXML(arreglo).exportar({canal, titulo: false}));
            if (this.arreglo !== arreglo) return;
            renderer.render();
            document.body.classList.add('imprimir-partitura');
            window.print();
        } catch (error) { porId('mus-estado').textContent = error.message; }
        finally {
            document.body.classList.remove('imprimir-partitura');
            salida.replaceChildren();
            boton.disabled = !this.arreglo;
        }
    }
}
