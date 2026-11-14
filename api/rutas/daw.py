from asyncio import Lock, gather
import json
from time import monotonic
from typing import Annotated, Literal

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, ValidationError

Intensidad = Annotated[int, Field(ge=0, le=255)]
Coordenada = Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)]
MAX_EVENTOS_SEGUNDO = 45


class Evento(BaseModel):
    model_config = ConfigDict(extra="forbid")
    x: Coordenada = .5
    y: Coordenada = .5
    duration_ms: Annotated[int, Field(ge=10, le=8000)] = 180
    timestamp_ms: Annotated[float, Field(ge=0, allow_inf_nan=False)] | None = None


class Nota(Evento):
    type: Literal["note"]
    line_id: Annotated[int, Field(ge=1, le=3)]
    note: Annotated[int, Field(ge=0, le=127)]
    velocity: Annotated[int, Field(ge=0, le=127)]


class Pixel(Evento):
    type: Literal["rgb"]
    rgb: tuple[Intensidad, Intensidad, Intensidad]


class CanalDAW:
    def __init__(self):
        self.salas = {}
        self.validador = TypeAdapter(Annotated[Nota | Pixel, Field(discriminator="type")])

    async def enviar(self, cliente, mensaje):
        conexion, turno = cliente
        try:
            async with turno:
                await conexion.send_json(mensaje)
        except (RuntimeError, WebSocketDisconnect, OSError):
            return False
        return True

    async def emitir(self, sala, mensaje):
        clientes = list(sala.items())
        resultados = await gather(*(self.enviar(cliente, mensaje) for _, cliente in clientes))
        for (clave, _), enviado in zip(clientes, resultados):
            if not enviado:
                sala.pop(clave, None)

    async def sesion(self, socket: WebSocket, sesion: str):
        if len(sesion) != 32 or any(c not in "0123456789abcdef" for c in sesion):
            await socket.close(code=1008)
            return
        sala = self.salas.get(sesion)
        if sala is None and len(self.salas) >= 200 or sala is not None and len(sala) >= 12:
            await socket.close(code=1013)
            return

        if sala is None:
            sala = self.salas[sesion] = {}
        cliente = socket, Lock()
        sala[id(socket)] = cliente
        principio = monotonic()
        cantidad = 0
        try:
            await socket.accept()
            await self.enviar(cliente, {"type": "ready"})
            while True:
                entrada = await socket.receive_text()
                if len(entrada) > 1000:
                    await socket.close(code=1009)
                    return
                ahora = monotonic()
                if ahora - principio >= 1:
                    principio, cantidad = ahora, 0
                cantidad += 1
                if cantidad > MAX_EVENTOS_SEGUNDO:
                    if cantidad == MAX_EVENTOS_SEGUNDO + 1:
                        await self.enviar(cliente, {"type": "error", "message": "Máximo 45 mensajes por segundo."})
                    continue
                try:
                    evento = self.validador.validate_python(json.loads(entrada))
                except (ValueError, ValidationError):
                    await self.enviar(cliente, {"type": "error", "message": "Evento inválido. Revisa RGB, coordenadas y pista."})
                    continue
                await self.emitir(sala, evento.model_dump(exclude_none=True))
        except (RuntimeError, WebSocketDisconnect, OSError):
            pass
        finally:
            sala.pop(id(socket), None)
            if not sala:
                self.salas.pop(sesion, None)


def crear_rutas():
    router = APIRouter()
    canal = CanalDAW()
    router.add_api_websocket_route("/api/daw/vivo/{sesion}", canal.sesion)
    return router
