from collections import deque
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
import json
import re
from time import monotonic
from pathlib import PurePosixPath
from urllib.parse import unquote, urljoin, urlsplit, urlunsplit

from lxml import html

from .red import ErrorMedio, NASA
from .tipos import extension, tipo_medio


def texto(valor):
    if not valor:
        return ""
    nodo = html.fragment_fromstring(str(valor), create_parent="div")
    return " ".join(" ".join(nodo.itertext()).split())


def identificador(valor):
    return sha256(valor.encode()).hexdigest()[:16]


def enlace(base, valor, conservar_ancla=False):
    if not isinstance(valor, str) or not valor or valor.startswith(("#", "data:", "javascript:", "blob:")):
        return None
    try:
        uri = urlsplit(urljoin(base, valor))
    except ValueError:
        return None
    if uri.scheme not in ("http", "https") or not uri.hostname or uri.username or uri.password:
        return None
    if uri.hostname == NASA:
        uri = uri._replace(scheme="https")
    return urlunsplit(uri if conservar_ancla else uri._replace(fragment=""))


def nombre_url(url):
    return unquote(PurePosixPath(urlsplit(url).path).name) or urlsplit(url).hostname


def miniatura_svs(url):
    nombre = nombre_url(url).lower()
    return any(marca in nombre for marca in ("_searchweb.", "_thm.", "_thumb.", "_thumbnail.", "_and_grid_web."))


class Catalogador:
    def __init__(self, cliente, max_paginas=48):
        self.cliente = cliente
        self.max_paginas = max_paginas

    def medio(self, url, tipo, titulo="", **campos):
        return {
            "id": identificador(url), "tipo": tipo, "url": url,
            "titulo": titulo or nombre_url(url), **campos,
        }

    def paquete(self, url, titulo, portada, medios, **campos):
        medios = list({m["url"]: m for m in medios}.values())
        if not medios:
            raise ErrorMedio("La página no contiene imágenes o videos directos en la sección indicada.")
        return {
            "id": identificador(url), "titulo": titulo, "portada": portada, "fuente": url,
            "medios": medios, **campos,
        }

    def importar(self, original):
        url = self.cliente.normalizar(original)
        fragmento = urlsplit(original).fragment
        partes = urlsplit(url)
        if partes.hostname == NASA:
            if tipo_medio(url):
                return self.directo(url, tipo_medio(url))
            detalle = re.fullmatch(r"/(?:api/)?(\d+)/?", partes.path)
            if detalle:
                return self.svs(urljoin(f"https://{NASA}", f"/{detalle[1]}/"), int(detalle[1]), fragmento)
        with self.cliente.abrir(url) as (respuesta, final):
            mime = respuesta.headers.get("content-type", "")
            tipo = tipo_medio(final, mime)
            if tipo and not (tipo == "imagen" and mime.startswith("image/svg")):
                return self.directo(final, tipo)
            cuerpo = self.cliente.leer(respuesta, 3 * 1024 * 1024)
        if "html" not in mime and not cuerpo.lstrip().lower().startswith((b"<!doctype html", b"<html")):
            raise ErrorMedio("La URL no contiene una página, imagen o video reconocido.")
        arbol = html.fromstring(cuerpo)
        if urlsplit(final).hostname == NASA:
            for referencia in arbol.xpath('//main//a[starts-with(@href, "/api/")]/@href'):
                if match := re.fullmatch(r"/api/(\d+)/?", referencia):
                    return self.svs(final, int(match[1]), fragmento)
        return self.pagina(final, arbol, fragmento)

    def directo(self, url, tipo):
        fuente = nombre_url(url)
        titulo = PurePosixPath(fuente).stem.replace("_", " ")
        medio = self.medio(url, tipo, titulo, fuente=url)
        return self.paquete(url, titulo, url if tipo == "imagen" else None, [medio])

    def pagina(self, url, arbol, fragmento):
        titulo = next(iter(arbol.xpath('//meta[@property="og:title"]/@content')), "")
        titulo = titulo or next(iter(arbol.xpath("//h1[1]")), arbol).text_content().strip()[:200]
        titulo = titulo or nombre_url(url)
        portada = enlace(url, next(iter(arbol.xpath('//meta[@property="og:image"]/@content')), ""))
        if fragmento:
            seleccion = arbol.xpath("//*[@id=$id]", id=unquote(fragmento))
            if not seleccion:
                raise ErrorMedio("La sección indicada no existe en esta página.")
            nodo = seleccion[0]
        else:
            nodo = next(iter(arbol.xpath("//main|//*[@role='main']|//article")), arbol)
        medios = []
        for elemento in nodo.xpath("descendant-or-self::video|descendant-or-self::img|descendant-or-self::a|descendant-or-self::picture/source"):
            if elemento.xpath("ancestor::nav|ancestor::footer|ancestor::header"):
                continue
            tag = elemento.tag
            if tag == "video":
                candidatos = [elemento.get("src")] + elemento.xpath("./source/@src")
                poster = enlace(url, elemento.get("poster"))
            elif tag == "img":
                candidatos = [elemento.get("data-src") or elemento.get("src")]
                poster = None
            elif tag == "source":
                srcset = elemento.get("srcset", "")
                candidatos = [srcset.split()[0]] if srcset.split() else []
                poster = None
            else:
                candidatos = [elemento.get("href")]
                poster = None
            for candidato in candidatos:
                link = enlace(url, candidato)
                if not link:
                    continue
                if re.search(r"(^|[-_/])(logo|favicon|sprite|placeholder|tracking|pixel)([-_.]|$)", urlsplit(link).path.lower()):
                    continue
                tipo = tipo_medio(link) or {"img": "imagen", "video": "video", "source": "imagen"}.get(tag)
                if tipo:
                    medios.append(self.medio(link, tipo, elemento.get("alt") or elemento.get("title"), poster=poster, fuente=url))
        if portada and not fragmento:
            medios.insert(0, self.medio(portada, "imagen", "Imagen principal", fuente=url))
        portada = None if fragmento else portada
        portada = portada or next((m.get("poster") or m["url"] for m in medios if m.get("poster") or m["tipo"] == "imagen"), None)
        return self.paquete(url + (f"#{fragmento}" if fragmento else ""), titulo, portada, medios[:250])

    def datos_svs(self, numero):
        with self.cliente.abrir(f"https://{NASA}/api/{int(numero)}/") as (respuesta, _):
            return json.loads(self.cliente.leer(respuesta, 3 * 1024 * 1024))

    def svs(self, url, numero, fragmento=""):
        principal = self.datos_svs(numero)
        titulo = principal["title"]
        grupos = principal["media_groups"]
        if fragmento:
            if re.fullmatch(r"media_group_\d+", fragmento):
                grupos = [g for g in grupos if f"media_group_{g['id']}" == fragmento]
            else:
                grupos = []
            if not grupos:
                raise ErrorMedio("El grupo de medios de NASA SVS no existe.")
        es_galeria = principal.get("page_type") == "Gallery"
        cola = deque([(principal, grupos, 0, "")])
        vistos = {numero}
        medios = []
        pendientes = []
        limite = monotonic() + 25
        with ThreadPoolExecutor(max_workers=8) as ejecutor:
            while cola:
                lote = []
                while cola:
                    actual, grupos, profundidad, seccion = cola.popleft()
                    for grupo in grupos:
                        medios.extend(self.medios_svs(actual, grupo, seccion))
                        if not es_galeria or actual.get("page_type") != "Gallery":
                            continue
                        for item in grupo["items"]:
                            hijo = item.get("instance") or {}
                            if item.get("type") not in {"details_page", "gallery_page"} or not hijo.get("id"):
                                continue
                            numero_hijo = hijo["id"]
                            if numero_hijo in vistos:
                                continue
                            vistos.add(numero_hijo)
                            sub_seccion = seccion or grupo.get("title") or ""
                            fuente_hijo = enlace(url, hijo["url"])
                            if len(vistos) > self.max_paginas or profundidad >= 2 or monotonic() >= limite:
                                pendientes.append({"titulo": hijo["title"], "url": fuente_hijo})
                                continue
                            futuro = ejecutor.submit(self.datos_svs, numero_hijo)
                            lote.append((futuro, hijo, profundidad + 1, sub_seccion))
                for futuro, hijo, profundidad, seccion in lote:
                    try:
                        datos = futuro.result()
                    except (ErrorMedio, ValueError, KeyError):
                        pendientes.append({"titulo": hijo["title"], "url": enlace(url, hijo["url"])})
                        continue
                    cola.append((datos, datos["media_groups"], profundidad, seccion))
        portada = None if fragmento else self.archivo_svs(principal.get("main_image") or {})
        portada = portada or next((m["url"] for m in medios if m["tipo"] == "imagen"), None)
        fuente = url + (f"#{fragmento}" if fragmento else "")
        return self.paquete(
            fuente, titulo, portada, medios, proveedor="NASA SVS", svs_id=numero,
            seccion=fragmento or None, es_galeria=es_galeria, pendientes=pendientes,
        )

    def archivo_svs(self, instancia):
        return enlace(f"https://{NASA}/", instancia.get("url"))

    def medios_svs(self, actual, grupo, seccion):
        medio_clases = {"Image": "imagen", "Movie": "video"}
        por_tipo = {tipo: [] for tipo in medio_clases.values()}
        for item in grupo["items"]:
            instancia = item.get("instance") or {}
            tipo = medio_clases.get(instancia.get("media_type"))
            if item.get("type") not in {"media", "media_group"} or not tipo or not self.archivo_svs(instancia):
                continue
            por_tipo[tipo].append(instancia)
        titulo = texto(grupo.get("title") or grupo.get("caption") or grupo.get("description"))
        titulo = titulo.split(". ")[0][:118]
        fuente = enlace(f"https://{NASA}/", actual["url"]) + f"#media_group_{grupo['id']}"
        imagenes = sorted((a for a in por_tipo["imagen"] if not miniatura_svs(self.archivo_svs(a))),
                          key=self.preferencia_imagen)
        videos = sorted(por_tipo["video"], key=self.preferencia_video)
        poster = self.archivo_svs(imagenes[0]) if imagenes else self.archivo_svs(actual.get("main_image") or {})
        for tipo, archivos in (("imagen", imagenes), ("video", videos)):
            if not archivos:
                continue
            principal, *alternativas = archivos
            url = self.archivo_svs(principal)
            yield self.medio(
                url, tipo, titulo or nombre_url(url),
                grupo=seccion or actual["title"], fuente=fuente,
                descripcion=texto(principal.get("alt_text"))[:1100],
                ancho=principal.get("width") or None, alto=principal.get("height") or None,
                poster=poster if tipo == "video" else None,
                variantes=[
                    {"url": self.archivo_svs(a), "nombre": a.get("filename") or nombre_url(self.archivo_svs(a)),
                     "ancho": a.get("width") or None, "alto": a.get("height") or None}
                    for a in alternativas
                ],
            )

    def preferencia_imagen(self, archivo):
        ext = extension(archivo["url"])
        ancho = archivo.get("width") or 0
        return (ext not in {"jpg", "jpeg", "png", "webp"}, ancho < 450, abs(ancho - 1200))

    def preferencia_video(self, archivo):
        url = archivo["url"].lower()
        return (
            extension(url) not in {"mp4", "webm", "m4v"},
            any(k in url for k in ("h265", "hevc", "prores", "2160", "5760", "7680")),
            extension(url) != "webm",
        )
