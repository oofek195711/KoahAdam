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
  ["roster", "calendar", "guards", "tasks"].forEach((t) => $("#tab-" + t).classList.toggle("hidden", b.dataset.tab !== t));
}));

function render() { renderRoster(); renderCalendar(); renderGuards(); renderTasks(); }

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
      <div class="actions"><button class="btn outline" id="addReq">+ הוספת בקשה</button></div>`)}

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
function buildReport(day) {
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
    <p class="hint">מחוץ ליחידה = רק מי שיש לו בקשת יציאה <b>מאושרת</b> לאותו יום. מי שמסומן "לא בתקופה" לא מופיע.</p>
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
// יום שמירה = 12:00 עד 12:00 למחרת, 12 משמרות של שעתיים. לילה = 18:00–06:00.
const SLOTS = 12;
const slotHour = (i) => (12 + 2 * i) % 24;
const hh = (h) => String(h).padStart(2, "0") + ":00";
const slotLabel = (i) => `${hh(slotHour(i))}-${hh(slotHour(i + 1))}`;
const isNight = (i) => i >= 3 && i <= 8; // 18,20,22,00,02,04
const dayIdx = (key) => { const [y, m, d] = key.split("-").map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };
const addDays = (key, n) => { const [y, m, d] = key.split("-").map(Number); return ymd(new Date(y, m - 1, d + n)); };
const slotDate = (key, i) => (i < 6 ? key : addDays(key, 1));
const slotT = (key, i) => dayIdx(key) * 24 + 12 + 2 * i; // שעה מוחלטת לתחילת המשמרת
const GTYPES = { sag: 'ש"ג', mishtach: "משטח" };
const curGuardDay = () => { const n = new Date(); if (n.getHours() < 12) n.setDate(n.getDate() - 1); return ymd(n); };
let guardDay = curGuardDay();
const pName = (id) => state.people.find((p) => p.id === id)?.name || "(נמחק)";

// כל השיבוצים בימים שביקשנו, כרשימה שטוחה
function collect(keys) {
  const out = [];
  const days = state.guards?.days || {};
  for (const k of keys) {
    const d = days[k]; if (!d) continue;
    if (d.kitchen) out.push({ pid: d.kitchen, type: "kitchen", day: k, i: -1, t: dayIdx(k) * 24 + 12 });
    (d.shifts || []).forEach((s, i) => {
      for (const ty of ["sag", "mishtach"]) if (s?.[ty]) out.push({ pid: s[ty], type: ty, day: k, i, t: slotT(k, i) });
    });
  }
  return out;
}
const near = (key) => [-2, -1, 0, 1, 2].map((n) => addDays(key, n));

// סיבות שבגללן אי אפשר לשבץ אדם. רשימה ריקה = מותר
function guardIssues(pid, key, i, type, assigns) {
  const p = state.people.find((x) => x.id === pid);
  if (!p) return ["לא קיים"];
  const r = [];
  if (p.listening) r.push("האזנות");
  if (p.inactive) r.push("לא בתקופה");
  const mine = assigns.filter((a) => a.pid === pid);
  if (type === "kitchen") {
    if (isOut(p, key)) r.push("בחוץ");
    if (mine.some((a) => a.day === key && a.type !== "kitchen")) r.push("משובץ בשמירה ביום הזה");
    return r;
  }
  const t = slotT(key, i);
  if (isOut(p, slotDate(key, i))) r.push(`בחוץ ב-${fmt(slotDate(key, i))}`);
  if (mine.some((a) => a.type === "kitchen" && a.day === key)) r.push("במטבח ביום הזה");
  if (mine.some((a) => a.type !== "kitchen" && a.t === t)) r.push("משובץ באותה שעה");
  else if (mine.some((a) => a.type !== "kitchen" && Math.abs(a.t - t) === 2)) r.push("שמירה צמודה");
  if (type === "mishtach") {
    const s = mine.find((a) => a.type === "sag" && a.t < t && t - (a.t + 2) < 24);
    if (s) r.push(`ש"ג ב-${fmt(slotDate(s.day, s.i))} ${hh(slotHour(s.i))}, צריך 24 שעות`);
  }
  if (type === "sag") {
    const m = mine.find((a) => a.type === "mishtach" && a.t > t && a.t - (t + 2) < 24);
    if (m) r.push(`יש לו משטח ב-${fmt(slotDate(m.day, m.i))} ${hh(slotHour(m.i))}`);
    const y = mine.find((a) => a.type === "sag" && (a.day === addDays(key, -1) || a.day === addDays(key, 1)));
    if (y) r.push(y.day < key ? 'עשה ש"ג ביום הקודם' : 'עושה ש"ג ביום הבא');
  }
  return r;
}

function guardStats() {
  const all = collect(Object.keys(state.guards?.days || {}));
  const st = {};
  for (const a of all) {
    const s = (st[a.pid] ||= { sag: 0, mishtach: 0, kitchen: 0, night: 0, total: 0, last: -1e9 });
    s[a.type]++;
    if (a.type !== "kitchen") { s.total++; if (isNight(a.i)) s.night++; s.last = Math.max(s.last, a.t); }
  }
  return st;
}

// בונה רשימה ליום אחד: הרבה ניסיונות עם קצת אקראיות, ובוחר את הטוב ביותר
function generateDay(key) {
  const pool = state.people.filter((p) => !p.inactive && !p.listening);
  const others = near(key).filter((k) => k !== key);
  const base = collect(others);
  const statsAll = guardStats();
  const days = state.guards?.days || {};
  // לא סופרים את היום הנוכחי (אם יוצרים מחדש)
  for (const a of collect([key])) { const s = statsAll[a.pid]; if (s) { s[a.type]--; if (a.type !== "kitchen") { s.total--; if (isNight(a.i)) s.night--; } } }
  let best = null;
  for (let iter = 0; iter < 250; iter++) {
    const assigns = base.slice();
    const st = {};
    for (const p of pool) { const s = statsAll[p.id] || {}; st[p.id] = { sag: s.sag || 0, mishtach: s.mishtach || 0, kitchen: s.kitchen || 0, night: s.night || 0, total: s.total || 0, last: -1e9 }; }
    for (const a of base) if (st[a.pid] && a.type !== "kitchen" && a.t < slotT(key, 0)) st[a.pid].last = Math.max(st[a.pid].last, a.t);
    const kc = pool.filter((p) => !guardIssues(p.id, key, -1, "kitchen", assigns).length)
      .sort((a, b) => (st[a.id].kitchen - st[b.id].kitchen) * 10 + (st[a.id].total - st[b.id].total) + (Math.random() - 0.5) * 3);
    const kitchen = kc[0]?.id || "";
    if (kitchen) assigns.push({ pid: kitchen, type: "kitchen", day: key, i: -1, t: dayIdx(key) * 24 + 12 });
    const shifts = []; let empty = kitchen ? 0 : 1;
    for (let i = 0; i < SLOTS; i++) {
      const row = {}; const t = slotT(key, i);
      const order = Math.random() < 0.5 ? ["sag", "mishtach"] : ["mishtach", "sag"];
      for (const ty of order) {
        let pick = null, ps = Infinity;
        for (const p of pool) {
          if (guardIssues(p.id, key, i, ty, assigns).length) continue;
          const s = st[p.id];
          const sc = s.total * 10 + s[ty] * 4 + (isNight(i) ? s.night * 6 : 0) + (t - s.last < 8 ? 12 : t - s.last < 12 ? 4 : 0) + Math.random() * 4;
          if (sc < ps) { ps = sc; pick = p.id; }
        }
        if (pick) {
          row[ty] = pick; assigns.push({ pid: pick, type: ty, day: key, i, t });
          const s = st[pick]; s[ty]++; s.total++; if (isNight(i)) s.night++; s.last = t;
        } else { row[ty] = ""; empty++; }
      }
      shifts.push(row);
    }
    const totals = pool.map((p) => st[p.id].total);
    const mean = totals.reduce((a, b) => a + b, 0) / (totals.length || 1);
    const spread = totals.reduce((a, b) => a + (b - mean) ** 2, 0) + pool.reduce((a, p) => a + st[p.id].night ** 2, 0) * 0.3;
    const score = empty * 1e6 + spread;
    if (!best || score < best.score) best = { score, empty, day: { kitchen, shifts, created: today() } };
    if (best.empty === 0 && iter > 120) break;
  }
  return best;
}

let guardDayPicked = false;
function renderGuards() {
  // לפני 12:00 היום השמירה הנוכחי התחיל אתמול. אם אין לו רשימה, מציגים את היום
  if (!guardDayPicked && !state.guards?.days?.[guardDay]) guardDay = today();
  if (!guardDayPicked && !guardDayValid(guardDay)) guardDay = nextGuardDay(guardDay, 1) || guardDay;
  const key = guardDay;
  const d = state.guards?.days?.[key];
  const pool = state.people.filter((p) => !p.inactive && !p.listening);
  const listeners = state.people.filter((p) => !p.inactive && p.listening);
  let h = `<div class="cal-head">
      <button class="btn icon" id="gPrev">›</button>
      <div class="g-title"><b>${fmt(key)} 12:00 – ${fmt(addDays(key, 1))} 12:00</b>${key === curGuardDay() ? `<span class="g-now">היום</span>` : ""}</div>
      <button class="btn icon" id="gNext">‹</button></div>`;
  if (!guardDayValid(key)) {
    const nx = nextGuardDay(key, 1);
    h += `<div class="empty-note g-empty">לא במוצב ביום הזה, אין שמירות.
      ${nx ? `<button class="btn wide" id="gJump">מעבר לנגלה הבאה (${fmt(nx)})</button>` : ""}</div>`;
  } else if (!d) {
    h += `<div class="empty-note g-empty">אין עדיין רשימת שמירה ליום הזה.
      <button class="btn primary wide" id="gGen">יצירת רשימה אוטומטית</button></div>`;
  } else {
    const assigns = collect(near(key));
    const cell = (i, ty, pid) => {
      const others = assigns.filter((a) => !(a.day === key && a.i === i && a.type === ty));
      const iss = pid ? guardIssues(pid, key, i, ty, others) : [];
      return `<button class="g-cell ${!pid ? "empty" : iss.length ? "warn" : ""}" data-gi="${i}" data-gt="${ty}" title="${esc(iss.join(", "))}">
        ${pid ? esc(pName(pid)) : "— ריק —"}${iss.length ? `<small>⚠ ${esc(iss[0])}</small>` : ""}</button>`;
    };
    const kIss = d.kitchen ? guardIssues(d.kitchen, key, -1, "kitchen", assigns.filter((a) => !(a.day === key && a.type === "kitchen"))) : [];
    const emptyN = (d.shifts || []).reduce((n, s) => n + (!s.sag) + (!s.mishtach), 0) + (!d.kitchen);
    h += `<div class="g-kitchen"><span>🍳 מטבח</span>
        <button class="g-cell ${!d.kitchen ? "empty" : kIss.length ? "warn" : ""}" data-gi="-1" data-gt="kitchen">${d.kitchen ? esc(pName(d.kitchen)) : "— ריק —"}${kIss.length ? `<small>⚠ ${esc(kIss[0])}</small>` : ""}</button></div>
      ${emptyN ? `<div class="g-alert">⚠ ${emptyN} מקומות לא שובצו. לחץ עליהם כדי לבחור ידנית.</div>` : ""}
      <div class="g-table">
        <div class="g-hd"><span>שעה</span><span>${GTYPES.sag}</span><span>${GTYPES.mishtach}</span></div>
        ${d.shifts.map((s, i) => `<div class="g-row ${isNight(i) ? "night" : ""}">
          <span class="g-time">${isNight(i) ? "🌙 " : ""}${slotLabel(i)}</span>${cell(i, "sag", s.sag)}${cell(i, "mishtach", s.mishtach)}</div>`).join("")}
      </div>
      <p class="hint">לחיצה על שם מאפשרת להחליף אותו. ⚠ = השיבוץ סותר את הכללים.</p>
      <div class="actions">
        <button class="btn wa" id="gSend">📤 שליחת רשימה</button>
        <button class="btn" id="gRegen">יצירה מחדש</button>
      </div>
      <div class="actions"><button class="btn danger" id="gDel">מחיקת הרשימה של היום הזה</button></div>`;
  }
  // סטטיסטיקה
  const st = guardStats();
  const rows = pool.concat(state.people.filter((p) => st[p.id] && !pool.includes(p)))
    .map((p) => ({ p, s: st[p.id] || { sag: 0, mishtach: 0, kitchen: 0, night: 0, total: 0 } }))
    .sort((a, b) => b.s.total - a.s.total || b.s.night - a.s.night);
  h += `<details class="rules g-stats" ${openGStats ? "open" : ""}><summary>כמה שמירות עשה כל אחד</summary>
    <table><tr><th>שם</th><th>${GTYPES.sag}</th><th>משטח</th><th>לילה</th><th>מטבח</th><th>סה"כ</th></tr>
    ${rows.map(({ p, s }) => `<tr><td>${esc(p.name || "ללא שם")}</td><td>${s.sag}</td><td>${s.mishtach}</td><td>${s.night}</td><td>${s.kitchen}</td><td><b>${s.total}</b></td></tr>`).join("")}</table>
    <p class="hint">סופר את כל הרשימות שנוצרו, כולל רשימות של ימים שעוד לא הגיעו. מטבח לא נכלל בסה"כ.</p></details>
  <details class="rules"><summary>הכללים של השיבוץ</summary><ul>
    <li>יום שמירה: 12:00 עד 12:00 למחרת, משמרות של שעתיים. לילה: 18:00–06:00 (🌙).</li>
    <li>מי שעשה ש"ג לא עושה משטח לפחות 24 שעות אחרי.</li>
    <li>מי שעשה ש"ג ביום אחד לא עושה ש"ג ביום שאחריו.</li>
    <li>מי שבמטבח לא שומר באותו יום. אין שתי משמרות צמודות.</li>
    <li>לא משובצים: מי שעולה להאזנות (${listeners.length ? listeners.map((p) => esc(p.name || "?")).join(", ") : "אין"}), מי שבחוץ ביציאה מאושרת, ומי שלא בתקופה.</li>
    <li>החלוקה מאזנת לפי מי שעשה הכי מעט, ובנפרד לפי שמירות לילה.</li></ul></details>`;
  $("#tab-guards").innerHTML = h;
  const tg = $("#tab-guards");
  tg.querySelector(".g-stats").addEventListener("toggle", (e) => (openGStats = e.target.open));
  // החיצים מדלגים על ימים שלא במוצב
  $("#gPrev").onclick = () => { guardDayPicked = true; guardDay = nextGuardDay(guardDay, -1) || addDays(guardDay, -1); renderGuards(); };
  $("#gNext").onclick = () => { guardDayPicked = true; guardDay = nextGuardDay(guardDay, 1) || addDays(guardDay, 1); renderGuards(); };
  if ($("#gJump")) $("#gJump").onclick = () => { guardDayPicked = true; guardDay = nextGuardDay(key, 1); renderGuards(); };
  const gen = () => {
    const r = generateDay(key);
    state.guards = state.guards || { days: {} }; state.guards.days ||= {};
    state.guards.days[key] = r.day;
    save(r.empty ? `הרשימה נוצרה, ${r.empty} מקומות נשארו ריקים` : `רשימת שמירה ל-${fmt(key)} נוצרה ✓`);
    renderGuards();
  };
  if ($("#gGen")) $("#gGen").onclick = gen;
  if ($("#gRegen")) $("#gRegen").onclick = () => { if (confirm("ליצור מחדש את כל הרשימה של היום הזה? שינויים ידניים יימחקו.")) gen(); };
  if ($("#gDel")) $("#gDel").onclick = () => {
    if (!confirm("למחוק את רשימת השמירה של היום הזה?")) return;
    delete state.guards.days[key]; save("הרשימה נמחקה"); renderGuards();
  };
  if ($("#gSend")) $("#gSend").onclick = () => openGuardReport(key);
  tg.querySelectorAll("[data-gi]").forEach((b) => (b.onclick = () => openGuardPick(key, +b.dataset.gi, b.dataset.gt)));
}
let openGStats = false;

function openGuardPick(key, i, ty) {
  const d = state.guards.days[key];
  const cur = ty === "kitchen" ? d.kitchen : d.shifts[i][ty];
  const others = collect(near(key)).filter((a) => !(a.day === key && a.i === i && a.type === ty));
  const st = guardStats();
  const list = state.people.filter((p) => !p.inactive).map((p) => ({ p, iss: guardIssues(p.id, key, i, ty, others), s: st[p.id] || { total: 0, sag: 0, mishtach: 0, night: 0, kitchen: 0 } }))
    .sort((a, b) => (a.iss.length > 0) - (b.iss.length > 0) || a.s.total - b.s.total);
  const what = ty === "kitchen" ? "מטבח" : `${GTYPES[ty]} · ${slotLabel(i)}`;
  $("#sheetBody").innerHTML = `
    <div class="sheet-top"><div><h2>${what}</h2><div class="sheet-sub">${fmt(ty === "kitchen" ? key : slotDate(key, i))}${cur ? ` · כרגע: ${esc(pName(cur))}` : ""}</div></div>
      <button class="btn icon" data-close>✕</button></div>
    <div class="card">${list.map(({ p, iss, s }) => `<button class="g-pick ${iss.length ? "bad" : ""} ${p.id === cur ? "cur" : ""}" data-pick="${p.id}">
      <span class="name">${esc(p.name || "ללא שם")}</span>
      <span class="g-why">${iss.length ? "⚠ " + esc(iss.join(" · ")) : `${s.total} שמירות · ${s.night} לילה`}</span></button>`).join("")}</div>
    <div class="actions"><button class="btn" id="gClear">השאר ריק</button></div>`;
  sheet.classList.remove("hidden");
  const set = (pid) => {
    const dd = state.guards.days[key];
    if (ty === "kitchen") dd.kitchen = pid; else dd.shifts[i][ty] = pid;
    save(pid ? `${pName(pid)} שובץ ל${what} ✓` : "המקום נשאר ריק");
    closeSheet(); renderGuards();
  };
  $("#sheetBody").querySelectorAll("[data-pick]").forEach((b) => (b.onclick = () => {
    const it = list.find((x) => x.p.id === b.dataset.pick);
    if (it.iss.length && !confirm(`${it.p.name}: ${it.iss.join(", ")}.\nלשבץ בכל זאת?`)) return;
    set(b.dataset.pick);
  }));
  $("#gClear").onclick = () => set("");
}

function guardText(key, mode) {
  const d = state.guards.days[key];
  let txt = `*רשימת שמירה ${fmt(key)} 12:00 – ${fmt(addDays(key, 1))} 12:00*\n`;
  if (mode === "time") {
    txt += `*מטבח:* ${d.kitchen ? pName(d.kitchen) : "—"}\n\n`;
    txt += d.shifts.map((s, i) => `${isNight(i) ? "🌙 " : ""}*${slotLabel(i)}*\n${GTYPES.sag}: ${s.sag ? pName(s.sag) : "—"}\nמשטח: ${s.mishtach ? pName(s.mishtach) : "—"}`).join("\n\n");
  } else {
    const by = {};
    if (d.kitchen) (by[d.kitchen] ||= []).push("מטבח");
    d.shifts.forEach((s, i) => { for (const ty of ["sag", "mishtach"]) if (s[ty]) (by[s[ty]] ||= []).push(`${GTYPES[ty]} ${slotLabel(i)}`); });
    txt += "\n" + Object.entries(by).sort((a, b) => pName(a[0]).localeCompare(pName(b[0]), "he"))
      .map(([pid, l]) => `*${pName(pid)}*: ${l.join(", ")}`).join("\n");
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
