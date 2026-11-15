import {INSTRUMENTOS} from './audio-pistas.js?v=5.8.0';
import {BANDAS} from './sonificacion.js?v=5.8.0';
import {nivelGuitarra} from './estadistica-zonal.js';

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

const colores = ['Rojo', 'Verde', 'Azul'];

export function opcionesPartitura() {
    return {tonica: 'C', modo: 'mayor', alturas: 7, nivel: 'intermedio', compas: '4/4', bpm: 68, figura: 'zonal', afinacion: 'guitarra'};
}

export const tonalidadNombre = opciones => TONALIDADES[opciones.tonica].nombre + (opciones.modo === 'cromatica' ? ' cromática' : ' ' + opciones.modo);

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

function digitacion(midi, cuerdas, previa, trasteMaximo, registro) {
    if (!cuerdas) return null;
    const opciones = cuerdas.flatMap((abierta, orden) => {
        const traste = midi - abierta;
        const cuerda = cuerdas.length - orden;
        if (registro === 'bajo' && cuerda <= 3 || registro === 'melodia' && cuerda > 3) return [];
        return traste >= 0 && traste <= trasteMaximo ? [{cuerda, traste}] : [];
    });
    const coste = opcion => opcion.traste * .18 + (previa
        ? Math.abs(opcion.traste - previa.traste) * .45 + Math.abs(opcion.cuerda - previa.cuerda) * .36
        : Math.abs(opcion.traste - 2) * .45);
    opciones.sort((a, b) => coste(a) - coste(b));
    return opciones[0] || null;
}

function seleccionarAltura(valor, escala, anterior, saltoMaximo, limite = 8) {
    const margen = Math.floor(Math.max(0, escala.length - limite) / 2);
    const paleta = escala.slice(margen, margen + limite);
    const min = paleta[0], max = paleta.at(-1);
    const blanco = min + (max - min) * Math.max(0, valor - 1) / 254;
    if (anterior === null) {
        return paleta.reduce((a, b) => Math.abs(a - blanco) <= Math.abs(b - blanco) ? a : b);
    }
    const cercanas = paleta.filter(n => Math.abs(n - anterior) <= saltoMaximo);
    const referencia = cercanas.length ? blanco : anterior;
    return (cercanas.length ? cercanas : escala).reduce((a, b) =>
        Math.abs(a - referencia) <= Math.abs(b - referencia) ? a : b);
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

function rangoGuitarra(secuencia, canal) {
    const niveles = [];
    for (let i = 0; i < secuencia.pixeles; i++) {
        if (!secuencia.validez[i]) continue;
        const nivel = secuencia.intensidadesSonoras[3 * i + canal];
        if (nivel) niveles.push(nivel);
    }
    niveles.sort((a, b) => a - b);
    const percentil = q => niveles[Math.floor((niveles.length - 1) * q)] ?? 0;
    return {min: percentil(.10), ancho: Math.max(20, percentil(.88) - percentil(.10))};
}

function gradoPorColor(intensidad, min, max) {
    const [r, g, b] = intensidad;
    if (!(r + g + b)) return 0;
    const brillo = (r + 2 * g + b) / 1020;
    const relativo = max - min > .008 ? (brillo - min) / (max - min) : Math.sqrt(brillo);
    const nivel = .77 * relativo + .23 * Math.sqrt(brillo);
    const diferencia = 2.5 + 18 * brillo;
    if (r - b > diferencia) return nivel < .57 ? 2 : 3;
    if (b - r > diferencia) return nivel < .48 ? 1 : 4;
    if (g - (r + b) / 2 > diferencia) return nivel < .4 ? 0 : 5;
    return nivel < .26 ? 0 : nivel < .53 ? 1 : nivel < .7 ? 2 : 3;
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
        this.pulso = compas.pulso;
        this.negraBpm = opciones.bpm * compas.pulso / 4;
        this.unidad = 60 / opciones.bpm / compas.pulso;
        this.unidadesCompas = compas.pulsos * (16 / compas.denominador);
        this.paso = ['pulso', 'zonal'].includes(opciones.figura) ? compas.pulso
            : opciones.figura === 'semicorchea' && opciones.nivel === 'intermedio' ? 1 : 2;
        this.compases = Math.max(1, Math.ceil((secuencia.duracion_s / this.unidad - 1e-7) / this.unidadesCompas));
        this.duracion = this.compases * this.unidadesCompas * this.unidad;
        this.armonia = this.crearArmonia(compas);
        this.pistas = mezcla.pistas.map((p, i) => this.crearPista(p, i));
    }

    crearArmonia(compas) {
        const menor = this.opciones.modo === 'menor';
        const acordes = menor ? [[0, 3, 7], [7, 10, 2], [8, 0, 3], [5, 8, 0], [10, 2, 5], [3, 7, 10]]
            : [[0, 4, 7], [7, 11, 2], [9, 0, 4], [5, 9, 0], [2, 5, 9], [4, 7, 11]];
        const mitad = this.unidadesCompas % (2 * compas.pulso) ? this.unidadesCompas : this.unidadesCompas / 2;
        const pulso = Math.ceil(Math.max(compas.pulso, mitad) / this.paso) * this.paso;
        const perfiles = BANDAS.map((_, canal) => proyectarAlturas(this.secuencia, canal));
        const zonas = [];
        for (let base = 0; base < this.compases * this.unidadesCompas; base += this.unidadesCompas) {
            for (let i = 0; i < this.unidadesCompas; i += pulso) {
                const desde = base + i, hasta = Math.min(desde + pulso, base + this.unidadesCompas);
                const intensidad = perfiles.map((perfil, canal) => this.leer(desde, hasta, canal, perfil).intensidad);
                zonas.push({desde, hasta, intensidad});
            }
        }
        const brillos = zonas.map(({intensidad: [r, g, b]}) => (r + 2 * g + b) / 1020).filter(Boolean);
        const min = Math.min(...brillos), max = Math.max(...brillos);
        return zonas.map(zona => {
            const grados = acordes[gradoPorColor(zona.intensidad, min, max)];
            const clases = grados.map(n => (n + this.tonica) % 12);
            const nombre = nombreAfinado(60 + clases[0], this.fifths < 0).slice(0, -1);
            const esMenor = (clases[1] - clases[0] + 12) % 12 === 3;
            return {...zona, clases, nombre: nombre + (esMenor ? 'm' : '')};
        });
    }

    paleta(canal, instrumento, afinacion, trasteMaximo, zonal) {
        const [min, max] = zonal ? [afinacion.cuerdas[0], afinacion.cuerdas.at(-1) + trasteMaximo]
            : rangoPista(canal, instrumento, afinacion, trasteMaximo);
        return Array.from({length: max - min + 1}, (_, i) => min + i)
            .filter(n => !afinacion || digitacion(n, afinacion.cuerdas, null, trasteMaximo));
    }

    figuras(base, guitarra, canal, alturas) {
        const figuras = [];
        for (let pulso = 0; pulso < this.unidadesCompas; pulso += this.paso) {
            let divisiones = [this.paso];
            if (guitarra && canal !== 0) {
                const perfil = this.leer(base + pulso, base + pulso + this.paso, canal, alturas);
                const debil = pulso / this.pulso % 2 === 1;
                const umbral = debil ? 10 : 18;
                if (perfil.textura > umbral) {
                    divisiones = this.paso === 4 ? [2, 2]
                        : perfil.textura > 28 && this.opciones.nivel === 'intermedio' ? [2, 2, 2] : [4, 2];
                }
            }
            let inicio = base + pulso;
            for (const [i, duracion] of divisiones.entries()) {
                let registro = null;
                if (guitarra) {
                    const bajo = canal === 0 || canal === 1 && i === 0 && pulso / this.pulso % 2 === 0;
                    registro = bajo ? 'bajo' : 'melodia';
                }
                figuras.push({inicio, duracion, registro});
                inicio += duracion;
            }
        }
        return figuras;
    }

    crearPista(configuracion, canal) {
        const instrumento = configuracion.instrumento, tipo = INSTRUMENTOS[instrumento];
        const percusion = Boolean(tipo.golpe);
        const afinacion = tipo.cuerda === 'guitarra' ? AFINACIONES[this.opciones.afinacion]
            : instrumento === 'bajo' ? AFINACIONES.bajo : null;
        const nombre = tipo.cuerda === 'guitarra' ? tipo.nombre : afinacion?.nombre ?? tipo.nombre;
        const grave = Boolean(tipo.grave);
        const pista = {canal, instrumento, programa: tipo.programa, nombre, largo: colores[canal],
            percusion, afinacion, clave: percusion ? 'percussion' : grave ? 'F' : 'G',
            transposicion: afinacion ? -1 : 0, compases: [], eventos: []};
        const guitarra = tipo.cuerda === 'guitarra';
        const zonal = guitarra && this.opciones.figura === 'zonal';
        const rango = zonal ? rangoGuitarra(this.secuencia, canal) : null;
        const trasteMaximo = this.opciones.nivel === 'inicial' ? 5 : 7;
        const escala = percusion ? Object.keys(PERCUSION).map(Number) : this.paleta(canal, instrumento, afinacion, trasteMaximo, zonal);
        const alturas = proyectarAlturas(this.secuencia, canal);
        let anterior = null, anteriorMelodia = null, previa = null, indiceAcorde = 0;
        let registros = {};
        let armonia = this.armonia[0];
        const delAcorde = () => escala.filter(n => armonia.clases.includes(n % 12));
        let paleta = delAcorde();
        const saltoMaximo = this.opciones.nivel === 'inicial' ? 5 : zonal || this.unidad * this.paso < .45 ? 7 : 12;
        for (let compas = 0; compas < this.compases; compas++) {
            const base = compas * this.unidadesCompas, eventos = [];
            for (const {inicio, duracion, registro} of this.figuras(base, zonal, canal, alturas)) {
                const fin = inicio + duracion;
                if (inicio >= armonia.hasta) {
                    armonia = this.armonia[++indiceAcorde];
                    paleta = delAcorde();
                    registros = {};
                }
                const datos = this.leer(inicio, fin, canal, alturas);
                const pulso = inicio - base;
                const fuerte = pulso === 0 || this.opciones.compas !== '3/4' && pulso === this.unidadesCompas / 2;
                let nota = null;
                let zona = registro;
                if (datos.valor > 0) {
                    const disponibles = registro ? registros[registro] ??= paleta.filter(n =>
                        digitacion(n, afinacion.cuerdas, null, trasteMaximo, registro)) : paleta;
                    if (!disponibles.length) zona = null;
                    nota = percusion ? this.golpe(tipo.golpe, datos.valor)
                        : this.elegirNota(datos, zona, disponibles.length ? disponibles : paleta,
                            zona === 'melodia' ? anteriorMelodia : anterior, saltoMaximo, armonia, rango);
                }
                if (nota === null && !percusion) anterior = null;
                const velocidad = nota === null ? 0 : Math.max(.12, (datos.intensidad / 255) ** .63);
                const precedente = eventos.at(-1);
                if (precedente && precedente.nota === nota && inicio !== armonia.desde && (!zonal && !percusion || nota === null)
                    && Math.abs(precedente.velocidad - velocidad) < .10) {
                    if (nota !== null) {
                        precedente.velocidad = (precedente.velocidad * precedente.duracion + velocidad * duracion)
                            / (precedente.duracion + duracion);
                    }
                    precedente.duracion += duracion;
                    continue;
                }
                const posicion = nota !== null && afinacion ? digitacion(nota, afinacion.cuerdas, previa, trasteMaximo, zona) : null;
                if (nota !== null) { previa = posicion; anterior = nota; }
                if (zona === 'melodia' && nota !== null) anteriorMelodia = nota;
                eventos.push({inicio, duracion, nota, velocidad, x: datos.x, y: datos.y, posicion,
                    acento: nota !== null && (fuerte && velocidad > .45 || percusion && nota === 38)});
            }
            const tonos = eventos.filter(e => e.nota !== null);
            const intensidad = tonos.length ? tonos.reduce((s, e) => s + e.velocidad, 0) / tonos.length : null;
            pista.compases.push({numero: compas + 1, eventos, dinamica: intensidad === null ? null : nivelDinamica(intensidad)});
            pista.eventos.push(...tonos);
        }
        pista.alturas = [...new Set(pista.eventos.map(e => e.nota))].sort((a, b) => a - b);
        return pista;
    }

    elegirNota(datos, registro, paleta, anterior, salto, acorde, rango) {
        if (registro === 'bajo') {
            const clase = acorde.clases[datos.tendencia > 10 ? 2 : 0];
            const bajo = paleta.find(n => n % 12 === clase);
            if (bajo !== undefined) return bajo;
        }
        let valor = datos.valor;
        if (registro === 'melodia') {
            const relativo = (valor + .70 * datos.tendencia - rango.min) / rango.ancho;
            valor = .18 * valor + .82 * (1 + 254 * Math.min(1, Math.max(0, relativo)));
        }
        return seleccionarAltura(valor, paleta, anterior, salto, this.opciones.alturas);
    }

    leer(inicio, fin, canal, alturas, guitarra = false) {
        const s = this.secuencia, dt = s.segundos_por_pixel;
        const a = inicio * this.unidad, b = Math.min(fin * this.unidad, s.duracion_s);
        const silencio = {valor: 0, intensidad: 0, x: .5, y: .5, textura: 0, tendencia: 0};
        if (b <= a + 1e-7) return silencio;
        let suma = 0, intensidad = 0, x = 0, y = 0;
        let contraste = 0, cambios = 0, inicial = null, anterior = null, celdaAnterior = null;
        for (let i = Math.floor(a / dt); i < Math.min(s.pixeles, Math.ceil(b / dt)); i++) {
            if (!s.validez[i]) continue;
            const ancho = Math.min(b, (i + 1) * dt) - Math.max(a, i * dt);
            if (ancho <= 0) continue;
            const [col, fila] = s.coordenadas[i];
            const pos = 3 * i, rgb = s.intensidadesSonoras;
            const nivel = guitarra ? nivelGuitarra(rgb, pos, canal) : rgb[pos + canal];
            inicial ??= nivel;
            contraste += ancho * s.contrastes[i];
            if (celdaAnterior !== null) {
                const delta = Math.abs(rgb[pos] - rgb[celdaAnterior]) + Math.abs(rgb[pos + 1] - rgb[celdaAnterior + 1])
                    + Math.abs(rgb[pos + 2] - rgb[celdaAnterior + 2]);
                cambios += ancho * (.45 * Math.abs(nivel - anterior) + .55 * delta / 3);
            }
            celdaAnterior = pos;
            anterior = nivel;
            suma += ancho * alturas[nivel];
            intensidad += ancho * nivel;
            x += ancho * nivel * (col + .5) / s.lado;
            y += ancho * nivel * (fila + .5) / s.lado;
        }
        return intensidad ? {valor: suma / (b - a), intensidad: intensidad / (b - a), x: x / intensidad, y: y / intensidad,
            textura: (contraste + cambios) / (b - a), tendencia: anterior - inicial}
            : silencio;
    }

    golpe(timbre, intensidad) {
        if (timbre === 'tom') return 45;
        return intensidad < 85 ? 36 : intensidad < 170 ? 38 : 42;
    }

    vozCantante() {
        const s = this.secuencia, sumas = [0, 0, 0];
        for (let i = 0; i < s.pixeles; i++) {
            if (!s.validez[i]) continue;
            for (let c = 0; c < 3; c++) sumas[c] += s.intensidadesSonoras[3 * i + c];
        }
        const [r, g, b] = sumas.map(n => n / Math.max(1, s.validos));
        const centro = 60 + Math.round(7 * Math.sqrt((r + 2 * g + b) / 1020));
        const alturas = proyectarAlturas(s, 1);
        let anterior = null, acorde = 0;
        const voz = {canal: 3, instrumento: 'voz', programa: 53, nombre: 'Voz', largo: '',
            percusion: false, afinacion: null, clave: 'G', transposicion: 0, compases: []};
        for (let i = 0; i < this.compases; i++) {
            const base = i * this.unidadesCompas;
            const eventos = this.figuras(base, this.opciones.figura === 'zonal', 1, alturas).map(({inicio, duracion}) => {
                if (inicio >= this.armonia[acorde].hasta) acorde++;
                const perfil = this.leer(inicio, inicio + duracion, 1, alturas, true);
                let nota = null;
                if (perfil.valor > 0) {
                    const objetivo = centro + Math.max(-4, Math.min(4, perfil.tendencia / 9));
                    const opciones = Array.from({length: 16}, (_, j) => 57 + j)
                        .filter(n => this.armonia[acorde].clases.includes(n % 12));
                    const coste = n => Math.abs(n - objetivo) + (anterior === null ? 0 : .65 * Math.abs(n - anterior));
                    nota = opciones.reduce((a, b) => coste(a) <= coste(b) ? a : b);
                }
                anterior = nota;
                return {inicio, duracion, nota, acento: false};
            });
            voz.compases.push({numero: i + 1, eventos});
        }
        return voz;
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
