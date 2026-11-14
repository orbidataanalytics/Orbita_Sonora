import {lienzo} from './medios.js';
import {PESO_PIXEL} from './estadistica-zonal.js';
import {BANDAS} from './sonificacion.js';
import {partituraRGB, posicionHz, posicionTiempo, tiempoPartitura} from './partitura-rgb.js';

const porId = id => document.getElementById(id);
export const CANALES = ['RGB', ...'RGB'];
export const COLORES = ['#ff8992', '#82e1a9', '#9ab8ff'];

export function semaforo(veces, minimo, maximo) {
    const t = maximo === minimo ? 1 : (veces - minimo) / (maximo - minimo);
    const a = t < .5 ? [32, 184, 116] : [245, 211, 90];
    const b = t < .5 ? [245, 211, 90] : [250, 99, 114];
    return a.map((v, i) => Math.round(v + (b[i] - v) * (t < .5 ? 2 * t : 2 * t - 1)));
}

export class Paneles {
    constructor(buscar) {
        this.buscar = buscar;
        this.canales = CANALES.map(canal => porId('banda-' + canal));
        this.calor = porId('mapa-firmas');
        this.medio = porId('imagen-medio');
        this.ventana = 4;
        for (const canvas of [...this.canales, this.calor, this.medio]) {
            canvas.tabIndex = 0;
            canvas.addEventListener('click', evento => this.buscarCanvas(evento, canvas));
            canvas.addEventListener('keydown', evento => {
                if (!this.secuencia || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(evento.key)) return;
                evento.preventDefault();
                const indices = {Home: 0, End: this.secuencia.pixeles - 1,
                    ArrowLeft: this.indice - 1, ArrowUp: this.indice - 1,
                    ArrowRight: this.indice + 1, ArrowDown: this.indice + 1};
                this.buscar(indices[evento.key]);
            });
        }
        for (const canal of 'RGB') {
            porId('partitura-' + canal).addEventListener('click', evento => {
                const svg = evento.currentTarget.querySelector('svg');
                if (!svg || !this.secuencia) return;
                const rect = svg.getBoundingClientRect();
                const x = (evento.clientX - rect.left) / rect.width * 1000;
                const tiempo = tiempoPartitura(x, this.inicio, this.fin);
                if (tiempo < this.inicio || tiempo > this.fin) return;
                this.buscar(this.secuencia.indice(tiempo));
            });
        }
    }

    buscarCanvas(evento, canvas) {
        if (!this.secuencia) return;
        const rect = canvas.getBoundingClientRect(), lado = this.secuencia.lado;
        const escala = Math.min(rect.width / canvas.width, rect.height / canvas.height);
        const ancho = canvas.width * escala, alto = canvas.height * escala;
        const u = (evento.clientX - rect.left - (rect.width - ancho) / 2) / ancho;
        const v = (evento.clientY - rect.top - (rect.height - alto) / 2) / alto;
        if (u >= 0 && u < 1 && v >= 0 && v < 1) {
            this.buscar(this.secuencia.inversa[Math.floor(v * lado) * lado + Math.floor(u * lado)]);
        }
    }

    limpiar() {
        this.secuencia = null;
        const lienzos = [...this.canales, this.calor, this.medio, porId('firma'), porId('curvas-ocupacion')];
        for (const canvas of lienzos) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
        for (const canal of 'RGB') porId('partitura-' + canal).replaceChildren();
        for (const id of ['notas-activas','rgb-sonoro','resumen-ocupacion','tabla-firmas']) porId(id).replaceChildren();
    }

    cargar(secuencia) {
        this.secuencia = secuencia;
        this.bases = CANALES.map(() => lienzo(secuencia.lado));
        this.baseCalor = lienzo(secuencia.lado);
        const {ancho, alto} = secuencia.datos, factor = Math.min(1, 850 / Math.max(ancho, alto));
        this.medio.width = Math.max(1, Math.round(ancho * factor));
        this.medio.height = Math.max(1, Math.round(alto * factor));
        this.indice = 0;
        this.ultimo = -1;
        this.inicio = -1;
        this.fotograma = -1;
        this.actualizarOcupacion(8, 'completa');
        this.actualizar(0, 0, true);
    }

    actualizarOcupacion(niveles, ambito) {
        this.niveles = niveles;
        this.ambito = ambito;
        if (!this.secuencia) return;
        this.filtro = null;
        this.claves = Array.from({length: this.secuencia.pixeles}, (_, i) => this.secuencia.actividad[i]
            ? this.secuencia.firma(i).map(v => Math.floor(v * niveles / 256)).join(',') : '');
        this.contar(ambito === 'completa' ? this.secuencia.pixeles : this.indice + 1);
    }

    contar(limite) {
        this.limite = limite;
        const conteos = new Map();
        let total = 0;
        for (let i = 0; i < limite; i++) {
            const clave = this.claves[i];
            if (!clave) continue;
            if (!conteos.has(clave)) conteos.set(clave, {clave, veces: 0, primero: i});
            conteos.get(clave).veces++;
            total++;
        }
        this.conteos = conteos;
        this.ranking = [...conteos.values()].sort((a, b) => b.veces - a.veces || a.clave.localeCompare(b.clave));
        porId('resumen-ocupacion').textContent = `${this.ranking.length} grupos · ${total} píxeles con señal`;
        const botones = this.ranking.slice(0, 6).map(firma => {
            const boton = document.createElement('button');
            boton.type = 'button';
            boton.setAttribute('aria-pressed', String(this.filtro === firma.clave));
            boton.textContent = `${firma.clave.split(',').map(v => Number(v) + 1).join(' · ')} | ${firma.veces} · ${(firma.veces / total * 100).toFixed(1)} %`;
            boton.addEventListener('click', () => {
                this.filtro = this.filtro === firma.clave ? null : firma.clave;
                this.contar(this.limite);
                this.buscar(firma.primero);
            });
            return boton;
        });
        porId('tabla-firmas').replaceChildren(...botones);
        this.pintarCalor();
        this.curvas();
    }

    pintarCalor() {
        const ctx = this.baseCalor.getContext('2d'), lado = this.secuencia.lado;
        const imagen = ctx.createImageData(lado, lado);
        const min = this.ranking.at(-1)?.veces || 0, max = this.ranking[0]?.veces || 0;
        this.secuencia.coordenadas.forEach(([x, y], i) => {
            const clave = this.claves[i], firma = this.conteos.get(clave);
            let color = i >= this.limite || !this.secuencia.validez[i] ? [38, 51, 54] : firma ? semaforo(firma.veces, min, max) : [0, 0, 0];
            if (this.filtro && clave !== this.filtro) color = color.map(v => v * .2);
            imagen.data.set([...color, 255], (y * lado + x) * 4);
        });
        ctx.putImageData(imagen, 0, 0);
    }

    prepararBandas(indice) {
        const fotograma = this.secuencia.fotograma(indice);
        for (const [canal, canvas] of this.bases.entries()) {
            const ctx = canvas.getContext('2d');
            const imagen = ctx.createImageData(fotograma.width, fotograma.height);
            for (let i = 0; i < imagen.data.length; i += 4) {
                for (let c = 0; c < 3; c++) imagen.data[i + c] = canal === 0 || canal === c + 1 ? fotograma.data[i + c] : 0;
                imagen.data[i + 3] = fotograma.data[i + 3];
            }
            ctx.putImageData(imagen, 0, 0);
        }
    }

    marcador(canvas, origen, x, y, suavizar) {
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = Boolean(suavizar);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(origen, 0, 0, canvas.width, canvas.height);
        const a = canvas.width / this.secuencia.lado, b = canvas.height / this.secuencia.lado;
        if (canvas === this.medio || canvas === this.canales[0]) {
            if (['filas', 'serpentina'].includes(this.secuencia.recorrido)) {
                ctx.fillStyle = '#ffcf6829';
                ctx.fillRect(0, y * b, canvas.width, b);
            }
            this.dibujarTramo(ctx, a, b);
        }
        ctx.strokeStyle = '#111b1c'; ctx.lineWidth = 3; ctx.strokeRect(x * a, y * b, a, b);
        ctx.strokeStyle = '#f4f6c1'; ctx.lineWidth = 1.3; ctx.strokeRect(x * a, y * b, a, b);
    }

    dibujarTramo(ctx, a, b) {
        const coordenadas = this.secuencia.coordenadas;
        const cantidad = Math.min(12, this.secuencia.lado);
        ctx.beginPath();
        for (let i = Math.max(0, this.indice - cantidad); i <= this.indice; i++) {
            const [x, y] = coordenadas[i];
            const anterior = coordenadas[i - 1];
            const contiguo = anterior && Math.abs(anterior[0] - x) + Math.abs(anterior[1] - y) <= 2;
            ctx[contiguo ? 'lineTo' : 'moveTo']((x + .5) * a, (y + .5) * b);
        }
        ctx.strokeStyle = '#071218';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.strokeStyle = '#ffcf68';
        ctx.lineWidth = 1.25;
        ctx.stroke();
    }

    ejes(canvas) {
        const ctx = canvas.getContext('2d'), {width: w, height: h} = canvas;
        const xs = [52, w / 2, w - 32], base = h - 29, alto = h - 45;
        ctx.fillStyle = '#0b1518'; ctx.fillRect(0, 0, w, h);
        ctx.font = '12px sans-serif';
        for (const valor of [0, 25, 50, 75, 100]) {
            const y = base - valor / 100 * alto;
            ctx.strokeStyle = '#283b3e'; ctx.beginPath(); ctx.moveTo(43, y); ctx.lineTo(w - 12, y); ctx.stroke();
            ctx.fillStyle = '#a9b8ba'; ctx.textAlign = 'right'; ctx.fillText(valor + '%', 37, y + 4);
        }
        const etiquetas = ['R', 'G', 'B'];
        for (const [i, etiqueta] of etiquetas.entries()) {
            ctx.textAlign = 'center'; ctx.fillStyle = COLORES[i]; ctx.fillText(etiqueta, xs[i], h - 7);
        }
        return {ctx, xs, base, alto};
    }

    curva(ejes, valores, color, ancho = 2) {
        const {ctx, xs, base, alto} = ejes;
        ctx.beginPath();
        valores.forEach((v, i) => ctx[i === 0 ? 'moveTo' : 'lineTo'](xs[i], base - v * alto));
        ctx.strokeStyle = color; ctx.lineWidth = ancho; ctx.stroke();
        valores.forEach((v, i) => {
            ctx.fillStyle = color; ctx.beginPath(); ctx.arc(xs[i], base - v * alto, ancho + 1, 0, Math.PI * 2); ctx.fill();
        });
    }

    curvas() {
        const ejes = this.ejes(porId('curvas-ocupacion'));
        const min = this.ranking.at(-1)?.veces || 0, max = this.ranking[0]?.veces || 0;
        for (const firma of this.ranking.slice(0, 6).reverse()) {
            const valores = firma.clave.split(',').map(v => (Number(v) + .5) / this.niveles);
            this.curva(ejes, valores, `rgb(${semaforo(firma.veces, min, max).join(',')})`);
        }
    }

    firma(indice) {
        const rgb = this.secuencia.firma(indice);
        const sonoro = this.secuencia.firmaSonora(indice);
        const ejes = this.ejes(porId('firma'));
        const gradiente = ejes.ctx.createLinearGradient(ejes.xs[0], 0, ejes.xs[2], 0);
        COLORES.forEach((color, i) => gradiente.addColorStop(i / 2, color));
        this.curva(ejes, rgb.map(v => v / 255), gradiente, 3);
        if (!this.secuencia.validez[indice]) {
            porId('notas-activas').textContent = 'Fuera de la máscara · sin señal.';
            porId('rgb-sonoro').textContent = '';
            return;
        }
        const mezclaZonal = this.secuencia.tamanoZona > 1;
        porId('rgb-sonoro').textContent = `RGB de la celda ${rgb.join(' / ')}` + (mezclaZonal
            ? ` · RGB sonoro ${Math.round(PESO_PIXEL * 100)}/${Math.round((1 - PESO_PIXEL) * 100)} ${sonoro.join(' / ')}` : '');
        porId('notas-activas').textContent = this.secuencia.frecuencias(indice).map((hz, i) =>
            `${'RGB'[i]} ${hz ? `${hz.toFixed(1)} Hz · ${sonoro[i]}/255` : 'silencio'}`).join('  |  ');
    }

    partituras(indice, tiempo) {
        const total = this.secuencia.duracion_s;
        const inicio = Math.floor(Math.min(tiempo, Math.max(0, total - .00001)) / this.ventana) * this.ventana;
        const cambio = inicio !== this.inicio;
        this.inicio = inicio;
        this.fin = Math.min(total, inicio + this.ventana);
        const x = posicionTiempo(tiempo, inicio, this.fin);
        for (const [canal, banda] of BANDAS.entries()) {
            const panel = porId('partitura-' + banda.canal);
            if (cambio) panel.innerHTML = partituraRGB(this.secuencia, banda, canal, inicio, this.fin);
            const cursor = panel.querySelector('.score-cursor');
            cursor?.setAttribute('x1', x);
            cursor?.setAttribute('x2', x);
            const punto = panel.querySelector('.score-point'), hz = this.secuencia.frecuencia(indice, canal);
            if (punto) {
                punto.setAttribute('visibility', hz ? 'visible' : 'hidden');
                if (hz) {
                    punto.setAttribute('cx', x);
                    punto.setAttribute('cy', posicionHz(hz, banda));
                }
            }
        }
    }

    actualizar(indice, tiempo, forzar = false) {
        if (!this.secuencia) return;
        this.indice = indice;
        if (indice !== this.ultimo || forzar) {
            this.ultimo = indice;
            if (this.ambito === 'cursor' && (forzar || Math.abs(indice + 1 - this.limite) >= 8)) this.contar(indice + 1);
            const fotograma = this.secuencia.fotogramaIndice(indice);
            if (fotograma !== this.fotograma) {
                this.prepararBandas(indice);
                this.fotograma = fotograma;
            }
            const [x, y] = this.secuencia.coordenadas[indice];
            this.canales.forEach((canvas, i) => this.marcador(canvas, this.bases[i], x, y));
            this.marcador(this.calor, this.baseCalor, x, y);
            this.marcador(this.medio, this.bases[0], x, y);
            this.firma(indice);
        }
        if (porId('partitura-tecnica').open) this.partituras(indice, tiempo);
        else this.inicio = -1;
    }
}
