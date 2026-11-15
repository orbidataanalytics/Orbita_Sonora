import json, base64, sys
from pathlib import Path
import numpy as np, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
from PIL import Image
from scipy.signal import spectrogram
R = Path(sys.argv[1]); OUT = R/'docs/informe'; OUT.mkdir(parents=True, exist_ok=True)
res = json.loads(Path('resultados.json').read_text()); imgs = json.loads(Path('imagenes.json').read_text())
C = {'R':'#e34948','G':'#008300','B':'#2a78d6'}; INK='#0b0b0b'; INK2='#52514e'; GRID='#e4e3df'; S1='#2a78d6'; S2='#eb6834'; S3='#1baf7a'
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'axes.edgecolor':GRID,'axes.labelcolor':INK2,'xtick.color':INK2,'ytick.color':INK2,
  'axes.spines.top':False,'axes.spines.right':False,'axes.grid':True,'grid.color':GRID,'grid.linewidth':.6,'axes.axisbelow':True,'figure.facecolor':'white','axes.titlecolor':INK,'axes.titlesize':11,'axes.titleweight':'bold'})
def guardar(f, n): f.savefig(OUT/n, dpi=140, bbox_inches='tight'); plt.close(f); print(n)

# 1 catálogo
f, ax = plt.subplots(3, 3, figsize=(11, 6.6))
for a, it in zip(ax.flat, imgs):
    im = Image.open(R/'datos/paquetes'/f"svs-{it['svs']}"/'portada.jpg'); a.imshow(im); a.set_axis_off()
    a.set_title(f"SVS {it['svs']} · {it['ancho']}×{it['alto']} px", fontsize=9, fontweight='normal', color=INK2)
f.suptitle('Catálogo incluido: nueve visualizaciones de NASA SVS (portadas locales)', fontweight='bold', color=INK)
guardar(f, 'fig01_catalogo.png')

# 2 pipeline de análisis espectral RGB sobre SVS 5313
it = next(i for i in imgs if i['svs']==5313)
g = np.frombuffer(base64.b64decode(it['grids']['32']), np.uint8).reshape(32,32,4)
d = json.loads(Path('rgb_5313.json').read_text()); z5 = np.array(d['zona5'],np.uint8).reshape(-1,3); con = np.array(d['contraste'])
# secuencia está en orden de 'filas' = orden raster, así que reshape directo
f, ax = plt.subplots(1, 7, figsize=(16, 3.0), gridspec_kw={'width_ratios':[2.6,1,1,1,1,1,1]})
ax[0].imshow(Image.open(R/it['archivo'])); ax[0].set_title('a) Original 1024×288')
ax[1].imshow(g[...,:3], interpolation='nearest'); ax[1].set_title('b) 32×32')
for k,(c,cm) in enumerate(zip('RGB',['Reds','Greens','Blues'])):
    ax[2+k].imshow(g[...,k], cmap=cm, vmin=0, vmax=max(1,int(g[...,k].max())), interpolation='nearest'); ax[2+k].set_title(f'{"cde"[k]}) Canal {c}')
ax[5].imshow(z5.reshape(32,32,3), interpolation='nearest'); ax[5].set_title('f) Zona 5×5')
ax[6].imshow(con.reshape(32,32), cmap='Greys', interpolation='nearest'); ax[6].set_title('g) Contraste')
for a in ax: a.set_axis_off()
f.suptitle('Del píxel a la señal: descomposición RGB, media zonal y contraste (SVS 5313, luces nocturnas)', fontweight='bold', y=1.04)
guardar(f, 'fig02_descomposicion_rgb.png')

# 3 recorridos
sys.path.insert(0,'.')
def hil(i, n):
    x=y=0; t=i; s=1
    while s<n:
        rx=1&(t>>1); ry=1&(t^rx)
        if not ry:
            if rx: x,y=s-1-x,s-1-y
            x,y=y,x
        x+=s*rx; y+=s*ry; t>>=2; s*=2
    return x,y
def rec(n, k):
    if k=='hilbert': return [hil(i,n) for i in range(n*n)]
    if k=='radial':
        c=(n-1)/2; p=[(x,y) for y in range(n) for x in range(n)]
        return sorted(p, key=lambda q:((q[0]-c)**2+(q[1]-c)**2, (np.arctan2(q[1]-c,q[0]-c)+2*np.pi)%(2*np.pi)))
    if k=='zigzag':
        p=[]
        for dd in range(2*n-1):
            a0=max(0,dd-n+1); b0=min(dd,n-1)
            for kk in range(a0,b0+1):
                x=kk if dd%2 else a0+b0-kk; p.append((x,dd-x))
        return p
    return [((n-1-(i%n)) if (k=='serpentina' and (i//n)%2) else i%n, i//n) for i in range(n*n)]
nombres={'filas':'Líneas por filas','serpentina':'Serpentina','hilbert':'Curva de Hilbert','radial':'Radial','zigzag':'Zigzag diagonal'}
f, ax = plt.subplots(1,5, figsize=(15,3.3))
for a,k in zip(ax,nombres):
    p=np.array(rec(16,k)); 
    for i in range(len(p)-1): a.plot(p[i:i+2,0],p[i:i+2,1],color=plt.cm.viridis(i/len(p)),lw=1.6)
    a.plot(*p[0],'o',color=INK,ms=5); a.set_xlim(-.7,15.7); a.set_ylim(15.7,-.7); a.set_aspect('equal'); a.set_xticks([]); a.set_yticks([]); a.grid(False)
    r=res['recorridos'][k]; a.set_title(nombres[k]); a.set_xlabel(f"paso medio {r['paso_medio']:.2f} celdas\n{r['pct_unitarios']} % pasos unitarios", fontsize=8.5)
f.suptitle('Recorridos de lectura (16×16; color = orden temporal, punto negro = inicio; métricas medidas en 32×32)', fontweight='bold', y=1.03)
guardar(f, 'fig03_recorridos.png')

# 4 localidad: Δ brillo y autocorrelación por recorrido (dos paneles, sin doble eje)
ks=list(nombres); f, ax = plt.subplots(1,2, figsize=(12,3.6)); f.subplots_adjust(wspace=.45)
m=[res['recorridos'][k]['delta_brillo_media'] for k in ks]; s=[res['recorridos'][k]['delta_brillo_sd'] for k in ks]
ax[0].barh([nombres[k] for k in ks], m, xerr=s, color=S1, height=.55, error_kw={'ecolor':INK2,'lw':1}); ax[0].invert_yaxis()
ax[0].set_title('|Δ brillo| entre celdas consecutivas\n(menor = lectura más suave)'); ax[0].set_xlabel('niveles de 0–255 (media ± DE, 9 imágenes)')
for y,v in enumerate(m): ax[0].text(v+s[y]+.4, y, f'{v:.2f}', va='center', fontsize=9, color=INK)
m=[res['recorridos'][k]['autocorr_media'] for k in ks]; s=[res['recorridos'][k]['autocorr_sd'] for k in ks]
ax[1].barh([nombres[k] for k in ks], m, xerr=s, color=S3, height=.55, error_kw={'ecolor':INK2,'lw':1}); ax[1].invert_yaxis(); ax[1].set_xlim(0,1.08)
ax[1].set_title('Autocorrelación de brillo, retardo 1\n(mayor = más coherente)'); ax[1].set_xlabel('ρ(1) (media ± DE, 9 imágenes)')
for y,v in enumerate(m): ax[1].text(min(v+s[y]+.02,1.0), y, f'{v:.3f}', va='center', fontsize=9, color=INK)
guardar(f, 'fig04_localidad_recorridos.png')

# 5 curvas intensidad→frecuencia
f, ax = plt.subplots(1,2, figsize=(11,3.6), sharey=True)
for a, esc in zip(ax, ['logaritmica','lineal']):
    for k,c in enumerate('RGB'):
        t=np.array(res['escalas'][esc][k]); a.plot(np.arange(1,256), t[1:], color=C[c], lw=2, label=f"{c}: {res['bandas'][k]['min_hz']}–{res['bandas'][k]['max_hz']} Hz")
    a.set_yscale('log'); a.set_xlabel('intensidad del canal (1–255; 0 = silencio)'); a.set_title('Escala '+('logarítmica (por defecto)' if esc=='logaritmica' else 'lineal'))
ax[0].set_ylabel('frecuencia (Hz, eje log)'); ax[0].legend(frameon=False, fontsize=9)
guardar(f, 'fig05_mapeo_frecuencia.png')

# 6 piano roll del arreglo SVS 5313 (filas)
n = json.loads(Path('notas_5313_filas.json').read_text()); u=n['unidad']
f, ax = plt.subplots(figsize=(13,4))
nombres_ac=[]
for i,(d0,d1,nom) in enumerate(n['armonia']):
    ax.axvspan(d0*u, d1*u, color='#f3f2ef' if i%2 else 'white', zorder=0); ax.text((d0+d1)/2*u, 73.3, nom, ha='center', fontsize=7.5, color=INK2)
for k,c in enumerate('RGB'):
    for ini,dur,nota,vel in n['pistas'][k]:
        ax.add_patch(Rectangle((ini*u, nota-.4), dur*u*.94, .8, color=C[c], alpha=.35+.65*vel, lw=0))
    ax.plot([],[],'s',color=C[c],label={'R':'R · bajos (guitarra 1)','G':'G · pulgar + melodía (guitarra 2)','B':'B · agudos (guitarra 3)'}[c])
ax.set_xlim(0,n['duracion']); ax.set_ylim(38,74.5); ax.set_xlabel('tiempo (s)'); ax.set_ylabel('nota MIDI (60 = Do4)')
ax.set_title('Arreglo generado para SVS 5313 · 32×32 · líneas por filas · Do mayor · 68 negras/min · franjas = acordes por zona'); ax.legend(frameon=False, ncol=3, loc='lower center', bbox_to_anchor=(.5,-.32))
guardar(f, 'fig06_piano_roll.png')

# 7 espectrogramas filas vs hilbert
f, ax = plt.subplots(1,2, figsize=(13,3.8), sharey=True)
for a, r in zip(ax, ['filas','hilbert']):
    x=np.fromfile(f'audio_5313_{r}.f32', np.float32); fr, t, S = spectrogram(x, 48000, nperseg=4096, noverlap=3072)
    a.pcolormesh(t, fr, 10*np.log10(S+1e-12), shading='auto', cmap='magma', vmin=-120, vmax=-50); a.set_ylim(40, 2500); a.set_yscale('log'); a.grid(False)
    a.set_title(f"Espectrograma del WAV renderizado · {nombres[r]}"); a.set_xlabel('tiempo (s)')
    cen = (fr[:,None]*S).sum(0)/(S.sum(0)+1e-20); a.plot(t, cen, color='white', lw=1, alpha=.8)
ax[0].set_ylabel('frecuencia (Hz, log)')
guardar(f, 'fig07_espectrogramas.png')

# 8 zona sonora: contraste y subdivisión (dos paneles)
zs=res['zonas']; xs=[f"{z['zona']}×{z['zona']}" for z in zs]
f, ax = plt.subplots(1,2, figsize=(11,3.3))
ax[0].plot(xs,[z['contraste'] for z in zs],'-o',color=S1,lw=2,ms=6); ax[0].set_title('Contraste local medio vs. tamaño de zona'); ax[0].set_ylabel('contraste (0–255)')
ax[1].plot(xs,[z['pct_subdiv_G'] for z in zs],'-o',color=S2,lw=2,ms=6); ax[1].set_title('% de pulsos subdivididos (pista G)'); ax[1].set_ylabel('%'); ax[1].set_ylim(0,100)
for a in ax: a.set_xlabel('zona sonora (media de 9 imágenes, 32×32)')
guardar(f, 'fig08_zona_sonora.png')

# 9 rendimiento
rd=res['rendimiento']; xs=[f"{r['lado']}²" for r in rd]
f, ax = plt.subplots(1,2, figsize=(11,3.3))
w=.38; xi=np.arange(len(rd))
ax[0].bar(xi-w/2,[r['secuencia_ms'] for r in rd],w,color=S1,label='SecuenciaSonora'); ax[0].bar(xi+w/2,[r['arreglo_ms'] for r in rd],w,color=S2,label='ArregloMusical')
ax[0].set_xticks(xi,xs); ax[0].set_yscale('log'); ax[0].set_ylabel('ms (mediana, eje log)'); ax[0].set_title('Análisis + composición'); ax[0].legend(frameon=False)
ax[1].bar(xi,[r['audio_ms'] for r in rd],.55,color=S3); ax[1].set_xticks(xi,xs); ax[1].set_ylabel('ms'); ax[1].set_title('Síntesis del WAV estéreo de ~24,7 s a 48 kHz')
for a in ax: a.set_xlabel('celdas de la cuadrícula')
guardar(f, 'fig09_rendimiento.png')

# 10 acordes y notas por canal
f, ax = plt.subplots(1,2, figsize=(12,3.5), gridspec_kw={'width_ratios':[1,1.6]})
ac=res['acordes']; orden=['Do','Rem','Mim','Fa','Sol','Lam']
ax[0].bar(orden,[ac.get(o,0) for o in orden],color=S1,width=.6); ax[0].set_title('Acordes elegidos por color (9 imágenes)'); ax[0].set_ylabel('zonas armónicas')
ims=res['imagenes']; xi=np.arange(len(ims)); w=.27
for k,c in enumerate('RGB'): ax[1].bar(xi+(k-1)*w,[i['pistas'][k]['notas'] for i in ims],w*.92,color=C[c],label=c)
ax[1].set_xticks(xi,[str(i['svs']) for i in ims],fontsize=8.5); ax[1].set_xlabel('paquete SVS'); ax[1].set_ylabel('notas'); ax[1].set_title('Notas por pista y por imagen'); ax[1].set_ylim(0,63); ax[1].legend(frameon=False,ncol=3,loc='upper left')
guardar(f, 'fig10_acordes_notas.png')
