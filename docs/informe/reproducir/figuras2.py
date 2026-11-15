import json, base64, sys, math
from pathlib import Path
import numpy as np, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, FancyBboxPatch, FancyArrowPatch, Circle
from PIL import Image, ImageOps
R = Path(sys.argv[1]); OUT = R/'docs/informe'; MARCA = OUT/'marca'; MARCA.mkdir(parents=True, exist_ok=True)
imgs = json.loads(Path('imagenes.json').read_text()); D = json.loads(Path('datos5669.json').read_text())
C = {'R':'#e34948','G':'#0ca30c','B':'#3987e5'}; INK='#0b0b0b'; INK2='#52514e'
FONDO='#0b1020'; TXT='#f0efec'; TXT2='#c3c2b7'
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':11})
def guardar(f, n, fondo='white'): f.savefig(OUT/n, dpi=140, bbox_inches='tight', facecolor=fondo); plt.close(f); print(n)
def grid(svs, lado): it=next(i for i in imgs if i['svs']==svs); return np.frombuffer(base64.b64decode(it['grids'][str(lado)]),np.uint8).reshape(lado,lado,4)
def original(svs): it=next(i for i in imgs if i['svs']==svs); return Image.open(R/it['archivo']).convert('RGB')
NOTAS=['Do','Do♯','Re','Re♯','Mi','Fa','Fa♯','Sol','Sol♯','La','La♯','Si']
def nombre(m): return f"{NOTAS[m%12]}{m//12-1}"
def hz(c, v):
    mn,mx=[(20,250),(350,500),(600,20000)][c]
    return 0 if v==0 else mn*(mx/mn)**((v-1)/254)
def midi(f): return round(69+12*math.log2(f/440))

# ---- logos: variantes transparentes para modo claro y oscuro
def variante(src, dst, invertir_fuente, color):
    im=Image.open(src).convert('L'); a=np.asarray(im).astype(float)
    alfa = a if invertir_fuente else 255-a
    alfa = np.clip((alfa-20)*1.12,0,255).astype(np.uint8)
    rgba=np.zeros((*a.shape,4),np.uint8); rgba[...,:3]=color; rgba[...,3]=alfa
    out=Image.fromarray(rgba); out=out.crop(out.getbbox()); out.save(MARCA/dst); return out
for nom, inv in [('logo-orbita-sonora',False),('logo-orbidata-analytics',False),('logo-semillero-itm',True)]:
    variante(R/f'docs/img/{nom}.png', f'{nom}-negro.png', inv, (11,11,11))
    variante(R/f'docs/img/{nom}.png', f'{nom}-blanco.png', inv, (240,239,236))
print('logos')

# ---- banner
rng=np.random.default_rng(7)
f=plt.figure(figsize=(16,6.2)); f.patch.set_facecolor(FONDO)
ax=f.add_axes([0,0,1,1]); ax.set_xlim(0,16); ax.set_ylim(0,6.2); ax.axis('off'); ax.set_facecolor(FONDO)
for _ in range(260):
    ax.plot(rng.uniform(0,16),rng.uniform(0,6.2),'o',ms=rng.uniform(.3,2.2),color='white',alpha=rng.uniform(.15,.8))
logo=Image.open(MARCA/'logo-orbita-sonora-blanco.png'); w,h=logo.size; lh=2.0; lw=lh*w/h
ax.imshow(logo,extent=(8-lw/2,8+lw/2,3.85,3.85+lh),zorder=5)
ax.text(8,3.45,'Escucha las imágenes de la Tierra  ·  convierte color en música y partitura',ha='center',color=TXT2,fontsize=15)
# imagen real
im=original(5669).resize((480,270)); ax.imshow(im,extent=(0.7,4.3,0.55,2.6),zorder=4)
ax.add_patch(Rectangle((0.7,0.55),3.6,2.05,fill=False,ec='#ffffff55',lw=1.2,zorder=5))
ax.text(2.5,0.25,'imagen satelital (NASA SVS 5669)',ha='center',color=TXT2,fontsize=9.5)
# ondas RGB reales (recorrido Hilbert)
son=np.array(D['hilbert']['sonoras']).reshape(-1,3); t=np.linspace(5.0,10.6,len(son))
for k,c in enumerate('RGB'):
    y=son[:,k]/255; base=2.15-k*0.62
    ys=np.convolve(y,np.ones(9)/9,'same')
    ax.fill_between(t,base,base+ys*0.5,color=C[c],alpha=.85,lw=0,zorder=4)
    ax.text(4.85,base+.12,c,color=C[c],fontsize=14,fontweight='bold',ha='right')
ax.text(7.8,0.25,'tres voces: rojo = graves · verde = medios · azul = agudos',ha='center',color=TXT2,fontsize=9.5)
for x0 in (4.45,10.8): ax.annotate('',xy=(x0+.45,1.55),xytext=(x0,1.55),arrowprops=dict(arrowstyle='-|>',color='#ffffffaa',lw=2))
# mini partitura (piano roll) real
p=D['hilbert']; u=p['unidad']; dur=p['duracion']
for k,c in enumerate('RGB'):
    for ini,d,n,v,_ in p['pistas'][k]:
        x=11.4+ini*u/dur*3.9; y=0.6+(n-38)/36*2.0
        ax.add_patch(Rectangle((x,y),max(.03,d*u/dur*3.9*.9),.07,color=C[c],alpha=.45+.55*v,lw=0,zorder=4))
for l in range(5): ax.plot([11.4,15.3],[0.6+l*0.5]*2,color='#ffffff22',lw=.8,zorder=3)
ax.text(13.35,0.25,'arreglo para tres guitarras',ha='center',color=TXT2,fontsize=9.5)
guardar(f,'banner.png',FONDO)

# ---- paso a paso para niños
g32=grid(5669,32); g16=grid(5669,16)
f,axs=plt.subplots(1,6,figsize=(20,4.3)); f.subplots_adjust(wspace=.28); f.patch.set_facecolor('white')
tit=['1 · Elegimos\nuna imagen','2 · La partimos en\ncuadritos (32 × 32)','3 · Un lápiz la\nrecorre en orden','4 · Cada cuadrito\nescucha a sus vecinos','5 · Cada color se vuelve\nun sonido','6 · Nace una canción\ny su partitura']
for a,tt in zip(axs,tit): a.set_title(tt,fontsize=12.5,fontweight='bold',color=INK,pad=10); a.set_xticks([]); a.set_yticks([])
axs[0].imshow(original(5669),aspect='auto')
for a in axs: a.set_box_aspect(1)
axs[1].imshow(g32[...,:3],interpolation='nearest')
for i in range(33): axs[1].axhline(i-.5,color='white',lw=.35); axs[1].axvline(i-.5,color='white',lw=.35)
axs[2].imshow(g16[...,:3],interpolation='nearest',alpha=.55)
def hil(i,n):
    x=y=0; t=i; s=1
    while s<n:
        rx=1&(t>>1); ry=1&(t^rx)
        if not ry:
            if rx: x,y=s-1-x,s-1-y
            x,y=y,x
        x+=s*rx; y+=s*ry; t>>=2; s*=2
    return x,y
pts=np.array([hil(i,16) for i in range(256)]); axs[2].plot(pts[:,0],pts[:,1],color='#ffffff',lw=2.6); axs[2].plot(pts[:,0],pts[:,1],color=INK,lw=1.3)
axs[2].plot(*pts[0],'o',color='#eb6834',ms=9)
# vecinos
cx,cy=20,14; zona=g32[cy-2:cy+3,cx-2:cx+3,:3]
axs[3].imshow(zona,interpolation='nearest')
axs[3].add_patch(Rectangle((1.5,1.5),1,1,fill=False,ec='white',lw=4)); axs[3].add_patch(Rectangle((1.5,1.5),1,1,fill=False,ec=INK,lw=2))
axs[3].text(2,2,'70%',ha='center',va='center',color='white',fontsize=9,fontweight='bold')
axs[3].text(2,0.0,'vecinos 30 %',ha='center',va='center',color='white',fontsize=11,fontweight='bold')
# colores a sonidos
idx=cy*32+cx; rgb=D['filas']['sonoras'][3*idx:3*idx+3]
axs[4].set_xlim(0,3); axs[4].set_ylim(0,290)
for k,c in enumerate('RGB'):
    axs[4].bar(k+.5,rgb[k],.62,color=C[c]); f0=hz(k,rgb[k])
    axs[4].text(k+.5,rgb[k]+8,f"{f0:.0f} Hz",ha='center',fontsize=10,color=INK)
    axs[4].text(k+.5,-28,['graves','medios','agudos'][k],ha='center',fontsize=10,color=C[c],fontweight='bold')
axs[4].spines[['top','right','left']].set_visible(False)
axs[4].text(1.5,270,f"cuadrito RGB = {tuple(rgb)}",ha='center',fontsize=9.5,color=INK2)
u=p['unidad']
for k,c in enumerate('RGB'):
    for ini,d,n,v,_ in p['pistas'][k][:40]:
        axs[5].add_patch(Rectangle((ini*u,n-.45),d*u*.9,.9,color=C[c],alpha=.45+.55*v,lw=0))
axs[5].set_xlim(0,10.5); axs[5].set_ylim(38,72); axs[5].set_xlabel('primeros 10 segundos',fontsize=9.5,color=INK2)
for l in range(40,72,4): axs[5].axhline(l,color='#e4e3df',lw=.6,zorder=0)
for a in axs: [s.set_color('#e4e3df') for s in a.spines.values()]
guardar(f,'fig_a_paso_a_paso.png')

# ---- de un píxel a tres notas (con números reales)
prop=D['filas']['propias'][3*idx:3*idx+3]
f=plt.figure(figsize=(15,4.3)); ax=f.add_axes([0,0,1,1]); ax.set_xlim(0,15); ax.set_ylim(0,4.3); ax.axis('off')
def caja(x,y,w,h,col='#f6f6f4'): ax.add_patch(FancyBboxPatch((x,y),w,h,boxstyle='round,pad=0.02,rounding_size=0.15',fc=col,ec='#d8d7d2',lw=1))
caja(.2,.3,3.0,3.7); ax.imshow(zona,extent=(.55,2.85,1.1,3.4),interpolation='nearest',zorder=3,aspect='auto')
ax.add_patch(Rectangle((.55+2*.46,1.1+2*.46),.46,.46,fill=False,ec='white',lw=3,zorder=4))
ax.text(1.7,.65,f'cuadrito ({cx+1}, {cy+1}) y sus 24 vecinos',ha='center',fontsize=10,color=INK2)
ax.text(1.7,3.65,'A. Mirar la zona 5 × 5',ha='center',fontsize=12,fontweight='bold')
caja(3.6,.3,3.6,3.7); ax.text(5.4,3.65,'B. Mezclar 70 % + 30 %',ha='center',fontsize=12,fontweight='bold')
for j,(lab,val) in enumerate([('propio',prop),('después de mezclar',rgb)]):
    y=2.55-j*1.2; ax.add_patch(Rectangle((3.85,y),.8,.8,color=np.array(val)/255)); ax.text(4.85,y+.52,lab,fontsize=10.5,color=INK2)
    ax.text(4.85,y+.15,f'R {val[0]}   G {val[1]}   B {val[2]}',fontsize=11,color=INK,family='DejaVu Sans Mono')
ax.text(5.4,.6,'así un punto suelto no "grita" solo',ha='center',fontsize=9.5,color=INK2,style='italic')
caja(7.6,.3,7.2,3.7); ax.text(11.2,3.65,'C. Cada color a su altura (modo píxeles RGB, escala log)',ha='center',fontsize=12,fontweight='bold')
for k,c in enumerate('RGB'):
    y=2.75-k*.95; f0=hz(k,rgb[k]); m=midi(f0) if f0 else None
    ax.add_patch(FancyBboxPatch((7.85,y-.05),1.0,.6,boxstyle='round,pad=0.02,rounding_size=0.12',fc=C[c],ec='none'))
    ax.text(8.35,y+.25,f'{c} = {rgb[k]}',ha='center',va='center',color='white',fontsize=11,fontweight='bold')
    ax.annotate('',xy=(9.55,y+.25),xytext=(8.95,y+.25),arrowprops=dict(arrowstyle='-|>',color=INK2,lw=1.5))
    ax.text(9.65,y+.25,f'{f0:,.0f} Hz'.replace(',','.'),va='center',fontsize=12,color=INK,fontweight='bold')
    ax.annotate('',xy=(11.45,y+.25),xytext=(10.85,y+.25),arrowprops=dict(arrowstyle='-|>',color=INK2,lw=1.5))
    ax.text(11.55,y+.25,f'nota MIDI {m} · {nombre(m)}',va='center',fontsize=12,color=INK)
    ax.text(14.6,y+.25,['grave','medio','agudo'][k],va='center',ha='right',fontsize=10.5,color=C[c],fontweight='bold')
for x0 in (3.25,7.25): ax.annotate('',xy=(x0+.3,2.1),xytext=(x0,2.1),arrowprops=dict(arrowstyle='-|>',color=INK,lw=2))
guardar(f,'fig_b_pixel_a_nota.png')
json.dump({'celda':[cx+1,cy+1],'propio':prop,'sonoro':rgb,'hz':[round(hz(k,rgb[k]),1) for k in range(3)],'midi':[midi(hz(k,rgb[k])) for k in range(3)],'nombres':[nombre(midi(hz(k,rgb[k]))) for k in range(3)]},open('pixel_ejemplo.json','w'))

# ---- recorrido sobre la imagen
f,axs=plt.subplots(1,3,figsize=(15,4.6))
for a,(nom,pp) in zip(axs,[('Líneas por filas',[(i%16,i//16) for i in range(256)]),('Serpentina',[((15-i%16) if (i//16)%2 else i%16,i//16) for i in range(256)]),('Curva de Hilbert',[hil(i,16) for i in range(256)])]):
    pp=np.array(pp); a.imshow(g16[...,:3],interpolation='nearest')
    for i in range(255): a.plot(pp[i:i+2,0],pp[i:i+2,1],color=plt.cm.plasma(i/255),lw=2.2)
    a.plot(*pp[0],'o',color='white',ms=10,mec=INK); a.set_title(nom,fontsize=13,fontweight='bold'); a.axis('off')
f.suptitle('El mismo dibujo, leído en tres órdenes distintos (inicio = círculo blanco; el color va de morado a amarillo)',fontsize=12,color=INK2,y=.02)
guardar(f,'fig_c_recorridos_sobre_imagen.png')

# ---- zonas sobre la imagen
f,axs=plt.subplots(2,4,figsize=(14,7.2))
for j,z in enumerate(['1','5','9','21']):
    zz=D['zonas'][z]; axs[0,j].imshow(np.array(zz['rgb'],np.uint8).reshape(32,32,3),interpolation='nearest')
    axs[0,j].set_title(f'Zona {z} × {z}',fontsize=13,fontweight='bold')
    cimg=np.array(zz['contraste']).reshape(32,32); axs[1,j].imshow(cimg,cmap='magma',vmin=0,vmax=80,interpolation='nearest')
    axs[1,j].set_title(f'contraste medio {cimg.mean():.1f}',fontsize=11,color=INK2)
    for a in axs[:,j]: a.axis('off')
axs[0,0].text(-3,16,'color que\nsuena',rotation=90,va='center',ha='center',fontsize=11,color=INK2)
axs[1,0].text(-3,16,'contraste\n(ritmo)',rotation=90,va='center',ha='center',fontsize=11,color=INK2)
guardar(f,'fig_d_zonas_sobre_imagen.png')

# ---- máscara 5533
g=grid(5533,32); val=np.array(D['mascara5533']).reshape(32,32)
f,axs=plt.subplots(1,3,figsize=(13,4.2))
axs[0].imshow(Image.open(R/'datos/paquetes/svs-5533/descargas/AirQuality_Sphere_1920x1080_0000.png').convert('RGBA')); axs[0].set_title('Original con fondo transparente',fontweight='bold')
chk=np.indices((32,32)).sum(0)%2; fondo=np.where(chk[...,None],[220,220,220],[245,245,245]).astype(np.uint8)
a=g[...,3:4]/255; comp=(g[...,:3]*a+fondo*(1-a)).astype(np.uint8); axs[1].imshow(comp,interpolation='nearest'); axs[1].set_title('Cuadrícula 32 × 32',fontweight='bold')
m=np.zeros((32,32,3)); m[val==1]=[0.1,0.64,0.47]; m[val==0]=[0.85,0.85,0.83]
axs[2].imshow(m,interpolation='nearest'); axs[2].set_title(f'Suenan {val.sum()} de 1024 cuadritos',fontweight='bold')
axs[2].text(16,34.5,'verde = suena · gris = silencio',ha='center',fontsize=10,color=INK2)
for x in axs: x.axis('off')
guardar(f,'fig_e_mascara.png')
