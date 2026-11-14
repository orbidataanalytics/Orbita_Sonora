from pathlib import Path
import os
from fastapi import FastAPI,HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from .datos import RepositorioDatos
from .servicios.analisis import ServicioAnalisis
from .servicios.partituras import ServicioPartituras
from .servicios.informes import ServicioInformes
from .rutas import sistema,canciones,partituras,informes,visor,daw,interpretaciones


def crear_app():
    raiz=Path(__file__).resolve().parent.parent
    repositorio=RepositorioDatos(raiz)
    analisis=ServicioAnalisis(repositorio)
    notas=ServicioPartituras(repositorio)
    reporte=ServicioInformes(analisis,notas)
    app=FastAPI(title='Órbita Sonora API',description='ORBIDATA, GIS, sonificación y rocola',version='5.3.0')
    origenes=[o.strip() for o in os.getenv('CORS_ORIGINS','*').split(',') if o.strip()]
    app.add_middleware(CORSMiddleware,allow_origins=origenes or ['*'],allow_credentials=False,
                       allow_methods=['*'],allow_headers=['*'],
                       expose_headers=['Content-Length','Content-Range','Accept-Ranges','X-Orbita-Imagen',
                                       'X-Orbita-Video','X-Orbita-Video-Meta'])
    app.add_middleware(GZipMiddleware,minimum_size=1024)
    app.include_router(sistema.crear_rutas())
    app.include_router(canciones.crear_rutas(analisis,notas))
    app.include_router(partituras.crear_rutas(notas))
    app.include_router(informes.crear_rutas(reporte))
    app.include_router(visor.crear_rutas())
    app.include_router(daw.crear_rutas())
    app.include_router(interpretaciones.crear_rutas(raiz / "videos"))
    app.state.analisis=analisis
    app.state.partituras=notas
    app.state.informes=reporte

    @app.get('/audio-a-imagen.html', include_in_schema=False)
    @app.get('/rocola',include_in_schema=False)
    @app.get('/rocola.html',include_in_schema=False)
    @app.get('/visor',include_in_schema=False)
    @app.get('/index.html',include_in_schema=False)
    def mostrar_visor():
        if not (raiz/'index.html').is_file():raise HTTPException(status_code=404,detail='Falta index.html')
        return FileResponse(raiz/'index.html',media_type='text/html')

    for carpeta in ('web','datos','imagenes_pixel','docs','videos'):
        app.mount('/'+carpeta,StaticFiles(directory=str(raiz/carpeta),check_dir=False),name=carpeta)
    return app
