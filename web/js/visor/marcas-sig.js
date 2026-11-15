import {posicionGeografica} from './gis.js?v=5.8.0';

export function coleccionMarcas(secuencia, geo, marcas) {
    return {
        type: 'FeatureCollection',
        features: geo ? marcas.flatMap(marca => {
            const punto = secuencia?.coordenadas[marca.indice];
            if (!punto) return [];
            const tiempo = marca.tiempo ?? (marca.indice + .5) * secuencia.segundos_por_pixel;
            return [{
                type: 'Feature',
                id: marca.indice,
                geometry: {type: 'Point', coordinates: posicionGeografica(geo, ...punto, secuencia.lado)},
                properties: {
                    medio: secuencia.medio.titulo, tipo: secuencia.medio.tipo, referencia: geo.tipo,
                    recorrido: secuencia.recorrido, pixel: marca.indice + 1, columna: punto[0] + 1, fila: punto[1] + 1,
                    recorrido_s: tiempo, video_s: secuencia.segundoFuente(tiempo),
                    nota: marca.nota || '',
                },
            }];
        }) : [],
    };
}
