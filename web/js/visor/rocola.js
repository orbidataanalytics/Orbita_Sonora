const porId = id => document.getElementById(id);
const SATELITE = 'https://cdn.star.nesdis.noaa.gov/GOES19/ABI/SECTOR/nsa/GEOCOLOR/1800x1080.jpg';

export class Rocola {
    constructor(acciones) {
        this.vinilo = porId('vinilo');
        this.arte = porId('vinilo-arte');
        this.vinilo.onclick = () => acciones.disco();
        porId('disco-play').onclick = acciones.reproducir;
        porId('disco-pausa').onclick = acciones.pausar;
        this.imagenGOES = porId('goes-imagen');
        this.actualizarGOES();
        setInterval(() => { if (!document.hidden) this.actualizarGOES(); }, 600000);
    }

    abrirCatalogo() {
        porId('catalogo').scrollIntoView({block: 'start'});
    }

    montar(titulo, subtitulo, portada) {
        porId('disco-titulo').textContent = titulo;
        porId('disco-titulo').title = titulo;
        this.mensaje(subtitulo);
        this.arte.style.backgroundImage = portada ? 'url(' + JSON.stringify(portada) + ')' : '';
    }

    mensaje(texto) {
        const salida = porId('disco-subtitulo');
        salida.textContent = salida.title = texto;
    }

    estado(listo, sonando, preparando = false) {
        this.vinilo.classList.toggle('sonando', sonando);
        porId('disco-play').disabled = !listo || sonando || preparando;
        porId('disco-pausa').disabled = !sonando && !preparando;
    }

    actualizarGOES() {
        const candidata = new Image();
        candidata.onload = () => {
            this.imagenGOES.src = candidata.src;
            porId('goes-mini-imagen').src = candidata.src;
            porId('goes-estado').textContent = 'GOES-19 · NOAA / NESDIS';
        };
        candidata.onerror = () => {
            porId('goes-estado').textContent = 'Captura de respaldo · NOAA / NESDIS';
        };
        const actual = new URL(SATELITE);
        actual.searchParams.set('t', Math.floor(Date.now() / 600000));
        candidata.src = actual.href;
    }
}
