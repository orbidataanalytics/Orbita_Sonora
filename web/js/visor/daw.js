import {aHz, INSTRUMENTOS, mezclaInicial, archivoWav, renderizarNota, volumenPista} from './audio-pistas.js';
import {ArchivosMIDI} from './midi.js';
import {AudioVivo, CanalVivo} from './audio-vivo.js';
import {descargar} from './informe.js';

const porId = id => document.getElementById(id);
const nombres = ['Rojo', 'Verde', 'Azul'];
const colores = ['#f58f92', '#91d9a7', '#9bb8f7'];
const CLAVE_MEZCLA = 'mezcla-daw-v1';

export class EstudioDAW {
    constructor(transporte, catalogo, acciones) {
        this.transporte = transporte;
        this.catalogo = catalogo;
        this.acciones = acciones;
        this.mezcla = mezclaInicial();
        this.midi = new ArchivosMIDI();
        this.audioVivo = new AudioVivo(transporte);
        this.capturados = [];
        this.revisionMuestra = [0, 0, 0];
        this.opcionesVivo = porId('daw-entrada-vivo');
        this.opcionesVivo.addEventListener('toggle', () => {
            if (!this.opcionesVivo.open) this.detenerMIDI();
        });
        this.vivo = new CanalVivo(dato => this.recibir(dato), (texto, conectado) => this.estadoVivo(texto, conectado));
        this.dibujarPistas();
        this.enlazar();
        this.refrescar();
    }

    async restaurarGuardada() {
        const guardada = await this.catalogo.ajuste(CLAVE_MEZCLA);
        if (!guardada || this.modificada) return;
        const {bandas, ...mezcla} = guardada;
        this.mezcla = mezcla;
        this.dibujarPistas();
        this.refrescar();
        await this.acciones.cambiarMezcla(this.mezcla, true);
    }

    dibujarPistas() {
        const filas = this.mezcla.pistas.map((pista, i) => {
            const panel = document.createElement('div');
            panel.className = 'daw-pista';
            panel.style.setProperty('--color-pista', colores[i]);
            panel.innerHTML = `<h3>${'RGB'[i]} · ${nombres[i]}</h3>
                <div class="daw-instrumento">
                    <label>Instrumento <select aria-label="Instrumento ${nombres[i]}"></select></label>
                    <button type="button" class="boton daw-probar" aria-label="Probar instrumento ${nombres[i]}">Probar</button>
                </div>
                <label>Volumen <input type="range" min="0" max="1" step=".01" aria-label="Volumen ${nombres[i]}"></label>
                <label>Panorama <input type="range" min="-1" max="1" step=".02" aria-label="Panorama ${nombres[i]}"></label>
                <div class="controles"><label><input type="checkbox"> Mute</label><label><input type="checkbox"> Solo</label></div>
                <label class="daw-muestra" hidden>Cargar muestra WAV <input type="file" accept=".wav,audio/wav"><span></span></label>`;
            const selector = panel.querySelector('select');
            for (const [clave, instrumento] of Object.entries(INSTRUMENTOS)) {
                selector.add(new Option(instrumento.nombre, clave));
            }
            selector.value = pista.instrumento;
            const [volumen, panorama, mute, solo, archivo] = panel.querySelectorAll('input');
            volumen.value = pista.volumen; panorama.value = pista.panorama;
            mute.checked = pista.mute; solo.checked = pista.solo;
            const muestra = panel.querySelector('.daw-muestra span');
            muestra.textContent = pista.muestra?.nombre || '';
            panel.querySelector('.daw-probar').onclick = () => this.acciones.probarPista(i).catch(error => this.error(error));
            for (const [control, llave] of [[selector,'instrumento'], [volumen,'volumen'], [panorama,'panorama'], [mute,'mute'], [solo,'solo']]) {
                control.addEventListener('change', () => {
                    const valor = control === selector ? control.value : control.type === 'checkbox' ? control.checked : Number(control.value);
                    if (llave === 'instrumento') this.revisionMuestra[i]++;
                    this.editarPista(i, llave, valor);
                });
            }
            archivo.addEventListener('change', async () => {
                try {
                    const fuente = archivo.files[0];
                    if (!fuente) return;
                    if (fuente.size > 12 * 1024 * 1024) throw new Error('Usa una muestra WAV de hasta 12 MiB.');
                    const revision = ++this.revisionMuestra[i];
                    const contexto = this.transporte.contextoAudio(), buffer = await contexto.decodeAudioData(await fuente.arrayBuffer());
                    if (revision !== this.revisionMuestra[i]) return;
                    const datos = buffer.getChannelData(0).slice(0, buffer.sampleRate * 4);
                    muestra.textContent = fuente.name;
                    this.editarPista(i, 'muestra', {datos, tasa: buffer.sampleRate, nombre: fuente.name});
                } catch (error) { this.error(error); }
                finally { archivo.value = ''; }
            });
            return panel;
        });
        porId('daw-pistas').replaceChildren(...filas);
    }

    editarPista(indice, llave, valor) {
        const pistas = this.mezcla.pistas.map((pista, i) => {
            if (i !== indice) return pista;
            return {...pista, [llave]: valor, ...(llave === 'muestra' ? {instrumento: 'muestra'} : {})};
        });
        this.aplicar({...this.mezcla, pistas});
    }

    aplicar(mezcla) {
        const instrumentos = mezcla.pistas.some((pista, i) => pista.instrumento !== this.mezcla.pistas[i].instrumento);
        this.modificada = true;
        this.detenerPrueba();
        this.mezcla = mezcla;
        this.refrescar();
        this.acciones.cambiarMezcla(mezcla, instrumentos).catch(error => this.error(error));
        this.catalogo.ajustar(CLAVE_MEZCLA, mezcla).catch(() => {
            if (this.mezcla === mezcla) this.error(new Error('Mezcla aplicada durante esta sesión. El navegador no pudo guardar los cambios.'));
        });
    }

    estado(listo, sonando, preparando = false) {
        for (const id of ['daw-wav', 'mus-midi']) porId(id).disabled = !listo;
        const tocaArreglo = this.transporte.modo === 'arreglo' && (sonando || preparando);
        porId('daw-escuchar').disabled = !listo || tocaArreglo;
        porId('daw-escuchar').setAttribute('aria-pressed', String(tocaArreglo));
        porId('daw-pausa').disabled = !sonando && !preparando && !this.prueba;
    }

    progreso(porcentaje, modo) {
        if (modo !== 'arreglo' || this.prueba) return;
        if (porcentaje < 100) {
            porId('daw-estado').textContent = `Preparando arreglo · ${porcentaje} %`;
        } else this.refrescar();
    }

    refrescar() {
        for (const [id, llave] of [['daw-reverb','reverb'], ['daw-espacio','espacio']]) {
            porId(id).value = this.mezcla[llave];
            porId(id + '-valor').textContent = Math.round(this.mezcla[llave] * 100) + ' %';
        }
        porId('daw-filtro-y').checked = this.mezcla.filtroY;
        for (const [i, panel] of Array.from(porId('daw-pistas').children).entries()) {
            const pista = this.mezcla.pistas[i];
            panel.querySelector('select').value = pista.instrumento;
            panel.querySelector('.daw-muestra').hidden = pista.instrumento !== 'muestra';
            const volumen = volumenPista(this.mezcla, i);
            panel.classList.toggle('daw-pista-inactiva', !volumen);
        }
        const aviso = this.mezcla.pistas.some(p => p.instrumento === 'muestra' && !p.muestra);
        porId('daw-estado').textContent = aviso ? 'Carga un WAV para usar la pista de muestra en el arreglo.' : '';
    }

    detenerPrueba() {
        this.turnoPrueba = null;
        if (!this.prueba) return;
        const fuente = this.prueba;
        this.prueba = null;
        fuente.onended = null;
        fuente.stop();
        fuente.disconnect();
        this.refrescar();
        if (!this.transporte.nodo && !this.transporte.preparando) porId('daw-pausa').disabled = true;
    }

    async escucharPista(canal) {
        const pista = this.mezcla.pistas[canal];
        if (pista.instrumento === 'muestra' && !pista.muestra) throw new Error('Carga un WAV para probar ese instrumento.');
        this.detenerPrueba();
        const turno = this.turnoPrueba = Symbol();
        const contexto = this.transporte.contextoAudio();
        await contexto.resume();
        if (turno !== this.turnoPrueba) return;
        const primera = this.transporte.arreglo?.eventosAudio(canal)[0];
        const frecuencia = aHz(primera?.midi ?? (INSTRUMENTOS[pista.instrumento].grave ? 40 : 60));
        const nivel = (primera?.fuerza ?? .7) * Math.max(.5, pista.volumen);
        const fuente = this.prueba = contexto.createBufferSource();
        fuente.buffer = renderizarNota(contexto, pista, frecuencia, .75, nivel, primera?.timbre ?? pista.instrumento);
        fuente.connect(this.transporte.ganancia);
        const estado = porId('daw-estado');
        const texto = 'Probando ' + INSTRUMENTOS[pista.instrumento].nombre + ' · ' + 'RGB'[canal];
        estado.textContent = texto;
        porId('daw-pausa').disabled = false;
        fuente.onended = () => {
            fuente.disconnect();
            if (this.prueba !== fuente) return;
            this.prueba = null;
            if (estado.textContent === texto) this.refrescar();
            if (!this.transporte.nodo && !this.transporte.preparando) porId('daw-pausa').disabled = true;
        };
        fuente.start();
    }

    detenerMIDI() {
        this.audioVivo.pararArchivo();
        porId('daw-parar-midi').disabled = true;
    }

    error(error) {
        if (error.name !== 'AbortError') porId('daw-estado').textContent = error.message;
    }

    async exportarWAV(modo) {
        if (!this.transporte.secuencia) return;
        const audio = await this.transporte.sintetizar(modo);
        const nombre = modo === 'arreglo' ? 'orbita-arreglo-rgb.wav' : 'orbita-sonificacion-rgb.wav';
        descargar(archivoWav(audio, this.transporte.volumen), nombre);
    }

    exportarMIDI() {
        try {
            const arreglo = this.transporte.arreglo;
            if (!arreglo) return;
            descargar(this.midi.desdeArreglo(arreglo, this.mezcla), 'orbita-arreglo-rgb.mid');
        } catch (error) { this.acciones.informarError(error); }
    }

    recibir(dato) {
        const eventos = this.audioVivo.enVivo(dato);
        if (!eventos.length) return;
        const texto = document.createElement('div');
        texto.className = 'daw-evento';
        texto.textContent = dato.type === 'rgb' ? 'RGB · ' + dato.rgb.join(' / ')
            : 'RGB'[dato.line_id - 1] + ' · nota MIDI ' + dato.note + ' · velocidad ' + dato.velocity;
        const lista = porId('daw-eventos');
        lista.prepend(texto);
        if (lista.children.length > 20) lista.lastElementChild.remove();
        for (const e of eventos) if (this.capturados.length < 12000) this.capturados.push(e);
        porId('daw-captura').disabled = !this.capturados.length;
    }

    estadoVivo(texto, conectado) {
        porId('daw-vivo-estado').textContent = texto;
        porId('daw-conectar').textContent = conectado ? 'Desconectar' : 'Conectar';
        porId('daw-demo').disabled = !conectado;
    }

    enlazar() {
        for (const [id, propiedad] of [['daw-reverb','reverb'], ['daw-espacio','espacio'], ['daw-filtro-y','filtroY']]) {
            const control = porId(id);
            if (porId(id + '-valor')) control.oninput = () => { porId(id + '-valor').textContent = Math.round(control.value * 100) + ' %'; };
            control.onchange = () => this.aplicar({...this.mezcla, [propiedad]: control.type === 'checkbox' ? control.checked : Number(control.value)});
        }
        porId('daw-restaurar').onclick = () => {
            this.revisionMuestra = this.revisionMuestra.map(revision => revision + 1);
            this.aplicar(mezclaInicial());
            this.dibujarPistas();
            this.refrescar();
        };
        porId('daw-escuchar').onclick = () => this.acciones.reproducir();
        porId('daw-pausa').onclick = () => {
            this.detenerPrueba();
            this.refrescar();
            this.transporte.pausar();
        };
        porId('daw-wav').onclick = () => this.exportarWAV('arreglo').catch(error => this.acciones.informarError(error));
        porId('descargar-wav').onclick = () => this.exportarWAV('rgb').catch(error => this.acciones.informarError(error));
        porId('mus-midi').onclick = () => this.exportarMIDI();
        porId('daw-url').value = this.vivo.url;
        porId('daw-conectar').onclick = async () => {
            if (this.vivo.socket?.readyState === WebSocket.OPEN) {
                this.vivo.desconectar();
                return;
            }
            try {
                this.detenerPrueba();
                this.transporte.pausar();
                await this.transporte.contextoAudio().resume();
                this.audioVivo.tiempoEnvio = null;
                await this.vivo.conectar();
            } catch (error) { this.error(error); }
        };
        porId('daw-demo').onclick = () => this.vivo.ejemplo();
        porId('daw-captura').onclick = () => {
            try {
                const base = Math.min(...this.capturados.map(e => e.tiempo));
                const eventos = this.capturados.map(e => ({...e, tiempo: e.tiempo - base}));
                descargar(this.midi.crear(eventos, this.mezcla, 'Captura RGB'), 'orbita-captura.mid');
            } catch (error) { this.error(error); }
        };
        porId('daw-archivo-midi').onchange = async () => {
            const control = porId('daw-archivo-midi'), fuente = control.files[0];
            if (!fuente) return;
            try {
                if (fuente.size > 5 * 1024 * 1024) throw new Error('Usa un MIDI de hasta 5 MiB.');
                this.detenerPrueba();
                this.transporte.pausar();
                await this.transporte.contextoAudio().resume();
                const eventos = this.midi.leer(await fuente.arrayBuffer());
                await this.audioVivo.reproducirArchivo(eventos, () => {
                    porId('daw-parar-midi').disabled = true;
                    porId('daw-vivo-estado').textContent = 'Terminó el archivo MIDI.';
                });
                porId('daw-parar-midi').disabled = false;
                porId('daw-vivo-estado').textContent = `Reproduciendo ${eventos.length} notas de ${fuente.name}.`;
            } catch (error) { this.error(error); }
            finally { control.value = ''; }
        };
        porId('daw-parar-midi').onclick = () => {
            this.detenerMIDI();
            porId('daw-vivo-estado').textContent = 'Archivo MIDI detenido.';
        };
    }
}
