// app.js : interface de base (étape 3). Langues, navigation, thème, mascotte, récompenses.
let LANGS = []; // rempli depuis les fichiers lang-xx.js (voir lang.js)
const TABS = [['home', '🏠', 'Accueil'], ['lessons', '📚', 'Leçons'], ['progress', '🏆', 'Progrès'], ['settings', '⚙️', 'Réglages']];
const S = { lang: 'en', tab: 'home', sound: true, haptics: false, hLevel: 1, theme: 'light', profile: null, diag: null, skipDiag: {}, block: null, lessons: [] };
const $ = s => document.querySelector(s), L = () => LANGS.find(l => l.code === S.lang);

// ---------- Mascotte "Lingo" ----------
function mascot() {
  return `<svg class="mascot m-happy" viewBox="0 0 120 120" aria-hidden="true"><g class="body">
  <path d="M26 44 L22 14 L50 32Z" fill="var(--c2)"/><path d="M94 44 L98 14 L70 32Z" fill="var(--c2)"/>
  <ellipse cx="60" cy="68" rx="44" ry="40" fill="#fff"/><ellipse cx="60" cy="68" rx="40" ry="36" fill="var(--c1)"/>
  <ellipse cx="60" cy="84" rx="26" ry="18" fill="#fff" opacity=".3"/>
  <g class="eye"><circle cx="43" cy="60" r="11" fill="#fff"/><circle cx="45" cy="62" r="5.5" fill="#1f2540"/></g>
  <g class="eye"><circle cx="77" cy="60" r="11" fill="#fff"/><circle cx="79" cy="62" r="5.5" fill="#1f2540"/></g>
  <circle cx="32" cy="78" r="6" fill="#ff8fa3" opacity=".6"/><circle cx="88" cy="78" r="6" fill="#ff8fa3" opacity=".6"/>
  <path class="mo mo-h" d="M48 80 Q60 92 72 80" stroke="#1f2540" stroke-width="4" fill="none" stroke-linecap="round"/>
  <ellipse class="mo mo-c" cx="60" cy="85" rx="11" ry="9" fill="#1f2540"/>
  <path class="mo mo-o" d="M50 88 Q60 78 70 88" stroke="#1f2540" stroke-width="4" fill="none" stroke-linecap="round"/>
  </g></svg>`;
}
function react(mood) {
  document.querySelectorAll('.mascot').forEach(m => { m.setAttribute('class', 'mascot m-' + mood); });
  clearTimeout(react.t);
  react.t = setTimeout(() => document.querySelectorAll('.mascot').forEach(m => m.setAttribute('class', 'mascot m-happy')), 1600);
}

// ---------- Sons (synthétisés, aucun fichier) ----------
let ac;
// iPhone : le son d'une page web est coupé par l'interrupteur silencieux, sauf si on déclare "playback".
function getAC() {
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
  ac = ac || new (window.AudioContext || window.webkitAudioContext)();
  if (ac.state !== 'running') ac.resume();
  return ac;
}
// Safari exige un premier toucher pour "réveiller" le son : on le fait au tout premier contact.
['pointerdown', 'touchend', 'click'].forEach(ev => document.addEventListener(ev, () => {
  try { const a = getAC(), s = a.createBufferSource(); s.buffer = a.createBuffer(1, 1, 22050); s.connect(a.destination); s.start(0); } catch (e) {}
}, { once: true, capture: true }));
function tone(freqs, dur, type, gap, vol) {
  if (!S.sound) return;
  try {
    getAC(); vol = Math.min(vol * 2.2, .5);
    freqs.forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + .05 + i * gap;
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .02); g.gain.exponentialRampToValueAtTime(.001, t + dur);
      o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur + .05);
    });
  } catch (e) { /* le son est un bonus : on ignore les erreurs */ }
}

// ---------- Confettis ----------
function confetti(n) {
  const c = $('#fx'), x = c.getContext('2d'), d = window.devicePixelRatio || 1;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) n = Math.round(n / 4);
  c.width = innerWidth * d; c.height = innerHeight * d; x.scale(d, d);
  const cols = ['#ff5d73', '#ffc533', '#2fbf71', '#2f7cf6', '#a45cf0', '#ff8a2b'];
  const ps = Array.from({ length: n }, () => ({ x: innerWidth / 2, y: innerHeight * .62, vx: (Math.random() - .5) * 15, vy: -8 - Math.random() * 11,
    w: 6 + Math.random() * 6, h: 4 + Math.random() * 5, r: Math.random() * 6, vr: (Math.random() - .5) * .4, c: cols[(Math.random() * cols.length) | 0] }));
  const t0 = performance.now();
  (function f(t) {
    const k = t - t0; x.clearRect(0, 0, innerWidth, innerHeight);
    ps.forEach(p => { p.vy += .35; p.x += p.vx; p.y += p.vy; p.r += p.vr; x.save(); x.translate(p.x, p.y); x.rotate(p.r);
      x.globalAlpha = Math.max(0, 1 - k / 1800); x.fillStyle = p.c; x.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); x.restore(); });
    if (k < 1800) requestAnimationFrame(f); else x.clearRect(0, 0, innerWidth, innerHeight);
  })(t0);
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2200);
}

// ---------- Vibrations ----------
// Safari iPhone n'a pas d'API de vibration : on déclenche le petit "tic" d'un interrupteur invisible.
// Plus de tics rapprochés = vibration plus forte. (Sur Android, on utilise la vibration normale.)
// Nombre de tics selon la force choisie (légère / moyenne / forte) et écart en ms entre les tics.
const HP = { tap: [[1, 2, 3], 40], good: [[3, 5, 8], 45], bad: [[5, 8, 12], 40], streak: [[10, 14, 20], 50] };
const H = {
  el: null,
  init() {
    const l = document.createElement('label'), i = document.createElement('input');
    l.setAttribute('aria-hidden', 'true'); l.style.cssText = 'position:fixed;left:0;top:0;width:44px;height:28px;opacity:0;pointer-events:none';
    i.type = 'checkbox'; i.setAttribute('switch', ''); i.tabIndex = -1; l.appendChild(i); document.body.appendChild(l); H.el = l;
  },
  tick() { if (!S.haptics) return; try { if (H.el) H.el.click(); if (navigator.vibrate) navigator.vibrate(15); } catch (e) {} },
  seq(n, gap) { for (let i = 0; i < n; i++) { if (i === 0) H.tick(); else setTimeout(H.tick, i * gap); } },
  run(k) { H.seq(HP[k][0][S.hLevel], HP[k][1]); },
  good() { H.run('good'); }, bad() { H.run('bad'); }, streak() { H.run('streak'); }
};

// Récompenses : utilisables par toutes les futures leçons (Fx.good(), Fx.bad(), Fx.streak()).
const Fx = {
  good(xp) { H.good(); tone([523, 659, 784], .22, 'triangle', .09, .16); confetti(60); react('cheer'); if (xp) toast('+' + xp + ' XP ⭐'); },
  bad(msg) { H.bad(); tone([330, 262], .3, 'sine', .14, .13); react('oops'); toast(msg || "Oups, ce n'est pas tout à fait ça"); },
  streak(n) { H.streak(); tone([523, 659, 784, 1047, 1319], .26, 'triangle', .08, .16); confetti(140); react('cheer'); toast('🔥 Série de ' + n + ' jours !'); }
};
window.Fx = Fx;

// ---------- Thème ----------
function applyTheme() {
  const eff = S.theme === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : S.theme;
  document.documentElement.dataset.eff = eff;
  document.querySelector('meta[name=theme-color]').content = eff === 'dark' ? '#12162a' : '#f4f7ff';
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

// ---------- Écrans ----------
const P = () => S.profile;
const VIEWS = {
  home: () => `
    <div class="card hero">${mascot()}<div><h2>${L().hi}</h2><p>Prêt à apprendre ${L().go} ?</p></div></div>
    <div class="stats">
      <div class="chip"><b>🔥 ${P().streak}</b><span>jours de suite</span></div>
      <div class="chip"><b>⭐ ${P().xp}</b><span>points XP</span></div>
      <div class="chip"><b>🎯 ${P().level || '?'}</b><span>niveau</span></div>
    </div>
    <button class="big" data-act="${P().diagnosticDone ? 'start' : 'diag'}">${P().diagnosticDone ? 'Mes 5 leçons' : 'Commencer le diagnostic'}</button>
    <div class="card"><h3>🧪 Séance d'essai</h3>
      <p class="mut" style="margin:0 0 12px;font-size:15px">10 exercices variés pour tester le moteur. Les vraies leçons arrivent à l'étape 7.</p>
      <button class="big" style="margin:0" data-act="practice">Lancer une séance</button></div>`,
  lessons: () => {
    if (!P().diagnosticDone) return `<div class="card"><h3>Commence par le diagnostic</h3><p class="mut" style="margin:0 0 12px">Il me permet de fabriquer des leçons à ton niveau.</p>
      <button class="big" style="margin:0" data-act="diag">Commencer le diagnostic</button></div>`;
    const b = S.block, ls = S.lessons;
    if (!b || !ls.length) return `<div class="card"><h3>Tes 5 leçons</h3><p class="mut" style="margin:0 0 12px">Prêt à créer ton bloc de 5 leçons sur mesure ?</p>
      <button class="big" style="margin:0" data-act="makeblock">Créer mes 5 leçons</button></div>`;
    const cur = ls.findIndex(l => l.status !== 'done'), g = Lang.get(S.lang), lvl = (Diag.INFO[b.level] || [b.level])[0];
    const rules = b.focusRules.map(id => g.grammar.find(r => r.id === id)).filter(Boolean);
    const avg = Math.round(ls.reduce((s, l) => s + (l.score || 0), 0) / ls.length);
    return `<div class="card"><h3>Bloc ${b.index} · niveau ${lvl}</h3>
      <div class="path">${ls.map((l, i) => { const st = l.status === 'done' ? 'done' : i === cur ? 'cur' : 'lock';
        return `<div class="stepn"><button class="node ${st}" data-act="lesson" data-id="${l.id}" aria-label="Leçon ${l.order} : ${l.title}">${st === 'done' ? '✓' : st === 'cur' ? '▶' : '🔒'}</button><small>${l.title}${l.status === 'done' ? ' · ' + l.score + '%' : ''}</small></div>`; }).join('')}</div></div>
      ${cur === -1 ? `<div class="card"><h3>🎉 Bloc terminé !</h3><p class="mut" style="margin:0 0 12px">Résultat moyen : ${avg} %.</p><button class="big" style="margin:0" data-act="makeblock">Créer les 5 leçons suivantes</button></div>` : ''}
      <div class="card"><h3>Ce bloc travaille</h3>${rules.map(r => `<div class="row"><span>${r.title}</span></div>`).join('')}
        <div class="row"><span>Nouveaux mots</span><b>${b.newItems.length}</b></div></div>`;
  },
  progress: () => `<div class="stats">
      <div class="chip"><b>🔥 ${P().streak}</b><span>série actuelle</span></div>
      <div class="chip"><b>🏅 ${P().bestStreak}</b><span>meilleure série</span></div>
      <div class="chip"><b>⭐ ${P().xp}</b><span>points XP</span></div></div>
    <div class="card"><h3>Mon niveau</h3>${S.diag ? `<p style="margin:0 0 12px"><b style="font-size:22px">${S.diag.level}${S.diag.capped ? '+' : ''} · ${(Diag.INFO[S.diag.levelNum] || ['', ''])[1]}</b></p>${Diag.bars(S.diag)}` : '<p class="mut" style="margin:0">Fais le diagnostic pour découvrir ton niveau.</p>'}</div>
    <div class="card"><h3>Badges</h3><p class="mut" style="margin:0">Tes premiers badges arriveront avec tes premières leçons. 🏆</p></div>`,
  settings: () => `<div class="card">
      <div class="row"><span>Sons</span><button class="tog" role="switch" aria-label="Sons" aria-checked="${S.sound}" data-act="sound"></button></div>
      <div class="row"><span>Vibrations (expérimental)</span><button class="tog" role="switch" aria-label="Vibrations" aria-checked="${S.haptics}" data-act="haptics"></button></div>
      <div class="row"><span>Thème</span><div class="seg">${[['light', 'Clair'], ['dark', 'Sombre'], ['auto', 'Auto']].map(([v, n]) =>
        `<button data-act="theme" data-v="${v}" aria-pressed="${S.theme === v}">${n}</button>`).join('')}</div></div></div>
    <div class="card"><h3>Mes données</h3><p class="mut" style="margin:0 0 10px;font-size:15px">Tout reste sur ton iPhone. Fais une sauvegarde de temps en temps.</p>
      <button class="big" style="margin:0" data-act="export">Sauvegarder mes données</button></div>
    <div class="card"><h3>Mon niveau</h3><p class="mut" style="margin:0 0 10px;font-size:15px">${P().diagnosticDone ? 'Niveau actuel : <b>' + P().level + '</b>.' : 'Pas encore de diagnostic pour cette langue.'}</p>
      <button class="big" style="margin:0" data-act="diag">${P().diagnosticDone ? 'Refaire le diagnostic' : 'Commencer le diagnostic'}</button></div>
    <div class="card"><h3>Contenu des langues</h3>
      ${LANGS.map(l => { const t = Lang.stats(l.code); return `<div class="row"><span>${l.flag} ${l.name}</span><small>${t.vocab} mots · ${t.grammar} règles · ${t.sentences} phrases</small></div>`; }).join('')}
      <button class="big" style="margin:12px 0 0" data-act="check">Vérifier le contenu</button><div id="chk" class="mut" style="margin-top:10px;font-size:14px"></div></div>
    <div class="card"><h3>Diagnostic technique</h3><p class="mut" style="margin:0 0 10px;font-size:15px">En cas d'erreur de stockage, touche ce bouton et envoie-moi une capture.</p>
      <button class="big" style="margin:0" data-act="dbtest">Tester la mémoire</button>
      <div id="dbt" class="mut" style="margin-top:10px;font-size:14px">${(window.__dbErr || []).slice(-3).map(d => '⚠️ ' + d.store + ' · ' + d.name + ' — ' + d.message).join('<br>')}</div></div>
    <p class="mut" style="text-align:center;font-size:13px">Langues · étape 7</p>`
};

function render() {
  document.documentElement.dataset.lang = S.lang;
  $('#sw').innerHTML = LANGS.map(l => `<button data-lang="${l.code}" aria-pressed="${l.code === S.lang}" aria-label="${l.name}">${l.flag} ${l.code.toUpperCase()}</button>`).join('');
  $('#tabs').innerHTML = TABS.map(([k, i, n]) => `<button data-tab="${k}" role="tab" aria-selected="${k === S.tab}"><span>${i}</span>${n}</button>`).join('');
  const v = $('#view'); v.innerHTML = VIEWS[S.tab](); v.style.animation = 'none'; void v.offsetWidth; v.style.animation = '';
}

async function refresh() {
  S.profile = await DB.getProfile(S.lang); S.diag = await Diag.latest(S.lang);
  S.block = await Plan.currentBlock(S.lang); S.lessons = S.block ? await Plan.lessons(S.block.id) : [];
}
async function runDiag() {
  const r = await Diag.run({ lang: S.lang });
  if (!r || r.status !== 'done') S.skipDiag[S.lang] = true; // pas de relance automatique pendant cette session
  else { try { await Plan.generateBlock(S.lang); S.tab = 'lessons'; toast('Tes 5 leçons sont prêtes ! 🎉'); } catch (e) { toast('Leçons non créées : ' + e.message); } }
  await refresh(); render();
}
// Première utilisation d'une langue : le diagnostic se lance automatiquement (avec un bouton « Plus tard »).
function maybeDiag() { if (S.profile && !S.profile.diagnosticDone && !S.skipDiag[S.lang]) runDiag().catch(e => toast('Erreur : ' + e.message)); }

async function exportData() {
  const f = new File([JSON.stringify(await DB.exportAll(), null, 1)], 'sauvegarde-langues.json', { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f] });
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; a.click(); }
  } catch (e) { if (e.name !== 'AbortError') toast('Sauvegarde impossible : ' + e.message); }
}

document.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (!['good', 'bad', 'streak', 'haptics', 'hlevel', 'htest'].includes(b.dataset.act)) H.run('tap');
  try {
    if (b.dataset.lang && b.dataset.lang !== S.lang) {
      S.lang = b.dataset.lang; await DB.setSetting('lang', S.lang); await refresh(); render(); maybeDiag();
    } else if (b.dataset.tab) { S.tab = b.dataset.tab; render(); }
    else switch (b.dataset.act) {
      case 'good': Fx.good(10); break;
      case 'bad': Fx.bad(); break;
      case 'streak': Fx.streak(7); break;
      case 'start': S.tab = 'lessons'; render(); break;
      case 'makeblock': await Plan.generateBlock(S.lang); await refresh(); render(); toast('Tes 5 leçons sont prêtes ! 🎉'); break;
      case 'lesson': {
        const l = S.lessons.find(x => x.id === b.dataset.id), cur = S.lessons.findIndex(x => x.status !== 'done'); if (!l) break;
        if (l.status === 'done') { toast('Leçon terminée ✓ Score : ' + l.score + ' %'); break; }
        if (l.order - 1 > cur) { toast('🔒 Termine d\'abord la leçon précédente'); break; }
        await Exo.start({ lang: S.lang, exercises: l.exercises, lessonId: l.id, blockId: S.block.id, onFinish: sum => Plan.complete(l.id, sum) });
        await refresh(); render(); break;
      }
      case 'diag': if (P().diagnosticDone && !confirm('Refaire le diagnostic ? Ton niveau actuel sera remplacé.')) break; await runDiag(); break;
      case 'sound': S.sound = !S.sound; await DB.setSetting('sound', S.sound); render(); if (S.sound) Fx.good(); break;
      case 'haptics': S.haptics = !S.haptics; if (S.haptics) H.run('good'); await DB.setSetting('haptics2', S.haptics); render(); break;
      case 'hlevel': S.hLevel = +b.dataset.v; H.run('good'); await DB.setSetting('hLevel', S.hLevel); render(); break;
      case 'htest': H.run(b.dataset.v); break;
      case 'theme': S.theme = b.dataset.v; await DB.setSetting('theme', S.theme); applyTheme(); render(); break;
      case 'practice': await Exo.start({ lang: S.lang }); await refresh(); render(); break;
      case 'dbtest': await dbTest(); break;
      case 'export': exportData(); break;
      case 'check': { const out = LANGS.flatMap(l => Lang.validate(l.code).map(e => l.code.toUpperCase() + ' : ' + e));
        $('#chk').innerHTML = out.length ? '⚠️ ' + out.slice(0, 6).join('<br>') : '✅ Tout est cohérent : aucun doublon, aucune règle manquante.';
        if (!out.length) Fx.good(); break; }
    }
  } catch (err) { toast('Oups, une erreur est survenue : ' + err.message); }
});
let lastDbToast = 0;
window.addEventListener('db-error', e => {           // une seule alerte toutes les 20 s, avec le nom exact de l'erreur
  if (Date.now() - lastDbToast < 20000) return; lastDbToast = Date.now();
  const d = e.detail || {}; toast('Erreur de stockage (' + (d.store || '?') + ' · ' + (d.name || '?') + ')');
});
async function dbTest() {
  const T = '_t', now = Date.now(), out = [];
  const tests = [
    ['Réglages', () => DB.put('settings', { key: '_t', value: 1 })],
    ['Profils', () => DB.put('profiles', { lang: T })],
    ['Réponses', () => DB.add('attempts', { lang: T, lessonId: T, blockId: 'en.b1', type: 'qcm', itemId: 'x', correct: true, ts: now })],
    ['Mémoire des mots', () => DB.put('srs', { id: '_t', lang: T, box: 1, due: now })],
    ['Blocs', () => DB.put('blocks', { id: '_t', lang: T })],
    ['Leçons', () => DB.put('lessons', { id: '_t', lang: T, blockId: '_t' })],
    ['Bilans', () => DB.put('reports', { id: '_t', lang: T })],
    ['Badges', () => DB.put('badges', { id: '_t', lang: T })]
  ];
  for (const [n, f] of tests) { try { await f(); out.push('✅ ' + n); } catch (e) { out.push('❌ ' + n + ' : ' + e.name + ' — ' + e.message); } }
  try { await DB.purgeLang(T); await DB.del('settings', '_t'); out.push('✅ Nettoyage'); } catch (e) { out.push('❌ Nettoyage : ' + e.name); }
  $('#dbt').innerHTML = out.join('<br>');
}

// ---------- Démarrage ----------
(async function init() {
  H.init(); $('#splash .mhold').innerHTML = mascot();
  try {
    await Lang.loadAll(); LANGS = Lang.list(); if (!LANGS.length) throw new Error('Aucune langue chargée');
    await DB.open();
    S.lang = await DB.getSetting('lang', 'en'); S.sound = await DB.getSetting('sound', true); S.theme = await DB.getSetting('theme', 'light'); S.haptics = await DB.getSetting('haptics2', false); S.hLevel = await DB.getSetting('hLevel', 1);
    if (!LANGS.some(l => l.code === S.lang)) S.lang = LANGS[0].code;
    await refresh(); DB.persist();
    applyTheme(); render(); $('#app').hidden = false; $('#splash').classList.add('off'); setTimeout(maybeDiag, 500);
  } catch (e) {
    $('#splash p').innerHTML = "Impossible de démarrer l'app.<br><small>Ferme l'app et rouvre-la. Si ça continue, le stockage de Safari est peut-être plein.</small>";
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
