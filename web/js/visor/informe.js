import {calcularInforme} from '../estadisticas.js';
import {lienzo} from './medios.js';
import {BANDAS} from './sonificacion.js';
import {CANALES, semaforo} from './paneles.js';
import {posicionGeografica} from './gis.js';
import {tonalidadNombre} from './arreglo.js';
import {PESO_PIXEL} from './estadistica-zonal.js';
import {NOMBRES_RECORRIDO} from '../recorridos.js';
import {afinacionTexto, MusicXML, pistasDePartitura} from './musicxml.js';
import {bibliotecaPartituras} from './visor-partituras.js';

function escapar(valor) {
    const caracteres = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'};
    return String(valor).replace(/[&<>"']/g, caracter => caracteres[caracter]);
}

export function descargar(contenido, nombre) {
    const url = URL.createObjectURL(contenido);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombre;
    document.body.append(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const base64 = bytes => btoa(Array.from(bytes, n => String.fromCharCode(n)).join(''));

export class Informe {
    constructor(secuencia, paquete, niveles, marcas, geo, mezcla, arreglo, letra = '', canal = '1', voz = null) {
        this.secuencia = secuencia;
        this.paquete = paquete;
        this.niveles = niveles;
        this.geo = geo;
        this.arreglo = arreglo;
        this.voz = voz;
        this.letra = letra;
        this.canal = voz && canal !== 'todos' ? 'guitarra-voz' : canal;
        this.mezcla = mezcla ? {...mezcla, pistas: mezcla.pistas.map(({muestra, ...pista}) => ({
            ...pista, archivoMuestra: muestra?.nombre || null,
        }))} : null;
        this.resultado = calcularInforme({
            pixeles: secuencia.pixeles,
            rgb_base64: base64(secuencia.intensidades),
            activos_base64: base64(secuencia.actividad),
            validez_base64: base64(secuencia.validez),
        }, niveles, marcas);
    }

    datos(incluirPartitura = true) {
        const s = this.secuencia;
        return {
            version: 6, paquete: this.paquete.titulo, medio: s.medio.titulo,
            fuente: s.medio.url || s.medio.archivo?.name || null,
            tipo: s.medio.tipo, lado: s.lado, recorrido: s.recorrido, geografia: this.geo,
            duracion_s: s.duracion_s, inicio_fuente_s: s.datos.inicio, velocidad_recorrido: s.datos.velocidad ?? 1,
            copia_original_incluida: Boolean(s.datos.copia), normalizado: Boolean(s.datos.normalizado),
            bandas: BANDAS, escala_frecuencia: s.escala, niveles: this.niveles, mascara: s.mascara,
            zona_sonora: {lado: s.tamanoZona, peso_pixel: s.tamanoZona === 1 ? 1 : PESO_PIXEL,
                peso_zona: s.tamanoZona === 1 ? 0 : Number((1 - PESO_PIXEL).toFixed(2))},
            validos: this.resultado.validos, excluidos: s.pixeles - this.resultado.validos,
            mezcla: this.mezcla, estadisticas: this.resultado.estadisticas,
            histogramas: this.resultado.histogramas, firmas: this.resultado.firmas,
            puntos: this.resultado.puntos.map(({indice, motivos}) => {
                const [x, y] = s.coordenadas[indice];
                return {indice, x, y, tiempo_s: indice * s.segundos_por_pixel, rgb: s.firma(indice), rgb_sonoro: s.firmaSonora(indice), motivos,
                    posicion: posicionGeografica(this.geo, x, y, s.lado)};
            }),
            letra: this.letra || null,
            partitura_musicxml: incluirPartitura && this.arreglo
                ? new MusicXML(this.arreglo, this.voz).exportar({canal: this.canal}) : null,
            arreglo_musical: this.arreglo ? {
                ...this.arreglo.opciones, tonalidad: tonalidadNombre(this.arreglo.opciones),
                compases: this.arreglo.compases, duracion_s: this.arreglo.duracion,
                instrumentos: this.arreglo.pistas.map(p => p.nombre), alturas_midi: this.arreglo.pistas.map(p => p.alturas),
                eventos: this.arreglo.eventosAudio(),
            } : null,
            pixeles: s.coordenadas.map(([x, y], indice) => {
                const valido = Boolean(s.validez[indice]);
                return {x, y, valido, rgb: valido ? s.firma(indice) : null, rgb_sonoro: valido ? s.firmaSonora(indice) : null,
                    tiempo_s: indice * s.segundos_por_pixel, frecuencias_hz: valido ? s.frecuencias(indice) : null};
            }),
        };
    }

    imagenes() {
        const s = this.secuencia, lado = s.lado;
        const firmas = new Map(this.resultado.firmas.map(f => [f.firma.join(','), f.veces]));
        const minimo = this.resultado.firmas.at(-1)?.veces || 0, maximo = this.resultado.firmas[0]?.veces || 0;
        return [...CANALES, 'Ocupación'].map((canal, banda) => {
            const canvas = lienzo(lado);
            const ctx = canvas.getContext('2d'), img = ctx.createImageData(lado, lado);
            for (const [indice, [x, y]] of s.coordenadas.entries()) {
                if (!s.validez[indice]) continue;
                let rgb = s.firma(indice);
                if (banda === 4) {
                    const clave = rgb.map(v => Math.floor(v * this.niveles / 256)).join(',');
                    rgb = s.actividad[indice] ? semaforo(firmas.get(clave), minimo, maximo) : [0, 0, 0];
                } else if (banda) rgb = rgb.map((v, i) => i === banda - 1 ? v : 0);
                img.data.set([...rgb, 255], 4 * (y * lado + x));
            }
            ctx.putImageData(img, 0, 0);
            const salida = lienzo(320);
            const pintura = salida.getContext('2d');
            pintura.imageSmoothingEnabled = false;
            pintura.drawImage(canvas, 0, 0, 320, 320);
            if (banda === 0) {
                pintura.font = 'bold 9px sans-serif';
                pintura.textAlign = 'center'; pintura.textBaseline = 'middle';
                this.resultado.puntos.forEach(({indice}, i) => {
                    const [x, y] = s.coordenadas[indice];
                    const px = Math.max(8, Math.min(312, (x + .5) * 320 / lado));
                    const py = Math.max(8, Math.min(312, (y + .5) * 320 / lado));
                    pintura.beginPath(); pintura.arc(px, py, 8, 0, Math.PI * 2);
                    pintura.fillStyle = '#fff'; pintura.fill(); pintura.strokeStyle = '#24372a'; pintura.stroke();
                    pintura.fillStyle = '#122117'; pintura.fillText(i + 1, px, py);
                });
            }
            return [canal, salida.toDataURL('image/png')];
        });
    }

    tabla(columnas, filas) {
        const encabezados = columnas.map(col => `<th scope="col">${escapar(col)}</th>`).join('');
        const celdas = filas.map(fila => `<tr>${fila.map(v => `<td>${escapar(v)}</td>`).join('')}</tr>`).join('');
        return `<table><thead><tr>${encabezados}</tr></thead><tbody>${celdas}</tbody></table>`;
    }

    histograma() {
        const histogramas = this.resultado.histogramas;
        const max = Math.max(1, ...histogramas.flat());
        const colores = ['#bf3346', '#297b52', '#385c9d'];
        const barras = histogramas.flatMap((valores, banda) => valores.map((n, i) => {
            const h = 105 * n / max;
            return `<rect x="${33 + i * 35 + banda * 9}" y="${120 - h}" width="8" height="${h}" fill="${colores[banda]}"/>`;
        })).join('');
        return `<svg viewBox="0 0 610 145" role="img" aria-label="Histograma RGB de 16 intervalos"><path d="M30 15V120H590" fill="none" stroke="#333"/>${barras}<text x="30" y="139" font-size="12">0</text><text x="566" y="139" font-size="12">255</text></svg>`;
    }

    html() {
        const d = this.datos(false);
        const numeros = x => x === null ? '–' : Number(x).toFixed(2);
        const estadisticas = Object.entries(d.estadisticas).map(([canal, e]) => [
            canal, e.minimo ?? '–', e.maximo ?? '–', numeros(e.media), numeros(e.mediana), numeros(e.desviacion_poblacional),
            numeros(e.p05), numeros(e.p95),
        ]);
        const puntos = d.puntos.map((p, i) => [
            i + 1, p.indice + 1, p.x + 1, p.y + 1, p.tiempo_s.toFixed(3), p.rgb.join(', '),
            p.posicion?.map(v => v.toFixed(5)).join(', ') || '–', p.motivos.join(' · '),
        ]);
        const imagenes = this.imagenes().map(([nombre, url]) =>
            `<figure><img src="${url}" alt="${nombre}"><figcaption>${nombre}</figcaption></figure>`).join('');
        const ocupacion = d.firmas.slice(0, 12).map(f => [f.firma.map(v => v + 1).join(' · '), f.veces, numeros(f.porcentaje) + '%']);
        const partes = this.arreglo ? pistasDePartitura(this.arreglo, this.canal, this.voz) : [];
        const afinaciones = partes.filter(p => p.afinacion)
            .map(p => `<p>${escapar(p.nombre)} · Cuerdas de grave a aguda ${escapar(afinacionTexto(p.afinacion))}</p>`).join('');
        return `<h1>Informe de sonificación y GIS</h1><p>Órbita Sonora · ORBIDATA ANALYTICS</p>
            <h2>${escapar(d.paquete === d.medio ? d.paquete : d.paquete + ' · ' + d.medio)}</h2>
            <p>${d.lado} × ${d.lado} · ${escapar(NOMBRES_RECORRIDO[d.recorrido])} · ${d.duracion_s.toFixed(3)} s · ${d.niveles} niveles</p>
            <p>${d.validos} muestras válidas · ${d.excluidos} excluidas por máscara.</p>
            <p>Zona sonora ${d.zona_sonora.lado} × ${d.zona_sonora.lado} · ${100 * d.zona_sonora.peso_pixel} % de la celda activa.</p>
            <p>Fuente ${escapar(d.fuente || 'Archivo local')} · inicio en fuente ${d.inicio_fuente_s.toFixed(3)} s
            · velocidad ${d.velocidad_recorrido}×</p>
            <p>${d.geografia ? escapar(d.geografia.origen + ' · ' + JSON.stringify(d.geografia.coordenadas)) : 'Medio sin georreferencia asignada'}</p>
            ${d.arreglo_musical ? `<section class="partitura-informe"><h2>Partitura musical</h2>
            <p>${escapar(d.arreglo_musical.tonalidad)} · ${escapar(d.arreglo_musical.compas)} ·
            ${d.arreglo_musical.bpm} por minuto · ${d.arreglo_musical.compases} compases</p>
            ${afinaciones}<div id="informe-partitura" aria-label="Partitura completa del arreglo"></div></section>` : ''}
            ${this.letra ? `<section class="letra-impresa"><h2>Letra para cantar</h2><p>${escapar(this.letra)}</p></section>` : ''}
            <div class="grilla-informe">${imagenes}</div>
            <h2>Estadísticas RGB de los píxeles muestreados</h2>
            ${this.tabla(['Canal','Mín.','Máx.','Media','Mediana','Desv. poblacional','P05','P95'], estadisticas)}
            ${this.histograma()}
            <h2>Ocupación de las firmas más frecuentes</h2>
            ${this.tabla(['Niveles R G B','Píxeles','Ocupación'], ocupacion)}
            <h2>Píxeles destacados</h2>
            ${this.tabla(['Marca','Píxel','Col.','Fila','Tiempo s','RGB','Lon, lat','Motivo'], puntos)}`;
    }

    async dibujarPartitura(destino) {
        const Visualizador = await bibliotecaPartituras();
        const xml = new MusicXML(this.arreglo, this.voz);
        for (let desde = 1; desde <= this.arreglo.compases; desde += 4) {
            if (!destino.isConnected) return;
            const hasta = Math.min(desde + 3, this.arreglo.compases);
            const bloque = document.createElement('div');
            bloque.className = 'bloque-partitura-informe';
            const hoja = document.createElement('div');
            hoja.style.width = `${Math.max(690, destino.clientWidth)}px`;
            bloque.append(hoja);
            destino.append(bloque);
            const visor = new Visualizador(hoja, {
                backend: 'svg', drawTitle: false, drawComposer: false, drawCredits: false, autoResize: false,
            });
            await visor.load(xml.exportar({canal: this.canal, desde, hasta, titulo: false, leyenda: false}));
            visor.zoom = .80;
            visor.render();
            const svg = hoja.querySelector('svg');
            if (!svg) throw new Error('No se pudo dibujar la partitura del informe.');
            if (!svg.hasAttribute('viewBox')) {
                svg.setAttribute('viewBox', `0 0 ${parseFloat(svg.getAttribute('width'))} ${parseFloat(svg.getAttribute('height'))}`);
            }
            bloque.replaceChildren(svg);
        }
    }

    async mostrar() {
        const destino = document.getElementById('informe-salida');
        destino.innerHTML = `<article class="informe-hoja"><div class="controles">
            <button id="informe-cerrar" type="button">Cerrar</button><button id="informe-imprimir" type="button" disabled>Imprimir / PDF</button>
            <button id="informe-html" type="button" disabled>Descargar HTML</button></div>
            <p class="estado-informe" role="status"></p><div class="contenido-informe">${this.html()}</div></article>`;
        destino.hidden = false;
        const cerrar = destino.querySelector('#informe-cerrar');
        const imprimir = destino.querySelector('#informe-imprimir');
        const exportar = destino.querySelector('#informe-html');
        const contenido = destino.querySelector('.contenido-informe');
        const estado = destino.querySelector('.estado-informe');
        cerrar.onclick = () => { destino.hidden = true; document.getElementById('informe').focus(); };
        imprimir.onclick = () => window.print();
        exportar.onclick = () => {
            const html = `<!doctype html><html lang="es"><meta charset="utf-8"><title>Informe de Órbita Sonora</title><style>
            body{font:15px system-ui;margin:25px auto;padding:0 16px;max-width:1050px;color:#182621}
            img,svg{max-width:100%}figure{margin:0}table{border-collapse:collapse;width:100%;margin:1rem 0}
            th,td{padding:5px;text-align:left;border-bottom:1px solid #cbd5cc}.grilla-informe{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
            .letra-impresa p{white-space:pre-wrap}.bloque-partitura-informe svg{width:100%;height:auto;display:block}
            @media print{figure,tr,svg,.bloque-partitura-informe{break-inside:avoid}}</style><body>${contenido.innerHTML}</body></html>`;
            descargar(new Blob([html], {type: 'text/html;charset=utf-8'}), 'orbita-informe.html');
        };
        cerrar.focus();
        try {
            if (this.arreglo) {
                estado.textContent = 'Preparando la partitura completa…';
                await this.dibujarPartitura(contenido.querySelector('#informe-partitura'));
            }
            estado.textContent = '';
            imprimir.disabled = exportar.disabled = false;
        } catch (error) {
            estado.textContent = error.message;
        }
    }
}
