const RAIZ = new URL('../../modelo/', import.meta.url);
const TAMANO = 128;
let carga;

async function archivo(ruta) {
    const respuesta = await fetch(new URL(ruta, RAIZ), {signal: AbortSignal.timeout(6000)});
    if (!respuesta.ok) throw new Error('No se pudo abrir el modelo visual.');
    return respuesta;
}

function abrirRed() {
    carga ??= Promise.all([
        archivo('red.json').then(r => r.json()),
        archivo('mobilenet-int8.bin').then(r => r.arrayBuffer()),
    ]).then(([capas, pesos]) => capas.map(([tipo, nucleo, paso, entrada, salida, offset]) => ({
        tipo, nucleo, paso, entrada, salida,
        escala: new Float32Array(pesos, offset, salida),
        sesgo: new Float32Array(pesos, offset + 4 * salida, salida),
        peso: new Int8Array(pesos, offset + 8 * salida, salida * nucleo ** 2 * (tipo === 'profundidad' ? 1 : entrada)),
    })));
    return carga;
}

function propagar(datos, lado, capa) {
    const {tipo, nucleo, paso, entrada, salida, escala, sesgo, peso} = capa;
    const profundidad = tipo === 'profundidad';
    const nuevo = Math.ceil(lado / paso);
    const margen = Math.floor(Math.max(0, (nuevo - 1) * paso + nucleo - lado) / 2);
    const valores = new Float32Array(nuevo * nuevo * salida);
    for (let y = 0; y < nuevo; y++) for (let x = 0; x < nuevo; x++) {
        const destino = (y * nuevo + x) * salida;
        const origen = (y * lado + x) * entrada;
        for (let f = 0; f < salida; f++) {
            let suma = 0;
            if (nucleo === 1) {
                for (let c = 0; c < entrada; c++) suma += peso[f * entrada + c] * datos[origen + c];
            } else {
                for (let ky = 0; ky < nucleo; ky++) {
                    const fila = y * paso + ky - margen;
                    if (fila < 0 || fila >= lado) continue;
                    for (let kx = 0; kx < nucleo; kx++) {
                        const columna = x * paso + kx - margen;
                        if (columna < 0 || columna >= lado) continue;
                        const pixel = (fila * lado + columna) * entrada;
                        if (profundidad) suma += peso[(f * nucleo + ky) * nucleo + kx] * datos[pixel + f];
                        else {
                            const kernel = ((f * nucleo + ky) * nucleo + kx) * entrada;
                            for (let c = 0; c < entrada; c++) suma += peso[kernel + c] * datos[pixel + c];
                        }
                    }
                }
            }
            const valor = escala[f] * suma + sesgo[f];
            valores[destino + f] = tipo === 'salida' ? valor : Math.max(0, Math.min(6, valor));
        }
    }
    return valores;
}

export async function clasificar(rgba) {
    const red = await abrirRed();
    let lado = TAMANO, datos = new Float32Array(lado * lado * 3);
    for (let i = 0; i < lado * lado; i++) for (let c = 0; c < 3; c++) {
        datos[3 * i + c] = (rgba[4 * i + c] * rgba[4 * i + 3] / 255) / 127.5 - 1;
    }
    for (const capa of red) {
        if (capa.tipo === 'salida') {
            const media = new Float32Array(capa.entrada);
            for (let i = 0; i < datos.length; i++) media[i % media.length] += datos[i] / (lado * lado);
            datos = media;
            lado = 1;
        }
        datos = propagar(datos, lado, capa);
        lado = Math.ceil(lado / capa.paso);
    }
    const max = Math.max(...datos), probabilidades = datos.map(valor => Math.exp(valor - max));
    const total = probabilidades.reduce((a, b) => a + b, 0);
    return Array.from(probabilidades, (valor, i) => [i, valor / total]).sort((a, b) => b[1] - a[1]).slice(0, 12);
}
