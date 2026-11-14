const COLORES = ['#ff8992', '#82e1a9', '#9ab8ff'];
const INICIO_X = 88, ANCHO = 888, BASE = 116, ALTO = 78;

export const posicionTiempo = (t, desde, hasta) => INICIO_X + (t - desde) / (hasta - desde) * ANCHO;
export const tiempoPartitura = (x, desde, hasta) => desde + (x - INICIO_X) / ANCHO * (hasta - desde);
export const posicionHz = (hz, banda) => BASE - ALTO * Math.log(hz / banda.min_hz) / Math.log(banda.max_hz / banda.min_hz);

export function partituraRGB(secuencia, banda, canal, desde, hasta, impresa = false) {
    const color = impresa ? ['#b02c46', '#237744', '#285db0'][canal] : COLORES[canal];
    const fondo = impresa ? '#fff' : '#0a1625';
    const texto = impresa ? '#333' : '#c1cfdf';
    const rejilla = impresa ? '#d3d9df' : '#273a50';
    const f = n => n.toLocaleString('es-CO', {maximumFractionDigits: 0});
    const partes = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 155" class="score-svg" role="img"
        aria-label="Canal ${banda.canal} de ${desde.toFixed(2)} a ${hasta.toFixed(2)} segundos">
        <rect width="1000" height="155" rx="8" fill="${fondo}"/>
        <text x="17" y="21" fill="${color}" font-size="15" font-weight="bold">${banda.canal} · ${f(banda.min_hz)}–${f(banda.max_hz)} Hz</text>`];
    for (let i = 0; i <= 2; i++) {
        const y = BASE - i * ALTO / 2, hz = banda.min_hz * (banda.max_hz / banda.min_hz) ** (i / 2);
        partes.push(`<line x1="88" x2="976" y1="${y}" y2="${y}" stroke="${rejilla}"/>
            <text x="78" y="${y + 4}" text-anchor="end" fill="${texto}" font-size="12">${f(hz)}</text>`);
    }
    for (let i = 0; i <= 4; i++) {
        const x = INICIO_X + ANCHO * i / 4, t = desde + (hasta - desde) * i / 4;
        partes.push(`<line x1="${x}" x2="${x}" y1="38" y2="116" stroke="${rejilla}" stroke-dasharray="2 4"/>
            <text x="${x}" y="139" text-anchor="middle" fill="${texto}" font-size="12">${t.toFixed(2)} s</text>`);
    }
    const dt = secuencia.segundos_por_pixel;
    const trazos = [[], [], [], [], []];
    for (let i = Math.floor(desde / dt); i < Math.min(secuencia.pixeles, Math.ceil(hasta / dt)); i++) {
        const hz = secuencia.frecuencia(i, canal);
        if (!hz) continue;
        const x = posicionTiempo(Math.max(desde, i * dt), desde, hasta);
        const fin = posicionTiempo(Math.min(hasta, (i + 1) * dt), desde, hasta);
        const y = posicionHz(hz, banda);
        const tono = Math.min(4, Math.floor(secuencia.intensidadesSonoras[i * 3 + canal] * 5 / 256));
        trazos[tono].push(`M${x.toFixed(2)} ${y.toFixed(2)}H${fin.toFixed(2)}`);
    }
    for (const [i, trazo] of trazos.entries()) {
        if (trazo.length) partes.push(`<path d="${trazo.join('')}" fill="none" stroke="${color}" stroke-width="${1.2 + i * .34}" opacity="${.42 + i * .135}"/>`);
    }
    if (!impresa) partes.push(`<line class="score-cursor" x1="88" x2="88" y1="33" y2="124" stroke="#ffcf68" stroke-width="1.5"/>
        <circle class="score-point" cx="88" cy="116" r="4" fill="#ffcf68" stroke="#111b1c" stroke-width="1.4"/>`);
    return partes.join('') + '</svg>';
}
