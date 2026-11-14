import {lienzo} from './medios.js';

function distancia(datos, i, color) {
    return Math.hypot(datos[i] - color[0], datos[i + 1] - color[1], datos[i + 2] - color[2]);
}

function puntoDentro(x, y, puntos) {
    let dentro = false;
    for (let i = 0, j = puntos.length - 1; i < puntos.length; j = i++) {
        const [ax, ay] = puntos[i], [bx, by] = puntos[j];
        if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) dentro = !dentro;
    }
    return dentro;
}

function dominio(lado, poligono) {
    return Uint8Array.from({length: lado * lado}, (_, i) => poligono?.length >= 3
        ? Number(puntoDentro((i % lado + .5) / lado, (Math.floor(i / lado) + .5) / lado, poligono)) : 1);
}

export class MascaraMedio {
    constructor(lado, modo, tolerancia, poligono) {
        this.lado = lado;
        this.modo = modo;
        this.tolerancia = tolerancia;
        this.poligono = poligono;
        this.dominio = dominio(lado, poligono);
        this.fondosRetirados = 0;
        this.fotogramas = 0;
    }

    fondo(datos) {
        const muestras = [];
        const {lado} = this;
        for (let p = 0; p < lado * lado; p++) {
            const x = p % lado, y = Math.floor(p / lado), i = p * 4;
            if (x !== 0 && y !== 0 && x !== lado - 1 && y !== lado - 1 || datos[i + 3] < 128) continue;
            muestras.push([datos[i], datos[i + 1], datos[i + 2]]);
        }
        if (muestras.length < lado) return null;
        const grupos = new Map();
        for (const color of muestras) {
            const clave = color.map(v => Math.floor(v / 24)).join(',');
            if (!grupos.has(clave)) grupos.set(clave, []);
            grupos.get(clave).push(color);
        }
        const gruposOrdenados = [...grupos.values()].sort((a, b) => b.length - a.length).slice(0, 5);
        const candidatos = gruposOrdenados.map(grupo => {
            const color = [0, 1, 2].map(c => grupo.reduce((s, muestra) => s + muestra[c], 0) / grupo.length);
            const saturacion = Math.max(...color) - Math.min(...color);
            const umbral = saturacion > 35 ? this.tolerancia * .55 : this.tolerancia;
            const votos = muestras.filter(m => distancia(m, 0, color) <= umbral).length;
            return {color, votos, umbral, fraccion: saturacion > 35 ? .62 : .52};
        });
        return candidatos.filter(c => c.votos >= muestras.length * c.fraccion).sort((a, b) => b.votos - a.votos)[0] || null;
    }

    conectarFondo(datos, {color, umbral}) {
        const {lado} = this, n = lado * lado, vistos = new Uint8Array(n), cola = new Uint32Array(n);
        let lectura = 0, escritura = 0;
        const incluir = p => {
            if (vistos[p]) return;
            vistos[p] = 1;
            const i = p * 4;
            if (!datos[i + 3] || distancia(datos, i, color) <= umbral * 1.35) cola[escritura++] = p;
        };
        for (let i = 0; i < lado; i++) {
            incluir(i); incluir((lado - 1) * lado + i);
            incluir(i * lado); incluir(i * lado + lado - 1);
        }
        while (lectura < escritura) {
            const p = cola[lectura++], x = p % lado, y = Math.floor(p / lado);
            datos[p * 4 + 3] = 0;
            if (x) incluir(p - 1);
            if (x + 1 < lado) incluir(p + 1);
            if (y) incluir(p - lado);
            if (y + 1 < lado) incluir(p + lado);
        }
    }

    aplicar(fotograma) {
        const salida = new Uint8ClampedArray(fotograma.data);
        this.fotogramas++;
        if (this.modo === 'auto') {
            const candidato = this.fondo(salida);
            if (candidato) {
                const original = salida.slice();
                this.conectarFondo(salida, candidato);
                let opacos = 0, restante = 0;
                for (let i = 3; i < salida.length; i += 4) {
                    opacos += Number(original[i] > 0);
                    restante += Number(salida[i] > 0);
                }
                if (!restante && opacos) salida.set(original);
                else this.fondosRetirados += Number(restante < opacos);
            }
        }
        for (let p = 0; p < this.dominio.length; p++) if (!this.dominio[p]) salida[p * 4 + 3] = 0;
        return {data: salida, width: fotograma.width, height: fotograma.height};
    }
}

export class SeleccionArea {
    constructor(dialogo, guardar) {
        this.dialogo = dialogo;
        this.lienzo = document.getElementById('mascara-lienzo');
        this.salida = document.getElementById('mascara-puntos');
        this.aplicar = document.getElementById('mascara-aplicar');
        this.puntos = [];
        this.lienzo.tabIndex = 0;
        this.lienzo.addEventListener('click', evento => {
            const rect = this.lienzo.getBoundingClientRect();
            const factor = Math.min(rect.width / this.lienzo.width, rect.height / this.lienzo.height);
            const ancho = this.lienzo.width * factor, alto = this.lienzo.height * factor;
            const x = (evento.clientX - rect.left - (rect.width - ancho) / 2) / ancho;
            const y = (evento.clientY - rect.top - (rect.height - alto) / 2) / alto;
            if (x < 0 || y < 0 || x > 1 || y > 1 || this.puntos.length >= 60) return;
            this.puntos.push([x, y]);
            this.dibujar();
        });
        document.getElementById('mascara-deshacer').onclick = () => { this.puntos.pop(); this.dibujar(); };
        document.getElementById('mascara-limpiar').onclick = () => { this.puntos = []; this.dibujar(); };
        this.aplicar.onclick = () => {
            guardar(this.puntos);
            this.dialogo.close();
        };
    }

    abrir(datos, poligono, indice = 0) {
        this.puntos = poligono ? poligono.map(p => [...p]) : [];
        this.imagen = datos.imagen;
        if (!this.imagen) {
            const fotograma = datos.fotogramas[Math.min(indice, datos.fotogramas.length - 1)];
            this.imagen = lienzo(fotograma.width, fotograma.height);
            const ctx = this.imagen.getContext('2d');
            ctx.putImageData(new ImageData(fotograma.data, fotograma.width, fotograma.height), 0, 0);
        }
        const factor = Math.min(760 / datos.ancho, 460 / datos.alto);
        this.lienzo.width = Math.max(1, Math.round(datos.ancho * factor));
        this.lienzo.height = Math.max(1, Math.round(datos.alto * factor));
        this.dibujar();
        this.dialogo.showModal();
    }

    dibujar() {
        const ctx = this.lienzo.getContext('2d'), {width, height} = this.lienzo;
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(this.imagen, 0, 0, width, height);
        if (this.puntos.length) {
            ctx.beginPath();
            this.puntos.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x * width, y * height));
            if (this.puntos.length >= 3) { ctx.closePath(); ctx.fillStyle = '#cdf98c35'; ctx.fill(); }
            ctx.lineWidth = 2; ctx.strokeStyle = '#e1fca3'; ctx.stroke();
            for (const [x, y] of this.puntos) {
                ctx.beginPath(); ctx.arc(x * width, y * height, 4, 0, 2 * Math.PI);
                ctx.fillStyle = '#e1fca3'; ctx.fill();
            }
        }
        this.salida.textContent = `${this.puntos.length} puntos`;
        this.aplicar.disabled = this.puntos.length < 3;
    }
}
