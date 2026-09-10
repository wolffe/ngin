/** @returns {{ on: Function, off: Function, emit: Function, once: Function }} */
export const createEvents = () => {
  /** @type {Map<string, Set<Function>>} */
  const listeners = new Map();

  const key = (event, id) => (id != null ? `${event}:${id}` : event);

  return {
    on(event, idOrFn, maybeFn) {
      const hasId = typeof idOrFn === 'string';
      const k = key(event, hasId ? idOrFn : undefined);
      const fn = hasId ? maybeFn : idOrFn;
      if (!listeners.has(k)) listeners.set(k, new Set());
      listeners.get(k).add(fn);
      return () => listeners.get(k)?.delete(fn);
    },

    once(event, idOrFn, maybeFn) {
      const hasId = typeof idOrFn === 'string';
      const fn = hasId ? maybeFn : idOrFn;
      const unsub = this.on(event, hasId ? idOrFn : undefined, (...args) => {
        unsub();
        fn(...args);
      });
      return unsub;
    },

    off(event, idOrFn, maybeFn) {
      const hasId = typeof idOrFn === 'string';
      const k = key(event, hasId ? idOrFn : undefined);
      const fn = hasId ? maybeFn : idOrFn;
      listeners.get(k)?.delete(fn);
    },

    emit(event, id, ...args) {
      const specific = id != null ? listeners.get(key(event, id)) : null;
      const general = listeners.get(event);
      specific?.forEach((fn) => fn(...args));
      if (id != null) general?.forEach((fn) => fn(id, ...args));
    },
  };
};
