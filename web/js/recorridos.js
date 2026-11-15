export const NOMBRES_RECORRIDO = {
    filas: 'Líneas por filas',
    serpentina: 'Serpentina por filas',
    hilbert: 'Curva de Hilbert',
    radial: 'Radial',
    zigzag: 'Zigzag diagonal',
};

export function puntoHilbert(indice, lado) {
    let x = 0, y = 0, restante = indice;
    for (let escala = 1; escala < lado; escala *= 2) {
        const rx = 1 & (restante >> 1), ry = 1 & (restante ^ rx);
        if (!ry) {
            if (rx) [x, y] = [escala - 1 - x, escala - 1 - y];
            [x, y] = [y, x];
        }
        x += escala * rx;
        y += escala * ry;
        restante >>= 2;
    }
    return [x, y];
}

function radial(lado) {
    const centro = (lado - 1) / 2;
    const puntos = Array.from({length: lado ** 2}, (_, indice) => {
        const x = indice % lado, y = Math.floor(indice / lado);
        return {x, y, radio: (x - centro) ** 2 + (y - centro) ** 2,
            angulo: (Math.atan2(y - centro, x - centro) + 2 * Math.PI) % (2 * Math.PI)};
    });
    puntos.sort((a, b) => a.radio - b.radio || a.angulo - b.angulo);
    return puntos.map(({x, y}) => [x, y]);
}

function zigzag(lado) {
    const puntos = [];
    for (let d = 0; d < 2 * lado - 1; d++) {
        const inicio = Math.max(0, d - lado + 1), fin = Math.min(d, lado - 1);
        for (let k = inicio; k <= fin; k++) {
            const x = d % 2 ? k : inicio + fin - k;
            puntos.push([x, d - x]);
        }
    }
    return puntos;
}

export function coordenadasRecorrido(lado, recorrido) {
    if (recorrido === 'radial') return radial(lado);
    if (recorrido === 'zigzag') return zigzag(lado);
    if (recorrido === 'hilbert') {
        if (!Number.isInteger(lado) || lado < 1 || (lado & (lado - 1))) {
            throw new Error('Hilbert requiere una cuadrícula cuadrada con lado potencia de dos.');
        }
        return Array.from({length: lado ** 2}, (_, i) => puntoHilbert(i, lado));
    }
    return Array.from({length: lado ** 2}, (_, i) => {
        const y = Math.floor(i / lado), x = i % lado;
        return [recorrido === 'serpentina' && y % 2 ? lado - 1 - x : x, y];
    });
}
