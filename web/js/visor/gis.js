import {recurso} from './catalogo.js';
import {lienzo} from './medios.js';
import {GloboCanvas} from './globo.js';

const RAD = Math.PI / 180;
const LATITUD_MAX = 85.051129;
const mercator = lat => Math.asinh(Math.tan(lat * RAD));
const punto = coordenadas => ({
    type: 'FeatureCollection',
    features: coordenadas ? [{type: 'Feature', properties: {}, geometry: {type: 'Point', coordinates: coordenadas}}] : [],
});

export function leerGeografia(tipo, texto) {
    const filas = texto.trim().split(/\n+/).map(fila => fila.trim().split(/[;,\s]+/));
    const cantidad = tipo === 'punto' ? 1 : 4;
    if (filas.length !== cantidad || filas.some(fila => fila.length !== 2 || fila.some(v => !v))) {
        throw new Error(`Ingresa ${cantidad} par(es) de longitud y latitud, uno por línea.`);
    }
    const coordenadas = filas.map(fila => fila.map(Number));
    const maximo = cantidad === 1 ? 90 : LATITUD_MAX;
    if (coordenadas.some(([lon, lat]) => !Number.isFinite(lon) || !Number.isFinite(lat)
        || Math.abs(lon) > 180 || Math.abs(lat) > maximo)) {
        throw new Error(`Usa longitud entre −180° y 180° y latitud entre ±${maximo}°.`);
    }
    if (cantidad === 4) {
        const lons = coordenadas.map(p => p[0]);
        if (Math.max(...lons) - Math.min(...lons) >= 180) {
            throw new Error('Divide en dos partes las capas que cruzan el antimeridiano.');
        }
        if (!coordenadas.every(([x, y], i) => {
            const [bx, by] = coordenadas[(i + 1) % 4], [cx, cy] = coordenadas[(i + 2) % 4];
            return (bx - x) * (cy - by) - (by - y) * (cx - bx) < 0;
        })) throw new Error('Indica las esquinas en sentido horario desde la superior izquierda.');
    }
    return {tipo, coordenadas: cantidad === 1 ? coordenadas[0] : coordenadas, origen: 'Asignado en el visor'};
}

export function posicionGeografica(geo, x, y, lado) {
    if (!geo) return null;
    if (geo.tipo === 'punto') return geo.coordenadas;
    const u = (x + .5) / lado, v = (y + .5) / lado;
    const pesos = [(1 - u) * (1 - v), u * (1 - v), u * v, (1 - u) * v];
    const lon = geo.coordenadas.reduce((s, p, i) => s + pesos[i] * p[0], 0);
    const lat = geo.coordenadas.reduce((s, p, i) => s + pesos[i] * mercator(p[1]), 0);
    return [lon, Math.atan(Math.sinh(lat)) / RAD];
}

export class VisorGIS {
    constructor(contenedor, mensaje, buscar) {
        this.mensaje = mensaje;
        this.buscar = buscar;
        this.proyeccion = 'globe';
        this.opacidad = .82;
        this.capa = lienzo(2);
        this.listo = false;
        this.iniciar(contenedor);
    }

    iniciar(contenedor) {
        try {
            const estilo = {
                version: 8,
                sources: {
                    tierra: {
                        type: 'raster', tiles: [recurso('web/geo/teselas/{z}/{x}/{y}.jpg').replaceAll('%7B', '{').replaceAll('%7D', '}')],
                        tileSize: 256, maxzoom: 2, attribution: 'NASA Blue Marble · Natural Earth',
                    },
                    costas: {type: 'geojson', data: recurso('web/geo/tierra.geojson')},
                    marcas: {type: 'geojson', data: punto()},
                    cursor: {type: 'geojson', data: punto()},
                },
                layers: [
                    {id: 'fondo', type: 'background', paint: {'background-color': '#112d3c'}},
                    {id: 'costas', source: 'costas', type: 'fill', paint: {'fill-color': '#425d4b'}},
                    {id: 'tierra', source: 'tierra', type: 'raster', paint: {'raster-fade-duration': 0}},
                    {id: 'marcas', source: 'marcas', type: 'circle', paint: {
                        'circle-radius': 6, 'circle-color': '#76d9ff', 'circle-stroke-width': 2, 'circle-stroke-color': '#142018',
                    }},
                    {id: 'cursor', source: 'cursor', type: 'circle', paint: {
                        'circle-radius': 6, 'circle-color': '#f6f6bc', 'circle-stroke-width': 2, 'circle-stroke-color': '#142018',
                    }},
                ],
            };
            this.mapa = new maplibregl.Map({container: contenedor, style: estilo, center: [-72, 14],
                zoom: .75, maxZoom: 15, canvasContextAttributes: {antialias: true}});
            this.mapa.addControl(new maplibregl.NavigationControl({visualizePitch: true}), 'top-right');
            this.mapa.on('load', () => {
                this.listo = true;
                this.proyectar(this.proyeccion);
                this.reconstruir();
            });
            this.mapa.on('click', evento => {
                const marca = this.mapa.getLayer('marcas') && this.mapa.queryRenderedFeatures(evento.point, {layers: ['marcas']})[0];
                if (marca) this.buscar(marca.properties.pixel - 1, marca.properties.recorrido_s);
                else this.buscarCoordenada(evento.lngLat);
            });
        } catch {
            this.mapa = null;
            contenedor.classList.remove('maplibregl-map');
            this.alternativo = new GloboCanvas(contenedor, punto => this.buscarCoordenada(punto));
            this.mensaje.textContent = 'NASA Blue Marble · arrastra para mover y usa la rueda para acercar';
            this.listo = true;
        }
    }

    proyectar(proyeccion) {
        this.proyeccion = proyeccion;
        if (!this.listo) return;
        if (this.alternativo) {
            this.alternativo.proyectar(proyeccion);
            return;
        }
        this.mapa.resize();
        this.mapa.setProjection({type: proyeccion});
    }

    configurar(secuencia, geografia) {
        this.secuencia = secuencia;
        this.geo = geografia;
        this.reconstruir();
    }

    reconstruir() {
        if (!this.listo) return;
        if (this.alternativo) {
            this.reconstruirAlternativo();
            this.marcar(this.marcas);
            return;
        }
        if (this.mapa.getLayer('medio')) this.mapa.removeLayer('medio');
        if (this.mapa.getSource('medio')) this.mapa.removeSource('medio');
        this.mapa.getSource('cursor').setData(punto());
        this.marcar(this.marcas);
        this.ultimoFotograma = -1;
        if (this.geo?.tipo === 'esquinas' && this.secuencia) {
            this.capa.width = this.capa.height = this.secuencia.lado;
            this.pintarFotograma(this.indice || 0);
            this.mapa.addSource('medio', {type: 'canvas', canvas: this.capa, animate: false, coordinates: this.geo.coordenadas});
            this.mapa.addLayer({id: 'medio', type: 'raster', source: 'medio', paint: {
                'raster-opacity': this.opacidad, 'raster-fade-duration': 0,
            }}, 'marcas');
        }
        this.pintar(Math.min(this.indice || 0, (this.secuencia?.pixeles || 1) - 1));
        this.centrar();
    }

    marcar(coleccion = punto()) {
        this.marcas = coleccion;
        if (!this.listo) return;
        this.mapa?.getSource('marcas')?.setData(coleccion);
        if (this.alternativo) {
            this.alternativo.marcas = coleccion.features.map(f => f.geometry.coordinates);
            this.alternativo.pintar(this.alternativo.posicion);
        }
    }

    pintarFotograma(indice) {
        const fotograma = this.secuencia.fotogramaIndice(indice);
        if (fotograma === this.ultimoFotograma) return;
        const ctx = this.capa.getContext('2d');
        ctx.clearRect(0, 0, this.capa.width, this.capa.height);
        const fotogramaActual = this.secuencia.fotograma(indice);
        ctx.putImageData(new ImageData(fotogramaActual.data, fotogramaActual.width, fotogramaActual.height), 0, 0);
        const fuente = this.mapa?.getSource('medio');
        if (fuente) {
            fuente.play();
            this.mapa.once('render', () => {
                if (this.mapa.getSource('medio') === fuente) fuente.pause();
            });
        }
        this.ultimoFotograma = fotograma;
        this.alternativo?.actualizarCapa();
    }

    pintar(indice) {
        this.indice = indice;
        if (!this.listo || !this.geo || !this.secuencia) {
            this.alternativo?.pintar(null);
            return;
        }
        if (this.geo.tipo === 'esquinas') this.pintarFotograma(indice);
        const posicion = posicionGeografica(this.geo, ...this.secuencia.coordenadas[indice], this.secuencia.lado);
        if (this.alternativo) this.alternativo.pintar(posicion);
        else this.mapa.getSource('cursor').setData(punto(posicion));
    }

    reconstruirAlternativo() {
        this.ultimoFotograma = -1;
        this.capa.width = this.capa.height = this.secuencia?.lado || 2;
        this.alternativo.configurar(this.geo, this.capa);
        this.pintar(Math.min(this.indice || 0, (this.secuencia?.pixeles || 1) - 1));
        this.centrar();
    }

    cambiarOpacidad(valor) {
        this.opacidad = valor;
        if (this.alternativo) {
            this.alternativo.opacidad = valor;
            this.alternativo.actualizarFondo();
        }
        if (this.mapa?.getLayer('medio')) this.mapa.setPaintProperty('medio', 'raster-opacity', valor);
    }

    centrar() {
        if (!this.listo || !this.geo) return;
        if (this.alternativo) {
            this.alternativo.centrar(this.geo);
            return;
        }
        if (this.geo.tipo === 'punto') {
            const [lon, lat] = this.geo.coordenadas;
            this.mapa.jumpTo({center: [lon, Math.max(-LATITUD_MAX, Math.min(LATITUD_MAX, lat))], zoom: 5});
            return;
        }
        const lons = this.geo.coordenadas.map(p => p[0]), lats = this.geo.coordenadas.map(p => p[1]);
        this.mapa.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
            {padding: 35, maxZoom: 10, duration: 0});
    }

    buscarCoordenada({lng, lat}) {
        if (this.geo?.tipo !== 'esquinas' || !this.secuencia) return;
        const lon = ((lng + 180) % 360 + 360) % 360 - 180;
        const esquinas = this.geo.coordenadas;
        if (!esquinas.every(([x, y], i) => {
            const [bx, by] = esquinas[(i + 1) % 4];
            return (bx - x) * (lat - y) - (by - y) * (lon - x) <= 1e-7;
        })) return;
        let menor = Infinity, candidato = 0;
        for (const [indice, [x, y]] of this.secuencia.coordenadas.entries()) {
            const [px, py] = posicionGeografica(this.geo, x, y, this.secuencia.lado);
            const distancia = ((lon - px) * Math.cos(lat * RAD)) ** 2 + (lat - py) ** 2;
            if (distancia < menor) { menor = distancia; candidato = indice; }
        }
        this.buscar(candidato);
    }
}
