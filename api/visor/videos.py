from fractions import Fraction
from io import BytesIO

import av

from .red import ErrorMedio


class LectorVideo:
    def __init__(self, duracion_maxima=60, ancho_maximo=960):
        self.duracion_maxima = duracion_maxima
        self.ancho_maximo = ancho_maximo

    def convertir(self, cuerpo, inicio=0):
        try:
            return self.codificar(cuerpo, inicio)
        except (av.FFmpegError, ValueError, StopIteration) as error:
            raise ErrorMedio("No se pudo decodificar el video. Prueba con otra variante MP4 o WebM.") from error

    def codificar(self, cuerpo, inicio):
        destino = BytesIO()
        with av.open(BytesIO(cuerpo), options={"protocol_whitelist": "file,pipe"}) as original:
            entrada = next(v for v in original.streams.video if not v.disposition & v.disposition.attached_pic)
            if entrada.width * entrada.height > 36_000_000:
                raise ErrorMedio("La resolución del video es demasiado alta.")
            tasa = min(30, max(1, round(float(entrada.average_rate or 24))))
            base = float(entrada.start_time * entrada.time_base) if entrada.start_time is not None else 0
            total = (float(entrada.duration * entrada.time_base) if entrada.duration
                     else float(original.duration or 0) / av.time_base)
            if total > 0:
                inicio = min(inicio, max(0, total - max(2 / tasa, .05)))
            if inicio > 0:
                original.seek(int((base + inicio) / float(entrada.time_base)), stream=entrada)
            factor = min(1, self.ancho_maximo / max(entrada.width, entrada.height))
            ancho = max(2, round(entrada.width * factor / 2) * 2)
            alto = max(2, round(entrada.height * factor / 2) * 2)
            fotogramas = 0
            anterior = -1
            with av.open(destino, mode="w", format="mp4") as convertido:
                pista = convertido.add_stream("libx264", rate=tasa, options={"preset": "veryfast", "crf": "24", "threads": "2"})
                pista.width, pista.height, pista.pix_fmt = ancho, alto, "yuv420p"
                for fotograma in original.decode(entrada):
                    tiempo = fotograma.time
                    relativo = tiempo - base - inicio if tiempo is not None else (anterior + 1) / tasa
                    if relativo < -1 / tasa:
                        continue
                    indice = max(0, round(relativo * tasa))
                    if indice >= self.duracion_maxima * tasa:
                        break
                    if indice <= anterior:
                        continue
                    anterior = indice
                    salida = fotograma.reformat(width=ancho, height=alto, format="yuv420p")
                    salida.pts = indice
                    salida.time_base = Fraction(1, tasa)
                    convertido.mux(pista.encode(salida))
                    fotogramas += 1
                convertido.mux(pista.encode(None))
            if not fotogramas:
                raise ErrorMedio("El archivo no contiene fotogramas de video.")
        return destino.getvalue(), {"inicio_s": inicio, "duracion_fuente_s": total or None}
