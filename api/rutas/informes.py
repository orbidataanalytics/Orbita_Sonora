from typing import Literal
from fastapi import APIRouter,Query,HTTPException
from .parametros import Niveles


def crear_rutas(servicio):
    router=APIRouter(prefix='/api/informe',tags=['Informes'])
    @router.get('/{cancion_id}')
    def obtener_informe(
        cancion_id: str,
        niveles: Niveles,
        recorrido: Literal['filas', 'serpentina', 'hilbert'] = 'filas',
        marcados: str = Query(default='', max_length=2000),
    ):
        try:indices=[int(v) for v in marcados.split(',') if v.strip()]
        except ValueError as error:raise HTTPException(status_code=422,detail='Las marcas deben ser índices enteros separados por comas') from error
        return servicio.obtener(cancion_id,recorrido,niveles,indices)
    return router
