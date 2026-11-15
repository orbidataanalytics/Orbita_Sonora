let carga;

export function bibliotecaPartituras() {
    if (window.opensheetmusicdisplay) return Promise.resolve(window.opensheetmusicdisplay.OpenSheetMusicDisplay);
    carga ??= new Promise((resolver, rechazar) => {
        const script = document.createElement('script');
        script.src = new URL('../../vendor/opensheetmusicdisplay.min.js', import.meta.url).href;
        script.onload = () => resolver(window.opensheetmusicdisplay.OpenSheetMusicDisplay);
        script.onerror = () => {
            script.remove();
            carga = null;
            rechazar(new Error('El visor de partituras no pudo iniciar. Puedes descargar MusicXML.'));
        };
        document.head.append(script);
    });
    return carga;
}
