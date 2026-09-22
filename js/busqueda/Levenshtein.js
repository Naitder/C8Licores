/**
 * Algoritmo de distancia de Levenshtein (misma lógica de buscadorUtils.js,
 * ahora agrupada como clase de utilidad con métodos estáticos).
 */
export class Levenshtein {
    /** Número mínimo de ediciones para convertir `a` en `b`. */
    static distancia(a, b) {
        const matriz = [];
        for (let i = 0; i <= b.length; i++) matriz[i] = [i];
        for (let j = 0; j <= a.length; j++) matriz[0][j] = j;

        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matriz[i][j] = matriz[i - 1][j - 1];
                } else {
                    matriz[i][j] = Math.min(
                        matriz[i - 1][j - 1] + 1,
                        matriz[i][j - 1] + 1,
                        matriz[i - 1][j] + 1
                    );
                }
            }
        }
        return matriz[b.length][a.length];
    }

    /** Similitud normalizada entre 0 (nada parecido) y 1 (idéntico). */
    static similitud(a, b) {
        const longitudMaxima = Math.max(a.length, b.length);
        if (longitudMaxima === 0) return 1;
        return 1 - Levenshtein.distancia(a, b) / longitudMaxima;
    }
}
