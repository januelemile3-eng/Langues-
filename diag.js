// diag.js : diagnostic de niveau adaptatif (étape 6).
// Principe : on démarre au niveau 1. 2 bonnes réponses d'affilée = on monte d'un niveau, 1 erreur (ou « Je ne sais pas ») = on descend.
// Le niveau final est le plus haut niveau réussi à au moins 66 %. Tout est enregistré pour fabriquer les leçons (étape 7).
(function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const MAXQ = 18, PLAN = ['vocab', 'grammar', 'vocab', 'listen', 'grammar', 'vocab'];
  const INFO = { 1: ['A1', 'Débutant', 'Tu pars des bases : mots courants et phrases simples.'],
                 2: ['A2', 'Élémentaire', 'Tu te débrouilles avec des phrases simples et du vocabulaire courant.'],
                 3: ['B1', 'Intermédiaire', "Tu comprends l'essentiel et tu t'exprimes avec aisance sur des sujets familiers."] };
  const SKILLS = { vocab: 'Vocabulaire', grammar: 'Grammaire et construction', listen: 'Compréhension orale' };
  const pct = (c, n) => n ? Math.round(100 * c / n) : 0;

  const latest = async lang => ((await DB.byIndex('reports', 'lang', lang)).filter(r => r.kind === 'diagnostic').sort((a, b) => b.ts - a.ts))[0] || null;

  function bars(r) {
    return Object.keys(SKILLS).filter(k => r.perSkill[k] && r.perSkill[k].n).map(k => {
      const p = pct(r.perSkill[k].c, r.perSkill[k].n);
      return `<div class="bar"><span>${SKILLS[k]}</span><div><i style="width:${p}%"></i></div><b>${p}%</b></div>`;
    }).join('');
  }

  function estimate(per, maxLvl) {
    let lvl = 1;
    for (let l = 1; l <= maxLvl; l++) { const s = per[l]; if (s && s.n >= 2 && s.c / s.n >= .66) lvl = l; }
    const top = per[maxLvl];
    return { lvl, capped: lvl === maxLvl && !!top && top.n >= 3 && top.c / top.n >= .66 };
  }

  function run({ lang }) {
    const root = $('#session'), body = $('#exo'), fb = $('#fb'), bar = root.querySelector('.s-bar i'), counter = root.querySelector('.s-xp');
    const { d, make, canSpeak } = Exo.factory(lang);
    let maxLvl = 1;
    for (let l = 1; l <= 5; l++) if (d.vocab.filter(v => v.lvl === l).length >= 6 && d.sentences.filter(s => s.lvl === l).length >= 4) maxLvl = l;
    const st = { cur: 1, streak: 0, ok: 0, answered: 0, wrongRun: 0, per: {}, skill: {}, gram: {}, theme: {}, missed: [] };
    root.hidden = false; fb.hidden = true; counter.textContent = ''; bar.style.width = '0%'; document.body.style.overflow = 'hidden';

    return new Promise(resolve => {
      let finished = false, timer = null;
      const close = res => {
        if (finished) return; finished = true; clearTimeout(timer);
        try { speechSynthesis.cancel(); } catch (e) {}
        root.hidden = true; body.style.pointerEvents = ''; document.body.style.overflow = ''; resolve(res);
      };
      root.querySelector('.s-x').onclick = () => { if (confirm('Quitter le diagnostic ? Tu pourras le refaire plus tard.')) close({ status: 'quit' }); };

      // Écran d'accueil du diagnostic
      body.onclick = null;
      body.innerHTML = `<div class="sum"><div style="font-size:60px">🧭</div><h2>Diagnostic de niveau</h2>
        <p class="mut" style="font-size:18px">Environ ${MAXQ} questions, du plus simple au plus difficile. L'app s'adapte à tes réponses.<br><br>
        Si tu ne sais pas, touche « Je ne sais pas » : ce n'est pas grave, ça aide à trouver ton vrai niveau.</p>
        <button class="big" data-start>C'est parti !</button><button class="skip" data-later>Plus tard</button></div>`;
      body.onclick = e => { if (e.target.closest('[data-start]')) next(); else if (e.target.closest('[data-later]')) close({ status: 'later' }); };

      function next() {
        if (st.answered >= MAXQ || (st.wrongRun >= 3 && st.answered >= 6 && st.cur === 1)) return finish();
        const i = st.answered, lvl = st.cur;
        let skill = PLAN[i % PLAN.length]; if (skill === 'listen' && !canSpeak) skill = 'vocab';
        let ex;
        if (skill === 'grammar') ex = make.order({ lvl });
        else if (skill === 'listen') ex = make.listen({ lvl, kind: lvl >= 2 ? 'sentence' : 'word' });
        else if (lvl === 1) ex = make.qcm({ lvl, dir: 'fr' });
        else if (lvl === 2) ex = i % 2 ? make.type({ lvl }) : make.qcm({ lvl, dir: 'tg' });
        else ex = make.type({ lvl });
        ex.skill = skill; counter.textContent = (i + 1) + '/' + MAXQ; bar.style.width = (i / MAXQ * 100) + '%';
        body.style.pointerEvents = ''; body.scrollTop = 0; body.onclick = null; body.innerHTML = '';
        const t0 = Date.now(); let done = false;
        const submit = res => { if (done) return; done = true; answer(ex, res, Date.now() - t0); };
        Exo.R[ex.type](ex, body, submit);
        const skip = document.createElement('button'); skip.className = 'skip'; skip.textContent = 'Je ne sais pas';
        skip.onclick = () => { if (done) return; if (document.activeElement) document.activeElement.blur(); submit({ correct: false, skipped: true, userAnswer: '(ne sait pas)' }); };
        body.appendChild(skip);
      }

      function answer(ex, res, ms) {
        body.style.pointerEvents = 'none';
        const ok = !!res.correct, L = ex.lvl || st.cur;
        DB.add('attempts', { lang, lessonId: 'diag', blockId: null, type: ex.type, skill: ex.skill, lvl: L, itemId: ex.itemId, grammarId: ex.grammarId || null,
          correct: ok, skipped: !!res.skipped, answer: res.userAnswer, ms, ts: Date.now() }).catch(() => {});
        Mem.record(lang, ex.itemId, ok).catch(() => {});
        const bump = (o, k) => { o[k] = o[k] || { n: 0, c: 0 }; o[k].n++; if (ok) o[k].c++; };
        bump(st.per, L); bump(st.skill, ex.skill); st.answered++;
        if (ok) { st.ok++; st.wrongRun = 0; st.streak++; if (st.streak >= 2 && st.cur < maxLvl) { st.cur++; st.streak = 0; } }
        else {
          st.streak = 0; st.wrongRun++; st.missed.push(ex.itemId);
          if (ex.grammarId) st.gram[ex.grammarId] = (st.gram[ex.grammarId] || 0) + 1;
          if (ex.theme) st.theme[ex.theme] = (st.theme[ex.theme] || 0) + 1;
          if (st.cur > 1) st.cur--;
        }
        bar.style.width = (st.answered / MAXQ * 100) + '%';
        timer = setTimeout(next, ok ? 700 : 1200);
      }

      async function finish() {
        body.style.pointerEvents = ''; bar.style.width = '100%'; counter.textContent = '';
        const { lvl, capped } = estimate(st.per, maxLvl), top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
        const info = INFO[lvl] || [String(lvl), '', ''];
        const report = { id: lang + '.diag.' + Date.now(), lang, kind: 'diagnostic', ts: Date.now(), levelNum: lvl, level: info[0], capped,
          answered: st.answered, correct: st.ok, perLevel: st.per, perSkill: st.skill,
          weakGrammar: top(st.gram, 5).map(([id, count]) => ({ id, count })), weakThemes: top(st.theme, 5).map(([theme, count]) => ({ theme, count })), missed: st.missed };
        try {
          await DB.put('reports', report);
          const p = await DB.getProfile(lang);
          p.level = info[0]; p.levelNum = lvl; p.diagnosticDone = true; p.diagnosticAt = report.ts; await DB.put('profiles', p);
          await DB.addXP(lang, 20);
        } catch (e) { if (window.toast) toast('Résultat non enregistré : ' + e.message); }
        const weakG = report.weakGrammar.map(w => d.grammar.find(g => g.id === w.id)).filter(Boolean).slice(0, 3);
        const weakT = report.weakThemes.slice(0, 2);
        body.innerHTML = `<div class="sum"><div style="font-size:60px">🎯</div><h2>Ton niveau : ${info[0]}${capped ? '+' : ''}</h2>
          <p style="font-size:19px;margin:0 0 6px"><b>${info[1]}</b></p>
          <p class="mut" style="margin:0 0 18px">${info[2]}${capped ? " Le contenu actuel s'arrête au niveau B1 : on l'agrandira." : ''}</p>
          <div class="card" style="text-align:left"><h3>Tes points forts et faibles</h3>${bars(report)}</div>
          ${weakG.length || weakT.length ? `<div class="card" style="text-align:left"><h3>À travailler en priorité</h3>
            ${weakG.map(g => `<div class="row"><span>${esc(g.title)}</span></div>`).join('')}
            ${weakT.map(t => `<div class="row"><span>Vocabulaire : ${esc(t.theme)}</span></div>`).join('')}</div>` : ''}
          <p class="mut">Tes 5 premières leçons seront taillées sur mesure à partir de ces résultats (étape 7).</p>
          <button class="big" data-end>Terminer</button></div>`;
        body.onclick = e => { if (e.target.closest('[data-end]')) close({ status: 'done', report }); };
        Fx.good(20);
      }
    });
  }
  window.Diag = { run, latest, bars, INFO, SKILLS, _estimate: estimate };
})();
