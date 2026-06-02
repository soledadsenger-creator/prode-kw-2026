import { useState, useEffect } from "react";
import {
  collection, doc, getDoc, getDocs, setDoc, onSnapshot, updateDoc
} from "firebase/firestore";
import { db } from "./firebase";

// ============================================================
// CONSTANTS
// ============================================================
const ADMIN_USER = "admin";
const ADMIN_PASS = "garykeller";

const POINT_VALUES = {
  resultado_exacto: 5,
  ganador_correcto: 2,
  captacion_simple: 5,
  captacion_exclusiva: 10,
  reserva_venta: 15,
  cierre_1_punta: 25,
  cierre_2_puntas: 50,
  reserva_alquiler: 8,
  firma_alquiler: 15,
  breakthrough: 10,
  capacitacion: 5,
  plan_411: 5,
  calculadora_gci: 5,
  guiones: 10,
};

const LOGROS_LABELS = {
  captacion_simple: "📋 Captación simple",
  captacion_exclusiva: "⭐ Captación exclusiva",
  reserva_venta: "🤝 Reserva venta",
  cierre_1_punta: "🏆 Cierre 1 punta",
  cierre_2_puntas: "🏆🏆 Cierre 2 puntas",
  reserva_alquiler: "🔑 Reserva alquiler",
  firma_alquiler: "📝 Firma alquiler",
  breakthrough: "🚀 Breakthrough",
  capacitacion: "📚 Capacitación en oficina",
  plan_411: "📅 Plan 411",
  calculadora_gci: "💰 Calculadora GCI",
  guiones: "🎯 Guiones",
};

const ONCE_PER_YEAR = ["breakthrough", "plan_411", "calculadora_gci", "guiones"];
const INMO_KEYS = ["captacion_simple","captacion_exclusiva","reserva_venta","cierre_1_punta","cierre_2_puntas","reserva_alquiler","firma_alquiler"];
const DEV_KEYS = ["breakthrough","capacitacion","plan_411","calculadora_gci","guiones"];

const OFFICIAL_GROUPS = {
  "Grupo A": ["México","Sudáfrica","Corea del Sur","Chequia"],
  "Grupo B": ["Canadá","Suiza","Qatar","Bosnia y Herzegovina"],
  "Grupo C": ["Brasil","Marruecos","Haití","Escocia"],
  "Grupo D": ["Estados Unidos","Paraguay","Australia","Turquía"],
  "Grupo E": ["Alemania","Curazao","Costa de Marfil","Ecuador"],
  "Grupo F": ["Países Bajos","Japón","Túnez","Suecia"],
  "Grupo G": ["Bélgica","Egipto","Irán","Nueva Zelanda"],
  "Grupo H": ["España","Cabo Verde","Arabia Saudita","Uruguay"],
  "Grupo I": ["Francia","Senegal","Noruega","Irak"],
  "Grupo J": ["Argentina","Argelia","Austria","Jordania"],
  "Grupo K": ["Portugal","Colombia","Uzbekistán","R.D. Congo"],
  "Grupo L": ["Inglaterra","Croacia","Ghana","Panamá"],
};

const FLAGS = {
  "México":"🇲🇽","Sudáfrica":"🇿🇦","Corea del Sur":"🇰🇷","Chequia":"🇨🇿",
  "Canadá":"🇨🇦","Suiza":"🇨🇭","Qatar":"🇶🇦","Bosnia y Herzegovina":"🇧🇦",
  "Brasil":"🇧🇷","Marruecos":"🇲🇦","Haití":"🇭🇹","Escocia":"🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  "Estados Unidos":"🇺🇸","Paraguay":"🇵🇾","Australia":"🇦🇺","Turquía":"🇹🇷",
  "Alemania":"🇩🇪","Curazao":"🇨🇼","Costa de Marfil":"🇨🇮","Ecuador":"🇪🇨",
  "Países Bajos":"🇳🇱","Japón":"🇯🇵","Túnez":"🇹🇳","Suecia":"🇸🇪",
  "Bélgica":"🇧🇪","Egipto":"🇪🇬","Irán":"🇮🇷","Nueva Zelanda":"🇳🇿",
  "España":"🇪🇸","Cabo Verde":"🇨🇻","Arabia Saudita":"🇸🇦","Uruguay":"🇺🇾",
  "Francia":"🇫🇷","Senegal":"🇸🇳","Noruega":"🇳🇴","Irak":"🇮🇶",
  "Argentina":"🇦🇷","Argelia":"🇩🇿","Austria":"🇦🇹","Jordania":"🇯🇴",
  "Portugal":"🇵🇹","Colombia":"🇨🇴","Uzbekistán":"🇺🇿","R.D. Congo":"🇨🇩",
  "Inglaterra":"🏴󠁧󠁢󠁥󠁮󠁧󠁿","Croacia":"🇭🇷","Ghana":"🇬🇭","Panamá":"🇵🇦",
};

function generateMatches() {
  const matches = [];
  let id = 1;
  Object.entries(OFFICIAL_GROUPS).forEach(([group, teams]) => {
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        matches.push({ id: id++, group, home: teams[i], away: teams[j], result: null });
      }
    }
  });
  return matches;
}

const BASE_MATCHES = generateMatches();

// ============================================================
// SCORING
// ============================================================
function calcScore(agent, matches) {
  let prode = 0, inmo = 0, dev = 0;
  matches.forEach(m => {
    if (!m.result) return;
    const p = agent.predictions?.[m.id];
    if (!p) return;
    const { homeGoals: rh, awayGoals: ra } = m.result;
    const ph = parseInt(p.homeGoals), pa = parseInt(p.awayGoals);
    if (!isNaN(ph) && !isNaN(pa)) {
      if (ph === rh && pa === ra) { prode += POINT_VALUES.resultado_exacto; return; }
      const rw = rh > ra ? "h" : ra > rh ? "a" : "d";
      const pw = ph > pa ? "h" : pa > ph ? "a" : "d";
      if (rw === pw) prode += POINT_VALUES.ganador_correcto;
    }
  });
  INMO_KEYS.forEach(k => { inmo += (agent.logros?.[k] || 0) * POINT_VALUES[k]; });
  DEV_KEYS.forEach(k => { dev += (agent.logros?.[k] || 0) * POINT_VALUES[k]; });
  return { prode, inmo, dev, total: prode + inmo + dev };
}

// ============================================================
// HELPERS
// ============================================================
function officeTag(office) {
  if (!office) return null;
  const cls = office.includes("Leloir") ? "tag-leloir" : office.includes("City") ? "tag-city" : "tag-on";
  return <span className={`office-tag ${cls}`}>{office}</span>;
}
function initials(name) {
  return (name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

// ============================================================
// STYLES
// ============================================================
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow:wght@400;600;700&family=Barlow+Condensed:wght@400;600;700;900&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --verde:#0d4a1e;--verde-mid:#1a6b2e;--verde-light:#2d9147;--verde-cancha:#1e7a35;
  --celeste:#74b9e0;--celeste-arg:#54acdb;
  --blanco:#f5f5f5;--rojo-kw:#c0392b;--rojo-kw-l:#e74c3c;
  --dorado:#d4a017;--dorado-l:#f0c040;--dorado-pale:#f9e8a0;
  --negro:#060c06;
}
body{font-family:'Barlow',sans-serif;background:var(--negro);color:var(--blanco);min-height:100vh}
.app-bg{min-height:100vh;background:radial-gradient(ellipse at 20% 0%,rgba(29,123,53,.22) 0%,transparent 55%),radial-gradient(ellipse at 80% 100%,rgba(192,57,43,.12) 0%,transparent 55%),linear-gradient(160deg,#040a04 0%,#090d09 50%,#0b0808 100%);background-attachment:fixed}
.header{background:linear-gradient(135deg,var(--verde) 0%,var(--negro) 65%);border-bottom:2px solid var(--dorado);position:relative;overflow:hidden}
.header::before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent,transparent 60px,rgba(255,255,255,.012) 60px,rgba(255,255,255,.012) 61px)}
.header-inner{position:relative;display:flex;align-items:center;justify-content:space-between;padding:14px 20px;max-width:1200px;margin:0 auto;gap:10px;flex-wrap:wrap}
.header-brand{display:flex;align-items:center;gap:12px}
.header-icon{font-size:2.6rem;filter:drop-shadow(0 0 12px rgba(212,160,23,.55))}
.header-titles h1{font-family:'Bebas Neue',sans-serif;font-size:1.9rem;letter-spacing:3px;color:var(--dorado-l);line-height:1;text-shadow:0 0 18px rgba(212,160,23,.35)}
.header-titles p{font-family:'Barlow Condensed',sans-serif;font-size:.8rem;letter-spacing:4px;color:var(--celeste);text-transform:uppercase;margin-top:2px}
.header-badges{display:flex;gap:6px;flex-wrap:wrap}
.badge{padding:3px 10px;border-radius:20px;font-size:.68rem;font-weight:700;letter-spacing:1px;text-transform:uppercase}
.badge-on{background:var(--rojo-kw);color:#fff}
.badge-leloir{background:var(--celeste-arg);color:var(--negro)}
.badge-city{background:var(--dorado);color:var(--negro)}
.nav{background:rgba(0,0,0,.55);border-bottom:1px solid rgba(212,160,23,.18);backdrop-filter:blur(10px);position:sticky;top:0;z-index:100}
.nav-inner{max-width:1200px;margin:0 auto;display:flex;overflow-x:auto;padding:0 10px}
.nav-btn{background:none;border:none;color:rgba(255,255,255,.45);font-family:'Barlow Condensed',sans-serif;font-size:.82rem;font-weight:600;letter-spacing:2px;text-transform:uppercase;padding:13px 18px;cursor:pointer;border-bottom:3px solid transparent;transition:all .2s;white-space:nowrap}
.nav-btn:hover{color:var(--dorado-l)}
.nav-btn.active{color:var(--dorado-l);border-bottom-color:var(--dorado)}
.nav-user{margin-left:auto;padding:13px 14px;font-size:.72rem;color:rgba(255,255,255,.35);font-family:'Barlow Condensed',sans-serif;letter-spacing:1px;white-space:nowrap}
.main{max-width:1200px;margin:0 auto;padding:22px 14px}
.card{background:linear-gradient(135deg,rgba(13,74,30,.28) 0%,rgba(8,12,8,.82) 100%);border:1px solid rgba(212,160,23,.18);border-radius:14px;padding:22px;margin-bottom:18px;backdrop-filter:blur(4px)}
.card-title{font-family:'Bebas Neue',sans-serif;font-size:1.35rem;letter-spacing:2px;color:var(--dorado-l);margin-bottom:14px;display:flex;align-items:center;gap:8px}
.table{width:100%;border-collapse:collapse}
.table th{font-family:'Barlow Condensed',sans-serif;font-size:.72rem;letter-spacing:2px;text-transform:uppercase;color:var(--dorado);padding:9px 10px;text-align:left;border-bottom:1px solid rgba(212,160,23,.25)}
.table td{padding:11px 10px;border-bottom:1px solid rgba(255,255,255,.04);font-size:.88rem}
.table tr:hover td{background:rgba(255,255,255,.025)}
.rank-num{font-family:'Bebas Neue',sans-serif;font-size:1.35rem;width:44px;text-align:center}
.pos-1{color:#FFD700}.pos-2{color:#C0C0C0}.pos-3{color:#CD7F32}
.agent-name{font-weight:700;font-size:.95rem}
.pts-total{font-family:'Bebas Neue',sans-serif;font-size:1.45rem;color:var(--dorado-l)}
.office-tag{display:inline-block;padding:2px 7px;border-radius:4px;font-size:.63rem;font-weight:700;letter-spacing:1px;text-transform:uppercase}
.tag-on{background:rgba(192,57,43,.3);color:#ff9988;border:1px solid rgba(192,57,43,.4)}
.tag-leloir{background:rgba(84,172,219,.2);color:var(--celeste);border:1px solid rgba(84,172,219,.3)}
.tag-city{background:rgba(212,160,23,.18);color:var(--dorado-l);border:1px solid rgba(212,160,23,.3)}
.podium{display:flex;justify-content:center;align-items:flex-end;gap:10px;margin-bottom:28px;padding:20px 0}
.podium-item{display:flex;flex-direction:column;align-items:center;gap:6px}
.podium-av{border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'Bebas Neue',sans-serif;font-weight:900}
.p1 .podium-av{width:66px;height:66px;font-size:1.6rem;background:linear-gradient(135deg,#FFD700,#FFA500);color:#000}
.p2 .podium-av{width:54px;height:54px;font-size:1.3rem;background:linear-gradient(135deg,#C0C0C0,#909090);color:#000}
.p3 .podium-av{width:50px;height:50px;font-size:1.2rem;background:linear-gradient(135deg,#CD7F32,#8B4513);color:#fff}
.podium-name{font-family:'Barlow Condensed',sans-serif;font-size:.78rem;font-weight:700;text-align:center;max-width:85px;line-height:1.2}
.podium-pts{font-family:'Bebas Neue',sans-serif;font-size:1.15rem;color:var(--dorado-l)}
.podium-block{width:76px;background:linear-gradient(180deg,rgba(212,160,23,.28),rgba(212,160,23,.04));border:1px solid rgba(212,160,23,.28);border-radius:7px 7px 0 0;display:flex;align-items:center;justify-content:center}
.p1 .podium-block{height:76px}.p2 .podium-block{height:56px}.p3 .podium-block{height:42px}
.medal{font-size:1.4rem}
.input{background:rgba(255,255,255,.05);border:1px solid rgba(212,160,23,.28);border-radius:8px;color:#fff;font-family:'Barlow',sans-serif;font-size:.88rem;padding:9px 12px;width:100%;transition:border-color .2s}
.input:focus{outline:none;border-color:var(--dorado)}
.input::placeholder{color:rgba(255,255,255,.28)}
select.input option{background:#1a1a1a}
.score-in{width:50px;background:rgba(255,255,255,.07);border:1px solid rgba(212,160,23,.28);border-radius:7px;color:#fff;font-family:'Bebas Neue',sans-serif;font-size:1.35rem;padding:5px;text-align:center}
.score-in:focus{outline:none;border-color:var(--dorado)}
.btn{font-family:'Barlow Condensed',sans-serif;font-weight:700;letter-spacing:2px;text-transform:uppercase;border:none;border-radius:8px;cursor:pointer;transition:all .2s;padding:11px 22px;font-size:.82rem}
.btn-primary{background:linear-gradient(135deg,var(--verde-mid),var(--verde-cancha));color:#fff;border:1px solid var(--verde-light)}
.btn-primary:hover{filter:brightness(1.2);transform:translateY(-1px)}
.btn-gold{background:linear-gradient(135deg,var(--dorado),var(--dorado-l));color:var(--negro)}
.btn-gold:hover{filter:brightness(1.1);transform:translateY(-1px)}
.btn-red{background:linear-gradient(135deg,var(--rojo-kw),var(--rojo-kw-l));color:#fff}
.btn-outline{background:transparent;border:1px solid rgba(212,160,23,.35);color:var(--dorado-l)}
.btn-outline:hover{border-color:var(--dorado);background:rgba(212,160,23,.08)}
.btn-sm{padding:6px 13px;font-size:.72rem}
.fg{margin-bottom:14px}
.fl{font-family:'Barlow Condensed',sans-serif;font-size:.72rem;letter-spacing:2px;text-transform:uppercase;color:var(--dorado);display:block;margin-bottom:5px}
.login-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:22px;background:radial-gradient(ellipse at 30% 20%,rgba(29,123,53,.28) 0%,transparent 55%),radial-gradient(ellipse at 70% 80%,rgba(74,168,216,.13) 0%,transparent 48%),linear-gradient(160deg,#040a04 0%,#090d09 100%)}
.login-card{background:linear-gradient(135deg,rgba(13,74,30,.38),rgba(8,12,8,.92));border:1px solid rgba(212,160,23,.28);border-radius:22px;padding:44px 36px;width:100%;max-width:400px;text-align:center;backdrop-filter:blur(10px)}
.login-trophy{font-size:3.6rem;margin-bottom:6px;filter:drop-shadow(0 0 18px rgba(212,160,23,.48))}
.login-title{font-family:'Bebas Neue',sans-serif;font-size:2rem;letter-spacing:4px;color:var(--dorado-l);margin-bottom:3px}
.login-sub{font-family:'Barlow Condensed',sans-serif;font-size:.8rem;letter-spacing:3px;color:var(--celeste);text-transform:uppercase;margin-bottom:28px}
.login-err{background:rgba(192,57,43,.18);border:1px solid var(--rojo-kw);border-radius:8px;padding:9px;color:#ff9988;font-size:.83rem;margin-bottom:14px}
.tabs{display:flex;margin-bottom:18px;border-bottom:1px solid rgba(212,160,23,.18)}
.tab-btn{background:none;border:none;border-bottom:2px solid transparent;color:rgba(255,255,255,.38);font-family:'Barlow Condensed',sans-serif;font-size:.78rem;letter-spacing:2px;text-transform:uppercase;padding:9px 16px;cursor:pointer;margin-bottom:-1px}
.tab-btn.active{color:var(--dorado-l);border-bottom-color:var(--dorado)}
.match-card{background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.06);border-radius:11px;padding:14px;margin-bottom:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.match-teams{flex:1;display:flex;align-items:center;gap:8px;min-width:180px}
.team-nm{font-family:'Barlow Condensed',sans-serif;font-size:.92rem;font-weight:700;letter-spacing:1px}
.vs{font-family:'Bebas Neue',sans-serif;font-size:.85rem;color:rgba(255,255,255,.28);padding:0 6px}
.score-disp{font-family:'Bebas Neue',sans-serif;font-size:1.7rem;color:var(--dorado-l);min-width:72px;text-align:center}
.score-pair{display:flex;align-items:center;gap:5px}
.group-lbl{font-family:'Barlow Condensed',sans-serif;font-size:.65rem;letter-spacing:2px;color:var(--celeste);text-transform:uppercase;width:72px}
.stat-box{background:rgba(255,255,255,.035);border:1px solid rgba(212,160,23,.12);border-radius:11px;padding:18px;text-align:center}
.stat-val{font-family:'Bebas Neue',sans-serif;font-size:2.2rem;color:var(--dorado-l);line-height:1}
.stat-lbl{font-family:'Barlow Condensed',sans-serif;font-size:.72rem;letter-spacing:2px;color:rgba(255,255,255,.38);text-transform:uppercase;margin-top:3px}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.logros-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px;margin-top:10px}
.logro-item{background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.07);border-radius:9px;padding:13px;display:flex;align-items:center;justify-content:space-between;gap:7px}
.logro-name{font-size:.8rem;font-weight:600;flex:1}
.logro-pts{font-family:'Bebas Neue',sans-serif;font-size:1rem;color:var(--dorado)}
.counter{display:flex;align-items:center;gap:5px}
.cbtn{width:26px;height:26px;border-radius:50%;border:1px solid rgba(212,160,23,.38);background:transparent;color:var(--dorado-l);font-size:.95rem;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s}
.cbtn:hover{background:rgba(212,160,23,.18)}
.cval{font-family:'Bebas Neue',sans-serif;font-size:1.25rem;min-width:22px;text-align:center}
.alert{border-radius:9px;padding:11px 14px;font-size:.83rem;margin-bottom:14px}
.alert-ok{background:rgba(45,145,71,.18);border:1px solid var(--verde-light);color:#7dff9e}
.alert-warn{background:rgba(212,160,23,.12);border:1px solid var(--dorado);color:var(--dorado-pale)}
.my-score{background:linear-gradient(135deg,rgba(13,74,30,.55),rgba(192,57,43,.18));border:1px solid rgba(212,160,23,.35);border-radius:14px;padding:18px 22px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;margin-bottom:22px}
.ms-lbl{font-family:'Barlow Condensed',sans-serif;font-size:.72rem;letter-spacing:3px;color:var(--celeste);text-transform:uppercase}
.ms-total{font-family:'Bebas Neue',sans-serif;font-size:2.8rem;color:var(--dorado-l);line-height:1}
.divider{height:1px;background:linear-gradient(90deg,transparent,rgba(212,160,23,.28),transparent);margin:18px 0}
.search-in{background:rgba(255,255,255,.04);border:1px solid rgba(212,160,23,.18);border-radius:8px;color:#fff;font-family:'Barlow',sans-serif;padding:9px 12px;width:100%;max-width:280px;margin-bottom:14px}
.search-in:focus{outline:none;border-color:var(--dorado)}
.empty-state{text-align:center;padding:44px 22px;color:rgba(255,255,255,.28)}
.empty-icon{font-size:2.8rem;margin-bottom:10px}
.empty-txt{font-family:'Barlow Condensed',sans-serif;font-size:.95rem;letter-spacing:2px}
.admin-card{border-color:rgba(192,57,43,.35)!important;background:linear-gradient(135deg,rgba(192,57,43,.08),rgba(8,12,8,.9))!important}
.section-lbl{font-family:'Barlow Condensed',sans-serif;font-size:.72rem;letter-spacing:2px;color:var(--dorado);text-transform:uppercase;margin-bottom:7px}
.office-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:10px}
.mini-stat{font-family:'Bebas Neue',sans-serif;font-size:1.6rem;color:var(--dorado-l)}
.mini-lbl{font-family:'Barlow Condensed',sans-serif;font-size:.65rem;letter-spacing:1px;color:rgba(255,255,255,.35);text-transform:uppercase}
.loading{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#060c06;color:var(--dorado-l);font-family:'Bebas Neue',sans-serif;font-size:1.5rem;letter-spacing:3px}
.spinner{width:48px;height:48px;border:3px solid rgba(212,160,23,.2);border-top-color:var(--dorado);border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:600px){
  .grid3{grid-template-columns:1fr}
  .podium{gap:6px}
  .match-teams{min-width:150px}
  .header-titles h1{font-size:1.5rem}
}
`;

// ============================================================
// FIREBASE HELPERS
// ============================================================
async function initMatchesInDB() {
  const ref = doc(db, "config", "matches");
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const matchesObj = {};
    BASE_MATCHES.forEach(m => { matchesObj[m.id] = { ...m }; });
    await setDoc(ref, { matches: matchesObj });
  }
}

async function saveAgentToDB(agentData) {
  const emailKey = agentData.email.replace(/\./g, "_").replace(/@/g, "_at_");
  await setDoc(doc(db, "agents", emailKey), agentData, { merge: true });
}

async function updateAgentField(email, field, value) {
  const emailKey = email.replace(/\./g, "_").replace(/@/g, "_at_");
  await updateDoc(doc(db, "agents", emailKey), { [field]: value });
}

async function updateMatchResult(matchId, result) {
  const ref = doc(db, "config", "matches");
  await updateDoc(ref, { [`matches.${matchId}.result`]: result });
}

// ============================================================
// COMPONENTS
// ============================================================

function LoadingScreen() {
  return (
    <div className="loading">
      <div className="spinner"></div>
      <div>CARGANDO PRODE...</div>
    </div>
  );
}

// ---------- LOGIN ----------
function LoginScreen({ onLogin, loading }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [name, setName] = useState("");
  const [office, setOffice] = useState("KW ON");
  const [error, setError] = useState("");
  const [mode, setMode] = useState("login");

  function submit() {
    setError("");
    if (email.trim() === ADMIN_USER && pass === ADMIN_PASS) {
      onLogin({ email: ADMIN_USER, name: "Admin", isAdmin: true });
      return;
    }
    if (mode === "login") {
      if (!email.includes("@")) { setError("Ingresá tu mail de KW"); return; }
      onLogin({ email: email.trim().toLowerCase(), name: email.split("@")[0], isAdmin: false });
    } else {
      if (!name.trim()) { setError("Ingresá tu nombre completo"); return; }
      if (!email.includes("@")) { setError("Ingresá tu mail de KW"); return; }
      onLogin({ email: email.trim().toLowerCase(), name: name.trim(), office, isAdmin: false, isNew: true });
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-trophy">🏆</div>
        <div className="login-title">PRODE MUNDIAL 2026</div>
        <div className="login-sub">KW ON · KW Leloir · KW City</div>
        <div className="tabs" style={{ justifyContent: "center", marginBottom: 22 }}>
          <button className={`tab-btn ${mode === "login" ? "active" : ""}`} onClick={() => setMode("login")}>Ingresar</button>
          <button className={`tab-btn ${mode === "register" ? "active" : ""}`} onClick={() => setMode("register")}>Registrarme</button>
        </div>
        {error && <div className="login-err">{error}</div>}
        {mode === "register" && (
          <div className="fg">
            <label className="fl">Nombre completo</label>
            <input className="input" placeholder="Ej: Lucas Martínez" value={name} onChange={e => setName(e.target.value)} />
          </div>
        )}
        <div className="fg">
          <label className="fl">{mode === "login" ? "Mail o usuario" : "Mail KW"}</label>
          <input className="input" placeholder={mode === "login" ? "tu@kw.com o admin" : "tu@kw.com.ar"} value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} />
        </div>
        {mode === "login" && (
          <div className="fg">
            <label className="fl">Contraseña (solo admin)</label>
            <input className="input" type="password" placeholder="Solo si sos admin" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} />
          </div>
        )}
        {mode === "register" && (
          <div className="fg">
            <label className="fl">Oficina</label>
            <select className="input" value={office} onChange={e => setOffice(e.target.value)}>
              <option>KW ON</option>
              <option>KW Leloir</option>
              <option>KW City</option>
            </select>
          </div>
        )}
        <button className="btn btn-gold" style={{ width: "100%", marginTop: 6 }} onClick={submit} disabled={loading}>
          {loading ? "Cargando..." : mode === "login" ? "⚽ Entrar al Prode" : "Registrarme"}
        </button>
      </div>
    </div>
  );
}

// ---------- RANKING ----------
function RankingView({ agents, matches }) {
  const [search, setSearch] = useState("");
  const scored = agents.map(a => ({ ...a, score: calcScore(a, matches) })).sort((a, b) => b.score.total - a.score.total);
  const filtered = scored.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    (a.office || "").toLowerCase().includes(search.toLowerCase())
  );
  const top3 = scored.slice(0, 3);

  return (
    <div>
      {top3.length >= 3 && (
        <div className="podium">
          {[{ a: top3[1], p: 2 }, { a: top3[0], p: 1 }, { a: top3[2], p: 3 }].map(({ a, p }) => (
            <div key={a.email} className={`podium-item p${p}`}>
              <div className="podium-av">{initials(a.name)}</div>
              <div className="podium-name">{a.name.split(" ")[0]}</div>
              {officeTag(a.office)}
              <div className="podium-pts">{a.score.total} pts</div>
              <div className="podium-block"><span className="medal">{p === 1 ? "🥇" : p === 2 ? "🥈" : "🥉"}</span></div>
            </div>
          ))}
        </div>
      )}
      <input className="search-in" placeholder="🔍 Buscar agente u oficina..." value={search} onChange={e => setSearch(e.target.value)} />
      {filtered.length === 0 ? (
        <div className="empty-state"><div className="empty-icon">⚽</div><div className="empty-txt">Sin agentes registrados aún</div></div>
      ) : (
        <table className="table">
          <thead>
            <tr><th>#</th><th>Agente</th><th>Oficina</th><th>⚽ Prode</th><th>🏡 Inmob.</th><th>📚 Dev.</th><th>Total</th></tr>
          </thead>
          <tbody>
            {filtered.map(a => {
              const pos = scored.findIndex(s => s.email === a.email) + 1;
              return (
                <tr key={a.email}>
                  <td><div className={`rank-num ${pos <= 3 ? `pos-${pos}` : ""}`}>{pos}</div></td>
                  <td><div className="agent-name">{a.name}</div></td>
                  <td>{officeTag(a.office)}</td>
                  <td><span style={{ color: "#74b9e0", fontWeight: 700 }}>{a.score.prode}</span></td>
                  <td><span style={{ color: "#7dff9e", fontWeight: 700 }}>{a.score.inmo}</span></td>
                  <td><span style={{ color: "#ffb347", fontWeight: 700 }}>{a.score.dev}</span></td>
                  <td><div className="pts-total">{a.score.total}</div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------- OFICINAS ----------
function OfficinaView({ agents, matches }) {
  const offices = ["KW ON", "KW Leloir", "KW City"];
  const colors = { "KW ON": "#c0392b", "KW Leloir": "#54acdb", "KW City": "#d4a017" };
  const icons = { "KW ON": "🔴", "KW Leloir": "🔵", "KW City": "🟡" };

  return (
    <div>
      <div className="card">
        <div className="card-title">🏢 Ranking por oficina</div>
        {offices.map(off => {
          const group = agents.filter(a => a.office === off);
          const scores = group.map(a => calcScore(a, matches));
          const totalPts = scores.reduce((s, c) => s + c.total, 0);
          const avgPts = group.length ? Math.round(totalPts / group.length) : 0;
          const topIdx = scores.indexOf(Math.max(...scores.map(s => s.total)));
          const topAgent = group[topIdx];
          const totalInmo = scores.reduce((s, c) => s + c.inmo, 0);
          const totalCierres = group.reduce((s, a) => s + (a.logros?.cierre_1_punta || 0) + (a.logros?.cierre_2_puntas || 0), 0);

          return (
            <div key={off} style={{ background: "rgba(255,255,255,.03)", border: `1px solid ${colors[off]}44`, borderRadius: 12, padding: 18, marginBottom: 14 }}>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "1.3rem", letterSpacing: 2, color: colors[off], marginBottom: 12 }}>
                {icons[off]} {off} <span style={{ fontSize: ".75rem", color: "rgba(255,255,255,.4)", fontFamily: "Barlow Condensed", letterSpacing: 1 }}>— {group.length} agentes</span>
              </div>
              <div className="office-grid">
                <div className="stat-box"><div className="mini-stat" style={{ color: colors[off] }}>{totalPts}</div><div className="mini-lbl">Pts totales</div></div>
                <div className="stat-box"><div className="mini-stat" style={{ color: colors[off] }}>{avgPts}</div><div className="mini-lbl">Promedio</div></div>
                <div className="stat-box"><div className="mini-stat" style={{ color: colors[off] }}>{totalCierres}</div><div className="mini-lbl">Cierres</div></div>
              </div>
              {topAgent && (
                <div style={{ marginTop: 12, fontSize: ".83rem", color: "rgba(255,255,255,.45)" }}>
                  🏆 Líder: <strong style={{ color: colors[off] }}>{topAgent.name}</strong>
                  <span style={{ marginLeft: 8, color: "rgba(255,255,255,.3)" }}>{scores[topIdx]?.total || 0} pts</span>
                </div>
              )}
              {totalInmo > 0 && (
                <div style={{ marginTop: 6, fontSize: ".78rem", color: "rgba(255,255,255,.3)" }}>
                  🏡 {totalInmo} pts inmobiliarios acumulados
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- PRODE ----------
function ProdeView({ agent, matches, onSave }) {
  const [preds, setPreds] = useState({ ...(agent.predictions || {}) });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const groups = [...new Set(matches.map(m => m.group))];

  function setPred(id, field, val) {
    setPreds(p => ({ ...p, [id]: { ...(p[id] || {}), [field]: val } }));
  }

  async function save() {
    setSaving(true);
    await onSave(preds);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div>
      {saved && <div className="alert alert-ok">✅ ¡Predicciones guardadas en la nube!</div>}
      <div className="alert alert-warn">⚽ <strong>5 pts</strong> resultado exacto · <strong>2 pts</strong> ganador correcto · Fixture oficial FIFA 2026</div>
      {groups.map(g => (
        <div key={g} className="card">
          <div className="card-title">⚽ {g}</div>
          {matches.filter(m => m.group === g).map(m => (
            <div key={m.id} className="match-card">
              <div className="group-lbl">{g.replace("Grupo ", "GRP ")}</div>
              <div className="match-teams">
                <span>{FLAGS[m.home] || "🏳"}</span>
                <span className="team-nm">{m.home}</span>
                <span className="vs">vs</span>
                <span className="team-nm">{m.away}</span>
                <span>{FLAGS[m.away] || "🏳"}</span>
              </div>
              {m.result ? (
                <div className="score-disp">{m.result.homeGoals} - {m.result.awayGoals}
                  <div style={{ fontSize: ".58rem", color: "rgba(255,255,255,.28)", fontFamily: "Barlow Condensed" }}>FINAL</div>
                </div>
              ) : (
                <div className="score-pair">
                  <input className="score-in" type="number" min="0" max="20"
                    value={preds[m.id]?.homeGoals ?? ""}
                    onChange={e => setPred(m.id, "homeGoals", e.target.value)} placeholder="0" />
                  <span style={{ color: "rgba(255,255,255,.35)", fontFamily: "Bebas Neue" }}>-</span>
                  <input className="score-in" type="number" min="0" max="20"
                    value={preds[m.id]?.awayGoals ?? ""}
                    onChange={e => setPred(m.id, "awayGoals", e.target.value)} placeholder="0" />
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
      <button className="btn btn-gold" style={{ width: "100%" }} onClick={save} disabled={saving}>
        {saving ? "Guardando..." : "💾 Guardar mis predicciones"}
      </button>
    </div>
  );
}

// ---------- MIS STATS ----------
function MyStatsView({ agent, matches }) {
  const score = calcScore(agent, matches);
  const logroItems = Object.entries(agent.logros || {}).filter(([, v]) => v > 0);
  return (
    <div>
      <div className="my-score">
        <div>
          <div className="ms-lbl">Tu puntaje total</div>
          <div className="ms-total">{score.total} pts</div>
        </div>
        <div className="grid3">
          <div className="stat-box"><div className="stat-val" style={{ color: "#74b9e0" }}>{score.prode}</div><div className="stat-lbl">⚽ Prode</div></div>
          <div className="stat-box"><div className="stat-val" style={{ color: "#7dff9e" }}>{score.inmo}</div><div className="stat-lbl">🏡 Inmob.</div></div>
          <div className="stat-box"><div className="stat-val" style={{ color: "#ffb347" }}>{score.dev}</div><div className="stat-lbl">📚 Dev.</div></div>
        </div>
      </div>
      {logroItems.length > 0 ? (
        <div className="card">
          <div className="card-title">🏅 Tus logros cargados</div>
          <div className="logros-grid">
            {logroItems.map(([key, count]) => (
              <div key={key} className="logro-item">
                <div className="logro-name">{LOGROS_LABELS[key]}</div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "Bebas Neue", fontSize: "1rem" }}>×{count}</div>
                  <div className="logro-pts">{count * POINT_VALUES[key]} pts</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-icon">🏡</div>
          <div className="empty-txt">El admin cargará tus logros acá</div>
        </div>
      )}
    </div>
  );
}

// ---------- ADMIN ----------
function AdminView({ agents, matches, onSaveResult, onSaveLogros }) {
  const [tab, setTab] = useState("resultados");
  const [selAgent, setSelAgent] = useState("");
  const [logros, setLogros] = useState({});
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const agent = agents.find(a => a.email === selAgent);
  useEffect(() => { setLogros(agent ? { ...(agent.logros || {}) } : {}); }, [selAgent]);

  function flash(m) { setMsg(m); setTimeout(() => setMsg(""), 2500); }

  async function saveResult(matchId, h, a) {
    await onSaveResult(matchId, { homeGoals: parseInt(h), awayGoals: parseInt(a) });
    flash("Resultado guardado ✅");
  }

  async function saveLogros() {
    if (!agent) return;
    setSaving(true);
    await onSaveLogros(agent.email, logros);
    setSaving(false);
    flash(`Logros de ${agent.name.split(" ")[0]} guardados ✅`);
  }

  function changeLogro(key, delta) {
    const cur = logros[key] || 0;
    const once = ONCE_PER_YEAR.includes(key);
    setLogros(l => ({ ...l, [key]: Math.max(0, once ? Math.min(1, cur + delta) : cur + delta) }));
  }

  return (
    <div>
      <div className="card admin-card">
        <div className="card-title" style={{ color: "#ff9988" }}>🔐 Panel de Administración</div>
        <div style={{ fontSize: ".83rem", color: "rgba(255,255,255,.45)" }}>
          Agentes: <strong style={{ color: "#fff" }}>{agents.length}</strong> &nbsp;·&nbsp;
          Partidos con resultado: <strong style={{ color: "#fff" }}>{matches.filter(m => m.result).length}</strong> / {matches.length}
        </div>
      </div>
      {msg && <div className="alert alert-ok">{msg}</div>}
      <div className="tabs">
        <button className={`tab-btn ${tab === "resultados" ? "active" : ""}`} onClick={() => setTab("resultados")}>⚽ Resultados</button>
        <button className={`tab-btn ${tab === "logros" ? "active" : ""}`} onClick={() => setTab("logros")}>🏡 Logros</button>
        <button className={`tab-btn ${tab === "agentes" ? "active" : ""}`} onClick={() => setTab("agentes")}>👥 Agentes</button>
        <button className={`tab-btn ${tab === "oficinas" ? "active" : ""}`} onClick={() => setTab("oficinas")}>🏢 Oficinas</button>
      </div>

      {tab === "resultados" && (
        <div>
          {[...new Set(matches.map(m => m.group))].map(g => (
            <div key={g} className="card">
              <div className="card-title">⚽ {g}</div>
              {matches.filter(m => m.group === g).map(m => (
                <ResultRow key={m.id} match={m} onSave={saveResult} />
              ))}
            </div>
          ))}
        </div>
      )}

      {tab === "logros" && (
        <div className="card">
          <div className="card-title">🏡 Cargar logros por agente</div>
          <div className="fg">
            <label className="fl">Seleccioná agente</label>
            <select className="input" value={selAgent} onChange={e => setSelAgent(e.target.value)}>
              <option value="">-- Elegir agente --</option>
              {[...agents].sort((a, b) => a.name.localeCompare(b.name)).map(a => (
                <option key={a.email} value={a.email}>{a.name} — {a.office || "sin oficina"}</option>
              ))}
            </select>
          </div>
          {agent && (
            <>
              <div className="divider" />
              <div className="section-lbl">Operaciones inmobiliarias</div>
              <div className="logros-grid">
                {INMO_KEYS.map(key => (
                  <div key={key} className="logro-item">
                    <div><div className="logro-name">{LOGROS_LABELS[key]}</div><div className="logro-pts">{POINT_VALUES[key]} pts c/u</div></div>
                    <div className="counter">
                      <button className="cbtn" onClick={() => changeLogro(key, -1)}>−</button>
                      <div className="cval">{logros[key] || 0}</div>
                      <button className="cbtn" onClick={() => changeLogro(key, 1)}>+</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="divider" />
              <div className="section-lbl">Desarrollo profesional KW</div>
              <div className="logros-grid">
                {DEV_KEYS.map(key => (
                  <div key={key} className="logro-item">
                    <div><div className="logro-name">{LOGROS_LABELS[key]}</div><div className="logro-pts">{POINT_VALUES[key]} pts{ONCE_PER_YEAR.includes(key) ? " · 1×/año" : " c/u"}</div></div>
                    <div className="counter">
                      <button className="cbtn" onClick={() => changeLogro(key, -1)}>−</button>
                      <div className="cval">{logros[key] || 0}</div>
                      <button className="cbtn" onClick={() => changeLogro(key, 1)}>+</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="divider" />
              <button className="btn btn-gold" onClick={saveLogros} disabled={saving}>
                {saving ? "Guardando..." : `💾 Guardar logros de ${agent.name.split(" ")[0]}`}
              </button>
            </>
          )}
        </div>
      )}

      {tab === "agentes" && (
        <div className="card">
          <div className="card-title">👥 Agentes ({agents.length})</div>
          <table className="table">
            <thead><tr><th>Nombre</th><th>Mail</th><th>Oficina</th><th>Predicciones</th><th>Puntos</th></tr></thead>
            <tbody>
              {[...agents].sort((a, b) => a.name.localeCompare(b.name)).map(a => {
                const s = calcScore(a, matches);
                return (
                  <tr key={a.email}>
                    <td className="agent-name">{a.name}</td>
                    <td style={{ fontSize: ".78rem", color: "rgba(255,255,255,.4)" }}>{a.email}</td>
                    <td>{officeTag(a.office)}</td>
                    <td style={{ color: "rgba(255,255,255,.45)", fontSize: ".83rem" }}>{Object.keys(a.predictions || {}).length} partidos</td>
                    <td><span className="pts-total">{s.total}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === "oficinas" && <OfficinaView agents={agents} matches={matches} />}
    </div>
  );
}

function ResultRow({ match, onSave }) {
  const [h, setH] = useState(match.result?.homeGoals ?? "");
  const [a, setA] = useState(match.result?.awayGoals ?? "");
  return (
    <div className="match-card">
      <div className="match-teams" style={{ flex: 1 }}>
        <span>{FLAGS[match.home] || "🏳"}</span>
        <span className="team-nm">{match.home}</span>
        <span className="vs">vs</span>
        <span className="team-nm">{match.away}</span>
        <span>{FLAGS[match.away] || "🏳"}</span>
      </div>
      <div className="score-pair">
        <input className="score-in" type="number" min="0" value={h} onChange={e => setH(e.target.value)} placeholder="0" />
        <span style={{ color: "rgba(255,255,255,.35)", fontFamily: "Bebas Neue" }}>-</span>
        <input className="score-in" type="number" min="0" value={a} onChange={e => setA(e.target.value)} placeholder="0" />
      </div>
      <button className="btn btn-primary btn-sm" onClick={() => onSave(match.id, h, a)}>
        {match.result ? "✏️ Editar" : "💾 Guardar"}
      </button>
    </div>
  );
}

// ============================================================
// APP
// ============================================================
export default function App() {
  const [session, setSession] = useState(null);
  const [agents, setAgents] = useState([]);
  const [matches, setMatches] = useState(BASE_MATCHES);
  const [appLoading, setAppLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [tab, setTab] = useState("ranking");

  // Init matches in DB + listen to agents and matches
  useEffect(() => {
    initMatchesInDB().then(() => {
      // Listen to matches
      const unsubMatches = onSnapshot(doc(db, "config", "matches"), snap => {
        if (snap.exists()) {
          const data = snap.data().matches;
          const arr = Object.values(data).sort((a, b) => a.id - b.id);
          setMatches(arr);
        }
      });
      // Listen to agents
      const unsubAgents = onSnapshot(collection(db, "agents"), snap => {
        const arr = snap.docs.map(d => d.data());
        setAgents(arr);
        setAppLoading(false);
      });
      return () => { unsubMatches(); unsubAgents(); };
    });
  }, []);

  async function handleLogin(user) {
    setLoginLoading(true);
    if (!user.isAdmin) {
      const emailKey = user.email.replace(/\./g, "_").replace(/@/g, "_at_");
      const snap = await getDoc(doc(db, "agents", emailKey));
      if (!snap.exists()) {
        await saveAgentToDB({ email: user.email, name: user.name, office: user.office || "KW ON", predictions: {}, logros: {} });
      } else {
        const data = snap.data();
        user.name = data.name;
        user.office = data.office;
      }
    }
    setLoginLoading(false);
    setSession(user);
    setTab(user.isAdmin ? "admin" : "ranking");
  }

  async function handleSavePred(preds) {
    await updateAgentField(session.email, "predictions", preds);
  }

  async function handleSaveResult(matchId, result) {
    await updateMatchResult(matchId, result);
  }

  async function handleSaveLogros(email, logros) {
    await updateAgentField(email, "logros", logros);
  }

  const currentAgent = session && !session.isAdmin ? agents.find(a => a.email === session.email) : null;

  if (appLoading) return (<><style>{CSS}</style><LoadingScreen /></>);
  if (!session) return (<><style>{CSS}</style><LoginScreen onLogin={handleLogin} loading={loginLoading} /></>);

  const navItems = session.isAdmin
    ? [{ id: "ranking", label: "🏆 Ranking" }, { id: "oficinas", label: "🏢 Oficinas" }, { id: "admin", label: "🔐 Admin" }]
    : [{ id: "ranking", label: "🏆 Ranking" }, { id: "oficinas", label: "🏢 Oficinas" }, { id: "prode", label: "⚽ Mis predicciones" }, { id: "mystats", label: "📊 Mis puntos" }];

  return (
    <>
      <style>{CSS}</style>
      <div className="app-bg">
        <header className="header">
          <div className="header-inner">
            <div className="header-brand">
              <div className="header-icon">🏆</div>
              <div className="header-titles">
                <h1>PRODE MUNDIAL 2026</h1>
                <p>Keller Williams Argentina · ⚽ + 🏡</p>
              </div>
            </div>
            <div className="header-badges">
              <span className="badge badge-on">KW ON</span>
              <span className="badge badge-leloir">KW Leloir</span>
              <span className="badge badge-city">KW City</span>
              <button className="btn btn-outline btn-sm" onClick={() => setSession(null)}>Salir</button>
            </div>
          </div>
        </header>
        <nav className="nav">
          <div className="nav-inner">
            {navItems.map(item => (
              <button key={item.id} className={`nav-btn ${tab === item.id ? "active" : ""}`} onClick={() => setTab(item.id)}>{item.label}</button>
            ))}
            <div className="nav-user">{session.isAdmin ? "👑 Admin" : `👤 ${session.name?.split(" ")[0]}`}</div>
          </div>
        </nav>
        <main className="main">
          {tab === "ranking" && <div className="card"><div className="card-title">🏆 Ranking general — todos contra todos</div><RankingView agents={agents} matches={matches} /></div>}
          {tab === "oficinas" && <OfficinaView agents={agents} matches={matches} />}
          {tab === "prode" && currentAgent && <ProdeView agent={currentAgent} matches={matches} onSave={handleSavePred} />}
          {tab === "mystats" && currentAgent && <MyStatsView agent={currentAgent} matches={matches} />}
          {tab === "admin" && session.isAdmin && <AdminView agents={agents} matches={matches} onSaveResult={handleSaveResult} onSaveLogros={handleSaveLogros} />}
        </main>
      </div>
    </>
  );
}
