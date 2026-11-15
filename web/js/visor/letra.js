const LETRAS = {
    3912: 'Entre aguas frías y claras,\nuna corriente busca el sur.\nLa sigo de costa en costa,\nmientras cambia de color.',
    40467: 'Veo la Tierra desde arriba,\nveo el agua y la ciudad.\nCada nube lleva sombra\nsobre un pedazo de mar.',
    4950: 'Desde arriba miro el bosque,\ncada copa tiene altura.\nEntre claros y ramas altas\nva cambiando la espesura.',
    4960: 'Una cinta blanca cruza\npor encima del océano.\nVa llevando agua en las nubes\nhasta la orilla del campo.',
    5011: 'Un relámpago en la noche\ndeja un destello al pasar.\nDesde arriba veo encenderse\nla tormenta sobre el mar.',
    5313: 'En la noche brillan luces,\nvan de pueblo en ciudad.\nDesde el cielo veo caminos\nque se vuelven claridad.',
    5425: 'La corriente da la vuelta,\nse hace un círculo en el mar.\nDonde el agua se arremolina\notra senda empieza a andar.',
    5533: 'Va el aire por el mapa,\nel color deja su señal.\nCruza montes y llanuras\ny se extiende sobre el mar.',
    5669: 'Pasa el polvo sobre el mar,\nva en el viento hacia otro lugar.\nBajo la luz de la mañana\nsu camino puedo mirar.',
};

const ESTRIBILLO = 'Gira la Tierra bajo el sol,\nsobre sus huellas va mi voz.';

export function letraInicial(paquete, secuencia) {
    const letra = LETRAS[paquete?.svs_id];
    if (letra && secuencia.medio.id === paquete.medio_inicial) return letra + '\n\n' + ESTRIBILLO;
    const colores = ['rojo', 'verde', 'azul'];
    const sumas = [0, 0, 0];
    const n = Math.max(1, secuencia.validos);
    for (let i = 0; i < secuencia.intensidades.length; i++) sumas[i % 3] += secuencia.intensidades[i];
    const orden = colores.map((_, i) => i).sort((a, b) => sumas[b] - sumas[a]);
    const [a, , c] = orden;
    const brillo = (sumas[0] + sumas[1] + sumas[2]) / (3 * n);
    const verso = brillo < 20 ? 'En la sombra queda un hilo,\nuna luz que puedo seguir.'
        : sumas[a] - sumas[c] < 12 * n ? 'Entre luces y entre sombras,\nveo el tono cambiar.'
        : 'Van los tonos de ' + colores[a] + ',\nde un borde a otro lugar.';
    return verso + '\n\n' + ESTRIBILLO;
}
