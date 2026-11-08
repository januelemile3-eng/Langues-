// plan.js : mémoire des éléments + moteur pédagogique qui fabrique les blocs de 5 leçons (étape 7).
// Le moteur applique des principes issus de la recherche (voir le détail dans la conversation) :
//  - difficulté "juste ce qu'il faut" (zone proche, ~85 % de réussite visée), progression reconnaissance -> production
//  - rappel actif plutôt que relecture, répétition espacée (boîtes de Leitner), entrelacement des règles et des types d'exercices
//  - mots d'une même séance volontairement de thèmes différents (les séries sémantiques gênent l'apprentissage)
//  - cibles = les lacunes réelles : règles et thèmes ratés au diagnostic ou dans les leçons précédentes
(function () {
  const DAY = 864e5, INTERVAL = [0, 1, 2, 4, 8, 16]; // intervalle (jours) selon la boîte 0..5
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const PER = 12;               // exercices par leçon (≈ 3 à 5 minutes)
  const TITLES = ['Premiers pas', 'On revient dessus', 'À toi de produire', 'Phrases et pièges', 'Bilan du bloc'];

  // ---------- Mémoire de chaque mot / phrase (boîtes de Leitner) ----------
  const Mem = {
    // Bonne réponse : on monte d'une boîte (révision plus espacée). Erreur : on redescend de deux boîtes.
    async record(lang, itemId, ok) {
      const ids = String(itemId).split('+');
      if (ids.length > 1 && !ok) return; // association : on ne sait pas quel mot a posé problème
      const now = Date.now();
      for (const id of ids) {
        const r = (await DB.get('srs', id)) || { id, lang, box: 0, seen: 0, right: 0, wrong: 0, streak: 0 };
        r.seen++; r.last = now;
        if (ok) { r.right++; r.streak++; r.box = Math.min(5, r.box + 1); } else { r.wrong++; r.streak = 0; r.box = Math.max(0, r.box - 2); }
        r.due = now + INTERVAL[r.box] * DAY;
        await DB.put('srs', r);
      }
    },
    all: lang => DB.byIndex('srs', 'lang', lang)
  };

  // ---------- Fabrication d'un bloc de 5 leçons ----------
  async function generateBlock(lang) {
    const d = Lang.get(lang), prof = await DB.getProfile(lang), diag = await Diag.latest(lang), now = Date.now();
    let maxLvl = 1; for (let l = 1; l <= 5; l++) if (d.vocab.some(v => v.lvl === l)) maxLvl = l;
    const L = Math.min(maxLvl, prof.planLevel || prof.levelNum || 1);
    const mem = new Map((await Mem.all(lang)).map(r => [r.id, r]));
    const att = await DB.byIndex('attempts', 'lang', lang);
    const index = (await DB.byIndex('blocks', 'lang', lang)).length + 1;
    const weakG = new Set(diag ? diag.weakGrammar.map(w => w.id) : []), weakT = new Set(diag ? diag.weakThemes.map(w => w.theme) : []);

    // 1) Règles à travailler : les plus ratées, au bon niveau (les non vues passent aussi)
    const gs = {};
    att.forEach(a => { if (a.grammarId) { const g = gs[a.grammarId] = gs[a.grammarId] || { n: 0, w: 0 }; g.n++; if (!a.correct) g.w++; } });
    let rules = d.grammar.filter(g => g.lvl <= L + 1 && d.sentences.some(s => s.grammarId === g.id)).map(g => {
      const s = gs[g.id] || { n: 0, w: 0 }, fit = g.lvl === L ? 1 : g.lvl === L + 1 ? .9 : g.lvl < L ? .55 : 0;
      return { g, score: (s.w + 1) / (s.n + 2) * fit + (s.n === 0 ? .15 : 0) + (weakG.has(g.id) ? .25 : 0) + Math.random() * .05 };
    }).sort((a, b) => b.score - a.score).slice(0, 6).map(x => x.g);
    if (!rules.length) rules = d.grammar.filter(g => d.sentences.some(s => s.grammarId === g.id)).slice(0, 6);

    // 2) Mots à apprendre : inconnus ou fragiles, au bon niveau, thèmes faibles du diagnostic favorisés
    const need = v => {
      const r = mem.get(v.id), base = !r ? 1 : r.box <= 1 ? .8 : r.box === 2 ? .4 : .05;
      const fit = v.lvl === L ? 1 : v.lvl === L + 1 ? .85 : v.lvl < L ? .6 : 0;
      return base * fit + (weakT.has(v.theme) ? .3 : 0) + (r && r.box >= 1 && r.due <= now ? .3 : 0) + Math.random() * .08;
    };
    const ranked = d.vocab.filter(v => v.lvl <= L + 1).map(v => ({ v, s: need(v) })).sort((a, b) => b.s - a.s).map(x => x.v);
    // 4 groupes de 6 mots ; on MÉLANGE les thèmes : au plus 2 mots d'un même thème par groupe (les séries de mots proches se confondent)
    const cohorts = [[], [], [], []], learn = [], cand = ranked.slice(0, 90);
    const th = (c, v) => c.filter(x => x.theme === v.theme).length;
    [2, 6].forEach(cap => cand.forEach(v => {                // 2e passage sans plafond seulement s'il manque des mots
      if (learn.length >= 24 || learn.includes(v)) return;
      const open = cohorts.filter(c => c.length < 6 && th(c, v) < cap);
      if (!open.length) return;
      open.sort((a, b) => (th(a, v) - th(b, v)) || (a.length - b.length))[0].push(v); learn.push(v);
    }));
    // Mots à revoir / de secours : d'abord ceux déjà vus et fragiles (boîte basse, nombreuses erreurs, échéance dépassée)
    const weakPool = d.vocab.filter(v => mem.has(v.id) && v.lvl <= L + 1)
      .sort((a, b) => (mem.get(a.id).box - mem.get(b.id).box) || (mem.get(b.id).wrong - mem.get(a.id).wrong) || (mem.get(a.id).due - mem.get(b.id).due))
      .concat(ranked.filter(v => !learn.includes(v)));

    // 3) Phrases : les règles tournent (entrelacement), les premières leçons restent au niveau de l'élève
    const slots = []; for (let j = 0; j < 16; j++) slots.push(rules[j % rules.length]);
    const usedS = new Map();
    const pickSentence = (rule, i) => {
      const cap = i <= 2 ? L : L + 1;
      const c = d.sentences.filter(s => s.grammarId === rule.id)
        .map(s => ({ s, k: (usedS.get(s.id) || 0) * 10 + (s.lvl > cap ? 5 : 0) + (mem.get(s.id) ? mem.get(s.id).box : 0) + Math.random() })).sort((a, b) => a.k - b.k);
      const s = c[0].s; usedS.set(s.id, (usedS.get(s.id) || 0) + 1); return s;
    };

    const { make, canSpeak } = Exo.factory(lang);
    const E = {
      recog: v => make.qcm({ v, dir: 'fr' }),                                  // reconnaître (facile)
      hear: v => canSpeak ? make.listen({ v }) : make.qcm({ v, dir: 'fr' }),
      recall: v => make.qcm({ v, dir: 'tg' }),                                 // retrouver le mot dans la langue
      produce: v => make.type({ v }),                                          // écrire le mot (production)
      auto: v => (mem.get(v.id) && mem.get(v.id).box >= 2) ? make.type({ v }) : make.qcm({ v, dir: 'tg' }),
      match: vs => make.match({ pairs: vs }),
      build: s => make.order({ s }),
      hearS: s => canSpeak ? make.listen({ s }) : make.order({ s })
    };
    // Variété : 2 reconnaissances pour démarrer en confiance, puis jamais deux exercices du même type à la suite
    const arrange = list => {
      const pool = shuffle(list), out = [];
      for (let k = 0; k < 2; k++) { const i = pool.findIndex(e => e.type === 'qcm'); if (i >= 0) out.push(pool.splice(i, 1)[0]); }
      while (pool.length) {                                   // on pioche toujours dans le type le plus nombreux (≠ du précédent) : pas d'amas en fin de leçon
        const last = out.length ? out[out.length - 1].type : '', n = {};
        pool.forEach(e => n[e.type] = (n[e.type] || 0) + 1);
        const best = Object.keys(n).filter(t => t !== last).sort((a, b) => n[b] - n[a])[0] || last;
        out.push(pool.splice(pool.findIndex(e => e.type === best), 1)[0]);
      }
      return out;
    };

    const lessons = [], co = k => cohorts[k - 1] || [];
    for (let i = 1; i <= 5; i++) {
      const used = new Set(), ex = [];
      const take = (arr, n) => { const r = arr.filter(v => !used.has(v.id)).slice(0, n); r.forEach(v => used.add(v.id)); return r; };
      const top = n => take(weakPool, n);
      const fill = (arr, n) => { if (arr.length < n) arr.push(...top(n - arr.length)); return arr; };
      let sent;
      if (i <= 4) {
        take(co(i), 2).forEach(v => ex.push(E.recog(v)));                     // nouveaux mots : découverte
        take(co(i), 1).forEach(v => ex.push(E.hear(v)));
        fill(take(co(i - 1), 2), 2).forEach(v => ex.push(E.recall(v)));       // mots de la veille : rappel
        fill(take(co(i - 2), 2), 2).forEach(v => ex.push(E.produce(v)));      // mots d'avant-hier : production
        const m = take(co(i), 4); if (m.length < 4) m.push(...take(co(i - 1), 4 - m.length)); fill(m, 4); ex.push(E.match(m));
        top(1).forEach(v => ex.push(E.auto(v)));
        sent = slots.slice((i - 1) * 3, i * 3).map((r, k) => [r, k < 2 ? 'build' : 'hearS']);
      } else {                                                                // leçon 5 : bilan, que de la révision
        fill(take(co(4), 2), 2).forEach(v => ex.push(E.produce(v)));
        fill(take(co(3), 1), 1).forEach(v => ex.push(E.produce(v)));
        fill(take(co(1).concat(co(2)), 1), 1).forEach(v => ex.push(E.recall(v)));
        const m = take(co(1).concat(co(2), co(3), co(4)), 4); fill(m, 4); ex.push(E.match(m));
        top(3).forEach(v => ex.push(E.auto(v)));
        sent = slots.slice(12, 16).map((r, k) => [r, k < 3 ? 'build' : 'hearS']);
      }
      const ruleIds = [];
      sent.forEach(([r, kind]) => { const s = pickSentence(r, i); if (!ruleIds.includes(r.id)) ruleIds.push(r.id); ex.push(E[kind](s)); });
      while (ex.length < PER) { const v = top(1)[0]; if (!v) break; ex.push(E.auto(v)); }
      lessons.push({ id: `${lang}.b${index}.l${i}`, lang, blockId: `${lang}.b${index}`, order: i, title: TITLES[i - 1], status: 'ready',
        exercises: arrange(ex), ruleIds, newIds: i <= 4 ? co(i).map(v => v.id) : [], createdAt: now });
    }
    const block = { id: `${lang}.b${index}`, lang, index, status: 'active', level: L, createdAt: now, focusRules: rules.map(g => g.id),
      newItems: cohorts.flat().map(v => v.id), lessonIds: lessons.map(l => l.id), diagId: diag ? diag.id : null };
    // Tout est écrit d'un seul coup : le bloc est ensuite jouable hors-ligne.
    await DB.batch(['blocks', 'lessons', 'profiles'], st => {
      st.blocks.put(block); lessons.forEach(l => st.lessons.put(l));
      st.profiles.put(Object.assign({}, prof, { currentBlockId: block.id }));
    });
    return block;
  }

  // ---------- Fin d'une leçon ; si c'est la 5e, mini-bilan du bloc et ajustement du niveau ----------
  async function complete(lessonId, sum) {
    const l = await DB.get('lessons', lessonId); if (!l) return null;
    l.status = 'done'; l.score = Math.round(100 * sum.first / Math.max(1, sum.total)); l.xp = sum.xp; l.doneAt = Date.now();
    await DB.put('lessons', l);
    const ls = await DB.byIndex('lessons', 'blockId', l.blockId);
    if (!ls.every(x => x.status === 'done')) return { blockDone: false };
    const block = await DB.get('blocks', l.blockId), att = (await DB.byIndex('attempts', 'blockId', l.blockId)).filter(a => !a.retry);
    const acc = att.length ? att.filter(a => a.correct).length / att.length : 0;
    const rule = {}, type = {};
    att.forEach(a => {
      const t = type[a.type] = type[a.type] || { n: 0, c: 0 }; t.n++; if (a.correct) t.c++;
      if (a.grammarId && !a.correct) rule[a.grammarId] = (rule[a.grammarId] || 0) + 1;
    });
    const report = { id: block.id + '.report', lang: block.lang, kind: 'block', ts: Date.now(), blockId: block.id, acc, answered: att.length,
      avgMs: att.length ? Math.round(att.reduce((s, a) => s + (a.ms || 0), 0) / att.length) : 0, byType: type,
      weakRules: Object.entries(rule).sort((a, b) => b[1] - a[1]).map(([id, count]) => ({ id, count })) };
    const prof = await DB.getProfile(block.lang);
    let maxLvl = 1; for (let k = 1; k <= 5; k++) if (Lang.get(block.lang).vocab.some(v => v.lvl === k)) maxLvl = k;
    const cur = prof.planLevel || prof.levelNum || 1;
    prof.planLevel = acc >= .88 ? Math.min(maxLvl, cur + 1) : acc < .62 ? Math.max(1, cur - 1) : cur; // vise ~85 % de réussite
    block.status = 'done'; block.reportId = report.id; block.acc = acc;
    await DB.batch(['reports', 'blocks', 'profiles'], st => { st.reports.put(report); st.blocks.put(block); st.profiles.put(prof); });
    return { blockDone: true, acc };
  }

  async function currentBlock(lang) { const p = await DB.getProfile(lang); return p.currentBlockId ? (await DB.get('blocks', p.currentBlockId)) || null : null; }
  const lessons = async blockId => (await DB.byIndex('lessons', 'blockId', blockId)).sort((a, b) => a.order - b.order);

  window.Mem = Mem; window.Plan = { generateBlock, complete, currentBlock, lessons };
})();
