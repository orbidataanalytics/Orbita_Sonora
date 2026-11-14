import {API_BASE} from '../conexion.js';

const porId = id => document.getElementById(id);
const SATELITE = 'https://cdn.star.nesdis.noaa.gov/GOES19/ABI/SECTOR/nsa/GEOCOLOR/1800x1080.jpg';

export class Rocola {
    constructor(acciones) {
        this.vinilo = porId('vinilo');
        this.arte = porId('vinilo-arte');
        this.catalogo = porId('catalogo-dialogo');
        this.lista = porId('rocola-desplegable');
        this.vinilo.onclick = () => acciones.disco();
        porId('abrir-catalogo').onclick = () => this.abrirCatalogo();
        porId('disco-play').onclick = acciones.reproducir;
        porId('disco-pausa').onclick = acciones.pausar;
        porId('catalogo-agregar').onclick = () => {
            this.catalogo.close();
            porId('importar').showModal();
        };
        this.imagenGOES = porId('goes-imagen');
        porId('ampliar-goes').onclick = () => {
            porId('goes-grande').src = this.imagenGOES.currentSrc;
            porId('goes-dialogo').showModal();
        };
        this.actualizarGOES();
        setInterval(() => { if (!document.hidden) this.actualizarGOES(); }, 600000);
    }

    abrirCatalogo() {
        this.lista.open = true;
        if (!this.catalogo.open) this.catalogo.showModal();
    }

    montar(titulo, subtitulo, portada) {
        porId('disco-titulo').textContent = titulo;
        porId('disco-subtitulo').textContent = subtitulo;
        this.arte.style.backgroundImage = portada ? 'url(' + JSON.stringify(portada) + ')' : '';
        this.vinilo.classList.remove('cargando');
        requestAnimationFrame(() => this.vinilo.classList.add('cargando'));
    }

    estado(listo, sonando, preparando = false) {
        this.vinilo.classList.toggle('sonando', sonando);
        if (sonando) this.vinilo.classList.remove('cargando');
        porId('disco-play').disabled = !listo || sonando || preparando;
        porId('disco-pausa').disabled = !sonando && !preparando;
    }

    async actualizarGOES() {
        let url = SATELITE;
        try {
            const respuesta = await fetch(API_BASE + '/api/goes', {signal: AbortSignal.timeout(3500)});
            if (respuesta.ok) {
                const datos = await respuesta.json();
                const recibida = new URL(datos.image_url);
                if (recibida.origin === 'https://cdn.star.nesdis.noaa.gov'
                    && recibida.pathname.startsWith('/GOES19/ABI/SECTOR/nsa/GEOCOLOR/')) url = recibida.href;
            }
        } catch { /* La fuente NOAA directa sigue disponible. */ }
        const candidata = new Image();
        candidata.onload = () => {
            this.imagenGOES.src = candidata.src;
            if (porId('goes-dialogo').open) porId('goes-grande').src = candidata.src;
            porId('goes-estado').textContent = 'GOES-19 · NOAA / NESDIS';
        };
        candidata.onerror = () => {
            porId('goes-estado').textContent = 'Captura de respaldo · NOAA / NESDIS';
        };
        const actual = new URL(url);
        actual.searchParams.set('t', Math.floor(Date.now() / 600000));
        candidata.src = actual.href;
    }
}
