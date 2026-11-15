import {renderizarArreglo} from './audio-pistas.js';

self.onmessage = evento => {
    const resultado = renderizarArreglo(evento.data, avance => self.postMessage({avance}));
    self.postMessage({resultado}, resultado.canales.map(canal => canal.buffer));
};
