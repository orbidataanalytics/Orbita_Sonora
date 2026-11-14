import {INSTRUMENTOS} from './audio-pistas.js';
import {BANDAS} from './sonificacion.js';

export const COMPASES = {
    '4/4': {pulsos: 4, denominador: 4, pulso: 4},
    '3/4': {pulsos: 3, denominador: 4, pulso: 4},
    '6/8': {pulsos: 6, denominador: 8, pulso: 6},
};

export const TONALIDADES = {
    C: {nombre: 'Do', centro: 0, mayor: 0, menor: -3},
    G: {nombre: 'Sol', centro: 7, mayor: 1, menor: -2},
    D: {nombre: 'Re', centro: 2, mayor: 2, menor: -1},
    A: {nombre: 'La', centro: 9, mayor: 3, menor: 0},
    E: {nombre: 'Mi', centro: 4, mayor: 4, menor: 1},
    F: {nombre: 'Fa', centro: 5, mayor: -1, menor: -4},
    Bb: {nombre: 'Si♭', centro: 10, mayor: -2, menor: -5},
    Eb: {nombre: 'Mi♭', centro: 3, mayor: -3, menor: -6},
    B: {nombre: 'Si', centro: 11, mayor: 5, menor: 2},
    Fsharp: {nombre: 'Fa♯', centro: 6, mayor: 6, menor: 3},
    Db: {nombre: 'Re♭', centro: 1, mayor: -5, menor: 4},
    Ab: {nombre: 'La♭', centro: 8, mayor: -4, menor: -7},
};

export const AFINACIONES = {
    requinto: {nombre: 'Requinto de seis cuerdas', cuerdas: [45, 50, 55, 60, 64, 69]},
    guitarra: {nombre: 'Guitarra estándar', cuerdas: [40, 45, 50, 55, 59, 64]},
    tiple: {nombre: 'Tiple requinto en Do', cuerdas: [50, 55, 59, 64]},
    tipleSib: {nombre: 'Tiple requinto en Si♭', cuerdas: [48, 53, 57, 62]},
    bajo: {nombre: 'Bajo de cuatro cuerdas', cuerdas: [28, 33, 38, 43]},
};

export const PERCUSION = {
    36: {nombre: 'Bombo', paso: 'F', octava: 4, timbre: 'percusion', cabeza: 'normal'},
    38: {nombre: 'Caja', paso: 'C', octava: 5, timbre: 'caja', cabeza: 'normal'},
    42: {nombre: 'Charleston cerrado', paso: 'G', octava: 5, timbre: 'charles', cabeza: 'x'},
    45: {nombre: 'Tom', paso: 'A', octava: 4, timbre: 'tambor', cabeza: 'normal'},
};

export const MODOS = {
    mayor: [0, 2, 4, 7, 9],
    menor: [0, 3, 5, 7, 10],
    cromatica: Array.from({length: 12}, (_, i) => i),
};
const colores = ['Rojo', 'Verde', 'Azul'];

export function opcionesPartitura() {
    return {tonica: 'C', modo: 'menor', alturas: 8, nivel: 'inicial', compas: '4/4', bpm: 100, figura: 'corchea', afinacion: 'guitarra'};
}

export const tonalidadNombre = opciones => TONALIDADES[opciones.tonica].nombre + (opciones.modo === 'cromatica' ? ' cromática' : ' ' + opciones.modo + ' pentatónica');

export function notaEscrita(midi, usarBemoles = false) {
    const notas = usarBemoles ? ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']
        : ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const nombre = notas[midi % 12];
    return {paso: nombre[0], alter: nombre[1] === '#' ? 1 : nombre[1] === 'b' ? -1 : 0, octava: Math.floor(midi / 12) - 1};
}

export function nombreAfinado(midi, usarBemoles = false) {
    const {paso, alter, octava} = notaEscrita(midi, usarBemoles);
    const nombres = {C:'Do', D:'Re', E:'Mi', F:'Fa', G:'Sol', A:'La', B:'Si'};
    return nombres[paso] + (alter > 0 ? '♯' : alter < 0 ? '♭' : '') + octava;
}

function digitacion(midi, cuerdas, previa, trasteMaximo) {
    if (!cuerdas) return null;
    const opciones = cuerdas.flatMap((abierta, orden) => {
        const traste = midi - abierta;
        return traste >= 0 && traste <= trasteMaximo ? [{cuerda: cuerdas.length - orden, traste}] : [];
    });
    const coste = opcion => opcion.traste * .18 + (previa
        ? Math.abs(opcion.traste - previa.traste) * .45 + Math.abs(opcion.cuerda - previa.cuerda) * .36
        : Math.abs(opcion.traste - 2) * .45);
    opciones.sort((a, b) => coste(a) - coste(b));
    return opciones[0] || null;
}

function seleccionarAltura(valor, escala, anterior, saltoMaximo) {
    const min = escala[0], max = escala.at(-1);
    const blanco = min + (max - min) * (valor - 1) / 254;
    const peso = n => Math.abs(n - blanco);
    const accesibles = anterior === null ? escala : escala.filter(n => Math.abs(n - anterior) <= saltoMaximo);
    return accesibles.reduce((a, b) => peso(a) <= peso(b) ? a : b);
}

function rangoPista(canal, instrumento, afinacion, trasteMaximo) {
    if (afinacion) {
        const primera = instrumento === 'bajo' ? 0 : afinacion.cuerdas.length - 4;
        return [afinacion.cuerdas[primera], afinacion.cuerdas.at(-1) + trasteMaximo];
    }
    if (instrumento === 'bajoSintetico') return [31, 55];
    return [[48, 72], [53, 77], [60, 84]][canal];
}

function proyectarAlturas(secuencia, canal) {
    const {min_hz: min, max_hz: max} = BANDAS[canal];
    const rango = Math.log(max / min);
    return Float64Array.from(secuencia.tablas[canal], (hz, nivel) => {
        if (!nivel) return 0;
        return secuencia.escala === 'lineal' ? 1 + 254 * Math.log(hz / min) / rango : nivel;
    });
}

function nivelDinamica(velocidad) {
    if (velocidad < .3) return 'p';
    if (velocidad < .5) return 'mp';
    if (velocidad < .71) return 'mf';
    return 'f';
}

export class ArregloMusical {
    constructor(secuencia, opciones, mezcla) {
        this.secuencia = secuencia;
        this.opciones = {...opciones};
        this.titulo = secuencia.medio.titulo;
        const tonalidad = TONALIDADES[opciones.tonica], compas = COMPASES[opciones.compas];
        this.fifths = tonalidad[opciones.modo] ?? 0;
        this.tonica = tonalidad.centro;
        this.negraBpm = opciones.bpm * compas.pulso / 4;
        this.unidad = 60 / opciones.bpm / compas.pulso;
        this.unidadesCompas = compas.pulsos * (16 / compas.denominador);
        this.paso = opciones.figura === 'pulso' ? compas.pulso
            : opciones.figura === 'semicorchea' && opciones.nivel === 'intermedio' ? 1 : 2;
        this.compases = Math.max(1, Math.ceil((secuencia.duracion_s / this.unidad - 1e-7) / this.unidadesCompas));
        this.duracion = this.compases * this.unidadesCompas * this.unidad;
        this.pistas = mezcla.pistas.map((p, i) => this.crearPista(p, i));
    }

    paleta(canal, instrumento, afinacion, trasteMaximo) {
        const [min, max] = rangoPista(canal, instrumento, afinacion, trasteMaximo), clases = MODOS[this.opciones.modo];
        const disponibles = Array.from({length: max - min + 1}, (_, i) => min + i)
            .filter(n => clases.includes((n - this.tonica + 12) % 12)
                && (!afinacion || digitacion(n, afinacion.cuerdas, null, trasteMaximo)));
        const numero = Math.min(disponibles.length, this.opciones.alturas ?? 8);
        const desde = Math.floor((disponibles.length - numero) / 2);
        return disponibles.slice(desde, desde + numero);
    }

    crearPista(configuracion, canal) {
        const instrumento = configuracion.instrumento, tipo = INSTRUMENTOS[instrumento];
        const percusion = Boolean(tipo.golpe);
        const afinacion = tipo.cuerda === 'guitarra' ? AFINACIONES[this.opciones.afinacion]
            : instrumento === 'bajo' ? AFINACIONES.bajo : null;
        const nombre = instrumento === 'guitarraElectrica' ? tipo.nombre
            : afinacion?.nombre ?? tipo.nombre;
        const grave = Boolean(tipo.grave);
        const pista = {canal, instrumento, programa: tipo.programa, nombre, largo: colores[canal],
            percusion, afinacion, clave: percusion ? 'percussion' : grave ? 'F' : 'G',
            transposicion: afinacion ? -1 : 0, compases: [], eventos: []};
        const trasteMaximo = this.opciones.nivel === 'inicial' ? 5 : 12;
        const escala = percusion ? Object.keys(PERCUSION).map(Number) : this.paleta(canal, instrumento, afinacion, trasteMaximo);
        pista.alturas = [...escala];
        const alturas = proyectarAlturas(this.secuencia, canal);
        let anterior = null, previa = null;
        const saltoMaximo = this.opciones.nivel === 'inicial' ? 5 : this.unidad * this.paso < .45 ? 7 : 12;
        for (let compas = 0; compas < this.compases; compas++) {
            const base = compas * this.unidadesCompas, eventos = [];
            for (let pulso = 0; pulso < this.unidadesCompas; pulso += this.paso) {
                const inicio = base + pulso, fin = inicio + this.paso;
                const datos = this.leer(inicio, fin, canal, alturas);
                const fuerte = pulso === 0 || this.opciones.compas !== '3/4' && pulso === this.unidadesCompas / 2;
                let nota = null;
                if (datos.valor > 0) {
                    nota = percusion ? this.golpe(tipo.golpe, datos.valor)
                        : seleccionarAltura(datos.valor, escala, anterior, saltoMaximo);
                }
                if (nota === null && !percusion) anterior = null;
                const velocidad = nota === null ? 0 : Math.max(.12, (datos.intensidad / 255) ** .63);
                const precedente = eventos.at(-1);
                if (precedente && precedente.nota === nota && (!percusion || nota === null)
                    && Math.abs(precedente.velocidad - velocidad) < .10) {
                    if (nota !== null) {
                        const n = precedente.duracion / this.paso;
                        precedente.velocidad = (precedente.velocidad * n + velocidad) / (n + 1);
                    }
                    precedente.duracion += this.paso;
                    continue;
                }
                const posicion = nota !== null && afinacion ? digitacion(nota, afinacion.cuerdas, previa, trasteMaximo) : null;
                if (nota !== null) { previa = posicion; anterior = nota; }
                eventos.push({inicio, duracion: this.paso, nota, velocidad, x: datos.x, y: datos.y, posicion,
                    acento: nota !== null && (fuerte && velocidad > .45 || percusion && nota === 38)});
            }
            const tonos = eventos.filter(e => e.nota !== null);
            const intensidad = tonos.length ? tonos.reduce((s, e) => s + e.velocidad, 0) / tonos.length : null;
            pista.compases.push({numero: compas + 1, eventos, dinamica: intensidad === null ? null : nivelDinamica(intensidad)});
            pista.eventos.push(...tonos);
        }
        return pista;
    }

    leer(inicio, fin, canal, alturas) {
        const s = this.secuencia, dt = s.segundos_por_pixel;
        const a = inicio * this.unidad, b = Math.min(fin * this.unidad, s.duracion_s);
        const silencio = {valor: 0, intensidad: 0, x: .5, y: .5};
        if (b <= a + 1e-7) return silencio;
        let suma = 0, intensidad = 0, x = 0, y = 0;
        for (let i = Math.floor(a / dt); i < Math.min(s.pixeles, Math.ceil(b / dt)); i++) {
            if (!s.validez[i]) continue;
            const ancho = Math.min(b, (i + 1) * dt) - Math.max(a, i * dt);
            if (ancho <= 0) continue;
            const [col, fila] = s.coordenadas[i];
            const nivel = s.intensidadesSonoras[3 * i + canal];
            suma += ancho * alturas[nivel];
            intensidad += ancho * nivel;
            x += ancho * nivel * (col + .5) / s.lado;
            y += ancho * nivel * (fila + .5) / s.lado;
        }
        return intensidad ? {valor: suma / (b - a), intensidad: intensidad / (b - a), x: x / intensidad, y: y / intensidad}
            : silencio;
    }

    golpe(timbre, intensidad) {
        if (timbre === 'tom') return 45;
        return intensidad < 85 ? 36 : intensidad < 170 ? 38 : 42;
    }

    eventosAudio(canal) {
        const eventos = p => p.eventos.map(e => ({
            midi: e.nota, fuerza: e.velocidad, x: e.x, y: e.y,
            timbre: p.percusion ? PERCUSION[e.nota].timbre : p.instrumento,
            desde: e.inicio * this.unidad, hasta: (e.inicio + e.duracion) * this.unidad, acento: e.acento,
        }));
        return canal === undefined ? this.pistas.map(eventos) : eventos(this.pistas[canal]);
    }
}
