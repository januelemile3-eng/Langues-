// db.js : la "mémoire" de l'app. Tout est stocké sur l'iPhone (IndexedDB).
(function () {
  const NAME = 'langues-db', VERSION = 1;
  // Les "tiroirs" de la mémoire. lang = 'en', 'es', etc.
  const STORES = {
    settings: { keyPath: 'key' },                                   // réglages (langue active, thème...)
    profiles: { keyPath: 'lang' },                                  // 1 profil par langue : niveau, XP, série
    blocks:   { keyPath: 'id', indexes: [['lang', 'lang']] },       // blocs de 5 leçons
    lessons:  { keyPath: 'id', indexes: [['lang', 'lang'], ['blockId', 'blockId']] }, // leçons complètes (jouables hors-ligne)
    attempts: { keyPath: 'id', autoIncrement: true, indexes: [['lang', 'lang'], ['lessonId', 'lessonId'], ['blockId', 'blockId']] }, // chaque réponse donnée
    srs:      { keyPath: 'id', indexes: [['lang', 'lang'], ['due', 'due']] },  // répétition espacée
    badges:   { keyPath: 'id', indexes: [['lang', 'lang']] },       // récompenses
    reports:  { keyPath: 'id', indexes: [['lang', 'lang']] }        // bilans de fin de bloc
  };

  let dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      if (!window.indexedDB) { dbp = null; return rej(new Error('IndexedDB indisponible')); }
      const r = indexedDB.open(NAME, VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        for (const [n, c] of Object.entries(STORES)) {
          if (db.objectStoreNames.contains(n)) continue;
          const s = db.createObjectStore(n, { keyPath: c.keyPath, autoIncrement: !!c.autoIncrement });
          (c.indexes || []).forEach(([i, p]) => s.createIndex(i, p));
        }
      };
      r.onsuccess = () => {
        const db = r.result;
        db.onversionchange = () => { db.close(); dbp = null; };
        res(db);
      };
      r.onerror = () => { dbp = null; rej(r.error); };
    });
    return dbp;
  }

  // Journal des erreurs (affiché dans Réglages > Diagnostic technique)
  window.__dbErr = [];
  function report(store, mode, e) {
    const d = { store, mode, name: (e && e.name) || 'Erreur', message: (e && e.message) || 'Opération annulée', t: Date.now() };
    window.__dbErr.push(d); if (window.__dbErr.length > 20) window.__dbErr.shift();
    window.dispatchEvent(new CustomEvent('db-error', { detail: d }));
  }
  // Exécute une opération sur un tiroir et attend qu'elle soit VRAIMENT sauvegardée.
  // En cas d'échec passager (fréquent sur iPhone), on réessaie une fois avant de signaler l'erreur.
  function run(store, mode, fn, retried) {
    return open().then(db => new Promise((res, rej) => {
      let out, last = null, tx;
      const fail = e => {
        if (!retried && (!e || e.name === 'UnknownError' || e.name === 'AbortError' || e.name === 'TransactionInactiveError')) {
          dbp = null; return setTimeout(() => run(store, mode, fn, true).then(res, rej), 200);
        }
        report(store, mode, e); rej(e || new Error('Opération annulée'));
      };
      try {
        tx = db.transaction(store, mode);
        const r = fn(tx.objectStore(store));
        if (r) { r.onsuccess = () => { out = r.result; }; r.onerror = () => { last = r.error; }; }
      } catch (e) { return fail(e); }
      tx.oncomplete = () => res(out);
      tx.onabort = () => fail(tx.error || last);
    }));
  }
  // File d'attente : les écritures « de fond » (réponses, mémoire, XP) passent l'une après l'autre, jamais en même temps.
  let chain = Promise.resolve();
  const seq = fn => { const p = chain.then(fn); chain = p.catch(() => {}); return p; };

  // Plusieurs tiroirs en une seule opération "tout ou rien" (ex : fin de leçon).
  function batch(names, fn) {
    return open().then(db => new Promise((res, rej) => {
      const tx = db.transaction(names, 'readwrite');
      const st = {}; names.forEach(n => st[n] = tx.objectStore(n));
      fn(st);
      tx.oncomplete = () => res();
      tx.onerror = tx.onabort = () => {
        const e = tx.error || new Error('Opération annulée');
        window.dispatchEvent(new CustomEvent('db-error', { detail: e }));
        rej(e);
      };
    }));
  }

  const get = (s, k) => run(s, 'readonly', st => st.get(k));
  const put = (s, v) => run(s, 'readwrite', st => st.put(v));
  const add = (s, v) => run(s, 'readwrite', st => st.add(v));
  const del = (s, k) => run(s, 'readwrite', st => st.delete(k));
  const all = s => run(s, 'readonly', st => st.getAll());
  const byIndex = (s, i, k) => run(s, 'readonly', st => st.index(i).getAll(IDBKeyRange.only(k)));

  // ---- Dates et série de jours ----
  const fmt = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const today = () => fmt(new Date());
  const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return fmt(d); };

  // ---- Réglages ----
  const getSetting = (k, def) => get('settings', k).then(r => r ? r.value : def);
  const setSetting = (k, v) => put('settings', { key: k, value: v });

  // ---- Profil par langue ----
  async function getProfile(lang) {
    let p = await get('profiles', lang);
    if (!p) {
      p = { lang, level: null, xp: 0, streak: 0, bestStreak: 0, lastDay: null,
            diagnosticDone: false, currentBlockId: null, createdAt: Date.now() };
      await put('profiles', p);
    }
    return p;
  }
  async function addXP(lang, n) {
    const p = await getProfile(lang); p.xp += n; await put('profiles', p); return p;
  }
  async function touchStreak(lang) {
    const p = await getProfile(lang), t = today();
    if (p.lastDay === t) return p;
    p.streak = (p.lastDay === yesterday()) ? p.streak + 1 : 1;
    p.bestStreak = Math.max(p.bestStreak, p.streak);
    p.lastDay = t;
    await put('profiles', p); return p;
  }

  // ---- Effacer toute une langue (ou seulement ses données de test) ----
  function purgeLang(lang) {
    return batch(Object.keys(STORES).filter(n => n !== 'settings'), st => {
      st.profiles.delete(lang);
      Object.keys(st).forEach(n => {
        if (n === 'profiles') return;
        const c = st[n].index('lang').openCursor(IDBKeyRange.only(lang));
        c.onsuccess = () => { const cur = c.result; if (cur) { cur.delete(); cur.continue(); } };
      });
    });
  }

  // ---- Sauvegarde complète (export / import) ----
  async function exportAll() {
    const data = {};
    for (const n of Object.keys(STORES)) data[n] = await all(n);
    return { app: 'langues', schema: VERSION, exportedAt: new Date().toISOString(), data };
  }
  async function importAll(obj) {
    if (!obj || obj.app !== 'langues' || !obj.data) throw new Error('Fichier de sauvegarde invalide');
    const names = Object.keys(STORES);
    await batch(names, st => {
      names.forEach(n => { st[n].clear(); (obj.data[n] || []).forEach(v => st[n].put(v)); });
    });
  }

  // ---- Protection contre l'effacement par Safari ----
  async function persist() {
    try { return navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; }
    catch (e) { return false; }
  }
  async function estimate() {
    try { return navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null; }
    catch (e) { return null; }
  }

  window.DB = { open, get, put, add, del, all, byIndex, batch, getSetting, setSetting,
                seq, getProfile, addXP, touchStreak, today, purgeLang, exportAll, importAll, persist, estimate };
})();
