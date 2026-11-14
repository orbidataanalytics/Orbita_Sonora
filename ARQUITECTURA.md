# Qué archivo editar en Órbita Sonora

`main.py` expone la aplicación FastAPI. `api/aplicacion.py` conecta los servicios y las rutas. `index.html` contiene la estructura de la página. `web/js/visor/app.js` enlaza los módulos y el estado del medio seleccionado. Las clases mantienen los datos en su propia instancia. Los comandos para tareas independientes se ejecutan desde `scripts/`.

## Reproducción y partitura

| Acción del usuario | Flujo |
| --- | --- |
| Seleccionar un medio, recorrido o cuadrícula | `AplicacionVisor.crearSecuencia()` crea `SecuenciaSonora` con los RGB en orden de lectura. `ArregloMusical` agrupa ese recorrido en subdivisiones que pueden tocarse. |
| Pulsar **Tocar arreglo** o el botón verde de la rocola | `AplicacionVisor.reproducir('arreglo')` llama a `Transporte`. El worker recibe `ArregloMusical.eventosAudio()` y `renderizarArreglo()` toca esas notas con el timbre de cada pista. |
| Cambiar un instrumento en el DAW | `EstudioDAW.editarPista()` guarda la mezcla y llama a `AplicacionVisor.configurarMusica()`. Se actualiza `ArregloMusical` y se descarta su audio anterior. `Transporte` conserva el tiempo y reanuda si estaba reproduciendo. |
| Abrir la partitura o exportar | `MusicXML` lee `pistas[].compases` del arreglo. `ArchivosMIDI` toma sus mismos eventos de nota. El WAV del arreglo usa el búfer que reproduce `Transporte`. |
| Pulsar **Sonificar píxeles RGB** | `renderizarRGB()` programa frecuencia y ganancia de tres osciladores Tone.js por celda. La partitura espectral lee las mismas frecuencias. |

Las pistas R, G y B conservan su índice al cambiar de instrumento. `ArregloMusical.crearPista()` define el registro, la clave y la tablatura según el instrumento. Para un instrumento nuevo, añade su nombre y programa MIDI en `INSTRUMENTOS`, su timbre en `Voz.muestraAudio()` y, si pide una digitación específica, su afinación o registro en `arreglo.js`. `Transporte` informa el tiempo a los visores y conserva un búfer por modo hasta que cambia su configuración.

## Archivos del proyecto

| Módulo o archivo | Responsabilidad |
| --- | --- |
| `datos/fuentes-svs.json` | Lista de páginas NASA que se publican en el catálogo. |
| `datos/paquetes/*/paquete.json` | Medios, variantes, portada, fuente y georreferencia por paquete. Se puede fijar `carpeta_videos` con minúsculas, números y guiones bajos. |
| `web/js/visor/catalogo.js`, `medios.js` | Cargar paquetes, guardar preferencias locales y leer imágenes o fotogramas. |
| `web/js/visor/rocola.js`, `web/css/rocola-home.css` | Vinilo, controles del disco e imagen GOES separada. |
| `web/js/visor/reproductor-video.js`, `marcas-sig.js` | Reproducción del medio, cursor del video y exportación SIG de marcas. |
| `web/js/visor/mascara.js` | Alfa de entrada, fondo uniforme conectado al perímetro y polígono. |
| `web/js/recorridos.js` | Orden de las coordenadas. Una ruta debe devolver cada punto exactamente una vez. |
| `web/js/visor/estadistica-zonal.js` | Media espacial, centro al 70 %, zona al 30 % y los tamaños elegibles. |
| `web/js/visor/sonificacion.js`, `sintesis-rgb.js` | Secuencia por celda, mapeo de intensidad a Hz, síntesis de tres osciladores Tone.js y reloj de reproducción. |
| `web/js/visor/partitura-rgb.js` | Frecuencia e intensidad de cada banda a lo largo del recorrido. |
| `web/js/visor/arreglo.js`, `musicxml.js`, `partitura-musical.js` | Adaptación a instrumentos, ritmo, digitación, escritura MusicXML, cursor y vista imprimible. |
| `web/js/visor/audio-pistas.js`, `audio-worker.js` | Síntesis del arreglo para ensayar, mezcla espacial y codificación WAV. |
| `web/js/visor/daw.js`, `midi.js`, `audio-vivo.js` | Editor de tres pistas, importación/exportación MIDI y entrada en vivo. |
| `web/js/estadisticas.js`, `web/js/visor/paneles.js`, `informe.js` | Píxel activo, semáforo, estadísticas e informes. |
| `web/js/visor/gis.js`, `globo.js` | Punto, capa con cuatro esquinas, mapa y globo. |
| `web/js/visor/interpretaciones.js`, `videos/` | Ventana por paquete, reproducción de los MP4 y formulario de mezcla. |
| `api/visor/videos.py` | Decodificación del tramo de la descarga original y conservación del tiempo de origen. |
| `api/rutas/visor.py`, `api/visor/` | Importar páginas, validar URL públicas y decodificar medios. |
| `api/rutas/daw.py` | Validación y distribución de eventos WebSocket RGB y MIDI por sesión. |
| `api/rutas/interpretaciones.py`, `api/visor/interpretaciones.py` | Listado de MP4 y mezcla de tres pistas con FFmpeg. |
| `audio-a-imagen.html`, `web/js/app.js`, `api/servicios/` | Demostración anterior de audio a imagen y sus rutas FastAPI. |

## Cambios habituales

- **Agregar o quitar un paquete para todos**. Cambia `datos/fuentes-svs.json`, luego ejecuta `python -m scripts.actualizar_catalogo --vistas`. Para cambiar solo el nombre en un paquete ya generado, edita su manifiesto y la entrada del índice general.
- **Agregar o quitar un MP4**. Cambia los archivos en la carpeta que muestra **Interpretaciones** y ejecuta `python -m scripts.indexar_videos`. `interpretacion.mp4` también se detecta directamente.
- **Cambiar un instrumento inicial del arreglo**. Modifica `mezclaInicial()` en `audio-pistas.js` usando una clave de `INSTRUMENTOS`. Si creas un timbre, añade su definición y su síntesis en `Voz`. Los navegadores que guardaron ajustes pueden volver a los valores publicados con **Restaurar mezcla**.
- **Añadir un tamaño de zona**. Agrega un número impar positivo a `TAMANOS_ZONA`. El selector de la web se actualiza desde esa lista.
- **Reemplazar una parte de la interfaz**. Edita su marcado en `index.html` y su CSS. Si quitas un control, quita también el enlace de ese control en su módulo. Las tablas JSON y la carpeta de videos se editan directamente.
- **Agregar una ruta de FastAPI**. Crea el enrutador en `api/rutas/` y regístralo desde `api/aplicacion.py`. Edita la lógica de lectura o mezcla en su servicio.

## Comandos

```bash
python -m scripts.servir
python -m scripts.actualizar_catalogo --vistas
python -m scripts.indexar_videos
python pruebas/verificar.py
```

[Guía de la versión anterior](ARQUITECTURA_LEGADO.md)
