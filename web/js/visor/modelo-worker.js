import {clasificar} from './modelo-imagen.js';

self.onmessage = async ({data}) => {
    try {
        self.postMessage({clases: await clasificar(data)});
    } catch (error) {
        self.postMessage({error: error.message});
    }
};
