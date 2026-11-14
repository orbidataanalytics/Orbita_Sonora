from contextlib import contextmanager
import ipaddress
import socket
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

import httpx


NASA = "svs.gsfc.nasa.gov"
REDIRECCIONES = {301, 302, 303, 307, 308}


class ErrorMedio(Exception):
    def __init__(self, mensaje, estado=422):
        super().__init__(mensaje)
        self.estado = estado


class SinRedireccion(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class RespuestaNASA:
    def __init__(self, respuesta):
        self.respuesta = respuesta
        self.status_code = respuesta.code
        self.headers = respuesta.headers

    def iter_bytes(self, tamano):
        while bloque := self.respuesta.read(tamano):
            yield bloque


class ClientePublico:
    def __init__(self, timeout=25):
        self.timeout = timeout

    def normalizar(self, valor):
        try:
            partes = urlsplit(valor.strip())
            puerto = partes.port
        except ValueError as error:
            raise ErrorMedio("URL inválida.") from error
        if (
            len(valor) > 2048 or any(ord(c) < 32 or c == "\\" for c in valor)
            or partes.scheme not in ("http", "https") or not partes.hostname
            or partes.username is not None or partes.password is not None
            or puerto not in (None, 443 if partes.scheme == "https" else 80)
        ):
            raise ErrorMedio("Usa una URL pública HTTP o HTTPS sin credenciales.")
        return urlunsplit(partes._replace(fragment=""))

    def resolver(self, url):
        partes = urlsplit(url)
        host = partes.hostname
        if host == NASA:
            return urlunsplit(partes._replace(scheme="https", netloc=NASA)), {}, True
        try:
            ip = ipaddress.ip_address(host)
            direcciones = {ip}
        except ValueError:
            try:
                direcciones = {
                    ipaddress.ip_address(info[4][0])
                    for info in socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
                }
            except OSError as error:
                raise ErrorMedio("No se pudo resolver el sitio de origen.", 502) from error
        if not direcciones or any(not ip.is_global or ip.is_multicast for ip in direcciones):
            raise ErrorMedio("La URL debe resolver a una dirección pública.")
        destino = sorted(direcciones, key=lambda ip: (ip.version, int(ip)))[0]
        netloc = f"[{destino}]" if destino.version == 6 else str(destino)
        return (
            urlunsplit(partes._replace(netloc=netloc)),
            {"Host": host.encode("idna").decode("ascii")},
            False,
        )

    @contextmanager
    def abrir(self, url, rango=None):
        url = self.normalizar(url)
        for _ in range(6):
            destino, headers, nasa = self.resolver(url)
            headers["Accept-Encoding"] = "identity"
            headers["User-Agent"] = "OrbitaSonora/4.0 (+https://github.com/orbidataanalytics/OrbitaSonora)"
            if rango:
                headers["Range"] = rango
            try:
                with self.enviar(destino, headers, nasa, urlsplit(url).hostname) as respuesta:
                    if respuesta.status_code in REDIRECCIONES and respuesta.headers.get("location"):
                        url = self.normalizar(urljoin(url, respuesta.headers["location"]))
                        continue
                    if respuesta.status_code >= 400:
                        estado = respuesta.status_code if respuesta.status_code in (404, 416) else 502
                        raise ErrorMedio(f"El sitio de origen respondió HTTP {respuesta.status_code}.", estado)
                    yield respuesta, url
                    return
            except (httpx.HTTPError, URLError, TimeoutError, OSError) as error:
                raise ErrorMedio("No se pudo leer el sitio de origen.", 502) from error
        raise ErrorMedio("La URL tiene demasiadas redirecciones.", 502)

    @contextmanager
    def enviar(self, destino, headers, nasa, hostname):
        if nasa:
            opener = build_opener(SinRedireccion())
            try:
                respuesta = opener.open(Request(destino, headers=headers), timeout=self.timeout)
            except HTTPError as error:
                respuesta = error
            with respuesta:
                yield RespuestaNASA(respuesta)
            return
        with httpx.Client(timeout=self.timeout, trust_env=False) as cliente:
            with cliente.stream(
                "GET", destino, headers=headers,
                extensions={"sni_hostname": hostname.encode("idna").decode("ascii")},
            ) as respuesta:
                yield respuesta

    def leer(self, respuesta, limite):
        longitud = respuesta.headers.get("content-length", "")
        if longitud.isdigit() and int(longitud) > limite:
            raise ErrorMedio(f"El archivo supera {limite // (1024 * 1024)} MiB.", 413)
        cuerpo = bytearray()
        for bloque in respuesta.iter_bytes(65536):
            if len(cuerpo) + len(bloque) > limite:
                raise ErrorMedio(f"El archivo supera {limite // (1024 * 1024)} MiB.", 413)
            cuerpo.extend(bloque)
        return bytes(cuerpo)
