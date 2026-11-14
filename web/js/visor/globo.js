import {recurso} from './catalogo.js';
import {lienzo} from './medios.js';

const RAD = Math.PI / 180;
const acotar = (v, min, max) => Math.max(min, Math.min(max, v));
const envolver = lon => ((lon + 180) % 360 + 360) % 360 - 180;
const mercator = lat => Math.asinh(Math.tan(acotar(lat, -89.999, 89.999) * RAD));

export class GloboCanvas {
    constructor(contenedor, buscar) {
        this.contenedor = contenedor;
        this.buscar = buscar;
        this.canvas = lienzo(560, 355);
        this.canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;cursor:grab';
        contenedor.replaceChildren(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        this.centro = [-72, 14];
        this.modo = 'globe';
        this.escala = 1;
        this.opacidad = .82;
        const textura = new Image();
        textura.onload = () => {
            const base = lienzo(textura.width, textura.height);
            const ctx = base.getContext('2d');
            ctx.drawImage(textura, 0, 0);
            this.textura = ctx.getImageData(0, 0, base.width, base.height);
            this.preparar();
        };
        textura.src = recurso('web/geo/tierra.jpg');
        this.eventos();
        new ResizeObserver(() => this.dimensionar()).observe(contenedor);
    }

    eventos() {
        this.canvas.onpointerdown = e => {
            this.inicio = {x: e.clientX, y: e.clientY, centro: this.centro};
            this.canvas.setPointerCapture(e.pointerId);
        };
        this.canvas.onpointermove = e => {
            if (!this.inicio) return;
            const dx = e.clientX - this.inicio.x, dy = e.clientY - this.inicio.y;
            if (Math.hypot(dx, dy) < 3) return;
            this.centro = [envolver(this.inicio.centro[0] - dx * .36 / this.escala),
                acotar(this.inicio.centro[1] + dy * .36 / this.escala, -85, 85)];
            this.preparar();
        };
        this.canvas.onpointerup = e => {
            const inicio = this.inicio;
            this.inicio = null;
            if (!inicio || Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) >= 4) return;
            const rect = this.canvas.getBoundingClientRect();
            const geo = this.geoDePantalla((e.clientX - rect.left) * this.canvas.width / rect.width,
                (e.clientY - rect.top) * this.canvas.height / rect.height);
            if (geo) this.buscar({lng: geo[0], lat: geo[1]});
        };
        this.canvas.onpointercancel = () => { this.inicio = null; };
        this.canvas.addEventListener('wheel', e => {
            e.preventDefault();
            this.escala = acotar(this.escala * Math.exp(-e.deltaY * .0015), .55, 24);
            this.preparar();
        }, {passive: false});
    }

    dimensionar() {
        const {width, height} = this.contenedor.getBoundingClientRect();
        if (!width || !height) return;
        const factor = Math.min(1, 570 / Math.max(width, height));
        const w = Math.max(1, Math.round(width * factor)), h = Math.max(1, Math.round(height * factor));
        if (w === this.canvas.width && h === this.canvas.height) return;
        this.canvas.width = w;
        this.canvas.height = h;
        this.preparar();
    }

    proyectar(modo) {
        this.modo = modo;
        this.dimensionar();
        this.preparar();
    }

    centrar(geo) {
        if (!geo) return;
        if (geo.tipo === 'punto') {
            this.centro = geo.coordenadas;
            this.escala = 1.5;
        } else {
            const lons = geo.coordenadas.map(p => p[0]), lats = geo.coordenadas.map(p => p[1]);
            this.centro = [(Math.min(...lons) + Math.max(...lons)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2];
            const delta = Math.max(Math.max(...lons) - Math.min(...lons), Math.max(...lats) - Math.min(...lats));
            this.escala = acotar((this.modo === 'globe' ? 70 : 185) / delta, 1, 18);
        }
        this.preparar();
    }

    configurar(geo, capa) {
        this.geo = geo;
        this.capa = capa;
        this.capaRGB = null;
        this.preparar();
    }

    radio() {
        return Math.min(this.canvas.width, this.canvas.height) * .44 * this.escala;
    }

    geoDePantalla(x, y) {
        const {width, height} = this.canvas;
        if (this.modo !== 'globe') {
            const grados = 360 / (width * this.escala);
            const lat = this.centro[1] + (height / 2 - y) * grados;
            return Math.abs(lat) <= 90 ? [envolver(this.centro[0] + (x - width / 2) * grados), lat] : null;
        }
        const radio = this.radio(), u = (x - width / 2) / radio, v = (height / 2 - y) / radio;
        const r = u * u + v * v;
        if (r > 1) return null;
        const w = Math.sqrt(1 - r), sin = this.seno, cos = this.coseno;
        return [envolver(this.centro[0] + Math.atan2(u, w * cos - v * sin) / RAD),
            Math.asin(acotar(v * cos + w * sin, -1, 1)) / RAD, w];
    }

    pantallaDeGeo([lon, lat]) {
        const {width, height} = this.canvas;
        const diferencia = envolver(lon - this.centro[0]);
        if (this.modo !== 'globe') {
            const factor = width * this.escala / 360;
            return [width / 2 + diferencia * factor, height / 2 - (lat - this.centro[1]) * factor];
        }
        const dl = diferencia * RAD, la = lat * RAD;
        const w = this.seno * Math.sin(la) + this.coseno * Math.cos(la) * Math.cos(dl);
        if (w < 0) return null;
        const u = Math.cos(la) * Math.sin(dl), v = this.coseno * Math.sin(la) - this.seno * Math.cos(la) * Math.cos(dl);
        return [width / 2 + u * this.radio(), height / 2 - v * this.radio()];
    }

    uv(lon, lat, esquinas) {
        const [a, b, c, d] = esquinas, y = mercator(lat);
        for (const [p, q, uvs] of [
            [b, c, [[0, 0], [1, 0], [1, 1]]], [c, d, [[0, 0], [1, 1], [0, 1]]],
        ]) {
            const bx = p[0] - a[0], by = p[1] - a[1], cx = q[0] - a[0], cy = q[1] - a[1];
            const x = lon - a[0], vy = y - a[1], det = bx * cy - by * cx;
            const v = (x * cy - vy * cx) / det, w = (bx * vy - by * x) / det;
            if (v >= -1e-7 && w >= -1e-7 && v + w <= 1.0000001) {
                return [v * uvs[1][0] + w * uvs[2][0], v * uvs[1][1] + w * uvs[2][1]];
            }
        }
        return null;
    }

    preparar() {
        if (!this.textura) return;
        this.seno = Math.sin(this.centro[1] * RAD);
        this.coseno = Math.cos(this.centro[1] * RAD);
        const {width, height} = this.canvas;
        const textura = this.textura;
        this.fondo = this.ctx.createImageData(width, height);
        this.lugares = [];
        const capa = this.geo?.tipo === 'esquinas' && this.capa;
        const esquinas = capa && this.geo.coordenadas.map(([lon, lat]) => [lon, mercator(lat)]);
        const longitudes = capa && this.geo.coordenadas.map(p => p[0]), latitudes = capa && this.geo.coordenadas.map(p => p[1]);
        const limites = capa && [Math.min(...longitudes), Math.max(...longitudes), Math.min(...latitudes), Math.max(...latitudes)];
        for (let y = 0, i = 0; y < height; y++) for (let x = 0; x < width; x++, i += 4) {
            const geo = this.geoDePantalla(x, y);
            this.fondo.data[i + 3] = 255;
            if (!geo) {
                this.fondo.data[i] = 9; this.fondo.data[i + 1] = 21; this.fondo.data[i + 2] = 27;
                continue;
            }
            const [lon, lat, luz = 1] = geo;
            const tx = acotar(Math.floor((lon + 180) / 360 * textura.width), 0, textura.width - 1);
            const ty = acotar(Math.floor((90 - lat) / 180 * textura.height), 0, textura.height - 1);
            const j = 4 * (ty * textura.width + tx), brillo = .63 + .37 * luz;
            for (let canal = 0; canal < 3; canal++) this.fondo.data[i + canal] = textura.data[j + canal] * brillo;
            if (!limites || lon < limites[0] || lon > limites[1] || lat < limites[2] || lat > limites[3]) continue;
            const uv = this.uv(lon, lat, esquinas);
            if (!uv) continue;
            const px = acotar(Math.floor(uv[0] * capa.width), 0, capa.width - 1);
            const py = acotar(Math.floor(uv[1] * capa.height), 0, capa.height - 1);
            this.lugares.push(i, 4 * (py * capa.width + px));
        }
        this.actualizarFondo();
    }

    actualizarFondo() {
        if (!this.fondo) return;
        this.salida = new ImageData(new Uint8ClampedArray(this.fondo.data), this.fondo.width, this.fondo.height);
        if (this.lugares.length && this.capaRGB) {
            for (let k = 0; k < this.lugares.length; k += 2) {
                const [i, j] = [this.lugares[k], this.lugares[k + 1]];
                const a = this.opacidad * this.capaRGB[j + 3] / 255;
                for (let b = 0; b < 3; b++) this.salida.data[i + b] = this.fondo.data[i + b] * (1 - a) + this.capaRGB[j + b] * a;
            }
        }
        this.pintar(this.posicion);
    }

    actualizarCapa() {
        if (!this.capa) return;
        this.capaRGB = this.capa.getContext('2d').getImageData(0, 0, this.capa.width, this.capa.height).data;
        this.actualizarFondo();
    }

    pintar(posicion) {
        this.posicion = posicion;
        if (!this.salida) return;
        this.ctx.putImageData(this.salida, 0, 0);
        for (const marca of this.marcas || []) {
            const p = this.pantallaDeGeo(marca);
            if (!p) continue;
            this.ctx.beginPath();
            this.ctx.arc(...p, 5, 0, Math.PI * 2);
            this.ctx.fillStyle = '#76d9ff'; this.ctx.fill();
            this.ctx.strokeStyle = '#162729'; this.ctx.lineWidth = 2; this.ctx.stroke();
        }
        const punto = posicion && this.pantallaDeGeo(posicion);
        if (!punto) return;
        this.ctx.beginPath();
        this.ctx.arc(...punto, 5.5, 0, Math.PI * 2);
        this.ctx.fillStyle = '#f6f6bc'; this.ctx.fill();
        this.ctx.strokeStyle = '#162729'; this.ctx.lineWidth = 2; this.ctx.stroke();
    }
}
