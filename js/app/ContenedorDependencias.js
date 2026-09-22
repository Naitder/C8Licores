import { AlmacenamientoLocal } from '../core/AlmacenamientoLocal.js';
import { Navegador } from '../core/Navegador.js';
import { FuenteDatosJSON } from '../core/FuenteDatosJSON.js';
import { RepositorioLectura } from '../core/RepositorioLectura.js';
import { FormateadorPrecio } from '../core/FormateadorPrecio.js';
import { Producto } from '../modelos/Producto.js';
import { Diapositiva } from '../modelos/Diapositiva.js';
import { CarritoServicio } from '../servicios/CarritoServicio.js';
import { SesionServicio } from '../servicios/SesionServicio.js';
import { UsuarioRepositorio } from '../servicios/UsuarioRepositorio.js';
import { AutenticacionServicio } from '../servicios/AutenticacionServicio.js';
import { FiltroServicio } from '../servicios/FiltroServicio.js';
import { BusquedaSimilitud } from '../busqueda/BusquedaSimilitud.js';
import { Validador } from '../validacion/Validador.js';
import { ReglaLongitudMinima } from '../validacion/ReglaLongitudMinima.js';
import { ReglaCamposIguales } from '../validacion/ReglaCamposIguales.js';
import { ReglaEmailDisponible } from '../validacion/ReglaEmailDisponible.js';
import { FUENTES, PARAMETROS } from '../config/Configuracion.js';

/**
 * Raíz de composición: el ÚNICO lugar donde se decide qué implementación
 * concreta usa cada clase (Inversión de dependencias).
 * Para usar, por ejemplo, una API en lugar de los JSON, solo se cambia aquí.
 *
 * Se comparte una sola instancia (Singleton) para que la aplicación y los
 * módulos de compatibilidad trabajen sobre el mismo carrito y la misma sesión.
 */
export class ContenedorDependencias {
    static #instancia = null;

    static obtener() {
        ContenedorDependencias.#instancia ??= new ContenedorDependencias();
        return ContenedorDependencias.#instancia;
    }

    /** Solo para pruebas: permite inyectar un contenedor preparado. */
    static establecer(contenedor) {
        ContenedorDependencias.#instancia = contenedor;
    }

    constructor({
        almacenamiento = new AlmacenamientoLocal(),
        navegador = new Navegador(),
        documento = globalThis.document,
        fuenteCatalogo = new FuenteDatosJSON(FUENTES.CATALOGO),
        fuenteDiapositivas = new FuenteDatosJSON(FUENTES.DIAPOSITIVAS)
    } = {}) {
        this.documento = documento;
        this.almacenamiento = almacenamiento;
        this.navegador = navegador;
        this.formateador = new FormateadorPrecio(PARAMETROS.LOCALE, PARAMETROS.SIMBOLO_MONEDA);

        this.repositorioCatalogo = new RepositorioLectura(fuenteCatalogo, Producto.desdeJSON);
        this.repositorioDiapositivas = new RepositorioLectura(fuenteDiapositivas, Diapositiva.desdeJSON);

        this.carrito = new CarritoServicio(almacenamiento);
        this.sesion = new SesionServicio(almacenamiento);
        this.filtros = new FiltroServicio(almacenamiento);
        this.usuarios = new UsuarioRepositorio(almacenamiento);
        this.estrategiaBusqueda = new BusquedaSimilitud(PARAMETROS.UMBRAL_BUSQUEDA);

        this.autenticacion = new AutenticacionServicio({
            usuarios: this.usuarios,
            sesion: this.sesion,
            validadorRegistro: new Validador([
                new ReglaLongitudMinima('password', PARAMETROS.LONGITUD_MINIMA_PASSWORD, 'La contraseña debe tener al menos 6 caracteres.'),
                new ReglaCamposIguales('password', 'confirmPassword', 'Las contraseñas no coinciden.'),
                new ReglaEmailDisponible(this.usuarios, 'Este correo electrónico ya está registrado.')
            ])
        });

        Object.freeze(this);
    }
}
