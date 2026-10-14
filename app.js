// ===== הגדרות Firebase — להדביק כאן את ה-config מהפרויקט שלך =====
const firebaseConfig = {
  apiKey: "AIzaSyBAdwgTH7hxoYg9lpOF0L9zssOXaNTuIYw",
  authDomain: "koah-adam-miluim.firebaseapp.com",
  projectId: "koah-adam-miluim",
  storageBucket: "koah-adam-miluim.firebasestorage.app",
  messagingSenderId: "284946540672",
  appId: "1:284946540672:web:dfd3690743a0d720c41e65",
};
// ==================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, onSnapshot, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const fb = initializeApp(firebaseConfig);
const auth = getAuth(fb);
const db = getFirestore(fb);
const DOC = doc(db, "unit", "main");

const GROUPS = [
  { id: "staff", name: 'מפל"ג וסמפל"ג' },
  { id: "1a", name: "צוות 1א" },
  { id: "1b", name: "צוות 1ב" },
  { id: "1c", name: "צוות 1ג" },
];

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = () => ymd(new Date());
const fmt = (s) => { const [y, m, d] = s.split("-"); return `${+d}.${+m}`; };

let state = { people: [] };
let calMonth = new Date(); calMonth.setDate(1);
let unsub = null;

function seed() {
  const p = [
    { id: uid(), group: "staff", role: 'מפל"ג', name: "", requests: [] },
    { id: uid(), group: "staff", role: 'סמפל"ג', name: "", requests: [] },
  ];
  for (const g of ["1a", "1b", "1c"]) {
    p.push({ id: uid(), group: g, role: 'מפק"צ', name: "", requests: [] });
    p.push({ id: uid(), group: g, role: 'סמפק"צ', name: "", requests: [] });
    for (let i = 0; i < 7; i++) p.push({ id: uid(), group: g, role: "לוחם", name: "", requests: [] });
  }
  return { people: p };
}

async function save() {
  $("#syncState").textContent = "שומר…";
  try { await setDoc(DOC, state); $("#syncState").textContent = "נשמר · מתעדכן אוטומטית"; }
  catch (e) { $("#syncState").textContent = "שגיאה בשמירה"; alert("השמירה נכשלה: " + e.message); }
}

const isOut = (p, day) => p.requests.some((r) => r.from <= day && day <= r.to);
const upcoming = (p) => (p.inactive ? [] : p.requests.filter((r) => r.to >= today()));

const QUALS = [
  { id: "tomat", label: 'נט"ר תומ"ת' },
  { id: "alpha", label: 'נט"ר אלפ"א' },
  { id: "kavan", label: "כוון" },
  { id: "mefaktz", label: 'מפק"צ' },
];
// אם עוד לא הוגדרו הכשרות, מי שהתפקיד שלו מפק"צ/סמפק"צ נחשב מפק"צ
const quals = (p) => p.quals || { mefaktz: /מפק"צ/.test(p.role || "") };

// ---------- auth ----------
const show = (id) => ["#loading", "#login", "#app"].forEach((s) => $(s).classList.toggle("hidden", s !== id));

$("#loginBtn").onclick = async () => {
  const prov = new GoogleAuthProvider();
  try { await signInWithPopup(auth, prov); }
  catch (e) {
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") await signInWithRedirect(auth, prov);
    else $("#loginMsg").textContent = "שגיאה: " + e.message;
  }
};
$("#logoutBtn").onclick = () => signOut(auth);
getRedirectResult(auth).catch(() => {});

onAuthStateChanged(auth, async (user) => {
  if (unsub) { unsub(); unsub = null; }
  if (!user) { $("#loginMsg").innerHTML = ""; show("#login"); return; }
  show("#loading");
  try {
    const snap = await getDoc(DOC);
    if (!snap.exists()) { state = seed(); await setDoc(DOC, state); }
  } catch (e) {
    await signOut(auth);
    $("#loginMsg").innerHTML = `אין הרשאה לחשבון הזה.<br>אם זה החשבון שלך, הדבק את המזהה הזה בחוקי ה-Firestore:<code>${esc(user.uid)}</code>`;
    show("#login");
    return;
  }
  unsub = onSnapshot(DOC, (s) => { if (s.exists()) { state = s.data(); state.people ||= []; state.tasks ||= []; render(); } });
  show("#app");
});

// ---------- tabs ----------
document.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => {
  document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("active", x === b));
  ["roster", "calendar", "tasks"].forEach((t) => $("#tab-" + t).classList.toggle("hidden", b.dataset.tab !== t));
}));

function render() { renderRoster(); renderCalendar(); renderTasks(); }

// ---------- qualification counts ----------
const QCOLS = [
  { id: "mefaktz", label: 'מפק"צ' }, { id: "tomat", label: 'תומ"ת' },
  { id: "alpha", label: 'אלפ"א' }, { id: "kavan", label: "כוון" },
];
const qCount = (ps) => Object.fromEntries(QCOLS.map((c) => [c.id, ps.filter((p) => quals(p)[c.id]).length]));
function qualTable(day, dayLabel) {
  const active = state.people.filter((p) => !p.inactive);
  const present = active.filter((p) => !isOut(p, day));
  const a = qCount(present), b = qCount(active);
  return `<div class="qtable"><table>
    <tr><th></th>${QCOLS.map((c) => `<th>${c.label}</th>`).join("")}<th>סה"כ</th></tr>
    <tr><td>${dayLabel}</td>${QCOLS.map((c) => `<td><b>${a[c.id]}</b></td>`).join("")}<td><b>${present.length}</b></td></tr>
    <tr class="muted"><td>בתקופה</td>${QCOLS.map((c) => `<td>${b[c.id]}</td>`).join("")}<td>${active.length}</td></tr>
  </table></div>`;
}

// ---------- roster ----------
function teamSplit(ps, day) {
  const avail = ps.filter((p) => !p.inactive && !isOut(p, day));
  const cmd = avail.filter((p) => quals(p).mefaktz).length;
  return { cmd, rest: avail.length - cmd, total: avail.length };
}

function qualTags(p) {
  const q = quals(p);
  return QUALS.filter((k) => q[k.id]).map((k) => `<span class="tag">${k.label}</span>`).join("");
}

function renderRoster() {
  const t = today();
  const active = state.people.filter((p) => !p.inactive);
  const inactiveN = state.people.length - active.length;
  const outToday = active.filter((p) => isOut(p, t)).length;
  const staff = state.people.filter((p) => p.group === "staff");
  let h = `<div class="staff-strip">${staff.map((p) => `<button class="staff-chip ${p.inactive ? "inactive" : ""}" data-person="${p.id}">
      <span class="muted">${esc(p.role)}</span> ${esc(p.name || "—")}</button>`).join("")}
      <button class="staff-chip add" data-add="staff">+</button></div>
    ${qualTable(t, "היום")}
    <div class="stats">
    <div class="stat"><b>${active.length}</b><span>בתקופה</span></div>
    <div class="stat"><b>${active.length - outToday}</b><span>נוכחים היום</span></div>
    <div class="stat"><b>${outToday}</b><span>בחוץ היום</span></div>
    <div class="stat"><b>${inactiveN}</b><span>לא בתקופה</span></div>
  </div><div class="groups">`;
  for (const g of GROUPS.filter((g) => g.id !== "staff")) {
    const ps = state.people.filter((p) => p.group === g.id)
      .sort((a, b) => (a.inactive ? 1 : 0) - (b.inactive ? 1 : 0));
    const s = teamSplit(ps, t);
    const head = g.id === "staff"
      ? `<span class="muted">${s.total} זמינים</span>`
      : `<span class="split" title="מפק&quot;צים + שאר הצוות, זמינים היום">${s.cmd}+${s.rest}</span>`;
    h += `<div class="${g.id === "staff" ? "g-staff" : ""}">
      <div class="group-head"><h2>${g.name}</h2>${head}</div>
      <div class="card">`;
    for (const p of ps) {
      const out = !p.inactive && isOut(p, t), up = upcoming(p).length;
      const badge = p.inactive ? `<span class="badge off">לא בתקופה</span>`
        : out ? `<span class="badge out">בחוץ</span>`
        : up ? `<span class="badge req">${up} בקשות</span>` : "";
      h += `<div class="row ${p.inactive ? "inactive" : ""}" data-person="${p.id}">
        <div class="who"><span class="name ${p.name ? "" : "empty"}">${esc(p.name || "ללא שם")}</span>
          <span class="tags">${qualTags(p)}</span></div>
        ${badge}<span class="role">${esc(p.role)}</span><span class="chev">‹</span></div>`;
    }
    h += `<div class="add-row"><button data-add="${g.id}">+ הוספת אדם</button></div></div></div>`;
  }
  $("#tab-roster").innerHTML = h + "</div>";
  $("#tab-roster").querySelectorAll("[data-person]").forEach((el) => (el.onclick = () => openPerson(el.dataset.person)));
  $("#tab-roster").querySelectorAll("[data-add]").forEach((el) => (el.onclick = () => {
    const p = { id: uid(), group: el.dataset.add, role: "לוחם", name: "", requests: [], quals: {} };
    state.people.push(p); save(); openPerson(p.id);
  }));
}

// ---------- person sheet ----------
const sheet = $("#sheet");
const closeSheet = () => sheet.classList.add("hidden");
sheet.addEventListener("click", (e) => { if (e.target.hasAttribute("data-close")) closeSheet(); });

function openPerson(id) {
  const p = state.people.find((x) => x.id === id);
  if (!p) return;
  const q = quals(p);
  const reqs = [...p.requests].sort((a, b) => a.from.localeCompare(b.from));
  const t = today();
  const reqHtml = reqs.length ? reqs.map((r) => `<div class="req" style="${r.to < t ? "opacity:.55" : ""}">
      <div><div class="d">${fmt(r.from)}${r.to !== r.from ? " – " + fmt(r.to) : ""}</div>
      ${r.reason ? `<div class="why">${esc(r.reason)}</div>` : ""}</div>
      <button class="btn icon danger" data-delreq="${r.id}">✕</button></div>`).join("")
    : `<div class="empty-note">אין בקשות יציאה.</div>`;

  $("#sheetBody").innerHTML = `
    <div class="sheet-top"><h2>${esc(p.name || "חייל חדש")}</h2><button class="btn icon" data-close>✕</button></div>
    <label>שם</label><input id="fName" value="${esc(p.name)}" placeholder="שם מלא">
    <div class="two">
      <div><label>תפקיד</label><input id="fRole" value="${esc(p.role)}"></div>
      <div><label>צוות</label><select id="fGroup">${GROUPS.map((g) => `<option value="${g.id}" ${g.id === p.group ? "selected" : ""}>${g.name}</option>`).join("")}</select></div>
    </div>
    <label>הכשרות</label>
    <div class="chips">${QUALS.map((k) => `<label class="chip"><input type="checkbox" data-q="${k.id}" ${q[k.id] ? "checked" : ""}><span>${k.label}</span></label>`).join("")}</div>
    <label class="switch"><input type="checkbox" id="fInactive" ${p.inactive ? "checked" : ""}>
      <span>לא מגיע כל התקופה<small>לא נספר בנוכחות ולא מופיע כבעל בקשות</small></span></label>
    <div class="actions"><button class="btn primary" id="saveP">שמירה</button></div>

    <div class="sec-title">בקשות יציאה</div>
    ${reqHtml}
    <div class="two"><div><label>מתאריך</label><input type="date" id="rFrom" value="${t}"></div>
      <div><label>עד תאריך</label><input type="date" id="rTo" value="${t}"></div></div>
    <label>סיבה (לא חובה)</label><input id="rWhy" placeholder="למשל: אירוע משפחתי">
    <div class="actions"><button class="btn outline" id="addReq">+ הוספת בקשה</button></div>

    <div class="actions" style="margin-top:28px"><button class="btn danger" id="delP">מחיקת האדם</button></div>`;
  sheet.classList.remove("hidden");

  const readForm = () => {
    p.name = $("#fName").value.trim(); p.role = $("#fRole").value.trim(); p.group = $("#fGroup").value;
    p.quals = {};
    $("#sheetBody").querySelectorAll("[data-q]").forEach((c) => { p.quals[c.dataset.q] = c.checked; });
    p.inactive = $("#fInactive").checked;
  };
  $("#saveP").onclick = () => { readForm(); save(); closeSheet(); };
  $("#rFrom").onchange = () => { if ($("#rTo").value < $("#rFrom").value) $("#rTo").value = $("#rFrom").value; };
  $("#addReq").onclick = () => {
    const from = $("#rFrom").value, to = $("#rTo").value;
    if (!from || !to) return alert("צריך לבחור תאריכים");
    if (to < from) return alert("תאריך הסיום לפני ההתחלה");
    readForm();
    p.requests.push({ id: uid(), from, to, reason: $("#rWhy").value.trim() });
    save(); openPerson(id);
  };
  $("#sheetBody").querySelectorAll("[data-delreq]").forEach((b) => (b.onclick = () => {
    if (!confirm("למחוק את הבקשה?")) return;
    readForm();
    p.requests = p.requests.filter((r) => r.id !== b.dataset.delreq); save(); openPerson(id);
  }));
  $("#delP").onclick = () => {
    if (!confirm(`למחוק את ${p.name || "האדם הזה"}?`)) return;
    state.people = state.people.filter((x) => x.id !== id); save(); closeSheet();
  };
}

// ---------- daily minimum ----------
const MIN = { cmd: 4, fighters: 20, kavan: 3, tomat: 3, alpha: 1 };

function combos(arr, k, start = 0, cur = [], out = []) {
  if (cur.length === k) { out.push(cur.slice()); return out; }
  for (let i = start; i < arr.length; i++) { cur.push(arr[i]); combos(arr, k, i + 1, cur, out); cur.pop(); }
  return out;
}

// בודק לוחמים: כמה כוונים, והאם אפשר לשבץ נהגים כשאדם אחד לא יכול להיות גם תומ"ת וגם אלפ"א
function fighterCheck(fs) {
  const q = fs.map(quals);
  const kavan = q.filter((x) => x.kavan).length;
  const T = q.filter((x) => x.tomat && !x.alpha).length;
  const A = q.filter((x) => x.alpha && !x.tomat).length;
  const B = q.filter((x) => x.tomat && x.alpha).length;
  const tomatMax = T + B, alphaMax = A + B, driversOk = T + B >= MIN.tomat && A + B >= MIN.alpha && T + A + B >= MIN.tomat + MIN.alpha;
  return { n: fs.length, kavan, tomatMax, alphaMax, driversOk,
    ok: fs.length >= MIN.fighters && kavan >= MIN.kavan && driversOk };
}

function dayStatus(day) {
  const present = state.people.filter((p) => !p.inactive && !isOut(p, day));
  const cmds = present.filter((p) => quals(p).mefaktz);
  const others = present.filter((p) => !quals(p).mefaktz);
  let best = null;
  if (cmds.length >= MIN.cmd) {
    // מפק"צים עודפים נספרים כלוחמים — בוחרים את 4 המפק"צים שמשאירים את הלוחמים הכי טובים
    for (const pick of combos(cmds, MIN.cmd)) {
      const f = fighterCheck(others.concat(cmds.filter((c) => !pick.includes(c))));
      if (!best || (f.ok && !best.ok)) best = f;
      if (f.ok) break;
    }
  } else best = fighterCheck(others);
  const cmdOk = cmds.length >= MIN.cmd;
  const missing = [];
  if (!cmdOk) missing.push(`חסרים ${MIN.cmd - cmds.length} מפק"צים (יש ${cmds.length})`);
  if (best.n < MIN.fighters) missing.push(`חסרים ${MIN.fighters - best.n} לוחמים (יש ${best.n})`);
  if (best.kavan < MIN.kavan) missing.push(`חסרים ${MIN.kavan - best.kavan} כוונים (יש ${best.kavan})`);
  if (!best.driversOk) {
    if (best.tomatMax < MIN.tomat) missing.push(`חסרים נהגי תומ"ת (יש ${best.tomatMax})`);
    else if (best.alphaMax < MIN.alpha) missing.push(`חסר נהג אלפ"א`);
    else missing.push(`אין מספיק נהגים כדי לשבץ ${MIN.tomat} תומ"ת ו-${MIN.alpha} אלפ"א בלי כפילות`);
  }
  return { ok: cmdOk && best.ok, missing, cmds: cmds.length, fighters: best.n, kavan: best.kavan, tomat: best.tomatMax, alpha: best.alphaMax };
}

// ---------- calendar ----------
const MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

function renderCalendar() {
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  const days = new Date(y, m + 1, 0).getDate(), first = new Date(y, m, 1).getDay(), t = today();
  const active = state.people.filter((p) => !p.inactive);
  let bad = 0;
  let h = `<div class="cal-head">
      <button class="btn icon" id="calPrev">›</button>
      <h2>${MONTHS[m]} ${y}</h2>
      <button class="btn icon" id="calNext">‹</button></div>
    <p class="muted" id="calSummary"></p>
    <div class="legend"><span><i style="background:var(--ok-soft);border:1px solid var(--ok)"></i>תקין</span><span><i style="background:var(--bad-soft);border:1px solid var(--bad)"></i>לא תקין</span><span>לחצו על יום כדי לראות פירוט</span></div>
    <div class="cal">${["א׳","ב׳","ג׳","ד׳","ה׳","ו׳","ש׳"].map((d) => `<div class="dow">${d}</div>`).join("")}`;
  for (let i = 0; i < first; i++) h += `<div></div>`;
  for (let d = 1; d <= days; d++) {
    const key = ymd(new Date(y, m, d));
    const out = active.filter((p) => isOut(p, key)).length;
    const st = dayStatus(key); if (!st.ok) bad++;
    h += `<div class="day ${st.ok ? "good" : "bad"} ${key === t ? "today" : ""}" data-day="${key}">
      <span class="n">${d}</span><span class="cnt">${out ? `${out} בחוץ` : ""}<br>${active.length - out} נוכחים</span></div>`;
  }
  h += `</div><details class="rules"><summary>איך נקבע אם תקין</summary><ul>
    <li>בכל יום צריך לפחות ${MIN.cmd} מפק"צים ועוד ${MIN.fighters} לוחמים.</li>
    <li>מתוך הלוחמים: לפחות ${MIN.kavan} כוונים, ${MIN.tomat} נהגי תומ"ת ו-${MIN.alpha} נהג אלפ"א.</li>
    <li>נהג יכול להיחשב גם ככוון. אדם אחד לא יכול להיחשב גם כנהג תומ"ת וגם כנהג אלפ"א.</li>
    <li>מפק"צים מעבר ל-${MIN.cmd} נספרים כלוחמים. גם המפל"ג והסמפל"ג נספרים לפי ההכשרות שלהם.</li>
    <li>מי שבבקשת יציאה או מסומן "לא בתקופה" לא נספר.</li></ul></details>`;
  $("#tab-calendar").innerHTML = h;
  $("#calSummary").textContent = bad ? `${bad} מתוך ${days} הימים לא תקינים` : `כל ${days} הימים תקינים`;
  $("#calPrev").onclick = () => { calMonth.setMonth(m - 1); renderCalendar(); };
  $("#calNext").onclick = () => { calMonth.setMonth(m + 1); renderCalendar(); };
  $("#tab-calendar").querySelectorAll("[data-day]").forEach((el) => (el.onclick = () => openDay(el.dataset.day)));
}

function openDay(key) {
  const out = state.people.filter((p) => !p.inactive && isOut(p, key));
  const gname = (id) => GROUPS.find((g) => g.id === id)?.name || "";
  const splits = GROUPS.filter((g) => g.id !== "staff").map((g) => {
    const s = teamSplit(state.people.filter((p) => p.group === g.id), key);
    return `<div class="stat"><b>${s.cmd}+${s.rest}</b><span>${g.name}</span></div>`;
  }).join("");
  $("#sheetBody").innerHTML = `
    <div class="sheet-top"><h2>${fmt(key)} · ${out.length} בחוץ</h2><button class="btn icon" data-close>✕</button></div>
    ${(() => { const st = dayStatus(key); return `<div class="verdict ${st.ok ? "good" : "bad"}"><b>${st.ok ? "תקין" : "לא תקין"}</b>
      ${st.missing.length ? `<ul>${st.missing.map((m) => `<li>${m}</li>`).join("")}</ul>` : ""}
      </div>`; })()}
    ${qualTable(key, "ביום הזה")}
    <div class="stats">${splits}</div>
    ${out.length ? `<div class="card out-list">${out.map((p) => {
      const r = p.requests.find((r) => r.from <= key && key <= r.to);
      return `<div class="row"><span class="name">${esc(p.name || "ללא שם")}</span>
        <span class="role">${esc(gname(p.group))}${r?.reason ? " · " + esc(r.reason) : ""}</span></div>`;
    }).join("")}</div>` : `<div class="empty-note">כולם נוכחים ביום הזה.</div>`}`;
  sheet.classList.remove("hidden");
}

// ---------- tasks ----------
let showDone = false;
function renderTasks() {
  const t = today();
  const tasks = state.tasks || [];
  const open = tasks.filter((x) => !x.done).sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
  const done = tasks.filter((x) => x.done).sort((a, b) => (b.doneAt || "").localeCompare(a.doneAt || ""));
  const item = (x) => {
    const late = !x.done && x.due && x.due < t;
    return `<div class="task ${x.done ? "done" : ""}">
      <button class="check" data-toggle="${x.id}" aria-label="סימון">${x.done ? "✓" : ""}</button>
      <div class="task-body" data-edit="${x.id}">
        <div class="task-title">${esc(x.title)}</div>
        ${x.due || x.note ? `<div class="task-meta">${x.due ? `<span class="${late ? "late" : ""}">${late ? "באיחור · " : ""}${fmt(x.due)}</span>` : ""}${x.note ? `<span>${esc(x.note)}</span>` : ""}</div>` : ""}
      </div></div>`;
  };
  $("#tab-tasks").innerHTML = `
    <div class="task-add">
      <input id="tNew" placeholder="משימה חדשה…" enterkeyhint="done">
      <button class="btn primary" id="tAddBtn">הוספה</button>
    </div>
    <div class="group-head"><h2>פתוחות</h2><span class="muted">${open.length}</span></div>
    ${open.length ? `<div class="card">${open.map(item).join("")}</div>` : `<div class="empty-note">אין משימות פתוחות.</div>`}
    ${done.length ? `<button class="done-toggle" id="tDoneToggle">${showDone ? "▾" : "◂"} בוצעו (${done.length})</button>
      ${showDone ? `<div class="card">${done.map(item).join("")}</div>` : ""}` : ""}`;
  const add = () => {
    const title = $("#tNew").value.trim(); if (!title) return;
    state.tasks = [...tasks, { id: uid(), title, due: "", note: "", done: false, created: t }];
    save();
  };
  $("#tAddBtn").onclick = add;
  $("#tNew").onkeydown = (e) => { if (e.key === "Enter") add(); };
  $("#tab-tasks").querySelectorAll("[data-toggle]").forEach((b) => (b.onclick = () => {
    const x = tasks.find((k) => k.id === b.dataset.toggle);
    x.done = !x.done; x.doneAt = x.done ? t : ""; save();
  }));
  $("#tab-tasks").querySelectorAll("[data-edit]").forEach((el) => (el.onclick = () => openTask(el.dataset.edit)));
  const dt = $("#tDoneToggle"); if (dt) dt.onclick = () => { showDone = !showDone; renderTasks(); };
}

function openTask(id) {
  const x = state.tasks.find((k) => k.id === id); if (!x) return;
  $("#sheetBody").innerHTML = `
    <div class="sheet-top"><h2>משימה</h2><button class="btn icon" data-close>✕</button></div>
    <label>מה צריך לעשות</label><input id="eTitle" value="${esc(x.title)}">
    <label>תאריך יעד (לא חובה)</label><input type="date" id="eDue" value="${esc(x.due)}">
    <label>הערות (לא חובה)</label><textarea id="eNote">${esc(x.note)}</textarea>
    <div class="actions"><button class="btn primary" id="eSave">שמירה</button></div>
    <div class="actions" style="margin-top:20px"><button class="btn danger" id="eDel">מחיקת המשימה</button></div>`;
  sheet.classList.remove("hidden");
  $("#eSave").onclick = () => {
    x.title = $("#eTitle").value.trim() || x.title; x.due = $("#eDue").value; x.note = $("#eNote").value.trim();
    save(); closeSheet();
  };
  $("#eDel").onclick = () => {
    if (!confirm("למחוק את המשימה?")) return;
    state.tasks = state.tasks.filter((k) => k.id !== id); save(); closeSheet();
  };
}
