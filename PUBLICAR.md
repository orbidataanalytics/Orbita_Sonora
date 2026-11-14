# Publicar Órbita Sonora en GitHub Desktop

1. En GitHub Desktop abre `orbidataanalytics/OrbitaSonora`. Si ya lo clonaste, pulsa **Fetch origin** y después **Pull origin** si aparece. Si falta el clon, elige **File → Clone repository → URL**, pega `https://github.com/orbidataanalytics/OrbitaSonora.git` y elige una carpeta nueva o vacía que termine en `OrbitaSonora`.
2. En GitHub Desktop abre **Repository → Show in Explorer**. Esa es la ruta que se sincroniza. Descomprime el ZIP en otra carpeta. Abre `OrbitaSonora_GIS` dentro del ZIP y copia **su contenido** a la carpeta que abrió GitHub Desktop. Acepta reemplazar los archivos con el mismo nombre. En esa carpeta deben verse directamente `index.html`, `main.py`, `api/`, `web/`, `datos/` y `videos/`. Incluye `.nojekyll`. Si el repositorio contiene la antigua carpeta `audio/` de la demostración, retírala en el commit de actualización. La rocola de esta versión genera su audio a partir de imágenes y videos.
3. Regresa a GitHub Desktop. En **Changes** verás los archivos copiados. Escribe `Actualizar Órbita Sonora`, verifica que se incluyan las carpetas de descargas originales, pulsa **Commit to main** y después **Push origin**. Si la rama activa tiene otro nombre, cambia a **main** antes de copiar.

Si **Changes** está vacío tras copiar, vuelve a **Repository → Show in Explorer** y comprueba que el `index.html` nuevo esté en esa carpeta y que exista allí `videos/`. Evita copiar una carpeta adicional `OrbitaSonora_GIS` dentro del repositorio.

## GitHub Pages y Render

| Servicio | Configuración |
| --- | --- |
| GitHub Pages | **Settings → Pages → Deploy from a branch → main → /(root)** |
| Render | Repositorio `orbidataanalytics/OrbitaSonora`, rama `main`, raíz del repositorio |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn main:app --host 0.0.0.0 --port $PORT` |

Si Render tiene despliegue automático, toma el commit de `main`. Si está desactivado, usa **Manual Deploy → Deploy latest commit**. Abre **GEOS Aerosols (2025)** o **GEDI Forest Height** en la rocola y selecciona **Descarga incluida**. Pulsa **Tocar arreglo** y cambia la pista verde de guitarra a piano en el **DAW**. Comprueba el audio, el pentagrama y el WAV del arreglo. Después prueba **Curva de Hilbert** con **Sonificar píxeles RGB**. [GitHub Pages](https://orbidataanalytics.github.io/OrbitaSonora/) · [Rutas en Render](https://orbitasonora.onrender.com/docs)

## Agregar o quitar fuentes del catálogo

Para páginas NASA, edita `datos/fuentes-svs.json` y ejecuta `python -m scripts.actualizar_catalogo --vistas` desde la carpeta que contiene `main.py`. Para ocultar solo un medio, quita su entrada del `paquete.json` y corrige el recuento del catálogo si procede. Si solo quieres probar algo en tu navegador, usa **Agregar paquete**.

## Publicar un video interpretado

La ventana **Interpretaciones** muestra la ruta exacta que corresponde a tu disco. Por ejemplo, coloca `interpretacion.mp4` en `videos/svs_5313/`. Para varios videos usa nombres como `ensayo_01.mp4` y `concierto_itm_01.mp4` y ejecuta `python -m scripts.indexar_videos` para incluirlos en el índice estático. Luego haz commit y push. La mezcla devuelve un MP4 listo para que lo revises antes de copiarlo al repositorio.

Para quitar un video, borra ese MP4 de la carpeta, actualiza el índice y vuelve a hacer commit y push. El historial de Git permite recuperar ediciones anteriores.
