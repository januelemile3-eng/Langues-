// lang.js : le "moteur" des langues. Il ne contient AUCUN contenu : il charge et vérifie les fichiers des fichiers lang-xx.js.
// Niveaux : 1 = A1 (débutant), 2 = A2, 3 = B1, 4 = B2, 5 = C1.
(function () {
  const REG = {}, FAILED = [];
  const slug = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const tokens = t => t.replace(/[.,;:!?¡¿]/g, '').split(/\s+/).filter(Boolean);

  // Appelée par chaque fichier de langue. Les lignes compactes sont transformées en objets complets.
  window.registerLang = function (d) {
    const c = d.code;
    const add = {
      vocab: (d.vocab || []).map(([w, fr, lvl, theme]) => ({ id: c + '.v.' + slug(w), w, fr, lvl, theme })),
      grammar: (d.grammar || []).map(g => Object.assign({}, g, { id: c + '.g.' + g.id })),
      sentences: (d.sentences || []).map(([lvl, target, fr, gid, dis]) =>
        ({ id: c + '.s.' + slug(target), lvl, target, fr, grammarId: c + '.g.' + gid, words: tokens(target), distractors: dis || [] }))
    };
    // Plusieurs fichiers peuvent compléter la même langue (ex. lang-en.js puis lang-en-2.js) : on les fusionne.
    if (REG[c]) Object.keys(add).forEach(k => { REG[c][k] = REG[c][k].concat(add[k]); });
    else REG[c] = Object.assign({}, d, add);
  };

  const loadScript = src => new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error(src));
    document.head.appendChild(s);
  });
  async function loadAll() {
    for (const code of (self.LANG_CODES || [])) {
      try { await loadScript('lang-' + code + '.js'); if (!code.includes('-') && !REG[code]) throw new Error(code); } catch (e) { FAILED.push(code); }
    }
    return Object.values(REG);
  }

  // Vérifie qu'un fichier de langue est complet et cohérent.
  function validate(code) {
    const d = REG[code], err = [];
    if (!d) return ['langue introuvable'];
    ['name', 'flag', 'hi', 'go', 'speech'].forEach(k => { if (!d[k]) err.push('champ manquant : ' + k); });
    const seen = (arr, label) => { const s = new Set(); arr.forEach(x => { if (s.has(x.id)) err.push('doublon ' + label + ' : ' + x.id); s.add(x.id); }); return s; };
    const okLvl = l => Number.isInteger(l) && l >= 1 && l <= 5;
    seen(d.vocab, 'mot').size; d.vocab.forEach(v => { if (!v.w || !v.fr || !v.theme || !okLvl(v.lvl)) err.push('mot incomplet : ' + (v.w || '?')); });
    const gids = seen(d.grammar, 'règle');
    d.grammar.forEach(g => { if (!g.title || !g.rule || !g.tip || !okLvl(g.lvl)) err.push('règle incomplète : ' + g.id); });
    seen(d.sentences, 'phrase');
    d.sentences.forEach(s => {
      if (!s.target || !s.fr || !okLvl(s.lvl) || s.words.length < 2) err.push('phrase incomplète : ' + (s.target || '?'));
      if (!gids.has(s.grammarId)) err.push('règle inconnue (' + s.grammarId + ') pour : ' + s.target);
      const low = s.words.map(w => w.toLowerCase());
      s.distractors.forEach(x => { if (low.includes(x.toLowerCase())) err.push('mot piège déjà dans la phrase : ' + x + ' / ' + s.target); });
    });
    return err;
  }
  const stats = c => REG[c] ? { vocab: REG[c].vocab.length, grammar: REG[c].grammar.length, sentences: REG[c].sentences.length } : null;

  window.Lang = { list: () => Object.values(REG), get: c => REG[c], loadAll, failed: () => FAILED, validate, stats };
})();
