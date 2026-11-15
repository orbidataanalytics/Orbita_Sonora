from io import BytesIO
import json
from pathlib import Path
import sys

from fastapi.testclient import TestClient
from PIL import Image

raiz = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(raiz))
from main import app

cliente = TestClient(app)
version = json.loads((raiz / 'package.json').read_text(encoding='utf-8'))['version']
portada = cliente.get('/')
assert portada.status_code == 200 and 'text/html' in portada.headers['content-type']
assert f'v{version}' in portada.text and 'galeria-imagenes' in portada.text
for ruta in ('/index.html', '/rocola.html', '/rocola', '/visor'):
    assert cliente.get(ruta).content == portada.content, ruta
assert cliente.get('/health').json() == {'status': 'online', 'version': version}
doc = cliente.get('/openapi.json').json()
assert doc['info']['version'] == version
assert '/api/visor/archivo' in doc['paths']
assert cliente.get('/api/goes').json()['image_url'].startswith('https://cdn.star.nesdis.noaa.gov/GOES19/ABI/SECTOR/nsa/')
for ruta in ('/api/canciones', '/datos/pixeles.json', '/datos/partituras.json', '/audio-a-imagen.html'):
    assert cliente.get(ruta).status_code == 404, ruta
print('OK portada en la raíz, versión y API actual')

catalogo = cliente.get('/datos/paquetes/catalogo.json').json()
assert len(catalogo['paquetes']) == 9
for entrada in catalogo['paquetes']:
    paquete = cliente.get('/' + entrada['manifiesto']).json()
    principal = next(m for m in paquete['medios'] if m['id'] == paquete['medio_inicial'])
    assert principal['tipo'] == 'imagen' and principal.get('copia_local'), principal['id']
    for medio in paquete['medios']:
        for archivo in [medio, *medio.get('variantes', [])]:
            assert not archivo['url'].lower().endswith(('.mp3', '.wav'))
            if archivo.get('copia_local'):
                resultado = cliente.get('/' + archivo['copia_local'], headers={'Range': 'bytes=0-15'})
                assert resultado.status_code == 206, archivo['copia_local']
                assert resultado.headers['content-type'].startswith('image/'), archivo['copia_local']
print('OK nueve imágenes originales y respuestas de archivos parciales')

imagen = BytesIO()
Image.new('RGB', (8, 6), color=(48, 150, 202)).save(imagen, format='PNG')
respuesta = cliente.post('/api/visor/archivo', files={'archivo': ('prueba.png', imagen.getvalue(), 'image/png')})
assert respuesta.status_code == 200 and respuesta.content[:8] == b'\x89PNG\r\n\x1a\n'
assert Image.open(BytesIO(respuesta.content)).getpixel((4, 3))[:3] == (48, 150, 202)
print('OK normalización de imágenes')
