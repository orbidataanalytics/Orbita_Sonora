# Comprobación de despliegue y ejemplos

Revisión de la documentación realizada el 1 de noviembre de 2026, con fecha de referencia de Colombia.

## 1 Web y API

| Consulta | Resultado observado |
|---|---|
| `https://orbidataanalytics.github.io/OrbitaSonora/` | HTTP 200, estructura web modular |
| `https://orbitasonora.onrender.com/` | HTTP 200, JSON de servidor activo |
| `/api/datos` en la API correcta | HTTP 200 |
| `/api/canciones` | HTTP 200, tres pistas, grilla 64 × 64 |
| `/api/goes` | HTTP 200, enlace y etiqueta GOES-16 de la configuración inicial |
| `/openapi.json` | HTTP 200, versión 3.0.0 y rutas de sistema, canciones, partituras e informes |
| `/api/analisis/end-of-line` | HTTP 200 |
| `/api/partituras/end-of-line` | HTTP 200 |
| `https://orbita-sonora.onrender.com/` con guion | HTTP 404 en la revisión |

Estos resultados describen la revisión, no un monitor continuo de disponibilidad.

## 2 Parámetro niveles

Se observó una respuesta HTTP 422 al consultar el informe pasando explícitamente `niveles=8`. Los ejemplos del README utilizan el valor predeterminado de ocho niveles omitiendo ese parámetro.

En el código del paquete, `niveles` se declara como `Literal[4, 8, 16]`. Conviene revisar la conversión del parámetro de consulta en el entorno desplegado: una cadena HTTP `8` puede fallar al validarse como literal entero.

Una corrección de implementación consiste en declarar el parámetro como entero, convertirlo mediante FastAPI y validar después que pertenezca a `{4, 8, 16}`. Se debe aplicar de forma consistente a la ruta del informe y al servicio expuesto de ocupación. Esta entrega documenta el comportamiento; no cambia esos módulos de la aplicación.

La selección de 4, 8 o 16 niveles de la interfaz web calcula los grupos localmente y tiene un recorrido de ejecución distinto de ese parámetro remoto.

## 3 Fuente GOES

La respuesta `/api/goes` conserva un enlace al directorio GOES-16. NOAA identifica a GOES-19 como GOES-East operativo desde abril de 2025. Antes de anunciar un fondo como imagen actual, verifica el satélite, el tiempo de adquisición y la URL efectiva del producto.

Referencia oficial https://www.nesdis.noaa.gov/news/noaas-goes-19-now-operational-goes-east-providing-critical-new-data-forecasters
