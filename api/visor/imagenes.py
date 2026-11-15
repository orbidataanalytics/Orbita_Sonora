from io import BytesIO
import warnings

import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError
from pillow_heif import register_heif_opener

from .red import ErrorMedio
from .tipos import RAW, extension

register_heif_opener()


class LectorImagen:
    def __init__(self, lado_maximo=1600):
        self.lado_maximo = lado_maximo

    def convertir(self, cuerpo, nombre):
        sufijo = extension(nombre)
        if sufijo in RAW:
            imagen, metadatos = self.raw(cuerpo)
        elif sufijo in {"fits", "fit", "fts"} or cuerpo.startswith(b"SIMPLE  ="):
            imagen, metadatos = self.fits(cuerpo)
        elif sufijo in {"tif", "tiff", "geotiff", "jp2", "j2k"} or cuerpo[:4] in (b"II*\x00", b"MM\x00*", b"II+\x00", b"MM\x00+"):
            imagen, metadatos = self.raster(cuerpo)
        else:
            imagen, metadatos = self.pillow(cuerpo)
        imagen.thumbnail((self.lado_maximo, self.lado_maximo), Image.Resampling.LANCZOS)
        salida = BytesIO()
        imagen.save(salida, format="PNG", optimize=False)
        return salida.getvalue(), metadatos

    def pillow(self, cuerpo):
        try:
            with Image.open(BytesIO(cuerpo)) as archivo:
                ancho, alto = archivo.size
                if ancho * alto > 90_000_000:
                    raise ErrorMedio("La imagen excede 90 millones de píxeles.")
                imagen = ImageOps.exif_transpose(archivo)
                if imagen.mode in ("I", "I;16", "F"):
                    salida = self.escalar(np.asarray(imagen)[None, :, :])
                    metodo = "Percentiles 2–98"
                else:
                    salida = imagen.convert("RGBA")
                    metodo = "Color de la imagen"
                return salida, {
                    "ancho": imagen.width, "alto": imagen.height,
                    "formato": archivo.format, "metodo": metodo,
                }
        except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
            raise ErrorMedio("La imagen no se pudo decodificar con los formatos instalados.") from error

    def raw(self, cuerpo):
        import rawpy
        try:
            with rawpy.imread(BytesIO(cuerpo)) as archivo:
                imagen = Image.fromarray(archivo.postprocess(
                    use_camera_wb=True, half_size=True, output_bps=8,
                ))
                return imagen, {
                    "ancho": archivo.sizes.width, "alto": archivo.sizes.height,
                    "formato": "RAW", "metodo": "Revelado RGB y balance de blancos de cámara",
                }
        except (rawpy.LibRawError, ValueError) as error:
            raise ErrorMedio("LibRaw no pudo revelar este archivo. Verifica el modelo y el formato.") from error

    def fits(self, cuerpo):
        from astropy.io import fits
        try:
            with fits.open(BytesIO(cuerpo), memmap=False) as unidades:
                for unidad in unidades:
                    forma = unidad.shape if unidad.is_image else ()
                    if len(forma) not in (2, 3):
                        continue
                    if np.prod(forma, dtype=np.float64) > 90_000_000:
                        raise ErrorMedio("El plano FITS excede 90 millones de valores.")
                    valores = unidad.data
                    if valores.ndim == 2:
                        valores = valores[None, :, :]
                    elif valores.shape[0] not in (1, 3):
                        valores = valores[:1]
                    imagen = self.escalar(valores)
                    return imagen, {
                        "ancho": imagen.width, "alto": imagen.height,
                        "formato": "FITS", "metodo": "Percentiles 2–98 del plano visualizado",
                    }
        except (OSError, ValueError, TypeError) as error:
            raise ErrorMedio("No se pudo leer el plano FITS.") from error
        raise ErrorMedio("El archivo FITS no contiene un plano de imagen.")

    def raster(self, cuerpo):
        import rasterio
        from rasterio.enums import ColorInterp, Resampling
        from rasterio.io import MemoryFile
        from rasterio.warp import transform

        try:
            with warnings.catch_warnings(), MemoryFile(cuerpo) as memoria:
                warnings.simplefilter("ignore", rasterio.errors.NotGeoreferencedWarning)
                with rasterio.Env(GDAL_PAM_ENABLED="NO", GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR"):
                    with memoria.open() as archivo:
                        if archivo.driver not in {"GTiff", "JP2OpenJPEG", "JPEG2000"}:
                            raise ErrorMedio("El archivo no es un TIFF o JPEG 2000 compatible.")
                        interpretaciones = list(archivo.colorinterp)
                        colores = (ColorInterp.red, ColorInterp.green, ColorInterp.blue)
                        if all(color in interpretaciones for color in colores):
                            bandas = [interpretaciones.index(color) + 1 for color in colores]
                        elif archivo.count >= 3 and ColorInterp.alpha not in interpretaciones[:3]:
                            bandas = [1, 2, 3]
                        else:
                            bandas = [1]
                        factor = min(1, self.lado_maximo / max(archivo.width, archivo.height))
                        ancho, alto = max(1, round(archivo.width * factor)), max(1, round(archivo.height * factor))
                        datos = archivo.read(
                            bandas, out_shape=(len(bandas), alto, ancho),
                            masked=True, resampling=Resampling.bilinear,
                        )
                        try:
                            paleta = archivo.colormap(1) if interpretaciones[0] == ColorInterp.palette else None
                        except ValueError:
                            paleta = None
                        if paleta and datos.dtype == np.uint8:
                            colores_rgb = np.zeros((256, 4), dtype=np.uint8)
                            for indice, color in paleta.items():
                                colores_rgb[indice] = color
                            rgba = colores_rgb[datos[0].filled(0)]
                            rgba[..., 3][np.ma.getmaskarray(datos[0])] = 0
                            imagen = Image.fromarray(rgba)
                        else:
                            imagen = self.escalar(datos)
                        if ColorInterp.alpha in interpretaciones:
                            alfa = archivo.read(interpretaciones.index(ColorInterp.alpha) + 1,
                                                out_shape=(alto, ancho), resampling=Resampling.bilinear)
                            maximo = np.iinfo(alfa.dtype).max if np.issubdtype(alfa.dtype, np.integer) else 1
                            imagen.putalpha(Image.fromarray(np.uint8(np.clip(alfa / maximo, 0, 1) * 255)))
                        meta = {"ancho": archivo.width, "alto": archivo.height,
                                "formato": archivo.driver, "bandas": bandas,
                                "metodo": "Color de 8 bits" if datos.dtype == np.uint8 else "Percentiles 2–98 por banda"}
                        if archivo.crs:
                            px = [(0, 0), (archivo.width, 0), (archivo.width, archivo.height), (0, archivo.height)]
                            x, y = zip(*(archivo.transform * punto for punto in px))
                            longitudes, latitudes = transform(archivo.crs, "EPSG:4326", list(x), list(y))
                            esquinas = [[round(lon, 8), round(lat, 8)] for lon, lat in zip(longitudes, latitudes)]
                            if np.isfinite(esquinas).all():
                                meta["geografia"] = {
                                    "tipo": "esquinas", "coordenadas": esquinas, "origen": "Metadatos del ráster",
                                    "crs_original": archivo.crs.to_string(),
                                }
                        return imagen, meta
        except rasterio.errors.RasterioIOError:
            return self.pillow(cuerpo)

    def escalar(self, datos):
        datos = np.ma.asarray(datos)
        validos = np.isfinite(datos.data) & ~np.ma.getmaskarray(datos)
        canales = []
        for banda, mascara in zip(datos.data, validos):
            salida = np.zeros(banda.shape, np.uint8)
            if banda.dtype == np.uint8:
                salida[mascara] = banda[mascara]
            elif np.any(mascara):
                bajo, alto = np.percentile(banda[mascara], (2, 98))
                if alto > bajo:
                    salida[mascara] = np.rint(np.clip(
                        (banda[mascara].astype(np.float64) - bajo) / (alto - bajo), 0, 1,
                    ) * 255).astype(np.uint8)
                else:
                    salida[mascara] = 128
            canales.append(salida)
        if len(canales) == 1:
            canales *= 3
        alfa = np.all(validos, axis=0).astype(np.uint8) * 255
        return Image.fromarray(np.dstack([*canales, alfa]))
