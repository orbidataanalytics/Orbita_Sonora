export const TAMANOS_ZONA = [1, 3, 5, 7, 9, 15, 21];
export const PESO_PIXEL = .7;

export class MediaZonal {
    constructor(lado, tamano) {
        this.lado = lado;
        this.paso = lado + 1;
        this.radio = (tamano - 1) / 2;
        this.tablas = Array.from({length: 4}, () => new Uint32Array(this.paso ** 2));
    }

    preparar(rgba) {
        const {lado, paso, tablas} = this;
        for (let y = 0; y < lado; y++) {
            const acumulado = [0, 0, 0, 0];
            for (let x = 0; x < lado; x++) {
                const i = (y * lado + x) * 4, alfa = rgba[i + 3] / 255;
                const destino = (y + 1) * paso + x + 1;
                acumulado[3] += Number(alfa > 0);
                for (let c = 0; c < 3; c++) acumulado[c] += Math.round(rgba[i + c] * alfa);
                for (let c = 0; c < 4; c++) tablas[c][destino] = acumulado[c] + tablas[c][destino - paso];
            }
        }
    }

    niveles(x, y, propios) {
        const {radio, lado, paso, tablas} = this;
        if (!radio) return propios;
        const x0 = Math.max(0, x - radio), y0 = Math.max(0, y - radio);
        const x1 = Math.min(lado, x + radio + 1), y1 = Math.min(lado, y + radio + 1);
        const a = y0 * paso + x0, b = y0 * paso + x1, c = y1 * paso + x0, d = y1 * paso + x1;
        const suma = tabla => tabla[d] - tabla[b] - tabla[c] + tabla[a];
        const vecinos = suma(tablas[3]) - 1;
        return vecinos > 0 ? propios.map((v, canal) =>
            Math.round(PESO_PIXEL * v + (1 - PESO_PIXEL) * (suma(tablas[canal]) - v) / vecinos))
            : propios;
    }
}
