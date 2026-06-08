/* shared.js — auth guard + layout helpers */
const API = "http://localhost:8000/api";

function getToken() {
  return localStorage.getItem("fiscalis_token");
}
function getOfficer() {
  try {
    return JSON.parse(localStorage.getItem("fiscalis_officer"));
  } catch {
    return {};
  }
}
function guardAuth() {
  if (!getToken()) {
    window.location.href = "login.html";
    return false;
  }
  return true;
}
function logout() {
  localStorage.removeItem("fiscalis_token");
  localStorage.removeItem("fiscalis_officer");
  window.location.href = "login.html";
}
async function apiFetch(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...(opts.headers || {}),
    },
  });
  const json = await res.json();
  if (res.status === 401) {
    logout();
    throw new Error("Session expirée");
  }
  return json;
}

/* ── Status ── */
const STATUS_META = {
  pending_payment: { label: "En attente de paiement", cls: "badge-pending" },
  paid: { label: "Payé", cls: "badge-paid" },
  processing: { label: "En traitement", cls: "badge-proc" },
  ready_for_pickup: { label: "Prêt à retirer", cls: "badge-ready" },
  delivered: { label: "Livré", cls: "badge-done" },
  cancelled: { label: "Annulé", cls: "badge-cancel" },
};
function statusBadge(s) {
  const m = STATUS_META[s] || { label: s, cls: "badge-pending" };
  return `<span class="badge ${m.cls}">${m.label}</span>`;
}
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function fmtSats(n) {
  return n ? Number(n).toLocaleString("fr-FR") + " sats" : "—";
}

/* ── Icons ── */
const iconGrid = () =>
  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`;
const iconFile = () =>
  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/></svg>`;
const iconScan = () =>
  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>`;
const iconBox = () =>
  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21,8 21,21 3,21 3,8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`;
const iconLogout = () =>
  `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16,17 21,12 16,7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`;
const iconArrow = () =>
  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9,18 15,12 9,6"/></svg>`;
const iconPlus = () =>
  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
const iconEdit = () =>
  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const iconSearch = () =>
  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
const iconCheck = () =>
  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20,6 9,17 4,12"/></svg>`;
const iconX = () =>
  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
const iconBolt = () =>
  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13,2 3,14 12,14 11,22 21,10 12,10 13,2"/></svg>`;
const iconEye = () =>
  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;

/* ── Nav ── */
function renderNav(active) {
  const o = getOfficer();
  const isAdmin = ["admin", "superadmin"].includes(o.role);
  const items = [
    { page: "dashboard", icon: iconGrid, label: "Tableau de bord" },
    { page: "applications", icon: iconFile, label: "Demandes" },
    { page: "verify", icon: iconScan, label: "Vérifier reçu" },
    { page: "services", icon: iconBox, label: "Services", adminOnly: true },
  ].filter((i) => !i.adminOnly || isAdmin);

  return `
  <aside class="sidebar">
    <div class="sidebar-brand">
      
      <div class="brand-text">
        <div class="brand-name"><div class="brand-mark">
            <img src="fiscalis_logo.jpeg" alt="" />
          </div></div>
      </div>
    </div>
    <nav class="nav">
      ${items
        .map(
          (i) => `
        <a href="${i.page}.html" class="nav-item ${
            active === i.page ? "active" : ""
          }">
          ${i.icon()}<span>${i.label}</span>
        </a>`
        )
        .join("")}
    </nav>
    <div class="sidebar-footer">
      <div class="officer-info">
        <div class="officer-avatar">${(o.full_name ||
          "A")[0].toUpperCase()}</div>
        <div class="officer-details">
          <div class="officer-name">${o.full_name || "Agent"}</div>
          <div class="officer-role">${o.role || ""}</div>
        </div>
      </div>
      <button onclick="logout()" class="btn-logout" title="Déconnexion">${iconLogout()}</button>
    </div>
  </aside>`;
}

/* ── CSS ── */
const SHARED_CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --navy:#24456e;
  --teal:#1b8680;
  --teal2:#17706b;
  --paper:#f4f6f9;
  --white:#ffffff;
  --ink:#0d1117;
  --muted:#6b7280;
  --border:#e5e7eb;
  --sidebar:224px;
  --gold:#c5a059;
  --red:#dc2626;
  --green:#16a34a;
}
html,body{height:100%;font-family:'DM Sans',sans-serif;background:var(--paper);color:var(--ink)}

/* Sidebar */
.sidebar{position:fixed;top:0;left:0;bottom:0;width:var(--sidebar);background:var(--navy);display:flex;flex-direction:column;z-index:100}
.sidebar-brand{padding:24px 20px 20px;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;gap:10px}
.brand-mark{width:38px;height:38px;flex-shrink:0;background:rgba(27,134,128,0.15);border:1.5px solid rgba(27,134,128,0.5);border-radius:8px;display:flex;align-items:center;justify-content:center}
.brand-name{font-family:'Syne',sans-serif;font-weight:800;font-size:14px;color:#fff;letter-spacing:2px}
.brand-sub{font-size:10px;color:rgba(255,255,255,0.3);letter-spacing:1px;margin-top:1px}
.nav{flex:1;padding:16px 12px;display:flex;flex-direction:column;gap:2px;overflow-y:auto}
.nav-item{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:6px;font-size:13px;color:rgba(255,255,255,0.5);text-decoration:none;transition:all 0.15s}
.nav-item:hover{background:rgba(255,255,255,0.07);color:#fff}
.nav-item.active{background:rgba(27,134,128,0.2);color:#1b8680;border-left:3px solid #1b8680;padding-left:9px}
.nav-item svg{flex-shrink:0}.brand-mark {
        width: 50px;
        height: 50px;
        border: 2px solid var(--gold);
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: "Syne", sans-serif;
        font-weight: 800;
        font-size: 18px;
        color: var(--gold);
        letter-spacing: 1px;
      }

      .brand-mark img {
        width: 50px;
        height: 50px;
      }
.sidebar-footer{padding:14px 12px;border-top:1px solid rgba(255,255,255,0.07);display:flex;align-items:center;gap:10px}
.officer-info{display:flex;align-items:center;gap:10px;flex:1;min-width:0}
.officer-avatar{width:32px;height:32px;border-radius:50%;flex-shrink:0;background:linear-gradient(135deg,var(--teal),var(--navy));display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-weight:700;font-size:13px;color:#fff}
.officer-name{font-size:12px;font-weight:500;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.officer-role{font-size:10px;color:rgba(255,255,255,0.3);text-transform:capitalize}
.btn-logout{background:transparent;border:none;cursor:pointer;padding:7px;color:rgba(255,255,255,0.3);border-radius:6px;transition:all 0.15s;flex-shrink:0;display:flex;align-items:center}
.btn-logout:hover{background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.7)}

/* Layout */
.main{margin-left:var(--sidebar);min-height:100vh;display:flex;flex-direction:column}
.topbar{padding:18px 28px;border-bottom:1px solid var(--border);background:var(--white);display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10;gap:16px}
.page-title{font-family:'Syne',sans-serif;font-size:18px;font-weight:700;letter-spacing:-0.3px}
.page-subtitle{font-size:12px;color:var(--muted);margin-top:2px}
.content{padding:24px 28px;flex:1}

/* Cards */
.card{background:var(--white);border:1px solid var(--border);border-radius:8px;overflow:hidden}
.card-header{padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:12px}
.card-title{font-family:'Syne',sans-serif;font-size:12px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:var(--navy)}
.card-body{padding:18px}

/* Stats */
.stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:22px}
.stat-card{background:var(--white);border:1px solid var(--border);border-radius:8px;padding:18px 20px;position:relative;overflow:hidden}
.stat-card::after{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:var(--border)}
.stat-card.c-teal::after{background:linear-gradient(90deg,var(--teal),var(--teal2))}
.stat-card.c-navy::after{background:linear-gradient(90deg,var(--navy),#2d5a8e)}
.stat-card.c-gold::after{background:linear-gradient(90deg,var(--gold),#d4b06a)}
.stat-card.c-green::after{background:linear-gradient(90deg,var(--green),#22c55e)}
.s-label{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:10px}
.s-value{font-family:'Syne',sans-serif;font-size:28px;font-weight:700;letter-spacing:-1px;line-height:1}
.s-sub{font-size:11px;color:var(--muted);margin-top:5px}

/* Table */
.table-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:13px}
thead{background:#f8fafc}
th{text-align:left;padding:10px 14px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:var(--muted);border-bottom:1px solid var(--border);white-space:nowrap}
td{padding:12px 14px;border-bottom:1px solid var(--border);vertical-align:middle}
tr:last-child td{border-bottom:none}
tbody tr:hover td{background:#fafbfc;cursor:pointer}

/* Badges */
.badge{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:20px;font-size:11px;font-weight:500;white-space:nowrap}
.badge-pending{background:#fef3c7;color:#92400e}
.badge-paid{background:#d1fae5;color:#065f46}
.badge-proc{background:#dbeafe;color:#1e40af}
.badge-ready{background:#ede9fe;color:#5b21b6}
.badge-done{background:#dcfce7;color:#166534;border:1px solid #bbf7d0}
.badge-cancel{background:#fee2e2;color:#991b1b}

/* Buttons */
.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:6px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;cursor:pointer;border:1.5px solid transparent;transition:all 0.15s;text-decoration:none;white-space:nowrap}
.btn-primary{background:var(--navy);color:#fff;border-color:var(--navy)}
.btn-primary:hover{background:#1d3a5c}
.btn-teal{background:var(--teal);color:#fff;border-color:var(--teal)}
.btn-teal:hover{background:var(--teal2)}
.btn-outline{background:transparent;color:var(--ink);border-color:var(--border)}
.btn-outline:hover{border-color:var(--navy);color:var(--navy)}
.btn-danger{background:#fee2e2;color:var(--red);border-color:#fca5a5}
.btn-danger:hover{background:#fecaca}
.btn-ghost{background:transparent;border-color:transparent;color:var(--muted);padding:6px 10px}
.btn-ghost:hover{background:var(--paper);color:var(--ink)}
.btn-sm{padding:6px 12px;font-size:12px}
.btn-xs{padding:4px 8px;font-size:11px}

/* Forms */
.form-group{margin-bottom:16px}
.form-label{display:block;font-size:11px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);margin-bottom:6px}
.form-input,.form-select,.form-textarea{width:100%;padding:9px 12px;border:1.5px solid var(--border);background:var(--white);font-family:'DM Sans',sans-serif;font-size:13px;color:var(--ink);outline:none;transition:border-color 0.2s;border-radius:6px}
.form-input:focus,.form-select:focus,.form-textarea:focus{border-color:var(--teal);box-shadow:0 0 0 3px rgba(27,134,128,0.08)}
.form-textarea{resize:vertical;min-height:80px}
.input-wrap{position:relative}
.input-wrap .input-icon{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--muted);pointer-events:none}
.input-wrap .form-input{padding-left:34px}

/* Modal */
.modal-overlay{position:fixed;inset:0;background:rgba(13,17,23,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;opacity:0;pointer-events:none;transition:opacity 0.2s;padding:20px}
.modal-overlay.open{opacity:1;pointer-events:all}
.modal{background:var(--white);border-radius:10px;width:100%;max-width:580px;max-height:90vh;overflow-y:auto;transform:translateY(16px);transition:transform 0.22s;box-shadow:0 20px 60px rgba(0,0,0,0.18)}
.modal-overlay.open .modal{transform:translateY(0)}
.modal-lg{max-width:760px}
.modal-header{padding:18px 22px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:var(--white);z-index:1}
.modal-title{font-family:'Syne',sans-serif;font-size:15px;font-weight:700}
.modal-close{background:none;border:none;cursor:pointer;color:var(--muted);padding:4px 7px;border-radius:5px;font-size:18px;line-height:1;transition:all 0.15s}
.modal-close:hover{background:var(--paper);color:var(--ink)}
.modal-body{padding:22px}
.modal-footer{padding:14px 22px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:10px;background:#fafbfc}

/* Detail rows */
.detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:0}
.detail-row{padding:10px 0;border-bottom:1px solid var(--border);display:flex;flex-direction:column;gap:3px}
.detail-row:last-child{border-bottom:none}
.detail-label{font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);font-weight:600}
.detail-value{font-size:13px;font-weight:500;color:var(--ink)}

/* Timeline */
.timeline{padding:0;list-style:none}
.timeline-item{display:flex;gap:12px;padding-bottom:16px;position:relative}
.timeline-item:last-child{padding-bottom:0}
.timeline-item:not(:last-child)::before{content:'';position:absolute;left:14px;top:28px;bottom:0;width:1px;background:var(--border)}
.timeline-dot{width:28px;height:28px;border-radius:50%;background:var(--paper);border:2px solid var(--border);display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px}
.timeline-dot.active{background:var(--teal);border-color:var(--teal);color:#fff}
.timeline-content{flex:1;min-width:0}
.timeline-title{font-size:13px;font-weight:500}
.timeline-meta{font-size:11px;color:var(--muted);margin-top:2px}

/* Filters */
.filters{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.filter-select{padding:7px 12px;border:1.5px solid var(--border);background:var(--white);font-family:'DM Sans',sans-serif;font-size:13px;color:var(--ink);border-radius:6px;outline:none;cursor:pointer;transition:border-color .2s}
.filter-select:focus{border-color:var(--teal)}

/* Pagination */
.pagination{display:flex;align-items:center;gap:5px;padding:14px 18px;border-top:1px solid var(--border)}
.page-btn{min-width:32px;height:32px;padding:0 8px;border:1px solid var(--border);background:var(--white);border-radius:5px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:500;color:var(--muted);transition:all 0.15s}
.page-btn:hover:not(:disabled){border-color:var(--teal);color:var(--teal)}
.page-btn.current{background:var(--navy);border-color:var(--navy);color:#fff}
.page-btn:disabled{opacity:0.35;cursor:default}
.page-info{font-size:12px;color:var(--muted);margin-left:8px}

/* Toast */
.toast{position:fixed;bottom:24px;right:24px;z-index:9999;padding:12px 18px;border-radius:8px;font-size:13px;font-weight:500;box-shadow:0 8px 28px rgba(0,0,0,0.14);transform:translateY(14px);opacity:0;transition:all 0.25s;max-width:320px;display:flex;align-items:center;gap:10px}
.toast.show{transform:translateY(0);opacity:1}
.toast-ok{background:var(--navy);color:#fff}
.toast-error{background:#fee2e2;color:var(--red);border:1px solid #fca5a5}
.toast-info{background:var(--teal);color:#fff}

/* Misc */
.receipt-num{font-family:'Syne',sans-serif;font-size:12px;font-weight:600;color:var(--navy)}
.text-muted{color:var(--muted)}
.text-sm{font-size:12px}
.text-xs{font-size:11px}
.fw600{font-weight:600}
.empty-state{text-align:center;padding:56px 20px;color:var(--muted)}
.empty-state p{font-size:14px;margin-top:10px}
.spinner{width:18px;height:18px;border:2px solid rgba(0,0,0,0.08);border-top-color:var(--teal);border-radius:50%;animation:spin .7s linear infinite;display:inline-block}
.spin-center{display:flex;align-items:center;justify-content:center;padding:48px}
@keyframes spin{to{transform:rotate(360deg)}}
.divider{border:none;border-top:1px solid var(--border);margin:16px 0}
.tag{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;background:var(--paper);border:1px solid var(--border);color:var(--muted);margin:2px}
.sats-amount{font-family:'Syne',sans-serif;font-size:13px;font-weight:700;color:var(--navy)}
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--border);border-radius:10px}
`;

function injectSharedCSS() {
  const s = document.createElement("style");
  s.textContent = SHARED_CSS;
  document.head.insertBefore(s, document.head.firstChild);
}

function showToast(msg, type = "ok") {
  let t = document.getElementById("_toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "_toast";
    t.className = "toast";
    document.body.appendChild(t);
  }
  const icons = {
    ok: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20,6 9,17 4,12"/></svg>`,
    error: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  };
  t.innerHTML = `${icons[type] || ""}<span>${msg}</span>`;
  t.className = `toast toast-${type} show`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 3200);
}

function openModal(id) {
  document.getElementById(id).classList.add("open");
}
function closeModal(id) {
  document.getElementById(id).classList.remove("open");
}

function confirmDialog(msg, onYes) {
  const id = "_confirm_modal";
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("div");
    el.id = id;
    el.className = "modal-overlay";
    el.innerHTML = `<div class="modal" style="max-width:380px">
      <div class="modal-header"><div class="modal-title">Confirmation</div><button class="modal-close" onclick="closeModal('${id}')">&times;</button></div>
      <div class="modal-body"><p id="_confirm_msg" style="font-size:14px;line-height:1.6"></p></div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="closeModal('${id}')">Annuler</button>
        <button id="_confirm_yes" class="btn btn-danger">Confirmer</button>
      </div>
    </div>`;
    document.body.appendChild(el);
  }
  document.getElementById("_confirm_msg").textContent = msg;
  document.getElementById("_confirm_yes").onclick = () => {
    closeModal(id);
    onYes();
  };
  openModal(id);
}
