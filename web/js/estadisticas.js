export function decodificar(base64) {
    return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

function percentil(orden, q) {
    const i = (orden.length - 1) * q, lo = Math.floor(i), hi = Math.min(orden.length - 1, lo + 1);
    return orden[lo] + (orden[hi] - orden[lo]) * (i - lo);
}

function resumen(valores) {
    if (!valores.length) return {
        minimo: null, maximo: null, media: null, mediana: null,
        desviacion_poblacional: null, p05: null, p95: null,
    };
    const orden = valores.slice().sort((a, b) => a - b);
    const media = valores.reduce((s, v) => s + v, 0) / valores.length;
    const varianza = valores.reduce((s, v) => s + (v - media) ** 2, 0) / valores.length;
    return {
        minimo: orden[0], maximo: orden.at(-1), media, mediana: percentil(orden, .5),
        desviacion_poblacional: Math.sqrt(varianza), p05: percentil(orden, .05), p95: percentil(orden, .95),
    };
}

export function calcularInforme(cancion, niveles, marcas = []) {
    const rgb = decodificar(cancion.rgb_base64), activos = decodificar(cancion.activos_base64), n = cancion.pixeles;
    const validez = cancion.validez_base64 ? decodificar(cancion.validez_base64) : new Uint8Array(n).fill(1);
    const valores = Array.from({length: n}, (_, i) => Array.from(rgb.slice(i * 3, i * 3 + 3)));
    const indices = [];
    const conteos = new Map();
    let total = 0;
    for (let i = 0; i < n; i++) {
        if (!validez[i]) continue;
        indices.push(i);
        if (!activos[i]) continue;
        const firma = valores[i].map(v => Math.floor(v * niveles / 256)), clave = firma.join(',');
        if (!conteos.has(clave)) conteos.set(clave, {firma, veces: 0, primero: i});
        conteos.get(clave).veces++;
        total++;
    }
    const firmas = [...conteos.values()].map(f => ({...f, porcentaje: f.veces / total * 100}))
        .sort((a, b) => b.veces - a.veces || a.firma[0] - b.firma[0] || a.firma[1] - b.firma[1] || a.firma[2] - b.firma[2]);

    const puntos = new Map();
    const agregar = (i, motivo) => {
        if (!puntos.has(i)) puntos.set(i, []);
        puntos.get(i).push(motivo);
    };
    if (indices.length) {
        for (let banda = 0; banda < 3; banda++) {
            const mayor = indices.reduce((a, b) => valores[b][banda] > valores[a][banda] ? b : a);
            agregar(mayor, 'Máximo ' + 'RGB'[banda]);
        }
        const suma = i => valores[i].reduce((s, v) => s + v, 0);
        const conjunto = indices.reduce((a, b) => suma(b) > suma(a) ? b : a);
        agregar(conjunto, 'Máxima intensidad visual conjunta');
        let cambio = -1, valorCambio = -1;
        for (const i of indices) {
            if (!i || !validez[i - 1]) continue;
            const v = valores[i].reduce((s, x, b) => s + (x - valores[i - 1][b]) ** 2, 0);
            if (v > valorCambio) { valorCambio = v; cambio = i; }
        }
        if (cambio >= 0) agregar(cambio, 'Mayor cambio de firma entre píxeles consecutivos');
    }
    if (firmas.length) agregar(firmas[0].primero, 'Primera aparición de la firma más frecuente');
    for (const m of marcas) {
        if (validez[m.indice]) agregar(m.indice, 'Marca manual' + (m.nota ? ': ' + m.nota : ''));
    }

    const estadisticas = Object.fromEntries([...'RGB'].map((canal, b) =>
        [canal, resumen(indices.map(i => valores[i][b]))]));
    const histogramas = Array.from({length: 3}, (_, b) => {
        const histograma = Array(16).fill(0);
        for (const i of indices) histograma[Math.floor(valores[i][b] / 16)]++;
        return histograma;
    });
    return {
        rgb, activos, valores, firmas, total, validos: indices.length, estadisticas, histogramas,
        puntos: [...puntos].sort((a, b) => a[0] - b[0]).map(([indice, motivos]) => ({indice, motivos})),
    };
}
