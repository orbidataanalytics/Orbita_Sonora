"""Prepara la entrega de Órbita Sonora en un clon de GitHub."""

import argparse
import json
from pathlib import Path
import shlex
import shutil
import subprocess


FUENTE = Path(__file__).resolve().parents[1]
VERSION = json.loads((FUENTE / "package.json").read_text(encoding="utf-8"))["version"]
VERSION_CORTA = ".".join(VERSION.split(".")[:2])
REPOSITORIO = "https://github.com/orbidataanalytics/OrbitaSonora.git"
CARPETAS = ("api", "datos", "docs", "pruebas", "scripts", "videos", "web")
ARCHIVOS = (
    ".gitignore", ".nojekyll", "ABRIR_ORBITA.bat", "PUBLICAR_EN_GITHUB.bat",
    "ARQUITECTURA.md", "LEER_PRIMERO.md", "LICENSE",
    "NOTICE", "PUBLICAR.md", "README.md", "index.html", "main.py", "package.json",
    "requirements-dev.txt", "requirements.txt", "rocola.html",
)
ARCHIVOS_ANTIGUOS = (
    "ARQUITECTURA_LEGADO.md", "README_LEGADO.md", "audio-a-imagen.html",
    "api/datos.py", "api/rutas/canciones.py", "api/rutas/informes.py",
    "api/rutas/parametros.py", "api/rutas/partituras.py", "api/servicios/__init__.py",
    "api/servicios/analisis.py", "api/servicios/informes.py", "api/servicios/partituras.py",
    "datos/pixeles.json", "datos/partituras.json",
    "datos/paquetes/svs-4950/descargas/GEDI_global_w_colorbar_1080p60.webm",
    "docs/ESTADO_API.md", "docs/img/01-catalogo.png", "docs/img/02-rgb-y-bandas.png",
    "docs/img/03-recorridos.png", "docs/img/04-firma-dinamica.png",
    "docs/img/05-repeticion-y-ocupacion.png", "docs/img/06-partituras.jpg",
    "docs/img/07-productos-del-informe.png", "docs/img/boceto-conceptual.png",
    "docs/img/fundamento-bandas.png", "scripts/crear_demostracion.py",
    "web/css/analisis.css", "web/css/informes.css", "web/css/partituras.css",
    "web/css/rocola.css", "web/js/app.js", "web/js/eventos.js", "web/js/imagenes.js",
    "web/js/informes.js", "web/js/notacion.js", "web/js/partituras.js", "web/js/reloj.js", "web/js/reproductor.js",
    "web/js/visor/reproductor-video.js", "web/js/visor/partitura-rgb.js",
) + tuple(
    f"imagenes_pixel/{pista}/{canal}.png"
    for pista in ("derezzed", "end-of-line", "the-son-of-flynn")
    for canal in ("RGB", "R", "G", "B")
)


def git(clon, *argumentos, leer=False):
    resultado = subprocess.run(
        ["git", "-C", str(clon), *argumentos], check=True, text=True,
        stdout=subprocess.PIPE if leer else None,
    )
    return resultado.stdout.strip() if leer else None


def verificar_clon(clon):
    raiz = Path(git(clon, "rev-parse", "--show-toplevel", leer=True)).resolve()
    origen = git(clon, "remote", "get-url", "origin", leer=True).lower().rstrip("/").removesuffix(".git")
    origenes = {
        REPOSITORIO.lower().removesuffix(".git"),
        "git@github.com:orbidataanalytics/orbitasonora",
        "ssh://git@github.com/orbidataanalytics/orbitasonora",
    }
    if raiz != clon or origen not in origenes:
        raise ValueError("El destino debe ser la raíz del clon de orbidataanalytics/OrbitaSonora.")
    if git(clon, "branch", "--show-current", leer=True) != "main":
        raise ValueError("Selecciona la rama main del repositorio.")


def abrir_clon(clon):
    if not clon.exists():
        clon.parent.mkdir(parents=True, exist_ok=True)
        git(clon.parent, "clone", "--branch", "main", REPOSITORIO, str(clon))
        return
    verificar_clon(clon)
    if git(clon, "status", "--porcelain", leer=True):
        raise ValueError("Usa un clon limpio en main o indica una carpeta nueva para conservar tus cambios locales.")
    git(clon, "fetch", "origin", "main")
    try:
        git(clon, "merge-base", "--is-ancestor", "HEAD", "FETCH_HEAD")
    except subprocess.CalledProcessError as error:
        raise ValueError("Esta copia tiene commits locales. Usa otra carpeta para preparar la entrega.") from error
    git(clon, "merge", "--ff-only", "FETCH_HEAD")


def incorporar_entrega(clon):
    archivos = [FUENTE / nombre for nombre in ARCHIVOS]
    for carpeta in CARPETAS:
        archivos.extend(p for p in sorted((FUENTE / carpeta).rglob("*")) if p.is_file()
                        and not p.is_symlink() and not {"__pycache__", ".DS_Store"}.intersection(p.parts))
    rutas = []
    for archivo in archivos:
        ruta = archivo.relative_to(FUENTE)
        destino = clon / ruta
        if not destino.resolve().is_relative_to(clon):
            raise ValueError(f"El destino de {ruta} está fuera del repositorio.")
        if ruta.parts[0] == "videos" and destino.exists() and ruta.as_posix() != "videos/README.md":
            continue
        destino.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(archivo, destino)
        rutas.append(ruta.as_posix())
    git(clon, "rm", "-q", "--ignore-unmatch", "--", *ARCHIVOS_ANTIGUOS)
    git(clon, "add", "--", *rutas)


def entrega_preparada(clon):
    if not clon.exists():
        return False
    verificar_clon(clon)
    try:
        return all(
            git(clon, "show", f":{nombre}", leer=True) == (FUENTE / nombre).read_text(encoding="utf-8").strip()
            for nombre in ("package.json", "index.html", "web/muestras/catalogo.json")
        )
    except subprocess.CalledProcessError:
        return False


def publicar(clon):
    comando = ["gh", "auth"]
    sesion = subprocess.run([*comando, "status", "-h", "github.com"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if sesion.returncode:
        subprocess.run([*comando, "login", "-h", "github.com", "-p", "https", "-w"], check=True)
    subprocess.run([*comando, "setup-git", "-h", "github.com"], check=True)
    dif = subprocess.run(["git", "-C", str(clon), "diff", "--cached", "--quiet"])
    if dif.returncode == 1:
        git(clon, "commit", "-m", f"Publicar Órbita Sonora {VERSION_CORTA}")
    else:
        dif.check_returncode()
    git(clon, "push", "origin", "main")
    print("Actualización enviada. Revisa https://github.com/orbidataanalytics/OrbitaSonora/actions")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    carpeta = "OrbitaSonora_GitHub_" + VERSION_CORTA.replace(".", "_")
    parser.add_argument("clon", type=Path, nargs="?", default=FUENTE.parent / carpeta,
                        help=f"Ruta del clon limpio o de una carpeta nueva. Por defecto usa {carpeta}.")
    parser.add_argument("--publicar", action="store_true", help="Hace el commit y envía la entrega a main.")
    args = parser.parse_args()
    clon = args.clon.expanduser().resolve()
    if clon.is_relative_to(FUENTE) or FUENTE.is_relative_to(clon):
        parser.error("Indica una carpeta separada de donde extrajiste el ZIP.")
    try:
        if not args.publicar or not entrega_preparada(clon):
            abrir_clon(clon)
            incorporar_entrega(clon)
        if args.publicar:
            publicar(clon)
            return
        git(clon, "diff", "--cached", "--stat")
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"{error}\n")
    print(f"Entrega preparada en {clon}")
    print(f"cd {shlex.quote(str(clon))}")
    print(f'git commit -m "Publicar Órbita Sonora {VERSION_CORTA}"')
    print("gh auth login --hostname github.com --git-protocol https --web")
    print("gh auth setup-git --hostname github.com")
    print("git push origin main")


if __name__ == "__main__":
    main()
