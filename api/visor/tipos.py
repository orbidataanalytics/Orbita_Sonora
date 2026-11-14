from pathlib import PurePosixPath
from urllib.parse import unquote, urlsplit

IMAGENES = set("""
jpg jpeg jpe jfif png apng webp gif bmp dib tif tiff geotiff jp2 j2k jpf jpx avif
heic heif ico icns psd tga pcx ppm pgm pbm pnm pam hdr dds exr fits fit fts
dng cr2 cr3 crw nef nrw arw srf sr2 raf rw2 orf pef srw dcr kdc erf 3fr mos mrw x3f
""".split())
RAW = set("dng cr2 cr3 crw nef nrw arw srf sr2 raf rw2 orf pef srw dcr kdc erf 3fr mos mrw x3f".split())
VIDEOS = set("mp4 m4v webm mov mkv avi mpg mpeg ogv 3gp mts m2ts wmv flv ts mxf".split())


def extension(url: str) -> str:
    return PurePosixPath(unquote(urlsplit(url).path)).suffix.lower().lstrip(".")


def tipo_medio(url: str, mime: str = "") -> str | None:
    mime = mime.lower().split(";", 1)[0].strip()
    ext = extension(url)
    if mime in ("text/html", "application/xhtml+xml"):
        return None
    if ext in IMAGENES or mime.startswith("image/"):
        return "imagen"
    if ext in VIDEOS or mime.startswith("video/"):
        return "video"
    return None
