import json
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .rutas import daw, interpretaciones, sistema, visor


def crear_app():
    raiz = Path(__file__).resolve().parent.parent
    version = json.loads((raiz / 'package.json').read_text(encoding='utf-8'))['version']
    app = FastAPI(title='Órbita Sonora API', description='ORBIDATA, GIS, sonificación y rocola', version=version)
    origenes = [o.strip() for o in os.getenv('CORS_ORIGINS', '*').split(',') if o.strip()]
    app.add_middleware(
        CORSMiddleware, allow_origins=origenes or ['*'], allow_credentials=False,
        allow_methods=['*'], allow_headers=['*'],
        expose_headers=['Content-Length', 'Content-Range', 'Accept-Ranges',
                        'X-Orbita-Imagen', 'X-Orbita-Video', 'X-Orbita-Video-Meta'],
    )
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.include_router(sistema.crear_rutas(version))
    app.include_router(visor.crear_rutas())
    app.include_router(daw.crear_rutas())
    app.include_router(interpretaciones.crear_rutas(raiz / "videos"))
    @app.get('/', include_in_schema=False)
    @app.get('/rocola', include_in_schema=False)
    @app.get('/rocola.html', include_in_schema=False)
    @app.get('/visor', include_in_schema=False)
    @app.get('/index.html', include_in_schema=False)
    def mostrar_visor():
        return FileResponse(raiz / 'index.html', media_type='text/html')

    for carpeta in ('web', 'datos', 'docs', 'videos'):
        app.mount('/' + carpeta, StaticFiles(directory=raiz / carpeta), name=carpeta)
    return app
