/**
 * Lectura y escritura inmutable por ruta punteada ("cta.label", "estudios.0.nombre").
 *
 * El editor mantiene el estado como un único objeto que refleja la forma del
 * esquema Zod. Trabajar por rutas evita escribir un reducer a medida por cada
 * una de las 11 secciones.
 */

export function getPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) return current[Number(segment)];
    if (typeof current === 'object') return (current as Record<string, unknown>)[segment];
    return undefined;
  }, source);
}

/** Devuelve una copia con el valor asignado. No muta la entrada. */
export function setPath<T>(source: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split('.');
  if (head === undefined) return source;

  if (Array.isArray(source)) {
    const index = Number(head);
    const next = [...source];
    next[index] = rest.length === 0 ? value : setPath(next[index], rest.join('.'), value);
    return next as unknown as T;
  }

  const record = (source ?? {}) as Record<string, unknown>;
  return {
    ...record,
    [head]: rest.length === 0 ? value : setPath(record[head], rest.join('.'), value),
  } as T;
}

/** Copia profunda por estructura. El contenido es JSON puro (texto, arrays, objetos). */
export function deepClone<T>(value: T): T {
  return structuredClone(value);
}
