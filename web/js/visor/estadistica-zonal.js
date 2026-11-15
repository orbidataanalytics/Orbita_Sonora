export const TAMANOS_ZONA = [1, 3, 5, 7, 9, 15, 21];
export const ZONA_INICIAL = 5;
export const PESO_PIXEL = .7;
const brillo = ([r, g, b]) => (r + 2 * g + b) / 4;

export function nivelGuitarra(rgb, posicion, canal) {
    const r = rgb[posicion], g = rgb[posicion + 1], b = rgb[posicion + 2];
    return Math.round(.55 * rgb[posicion + canal] + .2 * (r + g + b) / 3 + .25 * Math.max(r, g, b));
}

export class MediaZonal {
    constructor(lado, tamano) {
        this.lado = lado;
        this.paso = lado + 1;
        this.radio = (tamano - 1) / 2;
        this.tablas = Array.from({length: 4}, () => new Uint32Array(this.paso ** 2));
        this.cuadrados = new Float64Array(this.paso ** 2);
    }

    preparar(rgba) {
        const {lado, paso, tablas, cuadrados} = this;
        for (let y = 0; y < lado; y++) {
            const acumulado = [0, 0, 0, 0];
            let sumaCuadrados = 0;
            for (let x = 0; x < lado; x++) {
                const i = (y * lado + x) * 4, alfa = rgba[i + 3] / 255;
                const destino = (y + 1) * paso + x + 1;
                const rgb = [0, 1, 2].map(c => Math.round(rgba[i + c] * alfa));
                acumulado[3] += Number(alfa > 0);
                for (let c = 0; c < 3; c++) acumulado[c] += rgb[c];
                sumaCuadrados += brillo(rgb) ** 2;
                for (let c = 0; c < 4; c++) tablas[c][destino] = acumulado[c] + tablas[c][destino - paso];
                cuadrados[destino] = sumaCuadrados + cuadrados[destino - paso];
            }
        }
    }

    leer(x, y, propios) {
        const {radio, lado, paso, tablas, cuadrados} = this;
        const x0 = Math.max(0, x - radio), y0 = Math.max(0, y - radio);
        const x1 = Math.min(lado, x + radio + 1), y1 = Math.min(lado, y + radio + 1);
        const a = y0 * paso + x0, b = y0 * paso + x1, c = y1 * paso + x0, d = y1 * paso + x1;
        const suma = tabla => tabla[d] - tabla[b] - tabla[c] + tabla[a];
        const cantidad = suma(tablas[3]);
        if (cantidad < 2) return {rgb: propios, contraste: 0};
        const totales = tablas.slice(0, 3).map(suma);
        const vecinos = totales.map((v, i) => (v - propios[i]) / (cantidad - 1));
        const rgb = propios.map((v, i) => Math.round(PESO_PIXEL * v + (1 - PESO_PIXEL) * vecinos[i]));
        const dispersion = Math.sqrt(Math.max(0, suma(cuadrados) / cantidad - (brillo(totales) / cantidad) ** 2));
        const borde = Math.abs(brillo(propios) - brillo(vecinos));
        return {rgb, contraste: Math.min(255, Math.round(.66 * dispersion + .34 * borde))};
    }
}
