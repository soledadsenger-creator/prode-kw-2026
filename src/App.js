import { useState, useEffect } from "react";
import { doc, getDoc, collection, setDoc, onSnapshot, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "./firebase";

// ============================================================
// CONSTANTS
// ============================================================
const ADMIN_USER = "admin";
const ADMIN_PASS = "garykeller";

const POINT_VALUES = {
  resultado_exacto: 5, ganador_correcto: 2,
  captacion_simple: 5, captacion_exclusiva: 10,
  reserva_venta: 15, cierre_1_punta: 25, cierre_2_puntas: 50,
  reserva_alquiler: 8, firma_alquiler: 15,
  breakthrough: 10, capacitacion: 5, plan_411: 5, calculadora_gci: 5, guiones: 10,
};

const LOGROS_LABELS = {
  captacion_simple: "📋 Captación simple", captacion_exclusiva: "⭐ Captación exclusiva",
  reserva_venta: "🤝 Reserva venta", cierre_1_punta: "🏆 Cierre 1 punta",
  cierre_2_puntas: "🏆🏆 Cierre 2 puntas", reserva_alquiler: "🔑 Reserva alquiler",
  firma_alquiler: "📝 Firma alquiler", breakthrough: "🚀 Breakthrough",
  capacitacion: "📚 Capacitación en oficina", plan_411: "📅 Plan 411",
  calculadora_gci: "💰 Calculadora GCI", guiones: "🎯 Guiones",
};

const ONCE_PER_YEAR = ["breakthrough", "plan_411", "calculadora_gci", "guiones"];
const INMO_KEYS = ["captacion_simple","captacion_exclusiva","reserva_venta","cierre_1_punta","cierre_2_puntas","reserva_alquiler","firma_alquiler"];
const DEV_KEYS = ["breakthrough","capacitacion","plan_411","calculadora_gci","guiones"];

// ============================================================
// FIXTURE COMPLETO — 104 PARTIDOS ORDENADOS CRONOLÓGICAMENTE
// ============================================================
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

// ============================================================
// FECHAS DE CIERRE DE PRONÓSTICOS POR FASE
// Cierre a las 00:00 hs (Argentina, UTC-3) del día indicado
// ============================================================
const PHASE_DEADLINES = {
  "Fase de Grupos":          new Date("2026-06-11T03:00:00Z"), // 00:00 ARG = 03:00 UTC
  "Dieciseisavos de Final":  new Date("2026-06-28T03:00:00Z"),
  "Octavos de Final":        new Date("2026-07-04T03:00:00Z"),
  "Cuartos de Final":        new Date("2026-07-09T03:00:00Z"),
  "Semifinal":               new Date("2026-07-14T03:00:00Z"),
  "3er y 4to Puesto":        new Date("2026-07-18T03:00:00Z"),
  "Final 🏆":                new Date("2026-07-18T03:00:00Z"),
};

function isPhaseOpen(phase, overrides = {}) {
  if (overrides[phase] === true) return true;  // admin override activo
  const deadline = PHASE_DEADLINES[phase];
  if (!deadline) return true;
  return new Date() < deadline;
}

function phaseDeadlineLabel(phase) {
  const deadline = PHASE_DEADLINES[phase];
  if (!deadline) return "";
  const now = new Date();
  if (now >= deadline) return "🔒 CERRADO";
  const days = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
  if (days <= 1) return "⚠️ Cierra hoy";
  return `⏰ Cierra en ${days} días`;
}

function generateMatches() {
  const m = [];
  // FASE DE GRUPOS — ordenados por fecha
  const grupos = [
    // Jueves 11 Jun
    { id:1, group:"Grupo A", home:"México", away:"Sudáfrica", date:"Jue 11/06", time:"16:00" },
    { id:2, group:"Grupo A", home:"Corea del Sur", away:"Chequia", date:"Jue 11/06", time:"23:00" },
    // Viernes 12 Jun
    { id:3, group:"Grupo B", home:"Canadá", away:"Bosnia y Herzegovina", date:"Vie 12/06", time:"16:00" },
    { id:4, group:"Grupo D", home:"Estados Unidos", away:"Paraguay", date:"Vie 12/06", time:"22:00" },
    // Sábado 13 Jun
    { id:5, group:"Grupo B", home:"Qatar", away:"Suiza", date:"Sáb 13/06", time:"16:00" },
    { id:6, group:"Grupo C", home:"Brasil", away:"Marruecos", date:"Sáb 13/06", time:"19:00" },
    { id:7, group:"Grupo C", home:"Haití", away:"Escocia", date:"Sáb 13/06", time:"22:00" },
    { id:8, group:"Grupo D", home:"Australia", away:"Turquía", date:"Sáb 13/06", time:"01:00" },
    // Domingo 14 Jun
    { id:9, group:"Grupo E", home:"Alemania", away:"Costa de Marfil", date:"Dom 14/06", time:"14:00" },
    { id:10, group:"Grupo E", home:"Ecuador", away:"Curazao", date:"Dom 14/06", time:"20:00" },
    { id:11, group:"Grupo F", home:"Países Bajos", away:"Japón", date:"Dom 14/06", time:"17:00" },
    { id:12, group:"Grupo F", home:"Túnez", away:"Suecia", date:"Dom 14/06", time:"23:00" },
    // Lunes 15 Jun
    { id:13, group:"Grupo G", home:"Bélgica", away:"Irán", date:"Lun 15/06", time:"13:00" },
    { id:14, group:"Grupo G", home:"Egipto", away:"Nueva Zelanda", date:"Lun 15/06", time:"19:00" },
    { id:15, group:"Grupo H", home:"España", away:"Cabo Verde", date:"Lun 15/06", time:"16:00" },
    { id:16, group:"Grupo H", home:"Arabia Saudita", away:"Uruguay", date:"Lun 15/06", time:"22:00" },
    // Martes 16 Jun
    { id:17, group:"Grupo I", home:"Francia", away:"Senegal", date:"Mar 16/06", time:"16:00" },
    { id:18, group:"Grupo I", home:"Noruega", away:"Irak", date:"Mar 16/06", time:"19:00" },
    { id:19, group:"Grupo J", home:"Argentina", away:"Argelia", date:"Mar 16/06", time:"22:00" },
    { id:20, group:"Grupo J", home:"Austria", away:"Jordania", date:"Mar 16/06", time:"01:00" },
    // Miércoles 17 Jun
    { id:21, group:"Grupo K", home:"Portugal", away:"Colombia", date:"Mié 17/06", time:"14:00" },
    { id:22, group:"Grupo K", home:"Uzbekistán", away:"R.D. Congo", date:"Mié 17/06", time:"23:00" },
    { id:23, group:"Grupo L", home:"Inglaterra", away:"Croacia", date:"Mié 17/06", time:"17:00" },
    { id:24, group:"Grupo L", home:"Ghana", away:"Panamá", date:"Mié 17/06", time:"20:00" },
    // Jueves 18 Jun
    { id:25, group:"Grupo A", home:"Chequia", away:"Sudáfrica", date:"Jue 18/06", time:"13:00" },
    { id:26, group:"Grupo A", home:"México", away:"Corea del Sur", date:"Jue 18/06", time:"22:00" },
    { id:27, group:"Grupo B", home:"Suiza", away:"Bosnia y Herzegovina", date:"Jue 18/06", time:"16:00" },
    { id:28, group:"Grupo B", home:"Canadá", away:"Qatar", date:"Jue 18/06", time:"19:00" },
    // Viernes 19 Jun
    { id:29, group:"Grupo C", home:"Escocia", away:"Marruecos", date:"Vie 19/06", time:"19:00" },
    { id:30, group:"Grupo C", home:"Brasil", away:"Haití", date:"Vie 19/06", time:"22:00" },
    { id:31, group:"Grupo D", home:"Estados Unidos", away:"Australia", date:"Vie 19/06", time:"01:00" },
    { id:32, group:"Grupo D", home:"Paraguay", away:"Turquía", date:"Vie 19/06", time:"16:00" },
    // Sábado 20 Jun
    { id:33, group:"Grupo E", home:"Alemania", away:"Ecuador", date:"Sáb 20/06", time:"17:00" },
    { id:34, group:"Grupo E", home:"Costa de Marfil", away:"Curazao", date:"Sáb 20/06", time:"21:00" },
    { id:35, group:"Grupo F", home:"Japón", away:"Túnez", date:"Sáb 20/06", time:"14:00" },
    { id:36, group:"Grupo F", home:"Países Bajos", away:"Suecia", date:"Sáb 20/06", time:"01:00" },
    // Domingo 21 Jun
    { id:37, group:"Grupo G", home:"Irán", away:"Nueva Zelanda", date:"Dom 21/06", time:"13:00" },
    { id:38, group:"Grupo G", home:"Bélgica", away:"Egipto", date:"Dom 21/06", time:"19:00" },
    { id:39, group:"Grupo H", home:"Uruguay", away:"Cabo Verde", date:"Dom 21/06", time:"16:00" },
    { id:40, group:"Grupo H", home:"España", away:"Arabia Saudita", date:"Dom 21/06", time:"22:00" },
    // Lunes 22 Jun
    { id:41, group:"Grupo I", home:"Senegal", away:"Noruega", date:"Lun 22/06", time:"18:00" },
    { id:42, group:"Grupo I", home:"Francia", away:"Irak", date:"Lun 22/06", time:"21:00" },
    { id:43, group:"Grupo J", home:"Argelia", away:"Austria", date:"Lun 22/06", time:"14:00" },
    { id:44, group:"Grupo J", home:"Argentina", away:"Jordania", date:"Lun 22/06", time:"22:00" },  // corregido
    // Martes 23 Jun
    { id:45, group:"Grupo K", home:"Colombia", away:"Uzbekistán", date:"Mar 23/06", time:"14:00" },
    { id:46, group:"Grupo K", home:"Portugal", away:"R.D. Congo", date:"Mar 23/06", time:"23:00" },
    { id:47, group:"Grupo L", home:"Croacia", away:"Ghana", date:"Mar 23/06", time:"17:00" },
    { id:48, group:"Grupo L", home:"Inglaterra", away:"Panamá", date:"Mar 23/06", time:"20:00" },
    // Miércoles 24 Jun
    { id:49, group:"Grupo A", home:"Chequia", away:"México", date:"Mié 24/06", time:"22:00" },
    { id:50, group:"Grupo A", home:"Sudáfrica", away:"Corea del Sur", date:"Mié 24/06", time:"22:00" },
    { id:51, group:"Grupo B", home:"Suiza", away:"Canadá", date:"Mié 24/06", time:"16:00" },
    { id:52, group:"Grupo B", home:"Bosnia y Herzegovina", away:"Qatar", date:"Mié 24/06", time:"16:00" },
    { id:53, group:"Grupo C", home:"Escocia", away:"Brasil", date:"Mié 24/06", time:"19:00" },
    { id:54, group:"Grupo C", home:"Marruecos", away:"Haití", date:"Mié 24/06", time:"19:00" },
    // Jueves 25 Jun
    { id:55, group:"Grupo E", home:"Alemania", away:"Curazao", date:"Jue 25/06", time:"23:00" },
    { id:56, group:"Grupo E", home:"Costa de Marfil", away:"Ecuador", date:"Jue 25/06", time:"23:00" },
    { id:57, group:"Grupo F", home:"Japón", away:"Suecia", date:"Jue 25/06", time:"17:00" },
    { id:58, group:"Grupo F", home:"Países Bajos", away:"Túnez", date:"Jue 25/06", time:"20:00" },
    // Viernes 26 Jun
    { id:59, group:"Grupo G", home:"Bélgica", away:"Nueva Zelanda", date:"Vie 26/06", time:"16:00" },
    { id:60, group:"Grupo G", home:"Irán", away:"Egipto", date:"Vie 26/06", time:"16:00" },
    { id:61, group:"Grupo H", home:"España", away:"Uruguay", date:"Vie 26/06", time:"21:00" },
    { id:62, group:"Grupo H", home:"Arabia Saudita", away:"Cabo Verde", date:"Vie 26/06", time:"21:00" },
    // Sábado 27 Jun
    { id:63, group:"Grupo D", home:"Estados Unidos", away:"Turquía", date:"Sáb 27/06", time:"23:00" },
    { id:64, group:"Grupo D", home:"Paraguay", away:"Australia", date:"Sáb 27/06", time:"23:00" },
    { id:65, group:"Grupo I", home:"Francia", away:"Noruega", date:"Sáb 27/06", time:"00:00" },
    { id:66, group:"Grupo I", home:"Senegal", away:"Irak", date:"Sáb 27/06", time:"00:00" },
    { id:67, group:"Grupo J", home:"Argentina", away:"Austria", date:"Sáb 27/06", time:"18:00" },
    { id:68, group:"Grupo J", home:"Argelia", away:"Jordania", date:"Sáb 27/06", time:"18:00" },
    { id:69, group:"Grupo K", home:"Portugal", away:"Uzbekistán", date:"Sáb 27/06", time:"20:30" },
    { id:70, group:"Grupo K", home:"Colombia", away:"R.D. Congo", date:"Sáb 27/06", time:"20:30" },
    { id:71, group:"Grupo L", home:"Inglaterra", away:"Ghana", date:"Sáb 27/06", time:"18:00" },
    { id:72, group:"Grupo L", home:"Croacia", away:"Panamá", date:"Sáb 27/06", time:"18:00" },
  ];
  grupos.forEach(p => m.push({ ...p, phase: "Fase de Grupos", result: null }));

  // DIECISEISAVOS — partidos 73 a 88
  const d16 = [
    { id:73, label:"P73", matchNum:"P73", date:"Dom 28/06", time:"16:00" },
    { id:74, label:"P74", matchNum:"P74", date:"Lun 29/06", time:"17:30" },
    { id:75, label:"P75", matchNum:"P75", date:"Lun 29/06", time:"22:00" },
    { id:76, label:"P76", matchNum:"P76", date:"Lun 29/06", time:"14:00" },
    { id:77, label:"P77", matchNum:"P77", date:"Mar 30/06", time:"18:00" },
    { id:78, label:"P78", matchNum:"P78", date:"Mar 30/06", time:"14:00" },
    { id:79, label:"P79", matchNum:"P79", date:"Mar 30/06", time:"22:00" },
    { id:80, label:"P80", matchNum:"P80", date:"Mié 01/07", time:"13:00" },
    { id:81, label:"P81", matchNum:"P81", date:"Mié 01/07", time:"21:00" },
    { id:82, label:"P82", matchNum:"P82", date:"Mié 01/07", time:"17:00" },
    { id:83, label:"P83", matchNum:"P83", date:"Jue 02/07", time:"20:00" },
    { id:84, label:"P84", matchNum:"P84", date:"Jue 02/07", time:"16:00" },
    { id:85, label:"P85", matchNum:"P85", date:"Vie 03/07", time:"00:00" },
    { id:86, label:"P86", matchNum:"P86", date:"Vie 03/07", time:"19:00" },
    { id:87, label:"P87", matchNum:"P87", date:"Vie 03/07", time:"22:30" },
    { id:88, label:"P88", matchNum:"P88", date:"Vie 03/07", time:"15:00" },
  ];
  d16.forEach(p => m.push({ ...p, group:"Dieciseisavos", phase:"Dieciseisavos de Final", home: p.home || "Por definir", away: p.away || "Por definir", result: null }));

  // OCTAVOS — partidos 89 a 96
  const oct = [
    { id:89, date:"Sáb 04/07", time:"14:00" },
    { id:90, date:"Sáb 04/07", time:"18:00" },
    { id:91, date:"Dom 05/07", time:"17:00" },
    { id:92, date:"Dom 05/07", time:"21:00" },
    { id:93, date:"Lun 06/07", time:"16:00" },
    { id:94, date:"Lun 06/07", time:"21:00" },
    { id:95, date:"Mar 07/07", time:"13:00" },
    { id:96, date:"Mar 07/07", time:"17:00" },
  ];
  oct.forEach(p => m.push({ ...p, group:"Octavos", phase:"Octavos de Final", home:"Por definir", away:"Por definir", result: null }));

  // CUARTOS — partidos 97 a 100
  const cua = [
    { id:97, date:"Jue 09/07", time:"17:00" },
    { id:98, date:"Vie 10/07", time:"16:00" },
    { id:99, date:"Sáb 11/07", time:"18:00" },
    { id:100, date:"Sáb 11/07", time:"22:00" },
  ];
  cua.forEach(p => m.push({ ...p, group:"Cuartos", phase:"Cuartos de Final", home:"Por definir", away:"Por definir", result: null }));

  // SEMIFINALES — 101 y 102
  m.push({ id:101, group:"Semifinales", phase:"Semifinal", home:"Por definir", away:"Por definir", date:"Mar 14/07", time:"16:00", result: null });
  m.push({ id:102, group:"Semifinales", phase:"Semifinal", home:"Por definir", away:"Por definir", date:"Mié 15/07", time:"16:00", result: null });

  // 3ER PUESTO — 103
  m.push({ id:103, group:"3er Puesto", phase:"3er y 4to Puesto", home:"Por definir", away:"Por definir", date:"Sáb 18/07", time:"18:00", result: null });

  // FINAL — 104
  m.push({ id:104, group:"Final", phase:"Final 🏆", home:"Por definir", away:"Por definir", date:"Dom 19/07", time:"16:00", result: null });

  return m;
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
// FIREBASE HELPERS
// ============================================================
async function initMatchesInDB() {
  const ref = doc(db, "config", "matches");
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const obj = {};
    BASE_MATCHES.forEach(m => { obj[m.id] = { ...m }; });
    await setDoc(ref, { matches: obj });
  }
}

async function saveAgentToDB(agentData) {
  const key = agentData.email.replace(/\./g, "_").replace(/@/g, "_at_");
  await setDoc(doc(db, "agents", key), agentData, { merge: true });
}

async function updateAgentField(email, field, value) {
  const key = email.replace(/\./g, "_").replace(/@/g, "_at_");
  await updateDoc(doc(db, "agents", key), { [field]: value });
}

async function deleteAgentFromDB(email) {
  const key = email.replace(/\./g, "_").replace(/@/g, "_at_");
  await deleteDoc(doc(db, "agents", key));
}

async function updateMatchInDB(matchId, data) {
  await updateDoc(doc(db, "config", "matches"), { [`matches.${matchId}`]: data });
}

async function saveOverrideToDB(overrides) {
  await setDoc(doc(db, "config", "overrides"), overrides, { merge: true });
}

async function getOverridesFromDB() {
  try {
    const snap = await getDoc(doc(db, "config", "overrides"));
    return snap.exists() ? snap.data() : {};
  } catch { return {}; }
}

// ============================================================
// HELPERS UI
// ============================================================
function officeTag(office) {
  if (!office) return null;
  const cls = office.includes("Leloir") ? "tag-leloir" : office.includes("City") ? "tag-city" : "tag-on";
  return <span className={`office-tag ${cls}`}>{office}</span>;
}
function initials(name) {
  return (name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}
function teamDisplay(name) {
  const flag = FLAGS[name] || "";
  return `${flag} ${name}`;
}

// ============================================================
// STYLES
// ============================================================
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow:wght@400;600;700&family=Barlow+Condensed:wght@400;600;700;900&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --verde:#0d4a1e;--verde-mid:#1a6b2e;--verde-light:#2d9147;--verde-cancha:#1e7a35;
  --celeste:#74b9e0;--celeste-arg:#54acdb;--blanco:#f5f5f5;
  --rojo-kw:#c0392b;--rojo-kw-l:#e74c3c;
  --dorado:#d4a017;--dorado-l:#f0c040;--dorado-pale:#f9e8a0;--negro:#060c06;
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
.nav-btn:hover{color:var(--dorado-l)}.nav-btn.active{color:var(--dorado-l);border-bottom-color:var(--dorado)}
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
.btn-red:hover{filter:brightness(1.1)}
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
.match-meta{font-family:'Barlow Condensed',sans-serif;font-size:.65rem;letter-spacing:1px;color:var(--celeste);text-transform:uppercase;min-width:90px}
.phase-header{font-family:'Bebas Neue',sans-serif;font-size:1.1rem;letter-spacing:3px;color:var(--dorado);margin:22px 0 10px;padding-bottom:6px;border-bottom:1px solid rgba(212,160,23,.2)}
.pending-badge{background:rgba(255,255,255,.06);border:1px dashed rgba(255,255,255,.2);border-radius:8px;padding:6px 12px;font-size:.75rem;color:rgba(255,255,255,.4);font-family:'Barlow Condensed',sans-serif;letter-spacing:1px}
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
.alert-err{background:rgba(192,57,43,.18);border:1px solid var(--rojo-kw);color:#ff9988}
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
.confirm-box{background:rgba(192,57,43,.15);border:1px solid var(--rojo-kw);border-radius:10px;padding:14px;margin-top:10px}
@media(max-width:600px){
  .grid3{grid-template-columns:1fr}
  .podium{gap:6px}
  .match-teams{min-width:140px}
  .header-titles h1{font-size:1.5rem}
}
`;

// ============================================================
// COMPONENTS
// ============================================================

function LoadingScreen() {
  return <div className="loading"><div className="spinner"></div><div>CARGANDO PRODE...</div></div>;
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
    if (email.trim() === ADMIN_USER && pass === ADMIN_PASS) { onLogin({ email: ADMIN_USER, name: "Admin", isAdmin: true }); return; }
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
        {mode === "register" && <div className="fg"><label className="fl">Nombre completo</label><input className="input" placeholder="Ej: Lucas Martínez" value={name} onChange={e => setName(e.target.value)} /></div>}
        <div className="fg">
          <label className="fl">{mode === "login" ? "Mail o usuario" : "Mail KW"}</label>
          <input className="input" placeholder={mode === "login" ? "tu@kw.com o admin" : "tu@kw.com.ar"} value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} />
        </div>
        {mode === "login" && <div className="fg"><label className="fl">Contraseña (solo admin)</label><input className="input" type="password" placeholder="Solo si sos admin" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} /></div>}
        {mode === "register" && <div className="fg"><label className="fl">Oficina</label><select className="input" value={office} onChange={e => setOffice(e.target.value)}><option>KW ON</option><option>KW Leloir</option><option>KW City</option></select></div>}
        <button className="btn btn-gold" style={{ width: "100%", marginTop: 6 }} onClick={submit} disabled={loading}>{loading ? "Cargando..." : mode === "login" ? "⚽ Entrar al Prode" : "Registrarme"}</button>
      </div>
    </div>
  );
}

// ---------- RANKING ----------
function RankingView({ agents, matches }) {
  const [search, setSearch] = useState("");
  const scored = agents.map(a => ({ ...a, score: calcScore(a, matches) })).sort((a, b) => b.score.total - a.score.total);
  const filtered = scored.filter(a => a.name.toLowerCase().includes(search.toLowerCase()) || (a.office || "").toLowerCase().includes(search.toLowerCase()));
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
              <div className="podium-block"><span className="medal">{p===1?"🥇":p===2?"🥈":"🥉"}</span></div>
            </div>
          ))}
        </div>
      )}
      <input className="search-in" placeholder="🔍 Buscar agente u oficina..." value={search} onChange={e => setSearch(e.target.value)} />
      {filtered.length === 0 ? <div className="empty-state"><div className="empty-icon">⚽</div><div className="empty-txt">Sin agentes registrados aún</div></div> : (
        <table className="table">
          <thead><tr><th>#</th><th>Agente</th><th>Oficina</th><th>⚽ Prode</th><th>🏡 Inmob.</th><th>📚 Dev.</th><th>Total</th></tr></thead>
          <tbody>
            {filtered.map(a => {
              const pos = scored.findIndex(s => s.email === a.email) + 1;
              return (
                <tr key={a.email}>
                  <td><div className={`rank-num ${pos<=3?`pos-${pos}`:""}`}>{pos}</div></td>
                  <td><div className="agent-name">{a.name}</div></td>
                  <td>{officeTag(a.office)}</td>
                  <td><span style={{color:"#74b9e0",fontWeight:700}}>{a.score.prode}</span></td>
                  <td><span style={{color:"#7dff9e",fontWeight:700}}>{a.score.inmo}</span></td>
                  <td><span style={{color:"#ffb347",fontWeight:700}}>{a.score.dev}</span></td>
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
  const offices = ["KW ON","KW Leloir","KW City"];
  const colors = { "KW ON":"#c0392b","KW Leloir":"#54acdb","KW City":"#d4a017" };
  const icons = { "KW ON":"🔴","KW Leloir":"🔵","KW City":"🟡" };
  return (
    <div>
      <div className="card">
        <div className="card-title">🏢 Ranking por oficina</div>
        {offices.map(off => {
          const group = agents.filter(a => a.office === off);
          const scores = group.map(a => calcScore(a, matches));
          const totalPts = scores.reduce((s,c) => s+c.total, 0);
          const avgPts = group.length ? Math.round(totalPts/group.length) : 0;
          const maxScore = Math.max(...scores.map(s=>s.total), 0);
          const topIdx = scores.findIndex(s=>s.total===maxScore);
          const topAgent = group[topIdx];
          const totalCierres = group.reduce((s,a) => s+(a.logros?.cierre_1_punta||0)+(a.logros?.cierre_2_puntas||0), 0);
          return (
            <div key={off} style={{background:"rgba(255,255,255,.03)",border:`1px solid ${colors[off]}44`,borderRadius:12,padding:18,marginBottom:14}}>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"1.3rem",letterSpacing:2,color:colors[off],marginBottom:12}}>
                {icons[off]} {off} <span style={{fontSize:".75rem",color:"rgba(255,255,255,.4)",fontFamily:"Barlow Condensed",letterSpacing:1}}>— {group.length} agentes</span>
              </div>
              <div className="office-grid">
                <div className="stat-box"><div className="mini-stat" style={{color:colors[off]}}>{totalPts}</div><div className="mini-lbl">Pts totales</div></div>
                <div className="stat-box"><div className="mini-stat" style={{color:colors[off]}}>{avgPts}</div><div className="mini-lbl">Promedio</div></div>
                <div className="stat-box"><div className="mini-stat" style={{color:colors[off]}}>{totalCierres}</div><div className="mini-lbl">Cierres</div></div>
              </div>
              {topAgent && <div style={{marginTop:12,fontSize:".83rem",color:"rgba(255,255,255,.45)"}}>🏆 Líder: <strong style={{color:colors[off]}}>{topAgent.name}</strong><span style={{marginLeft:8,color:"rgba(255,255,255,.3)"}}>{maxScore} pts</span></div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- PRODE ----------
function ProdeView({ agent, matches, overrides, onSave }) {
  const [preds, setPreds] = useState({...(agent.predictions||{})});
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const phases = ["Fase de Grupos","Dieciseisavos de Final","Octavos de Final","Cuartos de Final","Semifinal","3er y 4to Puesto","Final 🏆"];

  function setPred(id, field, val) { setPreds(p => ({...p,[id]:{...(p[id]||{}),[field]:val}})); }
  async function save() { setSaving(true); await onSave(preds); setSaving(false); setSaved(true); setTimeout(()=>setSaved(false),2500); }

  return (
    <div>
      {saved && <div className="alert alert-ok">✅ ¡Predicciones guardadas en la nube!</div>}
      <div className="alert alert-warn">⚽ <strong>5 pts</strong> resultado exacto · <strong>2 pts</strong> ganador correcto · 104 partidos · Fixture oficial FIFA 2026</div>
      {phases.map(phase => {
        const phaseMatches = matches.filter(m => m.phase === phase);
        if (phaseMatches.length === 0) return null;
        const open = isPhaseOpen(phase, overrides);
        const deadlineLabel = phaseDeadlineLabel(phase);
        return (
          <div key={phase}>
            <div className="phase-header" style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
              <span>{phase === "Fase de Grupos" ? "⚽" : phase.includes("Final 🏆") ? "🏆" : phase.includes("Semi") ? "🔥" : phase.includes("3er") ? "🥉" : "⚡"} {phase}</span>
              <span style={{fontSize:".75rem",fontFamily:"Barlow Condensed",letterSpacing:1,color:open?(deadlineLabel.includes("hoy")?"#ffb347":"rgba(255,255,255,.4)"):"#ff6b6b",fontWeight:700}}>{deadlineLabel}</span>
            </div>
            {!open && <div style={{background:"rgba(192,57,43,.12)",border:"1px solid rgba(192,57,43,.3)",borderRadius:8,padding:"8px 14px",marginBottom:10,fontSize:".8rem",color:"#ff9988",fontFamily:"Barlow Condensed",letterSpacing:1}}>🔒 Esta fase está cerrada. No se pueden cargar ni modificar pronósticos.</div>}
            {phaseMatches.map(m => {
              const isPending = m.home === "Por definir" || m.away === "Por definir";
              const myPred = preds[m.id];
              return (
                <div key={m.id} className="match-card">
                  <div className="match-meta">{m.date}<br/>{m.time} hs</div>
                  <div className="match-teams">
                    <span>{FLAGS[m.home]||"🏳"}</span>
                    <span className="team-nm">{m.home}</span>
                    <span className="vs">vs</span>
                    <span className="team-nm">{m.away}</span>
                    <span>{FLAGS[m.away]||"🏳"}</span>
                  </div>
                  {m.result ? (
                    <div className="score-disp">{m.result.homeGoals} - {m.result.awayGoals}<div style={{fontSize:".58rem",color:"rgba(255,255,255,.28)",fontFamily:"Barlow Condensed"}}>FINAL</div></div>
                  ) : isPending ? (
                    <div className="pending-badge">A definir</div>
                  ) : !open ? (
                    <div className="score-disp" style={{fontSize:"1.2rem",opacity:.5}}>
                      {myPred?.homeGoals??"-"} - {myPred?.awayGoals??"-"}
                      <div style={{fontSize:".58rem",color:"rgba(255,255,255,.28)",fontFamily:"Barlow Condensed"}}>TU PRODE</div>
                    </div>
                  ) : (
                    <div className="score-pair">
                      <input className="score-in" type="number" min="0" max="20" value={preds[m.id]?.homeGoals??""} onChange={e=>setPred(m.id,"homeGoals",e.target.value)} placeholder="0"/>
                      <span style={{color:"rgba(255,255,255,.35)",fontFamily:"Bebas Neue"}}>-</span>
                      <input className="score-in" type="number" min="0" max="20" value={preds[m.id]?.awayGoals??""} onChange={e=>setPred(m.id,"awayGoals",e.target.value)} placeholder="0"/>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
      <button className="btn btn-gold" style={{width:"100%",marginTop:16}} onClick={save} disabled={saving}>{saving?"Guardando...":"💾 Guardar mis predicciones"}</button>
    </div>
  );
}

// ---------- MIS STATS ----------
function MyStatsView({ agent, matches }) {
  const score = calcScore(agent, matches);
  const logroItems = Object.entries(agent.logros||{}).filter(([,v])=>v>0);
  return (
    <div>
      <div className="my-score">
        <div><div className="ms-lbl">Tu puntaje total</div><div className="ms-total">{score.total} pts</div></div>
        <div className="grid3">
          <div className="stat-box"><div className="stat-val" style={{color:"#74b9e0"}}>{score.prode}</div><div className="stat-lbl">⚽ Prode</div></div>
          <div className="stat-box"><div className="stat-val" style={{color:"#7dff9e"}}>{score.inmo}</div><div className="stat-lbl">🏡 Inmob.</div></div>
          <div className="stat-box"><div className="stat-val" style={{color:"#ffb347"}}>{score.dev}</div><div className="stat-lbl">📚 Dev.</div></div>
        </div>
      </div>
      {logroItems.length > 0 ? (
        <div className="card">
          <div className="card-title">🏅 Tus logros cargados</div>
          <div className="logros-grid">
            {logroItems.map(([key,count])=>(
              <div key={key} className="logro-item">
                <div className="logro-name">{LOGROS_LABELS[key]}</div>
                <div style={{textAlign:"right"}}><div style={{fontFamily:"Bebas Neue",fontSize:"1rem"}}>×{count}</div><div className="logro-pts">{count*POINT_VALUES[key]} pts</div></div>
              </div>
            ))}
          </div>
        </div>
      ) : <div className="empty-state"><div className="empty-icon">🏡</div><div className="empty-txt">El admin cargará tus logros acá</div></div>}
    </div>
  );
}

// ---------- ADMIN ----------
function AdminView({ agents, matches, overrides, onSaveResult, onSaveLogros, onDeleteAgent, onSaveOverride }) {
  const [tab, setTab] = useState("resultados");
  const [selAgent, setSelAgent] = useState("");
  const [logros, setLogros] = useState({});
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState("ok");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const agent = agents.find(a=>a.email===selAgent);
  useEffect(()=>{setLogros(agent?{...(agent.logros||{})}:{});},[selAgent]);

  function flash(m, type="ok") { setMsg(m); setMsgType(type); setTimeout(()=>setMsg(""),2500); }

  async function saveResult(matchId, matchData) {
    await onSaveResult(matchId, matchData);
    flash("Guardado ✅");
  }
  async function saveLogros() {
    if(!agent) return; setSaving(true);
    await onSaveLogros(agent.email, logros);
    setSaving(false); flash(`Logros de ${agent.name.split(" ")[0]} guardados ✅`);
  }
  async function handleDelete(email) {
    await onDeleteAgent(email);
    setConfirmDelete(null);
    if(selAgent===email) setSelAgent("");
    flash("Agente eliminado ✅");
  }
  function changeLogro(key,delta) {
    const cur=logros[key]||0; const once=ONCE_PER_YEAR.includes(key);
    setLogros(l=>({...l,[key]:Math.max(0,once?Math.min(1,cur+delta):cur+delta)}));
  }

  const phases = ["Fase de Grupos","Dieciseisavos de Final","Octavos de Final","Cuartos de Final","Semifinal","3er y 4to Puesto","Final 🏆"];

  return (
    <div>
      <div className="card admin-card">
        <div className="card-title" style={{color:"#ff9988"}}>🔐 Panel de Administración</div>
        <div style={{fontSize:".83rem",color:"rgba(255,255,255,.45)"}}>
          Agentes: <strong style={{color:"#fff"}}>{agents.length}</strong> &nbsp;·&nbsp;
          Partidos con resultado: <strong style={{color:"#fff"}}>{matches.filter(m=>m.result).length}</strong> / {matches.length}
        </div>
      </div>
      {msg && <div className={`alert alert-${msgType}`}>{msg}</div>}
      <div className="tabs">
        <button className={`tab-btn ${tab==="resultados"?"active":""}`} onClick={()=>setTab("resultados")}>⚽ Resultados</button>
        <button className={`tab-btn ${tab==="logros"?"active":""}`} onClick={()=>setTab("logros")}>🏡 Logros</button>
        <button className={`tab-btn ${tab==="agentes"?"active":""}`} onClick={()=>setTab("agentes")}>👥 Agentes</button>
        <button className={`tab-btn ${tab==="oficinas"?"active":""}`} onClick={()=>setTab("oficinas")}>🏢 Oficinas</button>
        <button className={`tab-btn ${tab==="override"?"active":""}`} onClick={()=>setTab("override")} style={{color: Object.values(overrides).some(v=>v) ? "#ff9988" : ""}}>🔓 Habilitar fase</button>
      </div>

      {tab==="resultados" && (
        <div>
          {phases.map(phase => {
            const pm = matches.filter(m=>m.phase===phase);
            if(pm.length===0) return null;
            return (
              <div key={phase} className="card">
                <div className="card-title">{phase.includes("🏆")?"🏆":phase.includes("Semi")?"🔥":phase.includes("3er")?"🥉":phase.includes("Octavo")?"⚡":phase.includes("Cuarto")?"💥":phase.includes("Diecis")?"🎯":"⚽"} {phase}</div>
                {pm.map(m=><ResultRow key={m.id} match={m} onSave={saveResult}/>)}
              </div>
            );
          })}
        </div>
      )}

      {tab==="logros" && (
        <div className="card">
          <div className="card-title">🏡 Cargar logros por agente</div>
          <div className="fg">
            <label className="fl">Seleccioná agente</label>
            <select className="input" value={selAgent} onChange={e=>setSelAgent(e.target.value)}>
              <option value="">-- Elegir agente --</option>
              {[...agents].sort((a,b)=>a.name.localeCompare(b.name)).map(a=>(
                <option key={a.email} value={a.email}>{a.name} — {a.office||"sin oficina"}</option>
              ))}
            </select>
          </div>
          {agent && (
            <>
              <div className="divider"/>
              <div className="section-lbl">Operaciones inmobiliarias</div>
              <div className="logros-grid">
                {INMO_KEYS.map(key=>(
                  <div key={key} className="logro-item">
                    <div><div className="logro-name">{LOGROS_LABELS[key]}</div><div className="logro-pts">{POINT_VALUES[key]} pts c/u</div></div>
                    <div className="counter">
                      <button className="cbtn" onClick={()=>changeLogro(key,-1)}>−</button>
                      <div className="cval">{logros[key]||0}</div>
                      <button className="cbtn" onClick={()=>changeLogro(key,1)}>+</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="divider"/>
              <div className="section-lbl">Desarrollo profesional KW</div>
              <div className="logros-grid">
                {DEV_KEYS.map(key=>(
                  <div key={key} className="logro-item">
                    <div><div className="logro-name">{LOGROS_LABELS[key]}</div><div className="logro-pts">{POINT_VALUES[key]} pts{ONCE_PER_YEAR.includes(key)?" · 1×/año":" c/u"}</div></div>
                    <div className="counter">
                      <button className="cbtn" onClick={()=>changeLogro(key,-1)}>−</button>
                      <div className="cval">{logros[key]||0}</div>
                      <button className="cbtn" onClick={()=>changeLogro(key,1)}>+</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="divider"/>
              <button className="btn btn-gold" onClick={saveLogros} disabled={saving}>{saving?"Guardando...":`💾 Guardar logros de ${agent.name.split(" ")[0]}`}</button>
            </>
          )}
        </div>
      )}

      {tab==="agentes" && (
        <div className="card">
          <div className="card-title">👥 Agentes ({agents.length})</div>
          <table className="table">
            <thead><tr><th>Nombre</th><th>Mail</th><th>Oficina</th><th>Predicciones</th><th>Puntos</th><th>Acción</th></tr></thead>
            <tbody>
              {[...agents].sort((a,b)=>a.name.localeCompare(b.name)).map(a=>{
                const s=calcScore(a,matches);
                return (
                  <tr key={a.email}>
                    <td className="agent-name">{a.name}</td>
                    <td style={{fontSize:".78rem",color:"rgba(255,255,255,.4)"}}>{a.email}</td>
                    <td>{officeTag(a.office)}</td>
                    <td style={{color:"rgba(255,255,255,.45)",fontSize:".83rem"}}>{Object.keys(a.predictions||{}).length} partidos</td>
                    <td><span className="pts-total">{s.total}</span></td>
                    <td>
                      {confirmDelete===a.email ? (
                        <div style={{display:"flex",gap:6}}>
                          <button className="btn btn-red btn-sm" onClick={()=>handleDelete(a.email)}>Confirmar</button>
                          <button className="btn btn-outline btn-sm" onClick={()=>setConfirmDelete(null)}>Cancelar</button>
                        </div>
                      ) : (
                        <button className="btn btn-red btn-sm" onClick={()=>setConfirmDelete(a.email)}>🗑️ Eliminar</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab==="oficinas" && <OfficinaView agents={agents} matches={matches}/>}

      {tab==="override" && (
        <div className="card" style={{borderColor:"rgba(255,165,0,.4)",background:"linear-gradient(135deg,rgba(255,165,0,.06),rgba(8,12,8,.9))"}}>
          <div className="card-title" style={{color:"#ffb347"}}>🔓 Habilitar carga de pronósticos</div>
          <div className="alert alert-warn" style={{marginBottom:16}}>
            Activá una fase para que los agentes puedan registrarse y cargar o editar sus pronósticos aunque la fecha límite ya pasó. <strong>Las predicciones ya cargadas no se borran.</strong> Desactivá cuando todos hayan cargado.
          </div>
          {["Fase de Grupos","Dieciseisavos de Final","Octavos de Final","Cuartos de Final","Semifinal","3er y 4to Puesto","Final 🏆"].map(phase => {
            const isActive = overrides[phase] === true;
            const deadlinePassed = !isPhaseOpen(phase, {});
            return (
              <div key={phase} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:isActive?"rgba(255,165,0,.1)":"rgba(255,255,255,.03)",border:`1px solid ${isActive?"rgba(255,165,0,.4)":"rgba(255,255,255,.08)"}`,borderRadius:10,padding:"14px 16px",marginBottom:10}}>
                <div>
                  <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:".95rem",letterSpacing:1}}>
                    {phase}
                    {isActive && <span style={{marginLeft:10,fontSize:".7rem",color:"#ffb347",fontFamily:"Barlow Condensed",letterSpacing:1}}>● HABILITADA</span>}
                    {!deadlinePassed && !isActive && <span style={{marginLeft:10,fontSize:".7rem",color:"#7dff9e",fontFamily:"Barlow Condensed",letterSpacing:1}}>● ABIERTA (fecha vigente)</span>}
                  </div>
                  {!deadlinePassed && <div style={{fontSize:".75rem",color:"rgba(255,255,255,.35)",marginTop:3}}>Esta fase aún no venció — está abierta naturalmente</div>}
                  {deadlinePassed && !isActive && <div style={{fontSize:".75rem",color:"rgba(255,255,255,.35)",marginTop:3}}>Cerrada automáticamente por vencimiento de fecha</div>}
                </div>
                <button
                  className={`btn btn-sm ${isActive ? "btn-red" : "btn-gold"}`}
                  onClick={()=>onSaveOverride(phase, !isActive)}
                >
                  {isActive ? "🔒 Cerrar" : "🔓 Abrir"}
                </button>
              </div>
            );
          })}
          {Object.values(overrides).some(v=>v) && (
            <div style={{marginTop:8}}>
              <button className="btn btn-red btn-sm" onClick={()=>{
                const closed = {};
                Object.keys(overrides).forEach(k=>{closed[k]=false;});
                ["Fase de Grupos","Dieciseisavos de Final","Octavos de Final","Cuartos de Final","Semifinal","3er y 4to Puesto","Final 🏆"].forEach(p=>{closed[p]=false;});
                onSaveOverride("__all__", false);
                Object.keys(overrides).forEach(k=>onSaveOverride(k,false));
              }}>🔒 Cerrar todas las fases</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResultRow({ match, onSave }) {
  const [h, setH] = useState(match.result?.homeGoals??"");
  const [a, setA] = useState(match.result?.awayGoals??"");
  const [homeTeam, setHomeTeam] = useState(match.home==="Por definir"?"":match.home);
  const [awayTeam, setAwayTeam] = useState(match.away==="Por definir"?"":match.away);
  const isPending = match.home==="Por definir"||match.away==="Por definir";

  async function save() {
    const newHome = homeTeam||match.home;
    const newAway = awayTeam||match.away;
    await onSave(match.id, {
      ...match,
      home: newHome, away: newAway,
      result: { homeGoals:parseInt(h)||0, awayGoals:parseInt(a)||0 }
    });
  }

  return (
    <div className="match-card" style={{flexWrap:"wrap",gap:10}}>
      <div className="match-meta" style={{minWidth:90}}>{match.date}<br/>{match.time} hs</div>
      {isPending ? (
        <div style={{display:"flex",alignItems:"center",gap:8,flex:1,flexWrap:"wrap"}}>
          <input className="input" style={{maxWidth:160,fontSize:".82rem",padding:"6px 10px"}} placeholder="Equipo local" value={homeTeam} onChange={e=>setHomeTeam(e.target.value)}/>
          <span className="vs">vs</span>
          <input className="input" style={{maxWidth:160,fontSize:".82rem",padding:"6px 10px"}} placeholder="Equipo visitante" value={awayTeam} onChange={e=>setAwayTeam(e.target.value)}/>
        </div>
      ) : (
        <div className="match-teams" style={{flex:1}}>
          <span>{FLAGS[match.home]||"🏳"}</span>
          <span className="team-nm">{match.home}</span>
          <span className="vs">vs</span>
          <span className="team-nm">{match.away}</span>
          <span>{FLAGS[match.away]||"🏳"}</span>
        </div>
      )}
      <div className="score-pair">
        <input className="score-in" type="number" min="0" value={h} onChange={e=>setH(e.target.value)} placeholder="0"/>
        <span style={{color:"rgba(255,255,255,.35)",fontFamily:"Bebas Neue"}}>-</span>
        <input className="score-in" type="number" min="0" value={a} onChange={e=>setA(e.target.value)} placeholder="0"/>
      </div>
      <button className="btn btn-primary btn-sm" onClick={save}>{match.result?"✏️ Editar":"💾 Guardar"}</button>
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
  const [overrides, setOverrides] = useState({});
  const [appLoading, setAppLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [tab, setTab] = useState("ranking");

  useEffect(()=>{
    initMatchesInDB().then(()=>{
      const unsubM = onSnapshot(doc(db,"config","matches"), snap=>{
        if(snap.exists()){
          const arr = Object.values(snap.data().matches).sort((a,b)=>a.id-b.id);
          setMatches(arr);
        }
      });
      const unsubA = onSnapshot(collection(db,"agents"), snap=>{
        setAgents(snap.docs.map(d=>d.data()));
        setAppLoading(false);
      });
      const unsubO = onSnapshot(doc(db,"config","overrides"), snap=>{
        if(snap.exists()) setOverrides(snap.data());
        else setOverrides({});
      });
      return ()=>{unsubM();unsubA();unsubO();};
    });
  },[]);

  async function handleLogin(user) {
    setLoginLoading(true);
    if(!user.isAdmin){
      const key = user.email.replace(/\./g,"_").replace(/@/g,"_at_");
      const snap = await getDoc(doc(db,"agents",key));
      if(!snap.exists()){
        await saveAgentToDB({email:user.email,name:user.name,office:user.office||"KW ON",predictions:{},logros:{}});
      } else {
        const data=snap.data(); user.name=data.name; user.office=data.office;
      }
    }
    setLoginLoading(false); setSession(user);
    setTab(user.isAdmin?"admin":"ranking");
  }

  async function handleSavePred(preds) { await updateAgentField(session.email,"predictions",preds); }

  async function handleSaveResult(matchId, matchData) {
    await updateMatchInDB(matchId, matchData);
  }

  async function handleSaveLogros(email, logros) { await updateAgentField(email,"logros",logros); }

  async function handleSaveOverride(phase, value) {
    const newOverrides = { ...overrides, [phase]: value };
    await saveOverrideToDB(newOverrides);
    setOverrides(newOverrides);
  }

  async function handleDeleteAgent(email) {
    await deleteAgentFromDB(email);
    if(session?.email===email) setSession(null);
  }

  const currentAgent = session&&!session.isAdmin ? agents.find(a=>a.email===session.email) : null;

  if(appLoading) return (<><style>{CSS}</style><LoadingScreen/></>);
  if(!session) return (<><style>{CSS}</style><LoginScreen onLogin={handleLogin} loading={loginLoading}/></>);

  const navItems = session.isAdmin
    ? [{id:"ranking",label:"🏆 Ranking"},{id:"oficinas",label:"🏢 Oficinas"},{id:"admin",label:"🔐 Admin"}]
    : [{id:"ranking",label:"🏆 Ranking"},{id:"oficinas",label:"🏢 Oficinas"},{id:"prode",label:"⚽ Mis predicciones"},{id:"mystats",label:"📊 Mis puntos"}];

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
              <button className="btn btn-outline btn-sm" onClick={()=>setSession(null)}>Salir</button>
            </div>
          </div>
        </header>
        <nav className="nav">
          <div className="nav-inner">
            {navItems.map(item=>(
              <button key={item.id} className={`nav-btn ${tab===item.id?"active":""}`} onClick={()=>setTab(item.id)}>{item.label}</button>
            ))}
            <div className="nav-user">{session.isAdmin?"👑 Admin":`👤 ${session.name?.split(" ")[0]}`}</div>
          </div>
        </nav>
        <main className="main">
          {tab==="ranking" && <div className="card"><div className="card-title">🏆 Ranking general — todos contra todos</div><RankingView agents={agents} matches={matches}/></div>}
          {tab==="oficinas" && <OfficinaView agents={agents} matches={matches}/>}
          {tab==="prode" && currentAgent && <ProdeView agent={currentAgent} matches={matches} overrides={overrides} onSave={handleSavePred}/>}
          {tab==="mystats" && currentAgent && <MyStatsView agent={currentAgent} matches={matches}/>}
          {tab==="admin" && session.isAdmin && <AdminView agents={agents} matches={matches} overrides={overrides} onSaveResult={handleSaveResult} onSaveLogros={handleSaveLogros} onDeleteAgent={handleDeleteAgent} onSaveOverride={handleSaveOverride}/>}
        </main>
      </div>
    </>
  );
}
