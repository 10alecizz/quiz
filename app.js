// ===== Configuración =====
const QUIZZES = [
  { file: "data/campeones.json", icon: "⚔️" },
  { file: "data/grieta.json",    icon: "🗺️" },
  { file: "data/cultura.json",   icon: "🏆" }
];
const N = 10;          // preguntas por partida
const HINT_VALUE = 0.5; // puntos si aciertas usando la pista

const app = document.getElementById("app");
let data = [], S = null;

// ===== Utilidades =====
const esc = t => String(t).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fmt = n => Number.isInteger(n) ? n : n.toFixed(1);
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)) || []; } catch { return []; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const rankKey = i => "lolquiz_ranking_" + i;

// ===== Menú principal =====
async function menu() {
  app.innerHTML = '<h1>Quiz de League of Legends</h1><p class="sub center">Elige un quiz. Cada partida tiene ' + N + ' preguntas al azar.</p><div class="menu" id="m"></div>';
  try {
    if (!data.length) {
      try {
        data = await Promise.all(QUIZZES.map(async q => {
          const r = await fetch(q.file); if (!r.ok) throw new Error(r.status); return r.json();
        }));
      } catch (e) {
        // Sin servidor (file://) fetch falla: se usa la copia data/respaldo.js
        if (window.QUIZ_DATA) data = window.QUIZ_DATA; else throw e;
      }
    }
  } catch (e) {
    app.innerHTML = '<h1>Quiz de League of Legends</h1><div class="err"><b>No se han podido cargar los archivos JSON.</b><br>Los navegadores bloquean fetch() al abrir index.html con doble clic. Abre la carpeta con un servidor local: en VS Code usa la extensión Live Server, o en una terminal ejecuta <code>python3 -m http.server 8000</code> y entra en http://localhost:8000</div>';
    return;
  }
  const m = document.getElementById("m");
  data.forEach((d, i) => {
    const b = document.createElement("button");
    b.className = "card";
    b.innerHTML = `<b>${QUIZZES[i].icon} ${esc(d.titulo)}</b><small>${esc(d.descripcion)} (${d.preguntas.length} preguntas)</small>`;
    b.onclick = () => start(i);
    m.appendChild(b);
  });
  const r = document.createElement("button");
  r.textContent = "🏅 Ver ranking";
  r.onclick = () => ranking(0);
  m.appendChild(r);
}

// ===== Partida =====
function start(i) {
  const qs = shuffle(data[i].preguntas).slice(0, N).map(p => ({
    q: p.q, h: p.h, img: p.img,
    o: shuffle(p.o.map((t, k) => ({ t, ok: k === p.a })))   // también se barajan las respuestas
  }));
  S = { i, qs, n: 0, score: 0, sel: null, done: false, hint: false, off: [], saved: false };
  paint();
}

function paint() {
  const q = S.qs[S.n], last = S.n === S.qs.length - 1;
  const opts = q.o.map((o, k) => {
    let c = "opt";
    if (S.done) { if (o.ok) c += " ok"; else if (k === S.sel) c += " bad"; }
    else if (k === S.sel) c += " sel";
    if (S.off.includes(k)) c += " off";
    return `<button class="${c}" data-k="${k}" ${S.done || S.off.includes(k) ? "disabled" : ""}>${esc(o.t)}</button>`;
  }).join("");
  app.innerHTML = `
    <div class="top"><span>${esc(data[S.i].titulo)}</span><span>Pregunta ${S.n + 1} de ${S.qs.length} · Puntos: ${fmt(S.score)}</span></div>
    <div class="bar"><i style="width:${(S.n + (S.done ? 1 : 0)) / S.qs.length * 100}%"></i></div>
    ${q.img ? `<img class="q-img" src="${esc(q.img)}" alt="">` : ""}
    <h2 class="q">${esc(q.q)}</h2>
    <div class="opts">${opts}</div>
    ${S.hint ? `<p class="hint">💡 ${esc(q.h || "Sin pista para esta pregunta")}</p>` : ""}
    <div class="row">
      <button class="primary" id="go" ${S.sel === null && !S.done ? "disabled" : ""}>${S.done ? (last ? "Ver resultado" : "Siguiente pregunta") : "Confirmar respuesta"}</button>
      <button id="hint" ${S.done || S.hint ? "disabled" : ""}>💡 Pista (vale ${HINT_VALUE} pt)</button>
    </div>`;
  app.querySelectorAll(".opt").forEach(b => b.onclick = () => { S.sel = +b.dataset.k; paint(); });
  document.getElementById("go").onclick = go;
  document.getElementById("hint").onclick = useHint;
}

function useHint() {
  const q = S.qs[S.n];
  S.hint = true;
  // la pista también descarta una respuesta incorrecta
  const wrong = q.o.map((o, k) => k).filter(k => !q.o[k].ok && k !== S.sel);
  if (wrong.length > 1) S.off = [shuffle(wrong)[0]];
  paint();
}

function go() {
  if (!S.done) {
    S.done = true;
    if (S.qs[S.n].o[S.sel].ok) S.score += S.hint ? HINT_VALUE : 1;
    paint();
  } else if (S.n < S.qs.length - 1) {
    S.n++; S.sel = null; S.done = false; S.hint = false; S.off = [];
    paint();
  } else result();
}

// ===== Resultado y ranking =====
function result() {
  const pct = S.score / S.qs.length;
  const msg = pct === 1 ? "Partida perfecta. Digna de un Pentakill." : pct >= .7 ? "Gran partida, invocador." : pct >= .4 ? "Nada mal. Un entrenamiento más y subes de rango." : "Toca volver a la Grieta a practicar.";
  app.innerHTML = `
    <h1>Resultado</h1>
    <p class="score">${fmt(S.score)} / ${S.qs.length}</p>
    <p class="center">${msg}</p>
    <div class="row" id="saveRow">
      <input id="nm" maxlength="16" placeholder="Tu nombre para el ranking" aria-label="Tu nombre">
      <button id="sv">Guardar puntuación</button>
    </div>
    <div class="row">
      <button class="primary" id="again">Jugar otra vez</button>
      <button id="men">Volver al menú principal</button>
    </div>`;
  document.getElementById("sv").onclick = () => {
    const n = document.getElementById("nm").value.trim() || "Anónimo";
    const r = store.get(rankKey(S.i));
    r.push({ n, p: S.score, d: new Date().toLocaleDateString("es-ES") });
    r.sort((a, b) => b.p - a.p);
    store.set(rankKey(S.i), r.slice(0, 10));
    ranking(S.i);
  };
  document.getElementById("again").onclick = () => start(S.i);
  document.getElementById("men").onclick = menu;
}

function ranking(i) {
  const r = store.get(rankKey(i));
  const tabs = data.map((d, k) => `<button class="${k === i ? "on" : ""}" data-k="${k}">${QUIZZES[k].icon} ${esc(d.titulo)}</button>`).join("");
  app.innerHTML = `
    <h1>Ranking</h1>
    <div class="tabs">${tabs}</div>
    ${r.length ? `<table><tr><th>#</th><th>Jugador</th><th>Puntos</th><th>Fecha</th></tr>${r.map((e, k) => `<tr><td>${k + 1}</td><td>${esc(e.n)}</td><td>${fmt(e.p)}</td><td>${esc(e.d)}</td></tr>`).join("")}</table>` : '<p>Todavía no hay puntuaciones en este quiz. Juega una partida y guarda la tuya.</p>'}
    <div class="row"><button class="primary" id="men">Volver al menú principal</button></div>`;
  app.querySelectorAll(".tabs button").forEach(b => b.onclick = () => ranking(+b.dataset.k));
  document.getElementById("men").onclick = menu;
}

menu();
