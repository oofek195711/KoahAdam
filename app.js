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

// הודעה קצרה בתחתית המסך על כל פעולה
let toastTimer;
function toast(msg, kind = "ok") {
  const el = $("#toast");
  el.textContent = msg; el.className = "toast show " + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = "toast " + kind), kind === "bad" ? 4000 : 2200);
}

let pending = 0;
async function save(msg) {
  pending++;
  $("#syncState").textContent = "שומר…";
  $("#syncState").className = "muted small saving";
  try {
    await setDoc(DOC, state);
    if (msg) toast(msg);
    if (--pending === 0) { $("#syncState").textContent = "✓ הכול נשמר"; $("#syncState").className = "muted small"; }
  } catch (e) {
    pending = Math.max(0, pending - 1);
    $("#syncState").textContent = "⚠ שגיאה בשמירה";
    $("#syncState").className = "muted small err";
    toast("השמירה נכשלה, בדוק חיבור ונסה שוב", "bad");
    console.error(e);
  }
}

// סטטוס בקשה: ממתינה / אושרה / נדחתה. רק בקשה מאושרת מוציאה את החייל מהנוכחות
const reqStatus = (r) => r.status || "pending";
const STATUS_LABEL = { pending: "ממתינה", approved: "אושרה", rejected: "נדחתה" };
const onDay = (r, day) => r.from <= day && day <= r.to;
const isOut = (p, day) => p.requests.some((r) => reqStatus(r) === "approved" && onDay(r, day));
const pendingOn = (p, day) => !p.inactive && p.requests.some((r) => reqStatus(r) === "pending" && onDay(r, day));
const upcoming = (p) => (p.inactive ? [] : p.requests.filter((r) => r.to >= today() && reqStatus(r) === "pending"));
const fmtRange = (r) => `${fmt(r.from)}${r.to !== r.from ? " – " + fmt(r.to) : ""}`;

// כפתורי אשר/דחה. לחיצה על המצב הנוכחי מחזירה לממתינה
function reqButtons(pid, r) {
  const st = reqStatus(r);
  return `<div class="rs">
    <button class="rs-ok ${st === "approved" ? "on" : ""}" data-rs="approved" data-pid="${pid}" data-rid="${r.id}">${st === "approved" ? "✓ אושרה" : "אשר"}</button>
    <button class="rs-no ${st === "rejected" ? "on" : ""}" data-rs="rejected" data-pid="${pid}" data-rid="${r.id}">${st === "rejected" ? "✕ נדחתה" : "דחה"}</button></div>`;
}
function bindReqButtons(root, after) {
  root.querySelectorAll("[data-rs]").forEach((b) => (b.onclick = (e) => {
    e.stopPropagation();
    const p = state.people.find((x) => x.id === b.dataset.pid);
    const r = p?.requests.find((x) => x.id === b.dataset.rid);
    if (!r) return toast("הבקשה כבר לא קיימת", "bad");
    const next = reqStatus(r) === b.dataset.rs ? "pending" : b.dataset.rs;
    r.status = next;
    const who = p.name || "החייל";
    save(next === "approved" ? `אושרה היציאה של ${who} (${fmtRange(r)}) ✓`
      : next === "rejected" ? `נדחתה הבקשה של ${who}` : "הבקשה חזרה לממתינה");
    if (after) after();
  }));
}

const QUALS = [
  { id: "tomat", label: 'נט"ר תומ"ת' },
  { id: "alpha", label: 'נט"ר אלפ"א' },
  { id: "kavan", label: "כוון" },
  { id: "mefaktz", label: 'מפק"צ' },
];
// אם עוד לא הוגדרו הכשרות, מי שהתפקיד שלו מפק"צ/סמפק"צ נחשב מפק"צ
const quals = (p) => p.quals || { mefaktz: /מפק"צ/.test(p.role || "") };

// ---------- auth ----------
const show = (id) => {
  ["#loading", "#login", "#app"].forEach((s) => {
    const el = $(s);
    if (s === id) { el.classList.remove("hidden"); el.classList.remove("fade-in"); void el.offsetWidth; el.classList.add("fade-in"); }
    else el.classList.add("hidden");
  });
};

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
  unsub = onSnapshot(DOC, (s) => { if (s.exists()) { state = s.data(); state.people ||= []; state.tasks ||= [];
    if (initListeners()) save("סומנו מי שעולים להאזנות ✓"); render(); } });
  show("#app");
});

// ---------- tabs ----------
document.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => {
  document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("active", x === b));
  ["roster", "calendar", "guards", "listen", "tasks"].forEach((t) => $("#tab-" + t).classList.toggle("hidden", b.dataset.tab !== t));
}));

function render() { renderRoster(); renderCalendar(); renderGuards(); renderListen(); renderTasks(); }

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
  return (p.listening ? `<span class="tag listen">🎧 האזנות</span>` : "") + QUALS.filter((k) => q[k.id]).map((k) => `<span class="tag">${k.label}</span>`).join("");
}

function pendingPanel(t) {
  const items = [];
  for (const p of state.people) if (!p.inactive)
    for (const r of p.requests) if (reqStatus(r) === "pending" && r.to >= t) items.push({ p, r });
  if (!items.length) return "";
  items.sort((a, b) => a.r.from.localeCompare(b.r.from));
  return `<div class="pending">
    <div class="group-head"><h2>ממתינות לאישור</h2><span class="pend-count">${items.length}</span></div>
    <div class="card">${items.map(({ p, r }) => `<div class="pend-item">
      <div class="pend-info" data-person="${p.id}"><b>${esc(p.name || "ללא שם")}</b>
        <span class="muted"> · ${esc(gName(p.group))}</span>
        <div class="pend-d">${fmtRange(r)}${r.reason ? ` · ${esc(r.reason)}` : ""}</div></div>
      ${reqButtons(p.id, r)}</div>`).join("")}</div></div>`;
}

function renderRoster() {
  const t = today();
  const active = state.people.filter((p) => !p.inactive);
  const inactiveN = state.people.length - active.length;
  const outToday = active.filter((p) => isOut(p, t)).length;
  const staff = state.people.filter((p) => p.group === "staff");
  let h = `<button class="btn report-btn" id="reportBtn">📤 שליחת דו"ח 1</button>
    <div class="staff-strip">${staff.map((p) => `<button class="staff-chip ${p.inactive ? "inactive" : ""}" data-person="${p.id}">
      <span class="muted">${esc(p.role)}</span> ${esc(p.name || "—")}</button>`).join("")}
      <button class="staff-chip add" data-add="staff">+</button></div>
    ${pendingPanel(t)}
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
        : up ? `<span class="badge req">${up === 1 ? "ממתינה" : up + " ממתינות"}</span>` : "";
      const openNotes = (p.notes || []).filter((n) => !n.done).length;
      const noteBadge = openNotes ? `<span class="badge note">📝 ${openNotes}</span>` : "";
      h += `<div class="row ${p.inactive ? "inactive" : ""}" data-person="${p.id}">
        <div class="who"><span class="name ${p.name ? "" : "empty"}">${esc(p.name || "ללא שם")}</span>
          <span class="tags">${qualTags(p)}</span></div>
        ${noteBadge}${badge}<span class="role">${esc(p.role)}</span><span class="chev">‹</span></div>`;
    }
    h += `<div class="add-row"><button data-add="${g.id}">+ הוספת אדם</button></div></div></div>`;
  }
  $("#tab-roster").innerHTML = h + "</div>";
  bindReqButtons($("#tab-roster"));
  $("#reportBtn").onclick = () => { const d = new Date(); d.setDate(d.getDate() + 1); openReport(ymd(d)); };
  $("#tab-roster").querySelectorAll("[data-person]").forEach((el) => (el.onclick = () => openPerson(el.dataset.person)));
  $("#tab-roster").querySelectorAll("[data-add]").forEach((el) => (el.onclick = () => openAddPerson(el.dataset.add)));
}

// ---------- person sheet ----------
const MIL_SIZES = ["ק", "ב", "ג", "מ", "ממ", "מממ"];
const CIV_SIZES = ["S", "M", "L", "XL", "XXL", "XXXL"];
const sheet = $("#sheet");
const closeSheet = () => { sheet.classList.add("hidden"); openSecs.clear(); };
sheet.addEventListener("click", (e) => { if (e.target.hasAttribute("data-close")) closeSheet(); });
const openSecs = new Set(); // אילו מקטעים פתוחים בכרטיס, כדי שיישארו פתוחים אחרי פעולה
const gName = (id) => GROUPS.find((g) => g.id === id)?.name || "";
// תמיד עובדים על העותק העדכני של האדם (הנתונים מתרעננים מהשרת ברקע)
const person = (id) => state.people.find((x) => x.id === id);
function updatePerson(id, fn, msg, rerender = true) {
  const p = person(id);
  if (!p) { toast("האדם הזה כבר לא קיים", "bad"); closeSheet(); return; }
  fn(p); save(msg);
  if (rerender) openPerson(id);
}

function sec(key, title, summary, body) {
  return `<details class="sec" data-sec="${key}" ${openSecs.has(key) ? "open" : ""}>
    <summary><span class="sec-name">${title}</span><span class="sec-sum">${summary}</span></summary>
    <div class="sec-body">${body}</div></details>`;
}

function openPerson(id) {
  const p = person(id);
  if (!p) return;
  const q = quals(p);
  const t = today();
  const sz = { ...(p.sizes || {}) };
  if (!sz.civShirt && CIV_SIZES.includes((sz.shirt || "").toUpperCase())) sz.civShirt = sz.shirt.toUpperCase();
  const sel = (sid, opts, val) => `<select id="${sid}" data-size><option value="">—</option>${opts.map((o) => `<option ${o === val ? "selected" : ""}>${o}</option>`).join("")}</select>`;
  const reqs = [...p.requests].sort((a, b) => a.from.localeCompare(b.from));
  const pendN = reqs.filter((r) => r.to >= t && reqStatus(r) === "pending").length;
  const apprN = reqs.filter((r) => r.to >= t && reqStatus(r) === "approved").length;
  const leaveSum = [pendN && (pendN === 1 ? "1 ממתינה" : `${pendN} ממתינות`), apprN && (apprN === 1 ? "1 מאושרת" : `${apprN} מאושרות`)].filter(Boolean).join(" · ") || "אין קרובות";
  const notes = [...(p.notes || [])].sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || (b.created || "").localeCompare(a.created || ""));
  const openNotes = notes.filter((n) => !n.done).length;
  const qList = QUALS.filter((k) => q[k.id]).map((k) => k.label);
  const szSum = [sz.milShirt && `חולצה ${sz.milShirt}`, sz.milPants && `מכנס ${sz.milPants}`, sz.civShirt, sz.shoes && `נעל ${sz.shoes}`].filter(Boolean).join(" · ");
  const status = p.inactive ? `<span class="badge off">לא בתקופה</span>` : isOut(p, t) ? `<span class="badge out">בחוץ היום</span>` : `<span class="badge in">נוכח היום</span>`;

  $("#sheetBody").innerHTML = `
    <div class="sheet-top"><div><h2>${esc(p.name || "ללא שם")}</h2>
      <div class="sheet-sub">${esc(p.role)} · ${gName(p.group)} ${status}</div></div>
      <button class="btn icon" data-close>✕</button></div>

    ${sec("details", "פרטים", esc(p.role), `
      <label>שם</label><input id="fName" value="${esc(p.name)}" placeholder="שם מלא">
      <label>תפקיד</label><input id="fRole" value="${esc(p.role)}">
      <p class="hint">נשמר אוטומטית כשיוצאים מהשדה</p>`)}

    ${sec("team", "העברת צוות", gName(p.group), `
      <div class="team-pick">${GROUPS.map((g) => `<button class="${g.id === p.group ? "on" : ""}" data-move="${g.id}">${g.id === "staff" ? 'מפל"ג' : g.name}</button>`).join("")}</div>`)}

    ${sec("quals", "הכשרות", qList.length ? qList.join(", ") : "אין", `
      <div class="chips">${QUALS.map((k) => `<label class="chip"><input type="checkbox" data-q="${k.id}" ${q[k.id] ? "checked" : ""}><span>${k.label}</span></label>`).join("")}</div>`)}

    ${sec("sizes", "מידות", szSum || "לא הוזן", `
      <div class="sizes">
        <div class="sz-row"><span class="sz-head">צבאי</span>
          <div><small class="muted">חולצה</small>${sel("sMilShirt", MIL_SIZES, sz.milShirt)}</div>
          <div><small class="muted">מכנסיים</small>${sel("sMilPants", MIL_SIZES, sz.milPants)}</div></div>
        <div class="sz-row"><span class="sz-head">אזרחי</span>
          <div><small class="muted">חולצה</small>${sel("sCivShirt", CIV_SIZES, sz.civShirt)}</div><div></div></div>
        <div class="sz-row"><span class="sz-head">נעליים</span>
          <div><small class="muted">צבאי ואזרחי</small><input id="sShoes" data-size value="${esc(sz.shoes)}" placeholder="43" inputmode="decimal"></div><div></div></div>
      </div>`)}

    ${sec("notes", "הערות ובקשות", openNotes ? `${openNotes} פתוחות` : notes.length ? "הכול טופל" : "אין", `
      ${notes.map((n) => `<div class="note-item ${n.done ? "done" : ""}">
        <button class="check" data-togglenote="${n.id}" aria-label="טופל">${n.done ? "✓" : ""}</button>
        <div class="note-text">${esc(n.text)}${n.created ? `<small>${fmt(n.created)}</small>` : ""}</div>
        <button class="btn icon danger" data-delnote="${n.id}">✕</button></div>`).join("")}
      <div class="task-add"><input id="nNew" placeholder="למשל: צריך חולצה חדשה" enterkeyhint="done">
        <button class="btn outline" id="addNote">הוספה</button></div>`)}

    ${sec("leave", "בקשות יציאה", leaveSum, `
      ${reqs.map((r) => `<div class="req st-${reqStatus(r)}" style="${r.to < t ? "opacity:.55" : ""}">
        <div class="req-top"><div><div class="d">${fmtRange(r)} <span class="st-tag">${STATUS_LABEL[reqStatus(r)]}</span></div>
          ${r.reason ? `<div class="why">${esc(r.reason)}</div>` : ""}</div>
          <button class="btn icon danger" data-delreq="${r.id}">✕</button></div>
        ${reqButtons(p.id, r)}</div>`).join("")}
      <div class="two"><div><label>מתאריך</label><input type="date" id="rFrom" value="${t}"></div>
        <div><label>עד תאריך</label><input type="date" id="rTo" value="${t}"></div></div>
      <label>סיבה (לא חובה)</label><input id="rWhy" placeholder="למשל: אירוע משפחתי">
      <div class="actions"><button class="btn outline" id="addReq">+ הוספת בקשה</button>
        <button class="btn danger" id="markAbsent">🚫 לא נמצא</button></div>`)}

    ${sec("more", "עוד", [p.listening && "האזנות", p.inactive && "לא מגיע בתקופה"].filter(Boolean).join(" · "), `
      <label class="switch"><input type="checkbox" id="fListen" ${p.listening ? "checked" : ""}>
        <span>🎧 עולה להאזנות<small>לא משובץ בשמירות ש"ג, משטח ומטבח</small></span></label>
      <label class="switch"><input type="checkbox" id="fInactive" ${p.inactive ? "checked" : ""}>
        <span>לא מגיע כל התקופה<small>לא נספר בנוכחות ולא מופיע כבעל בקשות</small></span></label>
      <div class="actions"><button class="btn danger" id="delP">מחיקת ${esc(p.name || "האדם")}</button></div>`)}`;
  sheet.classList.remove("hidden");

  const body = $("#sheetBody");
  body.querySelectorAll("details.sec").forEach((d) => d.addEventListener("toggle", () => {
    d.open ? openSecs.add(d.dataset.sec) : openSecs.delete(d.dataset.sec);
  }));

  // פרטים: נשמר כשיוצאים מהשדה
  $("#fName").onchange = () => updatePerson(id, (x) => { x.name = $("#fName").value.trim(); }, "השם נשמר ✓");
  $("#fRole").onchange = () => updatePerson(id, (x) => { x.role = $("#fRole").value.trim(); }, "התפקיד נשמר ✓");

  body.querySelectorAll("[data-move]").forEach((b) => (b.onclick = () => {
    if (b.dataset.move === person(id)?.group) return;
    updatePerson(id, (x) => { x.group = b.dataset.move; }, `הועבר ל${gName(b.dataset.move)} ✓`);
  }));

  body.querySelectorAll("[data-q]").forEach((c) => (c.onchange = () => updatePerson(id, (x) => {
    x.quals = { ...quals(x), [c.dataset.q]: c.checked };
  }, `${QUALS.find((k) => k.id === c.dataset.q).label} ${c.checked ? "נוסף" : "הוסר"} ✓`)));

  body.querySelectorAll("[data-size]").forEach((el) => (el.onchange = () => updatePerson(id, (x) => {
    x.sizes = { milShirt: $("#sMilShirt").value, milPants: $("#sMilPants").value,
      civShirt: $("#sCivShirt").value, shoes: $("#sShoes").value.trim() };
  }, "המידות נשמרו ✓")));

  const addNote = () => {
    const text = $("#nNew").value.trim();
    if (!text) return toast("כתוב קודם את ההערה", "bad");
    updatePerson(id, (x) => { x.notes = [...(x.notes || []), { id: uid(), text, created: t, done: false }]; }, "ההערה נוספה ✓");
  };
  $("#addNote").onclick = addNote;
  $("#nNew").onkeydown = (e) => { if (e.key === "Enter") addNote(); };
  body.querySelectorAll("[data-togglenote]").forEach((b) => (b.onclick = () => {
    let done;
    updatePerson(id, (x) => { const n = x.notes.find((k) => k.id === b.dataset.togglenote); n.done = done = !n.done; },
      undefined);
    toast(done ? "סומן כטופל ✓" : "הוחזר לפתוח");
  }));
  body.querySelectorAll("[data-delnote]").forEach((b) => (b.onclick = () => {
    if (!confirm("למחוק את ההערה?")) return;
    updatePerson(id, (x) => { x.notes = x.notes.filter((k) => k.id !== b.dataset.delnote); }, "ההערה נמחקה");
  }));

  $("#rFrom").onchange = () => { if ($("#rTo").value < $("#rFrom").value) $("#rTo").value = $("#rFrom").value; };
  $("#addReq").onclick = () => {
    const from = $("#rFrom").value, to = $("#rTo").value;
    if (!from || !to) return toast("צריך לבחור תאריכים", "bad");
    if (to < from) return toast("תאריך הסיום לפני ההתחלה", "bad");
    updatePerson(id, (x) => { x.requests.push({ id: uid(), from, to, reason: $("#rWhy").value.trim(), status: "pending" }); },
      `בקשה נוספה וממתינה לאישור (${fmt(from)}${to !== from ? "–" + fmt(to) : ""})`);
  };
  body.querySelectorAll("[data-delreq]").forEach((b) => (b.onclick = () => {
    if (!confirm("למחוק את הבקשה?")) return;
    updatePerson(id, (x) => { x.requests = x.requests.filter((r) => r.id !== b.dataset.delreq); }, "הבקשה נמחקה");
  }));

  bindReqButtons(body, () => openPerson(id));
  $("#markAbsent").onclick = () => openAbsent(id, today());
  $("#fListen").onchange = () => updatePerson(id, (x) => { x.listening = $("#fListen").checked; },
    $("#fListen").checked ? "סומן: עולה להאזנות ✓" : "הוסר מהאזנות ✓");
  $("#fInactive").onchange = () => updatePerson(id, (x) => { x.inactive = $("#fInactive").checked; },
    $("#fInactive").checked ? "סומן: לא מגיע בתקופה ✓" : "סומן: מגיע בתקופה ✓");
  $("#delP").onclick = () => {
    const x = person(id);
    if (!confirm(`למחוק את ${x?.name || "האדם הזה"}? אי אפשר לבטל.`)) return;
    state.people = state.people.filter((k) => k.id !== id); save(`${x?.name || "האדם"} נמחק`); closeSheet();
  };
}

// ---------- add person ----------
function openAddPerson(group) {
  $("#sheetBody").innerHTML = `
    <div class="sheet-top"><h2>הוספת אדם</h2><button class="btn icon" data-close>✕</button></div>
    <label>שם</label><input id="aName" placeholder="שם מלא" autocomplete="off">
    <div class="two">
      <div><label>תפקיד</label><input id="aRole" value="${group === "staff" ? "" : "לוחם"}"></div>
      <div><label>צוות</label><select id="aGroup">${GROUPS.map((g) => `<option value="${g.id}" ${g.id === group ? "selected" : ""}>${g.name}</option>`).join("")}</select></div>
    </div>
    <div class="actions"><button class="btn primary" id="aSave">הוספה</button></div>`;
  sheet.classList.remove("hidden");
  setTimeout(() => $("#aName").focus(), 50);
  const add = () => {
    const name = $("#aName").value.trim();
    if (!name) { toast("צריך לכתוב שם", "bad"); $("#aName").focus(); return; }
    const p = { id: uid(), group: $("#aGroup").value, role: $("#aRole").value.trim() || "לוחם", name, requests: [], quals: {}, notes: [] };
    state.people.push(p);
    save(`${name} נוסף ל${gName(p.group)} ✓`);
    closeSheet();
    flashRow(p.id);
  };
  $("#aSave").onclick = add;
  $("#aName").onkeydown = (e) => { if (e.key === "Enter") add(); };
}

function flashRow(id) {
  setTimeout(() => {
    const el = document.querySelector(`#tab-roster [data-person="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 1600);
  }, 150);
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

// ---------- deployment periods (נגלות) ----------
// כל נגלה: מ-12:00 ביום הראשון עד 12:00 ביום האחרון
const DEFAULT_PERIODS = [
  { from: "2026-11-05", to: "2026-11-09" }, { from: "2026-11-16", to: "2026-11-23" },
  { from: "2026-11-30", to: "2026-12-07" }, { from: "2026-12-14", to: "2026-12-24" },
];
const periods = () => [...(state.settings?.periods || DEFAULT_PERIODS)].sort((a, b) => a.from.localeCompare(b.from));
const periodOf = (day) => periods().find((p) => p.from <= day && day <= p.to);
const inBase = (day) => !!periodOf(day);
const guardDayValid = (key) => periods().some((p) => p.from <= key && key < p.to);
function nextGuardDay(key, dir) {
  for (let n = 1; n < 400; n++) { const k = addDays(key, dir * n); if (guardDayValid(k)) return k; }
  return null;
}

function periodsEditor() {
  const ps = periods();
  return `<details class="rules" id="perBox" ${openPeriods ? "open" : ""}><summary>תאריכי נגלות (${ps.length})</summary>
    ${ps.map((p, i) => `<div class="per-row"><span>${fmt(p.from)} 12:00 – ${fmt(p.to)} 12:00</span>
      <button class="btn icon danger" data-delper="${i}">✕</button></div>`).join("") || `<p class="hint">אין נגלות.</p>`}
    <div class="two"><div><label>מתאריך</label><input type="date" id="perFrom"></div><div><label>עד תאריך</label><input type="date" id="perTo"></div></div>
    <div class="actions"><button class="btn outline" id="perAdd">+ הוספת נגלה</button></div></details>`;
}
let openPeriods = false;
function bindPeriods(root) {
  root.querySelector("#perBox").addEventListener("toggle", (e) => (openPeriods = e.target.open));
  const setP = (list, msg) => { state.settings = { ...(state.settings || {}), periods: list }; save(msg); render(); };
  root.querySelectorAll("[data-delper]").forEach((b) => (b.onclick = () => {
    const ps = periods(); const p = ps[+b.dataset.delper];
    if (!confirm(`למחוק את הנגלה ${fmt(p.from)}–${fmt(p.to)}?`)) return;
    ps.splice(+b.dataset.delper, 1); setP(ps, "הנגלה נמחקה");
  }));
  root.querySelector("#perAdd").onclick = () => {
    const from = root.querySelector("#perFrom").value, to = root.querySelector("#perTo").value;
    if (!from || !to || to <= from) return toast("צריך תאריך התחלה וסיום (הסיום אחרי ההתחלה)", "bad");
    setP([...periods(), { from, to }], `נגלה ${fmt(from)}–${fmt(to)} נוספה ✓`);
  };
}

function renderCalendar() {
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  const days = new Date(y, m + 1, 0).getDate(), first = new Date(y, m, 1).getDay(), t = today();
  const active = state.people.filter((p) => !p.inactive);
  let bad = 0, baseDays = 0;
  let h = `<div class="cal-head">
      <button class="btn icon" id="calPrev">›</button>
      <h2>${MONTHS[m]} ${y}</h2>
      <button class="btn icon" id="calNext">‹</button></div>
    <p class="muted" id="calSummary"></p>
    <div class="legend"><span><i style="background:var(--ok-soft);border:1px solid var(--ok)"></i>תקין</span><span><i style="background:var(--bad-soft);border:1px solid var(--bad)"></i>לא תקין</span><span><i style="background:var(--line)"></i>לא במוצב</span></div>
    <div class="cal">${["א׳","ב׳","ג׳","ד׳","ה׳","ו׳","ש׳"].map((d) => `<div class="dow">${d}</div>`).join("")}`;
  for (let i = 0; i < first; i++) h += `<div></div>`;
  for (let d = 1; d <= days; d++) {
    const key = ymd(new Date(y, m, d));
    const out = active.filter((p) => isOut(p, key)).length;
    const pend = active.filter((p) => !isOut(p, key) && pendingOn(p, key)).length;
    const per = periodOf(key);
    if (!per) { h += `<div class="day off ${key === t ? "today" : ""}"><span class="n">${d}</span><span class="cnt">לא במוצב</span></div>`; continue; }
    baseDays++;
    const edge = key === per.from ? "מ-12:00" : key === per.to ? "עד 12:00" : "";
    const st = dayStatus(key); if (!st.ok) bad++;
    h += `<div class="day ${st.ok ? "good" : "bad"} ${key === t ? "today" : ""}" data-day="${key}">
      <span class="n">${d}</span>${edge ? `<span class="edge">${edge}</span>` : ""}<span class="cnt">${out ? `${out} בחוץ` : ""}<br>${active.length - out} נוכחים</span>${pend ? `<span class="pend-dot">⏳${pend}</span>` : ""}</div>`;
  }
  h += `</div><details class="rules"><summary>איך נקבע אם תקין</summary><ul>
    <li>בכל יום צריך לפחות ${MIN.cmd} מפק"צים ועוד ${MIN.fighters} לוחמים.</li>
    <li>מתוך הלוחמים: לפחות ${MIN.kavan} כוונים, ${MIN.tomat} נהגי תומ"ת ו-${MIN.alpha} נהג אלפ"א.</li>
    <li>נהג יכול להיחשב גם ככוון. אדם אחד לא יכול להיחשב גם כנהג תומ"ת וגם כנהג אלפ"א.</li>
    <li>מפק"צים מעבר ל-${MIN.cmd} נספרים כלוחמים. גם המפל"ג והסמפל"ג נספרים לפי ההכשרות שלהם.</li>
    <li>מי שיש לו בקשת יציאה <b>מאושרת</b> או מסומן "לא בתקופה" לא נספר. בקשה ממתינה או נדחתה לא משפיעה.</li>
    <li>⏳ ביום = כמה בקשות ממתינות לאישור באותו יום.</li>
    <li>ימים מחוץ לנגלות מסומנים "לא במוצב" ולא נבדקים.</li></ul></details>` + periodsEditor();
  $("#tab-calendar").innerHTML = h;
  $("#calSummary").textContent = !baseDays ? "אין ימי מוצב בחודש הזה"
    : bad ? `${bad} מתוך ${baseDays} ימי המוצב לא תקינים` : `כל ${baseDays} ימי המוצב תקינים`;
  bindPeriods($("#tab-calendar"));
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
    <button class="btn report-btn" id="dayReport">📤 שליחת דו"ח 1 ליום הזה</button>
    ${(() => { const st = dayStatus(key); return `<div class="verdict ${st.ok ? "good" : "bad"}"><b>${st.ok ? "תקין" : "לא תקין"}</b>
      ${st.missing.length ? `<ul>${st.missing.map((m) => `<li>${m}</li>`).join("")}</ul>` : ""}
      </div>`; })()}
    ${qualTable(key, "ביום הזה")}
    <div class="stats">${splits}</div>
    ${out.length ? `<div class="card out-list">${out.map((p) => {
      const r = p.requests.find((r) => reqStatus(r) === "approved" && onDay(r, key));
      return `<div class="row"><span class="name">${esc(p.name || "ללא שם")}</span>
        <span class="role">${esc(gname(p.group))}${r?.reason ? " · " + esc(r.reason) : ""}</span></div>`;
    }).join("")}</div>` : `<div class="empty-note">כולם נוכחים ביום הזה.</div>`}
    ${(() => {
      const pend = state.people.filter((p) => !p.inactive && !isOut(p, key) && pendingOn(p, key));
      if (!pend.length) return "";
      return `<div class="sec-title">ממתינות לאישור ביום הזה</div><div class="card">${pend.map((p) =>
        p.requests.filter((r) => reqStatus(r) === "pending" && onDay(r, key)).map((r) => `<div class="pend-item">
          <div class="pend-info"><b>${esc(p.name || "ללא שם")}</b><span class="muted"> · ${esc(gname(p.group))}</span>
          <div class="pend-d">${fmtRange(r)}${r.reason ? ` · ${esc(r.reason)}` : ""}</div></div>${reqButtons(p.id, r)}</div>`).join("")).join("")}</div>`;
    })()}`;
  sheet.classList.remove("hidden");
  bindReqButtons($("#sheetBody"), () => openDay(key));
  $("#dayReport").onclick = () => openReport(key);
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
    state.tasks = [...(state.tasks || []), { id: uid(), title, due: "", note: "", done: false, created: t }];
    save("המשימה נוספה ✓");
  };
  $("#tAddBtn").onclick = add;
  $("#tNew").onkeydown = (e) => { if (e.key === "Enter") add(); };
  $("#tab-tasks").querySelectorAll("[data-toggle]").forEach((b) => (b.onclick = () => {
    const x = state.tasks.find((k) => k.id === b.dataset.toggle); if (!x) return;
    x.done = !x.done; x.doneAt = x.done ? t : ""; save(x.done ? "בוצע ✓" : "הוחזר לפתוחות");
  }));
  $("#tab-tasks").querySelectorAll("[data-edit]").forEach((el) => (el.onclick = () => openTask(el.dataset.edit)));
  const dt = $("#tDoneToggle"); if (dt) dt.onclick = () => { showDone = !showDone; renderTasks(); };
}

function openTask(id) {
  let x = state.tasks.find((k) => k.id === id); if (!x) return;
  $("#sheetBody").innerHTML = `
    <div class="sheet-top"><h2>משימה</h2><button class="btn icon" data-close>✕</button></div>
    <label>מה צריך לעשות</label><input id="eTitle" value="${esc(x.title)}">
    <label>תאריך יעד (לא חובה)</label><input type="date" id="eDue" value="${esc(x.due)}">
    <label>הערות (לא חובה)</label><textarea id="eNote">${esc(x.note)}</textarea>
    <div class="actions"><button class="btn primary" id="eSave">שמירה</button></div>
    <div class="actions" style="margin-top:20px"><button class="btn danger" id="eDel">מחיקת המשימה</button></div>`;
  sheet.classList.remove("hidden");
  $("#eSave").onclick = () => {
    x = state.tasks.find((k) => k.id === id);
    if (!x) { toast("המשימה כבר לא קיימת", "bad"); return closeSheet(); }
    x.title = $("#eTitle").value.trim() || x.title; x.due = $("#eDue").value; x.note = $("#eNote").value.trim();
    save("המשימה נשמרה ✓"); closeSheet();
  };
  $("#eDel").onclick = () => {
    if (!confirm("למחוק את המשימה?")) return;
    state.tasks = state.tasks.filter((k) => k.id !== id); save("המשימה נמחקה"); closeSheet();
  };
}

// ---------- WhatsApp report ----------
const unitName = () => state.settings?.unitName || "פלגה 1";
// בדו"ח 1: יום היציאה ויום החזרה נחשבים "ביחידה". רק הימים שביניהם נחשבים "מחוץ ליחידה"
const outForReport = (p, day) => p.requests.some((r) => reqStatus(r) === "approved" && r.from < day && day < r.to);
function buildReport(day) {
  const isOut = outForReport;
  const line = (p) => isOut(p, day) ? `*${p.name || "ללא שם"} - מחוץ ליחידה*` : `${p.name || "ללא שם"} - ביחידה`;
  const count = (ps) => `${ps.filter((p) => !isOut(p, day)).length}/${ps.length}`;
  const active = state.people.filter((p) => !p.inactive);
  const staff = active.filter((p) => p.group === "staff");
  let txt = `*${unitName()}: ${count(active)}*` + (day !== today() ? `\nתאריך: ${fmt(day)}` : "") + "\n";
  txt += staff.map(line).join("\n");
  for (const g of GROUPS.filter((g) => g.id !== "staff")) {
    const ps = active.filter((p) => p.group === g.id);
    if (!ps.length) continue;
    txt += `\n\n*${g.name}: ${count(ps)}*\n` + ps.map(line).join("\n");
  }
  return txt.trim();
}

function openReport(day) {
  $("#sheetBody").innerHTML = `
    <div class="sheet-top"><h2>דו"ח 1</h2><button class="btn icon" data-close>✕</button></div>
    <div class="two">
      <div><label>תאריך</label><input type="date" id="repDay" value="${day}"></div>
      <div><label>כותרת</label><input id="repUnit" value="${esc(unitName())}"></div>
    </div>
    <label>ההודעה (אפשר לערוך לפני השליחה)</label>
    <textarea id="repText" class="rep-text"></textarea>
    <p class="hint">מחוץ ליחידה = רק מי שיש לו יציאה <b>מאושרת</b> שהיום הזה נמצא <b>בין</b> יום היציאה ליום החזרה. ביום היציאה וביום החזרה הוא נחשב ביחידה. מי שמסומן "לא בתקופה" לא מופיע.</p>
    <div class="actions">
      <button class="btn wa" id="repWa">שליחה בוואטסאפ</button>
      <button class="btn" id="repCopy">העתקה</button>
    </div>`;
  sheet.classList.remove("hidden");
  const fill = () => { $("#repText").value = buildReport($("#repDay").value || today()); };
  fill();
  $("#repDay").onchange = fill;
  $("#repUnit").onchange = () => {
    const v = $("#repUnit").value.trim();
    state.settings = { ...(state.settings || {}), unitName: v || "פלגה 1" };
    save("הכותרת נשמרה ✓"); fill();
  };
  $("#repWa").onclick = () => {
    window.open("https://wa.me/?text=" + encodeURIComponent($("#repText").value), "_blank");
  };
  $("#repCopy").onclick = async () => {
    try { await navigator.clipboard.writeText($("#repText").value); toast("ההודעה הועתקה ✓"); }
    catch { $("#repText").select(); document.execCommand("copy"); toast("ההודעה הועתקה ✓"); }
  };
}

// ---------- guard duty (שמירות) ----------
// יום שמירה = 24 שעות משעת ההתחלה שנבחרה (ברירת מחדל 18:00). לילה = 18:00–06:00.
// ש"ג ומשטח: 12 משמרות של שעתיים. כל רשימה שומרת את שעת ההתחלה שלה.
const SLOTS = 12, SLOT_LEN = 2;
const guardStart = () => state.settings?.guardStart ?? 18;
const startOf = (key) => { const d = state.guards?.days?.[key]; return typeof d?.start === "number" ? d.start : guardStart(); };
const GTYPES = { sag: 'ש"ג', mishtach: "משטח" };
const hh = (h) => String(((h % 24) + 24) % 24).padStart(2, "0") + ":00";
const slotAbs = (key, i) => startOf(key) + SLOT_LEN * i; // שעות מחצות של היום הראשון
const slotLabel = (key, i) => `${hh(slotAbs(key, i))}-${hh(slotAbs(key, i) + SLOT_LEN)}`;
const isNightSlot = (key, i) => { const h = slotAbs(key, i) % 24; return h >= 18 || h < 6; };
const dayIdx = (key) => { const [y, m, d] = key.split("-").map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };
const addDays = (key, n) => { const [y, m, d] = key.split("-").map(Number); return ymd(new Date(y, m - 1, d + n)); };
// אין משטח בין 05:00 ל-07:00
const slotOff = (key, ty, i) => ty === "mishtach" && slotAbs(key, i) % 24 === 5;
const MIN_REST = 8; // אסור פחות מזה בין שתי שמירות של אותו אדם
const slotDate = (key, ty, i) => (slotAbs(key, i) < 24 ? key : addDays(key, 1));
const slotT = (key, ty, i) => dayIdx(key) * 24 + slotAbs(key, i);
const curGuardDay = () => { const n = new Date(); if (n.getHours() < guardStart()) n.setDate(n.getDate() - 1); return ymd(n); };
let guardDay = curGuardDay();
// נוספים: אנשים שלא במצבה ובאים מדי פעם. משתתפים בשמירות רק בימים שסומנו כנוכחים
const guests = () => state.guards?.guests || [];
const findP = (id) => state.people.find((p) => p.id === id) || guests().find((g) => g.id === id);
const guestAvail = (key) => state.guards?.avail?.[key] || [];
const availGuests = (key) => guests().filter((g) => guestAvail(key).includes(g.id));
const guardPool = (key) => state.people.filter((p) => !p.inactive && !p.listening).concat(availGuests(key));
const pName = (id) => findP(id)?.name || "(נמחק)";
const isNewFmt = (d) => d && typeof d.start === "number" && d.sag?.length === SLOTS && d.mishtach?.length === SLOTS;

// כל השיבוצים בימים שביקשנו, כרשימה שטוחה
function collect(keys) {
  const out = [];
  const days = state.guards?.days || {};
  for (const k of keys) {
    const d = days[k]; if (!isNewFmt(d)) continue;
    if (d.kitchen) out.push({ pid: d.kitchen, type: "kitchen", day: k, i: -1, t: dayIdx(k) * 24 + startOf(k), end: dayIdx(k) * 24 + startOf(k) + 24 });
    for (const ty of ["sag", "mishtach"]) d[ty].forEach((pid, i) => {
      if (pid && !slotOff(k, ty, i)) { const t = slotT(k, ty, i); out.push({ pid, type: ty, day: k, i, t, end: t + SLOT_LEN, night: isNightSlot(k, i), hrs: SLOT_LEN }); }
    });
  }
  return out;
}
const kitchenFree = (key) => (dayIdx(key) + 1) * 24 + 10; // 10:00 ביום שאחרי, בשעות מוחלטות
const near = (key) => [-2, -1, 0, 1, 2].map((n) => addDays(key, n));
const whenTxt = (a) => `${fmt(slotDate(a.day, a.type, a.i))} ${hh(slotAbs(a.day, a.i))}`;

// סיבות שבגללן אי אפשר לשבץ אדם. רשימה ריקה = מותר
function guardIssues(pid, key, i, type, assigns) {
  const p = findP(pid);
  if (!p) return ["לא קיים"];
  const r = [];
  if (p.guest && !guestAvail(key).includes(pid)) r.push("לא סומן כנוכח ביום הזה");
  if (p.listening) r.push("האזנות");
  if (p.inactive) r.push("לא בתקופה");
  const mine = assigns.filter((a) => a.pid === pid);
  if (type === "kitchen") {
    if (quals(p).mefaktz && !p.listening) r.push('מפק"צ לא עולה מטבח');
    if (isOut(p, key)) r.push("בחוץ");
    const early = mine.find((a) => a.day === key && a.type !== "kitchen" && a.t < kitchenFree(key));
    if (early) r.push(`משובץ בשמירה ב-${whenTxt(early)}`);
    return r;
  }
  const t = slotT(key, type, i), end = t + SLOT_LEN;
  if (isOut(p, slotDate(key, type, i))) r.push(`בחוץ ב-${fmt(slotDate(key, type, i))}`);
  const g = mine.filter((a) => a.type !== "kitchen");
  // מי שבמטבח שומר רק מ-10:00 ביום שלמחרת
  if (mine.some((a) => a.type === "kitchen" && a.day === key) && t < kitchenFree(key)) r.push(`במטבח, שומר רק מ-10:00 ב-${fmt(addDays(key, 1))}`);
  if (g.some((a) => a.t < end && t < a.end)) r.push("משובץ באותה שעה");
  else {
    const close = g.map((a) => ({ a, gap: a.end <= t ? t - a.end : a.t - end })).filter((x) => x.gap < MIN_REST).sort((x, y) => x.gap - y.gap)[0];
    if (close) r.push(`מנוחה ${close.gap} ש' בלבד (שמירה ב-${whenTxt(close.a)}, מינימום ${MIN_REST})`);
  }
  return r;
}

const blankStat = () => ({ sag: 0, mishtach: 0, kitchen: 0, night: 0, total: 0, hours: 0 });
function guardStats(skipKey) {
  const all = collect(Object.keys(state.guards?.days || {}).filter((k) => k !== skipKey));
  const st = {};
  for (const a of all) {
    const s = (st[a.pid] ||= blankStat());
    s[a.type]++;
    if (a.type !== "kitchen") { s.total++; s.hours += a.hrs; if (a.night) s.night++; }
  }
  return st;
}
// ניקוד: נמוך = עדיף.
// 1. באותו יום — כל אחד מקבל שמירה אחת לפני שמישהו מקבל שנייה.
// 2. מנוחה — פחות מ-12 שעות מהשמירה הקרובה שלו: קנס כבד. 12–16 שעות: סביר. מעל 16: בונוס קטן.
//    נבדק מול השמירות שלו בכל הימים הסמוכים (גם ברשימה של אתמול ושל מחר).
// 3. הוגנות לאורך זמן — שעות שמירה, סוג ולילות.
const REST_OK = 12, REST_GOOD = 16;
const gapTo = (intervals, t, end) => intervals.reduce((g, [a, b]) => Math.min(g, b <= t ? t - b : a >= end ? a - end : 0), 999);
const restPen = (gap) => gap < REST_OK ? 60 + (REST_OK - gap) * 15 : gap < REST_GOOD ? (REST_GOOD - gap) * 2 : -Math.min(gap - REST_GOOD, 12);
// 4. לסירוגין — אחרי ש"ג עדיף משטח ואחרי משטח עדיף ש"ג (גם מול השמירה הבאה שלו, אם כבר קיימת)
const ALT_PEN = 22;
function altPen(intervals, t, ty) {
  let prev = null, next = null;
  for (const x of intervals) {
    if (x[1] <= t && (!prev || x[1] > prev[1])) prev = x;
    if (x[0] >= t && (!next || x[0] < next[0])) next = x;
  }
  return (prev && prev[2] === ty ? ALT_PEN : 0) + (next && next[2] === ty ? ALT_PEN : 0);
}
// התור: בכל משבצת עדיף מי שנח הכי הרבה זמן. ככה כולם מקבלים מרווחים כמעט זהים,
// בלי קשר לחלוקה לימים (לא "אחד לכל יום ואז שניים לחלק").
const slotScore = (s, ty, night, dayN, gap, alt = 0) =>
  -Math.min(gap, 40) * 6 + (gap < REST_OK ? 300 : 0) + alt + s.hours * 1.5 + s[ty] * 1 + (night ? s.night * 8 : 0);
// מנוחה של אדם סביב משבצת (שעות עד השמירה הקרובה שלו, לפני או אחרי)
const restAt = (pid, key, i, ty, assigns) => gapTo(assigns.filter((a) => a.pid === pid && a.type !== "kitchen").map((a) => [a.t, a.end]), slotT(key, ty, i), slotT(key, ty, i) + SLOT_LEN);

// כל המשמרות של היום, לפי סדר הזמן
const dayEvents = (key) => ["sag", "mishtach"].flatMap((ty) => Array.from({ length: SLOTS }, (_, i) => ({ ty, i, t: slotT(key, ty, i) }))).filter((e) => !slotOff(key, e.ty, e.i))
  .sort((a, b) => a.t - b.t || (a.ty === "sag" ? -1 : 1));

// בונה רשימה ליום אחד: הרבה ניסיונות עם קצת אקראיות, ובוחר את הטוב ביותר
function generateDay(key) {
  const pool = guardPool(key);
  const base = collect(near(key).filter((k) => k !== key));
  const statsAll = guardStats(key);
  // יוצרים לפי שעת ההתחלה הנוכחית
  state.guards ||= { days: {} }; state.guards.days ||= {};
  state.guards.days[key] = { start: guardStart(), kitchen: "", sag: Array(SLOTS).fill(""), mishtach: Array(SLOTS).fill("") };
  const events = dayEvents(key);
  let best = null;
  for (let iter = 0; iter < 250; iter++) {
    const assigns = base.slice();
    const st = {}, last = {};
    for (const p of pool) { st[p.id] = { ...blankStat(), ...(statsAll[p.id] || {}) }; last[p.id] = []; st[p.id].dayN = 0; }
    for (const a of base) if (last[a.pid] && a.type !== "kitchen") last[a.pid].push([a.t, a.end, a.type]); // שמירות בימים הסמוכים
    const kc = pool.filter((p) => !guardIssues(p.id, key, -1, "kitchen", assigns).length)
      .sort((a, b) => (st[a.id].kitchen - st[b.id].kitchen) * 10 + (st[a.id].hours - st[b.id].hours) + (Math.random() - 0.5) * 3);
    const kitchen = kc[0]?.id || "";
    if (kitchen) assigns.push({ pid: kitchen, type: "kitchen", day: key, i: -1, t: dayIdx(key) * 24 + startOf(key), end: dayIdx(key) * 24 + startOf(key) + 24 });
    const day = { kitchen, sag: Array(SLOTS).fill(""), mishtach: Array(SLOTS).fill(""), start: startOf(key), created: today() };
    let empty = kitchen ? 0 : 1;
    const evs = events.slice();
    for (let k = 0; k < evs.length - 1; k++) if (evs[k].t === evs[k + 1].t && Math.random() < 0.5) [evs[k], evs[k + 1]] = [evs[k + 1], evs[k]];
    for (const { ty, i, t } of evs) {
      let pick = null, ps = Infinity;
      for (const p of pool) {
        if (guardIssues(p.id, key, i, ty, assigns).length) continue;
        const sc = slotScore(st[p.id], ty, isNightSlot(key, i), st[p.id].dayN, gapTo(last[p.id], t, t + SLOT_LEN), altPen(last[p.id], t, ty)) + Math.random() * 4;
        if (sc < ps) { ps = sc; pick = p.id; }
      }
      if (!pick) { empty++; continue; }
      day[ty][i] = pick;
      const len = SLOT_LEN, night = isNightSlot(key, i);
      assigns.push({ pid: pick, type: ty, day: key, i, t, end: t + len, night, hrs: len });
      const s = st[pick]; s[ty]++; s.total++; s.hours += len; s.dayN++; if (night) s.night++; last[pick].push([t, t + len, ty]);
    }
    const hrs = pool.map((p) => st[p.id].hours);
    const mean = hrs.reduce((a, b) => a + b, 0) / (hrs.length || 1);
    const spread = hrs.reduce((a, b) => a + (b - mean) ** 2, 0) + pool.reduce((a, p) => a + st[p.id].night ** 2, 0) * 2;
    // מנוחה: כל זוג שמירות של אותו אדם עם פחות מ-16 שעות ביניהן מוסיף קנס (פחות מ-12 — קנס כבד)
    let rest = 0; const gl = [];
    for (const p of pool) {
      const l = last[p.id].slice().sort((x, y) => x[0] - y[0]);
      for (let k = 1; k < l.length; k++) {
        const g = l[k][0] - l[k - 1][1];
        if (g < REST_OK) rest += 400 + (REST_OK - g) ** 2 * 10;
        gl.push(g);
        if (l[k][2] === l[k - 1][2]) rest += 30; // אותו סוג פעמיים ברצף
      }
    }
    // מרווחים שווים: מעניש פיזור גדול בין המרווחים של כולם (ובמיוחד מרווחים קצרים מהממוצע)
    if (gl.length) { const m = gl.reduce((a, b) => a + b, 0) / gl.length; for (const g of gl) if (g < m) rest += (m - g) ** 2 * 3; else rest += Math.min((g - m) ** 2, 100) * 0.5; }
    const score = empty * 1e6 + spread + rest * 3;
    if (!best || score < best.score) best = { score, empty, day };
    if (best.empty === 0 && iter > 120) break;
  }
  return best;
}

let guardDayPicked = false, openGStats = false, openGuests = false;
let guardView = "day", weekMode = "time";
function weekDays(from) {
  const out = []; let k = guardDayValid(from) ? from : nextGuardDay(from, 1);
  while (k && out.length < 7) { out.push(k); k = nextGuardDay(k, 1); }
  return out;
}
function renderWeek() {
  const days = weekDays(guardDay);
  const have = days.filter((k) => isNewFmt(state.guards?.days?.[k]));
  const short = (k) => { const [, m, d] = k.split("-"); return `${+d}.${+m}`; };
  const dow = (k) => ["א", "ב", "ג", "ד", "ה", "ו", "ש"][new Date(k + "T12:00").getDay()];
  let h = `<div class="seg g-view"><button data-view="day">יום</button><button data-view="week" class="on">שבוע</button></div>
    <div class="g-title" style="margin-bottom:8px"><b>${days.length ? `${fmt(days[0])} – ${fmt(days[days.length - 1])}` : "אין ימי מוצב"}</b>
      <span class="muted small">${have.length} מתוך ${days.length} ימים עם רשימה</span></div>`;
  if (have.length < days.length) h += `<button class="btn primary wide" id="wGen">יצירת ${days.length - have.length} הימים החסרים</button>`;
  h += `<div class="seg" style="margin:10px 0"><button data-wm="time" class="${weekMode === "time" ? "on" : ""}">לפי שעות</button><button data-wm="people" class="${weekMode === "people" ? "on" : ""}">לפי אנשים</button></div>`;
  const all = collect([...new Set(days.flatMap(near))]);
  if (weekMode === "time") {
    h += `<div class="w-wrap"><table class="w-table"><thead><tr><th class="w-sticky">שעה</th>${days.map((k) => `<th colspan="2" class="w-day" data-goday="${k}">${dow(k)}' ${short(k)}</th>`).join("")}</tr>
      <tr><th class="w-sticky"></th>${days.map(() => `<th class="w-sub">ש"ג</th><th class="w-sub">משטח</th>`).join("")}</tr></thead><tbody>`;
    for (let i = 0; i < SLOTS; i++) {
      h += `<tr class="${isNightSlot(guardDay, i) ? "night" : ""}"><td class="w-sticky w-time">${slotLabel(days[0] || guardDay, i)}</td>`;
      for (const k of days) {
        const d = state.guards?.days?.[k];
        for (const ty of ["sag", "mishtach"]) {
          if (!isNewFmt(d)) { h += `<td class="w-none">·</td>`; continue; }
          if (slotOff(k, ty, i)) { h += `<td class="w-none">—</td>`; continue; }
          const pid = d[ty][i];
          const iss = pid ? guardIssues(pid, k, i, ty, all.filter((a) => !(a.day === k && a.i === i && a.type === ty))) : [];
          h += `<td class="${!pid ? "w-empty" : iss.length ? "w-bad" : ""}">${pid ? esc(pName(pid)) : "ריק"}</td>`;
        }
      }
      h += `</tr>`;
    }
    h += `<tr><td class="w-sticky w-time">🍳 מטבח</td>${days.map((k) => { const d = state.guards?.days?.[k]; return `<td colspan="2">${isNewFmt(d) && d.kitchen ? esc(pName(d.kitchen)) : "·"}</td>`; }).join("")}</tr></tbody></table></div>`;
  } else {
    const inWeek = all.filter((a) => days.includes(a.day));
    const ids = [...new Set(inWeek.map((a) => a.pid))].sort((a, b) => pName(a).localeCompare(pName(b), "he"));
    h += `<div class="w-wrap"><table class="w-table w-people"><thead><tr><th class="w-sticky">שם</th>${days.map((k) => `<th class="w-day" data-goday="${k}">${dow(k)}' ${short(k)}</th>`).join("")}<th>שעות</th><th>מנוחה מינ'</th></tr></thead><tbody>`;
    for (const pid of ids) {
      const mine = all.filter((a) => a.pid === pid && a.type !== "kitchen").sort((x, y) => x.t - y.t);
      let minGap = 999; for (let k = 1; k < mine.length; k++) minGap = Math.min(minGap, mine[k].t - mine[k - 1].end);
      const hrs = inWeek.filter((a) => a.pid === pid && a.type !== "kitchen").length * SLOT_LEN;
      h += `<tr><td class="w-sticky"><b>${esc(pName(pid))}</b></td>${days.map((k) => {
        const l = inWeek.filter((a) => a.pid === pid && a.day === k).sort((x, y) => x.t - y.t)
          .map((a) => a.type === "kitchen" ? "🍳" : `<span class="w-tag ${a.type}">${a.type === "sag" ? 'ש"ג' : "מ"} ${hh(slotAbs(k, a.i))}</span>`);
        return `<td>${l.join("<br>") || ""}</td>`;
      }).join("")}<td>${hrs}</td><td class="${minGap < 12 ? "w-bad" : ""}">${minGap < 999 ? minGap + " ש'" : "—"}</td></tr>`;
    }
    h += `</tbody></table></div>`;
  }
  h += `<p class="hint">גוללים הצידה כדי לראות את כל הימים. לחיצה על תאריך פותחת את היום לעריכה.</p>`;
  $("#tab-guards").innerHTML = h;
  const tg = $("#tab-guards");
  tg.querySelectorAll("[data-view]").forEach((b) => (b.onclick = () => { guardView = b.dataset.view; renderGuards(); }));
  tg.querySelectorAll("[data-wm]").forEach((b) => (b.onclick = () => { weekMode = b.dataset.wm; renderGuards(); }));
  tg.querySelectorAll("[data-goday]").forEach((b) => (b.onclick = () => { guardDayPicked = true; guardDay = b.dataset.goday; guardView = "day"; renderGuards(); }));
  if ($("#wGen")) $("#wGen").onclick = () => {
    state.guards ||= { days: {} }; state.guards.days ||= {};
    const miss = days.filter((k) => !isNewFmt(state.guards.days[k])); let empty = 0;
    for (const k of miss) { const r = generateDay(k); state.guards.days[k] = r.day; empty += r.empty; }
    save(`נוצרו ${miss.length} רשימות` + (empty ? `, ${empty} מקומות ריקים` : " ✓")); renderGuards();
  };
}

function renderGuards() {
  if (guardView === "week") {
    if (!guardDayPicked && !guardDayValid(guardDay)) guardDay = nextGuardDay(guardDay, 1) || guardDay;
    return renderWeek();
  }
  // לפני 12:00 היום השמירה הנוכחי התחיל אתמול. אם אין לו רשימה, מציגים את היום
  if (!guardDayPicked && !state.guards?.days?.[guardDay]) guardDay = today();
  if (!guardDayPicked && !guardDayValid(guardDay)) guardDay = nextGuardDay(guardDay, 1) || guardDay;
  const key = guardDay;
  const raw = state.guards?.days?.[key];
  const d = isNewFmt(raw) ? raw : null;
  const pool = guardPool(key);
  const listeners = state.people.filter((p) => !p.inactive && p.listening);
  let h = `<div class="seg g-view"><button data-view="day" class="on">יום</button><button data-view="week">שבוע</button></div>
    <div class="cal-head">
      <button class="btn icon" id="gPrev">›</button>
      <div class="g-title"><b>${fmt(key)} ${hh(startOf(key))} – ${fmt(addDays(key, 1))} ${hh(startOf(key))}</b>${key === curGuardDay() ? `<span class="g-now">עכשיו</span>` : ""}</div>
      <button class="btn icon" id="gNext">‹</button></div>
    <div class="g-start"><label for="gStartSel">שעת התחלה לרשימות חדשות</label>
      <select id="gStartSel">${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === guardStart() ? "selected" : ""}>${hh(h)} – ${hh(h)} למחרת</option>`).join("")}</select></div>
    ${d && d.start !== guardStart() ? `<p class="hint">הרשימה של היום הזה מתחילה ב-${hh(d.start)}. כדי להחיל את השעה החדשה לוחצים "יצירה מחדש".</p>` : ""}`;
  if (!guardDayValid(key)) {
    const nx = nextGuardDay(key, 1);
    h += `<div class="empty-note g-empty">לא במוצב ביום הזה, אין שמירות.
      ${nx ? `<button class="btn wide" id="gJump">מעבר לנגלה הבאה (${fmt(nx)})</button>` : ""}</div>`;
  } else if (!d) {
    h += `<div class="empty-note g-empty">${raw ? "הרשימה של היום הזה נוצרה במבנה הישן (משמרות של 4 שעות). צריך ליצור אותה מחדש." : "אין עדיין רשימת שמירה ליום הזה."}
      <button class="btn primary wide" id="gGen">יצירת רשימה ליום הזה</button>
      <button class="btn wide" id="gGenAll">יצירה לכל הימים שנשארו בנגלה</button></div>`;
  } else {
    const assigns = collect(near(key));
    const cell = (ty, i, pid, style = "") => {
      const others = assigns.filter((a) => !(a.day === key && a.i === i && a.type === ty));
      const iss = pid ? guardIssues(pid, key, i, ty, others) : [];
      const rest = pid && !iss.length ? restAt(pid, key, i, ty, others) : 999;
      return `<button class="g-cell ${!pid ? "empty" : iss.length ? "warn" : rest < REST_OK ? "short" : ""}" style="${style}" data-gi="${i}" data-gt="${ty}">
        ${pid ? esc(pName(pid)) : "— ריק —"}${iss.length ? `<small>⚠ ${esc(iss[0])}</small>` : rest < REST_OK ? `<small class="g-rest">מנוחה ${rest} ש'</small>` : ""}</button>`;
    };
    const kIss = d.kitchen ? guardIssues(d.kitchen, key, -1, "kitchen", assigns.filter((a) => !(a.day === key && a.type === "kitchen"))) : [];
    const bad = problemCells(key).length;
    // טבלה: שורה לכל שעתיים
    let grid = `<span class="g-h">שעה</span><span class="g-h">${GTYPES.sag}</span><span class="g-h">${GTYPES.mishtach}</span>`;
    for (let r = 0; r < SLOTS; r++) {
      const night = isNightSlot(key, r);
      grid += `<span class="g-time ${night ? "night" : ""}">${night ? "🌙 " : ""}${slotLabel(key, r)}</span>`;
      grid += cell("sag", r, d.sag[r]) + (slotOff(key, "mishtach", r) ? `<div class="g-cell off">אין משטח</div>` : cell("mishtach", r, d.mishtach[r]));
    }
    h += `<div class="g-kitchen"><span>🍳 מטבח</span>
        <button class="g-cell ${!d.kitchen ? "empty" : kIss.length ? "warn" : ""}" data-gi="-1" data-gt="kitchen">${d.kitchen ? esc(pName(d.kitchen)) : "— ריק —"}${kIss.length ? `<small>⚠ ${esc(kIss[0])}</small>` : ""}</button></div>
      ${bad ? `<div class="g-alert">⚠ ${bad} שיבוצים ריקים או בעייתיים.
        <button class="btn wide" id="gFix">🔧 החלפה אוטומטית</button></div>` : ""}
      <div class="g-grid">${grid}</div>
      <p class="hint">לחיצה על שם = בחירת מחליף. <b>לחיצה ארוכה וגרירה</b> על מקום אחר = החלפה ראש בראש. ⚠ = סותר את הכללים.</p>
      <div class="actions">
        <button class="btn wa" id="gSend">📤 שליחת רשימה</button>
        <button class="btn" id="gRegen">יצירה מחדש</button>
      </div>
      ${(() => { const rest = periodRest(key).filter((k) => !isNewFmt(state.guards?.days?.[k])); return rest.length ? `<div class="actions"><button class="btn" id="gGenAll">יצירה ל-${rest.length} הימים הבאים בנגלה</button></div>` : ""; })()}
      <div class="actions"><button class="btn danger" id="gDel">מחיקת הרשימה של היום הזה</button></div>`;
  }
  // נוספים מבחוץ
  if (guardDayValid(key)) {
    const av = guestAvail(key);
    h += `<details class="rules" id="gGuestBox" ${openGuests ? "open" : ""}><summary>👤 נוספים מבחוץ (${av.length} ביום הזה)</summary>
      <p class="hint">אנשים שלא במצבה. מסמנים מי נוכח ביום השמירה הזה, והם נכנסים לשיבוץ ולספירה.</p>
      <div class="chips">${guests().map((g) => `<label class="chip"><input type="checkbox" data-gavail="${g.id}" ${av.includes(g.id) ? "checked" : ""}><span>${esc(g.name)}</span></label>`).join("") || '<span class="hint">עוד אין שמות.</span>'}</div>
      <div class="task-add" style="margin-top:10px"><input id="gGuestName" placeholder="שם חדש" autocomplete="off">
        <button class="btn outline" id="gGuestAdd">הוספה</button></div>
      ${guests().length ? `<details class="g-gdel"><summary>מחיקת שמות</summary>${guests().map((g) => `<div class="per-row"><span>${esc(g.name)}</span><button class="btn icon danger" data-gdel="${g.id}">✕</button></div>`).join("")}</details>` : ""}
    </details>`;
  }
  // סטטיסטיקה
  const st = guardStats();
  const rows = pool.concat(state.people.concat(guests()).filter((p) => st[p.id] && !pool.includes(p)))
    .map((p) => ({ p, s: st[p.id] || blankStat() }))
    .sort((a, b) => b.s.hours - a.s.hours || b.s.night - a.s.night);
  h += `<details class="rules g-stats" ${openGStats ? "open" : ""}><summary>כמה שמירות עשה כל אחד</summary>
    <table><tr><th>שם</th><th>${GTYPES.sag}</th><th>משטח</th><th>לילה</th><th>מטבח</th><th>שעות</th></tr>
    ${rows.map(({ p, s }) => `<tr><td>${esc(p.name || "ללא שם")}${p.guest ? ' <span class="g-guest">נוסף</span>' : ""}</td><td>${s.sag}</td><td>${s.mishtach}</td><td>${s.night}</td><td>${s.kitchen}</td><td><b>${s.hours}</b></td></tr>`).join("")}</table>
    <p class="hint">סופר את כל הרשימות שנוצרו, כולל ימים שעוד לא הגיעו. "שעות" = סה"כ שעות שמירה (בלי מטבח).</p></details>
  <details class="rules"><summary>הכללים של השיבוץ</summary><ul>
    <li>יום שמירה: 24 שעות משעת ההתחלה (כרגע ${hh(guardStart())}). לילה: 18:00–06:00 (🌙).</li>
    <li>ש"ג ומשטח: משמרות של שעתיים. אין משטח בין 05:00 ל-07:00.</li>
    <li>לסירוגין: אחרי ש"ג עדיף משטח, ואחרי משטח עדיף ש"ג.</li>
    <li>ש"ג אחרי ש"ג מותר, לפי כללי המנוחה הרגילים.</li>
    <li>מי שבמטבח שומר רק מ-10:00 ביום שלמחרת. מפק"צים לא עולים מטבח. אין שתי משמרות צמודות.</li>
    <li>לא משובצים: מי שעולה להאזנות (${listeners.length ? listeners.map((p) => esc(p.name || "?")).join(", ") : "אין"}), מי שבחוץ ביציאה מאושרת, ומי שלא בתקופה.</li>
    <li>מנוחה בין שמירות: כמה שיותר. פחות מ-${MIN_REST} שעות אסור. 8–12 רק אם אין ברירה (מסומן בכתום), 12–16 תקין, מעל 16 עדיף. נבדק גם מול הרשימות של אתמול ומחר.</li>
    <li>כדי שכל יום יתחשב בקודם, יוצרים לפי הסדר (או "יצירה לכל הימים שנשארו בנגלה"). אם יוצרים מחדש יום באמצע, הימים שאחריו לא משתנים, אבל קונפליקטים איתם יסומנו.</li>
    <li>החלוקה מאזנת לפי סה"כ שעות שמירה, ובנפרד לפי שמירות לילה.</li></ul></details>`;
  $("#tab-guards").innerHTML = h;
  const tg = $("#tab-guards");
  tg.querySelectorAll("[data-view]").forEach((b) => (b.onclick = () => { guardView = b.dataset.view; renderGuards(); }));
  tg.querySelector(".g-stats").addEventListener("toggle", (e) => (openGStats = e.target.open));
  if ($("#gGuestBox")) {
    $("#gGuestBox").addEventListener("toggle", (e) => { if (e.target.id === "gGuestBox") openGuests = e.target.open; });
    const G = () => { state.guards ||= { days: {} }; state.guards.guests ||= []; state.guards.avail ||= {}; return state.guards; };
    const addGuest = () => {
      const name = $("#gGuestName").value.trim();
      if (!name) return toast("צריך לכתוב שם", "bad");
      const g = { id: "g_" + uid(), name, guest: true, requests: [] };
      G().guests.push(g);
      G().avail[key] = [...guestAvail(key), g.id];
      save(`${name} נוסף ומסומן כנוכח ב-${fmt(key)} ✓`); renderGuards();
    };
    $("#gGuestAdd").onclick = addGuest;
    $("#gGuestName").onkeydown = (e) => { if (e.key === "Enter") addGuest(); };
    tg.querySelectorAll("[data-gavail]").forEach((c) => (c.onchange = () => {
      const id = c.dataset.gavail, set = new Set(guestAvail(key));
      c.checked ? set.add(id) : set.delete(id);
      G().avail[key] = [...set];
      let msg = `${pName(id)} ${c.checked ? "סומן כנוכח" : "הוסר מהיום הזה"} ✓`;
      if (!c.checked && state.guards.days?.[key]) { const r = fixDays([key]); if (r.fixed) msg += `, הוחלף ב-${r.fixed} שמירות`; }
      save(msg); renderGuards();
    }));
    tg.querySelectorAll("[data-gdel]").forEach((b) => (b.onclick = () => {
      const g = guests().find((x) => x.id === b.dataset.gdel);
      if (!confirm(`למחוק את ${g.name}? השיבוצים שלו יישארו ברשימות הקיימות כ"(נמחק)".`)) return;
      G().guests = guests().filter((x) => x.id !== g.id);
      save(`${g.name} נמחק`); renderGuards();
    }));
  }
  // החיצים מדלגים על ימים שלא במוצב
  $("#gPrev").onclick = () => { guardDayPicked = true; guardDay = nextGuardDay(guardDay, -1) || addDays(guardDay, -1); renderGuards(); };
  $("#gNext").onclick = () => { guardDayPicked = true; guardDay = nextGuardDay(guardDay, 1) || addDays(guardDay, 1); renderGuards(); };
  $("#gStartSel").onchange = (e) => {
    state.settings = { ...(state.settings || {}), guardStart: +e.target.value };
    save(`שעת ההתחלה לרשימות חדשות: ${hh(+e.target.value)} ✓`); renderGuards();
  };
  if ($("#gJump")) $("#gJump").onclick = () => { guardDayPicked = true; guardDay = nextGuardDay(key, 1); renderGuards(); };
  const gen = () => {
    const r = generateDay(key);
    state.guards = state.guards || { days: {} }; state.guards.days ||= {};
    state.guards.days[key] = r.day;
    save(r.empty ? `הרשימה נוצרה, ${r.empty} מקומות נשארו ריקים` : `רשימת שמירה ל-${fmt(key)} נוצרה ✓`);
    renderGuards();
  };
  if ($("#gGen")) $("#gGen").onclick = gen;
  // יצירה של כמה ימים ברצף: כל יום נבנה אחרי הקודם, כך שהוא מתחשב ברשימה של אתמול (מנוחה, ש"ג ברצף וכו')
  if ($("#gGenAll")) $("#gGenAll").onclick = () => {
    const days = [key, ...periodRest(key)].filter((k) => !isNewFmt(state.guards?.days?.[k]));
    let empty = 0;
    for (const k of days) { const r = generateDay(k); state.guards.days[k] = r.day; empty += r.empty; }
    save(`נוצרו ${days.length} רשימות (${fmt(days[0])}–${fmt(days[days.length - 1])})` + (empty ? `, ${empty} מקומות ריקים` : " ✓"));
    renderGuards();
  };
  if ($("#gRegen")) $("#gRegen").onclick = () => { if (confirm("ליצור מחדש את כל הרשימה של היום הזה? שינויים ידניים יימחקו.")) gen(); };
  if ($("#gDel")) $("#gDel").onclick = () => {
    if (!confirm("למחוק את רשימת השמירה של היום הזה?")) return;
    delete state.guards.days[key]; save("הרשימה נמחקה"); renderGuards();
  };
  if ($("#gSend")) $("#gSend").onclick = () => openGuardReport(key);
  if ($("#gFix")) $("#gFix").onclick = () => {
    const r = fixDays([key]);
    save(r.left ? `הוחלפו ${r.fixed}, נשארו ${r.left} שלא נמצא להם מחליף` : `הוחלפו ${r.fixed} שיבוצים ✓`);
    renderGuards();
  };
  tg.querySelectorAll("[data-gi]").forEach((b) => (b.onclick = () => { if (dragJustEnded) return; openGuardPick(key, +b.dataset.gi, b.dataset.gt); }));
  if (d) setupGuardDrag(tg, key);
}

// ---------- גרירה להחלפה ראש בראש ----------
let drag = null, press = null, dragJustEnded = false;
function setupGuardDrag(root, key) {
  root.querySelectorAll("[data-gi]").forEach((el) => el.addEventListener("pointerdown", (e) => {
    if (e.button > 0) return;
    press = { el, key, x: e.clientX, y: e.clientY, mouse: e.pointerType === "mouse" };
    if (!press.mouse) press.timer = setTimeout(() => startDrag(press.x, press.y), 350);
  }));
}
function startDrag(x, y) {
  if (!press) return;
  const el = press.el;
  const g = el.cloneNode(true);
  g.className = "g-cell g-ghost";
  const r = el.getBoundingClientRect();
  g.style.width = r.width + "px";
  document.body.appendChild(g);
  drag = { src: el, key: press.key, ghost: g, target: null, w: r.width, h: r.height };
  el.classList.add("g-src");
  document.body.classList.add("dragging");
  if (navigator.vibrate) navigator.vibrate(25);
  moveDrag(x, y);
}
function moveDrag(x, y) {
  drag.ghost.style.left = x - drag.w / 2 + "px";
  drag.ghost.style.top = y - drag.h / 2 + "px";
  const t = document.elementFromPoint(x, y)?.closest("#tab-guards [data-gi]");
  if (drag.target && drag.target !== t) drag.target.classList.remove("g-over", "g-over-bad");
  const nt = t && t !== drag.src ? t : null;
  if (nt !== drag.target) {
    drag.target = nt;
    // תצוגה מקדימה: אדום + הסיבה אם ההחלפה תסתור כלל
    const w = nt ? swapWarnings(drag.key, { ty: drag.src.dataset.gt, i: +drag.src.dataset.gi }, { ty: nt.dataset.gt, i: +nt.dataset.gi }) : [];
    drag.ghost.classList.toggle("bad", w.length > 0);
    drag.ghost.querySelector(".g-hint")?.remove();
    if (w.length) drag.ghost.insertAdjacentHTML("beforeend", `<small class="g-hint">⚠ ${esc(w[0])}</small>`);
    if (nt) nt.classList.toggle("g-over-bad", w.length > 0);
  }
  if (drag.target) drag.target.classList.add("g-over");
  // גלילה אוטומטית ליד קצוות המסך
  if (y < 70) window.scrollBy(0, -12); else if (y > innerHeight - 70) window.scrollBy(0, 12);
}
function endDrag(cancel) {
  if (press?.timer) clearTimeout(press.timer);
  press = null;
  if (!drag) return;
  const { src, target, key, ghost } = drag;
  ghost.remove(); src.classList.remove("g-src"); target?.classList.remove("g-over", "g-over-bad");
  document.body.classList.remove("dragging");
  drag = null;
  dragJustEnded = true; setTimeout(() => (dragJustEnded = false), 350);
  if (cancel || !target) return;
  swapCells(key, { ty: src.dataset.gt, i: +src.dataset.gi }, { ty: target.dataset.gt, i: +target.dataset.gi });
}
// מה ישתבש אם נחליף את שני המקומות (מחשב על עותק ומחזיר את המצב)
function swapWarnings(key, a, b) {
  const d = state.guards.days[key];
  const va = cellGet(d, a.ty, a.i), vb = cellGet(d, b.ty, b.i);
  cellSet(d, a.ty, a.i, vb); cellSet(d, b.ty, b.i, va);
  const all = collect(near(key));
  const issues = (pid, c) => pid ? guardIssues(pid, key, c.i, c.ty, all.filter((x) => !(x.day === key && x.i === c.i && x.type === c.ty))) : [];
  const warn = [...issues(vb, a).map((w) => `${pName(vb)}: ${w}`), ...issues(va, b).map((w) => `${pName(va)}: ${w}`)];
  cellSet(d, a.ty, a.i, va); cellSet(d, b.ty, b.i, vb);
  return warn;
}
function swapCells(key, a, b) {
  const d = state.guards.days[key];
  const va = cellGet(d, a.ty, a.i), vb = cellGet(d, b.ty, b.i);
  if (va === vb) return;
  const warn = swapWarnings(key, a, b);
  cellSet(d, a.ty, a.i, vb); cellSet(d, b.ty, b.i, va);
  const msg = va && vb ? `הוחלפו ${pName(va)} ↔ ${pName(vb)}` : `${pName(va || vb)} הועבר`;
  save(warn.length ? null : msg + " ✓");
  if (warn.length) toast(`${msg}. ⚠ ${warn[0]}`, "bad");
  renderGuards();
}
document.addEventListener("pointermove", (e) => {
  if (drag) return moveDrag(e.clientX, e.clientY);
  if (!press) return;
  const dist = Math.hypot(e.clientX - press.x, e.clientY - press.y);
  if (press.mouse) { if (dist > 6) startDrag(e.clientX, e.clientY); }
  else if (dist > 10) { clearTimeout(press.timer); press = null; } // זו גלילה, לא גרירה
});
document.addEventListener("pointerup", () => endDrag(false));
document.addEventListener("pointercancel", () => endDrag(!drag));
document.addEventListener("touchmove", (e) => { if (drag) e.preventDefault(); }, { passive: false });
document.addEventListener("contextmenu", (e) => { if (drag || press) e.preventDefault(); });

// ימי השמירה שאחרי היום הזה, עד סוף הנגלה
function periodRest(key) {
  const out = []; let k = addDays(key, 1);
  while (guardDayValid(k) && out.length < 40) { out.push(k); k = addDays(k, 1); }
  return out;
}
const cellGet = (d, ty, i) => (ty === "kitchen" ? d.kitchen : d[ty][i]);
const cellSet = (d, ty, i, v) => { if (ty === "kitchen") d.kitchen = v; else d[ty][i] = v; };

function openGuardPick(key, i, ty) {
  const d = state.guards.days[key];
  const cur = cellGet(d, ty, i);
  const others = collect(near(key)).filter((a) => !(a.day === key && a.i === i && a.type === ty));
  const st = guardStats();
  const list = state.people.filter((p) => !p.inactive).concat(availGuests(key)).map((p) => ({ p, iss: guardIssues(p.id, key, i, ty, others), s: st[p.id] || blankStat(),
      rest: ty === "kitchen" ? 999 : restAt(p.id, key, i, ty, others) }))
    .sort((a, b) => (a.iss.length > 0) - (b.iss.length > 0) || (a.rest < REST_OK) - (b.rest < REST_OK) || a.s.hours - b.s.hours);
  const what = ty === "kitchen" ? "מטבח" : `${GTYPES[ty]} · ${slotLabel(key, i)}`;
  $("#sheetBody").innerHTML = `
    <div class="sheet-top"><div><h2>${what}</h2><div class="sheet-sub">${fmt(ty === "kitchen" ? key : slotDate(key, ty, i))}${cur ? ` · כרגע: ${esc(pName(cur))}` : ""}</div></div>
      <button class="btn icon" data-close>✕</button></div>
    <div class="card">${list.map(({ p, iss, s, rest }) => `<button class="g-pick ${iss.length ? "bad" : ""} ${p.id === cur ? "cur" : ""}" data-pick="${p.id}">
      <span class="name">${esc(p.name || "ללא שם")}${p.guest ? ' <span class="g-guest">נוסף</span>' : ""}</span>
      <span class="g-why">${iss.length ? "⚠ " + esc(iss.join(" · ")) : `${s.hours} שעות · ${s.night} לילה${rest < 999 ? ` · <b class="${rest < REST_OK ? "g-rest" : ""}">מנוחה ${rest} ש'</b>` : ""}`}</span></button>`).join("")}</div>
    <div class="actions"><button class="btn" id="gClear">השאר ריק</button>
      ${cur && !findP(cur)?.guest ? `<button class="btn danger" id="gAbsent">🚫 ${esc(pName(cur))} לא נמצא</button>` : ""}</div>`;
  sheet.classList.remove("hidden");
  const set = (pid) => {
    cellSet(state.guards.days[key], ty, i, pid);
    save(pid ? `${pName(pid)} שובץ ל${what} ✓` : "המקום נשאר ריק");
    closeSheet(); renderGuards();
  };
  $("#sheetBody").querySelectorAll("[data-pick]").forEach((b) => (b.onclick = () => {
    const it = list.find((x) => x.p.id === b.dataset.pick);
    if (it.iss.length && !confirm(`${it.p.name}: ${it.iss.join(", ")}.\nלשבץ בכל זאת?`)) return;
    set(b.dataset.pick);
  }));
  $("#gClear").onclick = () => set("");
  if ($("#gAbsent")) $("#gAbsent").onclick = () => openAbsent(cur, ty === "kitchen" ? key : slotDate(key, ty, i));
}

function guardText(key, mode) {
  const d = state.guards.days[key];
  let txt = `*רשימת שמירה ${fmt(key)} ${hh(startOf(key))} – ${fmt(addDays(key, 1))} ${hh(startOf(key))}*\n`;
  if (mode === "time") {
    txt += `*מטבח:* ${d.kitchen ? pName(d.kitchen) : "—"}\n`;
    for (const ty of ["sag", "mishtach"]) {
      txt += `\n*${GTYPES[ty]}*\n` + d[ty].map((pid, i) => `${isNightSlot(key, i) ? "🌙 " : ""}${slotLabel(key, i)} – ${slotOff(key, ty, i) ? "אין" : pid ? pName(pid) : "—"}`).join("\n") + "\n";
    }
  } else {
    const by = {};
    if (d.kitchen) (by[d.kitchen] ||= []).push({ t: -1, s: "מטבח" });
    for (const ty of ["sag", "mishtach"]) d[ty].forEach((pid, i) => { if (pid) (by[pid] ||= []).push({ t: slotT(key, ty, i), s: `${GTYPES[ty]} ${slotLabel(key, i)}` }); });
    txt += "\n" + Object.entries(by).sort((a, b) => pName(a[0]).localeCompare(pName(b[0]), "he"))
      .map(([pid, l]) => `*${pName(pid)}*: ${l.sort((a, b) => a.t - b.t).map((x) => x.s).join(", ")}`).join("\n");
  }
  return txt.trim();
}

function openGuardReport(key) {
  let mode = "time";
  $("#sheetBody").innerHTML = `
    <div class="sheet-top"><h2>רשימת שמירה</h2><button class="btn icon" data-close>✕</button></div>
    <div class="seg"><button data-mode="time" class="on">לפי שעות</button><button data-mode="name">לפי שמות</button></div>
    <label>ההודעה (אפשר לערוך לפני השליחה)</label>
    <textarea id="gText" class="rep-text"></textarea>
    <div class="actions"><button class="btn wa" id="gWa">שליחה בוואטסאפ</button><button class="btn" id="gCopy">העתקה</button></div>`;
  sheet.classList.remove("hidden");
  const fill = () => { $("#gText").value = guardText(key, mode); };
  fill();
  $("#sheetBody").querySelectorAll("[data-mode]").forEach((b) => (b.onclick = () => {
    mode = b.dataset.mode; $("#sheetBody").querySelectorAll("[data-mode]").forEach((x) => x.classList.toggle("on", x === b)); fill();
  }));
  $("#gWa").onclick = () => window.open("https://wa.me/?text=" + encodeURIComponent($("#gText").value), "_blank");
  $("#gCopy").onclick = async () => {
    try { await navigator.clipboard.writeText($("#gText").value); } catch { $("#gText").select(); document.execCommand("copy"); }
    toast("הרשימה הועתקה ✓");
  };
}

// פעם אחת: מסמנים את מי שעולה להאזנות — הסמפל"ג ומי שרשום ראשון בכל צוות
function initListeners() {
  if (state.settings?.listenInit) return false;
  const staff = state.people.find((p) => p.group === "staff" && /סמפל"ג/.test(p.role || ""));
  if (staff) staff.listening = true;
  for (const g of ["1a", "1b", "1c"]) {
    const first = state.people.find((p) => p.group === g && !p.inactive);
    if (first) first.listening = true;
  }
  state.settings = { ...(state.settings || {}), listenInit: true };
  return true;
}

// ---------- "לא נמצא": היעדרות מאושרת + החלפה בשמירות ----------
function problemCells(key) {
  const d = state.guards?.days?.[key]; if (!isNewFmt(d)) return [];
  const all = collect(near(key)); const out = [];
  const chk = (pid, i, ty) => {
    if (!pid) return out.push({ i, ty });
    if (guardIssues(pid, key, i, ty, all.filter((a) => !(a.day === key && a.i === i && a.type === ty))).length) out.push({ i, ty });
  };
  chk(d.kitchen, -1, "kitchen");
  for (const ty of ["sag", "mishtach"]) d[ty].forEach((pid, i) => { if (!slotOff(key, ty, i)) chk(pid, i, ty); });
  return out;
}

// מחליף כל שיבוץ ריק או בעייתי במחליף המתאים ביותר
function fixDays(keys) {
  let fixed = 0, left = 0;
  for (const key of keys) {
    const pool = guardPool(key);
    const d = state.guards?.days?.[key]; if (!isNewFmt(d)) continue;
    for (const { i, ty } of problemCells(key)) {
      cellSet(d, ty, i, "");
      const st = guardStats();
      const all = collect(near(key));
      const t = ty === "kitchen" ? 0 : slotT(key, ty, i);
      let pick = null, ps = Infinity;
      for (const p of pool) {
        if (guardIssues(p.id, key, i, ty, all).length) continue;
        const s = st[p.id] || blankStat();
        const mine = all.filter((a) => a.pid === p.id && a.type !== "kitchen");
        const dayN = mine.filter((a) => a.day === key).length;
        const sc = ty === "kitchen" ? s.kitchen * 10 + s.hours
          : slotScore(s, ty, isNightSlot(key, i), dayN, gapTo(mine.map((a) => [a.t, a.end]), t, t + SLOT_LEN), altPen(mine.map((a) => [a.t, a.end, a.type]), t, ty));
        if (sc < ps) { ps = sc; pick = p.id; }
      }
      if (pick) { cellSet(d, ty, i, pick); fixed++; } else left++;
    }
  }
  return { fixed, left };
}

function openAbsent(pid, from) {
  const p = state.people.find((x) => x.id === pid); if (!p) return;
  const to = periodOf(from)?.to || from;
  $("#sheetBody").innerHTML = `
    <div class="sheet-top"><h2>🚫 ${esc(p.name || "ללא שם")} לא נמצא</h2><button class="btn icon" data-close>✕</button></div>
    <p class="hint">נרשמת היעדרות מאושרת. הוא יוצא מהנוכחות, ומכל השמירות בתאריכים האלה מוחלף אוטומטית.</p>
    <div class="two"><div><label>מתאריך</label><input type="date" id="abFrom" value="${from}"></div>
      <div><label>עד תאריך (כולל)</label><input type="date" id="abTo" value="${to}"></div></div>
    <label>סיבה</label><input id="abWhy" value="לא נמצא">
    <div class="actions"><button class="btn danger" id="abSave">סימון והחלפה בשמירות</button></div>`;
  sheet.classList.remove("hidden");
  $("#abFrom").onchange = () => { if ($("#abTo").value < $("#abFrom").value) $("#abTo").value = $("#abFrom").value; };
  $("#abSave").onclick = () => {
    const f = $("#abFrom").value, t = $("#abTo").value;
    if (!f || !t || t < f) return toast("תאריכים לא תקינים", "bad");
    const x = state.people.find((k) => k.id === pid);
    x.requests.push({ id: uid(), from: f, to: t, reason: $("#abWhy").value.trim() || "לא נמצא", status: "approved" });
    // ימי שמירה שמושפעים: כל יום שמשמרות שלו נופלות בטווח (כולל היום שלפני, כי הבוקר שלו הוא למחרת)
    const keys = Object.keys(state.guards?.days || {}).filter((k) => k >= addDays(f, -1) && k <= t);
    const r = fixDays(keys);
    save(`${x.name} סומן כלא נמצא` + (r.fixed ? `, הוחלף ב-${r.fixed} שמירות` : "") + (r.left ? ` (${r.left} נשארו ריקות)` : "") + " ✓");
    closeSheet(); render();
  };
}

// ---------- האזנות ----------
// יום האזנה: 13:00 עד 13:00 למחרת. צוות אחד לוגיסטיקה ושניים בכוננות, בסבב יומי.
// בלילה מאזינים: מי שמסומן "האזנות" בצוות הלוגיסטיקה + מי שמסומן "האזנות" במפל"ג (תמיד), + נוספים מבחוץ שסומנו.
// חלון הלילה מסתיים ב-05:00 (05:00–07:00 אין האזנה). אורך משמרת = 6.5 שעות חלקי מספר המאזינים, מעוגל לרבע שעה.
const LTEAMS = ["1a", "1b", "1c"];
const lStart = () => state.listen?.start ?? 13 * 60; // תחילת יום ההאזנה, בדקות מחצות
const L = () => { state.listen ||= {}; state.listen.days ||= {}; state.listen.guests ||= []; return state.listen; };
const lAnchor = () => state.listen?.anchor || { date: "2026-11-08", team: "1b" };
const lDayValid = (key) => guardDayValid(key);
function lCount(from, to) { // כמה ימי מוצב בין שני תאריכים (מסומן)
  if (from === to) return 0;
  const dir = to > from ? 1 : -1; let n = 0, k = from;
  while (k !== to) { k = addDays(k, dir); if (lDayValid(k)) n += dir; if (Math.abs(dayIdx(k) - dayIdx(from)) > 800) break; }
  return n;
}
function logisticTeam(key) {
  const o = state.listen?.days?.[key]?.logistic;
  if (o) return o;
  const a = lAnchor();
  const idx = LTEAMS.indexOf(a.team) + lCount(a.date, key);
  return LTEAMS[((idx % 3) + 3) % 3];
}
const gLabel = (id) => GROUPS.find((g) => g.id === id)?.name || id;
const lGuests = () => state.listen?.guests || [];
const lFind = (id) => state.people.find((p) => p.id === id) || lGuests().find((g) => g.id === id);
const fmtM = (m) => { m = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };

function nightListeners(key) {
  const team = logisticTeam(key);
  const dd = state.listen?.days?.[key] || {};
  const off = new Set(dd.off || []);
  const auto = state.people.filter((p) => !p.inactive && p.listening && (p.group === team || p.group === "staff"))
    .filter((p) => !isOut(p, key) && !off.has(p.id));
  const gs = lGuests().filter((g) => (dd.guestsOn || []).includes(g.id));
  let list = auto.concat(gs);
  // סדר: אם נקבע ידנית לאותו לילה — לפיו, אחרת מסתובב כל יום כדי שאותו אחד לא יקבל תמיד את אמצע הלילה
  if (dd.order) {
    const pos = (id) => { const i = dd.order.indexOf(id); return i < 0 ? 999 : i; };
    list.sort((a, b) => pos(a.id) - pos(b.id));
  } else if (list.length) {
    const r = ((lCount(lAnchor().date, key) / 3) | 0) % list.length;
    list = list.slice(r).concat(list.slice(0, r));
  }
  return { team, list, off: [...off] };
}
function nightSchedule(key) {
  const { list } = nightListeners(key);
  const n = list.length; if (!n) return [];
  const END = 5 * 60 + 1440; // 05:00 למחרת, בדקות מחצות של היום הראשון
  // ברירת מחדל: הלילה 23:00–05:00 מתחלק שווה. אם נקבע אורך — הלילה מתחיל לפי זה ונגמר ב-05:00
  const dur = state.listen?.days?.[key]?.dur || Math.max(15, Math.round(360 / n / 15) * 15);
  const start = END - dur * n;
  return list.map((p, i) => ({ p, from: start + i * dur, to: start + (i + 1) * dur }));
}

// ביום (כל השעות חוץ מהלילה ו-05:00–07:00) מאזינים מי שמסומנים "האזנות" בשני צוותי הכוננות, בסבב
function dayListeners(key) {
  const team = logisticTeam(key);
  const dd = state.listen?.days?.[key] || {};
  const off = new Set(dd.off || []);
  const ppl = state.people.filter((p) => !p.inactive && p.listening && p.group !== team && p.group !== "staff")
    .filter((p) => !isOut(p, key) && !off.has(p.id));
  let list = ppl.concat(lGuests().filter((g) => (dd.guestsDay || []).includes(g.id)));
  if (list.length) { const r = lCount(lAnchor().date, key) % list.length; list = list.slice(r).concat(list.slice(0, r)); }
  return list;
}
function daySchedule(key) {
  // כל מי שמסומן להאזנה ולא מאזין בלילה מקבל משמרת אחת ביום. הזמן שנשאר (בלי הלילה ובלי 05:00–07:00) מתחלק שווה
  const dd = state.listen?.days?.[key] || {};
  const list = dayListeners(key);
  const night = nightSchedule(key);
  const NS = night.length ? night[0].from : 23 * 60;
  const S = lStart();
  const A = Math.max(0, NS - S), B = Math.max(0, S - 7 * 60), D = A + B; // מתחילת היום עד הלילה, ומ-07:00 עד תחילת היום הבא
  const k = list.length; if (!k) return [];
  const clock = (o) => (o < A ? S + o : 31 * 60 + (o - A));
  const r15 = (x) => Math.round(x / 15) * 15;
  const out = [];
  for (let j = 0; j < k; j++) {
    const o1 = r15(D * j / k), o2 = j === k - 1 ? D : r15(D * (j + 1) / k);
    const pid = dd.daySlots?.[j];
    const p = (pid && lFind(pid)) || list[j];
    const seg = (f, t) => out.push({ from: clock(f), to: f < A && t === A ? NS : clock(t === A ? A : t), p, manual: !!pid, i: j });
    if (o1 < A && o2 > A) { seg(o1, A); out.push({ from: 31 * 60, to: clock(o2), p, manual: !!pid, i: j, cont: true }); }
    else seg(o1, o2);
  }
  return out;
}

let lDay = null, lPicked = false;
function renderListen() {
  if (!lPicked || !lDay) {
    const n = new Date(); if (n.getHours() * 60 + n.getMinutes() < lStart()) n.setDate(n.getDate() - 1);
    lDay = ymd(n);
    if (!lDayValid(lDay)) lDay = nextGuardDay(lDay, 1) || lDay;
  }
  const key = lDay;
  let h = `<div class="cal-head">
      <button class="btn icon" id="lPrev">›</button>
      <div class="g-title"><b>${fmt(key)} ${fmtM(lStart())} – ${fmt(addDays(key, 1))} ${fmtM(lStart())}</b></div>
      <button class="btn icon" id="lNext">‹</button></div>
    <div class="g-start"><label for="lStartSel">ההאזנות מתחילות ב-</label>
      <select id="lStartSel">${Array.from({ length: 32 }, (_, k) => 7 * 60 + k * 30).map((m) => `<option value="${m}" ${m === lStart() ? "selected" : ""}>${fmtM(m)} – ${fmtM(m)} למחרת</option>`).join("")}</select></div>`;
  if (!lDayValid(key)) {
    const nx = nextGuardDay(key, 1);
    h += `<div class="empty-note g-empty">לא במוצב ביום הזה.${nx ? `<button class="btn wide" id="lJump">מעבר לנגלה הבאה (${fmt(nx)})</button>` : ""}</div>`;
  } else {
    const { team, list, off } = nightListeners(key);
    const sched = nightSchedule(key);
    const standby = LTEAMS.filter((t) => t !== team);
    const dd = state.listen?.days?.[key] || {};
    const offPeople = state.people.filter((p) => !p.inactive && p.listening && (p.group === team || p.group === "staff"))
      .filter((p) => off.includes(p.id) || isOut(p, key));
    const dur = sched.length ? sched[0].to - sched[0].from : 0;
    h += `<div class="l-teams">
        <div class="l-team log"><small>לוגיסטיקה</small><select id="lLog">${LTEAMS.map((t) => `<option value="${t}" ${t === team ? "selected" : ""}>${gLabel(t)}</option>`).join("")}</select></div>
        ${standby.map((t) => `<div class="l-team"><small>כוננות</small><b>${gLabel(t)}</b></div>`).join("")}
      </div>
      ${dd.logistic ? `<p class="hint">שונה ידנית ליום הזה. <a href="#" id="lLogReset">חזרה לסבב</a></p>` : ""}
      ${(() => {
        const ds = daySchedule(key), dl = dayListeners(key);
        const opts = (cur) => dl.concat(sched.map((x) => x.p)).filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i)
          .map((x) => `<option value="${x.id}" ${cur?.id === x.id ? "selected" : ""}>${esc(x.name || "?")}</option>`).join("");
        const row = (s) => `<div class="l-row l-day"><span class="l-time">${fmtM(s.from)}–${fmtM(s.to)}</span>
          ${s.cont ? `<span class="name muted">${esc(s.p?.name || "")} (המשך)</span>` : `<select class="l-pick" data-dslot="${s.i}">`}${s.cont ? "" : `${s.p ? "" : '<option value="">— אין מאזין —</option>'}${opts(s.p)}</select>`}
          ${s.manual && !s.cont ? `<button class="btn icon" data-dreset="${s.i}" title="חזרה לסבב">↺</button>` : ""}</div>`;
        const A = ds.filter((s) => s.from < 24 * 60), B = ds.filter((s) => s.from >= 24 * 60);
        dayRowsA = A.map(row).join(""); dayRowsB = B.map(row).join("");
        const per = dl.length ? Math.round((Math.max(0, (sched[0]?.from ?? 1380) - lStart()) + Math.max(0, lStart() - 420)) / dl.length) : 0;
        return `<div class="group-head"><h2>☀️ האזנה רגילה</h2><span class="muted">${dl.length} מאזינים${per ? ` · ~${Math.floor(per / 60)}:${String(Math.round(per % 60 / 15) * 15 % 60).padStart(2, "0")} לאחד` : ""}</span></div>`;
      })()}
      <div class="card">${dayRowsA}</div>
      <div class="group-head" style="margin-top:14px"><h2>🌙 לילה (לוגיסטיקה)</h2><span class="muted">${list.length} מאזינים${dur ? ` · ${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, "0")} לאחד` : ""}</span></div>
      <div class="card">${sched.map((s, i) => `<div class="l-row">
          <span class="l-time">${fmtM(s.from)}–${fmtM(s.to)}</span>
          <span class="name">${esc(s.p.name || "ללא שם")}${s.p.guest ? ' <span class="g-guest">נוסף</span>' : ""}</span>
          <span class="l-btns"><button class="btn icon" data-up="${i}" ${i ? "" : "disabled"}>▲</button><button class="btn icon" data-down="${i}" ${i < sched.length - 1 ? "" : "disabled"}>▼</button>
          <button class="btn icon danger" data-loff="${s.p.id}" title="לא מאזין הלילה">✕</button></span></div>`).join("") || `<div class="empty-note">אין מאזינים ללילה הזה.</div>`}
        <div class="l-row l-none"><span class="l-time">05:00–07:00</span><span class="name muted">אין האזנה</span></div>
        ${dayRowsB}</div>
      ${offPeople.length ? `<p class="hint">לא מאזינים הלילה: ${offPeople.map((p) => `${esc(p.name)}${isOut(p, key) ? " (בחוץ)" : ` <a href="#" data-lon="${p.id}">החזרה</a>`}`).join(" · ")}</p>` : ""}
      <div class="l-dur"><label for="lDur">משמרת בלילה</label><select id="lDur">
        <option value="">אוטומטי (23:00–05:00)</option>${[60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240].map((m) => `<option value="${m}" ${dd.dur === m ? "selected" : ""}>${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}</option>`).join("")}</select></div>
      <div class="actions"><button class="btn wa" id="lSend">📤 שליחת האזנות</button></div>
      <details class="rules" id="lGuestBox" ${openLGuests ? "open" : ""}><summary>👤 נוספים מבחוץ (${new Set([...(dd.guestsOn || []), ...(dd.guestsDay || [])]).size} ביום הזה)</summary>
        <p class="hint">לא משפיעים על המצבה ועל השמירות. מסמנים מי מאזין ביום הזה ומתי.</p>
        ${lGuests().length ? `<small class="muted">☀️ ביום</small><div class="chips">${lGuests().map((g) => `<label class="chip"><input type="checkbox" data-lgd="${g.id}" ${(dd.guestsDay || []).includes(g.id) ? "checked" : ""}><span>${esc(g.name)}</span></label>`).join("")}</div>
        <small class="muted" style="display:block;margin-top:8px">🌙 בלילה</small><div class="chips">${lGuests().map((g) => `<label class="chip"><input type="checkbox" data-lg="${g.id}" ${(dd.guestsOn || []).includes(g.id) ? "checked" : ""}><span>${esc(g.name)}</span></label>`).join("")}</div>` : '<span class="hint">עוד אין שמות.</span>'}
        <div class="task-add" style="margin-top:10px"><input id="lGuestName" placeholder="שם חדש" autocomplete="off"><button class="btn outline" id="lGuestAdd">הוספה</button></div>
        ${lGuests().length ? `<details class="g-gdel"><summary>מחיקת שמות</summary>${lGuests().map((g) => `<div class="per-row"><span>${esc(g.name)}</span><button class="btn icon danger" data-lgdel="${g.id}">✕</button></div>`).join("")}</details>` : ""}
      </details>`;
  }
  h += `<details class="rules"><summary>איך זה עובד</summary><ul>
    <li>יום האזנה: ${fmtM(lStart())} עד ${fmtM(lStart())} למחרת (משנים למעלה). צוות אחד לוגיסטיקה ושני האחרים בכוננות. הסבב מתחלף כל יום מוצב: 1א → 1ב → 1ג.</li>
    <li>יש האזנה כל היממה חוץ מ-05:00–07:00.</li>
    <li>בלילה מאזינים מי שמסומנים "🎧 האזנות" בצוות הלוגיסטיקה, ומי שמסומן "האזנות" במפל"ג (כל לילה).</li>
    <li>האזנה רגילה (כל השאר): כל מי שמסומן "🎧 האזנות" בצוותי הכוננות מקבל משמרת אחת, כך שכל מאזין מאזין כל יום. הזמן שנשאר מתחלק שווה ביניהם. משמרת שנחתכת בלילה ממשיכה ב-07:00.</li>
    <li>לילה: 23:00–05:00, מתחלק שווה בין מאזיני הלילה. אם קובעים אורך משמרת לילה, הלילה מתחיל לפי זה ונגמר ב-05:00.</li>
    <li>מי שביציאה מאושרת לא מאזין. ✕ מוריד מישהו ללילה אחד.</li>
    <li>מי מסומן כמאזין: בכרטיס החייל, תחת "עוד".</li></ul></details>
    <details class="rules"><summary>הגדרת הסבב</summary>
      <div class="two"><div><label>מתאריך</label><input type="date" id="lAnDate" value="${lAnchor().date}"></div>
      <div><label>הצוות בלוגיסטיקה</label><select id="lAnTeam">${LTEAMS.map((t) => `<option value="${t}" ${t === lAnchor().team ? "selected" : ""}>${gLabel(t)}</option>`).join("")}</select></div></div>
      <div class="actions"><button class="btn outline" id="lAnSave">שמירת הסבב</button></div></details>`;
  $("#tab-listen").innerHTML = h;
  const tl = $("#tab-listen");
  $("#lStartSel").onchange = (e) => {
    L().start = +e.target.value;
    for (const d of Object.values(L().days)) delete d.daySlots; // המשמרות זזות, אז ההחלפות הידניות מתאפסות
    save(`ההאזנות מתחילות ב-${fmtM(+e.target.value)} ✓`); renderListen();
  };
  $("#lPrev").onclick = () => { lPicked = true; lDay = nextGuardDay(lDay, -1) || addDays(lDay, -1); renderListen(); };
  $("#lNext").onclick = () => { lPicked = true; lDay = nextGuardDay(lDay, 1) || addDays(lDay, 1); renderListen(); };
  if ($("#lJump")) $("#lJump").onclick = () => { lPicked = true; lDay = nextGuardDay(key, 1); renderListen(); };
  $("#lAnSave").onclick = () => {
    const date = $("#lAnDate").value; if (!date) return toast("צריך תאריך", "bad");
    L().anchor = { date, team: $("#lAnTeam").value };
    save(`הסבב נשמר: ${gLabel($("#lAnTeam").value)} בלוגיסטיקה ב-${fmt(date)} ✓`); renderListen();
  };
  if (!lDayValid(key)) return;
  const D = () => (L().days[key] ||= {});
  $("#lLog").onchange = (e) => { D().logistic = e.target.value; delete D().order; save(`${gLabel(e.target.value)} בלוגיסטיקה ב-${fmt(key)} ✓`); renderListen(); };
  if ($("#lLogReset")) $("#lLogReset").onclick = (e) => { e.preventDefault(); delete D().logistic; delete D().order; save("חזרה לסבב ✓"); renderListen(); };
  const move = (i, dir) => {
    const ids = nightSchedule(key).map((s) => s.p.id);
    [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
    D().order = ids; save("הסדר עודכן ✓"); renderListen();
  };
  tl.querySelectorAll("[data-up]").forEach((b) => (b.onclick = () => move(+b.dataset.up, -1)));
  tl.querySelectorAll("[data-down]").forEach((b) => (b.onclick = () => move(+b.dataset.down, 1)));
  tl.querySelectorAll("[data-loff]").forEach((b) => (b.onclick = () => {
    const id = b.dataset.loff, p = lFind(id);
    if (p?.guest) D().guestsOn = (D().guestsOn || []).filter((x) => x !== id);
    else D().off = [...new Set([...(D().off || []), id])];
    save(`${p?.name} לא מאזין הלילה`); renderListen();
  }));
  tl.querySelectorAll("[data-lon]").forEach((a) => (a.onclick = (e) => {
    e.preventDefault(); D().off = (D().off || []).filter((x) => x !== a.dataset.lon); save("הוחזר להאזנה ✓"); renderListen();
  }));
  tl.querySelectorAll("[data-dslot]").forEach((sel) => (sel.onchange = () => {
    const ds = D().daySlots ||= {}; ds[sel.dataset.dslot] = sel.value;
    save(`${lFind(sel.value)?.name} שובץ להאזנה ✓`); renderListen();
  }));
  tl.querySelectorAll("[data-dreset]").forEach((b) => (b.onclick = () => {
    if (D().daySlots) delete D().daySlots[b.dataset.dreset]; save("חזרה לסבב ✓"); renderListen();
  }));
  tl.querySelectorAll("[data-lgd]").forEach((c) => (c.onchange = () => {
    const s2 = new Set(D().guestsDay || []); c.checked ? s2.add(c.dataset.lgd) : s2.delete(c.dataset.lgd);
    D().guestsDay = [...s2]; save(`${lFind(c.dataset.lgd)?.name} ${c.checked ? "מאזין ביום" : "הוסר מהיום"} ✓`); renderListen();
  }));
  $("#lDur").onchange = (e) => { if (e.target.value) D().dur = +e.target.value; else delete D().dur; save("אורך המשמרת עודכן ✓"); renderListen(); };
  $("#lSend").onclick = () => openListenReport(key);
  $("#lGuestBox").addEventListener("toggle", (e) => { if (e.target.id === "lGuestBox") openLGuests = e.target.open; });
  const addG = () => {
    const name = $("#lGuestName").value.trim(); if (!name) return toast("צריך לכתוב שם", "bad");
    const g = { id: "lg_" + uid(), name, guest: true };
    L().guests.push(g); D().guestsOn = [...(D().guestsOn || []), g.id];
    save(`${name} נוסף ומאזין הלילה ✓`); renderListen();
  };
  $("#lGuestAdd").onclick = addG;
  $("#lGuestName").onkeydown = (e) => { if (e.key === "Enter") addG(); };
  tl.querySelectorAll("[data-lg]").forEach((c) => (c.onchange = () => {
    const s = new Set(D().guestsOn || []); c.checked ? s.add(c.dataset.lg) : s.delete(c.dataset.lg);
    D().guestsOn = [...s]; save(`${lFind(c.dataset.lg)?.name} ${c.checked ? "מאזין הלילה" : "הוסר מהלילה"} ✓`); renderListen();
  }));
  tl.querySelectorAll("[data-lgdel]").forEach((b) => (b.onclick = () => {
    const g = lFind(b.dataset.lgdel); if (!confirm(`למחוק את ${g.name}?`)) return;
    L().guests = lGuests().filter((x) => x.id !== g.id); save(`${g.name} נמחק`); renderListen();
  }));
}
let openLGuests = false, dayRowsA = "", dayRowsB = "";

function listenText(key) {
  const team = logisticTeam(key);
  const sched = nightSchedule(key);
  return `*האזנות ${fmt(key)} ${fmtM(lStart())} – ${fmt(addDays(key, 1))} ${fmtM(lStart())}*
*לוגיסטיקה:* ${gLabel(team)}
*כוננות:* ${LTEAMS.filter((t) => t !== team).map(gLabel).join(", ")}

*האזנות:*
${(() => {
  const ds = daySchedule(key);
  const line = (s) => `${fmtM(s.from)}-${fmtM(s.to)} – ${s.p ? s.p.name : "—"}`;
  return [...ds.filter((s) => s.from < 1440).map(line), ...sched.map((s) => "🌙 " + line(s)), "05:00-07:00 – אין האזנה", ...ds.filter((s) => s.from >= 1440).map(line)].join("\n");
})()}`;
}
function openListenReport(key) {
  $("#sheetBody").innerHTML = `
    <div class="sheet-top"><h2>האזנות</h2><button class="btn icon" data-close>✕</button></div>
    <label>ההודעה (אפשר לערוך לפני השליחה)</label>
    <textarea id="lText" class="rep-text"></textarea>
    <div class="actions"><button class="btn wa" id="lWa">שליחה בוואטסאפ</button><button class="btn" id="lCopy">העתקה</button></div>`;
  sheet.classList.remove("hidden");
  $("#lText").value = listenText(key);
  $("#lWa").onclick = () => window.open("https://wa.me/?text=" + encodeURIComponent($("#lText").value), "_blank");
  $("#lCopy").onclick = async () => {
    try { await navigator.clipboard.writeText($("#lText").value); } catch { $("#lText").select(); document.execCommand("copy"); }
    toast("הועתק ✓");
  };
}
