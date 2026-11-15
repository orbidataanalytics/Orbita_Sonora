const porId = id => document.getElementById(id);
const MAXIMO_BYTES = 20 * 1024 * 1024;
const MAXIMO_SEGUNDOS = 120;

export class VozGrabada {
    constructor(transporte) {
        this.transporte = transporte;
        this.panel = porId('voz-panel');
        this.archivo = porId('voz-archivo');
        this.activa = porId('voz-activa');
        this.quitar = porId('voz-quitar');
        this.estado = porId('voz-estado');
        this.revision = 0;
        this.archivo.onchange = () => this.cargar();
        this.activa.onchange = () => this.aplicar();
        this.quitar.onclick = () => this.limpiar();
    }

    async limpiar() {
        this.revision++;
        this.grabacion = null;
        this.archivo.value = '';
        this.activa.checked = false;
        this.refrescar();
        await this.aplicar();
    }

    refrescar() {
        this.activa.disabled = !this.grabacion;
        this.quitar.hidden = !this.grabacion;
        const grabacion = this.grabacion;
        this.estado.textContent = grabacion ? grabacion.nombre + ' · ' + grabacion.duracion.toFixed(1) + ' s desde el inicio'
            + (grabacion.duracion > (this.transporte.arreglo?.duracion ?? Infinity) ? ' · el arreglo usa el tramo que cabe.' : '') : '';
    }

    async cargar() {
        const archivo = this.archivo.files[0];
        this.archivo.value = '';
        if (!archivo || !this.transporte.arreglo) return;
        if (!archivo.size || archivo.size > MAXIMO_BYTES) {
            this.estado.textContent = 'Elige una grabación de audio de hasta 20 MiB.';
            return;
        }
        const revision = ++this.revision;
        this.estado.textContent = 'Abriendo la grabación…';
        try {
            const contexto = this.transporte.contextoAudio();
            const buffer = await contexto.decodeAudioData(await archivo.arrayBuffer());
            if (revision !== this.revision) return;
            if (buffer.duration > MAXIMO_SEGUNDOS) throw new Error('Usa una grabación de hasta 120 segundos.');
            this.grabacion = {nombre: archivo.name, duracion: buffer.duration, tasa: buffer.sampleRate,
                canales: Array.from({length: Math.min(2, buffer.numberOfChannels)}, (_, i) => buffer.getChannelData(i))};
            this.activa.checked = true;
            this.refrescar();
            await this.aplicar();
        } catch (error) {
            if (revision === this.revision) this.estado.textContent = error.message || 'No se pudo abrir el audio de la grabación.';
        }
    }

    async aplicar() {
        const {mezcla, arreglo} = this.transporte;
        try {
            await this.transporte.configurar(mezcla, arreglo, this.activa.checked ? this.grabacion : null);
        } catch (error) {
            if (error.name !== 'AbortError') this.estado.textContent = error.message;
        }
    }
}
