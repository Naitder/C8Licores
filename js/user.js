/**
 * CAPA DE COMPATIBILIDAD (reemplazable).
 * Nuevos equivalentes:
 *   inicializarSesion   -> js/ui/componentes/NavegacionSesion.js + js/servicios/SesionServicio.js
 *   inicializarLogin    -> js/ui/formularios/FormularioLogin.js + js/servicios/AutenticacionServicio.js
 *   inicializarRegistro -> js/ui/formularios/FormularioRegistro.js + js/validacion/*
 *   USUARIO_DEMO        -> js/modelos/UsuarioDemo.js
 */
import { ContenedorDependencias } from './app/ContenedorDependencias.js';
import { NavegacionSesion } from './ui/componentes/NavegacionSesion.js';
import { FormularioLogin } from './ui/formularios/FormularioLogin.js';
import { FormularioRegistro } from './ui/formularios/FormularioRegistro.js';

/** @deprecated usar new NavegacionSesion({...}).montar() */
export function inicializarSesion() {
    const d = ContenedorDependencias.obtener();
    new NavegacionSesion({ sesion: d.sesion, navegador: d.navegador, documento: d.documento }).montar();
}

/** @deprecated usar new FormularioLogin({...}).montar() */
export function inicializarLogin() {
    const d = ContenedorDependencias.obtener();
    new FormularioLogin({ autenticacion: d.autenticacion, filtros: d.filtros, navegador: d.navegador, documento: d.documento }).montar();
}

/** @deprecated usar new FormularioRegistro({...}).montar() */
export function inicializarRegistro() {
    const d = ContenedorDependencias.obtener();
    new FormularioRegistro({ autenticacion: d.autenticacion, filtros: d.filtros, navegador: d.navegador, documento: d.documento }).montar();
}
