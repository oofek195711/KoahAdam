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
const upcoming = (p) => p.requests.filter((r) => r.to >= today());

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
  unsub = onSnapshot(DOC, (s) => { if (s.exists()) { state = s.data(); state.people ||= []; render(); } });
  show("#app");
});

// ---------- tabs ----------
document.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => {
  document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("active", x === b));
  $("#tab-roster").classList.toggle("hidden", b.dataset.tab !== "roster");
  $("#tab-calendar").classList.toggle("hidden", b.dataset.tab !== "calendar");
}));

function render() { renderRoster(); renderCalendar(); }

// ---------- roster ----------
function renderRoster() {
  const t = today();
  const all = state.people;
  const outToday = all.filter((p) => isOut(p, t)).length;
  const withReq = all.filter((p) => upcoming(p).length).length;
  let h = `<div class="stats">
    <div class="stat"><b>${all.length}</b><span>סה"כ</span></div>
    <div class="stat"><b>${all.length - outToday}</b><span>נוכחים היום</span></div>
    <div class="stat"><b>${outToday}</b><span>בחוץ היום</span></div>
    <div class="stat"><b>${withReq}</b><span>עם בקשות</span></div>
  </div><div class="groups">`;
  for (const g of GROUPS) {
    const ps = all.filter((p) => p.group === g.id);
    h += `<div class="${g.id === "staff" ? "g-staff" : ""}">
      <div class="group-head"><h2>${g.name}</h2><span class="muted">${ps.length} אנשים</span></div>
      <div class="card">`;
    for (const p of ps) {
      const out = isOut(p, t), up = upcoming(p).length;
      h += `<div class="row" data-person="${p.id}">
        <span class="name ${p.name ? "" : "empty"}">${esc(p.name || "ללא שם")}</span>
        ${out ? `<span class="badge out">בחוץ</span>` : up ? `<span class="badge req">${up} בקשות</span>` : ""}
        <span class="role">${esc(p.role)}</span><span class="chev">‹</span></div>`;
    }
    h += `<div class="add-row"><button data-add="${g.id}">+ הוספת אדם</button></div></div></div>`;
  }
  $("#tab-roster").innerHTML = h + "</div>";
  $("#tab-roster").querySelectorAll("[data-person]").forEach((el) => (el.onclick = () => openPerson(el.dataset.person)));
  $("#tab-roster").querySelectorAll("[data-add]").forEach((el) => (el.onclick = () => {
    const p = { id: uid(), group: el.dataset.add, role: "לוחם", name: "", requests: [] };
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
  const reqs = [...p.requests].sort((a, b) => a.from.localeCompare(b.from));
  const t = today();
  let reqHtml = reqs.length ? reqs.map((r) => `<div class="req" style="${r.to < t ? "opacity:.55" : ""}">
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
    <div class="actions"><button class="btn primary" id="saveP">שמירה</button></div>

    <div class="sec-title">בקשות יציאה</div>
    ${reqHtml}
    <div class="two"><div><label>מתאריך</label><input type="date" id="rFrom" value="${t}"></div>
      <div><label>עד תאריך</label><input type="date" id="rTo" value="${t}"></div></div>
    <label>סיבה (לא חובה)</label><input id="rWhy" placeholder="למשל: אירוע משפחתי">
    <div class="actions"><button class="btn outline" id="addReq">+ הוספת בקשה</button></div>

    <div class="actions" style="margin-top:28px"><button class="btn danger" id="delP">מחיקת האדם</button></div>`;
  sheet.classList.remove("hidden");

  $("#saveP").onclick = () => {
    p.name = $("#fName").value.trim(); p.role = $("#fRole").value.trim(); p.group = $("#fGroup").value;
    save(); closeSheet();
  };
  $("#rFrom").onchange = () => { if ($("#rTo").value < $("#rFrom").value) $("#rTo").value = $("#rFrom").value; };
  $("#addReq").onclick = () => {
    const from = $("#rFrom").value, to = $("#rTo").value;
    if (!from || !to) return alert("צריך לבחור תאריכים");
    if (to < from) return alert("תאריך הסיום לפני ההתחלה");
    p.requests.push({ id: uid(), from, to, reason: $("#rWhy").value.trim() });
    save(); openPerson(id);
  };
  $("#sheetBody").querySelectorAll("[data-delreq]").forEach((b) => (b.onclick = () => {
    if (!confirm("למחוק את הבקשה?")) return;
    p.requests = p.requests.filter((r) => r.id !== b.dataset.delreq); save(); openPerson(id);
  }));
  $("#delP").onclick = () => {
    if (!confirm(`למחוק את ${p.name || "האדם הזה"}?`)) return;
    state.people = state.people.filter((x) => x.id !== id); save(); closeSheet();
  };
}

// ---------- calendar ----------
const MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

function renderCalendar() {
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  const days = new Date(y, m + 1, 0).getDate(), first = new Date(y, m, 1).getDay(), t = today();
  const total = state.people.length;
  let h = `<div class="cal-head">
      <button class="btn icon" id="calPrev">›</button>
      <h2>${MONTHS[m]} ${y}</h2>
      <button class="btn icon" id="calNext">‹</button></div>
    <div class="legend"><span><i style="background:var(--bad-soft)"></i>יש נעדרים</span><span>לחצו על יום כדי לראות מי בחוץ</span></div>
    <div class="cal">${["א׳","ב׳","ג׳","ד׳","ה׳","ו׳","ש׳"].map((d) => `<div class="dow">${d}</div>`).join("")}`;
  for (let i = 0; i < first; i++) h += `<div></div>`;
  for (let d = 1; d <= days; d++) {
    const key = ymd(new Date(y, m, d));
    const out = state.people.filter((p) => isOut(p, key)).length;
    h += `<div class="day ${out ? "has-out" : ""} ${key === t ? "today" : ""}" data-day="${key}">
      <span class="n">${d}</span><span class="cnt">${out ? `${out} בחוץ` : ""}<br>${total - out} נוכחים</span></div>`;
  }
  $("#tab-calendar").innerHTML = h + "</div>";
  $("#calPrev").onclick = () => { calMonth.setMonth(m - 1); renderCalendar(); };
  $("#calNext").onclick = () => { calMonth.setMonth(m + 1); renderCalendar(); };
  $("#tab-calendar").querySelectorAll("[data-day]").forEach((el) => (el.onclick = () => openDay(el.dataset.day)));
}

function openDay(key) {
  const out = state.people.filter((p) => isOut(p, key));
  const gname = (id) => GROUPS.find((g) => g.id === id)?.name || "";
  $("#sheetBody").innerHTML = `
    <div class="sheet-top"><h2>${fmt(key)} · ${out.length} בחוץ</h2><button class="btn icon" data-close>✕</button></div>
    ${out.length ? `<div class="card out-list">${out.map((p) => {
      const r = p.requests.find((r) => r.from <= key && key <= r.to);
      return `<div class="row"><span class="name">${esc(p.name || "ללא שם")}</span>
        <span class="role">${esc(gname(p.group))}${r?.reason ? " · " + esc(r.reason) : ""}</span></div>`;
    }).join("")}</div>` : `<div class="empty-note">כולם נוכחים ביום הזה.</div>`}`;
  sheet.classList.remove("hidden");
}
