# Qué archivo editar en Órbita Sonora

`main.py` expone la aplicación FastAPI. `api/aplicacion.py` conecta los servicios y las rutas. `index.html` contiene la estructura de la página. `web/js/visor/app.js` enlaza los módulos y el estado del medio seleccionado. Las clases mantienen los datos en su propia instancia. Los comandos para tareas independientes se ejecutan desde `scripts/`.

## Reproducción y partitura

| Acción del usuario | Flujo |
| --- | --- |
| Seleccionar una imagen, recorrido o cuadrícula | `SecuenciaSonora` ordena los RGB y sus contrastes. `ArregloMusical.crearArmonia()` elige tríadas según el brillo relativo de cada zona y el balance de color. `figuras()` subdivide el pulso de guitarra cuando el contraste aumenta. |
| Pulsar **Tocar arreglo** o el botón verde de la rocola | `Transporte` precarga los bancos MP3 y usa Web Audio del navegador. Cada nota selecciona un recorte dentro del banco. Tone.js calcula su intervalo de afinación. El motor mezcla las pistas con sus envolventes RGB y sincroniza el cursor con el audio. |
| Cambiar un instrumento en el DAW | `EstudioDAW.editarPista()` guarda la mezcla y llama a `AplicacionVisor.configurarMusica()`. Se actualiza `ArregloMusical` y se descarta su audio anterior. `Transporte` conserva el tiempo y reanuda si estaba reproduciendo. |
| Abrir la partitura o exportar | `MusicXML` lee `pistas[].compases` del arreglo. `ArchivosMIDI` toma sus mismos eventos de nota. El WAV del arreglo usa el búfer que reproduce `Transporte`. |
| Activar **Voz y letra para cantar** | `ArregloMusical.vozCantante()` genera el pentagrama vocal a partir del brillo general y la armonía zonal. La toma real se carga de forma independiente. |

Las pistas R, G y B conservan su índice al cambiar de instrumento. `ArregloMusical.crearPista()` define el registro, la clave y la tablatura. Para guitarra, alterna las cuerdas graves y agudas y aplica el rango de intensidad de la imagen a la melodía. `Transporte` informa el tiempo a los visores y conserva un búfer por modo hasta que cambia su configuración.

## Archivos del proyecto

| Módulo o archivo | Responsabilidad |
| --- | --- |
| `datos/fuentes-svs.json` | Lista de páginas NASA que se publican en el catálogo. |
| `datos/paquetes/*/paquete.json` | Medios, variantes, portada, fuente y georreferencia por paquete. Se puede fijar `carpeta_videos` con minúsculas, números y guiones bajos. |
| `web/js/visor/catalogo.js`, `medios.js` | Cargar paquetes, guardar preferencias locales y leer imágenes o fotogramas. |
| `web/js/visor/rocola.js`, `web/css/rocola-home.css` | Vinilo, controles del disco e imagen GOES separada. |
| `web/js/visor/interpretaciones.js`, `videos/` | Pantalla del MP4 publicado o local. Miniatura GOES mientras se reproduce. |
| `web/js/visor/voz-grabada.js`, `letra.js`, `modelo-imagen.js` | Toma vocal opcional, inferencia visual local y composición de la letra. |
| `web/js/visor/marcas-sig.js` | Exportación SIG de las celdas marcadas. |
| `web/js/visor/mascara.js` | Alfa de entrada, fondo uniforme conectado al perímetro y polígono. |
| `web/js/recorridos.js` | Orden de las coordenadas. Una ruta debe devolver cada punto exactamente una vez. |
| `web/js/visor/estadistica-zonal.js` | Media espacial 70/30, contraste de brillo y tamaños elegibles. |
| `web/js/visor/sonificacion.js`, `sintesis-rgb.js` | Secuencia por celda, mapeo de intensidad a Hz, síntesis RGB con Web Audio y reloj de reproducción. |
| `web/js/visor/visor-partituras.js` | Carga el visor de partituras que comparten la vista musical, la impresión y el informe. |
| `web/js/visor/arreglo.js`, `musicxml.js`, `partitura-musical.js` | Adaptación a instrumentos, ritmo, digitación, escritura MusicXML, cursor y vista imprimible. |
| `web/js/visor/muestras.js`, `web/muestras/` | Bancos compactos, orígenes de notas, precarga y cálculo de afinación con Tone.js. |
| `web/js/visor/audio-pistas.js`, `audio-worker.js` | Timbres sintetizados, mezcla espacial de todas las pistas y codificación WAV. |
| `web/js/visor/daw.js`, `midi.js`, `audio-vivo.js` | Editor de tres pistas, importación y exportación de archivos MIDI. |
| `web/js/estadisticas.js`, `web/js/visor/paneles.js`, `informe.js` | Píxel activo, semáforo, estadísticas e informe con partitura y letra opcional. |
| `web/js/visor/gis.js`, `globo.js` | Punto, capa con cuatro esquinas, mapa y globo. |
| `api/visor/videos.py` | Decodificación del tramo de la descarga original y conservación del tiempo de origen. |
| `api/rutas/visor.py`, `api/visor/` | Importar páginas, validar URL públicas y decodificar medios. |
| `api/rutas/daw.py` | Validación y distribución de eventos WebSocket RGB y MIDI por sesión. |
| `api/rutas/interpretaciones.py`, `api/visor/interpretaciones.py` | Listado de MP4 y mezcla de tres pistas con FFmpeg. |
| `scripts/preparar_github.py` | Copia la entrega a un clon de GitHub y prepara el commit. Con `--publicar` envía el commit a `main`. |

## Cambios habituales

- **Agregar o quitar un paquete para todos**. Cambia `datos/fuentes-svs.json`, luego ejecuta `python -m scripts.actualizar_catalogo --vistas`. Para cambiar solo el nombre en un paquete ya generado, edita su manifiesto y la entrada del índice general.
- **Agregar o quitar un MP4**. La pantalla de GOES indica la carpeta del disco. `interpretacion.mp4` se detecta directamente. Para otros nombres, ejecuta `python -m scripts.indexar_videos`.
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

[Publicar en GitHub y Render](PUBLICAR.md)
