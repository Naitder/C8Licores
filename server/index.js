import { CONFIG } from './src/config.js';
import { inicializarBaseDatos } from './src/db/inicializar.js';
import { crearApp } from './src/app.js';

const db = inicializarBaseDatos(CONFIG);
const app = crearApp({ db, config: CONFIG });

const servidor = app.listen(CONFIG.PUERTO, () => {
    console.log(`C8Licores escuchando en http://localhost:${CONFIG.PUERTO}`);
});

for (const senal of ['SIGINT', 'SIGTERM']) {
    process.on(senal, () => {
        servidor.close(() => {
            db.close();
            process.exit(0);
        });
    });
}
