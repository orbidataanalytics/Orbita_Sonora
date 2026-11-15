# Publicar Órbita Sonora en GitHub

## 1. Enviar la entrega

Descomprime el ZIP. En Windows, abre `OrbitaSonora_GIS` y haz doble clic en `PUBLICAR_EN_GITHUB.bat`. Para usar una terminal, ejecuta este comando desde esa misma carpeta.

```bash
python3 scripts/preparar_github.py --publicar
```

El script clona `orbidataanalytics/Orbita_Sonora` en la carpeta vecina `Orbita_Sonora_GitHub_5_7_1`. Cuando GitHub lo solicite, inicia sesión en el navegador con la cuenta que tiene permiso de escritura. El script guarda el commit y lo envía a `main`. Tus carpetas de trabajo anteriores se conservan. Para publicar, el equipo debe tener [Python 3.9 o posterior](https://www.python.org/downloads/), [Git](https://git-scm.com/downloads) y [GitHub CLI](https://cli.github.com/).

Para revisar los cambios antes del push, ejecuta `python3 scripts/preparar_github.py`. Verás el resumen del commit y los comandos para publicarlo. Puedes indicar la ruta de un clon existente en `main`.

## 2. Comprobar la publicación

Abre la ejecución más reciente de **pages build and deployment** en la pestaña [Actions](https://github.com/orbidataanalytics/Orbita_Sonora/actions). Cuando termine en verde, comprueba que el pie de la [página pública](https://orbidataanalytics.github.io/Orbita_Sonora/) muestre **v5.8.0**. La galería muestra nueve imágenes. Prueba una, pulsa **Tocar arreglo** y cambia de recorrido.

En [Settings → Pages](https://github.com/orbidataanalytics/Orbita_Sonora/settings/pages), el origen adecuado es **Deploy from a branch → main → /(root)**. En esa raíz quedan `index.html`, `.nojekyll`, `web/`, `datos/` y `videos/`.

## 3. Publicar un video interpretado

1. Elige la imagen y copia la ruta que aparece debajo de GOES. Para aerosoles GEOS, guarda `videos/svs_5669/interpretacion.mp4` dentro del clon. Usa video H.264 con audio AAC.
2. Para publicar varias grabaciones, ponles nombres como `ensayo_01.mp4` y ejecuta `python3 -m scripts.indexar_videos` en el clon. Añade los MP4 y el índice `videos/catalogo.json` al commit. [Rutas de los nueve discos](videos/README.md)
3. Haz commit y push. Pulsa **Ver interpretación** debajo de GOES. Para probar un MP4 que tienes en tu equipo, usa **Abrir MP4**.

## 4. Render

Configura el repositorio `orbidataanalytics/Orbita_Sonora`, rama `main`, con la raíz del repositorio como carpeta de trabajo.

| Opción | Valor |
| --- | --- |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| Health Check Path | `/health` |

Después del despliegue, [la raíz abre el visor](https://orbitasonora.onrender.com/) y [`/docs` documenta la API](https://orbitasonora.onrender.com/docs). Si Render usa despliegue manual, selecciona **Deploy latest commit**.
