import {lienzo} from './medios.js';

const TEMAS_NASA = {
    3912: ['Corrientes oceánicas', 'La corriente busca el sur', 'El agua cambia de rumbo'],
    40467: ['La Tierra vista desde el espacio', 'Se asoma la Tierra al cielo', 'Las nubes cruzan el mar'],
    4950: ['Bosques y altura de la vegetación', 'Las copas rozan el cielo', 'Entre los árboles hay claros'],
    4960: ['Ríos atmosféricos', 'El viento lleva las nubes', 'Una cinta cruza el mar'],
    5011: ['Relámpagos en la noche', 'Un relámpago cruza el cielo', 'La noche se vuelve luz'],
    5313: ['Luces nocturnas de la Tierra', 'Se encienden luces lejanas', 'La ciudad brilla en la noche'],
    5425: ['Corrientes y remolinos oceánicos', 'El agua da media vuelta', 'Un remolino busca el mar'],
    5533: ['Calidad del aire y aerosoles', 'El aire cruza los montes', 'El viento deja una huella'],
    5669: ['Aerosoles sobre la Tierra', 'El viento lleva el polvo', 'Las nubes cruzan la costa'],
};

const TEMAS = {
    perro: ['Un perro', 'Un perro mira el camino', 'Se acerca un perro despacio'],
    gato: ['Un gato', 'Un gato quieto en la luz', 'Un gato mira de cerca'],
    ave: ['Un ave', 'Un ave mira hacia el cielo', 'Un ave cruza mi vista'],
    mar: ['Agua o costa', 'En la orilla cambia el agua', 'El agua vuelve a la arena'],
    monte: ['Montañas o relieve', 'La montaña guarda el día', 'Se recorta la montaña'],
    flor: ['Flores o vegetación', 'Una flor se abre a la luz', 'Las flores guardan el día'],
    guitarra: ['Una guitarra', 'Una guitarra me espera', 'La guitarra guarda el aire'],
    avion: ['Una aeronave', 'Un avión cruza mi vista', 'Sobre el cielo va un avión'],
    ciudad: ['Construcciones', 'Los muros toman la luz', 'Sobre un tejado cae el día'],
    visual: ['Color y luz de la imagen', 'Por la imagen pasa el día', 'La mirada sigue un borde'],
};

const grupos = [
    ['perro', [[151, 268]]], ['gato', [[281, 285]]], ['ave', [[7, 24], [80, 100], [127, 146]]],
    ['mar', [[973, 975], [977, 978]]], ['monte', [[970, 970], [972, 972], [979, 980]]],
    ['flor', [[984, 986]]], ['guitarra', [[402, 402], [546, 546]]], ['avion', [[404, 405], [895, 895]]],
    ['ciudad', [[497, 497], [576, 576], [621, 621], [698, 698]]],
];

function pixeles(imagen, lado, centrar = false) {
    const canvas = lienzo(lado);
    const contexto = canvas.getContext('2d', {willReadFrequently: true});
    const w = imagen.naturalWidth, h = imagen.naturalHeight, cuadrado = Math.min(w, h);
    if (centrar) contexto.drawImage(imagen, (w - cuadrado) / 2, (h - cuadrado) / 2, cuadrado, cuadrado, 0, 0, lado, lado);
    else contexto.drawImage(imagen, 0, 0, lado, lado);
    return contexto.getImageData(0, 0, lado, lado).data;
}

function componer(imagen, tema) {
    const rgba = pixeles(imagen, 24), sumas = [0, 0, 0], nombres = ['rojo', 'verde', 'azul'];
    let claros = 0, brillo = 0, cantidad = 0, huella = 0;
    for (let i = 0; i < rgba.length; i += 4) {
        if (!rgba[i + 3]) continue;
        const nivel = (.21 * rgba[i] + .72 * rgba[i + 1] + .07 * rgba[i + 2]) / 255;
        brillo += nivel;
        claros += Number(nivel > .64);
        cantidad++;
        for (let c = 0; c < 3; c++) sumas[c] += rgba[i + c];
        huella = (Math.imul(31, huella) + rgba[i] + 3 * rgba[i + 1] + 7 * rgba[i + 2]) >>> 0;
    }
    const [primero, , ultimo] = [0, 1, 2].sort((a, b) => sumas[b] - sumas[a]);
    const luz = brillo / Math.max(1, cantidad);
    const color = sumas[primero] - sumas[ultimo] > 10 * cantidad
        ? 'El ' + nombres[primero] + ' sigue su rumbo' : 'Se mezclan luz y penumbra';
    const contraste = claros / Math.max(1, cantidad) > .30 ? 'La luz se queda en el borde'
        : luz < .27 ? 'Entre las sombras respira' : 'Va cambiando con el día';
    const coro = luz < .38 ? 'Canta, que la noche escucha,\nque la luz regrese al fin.'
        : 'Canta, que el color no duerme,\nque nos lleve por aquí.';
    return {tema: tema[0], texto: [tema[1 + huella % 2], contraste, color,
        huella % 3 ? 'y mi voz lo sigue despacio.' : 'y lo sigo con mi voz.', '', coro].join('\n')};
}

function temaVisual(clases) {
    const puntuaciones = grupos.map(([tema, rangos]) =>
        [tema, clases.reduce((suma, [id, p]) => suma + (rangos.some(([a, b]) => id >= a && id <= b) ? p : 0), 0)]);
    puntuaciones.sort((a, b) => b[1] - a[1]);
    const [[tema, peso], [, segundo]] = puntuaciones;
    return peso >= .32 && peso - segundo >= .12 ? TEMAS[tema] : TEMAS.visual;
}

function clasificarEnSegundoPlano(imagen) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./modelo-worker.js', import.meta.url), {type: 'module'});
        const cerrar = () => { clearTimeout(timer); worker.terminate(); };
        const timer = setTimeout(() => { cerrar(); reject(new Error('El análisis visual tardó demasiado.')); }, 9000);
        worker.onmessage = ({data}) => {
            cerrar();
            if (data.error) reject(new Error(data.error));
            else resolve(data.clases);
        };
        worker.onerror = evento => { evento.preventDefault(); cerrar(); reject(new Error('No se pudo analizar la imagen.')); };
        const rgba = pixeles(imagen, 128, true);
        worker.postMessage(rgba, [rgba.buffer]);
    });
}

export function letraInicial(paquete, secuencia) {
    const tema = secuencia.medio.id === paquete?.medio_inicial ? TEMAS_NASA[paquete.svs_id] : null;
    return componer(secuencia.datos.imagen, tema || TEMAS.visual);
}

export async function sugerirLetra(paquete, secuencia) {
    const imagen = secuencia.datos.imagen;
    const tema = secuencia.medio.id === paquete?.medio_inicial ? TEMAS_NASA[paquete.svs_id] : null;
    if (tema) return componer(imagen, tema);
    try {
        return componer(imagen, temaVisual(await clasificarEnSegundoPlano(imagen)));
    } catch {
        return componer(imagen, TEMAS.visual);
    }
}
