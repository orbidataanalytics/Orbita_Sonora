import {COMPASES, PERCUSION, nombreAfinado, notaEscrita, tonalidadNombre} from './arreglo.js';
import {INSTRUMENTOS} from './audio-pistas.js';

const XML = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>";
const FIGURAS = [[16,'whole',0],[12,'half',1],[8,'half',0],[6,'quarter',1],
    [4,'quarter',0],[3,'eighth',1],[2,'eighth',0],[1,'16th',0]];
const campos = s => String(s).replace(/[&<>"']/g, v => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[v]));
const texto = nota => '<step>' + nota.paso + '</step>' + (nota.alter ? '<alter>' + nota.alter + '</alter>' : '') + '<octave>' + nota.octava + '</octave>';
const abreviaturas = 'RGBV';

export function afinacionTexto(afinacion) {
    return afinacion ? afinacion.cuerdas.map(n => nombreAfinado(n)).join(' · ') : '';
}

export function pistasDePartitura(arreglo, canal, voz) {
    const pistas = arreglo.pistas;
    if (canal === 'todos') return voz ? [...pistas, voz] : pistas;
    if (canal === 'guitarra-voz' && voz) {
        const guitarra = [pistas[1], pistas[0], pistas[2]].find(p => INSTRUMENTOS[p.instrumento].cuerda === 'guitarra') ?? pistas[1];
        return [guitarra, voz];
    }
    return [pistas[Number(canal)] ?? pistas[1]];
}

export class MusicXML {
    constructor(arreglo, voz = null) {
        this.arreglo = arreglo;
        this.voz = voz;
        this.compas = COMPASES[arreglo.opciones.compas];
        this.bemoles = arreglo.fifths < 0;
    }

    exportar({canal = 'todos', desde = 1, hasta = this.arreglo.compases, titulo = true, leyenda = true} = {}) {
        const a = this.arreglo;
        const pistas = pistasDePartitura(a, canal, this.voz).map(pista => ({
            ...pista, tablatura: Boolean(pista.afinacion && canal !== 'todos'),
        }));
        const nombre = titulo ? '<work><work-title>' + campos(a.titulo) + '</work-title></work>' : '';
        const creditos = '<identification><creator type="composer">Órbita Sonora / ORBIDATA ANALYTICS</creator>'
            + '<encoding><software>Órbita Sonora</software></encoding></identification>';
        const instrumentos = pistas.map(p => this.instrumento(p)).join('');
        return XML + '<score-partwise version="4.0">' + nombre + creditos + '<part-list>' + instrumentos + '</part-list>'
            + pistas.map(p => this.parte(p, desde, hasta, leyenda)).join('') + '</score-partwise>';
    }

    instrumento(pista) {
        const id = 'P' + (pista.canal + 1);
        const nombre = pista.largo ? pista.largo + ' · ' + pista.nombre : pista.nombre;
        let xml = '<score-part id="' + id + '"><part-name>' + campos(nombre)
            + '</part-name><part-abbreviation>' + abreviaturas[pista.canal] + '</part-abbreviation>';
        if (pista.percusion) {
            for (const [n, golpe] of Object.entries(PERCUSION)) {
                xml += '<score-instrument id="' + id + '-I' + n + '"><instrument-name>' + golpe.nombre + '</instrument-name></score-instrument>';
            }
            for (const n of Object.keys(PERCUSION)) {
                xml += '<midi-instrument id="' + id + '-I' + n + '"><midi-channel>10</midi-channel><midi-unpitched>'
                    + (Number(n) + 1) + '</midi-unpitched></midi-instrument>';
            }
        } else {
            xml += '<score-instrument id="' + id + '-I"><instrument-name>' + campos(pista.nombre)
                + '</instrument-name></score-instrument><midi-instrument id="' + id + '-I"><midi-channel>' + (pista.canal + 1)
                + '</midi-channel><midi-program>' + (pista.programa + 1) + '</midi-program></midi-instrument>';
        }
        return xml + '</score-part>';
    }

    atributos(pista) {
        let xml = '<attributes><divisions>4</divisions>';
        if (!pista.percusion) {
            xml += '<key><fifths>' + this.arreglo.fifths + '</fifths><mode>'
                + (this.arreglo.opciones.modo === 'cromatica' ? 'none' : this.arreglo.opciones.modo === 'mayor' ? 'major' : 'minor') + '</mode></key>';
        }
        xml += '<time><beats>' + this.compas.pulsos + '</beats><beat-type>' + this.compas.denominador + '</beat-type></time>';
        if (pista.tablatura) xml += '<staves>2</staves>';
        xml += '<clef' + (pista.tablatura ? ' number="1"' : '') + '><sign>' + pista.clave + '</sign>'
            + (pista.clave === 'G' ? '<line>2</line>' : pista.clave === 'F' ? '<line>4</line>' : '') + '</clef>';
        if (pista.tablatura) {
            const cuerdas = pista.afinacion.cuerdas;
            xml += '<clef number="2"><sign>TAB</sign><line>' + Math.ceil(cuerdas.length / 2) + '</line></clef>'
                + '<staff-details number="2"><staff-lines>' + cuerdas.length + '</staff-lines>'
                + cuerdas.map((n, i) => {
                    const nota = notaEscrita(n, this.bemoles);
                    return '<staff-tuning line="' + (i + 1) + '"><tuning-step>' + nota.paso + '</tuning-step>'
                        + (nota.alter ? '<tuning-alter>' + nota.alter + '</tuning-alter>' : '')
                        + '<tuning-octave>' + nota.octava + '</tuning-octave></staff-tuning>';
                }).join('') + '</staff-details>';
        }
        if (pista.transposicion) {
            xml += '<transpose' + (pista.tablatura ? ' number="1"' : '')
                + '><chromatic>0</chromatic><octave-change>-1</octave-change></transpose>';
        }
        return xml + '</attributes>';
    }

    direccion(pista, mostrarLeyenda) {
        const a = this.arreglo;
        const bpm = a.opciones.bpm;
        const firma = '<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit>'
            + (a.opciones.compas === '6/8' ? '<beat-unit-dot/>' : '')
            + '<per-minute>' + bpm + '</per-minute></metronome></direction-type><sound tempo="'
            + a.negraBpm + '"/></direction>';
        if (!mostrarLeyenda) return firma;
        const leyenda = pista.percusion ? 'Bombo, caja, charleston cerrado y tom. Las cabezas X indican charleston.'
            : tonalidadNombre(a.opciones) + (pista.afinacion ? ' · Afinación grave a aguda ' + afinacionTexto(pista.afinacion) : '');
        return firma + '<direction placement="above"><direction-type><words>' + campos(leyenda) + '</words></direction-type></direction>';
    }

    dividir(evento, base) {
        let restante = evento.duracion, desde = evento.inicio;
        const fragmentos = [];
        while (restante) {
            const posicion = (desde - base) % this.compas.pulso;
            const maximo = posicion ? Math.min(restante, this.compas.pulso - posicion) : restante;
            const [duracion, tipo, puntos] = FIGURAS.find(([n]) => n <= maximo);
            fragmentos.push({...evento, inicio: desde, duracion, tipo, puntos,
                unirAnterior: desde > evento.inicio && evento.nota !== null,
                unirSiguiente: restante > duracion && evento.nota !== null,
                acento: evento.acento && desde === evento.inicio});
            desde += duracion;
            restante -= duracion;
        }
        return fragmentos;
    }

    ritmo(compas) {
        if (compas.eventos.length === 1 && compas.eventos[0].nota === null) {
            return [{...compas.eventos[0], compasCompleto: true}];
        }
        const base = (compas.numero - 1) * this.arreglo.unidadesCompas;
        const figuras = compas.eventos.flatMap(e => this.dividir(e, base));
        for (const [i, figura] of figuras.entries()) {
            if (figura.nota === null || figura.tipo !== 'eighth' && figura.tipo !== '16th') continue;
            const grupo = Math.floor((figura.inicio - base) / this.compas.pulso);
            figura.barras = [];
            for (const nivel of figura.tipo === '16th' ? [1, 2] : [1]) {
                const enlaza = otra => otra && otra.nota !== null && (otra.tipo === '16th' || nivel === 1 && otra.tipo === 'eighth')
                    && Math.floor((otra.inicio - base) / this.compas.pulso) === grupo;
                const anterior = enlaza(figuras[i - 1]), posterior = enlaza(figuras[i + 1]);
                if (anterior || posterior) figura.barras.push([nivel, anterior ? posterior ? 'continue' : 'end' : 'begin']);
                else if (nivel === 2 && figura.barras.length) figura.barras.push([2, figura.barras[0][1] === 'end' ? 'backward hook' : 'forward hook']);
            }
        }
        return figuras;
    }

    nota(pista, evento, staff) {
        const tab = staff === 2, perc = pista.percusion, silencio = evento.nota === null;
        const instrumento = 'P' + (pista.canal + 1) + '-I' + (perc ? evento.nota : '');
        const golpe = perc && !silencio ? PERCUSION[evento.nota] : null;
        let tipo;
        if (silencio) tipo = evento.compasCompleto ? '<rest measure="yes"/>' : '<rest/>';
        else if (golpe) tipo = '<unpitched><display-step>' + golpe.paso + '</display-step><display-octave>'
            + golpe.octava + '</display-octave></unpitched>';
        else tipo = '<pitch>' + texto(notaEscrita(evento.nota + (tab ? 0 : -12 * pista.transposicion), this.bemoles)) + '</pitch>';
        const uniones = (evento.unirAnterior ? '<tie type="stop"/>' : '') + (evento.unirSiguiente ? '<tie type="start"/>' : '');
        const tied = (evento.unirAnterior ? '<tied type="stop"/>' : '') + (evento.unirSiguiente ? '<tied type="start"/>' : '');
        const tecnica = tab && evento.posicion ? '<technical><string>' + evento.posicion.cuerda
            + '</string><fret>' + evento.posicion.traste + '</fret></technical>' : '';
        const acento = evento.acento && !tab ? '<articulations><accent/></articulations>' : '';
        const detalles = tied || tecnica || acento ? '<notations>' + tied + tecnica + acento + '</notations>' : '';
        const figuras = evento.tipo ? '<type>' + evento.tipo + '</type>' + (evento.puntos ? '<dot/>' : '') : '';
        const barras = tab ? '' : (evento.barras || []).map(([n, b]) => '<beam number="' + n + '">' + b + '</beam>').join('');
        return '<note>' + tipo + '<duration>' + evento.duracion + '</duration>' + uniones
            + (silencio || tab ? '' : '<instrument id="' + instrumento + '"/>')
            + '<voice>' + staff + '</voice>' + figuras + (golpe?.cabeza === 'x' ? '<notehead>x</notehead>' : '')
            + (pista.tablatura ? '<staff>' + staff + '</staff>' : '') + barras + detalles + '</note>';
    }

    parte(pista, desde, hasta, leyenda) {
        let ultimoNivel = null;
        const medidas = pista.compases.slice(desde - 1, hasta).map((compas, i, todos) => {
            let xml = '<measure number="' + compas.numero + '">';
            if (!i) xml += this.atributos(pista) + this.direccion(pista, leyenda);
            const nivel = compas.dinamica;
            if (nivel && nivel !== ultimoNivel) {
                xml += '<direction placement="below"><direction-type><dynamics><' + nivel + '/></dynamics></direction-type>'
                    + (pista.tablatura ? '<staff>1</staff>' : '') + '</direction>';
                ultimoNivel = nivel;
            }
            const figuras = this.ritmo(compas);
            const inicio = (compas.numero - 1) * this.arreglo.unidadesCompas;
            const acordes = pista.afinacion ? new Map(this.arreglo.armonia
                .filter(a => a.desde >= inicio && a.desde < inicio + this.arreglo.unidadesCompas && a.intensidad.some(Boolean))
                .map(a => [a.desde, a.nombre])) : null;
            for (const e of figuras) {
                if (acordes?.has(e.inicio)) {
                    xml += '<direction placement="above"><direction-type><words>' + campos(acordes.get(e.inicio))
                        + '</words></direction-type>'
                        + (pista.tablatura ? '<staff>1</staff>' : '') + '</direction>';
                }
                xml += this.nota(pista, e, 1);
            }
            if (pista.tablatura) {
                xml += '<backup><duration>' + this.arreglo.unidadesCompas + '</duration></backup>'
                    + figuras.map(e => this.nota(pista, e, 2)).join('');
            }
            if (i === todos.length - 1) xml += '<barline location="right"><bar-style>light-heavy</bar-style></barline>';
            return xml + '</measure>';
        }).join('');
        return '<part id="P' + (pista.canal + 1) + '">' + medidas + '</part>';
    }
}
