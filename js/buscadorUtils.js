export function distanciaLevenshtein(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
            matrix[i][j] = matrix[i - 1][j - 1];
        } else {
            matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
            );
        }
        }
    }
    return matrix[b.length][a.length];
}

export function similitudLevenshtein(a, b) {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    const dist = distanciaLevenshtein(a, b);
    return 1 - dist / maxLen;
}

export function filtrarPorSimilitud(lista, texto, umbral = 0.4) {
    const normalizado = texto.toLowerCase();
    return lista.filter(producto => {
        const nombre = (producto.titulo || producto.nombre || '').toLowerCase();
        if (nombre.includes(normalizado)) return true;
        return similitudLevenshtein(nombre, normalizado) >= umbral;
    });
}