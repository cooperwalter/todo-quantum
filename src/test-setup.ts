// Vitest jsdom fix: Node >= 22 ships its own localStorage global (disabled unless
// --localstorage-file is passed), which makes vitest's populateGlobal skip copying
// jsdom's working Storage implementation onto the test global. Re-attach it here.
interface JsdomHolder {
  jsdom?: {
    window: { localStorage?: Storage; sessionStorage?: Storage };
  };
}

const holder = globalThis as typeof globalThis & JsdomHolder;

if (holder.jsdom !== undefined) {
  for (const key of ['localStorage', 'sessionStorage'] as const) {
    const storage = holder.jsdom.window[key];
    if (storage !== undefined) {
      Object.defineProperty(globalThis, key, {
        value: storage,
        configurable: true,
        writable: true,
      });
    }
  }
}
