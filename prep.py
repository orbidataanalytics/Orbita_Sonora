import json, base64, sys
from pathlib import Path
from PIL import Image
R = Path(sys.argv[1])
cat = json.loads((R/'datos/paquetes/catalogo.json').read_text())
out = []
for e in cat['paquetes']:
    p = json.loads((R/e['manifiesto']).read_text())
    m = next(m for m in p['medios'] if m['id']==p['medio_inicial'])
    img = Image.open(R/m['copia_local']).convert('RGBA')
    item = {'svs': p.get('svs_id'), 'titulo': p['titulo'], 'archivo': m['copia_local'], 'ancho': img.width, 'alto': img.height, 'grids': {}}
    for lado in (8,16,32,64,128):
        im = img.resize((lado,lado), Image.Resampling.BILINEAR, reducing_gap=None)
        item['grids'][lado] = base64.b64encode(im.tobytes()).decode()
    out.append(item)
Path('imagenes.json').write_text(json.dumps(out))
for o in out: print(o['svs'], o['ancho'], o['alto'], o['titulo'][:70])
