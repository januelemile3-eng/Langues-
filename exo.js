// exo.js : moteur d'exercices (étape 5). Génère des exercices variés depuis les fichiers de langue, les affiche,
// corrige avec la règle, enregistre chaque réponse dans la mémoire et distribue les récompenses.
(function () {
  const $ = s => document.querySelector(s);
  const rnd = n => Math.floor(Math.random() * n);
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- Correction des réponses écrites (tolérante : majuscules, accents, article, petite faute) ----------
  const ARTS = /^(le |la |les |l |un |une |des |el |los |las |una |unos |unas |to |the |a |an )/;
  const clean = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\(.*?\)/g, '').replace(/[.,;:!?¡¿'’"]/g, ' ').replace(/\s+/g, ' ').trim();
  const base = s => clean(s).replace(ARTS, '');
  const raw = s => s.trim().toLowerCase().replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').replace(ARTS, '');
  function lev(a, b) {
    const m = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) m[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return m[a.length][b.length];
  }
  function grade(input, answers, raws) {
    const u = base(input);
    if (!u) return { r: 'ko' };
    if (answers.includes(u)) return { r: raws.includes(raw(input)) ? 'ok' : 'accent' };
    if (answers.some(a => a.length >= 5 && lev(a, u) <= 1)) return { r: 'typo' };
    return { r: 'ko' };
  }

  // ---------- Fabrique d'exercices (utilisée par les séances et par le diagnostic) ----------
  // Options : lvl = niveau voulu, dir = 'fr' | 'tg' (sens du QCM), kind = 'word' | 'sentence' (écoute).
  function factory(code) {
    const d = Lang.get(code), V = d.vocab, Sn = d.sentences, canSpeak = typeof speechSynthesis !== 'undefined';
    const usedV = new Set(), usedS = new Set();
    const take = (arr, used, lvl) => {
      const pool = lvl ? arr.filter(x => x.lvl === lvl) : arr, p0 = pool.length ? pool : arr;
      const fresh = p0.filter(x => !used.has(x.id)), src = fresh.length ? fresh : p0;
      const x = src[rnd(src.length)]; used.add(x.id); return x;
    };
    const gram = id => d.grammar.find(g => g.id === id) || null;
    const others = (v, field) => {
      const seen = new Set([v[field]]);
      return shuffle(V.filter(x => x.id !== v.id)).sort((a, b) => (b.theme === v.theme) - (a.theme === v.theme))
        .filter(x => !seen.has(x[field]) && seen.add(x[field])).slice(0, 3).map(x => x[field]);
    };
    const make = {
      qcm(o = {}) {
        const v = o.v || take(V, usedV, o.lvl), toFr = o.dir ? o.dir === 'fr' : Math.random() < .5, f = toFr ? 'fr' : 'w', a = v[f];
        return { type: 'qcm', lvl: v.lvl, theme: v.theme, itemId: v.id, answer: a, choices: shuffle([a, ...others(v, f)]), answerText: v.w + ' = ' + v.fr,
          prompt: toFr ? `Que veut dire <span class="hl">${esc(v.w)}</span> ?` : `Comment dit-on <span class="hl">${esc(v.fr)}</span> en ${esc(d.name.toLowerCase())} ?` };
      },
      type(o = {}) {
        const v = o.v || take(V, usedV, o.lvl);
        return { type: 'type', lvl: v.lvl, theme: v.theme, itemId: v.id, prompt: v.fr, answers: [base(v.w)], raws: [raw(v.w)], answerText: v.w, lang: d.name.toLowerCase() };
      },
      order(o = {}) {
        const s = o.s || take(Sn, usedS, o.lvl);
        return { type: 'order', lvl: s.lvl, itemId: s.id, grammarId: s.grammarId, grammar: gram(s.grammarId), prompt: s.fr, words: s.words,
          bank: shuffle(s.words.concat(s.distractors)), answerText: s.target + ' — ' + s.fr };
      },
      match(o = {}) {
        let pairs = o.pairs;
        if (!pairs) {
          const f0 = take(V, usedV), same = shuffle(V.filter(x => x.id !== f0.id && x.lvl === f0.lvl && !usedV.has(x.id)));
          const rest = same.length >= 3 ? same : shuffle(V.filter(x => x.id !== f0.id));
          pairs = [f0, ...rest.slice(0, 3)]; pairs.forEach(p => usedV.add(p.id));
        }
        const first = pairs[0];
        return { type: 'match', lvl: first.lvl, itemId: pairs.map(p => p.id).join('+'), pairs, answerText: pairs.map(p => p.w + ' = ' + p.fr).join(' · ') };
      },
      listen(o = {}) {
        const sentence = o.s ? true : o.v ? false : o.kind ? o.kind === 'sentence' : Math.random() < .5;
        if (sentence && Sn.length >= 4) {
          const s = o.s || take(Sn, usedS, o.lvl), f = shuffle(Sn.filter(x => x.id !== s.id)).slice(0, 3).map(x => x.fr);
          return { type: 'listen', lvl: s.lvl, itemId: s.id, grammarId: s.grammarId, grammar: gram(s.grammarId), speak: s.target, speech: d.speech, answer: s.fr,
            choices: shuffle([s.fr, ...f]), answerText: s.target + ' — ' + s.fr, prompt: 'Écoute, puis choisis la bonne traduction' };
        }
        const v = o.v || take(V, usedV, o.lvl);
        return { type: 'listen', lvl: v.lvl, theme: v.theme, itemId: v.id, speak: v.w.replace(/^to /, ''), speech: d.speech, answer: v.fr,
          choices: shuffle([v.fr, ...others(v, 'fr')]), answerText: v.w + ' = ' + v.fr, prompt: 'Écoute, puis choisis le bon sens' };
      }
    };
    return { d, make, canSpeak };
  }
  function gen(code, n) {
    const { make, canSpeak } = factory(code);
    const kinds = shuffle(['qcm', 'qcm', 'qcm', 'order', 'order', 'type', 'type', 'match', 'listen', 'listen']).slice(0, n);
    return kinds.map(k => make[(k === 'listen' && !canSpeak) ? 'qcm' : k]());
  }

  function speak(t, l) {
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = l; u.rate = .85; speechSynthesis.speak(u); } catch (e) { /* le son est un bonus */ }
  }

  // ---------- Affichage de chaque type d'exercice ----------
  const R = {
    qcm(ex, el, submit) {
      el.innerHTML = `<p class="q">${ex.prompt}</p><div class="opts">${ex.choices.map((c, i) => `<button class="opt" data-i="${i}">${esc(c)}</button>`).join('')}</div>`;
      choose(ex, el, submit);
    },
    listen(ex, el, submit) {
      el.innerHTML = `<p class="q">${ex.prompt}</p><button class="spk" aria-label="Réécouter">🔊</button>
        <div class="opts">${ex.choices.map((c, i) => `<button class="opt" data-i="${i}">${esc(c)}</button>`).join('')}</div>`;
      const say = () => speak(ex.speak, ex.speech); el.querySelector('.spk').onclick = say; setTimeout(say, 350);
      choose(ex, el, submit);
    },
    type(ex, el, submit) {
      el.innerHTML = `<p class="q">Écris en ${esc(ex.lang)} :</p><p class="hl big-w">${esc(ex.prompt)}</p>
        <input id="ti" type="text" autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="done" aria-label="Ta réponse">
        <button class="big" id="tv" style="margin-top:14px">Valider</button>`;
      const ti = el.querySelector('#ti'); let done = false;
      const go = () => {
        const v = ti.value.trim(); if (!v || done) return; done = true; ti.blur(); ti.disabled = true;
        const g = grade(v, ex.answers, ex.raws);
        submit({ correct: g.r !== 'ko', userAnswer: v,
          note: g.r === 'accent' ? `Attention à l'accent : <b>${esc(ex.answerText)}</b>` : g.r === 'typo' ? `Presque ! Écris : <b>${esc(ex.answerText)}</b>` : '' });
      };
      el.querySelector('#tv').onclick = go; ti.onkeydown = e => { if (e.key === 'Enter') go(); }; setTimeout(() => ti.focus(), 200);
    },
    order(ex, el, submit) {
      const placed = []; let done = false;
      el.innerHTML = `<p class="q">Remets la phrase en ordre :</p><p class="hl big-w">${esc(ex.prompt)}</p>
        <div class="slots" aria-live="polite"></div><div class="bank"></div><button class="big" id="ov" style="margin-top:18px" disabled>Valider</button>`;
      const slots = el.querySelector('.slots'), bank = el.querySelector('.bank'), ok = el.querySelector('#ov');
      const draw = () => {
        slots.innerHTML = placed.map(i => `<button class="w" data-s="${i}">${esc(ex.bank[i])}</button>`).join('');
        bank.innerHTML = ex.bank.map((w, i) => `<button class="w" data-b="${i}"${placed.includes(i) ? ' style="visibility:hidden"' : ''}>${esc(w)}</button>`).join('');
        ok.disabled = !placed.length;
      };
      el.onclick = e => {
        const b = e.target.closest('.w'); if (!b || done) return;
        if (b.dataset.b !== undefined) placed.push(+b.dataset.b); else placed.splice(placed.indexOf(+b.dataset.s), 1);
        draw();
      };
      ok.onclick = () => {
        if (done || !placed.length) return; done = true;
        const mine = placed.map(i => ex.bank[i].toLowerCase()).join(' '), good = ex.words.map(w => w.toLowerCase()).join(' ');
        submit({ correct: mine === good, userAnswer: placed.map(i => ex.bank[i]).join(' ') });
      };
      draw();
    },
    match(ex, el, submit) {
      const L = shuffle(ex.pairs), Rr = shuffle(ex.pairs); let sel = null, errors = 0, left = ex.pairs.length;
      el.innerHTML = `<p class="q">Associe chaque mot à sa traduction :</p><div class="mt">
        <div>${L.map(p => `<button class="opt" data-l="${p.id}">${esc(p.w)}</button>`).join('')}</div>
        <div>${Rr.map(p => `<button class="opt" data-r="${p.id}">${esc(p.fr)}</button>`).join('')}</div></div>`;
      el.querySelector('.mt').onclick = e => {
        const b = e.target.closest('.opt'); if (!b || b.classList.contains('done')) return;
        if (b.dataset.l) { el.querySelectorAll('[data-l]').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); sel = b; return; }
        if (!sel) return;
        if (sel.dataset.l === b.dataset.r) {
          [sel, b].forEach(x => { x.classList.remove('sel'); x.classList.add('good', 'done'); }); sel = null;
          if (--left === 0) setTimeout(() => submit({ correct: errors === 0, userAnswer: errors + ' erreur(s)' }), 450);
        } else {
          errors++; [sel, b].forEach(x => { x.classList.add('bad'); setTimeout(() => x.classList.remove('bad'), 450); });
          sel.classList.remove('sel'); sel = null;
        }
      };
    }
  };
  function choose(ex, el, submit) {
    let lock = false;
    el.querySelector('.opts').onclick = e => {
      const b = e.target.closest('.opt'); if (!b || lock) return; lock = true;
      const mine = ex.choices[b.dataset.i], ok = mine === ex.answer;
      b.classList.add(ok ? 'good' : 'bad');
      if (!ok) el.querySelectorAll('.opt').forEach(o => { if (ex.choices[o.dataset.i] === ex.answer) o.classList.add('good'); });
      submit({ correct: ok, userAnswer: mine });
    };
  }

  // ---------- Déroulement d'une séance ----------
  const PRAISE = ['Bravo !', 'Excellent !', 'Parfait !', 'Bien joué !', 'Super !'];
  function start({ lang, exercises, lessonId, blockId, onFinish }) {
    const root = $('#session'), body = $('#exo'), fb = $('#fb'), bar = root.querySelector('.s-bar i'), xpEl = root.querySelector('.s-xp');
    const queue = exercises ? exercises.map(e => Object.assign({}, e)) : gen(lang, 10); let idx = 0, xp = 0, first = 0, timer = null; const total = queue.length;
    root.hidden = false; xpEl.textContent = '⭐ 0'; document.body.style.overflow = 'hidden';
    return new Promise(resolve => {
      const close = () => { clearTimeout(timer); try { speechSynthesis.cancel(); } catch (e) {} root.hidden = true; fb.hidden = true; document.body.style.overflow = ''; resolve(); };
      root.querySelector('.s-x').onclick = () => { if (confirm('Quitter la séance ? Tes réponses déjà données sont gardées.')) close(); };

      const next = () => { clearTimeout(timer); idx++; step(); };
      fb.onclick = e => { if (e.target.closest('[data-go]')) next(); };

      function step() {
        fb.hidden = true;
        if (idx >= queue.length) return summary();
        const ex = queue[idx], t0 = Date.now();
        bar.style.width = (idx / queue.length * 100) + '%'; body.scrollTop = 0; body.onclick = null; body.innerHTML = '';
        R[ex.type](ex, body, res => answer(ex, res, Date.now() - t0));
      }

      function answer(ex, res, ms) {
        const ok = res.correct, gain = ok ? (ex.retry ? 5 : 10) : 0;
        DB.seq(() => DB.add('attempts', { lang, lessonId: lessonId || 'demo', blockId: blockId || null, type: ex.type, itemId: ex.itemId, grammarId: ex.grammarId || null,
          correct: ok, retry: !!ex.retry, answer: res.userAnswer, ms, ts: Date.now() })).catch(() => {});
        DB.seq(() => Mem.record(lang, ex.itemId, ok)).catch(() => {});
        if (ok) { xp += gain; if (!ex.retry) first++; DB.seq(() => DB.addXP(lang, gain)).catch(() => {}); }
        else if (!ex.retry) queue.push(Object.assign({}, ex, { retry: true })); // l'exercice sera reproposé en fin de séance
        xpEl.textContent = '⭐ ' + xp; bar.style.width = ((idx + 1) / queue.length * 100) + '%';
        const btn = '<button class="big" data-go>Continuer</button>';
        if (ok) {
          Fx.good(gain); fb.className = 's-fb ok';
          fb.innerHTML = `<b>${res.note ? 'Bien !' : PRAISE[rnd(PRAISE.length)]}</b>` + (res.note ? `<p>${res.note}</p>${btn}` : '');
          fb.hidden = false; if (!res.note) timer = setTimeout(next, 1000);
        } else {
          Fx.bad(); const g = ex.grammar;
          fb.className = 's-fb ko';
          fb.innerHTML = `<b>Oups, ce n'est pas tout à fait ça</b><p>Bonne réponse : <b>${esc(ex.answerText)}</b></p>` +
            (g ? `<div class="rule"><b>${esc(g.title)}</b><br>${esc(g.rule)}<br><i>💡 ${esc(g.tip)}</i></div>` : '') + btn;
          fb.hidden = false;
        }
      }

      async function summary() {
        bar.style.width = '100%';
        let streakUp = false, streak = 0;
        try { const b = await DB.getProfile(lang), a = await DB.touchStreak(lang); streakUp = a.streak > b.streak; streak = a.streak; } catch (e) {}
        let fin = null; if (onFinish) { try { fin = await onFinish({ first, total, xp }); } catch (e) {} }
        body.innerHTML = `<div class="sum"><div style="font-size:64px">${first >= 8 ? '🏆' : first >= 5 ? '🎉' : '💪'}</div><h2>Séance terminée !</h2>
          <div class="stats"><div class="chip"><b>${first}/${total}</b><span>du premier coup</span></div><div class="chip"><b>⭐ ${xp}</b><span>XP gagnés</span></div>
          <div class="chip"><b>🔥 ${streak}</b><span>jours de suite</span></div></div>
          ${fin && fin.blockDone ? `<div class="card" style="text-align:left"><b>🎉 Bloc terminé !</b><br>Précision du bloc : ${Math.round(fin.acc * 100)} %. Va dans « Leçons » pour créer les 5 suivantes.</div>` : ''}
          <p class="mut">Les exercices ratés ont été reproposés. Tout est enregistré sur ton iPhone.</p><button class="big" data-end>Terminer</button></div>`;
        body.onclick = e => { if (e.target.closest('[data-end]')) close(); };
        if (streakUp && streak > 1) Fx.streak(streak); else Fx.good();
      }
      step();
    });
  }
  window.Exo = { start, R, factory, _t: { grade, gen, base, raw } };
})();
