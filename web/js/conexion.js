const configurada=document.querySelector('meta[name="orbita-api-base"]')?.content || 'https://orbitasonora.onrender.com';
export const API_BASE=(['localhost','127.0.0.1'].includes(location.hostname)||location.hostname.endsWith('.onrender.com'))?location.origin:configurada;
