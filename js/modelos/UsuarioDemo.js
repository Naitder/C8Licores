import { Usuario } from './Usuario.js';

/**
 * Subclase con el usuario administrador de demostración
 * (antes era la constante USUARIO_DEMO de user.js).
 */
export class UsuarioDemo extends Usuario {
    constructor() {
        super({ email: 'admin@barrilete.com', password: '123456', name: 'Admin' });
    }

    get esDemo() { return true; }
}
