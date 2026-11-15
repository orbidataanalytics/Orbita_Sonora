import {INSTRUMENTOS, notaInstrumento, volumenPista} from './audio-pistas.js?v=5.8.0';
import {COMPASES} from './arreglo.js?v=5.8.0';

const acotar = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const CLAVES_MIDI = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];

function codificarMIDI(midi, quintas) {
    const bytes = midi.toArray();
    if (quintas === undefined) return bytes;
    // @tonejs/midi 2.0.28 desplaza 14 unidades el número de alteraciones de la armadura.
    const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const inicio = 14;
    const fin = inicio + 8 + vista.getUint32(inicio + 4);
    const escala = midi.header.keySignatures[0].scale === 'major' ? 0 : 1;
    for (let i = inicio + 8; i + 4 < fin; i++) {
        if (bytes[i] === 255 && bytes[i + 1] === 89 && bytes[i + 2] === 2
            && bytes[i + 3] === quintas + 14 && bytes[i + 4] === escala) {
            vista.setInt8(i + 3, quintas);
            return bytes;
        }
    }
    throw new Error('No se pudo escribir la armadura del archivo MIDI.');
}

function notaMIDI(nota, instrumento) {
    const golpe = INSTRUMENTOS[instrumento].golpe;
    if (golpe) return golpe === 'tom' ? 45 : 36;
    while (nota > 127) nota -= 12;
    return acotar(notaInstrumento(nota, instrumento), 0, 127);
}

export class ArchivosMIDI {
    biblioteca() {
        if (typeof Midi !== 'function') throw new Error('No se pudo iniciar el lector MIDI.');
        return Midi;
    }

    crear(eventos, mezcla, titulo, arreglo = null) {
        const Documento = this.biblioteca(), midi = new Documento();
        midi.name = titulo;
        midi.header.setTempo(arreglo?.negraBpm ?? 120);
        if (arreglo) {
            const compas = COMPASES[arreglo.opciones.compas];
            midi.header.timeSignatures = [{ticks: 0, timeSignature: [compas.pulsos, compas.denominador]}];
            midi.header.keySignatures = [{ticks: 0, key: CLAVES_MIDI[arreglo.fifths + 7],
                scale: arreglo.opciones.modo === 'menor' ? 'minor' : 'major'}];
            midi.header.update();
        }
        const pistas = mezcla.pistas.map((pista, i) => {
            const definicion = INSTRUMENTOS[pista.instrumento], canal = midi.addTrack();
            canal.name = 'RGB'[i] + ' · ' + (arreglo?.pistas[i].nombre ?? definicion.nombre);
            canal.channel = definicion.golpe ? 9 : i;
            canal.instrument.number = definicion.programa;
            canal.addCC({number: 10, value: (pista.panorama + 1) / 2, time: 0});
            canal.addCC({number: 91, value: mezcla.reverb, time: 0});
            return canal;
        });
        for (const evento of eventos) {
            const i = evento.canal, volumen = volumenPista(mezcla, i);
            if (!volumen || evento.nota < 0 || !evento.velocidad) continue;
            const duracion = Math.max(.003, evento.duracion);
            pistas[i].addNote({
                midi: arreglo ? evento.nota : notaMIDI(evento.nota, mezcla.pistas[i].instrumento),
                time: Math.max(0, evento.tiempo), duration: duracion,
                velocity: acotar(evento.velocidad * volumen * (evento.acento ? 1.08 : 1), 1 / 127, 1),
            });
        }
        return new Blob([codificarMIDI(midi, arreglo?.fifths)], {type: 'audio/midi'});
    }

    desdeArreglo(arreglo, mezcla) {
        const eventos = arreglo.eventosAudio().flatMap((pista, canal) => pista.map(n => ({
            canal, nota: n.midi, velocidad: n.fuerza, tiempo: n.desde, duracion: n.hasta - n.desde, acento: n.acento,
        })));
        return this.crear(eventos, mezcla, arreglo.titulo, arreglo);
    }

    leer(bytes) {
        const Documento = this.biblioteca(), midi = new Documento(bytes);
        let pista = 0;
        const eventos = midi.tracks.filter(t => t.notes.length).flatMap(track => {
            const letra = /^(R|G|B)(?:\b|\s|·)/i.exec(track.name)?.[1]?.toUpperCase();
            const canal = letra ? 'RGB'.indexOf(letra) : pista % 3;
            pista++;
            return track.notes.map(n => ({canal, nota: n.midi, velocidad: n.velocity,
                duracion: n.duration, tiempo: n.time, x: .5, y: .5}));
        });
        if (!eventos.length) throw new Error('El archivo MIDI no contiene notas.');
        if (eventos.length > 15000) throw new Error('Usa un archivo MIDI con hasta 15 000 notas.');
        return eventos.filter(e => e.tiempo <= 3600 && e.duracion > 0).sort((a, b) => a.tiempo - b.tiempo);
    }
}
