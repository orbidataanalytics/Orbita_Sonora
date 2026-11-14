from typing import Literal
from fastapi import APIRouter,Query
from .parametros import Niveles


def crear_rutas(analisis,partituras):
    router=APIRouter(prefix='/api',tags=['Canciones e imágenes'])
    router.add_api_route('/canciones',analisis.obtener_canciones,methods=['GET'])
    router.add_api_route('/analisis/{cancion_id}',analisis.obtener_analisis,methods=['GET'])
    router.add_api_route('/imagenes/{cancion_id}/{canal}.png',analisis.obtener_imagen,methods=['GET'])

    @router.get('/ocupacion/{cancion_id}')
    def obtener_ocupacion(cancion_id: str, niveles: Niveles, tiempo: float | None = Query(default=None, ge=0)):
        return analisis.obtener_ocupacion(cancion_id, niveles, tiempo)

    @router.get('/estado/{cancion_id}')
    def obtener_estado(cancion_id:str,tiempo:float=Query(default=0,ge=0),recorrido:Literal['filas','serpentina','hilbert']='filas'):
        estado=analisis.obtener_estado(cancion_id,tiempo,recorrido)
        estado['partituras']=partituras.estado(cancion_id,estado['indice'])
        return estado
    return router
