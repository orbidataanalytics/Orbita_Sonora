export const INSTRUMENTOS = {
    percusion: {nombre: 'Percusión electrónica', programa: 0, golpe: 'bombo'},
    tambor: {nombre: 'Tambor de tom', programa: 0, golpe: 'tom'},
    guitarra: {nombre: 'Acústica de nailon', programa: 24, cuerda: 'guitarra'},
    guitarraAcero: {nombre: 'Acústica de acero', programa: 25, cuerda: 'guitarra'},
    guitarraElectrica: {nombre: 'Eléctrica limpia', programa: 27, cuerda: 'guitarra'},
    bajo: {nombre: 'Bajo eléctrico', programa: 33, grave: true},
    bajoSintetico: {nombre: 'Bajo sintetizado', programa: 38, grave: true},
    sintetizador: {nombre: 'Sintetizador suave', programa: 89},
    piano: {nombre: 'Piano', programa: 0},
    seno: {nombre: 'Tono sinusoidal', programa: 80},
    muestra: {nombre: 'Muestra WAV del usuario', programa: 80},
};

const DOS_PI = 2 * Math.PI;
export const TASA_AUDIO = 48000;
const limit = (n, a, b) => Math.min(b, Math.max(a, n));
export const aHz = midi => 440 * 2 ** ((midi - 69) / 12);
export const aMidi = hz => Math.round(69 + 12 * Math.log2(hz / 440));

export function mezclaInicial() {
    return {reverb: 0, espacio: .65, filtroY: false, pistas: [
        {instrumento: 'guitarra', volumen: .48, panorama: -.23, mute: false, solo: false},
        {instrumento: 'guitarra', volumen: .95, panorama: 0, mute: false, solo: false},
        {instrumento: 'guitarra', volumen: .40, panorama: .23, mute: false, solo: false},
    ]};
}

export function notaInstrumento(midi, instrumento) {
    if (midi < 0) return midi;
    if (!INSTRUMENTOS[instrumento]?.grave) return Math.min(127, midi);
    while (midi > 51) midi -= 12;
    return midi < 28 ? midi + 12 : midi;
}

export function volumenPista(mezcla, indice) {
    const pista = mezcla.pistas[indice];
    return pista.mute || (mezcla.pistas.some(p => p.solo) && !pista.solo) ? 0 : pista.volumen;
}

export function espacioPixel(x, y, mezcla, panorama = 0) {
    x = limit(x, 0, 1); y = limit(y, 0, 1);
    const distancia = Math.hypot(2 * x - 1, 2 * y - 1) / Math.SQRT2;
    const pan = limit(panorama + (2 * x - 1) * mezcla.espacio, -1, 1);
    return {pan, wet: mezcla.reverb * (.08 + .92 * distancia), corte: mezcla.filtroY ? 600 + 10500 * (1 - y) ** 2 : 0};
}

export class Voz {
    constructor(instrumento, tasa, muestra) {
        this.instrumento = instrumento;
        this.tasa = tasa;
        this.muestra = muestra;
        this.fase = 0;
        this.edad = 100;
        this.puntero = 0;
        this.semilla = 7237;
        this.paso = 0;
    }

    nota(hz, ataque) {
        this.paso = DOS_PI * hz / this.tasa;
        this.razon = hz / aHz(60) * (this.muestra?.tasa ?? this.tasa) / this.tasa;
        if (ataque) { this.edad = 0; this.puntero = 0; }
    }

    muestraAudio() {
        const f = this.fase, t = this.edad / this.tasa;
        this.edad++;
        this.fase += this.paso;
        if (this.fase >= DOS_PI) this.fase -= DOS_PI;
        const s = Math.sin(f);
        switch (this.instrumento) {
            case 'guitarra':
            case 'guitarraAcero':
                return (s * .65 + .23 * Math.sin(2 * f) + .12 * Math.sin(3 * f)) * (.31 + .69 * Math.exp(-14 * t));
            case 'guitarraElectrica':
                return Math.tanh((s + .25 * Math.sin(3 * f) + .11 * Math.sin(5 * f)) * 1.5) * (.42 + .58 * Math.exp(-8 * t));
            case 'bajo':
                return (.84 * s + .16 * Math.sin(2 * f)) * (.76 + .24 * Math.exp(-10 * t));
            case 'bajoSintetico':
                return .72 * s + .18 * Math.sin(2 * f) + .1 * Math.sin(3 * f);
            case 'sintetizador':
                return .8 * s + .2 * Math.sin(2 * f + Math.sin(t * 11) * .5);
            case 'piano':
                return .64 * s * Math.exp(-2.6 * t)
                    + .23 * Math.sin(2 * f) * Math.exp(-8 * t)
                    + .09 * Math.sin(3 * f) * Math.exp(-13 * t)
                    + .04 * Math.sin(4 * f) * Math.exp(-24 * t);
            case 'percusion':
                return Math.sin(f + 3.4 * Math.exp(-42 * t)) * Math.exp(-19 * t);
            case 'caja':
                return (.84 * this.ruido() + .16 * Math.sin(2.3 * f)) * Math.exp(-18 * t);
            case 'charles': {
                const ruido = this.ruido();
                const brillante = ruido - (this.ruidoAnterior || 0);
                this.ruidoAnterior = ruido;
                return brillante * .45 * Math.exp(-41 * t);
            }
            case 'tambor':
                return (.77 * Math.sin(f + 2 * Math.exp(-29 * t)) + .23 * this.ruido()) * Math.exp(-13 * t);
            case 'muestra': {
                const datos = this.muestra?.datos, i = Math.floor(this.puntero), peso = this.puntero - i;
                this.puntero += this.razon || 1;
                return datos && i + 1 < datos.length ? datos[i] * (1 - peso) + datos[i + 1] * peso : 0;
            }
            default:
                return s;
        }
    }

    ruido() {
        this.semilla = (Math.imul(1664525, this.semilla) + 1013904223) | 0;
        return this.semilla / 2147483648;
    }
}

class Reverberacion {
    constructor(tasa) {
        const retardos = [.031, .047, .071, .097, .131, .173];
        this.lineas = retardos.map(s => new Float32Array(Math.round(s * tasa)));
        this.posiciones = retardos.map(() => 0);
    }

    procesar(izquierda, derecha, destino) {
        destino[0] = destino[1] = 0;
        for (let i = 0; i < this.lineas.length; i++) {
            const linea = this.lineas[i], p = this.posiciones[i], salida = linea[p];
            const alterno = i % 2;
            const entrada = alterno ? derecha * .78 + izquierda * .22 : izquierda * .78 + derecha * .22;
            linea[p] = entrada + salida * (.65 - .04 * i);
            this.posiciones[i] = p + 1 === linea.length ? 0 : p + 1;
            destino[alterno] += salida * .27;
            destino[1 - alterno] += salida * .09;
        }
    }
}

export function renderizarArreglo({pistas, duracion, mezcla, lectura, vozGrabada, muestras}, progreso = () => {}) {
    const tasa = TASA_AUDIO, longitud = Math.max(1, Math.ceil(duracion * tasa));
    const canales = [new Float32Array(longitud), new Float32Array(longitud)];
    const intervaloProgreso = Math.max(1, Math.floor(longitud / 20));
    const celdas = (lectura?.intensidades.length ?? 0) / 3;
    const maximos = [32, 32, 32];
    for (let i = 0; i < celdas; i++) {
        if (!lectura.validez[i]) continue;
        for (let c = 0; c < 3; c++) maximos[c] = Math.max(maximos[c], lectura.intensidades[3 * i + c]);
    }
    const avanceCelda = celdas ? celdas / (lectura.duracion * tasa) : 0;
    const suavizado = 1 - Math.exp(-1 / (.003 * tasa));
    for (const [canal, eventos] of pistas.entries()) {
        const volumen = volumenPista(mezcla, canal);
        if (!volumen) continue;
        const pista = mezcla.pistas[canal], voz = new Voz(pista.instrumento, tasa, pista.muestra);
        const grabacion = muestras?.[canal], esGuitarra = INSTRUMENTOS[pista.instrumento].cuerda === 'guitarra';
        const reverb = mezcla.reverb > 0 ? new Reverberacion(tasa) : null, retorno = [0, 0];
        let pendiente = 0, nota = null, filtro = 0, celda = -1, nivel = 1, objetivo = 1;
        for (let i = 0; i < longitud; i++) {
            if (i % intervaloProgreso === 0) progreso((canal + i / longitud) / 3);
            if (nota?.fin <= i) nota = null;
            const evento = eventos[pendiente];
            if (evento && i >= Math.round(evento.desde * tasa)) {
                const recorte = grabacion?.notas[pendiente];
                pendiente++;
                const e = espacioPixel(evento.x, evento.y, mezcla, pista.panorama);
                nota = {
                    desde: i, fin: Math.round(evento.hasta * tasa),
                    amplitud: (recorte ? .86 : .31) * volumen * evento.fuerza * (evento.acento ? 1.08 : 1),
                    izquierda: Math.cos((e.pan + 1) * Math.PI / 4),
                    derecha: Math.sin((e.pan + 1) * Math.PI / 4),
                    wet: e.wet, coeficiente: e.corte ? 1 - Math.exp(-DOS_PI * e.corte / tasa) : 1,
                    recorte, posicion: recorte?.inicio,
                };
                if (!recorte) {
                    voz.instrumento = evento.timbre;
                    voz.nota(aHz(evento.midi), true);
                }
            }
            let l = 0, r = 0, wet = 0;
            if (nota) {
                const envolvente = Math.min(1, (i - nota.desde) / 150, (nota.fin - i) / 1600);
                if (celdas) {
                    const actual = Math.min(celdas - 1, Math.floor(i * avanceCelda));
                    if (actual !== celda) {
                        const intensidad = lectura.validez[actual] ? lectura.intensidades[3 * actual + canal] : 0;
                        const envolventeRGB = Math.sqrt(intensidad / 255);
                        objetivo = esGuitarra ? .62 * envolventeRGB + .38 * (intensidad / maximos[canal]) ** 2.3 : envolventeRGB;
                        celda = actual;
                    }
                    nivel += (objetivo - nivel) * suavizado;
                }
                let muestra = 0;
                if (!nota.recorte) muestra = voz.muestraAudio();
                else if (nota.posicion < nota.recorte.fin - 1) {
                    const j = Math.floor(nota.posicion), fraccion = nota.posicion - j;
                    muestra = grabacion.datos[j] * (1 - fraccion) + grabacion.datos[j + 1] * fraccion;
                    nota.posicion += nota.recorte.paso;
                }
                const valor = muestra * nota.amplitud * envolvente * nivel;
                filtro += (valor - filtro) * nota.coeficiente;
                l = filtro * nota.izquierda;
                r = filtro * nota.derecha;
                wet = nota.wet;
            } else filtro = 0;
            if (reverb) reverb.procesar(l * wet, r * wet, retorno);
            const borde = Math.min(1, (longitud - 1 - i) / 240);
            canales[0][i] += (l * (1 - wet) + retorno[0]) * borde;
            canales[1][i] += (r * (1 - wet) + retorno[1]) * borde;
        }
    }
    if (vozGrabada) {
        progreso(.98);
        const {canales: grabados, tasa: tasaGrabada} = vozGrabada;
        const relacion = tasaGrabada / tasa;
        const muestras = Math.min(longitud, Math.ceil(grabados[0].length / relacion));
        for (const [canal, salida] of canales.entries()) {
            const original = grabados[canal] || grabados[0];
            for (let i = 0; i < muestras; i++) {
                const posicion = i * relacion;
                const j = Math.min(original.length - 1, Math.floor(posicion));
                const siguiente = Math.min(original.length - 1, j + 1);
                const fraccion = posicion - j;
                const borde = Math.min(1, i / 240, (muestras - 1 - i) / 480);
                const voz = original[j] * (1 - fraccion) + original[siguiente] * fraccion;
                salida[i] = (.7 * salida[i]) + .54 * borde * voz;
            }
        }
    }
    progreso(1);
    return {canales, tasa};
}

export function renderizarNota(contexto, instancia, frecuencia, duracion, intensidad, instrumento) {
    const tasa = contexto.sampleRate, cantidad = Math.max(1, Math.ceil(duracion * tasa));
    const buffer = contexto.createBuffer(1, cantidad, tasa), datos = buffer.getChannelData(0);
    const voz = new Voz(instrumento, tasa, instancia.muestra);
    voz.nota(frecuencia, true);
    for (let i = 0; i < cantidad; i++) {
        const borde = Math.min(1, i / 100, (cantidad - 1 - i) / 130);
        datos[i] = voz.muestraAudio() * borde * intensidad * .25;
    }
    return buffer;
}

export function archivoWav({canales, tasa}, volumen = 1) {
    const cantidad = canales[0].length, numero = canales.length, salto = numero * 2;
    const datos = new ArrayBuffer(44 + cantidad * salto);
    const wav = new DataView(datos);
    const texto = (inicio, valor) => [...valor].forEach((c, i) => wav.setUint8(inicio + i, c.charCodeAt(0)));
    texto(0, 'RIFF'); wav.setUint32(4, datos.byteLength - 8, true); texto(8, 'WAVE');
    texto(12, 'fmt '); wav.setUint32(16, 16, true); wav.setUint16(20, 1, true);
    wav.setUint16(22, numero, true); wav.setUint32(24, tasa, true);
    wav.setUint32(28, tasa * salto, true); wav.setUint16(32, salto, true); wav.setUint16(34, 16, true);
    texto(36, 'data'); wav.setUint32(40, cantidad * salto, true);
    for (let i = 0; i < cantidad; i++) for (let c = 0; c < numero; c++) {
        wav.setInt16(44 + i * salto + c * 2, Math.round(limit(canales[c][i] * volumen, -1, 1) * 32767), true);
    }
    return new Blob([datos], {type: 'audio/wav'});
}
