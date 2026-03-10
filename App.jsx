import { useState, useEffect, useCallback, useRef } from "react";
import { supabase, todayKey, loadDay, saveDay, loadLastDays } from "./supabase.js";


// ─── PROFILE ──────────────────────────────────────────────────────────────────
const CYCLE_START = new Date("2026-02-09");
const CYCLE_LEN   = 31;
const OP_DATE     = new Date("2026-03-18");

function getCycle() {
  const d = ((Math.floor((new Date() - CYCLE_START) / 86400000)) % CYCLE_LEN) + 1;
  if (d <= 5)  return { phase:"Menstruation", day:d, emoji:"🌑", energy:1, col:"#c0392b", soon:false, tip:"Ruhe ist Regeneration. Wärme, leichte Kost, kein Druck." };
  if (d <= 13) return { phase:"Follikelphase", day:d, emoji:"🌱", energy:4, col:"#27ae60", soon:false, tip:"Energie steigt. Gute Zeit für neue Gewohnheiten." };
  if (d <= 16) return { phase:"Eisprung",      day:d, emoji:"⚡", energy:5, col:"#f39c12", soon:false, tip:"Peak-Energie. Kommunikation & Kreativität fließen." };
  return { phase:"Lutealphase", day:d, emoji:"🌙", energy:2, col:"#8e44ad", soon:d>=27,
    tip:d>=27?"Periode steht kurz bevor — extra Magnesium heute Abend, Wärme & Sanftheit.":"Ressourcen schonen ist Stärke. Introversion ist normal gerade." };
}
const SICK_END    = new Date("2026-03-24");

const SUPPLEMENTS = {
  morning: ["Vitamin Stack (ESN)", "Omega 3", "Vitamin D + K2", "Ashwagandha"],
  day:     ["Zink (ESN) — 1–2h nach dem Essen"],
  evening: ["Magnesium Bisglycinat (ESN) — 2–3h vor Schlaf"],
};

// ─── FESTE WORKOUT-BIBLIOTHEK ─────────────────────────────────────────────────
// Immer dieselben Übungen → Routine & System
const WORKOUTS = {
  gym: {
    label: "Gym",
    icon: "🏋️",
    duration: "45–55 Min",
    exercises: [
      { name: "Laufband Warm-up",   sets: "10 Min",   tip: "5 km/h → 7 km/h, leichte Steigung" },
      { name: "Stair Master",       sets: "10 Min",   tip: "Konstantes Tempo, aufrecht stehen" },
      { name: "Hip Thrust (Gerät)", sets: "4×12",     tip: "Squeeze oben halten, kontrolliert runter · Glutes 🍑" },
      { name: "Abduktor-Maschine",  sets: "3×15",     tip: "Langsam & kontrolliert · Gluteus medius" },
      { name: "Romanian Deadlift",  sets: "3×10",     tip: "Rücken gerade, Dehnung fühlen · Glutes & Hamstrings" },
    ],
  },
  gym_light: {
    label: "Gym Light",
    icon: "🏃‍♀️",
    duration: "30–35 Min",
    exercises: [
      { name: "Laufband",           sets: "20 Min",   tip: "Moderate Pace, leichte Steigung — Zone 2" },
      { name: "Hip Thrust (Gerät)", sets: "3×12",     tip: "Leichteres Gewicht als normal, Fokus auf Gefühl" },
      { name: "Abduktor-Maschine",  sets: "2×15",     tip: "Gleiche Übung, weniger Gewicht" },
    ],
  },
  home_booty: {
    label: "Home Booty",
    icon: "🍑",
    duration: "10–12 Min",
    exercises: [
      { name: "Glute Bridge",          sets: "3×15",  tip: "Bootyband über Knie · Squeeze oben 1 Sek" },
      { name: "Donkey Kicks",          sets: "3×12",  tip: "Bootyband · Pro Seite, Kern anspannen" },
      { name: "Side-lying Abduktion",  sets: "3×15",  tip: "Bootyband · Langsam, kontrolliert pro Seite" },
      { name: "Pulse Squat",           sets: "2×20",  tip: "Bootyband · Kleine pulsierende Bewegung unten" },
    ],
  },
  home_core: {
    label: "Core · Pamela Reif",
    icon: "🔥",
    duration: "10 Min",
    exercises: [
      { name: "Pamela Reif 10 Min Abs", sets: "1×",   tip: "youtube.com/pamelareifsports — 10 Min Ab Workout" },
      { name: "Alternativ: Dead Bug",   sets: "3×10",  tip: "Rücken flach, langsam — perfekt für Core-Aktivierung" },
      { name: "Hollow Body Hold",       sets: "3×20s", tip: "Beine gestreckt, Rücken am Boden" },
    ],
  },
  pilates: {
    label: "Pilates",
    icon: "🧘‍♀️",
    duration: "60 Min",
    exercises: [
      { name: "Pilates-Kurs", sets: "60 Min", tip: "Gebuchter Kurs — komm pünktlich, trink vorher 500ml" },
    ],
  },
  rest: {
    label: "Aktive Erholung",
    icon: "🌿",
    duration: "20–30 Min",
    exercises: [
      { name: "Spaziergang",         sets: "20–30 Min", tip: "Frische Luft · Zone 1 · kein Stress" },
      { name: "Stretching",         sets: "10 Min",    tip: "Hüftbeuger, Hamstrings, Piriformis" },
    ],
  },
};

// ─── WORKOUT EMPFEHLUNG LOGIK ─────────────────────────────────────────────────
function getWorkoutRec({ cyclePhase, energyLevel, whoopRecovery, hasPilatesBooked, hasGymBooked, lastWorkouts, isSickLeave }) {
  if (isSickLeave && whoopRecovery < 34) return { type: "rest", reason: "WHOOP Recovery niedrig + Genesungsphase — Körper schonen heute." };

  if (hasPilatesBooked) return { type: "pilates", reason: "Pilates im Kalender gebucht ✓" };
  if (hasGymBooked)     return { type: "gym",     reason: "Gym im Kalender gebucht ✓" };

  // Energie-Level: 0=0-25%, 1=25-50%, 2=50-75%, 3=75-100%
  const energy = energyLevel ?? 2;
  const rec    = whoopRecovery ?? 50;

  // Check letzte 2 Tage: kein Training → heute unbedingt
  const restDays = lastWorkouts?.filter(w => w === "rest" || w === null).length ?? 0;
  const mustTrain = restDays >= 2;

  // Luteal / Menstruation = niedrige Energie
  const lowCyclePhase = cyclePhase === "Lutealphase" || cyclePhase === "Menstruation";

  if (energy <= 0 && rec < 34 && !mustTrain) {
    return { type: "rest", reason: "Sehr niedrige Energie + niedriger Recovery-Score — heute aktiv erholen." };
  }
  if ((energy >= 3 || rec >= 67) && !lowCyclePhase) {
    return { type: "gym", reason: energy >= 3 ? "Hohe Energie heute → Gym für maximalen Glute-Aufbau." : "Guter WHOOP-Score → Gym nutzen." };
  }
  if (energy >= 2 && !lowCyclePhase) {
    return { type: mustTrain ? "gym_light" : "home_booty", reason: mustTrain ? "2+ Ruhetage → mindestens leichtes Gym heute." : "Moderate Energie → Home Booty Workout." };
  }
  if (lowCyclePhase && energy <= 1) {
    return { type: mustTrain ? "home_booty" : "rest", reason: lowCyclePhase ? `${cyclePhase}: Sanft bleiben — ${mustTrain ? "kurzes Home-Workout reicht." : "Erholung erlaubt."}` : "Niedrige Energie → Home-Workout oder Pause." };
  }
  return { type: "home_booty", reason: "Festes Home Booty Workout — kurz & effektiv." };
}

// ─── NUTRITION ────────────────────────────────────────────────────────────────
function getNutrition(workoutType, whoopStrain) {
  const sleepScoreVal = parseFloat(whoopStrain) || 0;
  const isGym  = workoutType === "gym" || workoutType === "gym_light";
  const isPil  = workoutType === "pilates";
  const isHome = workoutType === "home_booty" || workoutType === "home_core";
  const isRest = workoutType === "rest";

  let kcal = 1400, prot = 100, note = "Ruhetag · Maintenance", carbNote = "Leicht & gemüsereich heute";
  if (isGym)  { kcal = 1750; prot = 120; note = "Gym-Tag · Aufbau"; carbNote = "Komplexe Carbs: Haferflocken, Süßkartoffel, Banane"; }
  if (isPil)  { kcal = 1600; prot = 110; note = "Pilates-Tag";       carbNote = "Moderate Carbs — leicht verdaulich vor dem Kurs"; }
  if (isHome) { kcal = 1500; prot = 105; note = "Home-Workout";      carbNote = "Moderate Carbs reichen für kurzes Training"; }
  if (sleepScoreVal < 45 && sleepScoreVal > 0) { carbNote = "Schlaf war schwach — leicht verdauliche Kost bevorzugen heute"; }

  const meals = isGym ? [
    { t: "Frühstück",  icon: "🌅", meal: "Overnight Oats: 80g Haferflocken · Skyr · Banane · Chia · Honig",   p: "32g P · 480 kcal", tip: "🔋 Pre-Workout Energie" },
    { t: "Mittag",     icon: "☀️", meal: "150g Protein-Fusilli · 200g Veganes Hack · Passata · Lauchzwiebeln", p: "45g P · 520 kcal", tip: "" },
    { t: "Snack",      icon: "💪", meal: "250g Skyr natur · Protein Bites · Banane",                            p: "30g P · 310 kcal", tip: "⚡ Post-Workout Fenster nutzen" },
    { t: "Abendessen", icon: "🌙", meal: "200g Süßkartoffel · 150g Veganes Hack · Rucola · Limettendressing",  p: "28g P · 440 kcal", tip: "" },
  ] : isPil ? [
    { t: "Frühstück",  icon: "🌅", meal: "3 Rühreier · 1 Scheibe Eiweißbrot · ½ Avocado · Cherry-Tomaten",    p: "36g P · 440 kcal", tip: "🧘 Leicht vor dem Kurs" },
    { t: "Mittag",     icon: "☀️", meal: "Romana Salat · 150g Veganes Hack · Patros Leicht · Limette",        p: "30g P · 380 kcal", tip: "" },
    { t: "Snack",      icon: "🍇", meal: "200g Körniger Frischkäse · Gurke · Rote Trauben",                   p: "22g P · 260 kcal", tip: "" },
    { t: "Abendessen", icon: "🌙", meal: "150g Protein-Fusilli · Mozzarella Light · Cherry-Tomaten · Basilikum · Olivenöl", p: "32g P · 480 kcal", tip: "" },
  ] : isHome ? [
    { t: "Frühstück",  icon: "🌅", meal: "3 Rühreier · ½ Avocado · Cherry-Tomaten · Eiweißbrot",             p: "36g P · 420 kcal", tip: "" },
    { t: "Mittag",     icon: "☀️", meal: "Romana Salat · 100g Veganes Hack · Patros · Gurke · Lauchzwiebeln · Limette", p: "28g P · 350 kcal", tip: "" },
    { t: "Snack",      icon: "🍇", meal: "200g Skyr · Chia · Passionsfrucht · Honig",                        p: "24g P · 240 kcal", tip: "🍬 Süß & sättigend" },
    { t: "Abendessen", icon: "🌙", meal: "200g Süßkartoffel · 2 Eier · Mozzarella Light · Spinat · Sriracha", p: "30g P · 410 kcal", tip: "" },
  ] : [
    { t: "Frühstück",  icon: "🌅", meal: "2 Rühreier · Skyr + Chia + Passionsfrucht · Eiweißbrot",           p: "30g P · 380 kcal", tip: "" },
    { t: "Mittag",     icon: "☀️", meal: "Romana Salat · Patros Leicht · Gurke · Lauchzwiebeln · Limette",   p: "18g P · 280 kcal", tip: "🥗 Leicht & frisch" },
    { t: "Snack",      icon: "🍇", meal: "Körniger Frischkäse · Rote Trauben",                               p: "16g P · 220 kcal", tip: "" },
    { t: "Abendessen", icon: "🌙", meal: "Süßkartoffel-Suppe · Kokosnussdrink · Veganes Hack · Lauchzwiebeln", p: "22g P · 380 kcal", tip: "🌙 Warm & sättigend" },
  ];
  return { kcal, prot, note, carbNote, meals };
}

// ─── DESIGN ───────────────────────────────────────────────────────────────────
const C = {
  bg:"#0c0c0d", card:"rgba(255,255,255,0.035)", border:"rgba(255,255,255,0.07)",
  accent:"#c8a97e", accentBg:"rgba(200,169,126,0.1)", accentBorder:"rgba(200,169,126,0.25)",
  text:"#ede8e1", muted:"#6b6358", faint:"#1e1b18",
  green:"#4caf6e", greenBg:"rgba(76,175,110,0.1)", greenBorder:"rgba(76,175,110,0.25)",
  blue:"#5dade2", blueBg:"rgba(93,173,226,0.1)",
  purple:"#a07cc5", purpleBg:"rgba(160,124,197,0.1)", purpleBorder:"rgba(160,124,197,0.25)",
  red:"#e05555", redBg:"rgba(224,85,85,0.1)", redBorder:"rgba(224,85,85,0.2)",
  orange:"#e67e22",
};
const CARD = { background:C.card, border:`1px solid ${C.border}`, borderRadius:"16px", padding:"20px", marginBottom:"10px" };
const INP  = { width:"100%", padding:"9px 12px", borderRadius:"10px", border:`1px solid ${C.border}`, background:"rgba(255,255,255,0.04)", color:C.text, fontSize:"13px", outline:"none", fontFamily:"inherit", boxSizing:"border-box" };

const Label = ({ c, children }) => (
  <div style={{ fontSize:"9.5px", fontWeight:600, letterSpacing:"0.14em", textTransform:"uppercase", color:c||C.muted, marginBottom:"12px" }}>{children}</div>
);
const Bar = ({ val, max, col }) => (
  <div style={{ height:"3px", background:C.faint, borderRadius:"2px", overflow:"hidden", margin:"8px 0" }}>
    <div style={{ height:"100%", width:`${Math.min(100,(val/max)*100)}%`, background:col||C.accent, borderRadius:"2px", transition:"width .4s" }} />
  </div>
);
const CheckRow = ({ done, onClick, label, sub, hi }) => (
  <div onClick={onClick} style={{ display:"flex", gap:"11px", alignItems:"center", padding:"8px 0", cursor:"pointer", borderBottom:`1px solid ${C.faint}`, opacity:done?0.35:1, transition:"opacity .2s" }}>
    <div style={{ width:"18px", height:"18px", borderRadius:"5px", flexShrink:0, border:`1.5px solid ${done?C.green:C.border}`, background:done?C.green:"transparent", display:"flex", alignItems:"center", justifyContent:"center", transition:"all .2s" }}>
      {done && <span style={{ color:"#000", fontSize:"10px", fontWeight:800 }}>✓</span>}
    </div>
    <div>
      <div style={{ fontSize:"13px", color:done?C.muted:(hi?C.accent:C.text), textDecoration:done?"line-through":"none" }}>{label}</div>
      {sub && <div style={{ fontSize:"10.5px", color:C.muted, marginTop:"1px" }}>{sub}</div>}
    </div>
  </div>
);
const Pill = ({ label, active, onClick, col, small }) => (
  <button onClick={onClick} style={{ padding: small?"5px 10px":"7px 14px", borderRadius:"20px", fontSize: small?"11px":"12px", fontWeight:500, border:`1px solid ${active?(col||C.accent):C.border}`, background:active?((col||C.accent)+"18"):"transparent", color:active?(col||C.accent):C.muted, cursor:"pointer", fontFamily:"inherit", transition:"all .2s", whiteSpace:"nowrap" }}>{label}</button>
);

// ─── STORAGE (Supabase) ───────────────────────────────────────────────────────
const dayKey = (d=new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
let _saveTimer = null;
const saveDayDebounced = (date, payload) => {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => saveDay(date, payload), 800);
};

// ══════════════════════════════════════════════════════════════════════════════
// HEADER
// ══════════════════════════════════════════════════════════════════════════════
function Header({ cycle, intention, onTapInt }) {
  const now = new Date();
  const h = now.getHours();
  const greet = h<11?"Guten Morgen":h<17?"Hallo":"Guten Abend";
  const D=["So","Mo","Di","Mi","Do","Fr","Sa"], M=["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];
  const dOp   = Math.ceil((OP_DATE-now)/86400000);
  const dSick = Math.ceil((SICK_END-now)/86400000);

  return (
    <div style={{ padding:"36px 20px 16px" }}>
      <div style={{ fontSize:"10px", color:C.muted, letterSpacing:"0.16em", textTransform:"uppercase", marginBottom:"6px" }}>
        {D[now.getDay()]}, {now.getDate()}. {M[now.getMonth()]} {now.getFullYear()}
      </div>
      <div style={{ fontFamily:"'DM Serif Display', serif", fontSize:"32px", color:C.text, lineHeight:1.15, marginBottom:"20px" }}>
        {greet},<br/>Carlotta {cycle.emoji}
      </div>

      {/* Intention */}
      <div onClick={onTapInt} style={{ background:C.accentBg, border:`1px solid ${C.accentBorder}`, borderRadius:"14px", padding:"12px 16px", marginBottom:"10px", cursor:"pointer" }}>
        <div style={{ fontSize:"9.5px", color:C.accent, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.12em", marginBottom:"4px" }}>✦ Intention dieser Woche</div>
        <div style={{ fontFamily:"'DM Serif Display', serif", fontSize:"15px", color:C.text, fontStyle:"italic" }}>"{intention}"</div>
        <div style={{ fontSize:"10px", color:C.muted, marginTop:"3px" }}>Tippen zum Bearbeiten</div>
      </div>

      {/* Status-Kacheln — nebeneinander (2-spaltig) */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px" }}>
        {/* Zyklus — nimmt volle Breite wenn kein OP-Banner */}
        <div style={{ background:cycle.col+"15", border:`1px solid ${cycle.col}30`, borderRadius:"14px", padding:"12px 14px", gridColumn: dOp<=0&&dSick<=0?"1 / -1":"auto" }}>
          <div style={{ fontSize:"10px", fontWeight:600, color:cycle.col, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:"4px" }}>{cycle.phase} · Tag {cycle.day}</div>
          <div style={{ display:"flex", gap:"3px", marginBottom:"6px" }}>{[1,2,3,4,5].map(i=><div key={i} style={{ width:"14px", height:"3px", borderRadius:"2px", background:i<=cycle.energy?cycle.col:C.faint }} />)}</div>
          <div style={{ fontSize:"11.5px", color:C.text, lineHeight:1.5 }}>{cycle.tip}</div>
          {cycle.soon&&<div style={{ fontSize:"11px", color:cycle.col, marginTop:"5px", fontWeight:500 }}>🩸 Periode steht bevor</div>}
        </div>

        {/* OP Kachel */}
        {dOp>0&&(
          <div style={{ background:C.redBg, border:`1px solid ${C.redBorder}`, borderRadius:"14px", padding:"12px 14px" }}>
            <div style={{ fontSize:"10px", fontWeight:600, color:C.red, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:"4px" }}>Brust-OP</div>
            <div style={{ fontFamily:"'DM Serif Display', serif", fontSize:"32px", color:C.red, lineHeight:1 }}>{dOp}</div>
            <div style={{ fontSize:"11px", color:C.muted, marginTop:"4px" }}>{dOp===1?"Tag":"Tage"} · 18. März</div>
          </div>
        )}

        {/* Genesungs-Kachel */}
        {dSick>0&&(
          <div style={{ background:C.blueBg, border:`1px solid rgba(93,173,226,0.2)`, borderRadius:"14px", padding:"12px 14px", gridColumn: dOp<=0?"2":"auto" }}>
            <div style={{ fontSize:"10px", fontWeight:600, color:C.blue, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:"4px" }}>🌱 Genesungszeit</div>
            <div style={{ fontFamily:"'DM Serif Display', serif", fontSize:"28px", color:C.blue, lineHeight:1 }}>{dSick}</div>
            <div style={{ fontSize:"11px", color:C.muted, marginTop:"4px" }}>{dSick===1?"Tag":"Tage"} · bis 24. März</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// WHOOP
// ══════════════════════════════════════════════════════════════════════════════
function WhoopSection({ data, onChange }) {
  const [open, setOpen] = useState(!data?.whoop?.recovery);
  const w = data?.whoop||{};
  const rec = parseInt(w.recovery);
  const rCol = !isNaN(rec)?(rec>=67?C.green:rec>=34?C.orange:C.red):C.muted;
  const rLabel = !isNaN(rec)?(rec>=67?"🟢 Push — guter Tag":"🟡 Moderat — auf Körper hören":"🔴 Erholen priorisieren"):null;

  return (
    <div style={CARD}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"12px" }}>
        <Label c={C.accent}>⌚ WHOOP Recovery</Label>
        <button onClick={()=>setOpen(o=>!o)} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:"20px", padding:"4px 12px", fontSize:"11px", color:C.muted, cursor:"pointer", fontFamily:"inherit" }}>
          {open?"Fertig":"Bearbeiten"}
        </button>
      </div>
      {open&&(
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px", marginBottom:"12px" }}>
          {[{k:"recovery",l:"Recovery %",p:"0–100"},{k:"hrv",l:"HRV (ms)",p:"z.B. 58"},{k:"sleepScore",l:"Schlafqualität %",p:"0–100"}].map(f=>(
            <div key={f.k}>
              <div style={{ fontSize:"10px", color:C.muted, marginBottom:"4px" }}>{f.l}</div>
              <input type="number" placeholder={f.p} value={w[f.k]||""} onChange={e=>onChange("whoop",{...w,[f.k]:e.target.value})} style={INP} />
            </div>
          ))}
        </div>
      )}
      {w.recovery?(
        <div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"6px", marginBottom:"10px" }}>
            {[{l:"Recovery",v:w.recovery+"%",c:rCol},{l:"HRV",v:w.hrv?w.hrv+"ms":"–",c:C.blue},{l:"Schlaf",v:w.sleepScore?w.sleepScore+"%":"–",c:C.purple}].map((s,i)=>(
              <div key={i} style={{ textAlign:"center", background:s.c+"18", borderRadius:"10px", padding:"8px 4px" }}>
                <div style={{ fontSize:"14px", fontWeight:700, color:s.c }}>{s.v}</div>
                <div style={{ fontSize:"9px", color:C.muted, marginTop:"2px" }}>{s.l}</div>
              </div>
            ))}
          </div>
          {rLabel&&<div style={{ background:rCol+"15", borderRadius:"10px", padding:"8px 12px", fontSize:"12px", color:rCol, fontWeight:500 }}>{rLabel}{parseInt(w.sleepScore)<60?" · Schlafqualität niedrig — heute früher runterfahren.":""}</div>}
        </div>
      ):(
        <div style={{ fontSize:"12px", color:C.muted, fontStyle:"italic" }}>Trage deine Werte ein — beeinflusst Workout & Ernährungsempfehlung.</div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MOOD + ENERGIE — 3 Fragen, klar & schnell
// ══════════════════════════════════════════════════════════════════════════════
function MoodCheck({ data, onChange }) {
  const ENERGY_OPTS = [
    {v:0, label:"Sehr niedrig",  range:"0–25%",  col:C.red},
    {v:1, label:"Niedrig",       range:"25–50%", col:C.orange},
    {v:2, label:"Moderat",       range:"50–75%", col:C.accent},
    {v:3, label:"Hoch",          range:"75–100%",col:C.green},
  ];
  const MOOD_OPTS = [
    {v:0, e:"😞", l:"Belastet"},
    {v:1, e:"😕", l:"Gedrückt"},
    {v:2, e:"😐", l:"Neutral"},
    {v:3, e:"🙂", l:"Leicht"},
    {v:4, e:"😄", l:"Gut"},
  ];
  const ADS_OPTS = [
    {v:0, e:"😌", l:"Ruhig",    col:C.green,  tip:null},
    {v:1, e:"🙃", l:"Moderat",  col:C.accent, tip:"Pomodoro: 25 Min fokussiert, 5 Min Pause. Max. 3 Prioritäten heute."},
    {v:2, e:"⚡", l:"Hibbelig", col:C.orange, tip:"Energie dosieren: Schwerste Aufgabe JETZT erledigen, dann bewusst runterkommen. Kein Multitasking."},
    {v:3, e:"🌪️", l:"Sehr hoch",col:C.red,   tip:"Achtung Energie-Crash: Nur 1 Aufgabe. Nach jeder Stunde 10 Min Pause ohne Bildschirm. Mittags kurz raus."},
  ];

  const el  = data?.energyLevel;
  const moo = data?.mood?.valence;
  const ads = data?.adsLevel;

  const adsInfo = ads !== undefined ? ADS_OPTS[ads] : null;

  return (
    <div style={CARD}>
      <Label>🧠 Check-in</Label>

      {/* Energie */}
      <div style={{ marginBottom:"16px" }}>
        <div style={{ fontSize:"11px", color:C.muted, marginBottom:"8px", fontWeight:500 }}>Energie heute</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px" }}>
          {ENERGY_OPTS.map(o=>(
            <button key={o.v} onClick={()=>onChange("energyLevel", el===o.v ? undefined : o.v)}
              style={{ padding:"10px 8px", borderRadius:"10px", border:`1px solid ${el===o.v?o.col:C.border}`, background:el===o.v?o.col+"20":"transparent", color:el===o.v?o.col:C.muted, cursor:"pointer", fontFamily:"inherit", transition:"all .2s", textAlign:"center" }}>
              <div style={{ fontSize:"13px", fontWeight:700 }}>{o.range}</div>
              <div style={{ fontSize:"10px", marginTop:"2px", opacity:.85 }}>{o.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Stimmung */}
      <div style={{ marginBottom:"16px" }}>
        <div style={{ fontSize:"11px", color:C.muted, marginBottom:"8px", fontWeight:500 }}>Stimmung</div>
        <div style={{ display:"flex", gap:"4px" }}>
          {MOOD_OPTS.map(o=>{
            const active = moo===o.v;
            return (
              <button key={o.v} onClick={()=>onChange("mood", {...(data?.mood||{}), valence: moo===o.v ? undefined : o.v})}
                style={{ flex:1, padding:"8px 2px", borderRadius:"10px", fontSize:"18px", border:`1px solid ${active?C.accent:C.border}`, background:active?C.accentBg:"transparent", cursor:"pointer", transition:"all .2s" }}>
                {o.e}
                <div style={{ fontSize:"8.5px", color:active?C.accent:C.muted, marginTop:"3px" }}>{o.l}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ADS-Level */}
      <div>
        <div style={{ fontSize:"11px", color:C.muted, marginBottom:"8px", fontWeight:500 }}>ADS heute — wie hibbelig?</div>
        <div style={{ display:"flex", gap:"6px" }}>
          {ADS_OPTS.map(o=>{
            const active = ads===o.v;
            return (
              <button key={o.v} onClick={()=>onChange("adsLevel", ads===o.v ? undefined : o.v)}
                style={{ flex:1, padding:"8px 4px", borderRadius:"10px", fontSize:"16px", border:`1px solid ${active?o.col:C.border}`, background:active?o.col+"18":"transparent", cursor:"pointer", fontFamily:"inherit", transition:"all .2s" }}>
                {o.e}
                <div style={{ fontSize:"8.5px", color:active?o.col:C.muted, marginTop:"3px" }}>{o.l}</div>
              </button>
            );
          })}
        </div>

        {/* ADS Tipp */}
        {adsInfo?.tip && (
          <div style={{ marginTop:"10px", background:adsInfo.col+"12", border:`1px solid ${adsInfo.col}30`, borderRadius:"10px", padding:"10px 12px" }}>
            <div style={{ fontSize:"9.5px", color:adsInfo.col, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:"4px" }}>
              {ads>=2 ? "⚠️ Energie-Management heute" : "💡 Tipp für heute"}
            </div>
            <div style={{ fontSize:"12px", color:C.text, lineHeight:1.6 }}>{adsInfo.tip}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TÄGLICHE EMPFEHLUNGEN — das Herzstück
// ══════════════════════════════════════════════════════════════════════════════
function DailyRec({ workoutRec, cycle, energyLevel, whoopData, workoutType, onOverride }) {
  const workout = WORKOUTS[workoutType];
  const [showExercises, setShowExercises] = useState(false);
  const w = whoopData||{};
  const rec = parseInt(w.recovery);

  // Individuelle Zusatz-Empfehlungen
  const extraTips = [];
  if (cycle.phase==="Lutealphase"||cycle.phase==="Menstruation") extraTips.push({ icon:"🌡️", text:"Wärme & Tee heute — Himbeerblatt oder Ingwer bei Lutealphase/Menstruation" });
  if (parseFloat(w.sleep)<7) extraTips.push({ icon:"😴", text:"Schlaf war unter 7h — Koffein max. bis 13 Uhr, kein Screen nach 22 Uhr" });
  if (!isNaN(rec)&&rec<34) extraTips.push({ icon:"⚡", text:"Niedriger Recovery-Score — heute auf Regeneration fokussieren, kein Druck" });
  if (energyLevel!==undefined&&energyLevel>=3) extraTips.push({ icon:"🚀", text:"Hohe Energie heute — nutze das Momentum, starte mit der schwersten Aufgabe zuerst" });
  if (cycle.phase==="Follikelphase") extraTips.push({ icon:"🌱", text:"Follikelphase: Beste Zeit neue Gewohnheiten zu verankern — dein Gehirn lernt leichter" });
  if (cycle.phase==="Eisprung") extraTips.push({ icon:"💬", text:"Eisprung: Kommunikation & soziale Energie auf Hochtouren — guter Tag für wichtige Gespräche" });
  if (parseFloat(w.hrv)<45&&w.hrv) extraTips.push({ icon:"❤️", text:"HRV niedrig — Nervensystem gestresst. Ashwagandha heute besonders wichtig" });

  const wCol = workout.icon==="🏋️"||workout.icon==="🏃‍♀️" ? C.green : workout.icon==="🧘‍♀️" ? C.purple : workout.icon==="🌿" ? C.blue : C.accent;

  return (
    <div style={CARD}>
      <Label c={wCol}>✦ Empfehlung für heute</Label>

      {/* Workout-Karte */}
      <div style={{ background:wCol+"12", border:`1px solid ${wCol}30`, borderRadius:"14px", padding:"14px 16px", marginBottom:"12px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"6px" }}>
          <div style={{ display:"flex", gap:"10px", alignItems:"center" }}>
            <span style={{ fontSize:"24px" }}>{workout.icon}</span>
            <div>
              <div style={{ fontSize:"14px", fontWeight:700, color:C.text }}>{workout.label}</div>
              <div style={{ fontSize:"11px", color:C.muted }}>⏱ {workout.duration}</div>
            </div>
          </div>
          <button onClick={()=>setShowExercises(s=>!s)} style={{ background:"none", border:`1px solid ${wCol}40`, borderRadius:"20px", padding:"4px 12px", fontSize:"11px", color:wCol, cursor:"pointer", fontFamily:"inherit" }}>
            {showExercises?"Schließen":"Plan anzeigen"}
          </button>
        </div>
        <div style={{ fontSize:"12px", color:C.muted, fontStyle:"italic" }}>{workoutRec.reason}</div>

        {showExercises&&(
          <div style={{ marginTop:"12px", borderTop:`1px solid ${wCol}20`, paddingTop:"12px" }}>
            {workout.exercises.map((ex,i)=>(
              <div key={i} style={{ padding:"6px 0", borderBottom:i<workout.exercises.length-1?`1px solid ${C.faint}`:"none" }}>
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <div style={{ fontSize:"12.5px", fontWeight:600, color:C.text }}>{ex.name}</div>
                  <div style={{ fontSize:"11px", color:wCol, fontWeight:600 }}>{ex.sets}</div>
                </div>
                <div style={{ fontSize:"11px", color:C.muted, marginTop:"2px" }}>{ex.tip}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Override-Buttons */}
      <div style={{ marginBottom:"12px" }}>
        <div style={{ fontSize:"10px", color:C.muted, marginBottom:"7px", textTransform:"uppercase", letterSpacing:"0.1em" }}>Oder wähle selbst:</div>
        <div style={{ display:"flex", gap:"5px", flexWrap:"wrap" }}>
          {Object.entries(WORKOUTS).map(([key,w])=>(
            <Pill key={key} label={`${w.icon} ${w.label}`} active={workoutType===key} col={wCol} small onClick={()=>onOverride(key)} />
          ))}
        </div>
      </div>

      {/* Individuelle Tipps */}
      {extraTips.length>0&&(
        <div>
          <div style={{ fontSize:"10px", color:C.muted, marginBottom:"7px", textTransform:"uppercase", letterSpacing:"0.1em" }}>Heute speziell für dich</div>
          {extraTips.map((t,i)=>(
            <div key={i} style={{ display:"flex", gap:"9px", padding:"5px 0" }}>
              <span style={{ fontSize:"14px", flexShrink:0 }}>{t.icon}</span>
              <div style={{ fontSize:"12px", color:C.text, lineHeight:1.55 }}>{t.text}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MORGENROUTINE
// ══════════════════════════════════════════════════════════════════════════════
function MorningRoutine({ data, onChange }) {
  const STEPS = [
    { id:"water",      label:"0,5 L Wasser trinken",    sub:"Vor dem ersten Kaffee" },
    { id:"meditation", label:"5–10 Min Meditation",      sub:"Hinsetzen, ankommen — Gedanken ziehen lassen" },
    { id:"supps",      label:"Morgen-Supplements",       sub:"Vitamin Stack · Omega 3 · Vit D+K2 · Ashwagandha" },
    { id:"brief",      label:"Briefing gelesen ✓",       sub:"Du bist gerade dabei!" },
  ];
  const r=data?.routine||{};
  const done=STEPS.filter(s=>r[s.id]).length;
  return (
    <div style={CARD}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"4px" }}>
        <Label c={C.accent}>☀️ Morgenroutine</Label>
        <div style={{ fontSize:"11px", fontWeight:600, color:done===STEPS.length?C.green:C.muted }}>{done}/{STEPS.length}</div>
      </div>
      <Bar val={done} max={STEPS.length} col={done===STEPS.length?C.green:C.accent} />
      {STEPS.map(s=><CheckRow key={s.id} done={!!r[s.id]} label={s.label} sub={s.sub} onClick={()=>onChange("routine",{...r,[s.id]:!r[s.id]})} />)}
      {done===STEPS.length&&<div style={{ marginTop:"12px", textAlign:"center", fontSize:"13px", color:C.green, fontWeight:600 }}>Routine complete ✨</div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// JOURNAL
// ══════════════════════════════════════════════════════════════════════════════
function Journal({ data, onChange }) {
  const PROMPTS = ["Wie fühle ich mich gerade — ohne Bewertung?","Was brauche ich heute von mir selbst?","Was möchte ich loslassen?","Wofür bin ich gerade dankbar?"];
  const [pidx, setPidx] = useState(0);
  return (
    <div style={CARD}>
      <Label c={C.purple}>📓 Achtsamkeits-Journal</Label>
      <div style={{ background:C.purpleBg, border:`1px solid ${C.purpleBorder}`, borderRadius:"12px", padding:"10px 13px", marginBottom:"10px" }}>
        <div style={{ fontSize:"10px", color:C.purple, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:"5px" }}>Impuls</div>
        <div style={{ fontSize:"13px", color:C.text, fontStyle:"italic", lineHeight:1.55 }}>„{PROMPTS[pidx]}"</div>
      </div>
      <div style={{ display:"flex", gap:"5px", marginBottom:"10px" }}>
        {PROMPTS.map((_,i)=><Pill key={i} label={String(i+1)} active={pidx===i} col={C.purple} small onClick={()=>setPidx(i)} />)}
      </div>
      <textarea value={data?.journal||""} onChange={e=>onChange("journal",e.target.value)} placeholder="Schreib alles — es ist nur für dich…" style={{ ...INP, resize:"none", height:"88px", lineHeight:"1.6" }} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// NUTRITION
// ══════════════════════════════════════════════════════════════════════════════
function Nutrition({ cycle, workoutType, whoopStrain, data, onChange }) {
  const nutr = getNutrition(workoutType, whoopStrain);
  const eaten = data?.mealsEaten||{};
  return (
    <div style={CARD}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"12px" }}>
        <Label>🥗 Ernährung</Label>
        <div style={{ fontSize:"10.5px", color:C.muted }}>{nutr.kcal} kcal · {nutr.prot}g P</div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"6px", marginBottom:"12px" }}>
        {[{l:"Kalorien",v:nutr.kcal,c:C.orange},{l:"Protein",v:nutr.prot+"g",c:C.green},{l:"Fokus",v:"Glutes 🍑",c:C.purple}].map((s,i)=>(
          <div key={i} style={{ background:s.c+"15", borderRadius:"10px", padding:"8px", textAlign:"center" }}>
            <div style={{ fontSize:"13px", fontWeight:700, color:s.c }}>{s.v}</div>
            <div style={{ fontSize:"9px", color:C.muted, marginTop:"2px" }}>{s.l}</div>
          </div>
        ))}
      </div>
      <div style={{ background:C.faint, borderRadius:"10px", padding:"8px 12px", fontSize:"11.5px", color:C.muted, marginBottom:"12px", fontStyle:"italic" }}>💡 {nutr.carbNote}</div>
      {nutr.meals.map((m,i)=>(
        <div key={i} onClick={()=>onChange("mealsEaten",{...eaten,[i]:!eaten[i]})} style={{ display:"flex", gap:"10px", padding:"8px 0", cursor:"pointer", borderBottom:i<nutr.meals.length-1?`1px solid ${C.faint}`:"none", opacity:eaten[i]?0.38:1, transition:"opacity .2s" }}>
          <span style={{ fontSize:"17px", flexShrink:0 }}>{m.icon}</span>
          <div style={{ flex:1 }}>
            <div style={{ display:"flex", justifyContent:"space-between" }}>
              <div style={{ fontSize:"10.5px", fontWeight:600, color:C.accent, textTransform:"uppercase", letterSpacing:"0.08em" }}>{m.t}</div>
              <div style={{ fontSize:"10px", color:C.muted }}>{m.p}</div>
            </div>
            <div style={{ fontSize:"12px", color:eaten[i]?C.muted:C.text, marginTop:"2px", textDecoration:eaten[i]?"line-through":"none", lineHeight:1.5 }}>{m.meal}</div>
            {m.tip&&<div style={{ fontSize:"10.5px", color:C.green, marginTop:"2px" }}>{m.tip}</div>}
          </div>
        </div>
      ))}
      <div style={{ marginTop:"10px", fontSize:"10.5px", color:C.muted, fontStyle:"italic" }}>
        🛒 Alle Zutaten aus deinem Picnic-Einkauf · Antippen wenn gegessen
        {cycle.phase==="Lutealphase"?" · 🍫 Dunkle Schoki (85%) erlaubt!":""}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SUPPLEMENTS
// ══════════════════════════════════════════════════════════════════════════════
function Supplements({ data, onChange }) {
  const all=[...SUPPLEMENTS.morning.map(s=>({id:s,l:s,t:"Morgens"}))]
    .concat(SUPPLEMENTS.day.map(s=>({id:s,l:s,t:"Tagsüber"})))
    .concat(SUPPLEMENTS.evening.map(s=>({id:s,l:s,t:"Abends"})));
  const supps=data?.supps||{};
  return (
    <div style={CARD}>
      <Label>💊 Supplements</Label>
      {["Morgens","Tagsüber","Abends"].map(timing=>(
        <div key={timing} style={{ marginBottom:"12px" }}>
          <div style={{ fontSize:"9.5px", color:C.muted, textTransform:"uppercase", letterSpacing:"0.12em", marginBottom:"6px" }}>{timing}</div>
          {all.filter(s=>s.t===timing).map(s=><CheckRow key={s.id} done={!!supps[s.id]} label={s.l} onClick={()=>onChange("supps",{...supps,[s.id]:!supps[s.id]})} />)}
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// HYDRATION
// ══════════════════════════════════════════════════════════════════════════════
function Hydration({ data, onChange, hasTraining, glassMl }) {
  const ml=glassMl||250, goal=hasTraining?10:8, current=data?.water||0;
  const MS=[{t:2,l:"Vor Kaffee"},{t:4,l:"bis 12h"},{t:6,l:"bis 15h"},{t:goal,l:"Tagesziel"}];
  const totalMl=current*ml;
  return (
    <div style={CARD}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"4px" }}>
        <Label>💧 Wasser</Label>
        <div style={{ fontSize:"11px", fontWeight:600, color:current>=goal?C.green:C.muted }}>{totalMl>=1000?(totalMl/1000).toFixed(1)+"L":totalMl+"ml"} / {(goal*ml)>=1000?((goal*ml)/1000).toFixed(1)+"L":goal*ml+"ml"}</div>
      </div>
      <div style={{ fontSize:"10px", color:C.muted, marginBottom:"8px" }}>1 Feld = 1 Glas ({ml}ml)</div>
      <div style={{ display:"flex", gap:"5px", flexWrap:"wrap", marginBottom:"8px" }}>
        {Array.from({length:goal}).map((_,i)=>(
          <button key={i} onClick={()=>onChange("water",i<current?i:i+1)} style={{ width:"36px", height:"44px", borderRadius:"9px", cursor:"pointer", border:`1px solid ${i<current?C.blue:C.border}`, background:i<current?C.blueBg:"transparent", fontSize:"16px", transition:"all .15s" }}>
            {i<current?"💧":"·"}
          </button>
        ))}
      </div>
      <Bar val={current} max={goal} col={C.blue} />
      <div style={{ display:"flex", gap:"5px", flexWrap:"wrap" }}>
        {MS.map((m,i)=>(
          <div key={i} style={{ fontSize:"10.5px", color:current>=m.t?C.green:C.muted, background:current>=m.t?C.greenBg:"transparent", borderRadius:"8px", padding:"3px 8px", border:`1px solid ${current>=m.t?C.greenBorder:C.border}` }}>
            {current>=m.t?"✓":"○"} {m.l}
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// FOKUS
// ══════════════════════════════════════════════════════════════════════════════
function FocusToday({ data, onChange }) {
  const [draft, setDraft] = useState("");
  const DEFS=[{id:"t1",text:"Arzt Bescheinigung",done:false,pri:true},{id:"t2",text:"Ammerländer anrufen — Schaden melden",done:false,pri:true},{id:"t3",text:"Müll rausbringen",done:false,pri:true},{id:"t4",text:"Abwasch",done:false,pri:false},{id:"t5",text:"Wäsche waschen",done:false,pri:false},{id:"t6",text:"Müllsäcke kaufen",done:false,pri:false}];
  const tasks=data?.tasks||DEFS;
  const toggle=id=>onChange("tasks",tasks.map(t=>t.id===id?{...t,done:!t.done}:t));
  const add=()=>{ if(!draft.trim()) return; onChange("tasks",[...tasks,{id:String(Date.now()),text:draft.trim(),done:false,pri:false}]); setDraft(""); };
  return (
    <div style={CARD}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"4px" }}>
        <Label>🎯 Fokus heute</Label>
        <div style={{ fontSize:"9.5px", color:C.muted }}>Max. 3 · ADS-Prinzip</div>
      </div>
      {[["pri","Heute wichtig",C.red],["rest","Weitere",C.muted],["done","Erledigt ✓",C.muted]].map(([g,lbl,lc])=>{
        const list=tasks.filter(t=>g==="pri"?t.pri&&!t.done:g==="rest"?!t.pri&&!t.done:t.done);
        if(!list.length) return null;
        return (
          <div key={g}>
            <div style={{ fontSize:"9.5px", color:lc, textTransform:"uppercase", letterSpacing:"0.1em", margin:"10px 0 6px" }}>{lbl}</div>
            {list.map(t=><CheckRow key={t.id} done={t.done} label={t.text} hi={g==="pri"&&!t.done} onClick={()=>toggle(t.id)} />)}
          </div>
        );
      })}
      <div style={{ display:"flex", gap:"8px", marginTop:"12px" }}>
        <input value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} placeholder="+ Aufgabe…" style={INP} />
        <button onClick={add} style={{ padding:"9px 14px", borderRadius:"10px", background:C.accentBg, border:`1px solid ${C.accentBorder}`, color:C.accent, fontSize:"16px", cursor:"pointer" }}>+</button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CRYPTO
// ══════════════════════════════════════════════════════════════════════════════
function Crypto({ cryptoData, loading, onRefresh }) {
  return (
    <div style={CARD}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"12px" }}>
        <Label>₿ Portfolio</Label>
        <button onClick={onRefresh} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:"20px", padding:"4px 12px", fontSize:"11px", color:C.muted, cursor:"pointer", fontFamily:"inherit" }}>{loading?"…":"↻ Aktualisieren"}</button>
      </div>
      {loading?(<div style={{ fontSize:"12px", color:C.muted }}>Lade Kurse…</div>
      ):cryptoData?(
        <>
          <div style={{ background:C.accentBg, border:`1px solid ${C.accentBorder}`, borderRadius:"12px", padding:"12px 14px", marginBottom:"10px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div>
              <div style={{ fontSize:"9.5px", color:C.muted, textTransform:"uppercase", letterSpacing:"0.1em" }}>Gesamt</div>
              <div style={{ fontFamily:"'DM Serif Display', serif", fontSize:"26px", color:C.text }}>{cryptoData.totalValue||"–"}</div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:"9.5px", color:C.muted }}>seit gestern</div>
              <div style={{ fontSize:"16px", fontWeight:600, color:(cryptoData.totalChange||"").startsWith("+")?C.green:C.red }}>{cryptoData.totalChange||"–"}</div>
            </div>
          </div>
          {["ETH","VPAY","USDC","TIBBIR"].map((coin,ci)=>{
            const d=cryptoData[coin]; if(!d) return null;
            const up=d.trend==="up"||(d.change||"").startsWith("+");
            return (
              <div key={coin} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:ci<3?`1px solid ${C.faint}`:"none" }}>
                <div><div style={{ fontSize:"13px", fontWeight:600, color:C.text }}>{coin}</div><div style={{ fontSize:"10.5px", color:C.muted }}>{d.holding}</div></div>
                <div style={{ textAlign:"right" }}><div style={{ fontSize:"13px", fontWeight:600, color:C.text }}>{d.value}</div><div style={{ fontSize:"11px", color:d.trend==="stable"?C.muted:up?C.green:C.red }}>{d.change}</div></div>
              </div>
            );
          })}
          {cryptoData.summary&&<div style={{ marginTop:"10px", fontSize:"11.5px", color:C.muted, fontStyle:"italic" }}>{cryptoData.summary}</div>}
        </>
      ):(<div style={{ fontSize:"12px", color:C.muted, fontStyle:"italic" }}>Tippe "Aktualisieren" für heutige Kurse.</div>)}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ABEND
// ══════════════════════════════════════════════════════════════════════════════
function EveningReflect({ data, onChange }) {
  return (
    <div style={CARD}>
      <Label c={C.purple}>🌙 Abend-Reflexion</Label>
      <div style={{ marginBottom:"14px" }}>
        <div style={{ fontSize:"11px", color:C.muted, marginBottom:"7px" }}>Was war heute gut? (1 Sache reicht)</div>
        <textarea value={data?.goodThing||""} onChange={e=>onChange("goodThing",e.target.value)} placeholder="Heute war gut, dass…" style={{ ...INP, resize:"none", height:"62px" }} />
      </div>
      <div style={{ marginBottom:"14px" }}>
        <div style={{ fontSize:"11px", color:C.muted, marginBottom:"7px" }}>Eine Vorbereitung für morgen</div>
        <input value={data?.tomorrowPrep||""} onChange={e=>onChange("tomorrowPrep",e.target.value)} placeholder="Morgen lege ich … raus / erledige ich als erstes …" style={INP} />
      </div>
      <div>
        <div style={{ fontSize:"11px", color:C.muted, marginBottom:"8px" }}>Schlaf-Ziel</div>
        <div style={{ display:"flex", gap:"6px", flexWrap:"wrap" }}>
          {["22:00","22:30","23:00","23:30","00:00"].map(t=><Pill key={t} label={t} active={data?.bedtime===t} col={C.purple} onClick={()=>onChange("bedtime",data?.bedtime===t?null:t)} />)}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// REVIEW
// ══════════════════════════════════════════════════════════════════════════════
function ReviewView({ allData, mode }) {
  const now=new Date(), cutoff=new Date(now);
  cutoff.setDate(now.getDate()-(mode==="week"?7:30));
  const days=Object.keys(allData).filter(k=>k.startsWith("202")&&new Date(k)>=cutoff).sort();
  const M=["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];
  if(days.length<2) return (
    <div style={CARD}>
      <Label c={C.purple}>📊 {mode==="week"?"Weekly":"Monthly"} Review</Label>
      <div style={{ fontSize:"12.5px", color:C.muted, fontStyle:"italic", lineHeight:1.7 }}>Ab Tag 2 siehst du hier Energieverlauf, Workout-Streak, Routine-Kontinuität und deine gesammelten guten Momente.</div>
    </div>
  );
  const avg=arr=>arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:null;
  const avgE=avg(days.map(d=>allData[d]?.energyLevel).filter(e=>e!==undefined));
  const avgW=avg(days.map(d=>allData[d]?.water).filter(w=>w!==undefined));
  const routineDays=days.filter(d=>Object.values(allData[d]?.routine||{}).filter(Boolean).length>=3).length;
  const workoutDays=days.filter(d=>allData[d]?.workoutDone).length;
  const goodThings=days.filter(d=>allData[d]?.goodThing).map(d=>({date:d,text:allData[d].goodThing}));
  const ECOLS=[C.red,C.orange,C.accent,C.green], ELABELS=["Sehr niedrig","Niedrig","Moderat","Hoch"];
  const WCOLS={"gym":C.green,"gym_light":C.green,"home_booty":C.accent,"home_core":C.orange,"pilates":C.purple,"rest":C.blue,null:C.faint};

  return (
    <div>
      <div style={CARD}>
        <Label c={C.purple}>📊 {mode==="week"?`Weekly · ${days.length} Tage`:`Monthly · ${days.length} Tage`}</Label>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px", marginBottom:"16px" }}>
          {[
            {l:"Energie Ø",v:avgE!==null?ELABELS[Math.round(avgE)]:"–",c:avgE!==null?ECOLS[Math.round(avgE)]:C.muted},
            {l:"Wasser Ø",v:avgW!==null?`${Math.round(avgW*250)}ml`:"–",c:C.blue},
            {l:"Routine-Tage",v:`${routineDays}/${days.length}`,c:C.green},
            {l:"Workout-Tage",v:`${workoutDays}/${days.length}`,c:C.accent},
          ].map((s,i)=>(
            <div key={i} style={{ background:s.c+"15", borderRadius:"12px", padding:"12px", border:`1px solid ${s.c}25` }}>
              <div style={{ fontSize:"16px", fontWeight:700, color:s.c }}>{s.v}</div>
              <div style={{ fontSize:"9.5px", color:C.muted, marginTop:"3px" }}>{s.l}</div>
            </div>
          ))}
        </div>
        {/* Energie Timeline */}
        <div style={{ fontSize:"9.5px", color:C.muted, textTransform:"uppercase", letterSpacing:"0.12em", marginBottom:"8px" }}>Energieverlauf</div>
        <div style={{ display:"flex", gap:"3px", alignItems:"flex-end", height:"48px", marginBottom:"14px" }}>
          {days.map(d=>{
            const e=allData[d]?.energyLevel;
            const hh=e!==undefined?((e+1)/5)*44:4;
            return <div key={d} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:"2px" }}>
              <div style={{ width:"100%", borderRadius:"3px", background:e!==undefined?ECOLS[e]:C.faint, height:`${hh}px`, minHeight:"3px", opacity:.8 }} />
              {days.length<=10&&<div style={{ fontSize:"8px", color:C.muted }}>{new Date(d).getDate()}.</div>}
            </div>;
          })}
        </div>
        {/* Workout Streak */}
        <div style={{ fontSize:"9.5px", color:C.muted, textTransform:"uppercase", letterSpacing:"0.12em", marginBottom:"8px" }}>Workout-Streak</div>
        <div style={{ display:"flex", gap:"4px", flexWrap:"wrap" }}>
          {days.map(d=>{
            const wt=allData[d]?.workoutType||null;
            const col=WCOLS[wt]||C.faint;
            return <div key={d} title={`${d}: ${wt||"–"}`} style={{ width:"22px", height:"22px", borderRadius:"5px", background:col, opacity:!wt?0.3:1 }} />;
          })}
        </div>
        <div style={{ display:"flex", gap:"8px", marginTop:"8px", flexWrap:"wrap" }}>
          {[{c:C.green,l:"Gym"},{c:C.accent,l:"Home Booty"},{c:C.orange,l:"Core"},{c:C.purple,l:"Pilates"},{c:C.blue,l:"Erholung"},{c:C.faint,l:"kein Eintrag"}].map((s,i)=>(
            <div key={i} style={{ display:"flex", gap:"5px", alignItems:"center" }}>
              <div style={{ width:"10px", height:"10px", borderRadius:"3px", background:s.c }} />
              <div style={{ fontSize:"9px", color:C.muted }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>
      {goodThings.length>0&&(
        <div style={CARD}>
          <Label c={C.green}>✨ Deine guten Momente</Label>
          {goodThings.map(({date,text})=>{
            const dd=new Date(date);
            return <div key={date} style={{ padding:"8px 0", borderBottom:`1px solid ${C.faint}` }}>
              <div style={{ fontSize:"9.5px", color:C.muted, marginBottom:"2px" }}>{dd.getDate()}. {M[dd.getMonth()]}</div>
              <div style={{ fontSize:"12.5px", color:C.text, lineHeight:1.5 }}>"{text}"</div>
            </div>;
          })}
        </div>
      )}
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
// CREATIVE INSPO — Wortneuschöpfung + Gedächtnis-Anker
// ══════════════════════════════════════════════════════════════════════════════
function CreativeInspo({ data, onChange }) {
  const [loading, setLoading] = useState(false);
  const [localInspo, setLocalInspo] = useState(null);

  const FALLBACKS = [
    {word:"Residualangst",       tagline:"Was bleibt nachdem die Gefahr längst weg ist",            memory:"Gab es einen Moment wo du gemerkt hast, dass du dich um etwas Altes immer noch sorgst — obwohl es vorbei war?",drawingIdea:"Zeichne eine Silhouette die einen Schatten wirft der größer ist als sie selbst."},
    {word:"Körpergedächtnis",    tagline:"Der Organismus weiß mehr als der Verstand",               memory:"Wann hat dein Körper eine Situation erkannt bevor dein Kopf es getan hat?",drawingIdea:"Skizziere eine Hand oder einen Fuß nur aus dem Gedächtnis — ohne hinzuschauen."},
    {word:"Kollateralfreude",    tagline:"Glück als Nebenprodukt von etwas anderem",                memory:"Wann ist dir etwas Schönes passiert das du überhaupt nicht geplant hattest?",drawingIdea:"Male etwas Kleines das du heute um dich hast — als wäre es das Wichtigste der Welt."},
    {word:"Schwellenmoment",     tagline:"Die Sekunde bevor alles anders wird",                     memory:"Erinnerst du dich an den genauen Moment wo du gewusst hast — das verändert jetzt etwas?",drawingIdea:"Zeichne eine Türschwelle oder einen Eingang — die Linie zwischen davor und danach."},
    {word:"Frequenzwechsel",     tagline:"Wenn man aufhört auf demselben Kanal zu senden",          memory:"Wann hast du aufgehört, jemandem erklären zu wollen wer du bist?",drawingIdea:"Skizziere zwei Räume nebeneinander: einer laut, einer still. Kein Text."},
    {word:"Kontrollverlust",     tagline:"Der Punkt wo Loslassen keine Wahl mehr ist",              memory:"Wann hat dich das Unkontrollierbare überrascht — und es wurde trotzdem gut?",drawingIdea:"Male etwas das kippt — kurz bevor es fällt."},
    {word:"Habitusbruch",        tagline:"Der Tag an dem du nicht mehr dieselbe Person warst",      memory:"Wann hast du das erste Mal etwas getan das sich falsch anfühlte — und es war trotzdem richtig?",drawingIdea:"Zeichne denselben Gegenstand zweimal: einmal wie er ist, einmal wie er sich anfühlt."},
    {word:"Schmerzgrenze",       tagline:"Was danach kommt ist unbekanntes Terrain",                memory:"Wo hast du eine Grenze von dir entdeckt — und was war auf der anderen Seite?",drawingIdea:"Skizziere eine Linie — und was auf beiden Seiten davon ist."},
    {word:"Resonanzfeld",        tagline:"Wenn jemand anderes in dir schwingt",                     memory:"Mit wem hast du dich ohne viele Worte vollständig verstanden gefühlt?",drawingIdea:"Male zwei Formen die sich nicht berühren aber sich anziehen."},
    {word:"Wahrnehmungslücke",   tagline:"Was wir sehen und was wirklich da ist",                   memory:"Wann hast du gemerkt, dass du jemanden oder etwas völlig falsch eingeschätzt hattest?",drawingIdea:"Zeichne ein Objekt aus deiner Wohnung — aber bewusst verzerrt."},
    {word:"Übergangsritual",     tagline:"Was wir tun um uns zu verabschieden",                    memory:"Wie hast du dich von etwas verabschiedet das du wirklich geliebt hast?",drawingIdea:"Skizziere eine leere Schachtel oder Tasche. Was war drin?"},
    {word:"Stressarchitektur",   tagline:"Wie Druck Strukturen formt",                             memory:"Wann hat ein schwieriger Zeitraum etwas in dir gebaut das heute noch trägt?",drawingIdea:"Male eine Struktur die Gewicht trägt — aber elegant aussieht."},
    {word:"Kindheitspräzedenz",  tagline:"Was früh passiert formt das Koordinatensystem",          memory:"Welcher Moment aus deiner Kindheit hat dich am stärksten geprägt — auch wenn du es erst später verstanden hast?",drawingIdea:"Zeichne etwas das du als Kind geliebt hast. Aus der Erinnerung."},
    {word:"Katharsisverzug",     tagline:"Wenn die Erleichterung zu spät kommt",                   memory:"Wann hast du erst im Nachhinein gemerkt wie viel dich etwas belastet hatte?",drawingIdea:"Skizziere ein Ventil oder eine Öffnung als abstrakte Form."},
    {word:"Systemvertrauen",     tagline:"Der Glaube dass Dinge sich irgendwie fügen",             memory:"Wann hast du blind vertraut — und es hat sich bewahrheitet?",drawingIdea:"Male einen Knoten der sich öffnet. Nur die Linien."},
    {word:"Identitätssediment",  tagline:"Wer du bist ist Schicht für Schicht abgelagert",         memory:"Welche Version von dir existiert noch irgendwo in einer Person die dich lange kennt?",drawingIdea:"Zeichne übereinanderliegende Schichten — wie transparentes Glas auf Glas."},
    {word:"Schweigekonsens",     tagline:"Was zwei Menschen wissen ohne es auszusprechen",          memory:"Mit wem hast du mal einen Moment geteilt bei dem ihr beide wusstet was er bedeutet — ohne ein Wort?",drawingIdea:"Skizziere zwei Figuren ohne Mund. Was kommunizieren sie trotzdem?"},
    {word:"Grenzwertigkeit",     tagline:"Das Minimum das noch zählt",                             memory:"Was war das Kleinste das jemand getan hat — und es hat trotzdem alles verändert?",drawingIdea:"Male den dünnsten möglichen Strich — und alles was er hält."},
    {word:"Spiegelversagen",     tagline:"Wenn Selbstwahrnehmung und Realität auseinanderlaufen",  memory:"Wann hat dir jemand etwas über dich gesagt das du nicht geglaubt hast — aber es stimmte?",drawingIdea:"Zeichne ein Portrait das leicht verschoben ist. Links und rechts nicht gleich."},
    {word:"Absenzkultur",        tagline:"Was durch Abwesenheit definiert wird",                   memory:"Was hat das Fehlen von etwas oder jemandem in dir gelassen?",drawingIdea:"Skizziere einen leeren Stuhl oder einen leeren Platz an einem Tisch."},
    {word:"Verarbeitungstiefe",  tagline:"Wie weit geht man wirklich rein",                        memory:"Wann hast du dir erlaubt etwas wirklich zu fühlen statt es wegzuschieben?",drawingIdea:"Male konzentrische Kreise — jeder etwas anders als der davor."},
    {word:"Kompetenzillusion",   tagline:"Der Moment vor dem Scheitern sieht immer sicher aus",    memory:"Wann warst du dir absolut sicher — und es kam trotzdem anders?",drawingIdea:"Zeichne etwas das sehr stabil aussieht aber auf einem Punkt balanciert."},
    {word:"Rückbauphase",        tagline:"Was abgerissen wird damit etwas Neues entsteht",         memory:"Was hast du bewusst beendet — und es war die richtige Entscheidung?",drawingIdea:"Skizziere etwas das halb abgerissen ist. Der Zustand des Dazwischen."},
    {word:"Loyalitätskonflikt",  tagline:"Wenn du nicht beiden gerecht werden kannst",             memory:"Wann musstest du dich entscheiden — und für wen oder was hast du dich entschieden?",drawingIdea:"Male eine Weggabelung — keine Schilder, keine Menschen."},
    {word:"Aufmerksamkeitsrest", tagline:"Was hängen bleibt ohne dass man es will",               memory:"Was beschäftigt dich noch obwohl du längst abgeschlossen haben solltest?",drawingIdea:"Zeichne etwas das du heute schon mehrmals gesehen hast ohne es zu merken."},
    {word:"Sicherheitsmythos",   tagline:"Kontrolle ist die schönste Lüge",                        memory:"Wann hast du losgelassen — und gemerkt dass es sicherer war als festzuhalten?",drawingIdea:"Skizziere eine geschlossene Faust — dann dieselbe Hand offen."},
    {word:"Codewechsel",         tagline:"Wer wir sind hängt davon ab mit wem wir sprechen",       memory:"In wessen Gegenwart bist du am ehesten du selbst?",drawingIdea:"Male zwei Versionen desselben Gesichts: eine nach außen, eine nach innen."},
    {word:"Erschöpfungsästhetik",tagline:"Müdigkeit hat eine eigene Schönheit",                    memory:"Wann warst du so erschöpft dass nichts mehr gespielt wurde — und was war da noch übrig?",drawingIdea:"Zeichne eine Kerze kurz bevor oder nachdem sie erloschen ist."},
    {word:"Nachklangeffekt",     tagline:"Wenn etwas weg ist aber noch wirkt",                     memory:"Was hat jemand gesagt der heute nicht mehr in deinem Leben ist — und du hörst es noch?",drawingIdea:"Skizziere eine Welle die immer kleiner wird. Der Nachhall."},
    {word:"Evidenzmangel",       tagline:"Was wir glauben ohne Beweis",                            memory:"Wann hast du etwas geglaubt das du nicht beweisen konntest — und trotzdem recht behalten?",drawingIdea:"Male etwas Unsichtbares — und gib ihm eine Form."},
  ];

  const fetchInspo = async (forceNew = false) => {
    setLoading(true);
    try {
      const today = new Date();
      const seed = today.getFullYear()*10000 + (today.getMonth()+1)*100 + today.getDate() + (forceNew ? Math.floor(Math.random()*1000) : 0);
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 400,
          messages: [{
            role: "user",
            content: `Du generierst täglich einen kreativen Zeichenbegriff für eine 29-jährige Frau (Carlotta). Sie zeichnet/malt 30 Min morgens beim Kaffee — zur Kreativitätsförderung und als Gedächtnistraining (ADS, Depression, Erinnerungslücken stärken). Seed: ${seed}.

AUFGABE: Erfinde ein KOMPOSITUM — ein neues deutsches Wort aus zwei bekannten Wörtern zusammengesetzt. Wie "Papierkrieg", "Sternenregen", "Herzarchiv", "Nebelbrücke". Es soll poetisch, mehrdeutig, visuell reichhaltig sein.

Dann:
1. REFLEXIONSFRAGE (key: "memory"): Eine konkrete Frage die einen positiven Erinnerungsmoment abruft. Kein "denk an jemanden" sondern ein spezifischer Moment: wann, wo, wie hat es sich angefühlt.
2. ZEICHENIDEE (key: "drawingIdea"): Eine einfache, konkrete Zeichenaufgabe die in 30 Min machbar ist — passend zum Wort und der Reflexion. Nicht "male das Gefühl" sondern etwas Greifbares: z.B. "Zeichne einen Raum der sich leer anfühlt aber nicht ist", "Male eine Hand die etwas loslässt", "Skizziere eine Tür die halb offen steht". Kurz, klar, umsetzbar. Kein Meisterwerk nötig.

Nur reines JSON, kein Markdown:
{"word":"Herzarchiv","tagline":"Was du nie wirklich vergisst","memory":"Wann warst du irgendwo und hast gemerkt — hier will ich bleiben?","drawingIdea":"Zeichne einen Ort der sich wie ankommen anfühlt. Nur die wichtigsten Linien."}`
          }]
        })
      });
      const d = await res.json();
      const text = d.content.filter(c=>c.type==="text").map(c=>c.text).join("");
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
      onChange("sketchInspo", parsed);
      setLocalInspo(parsed);
    } catch {
      const idx = Math.floor(Math.random() * FALLBACKS.length);
      onChange("sketchInspo", FALLBACKS[idx]);
      setLocalInspo(FALLBACKS[idx]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (data?.sketchInspo) {
      setLocalInspo(data.sketchInspo);
    } else {
      fetchInspo(false);
    }
  }, []);

  const inspo = localInspo || data?.sketchInspo;
  const done = data?.sketchDone;

  return (
    <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:"16px", padding:"20px", marginBottom:"10px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"14px" }}>
        <Label c={C.accent}>Kreativ · 30 Min</Label>
        <button onClick={() => fetchInspo(true)} disabled={loading} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:"20px", padding:"4px 12px", fontSize:"11px", color: loading ? C.faint : C.muted, cursor: loading ? "default" : "pointer", fontFamily:"inherit", transition:"all .2s", letterSpacing:"0.05em" }}>
          {loading ? "…" : "↻ anderes Wort"}
        </button>
      </div>

      {loading ? (
        <div style={{ fontSize:"11px", color:C.muted, letterSpacing:"0.1em", padding:"20px 0", textAlign:"center" }}>generiert…</div>
      ) : inspo ? (
        <>
          <div style={{ padding:"8px 0 16px" }}>
            <div style={{ fontFamily:"'DM Serif Display', serif", fontSize:"30px", color:C.text, marginBottom:"5px", letterSpacing:"-0.3px" }}>
              {inspo.word}
            </div>
            <div style={{ fontSize:"11.5px", color:C.muted, fontStyle:"italic", lineHeight:1.5 }}>{inspo.tagline}</div>
          </div>

          {/* Reflexionsfrage */}
          <div style={{ borderLeft:`2px solid ${C.accent}`, paddingLeft:"14px", marginBottom:"16px" }}>
            <div style={{ fontSize:"9px", color:C.accent, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.16em", marginBottom:"8px" }}>Reflexion</div>
            <div style={{ fontSize:"13px", color:C.text, lineHeight:1.8 }}>
              {inspo.memory || (inspo.memories||[])[0] || "Wann hast du jemandem blind vertraut — und es hat sich bewahrheitet?"}
            </div>
          </div>

          {/* Zeichenidee */}
          <div style={{ borderLeft:`2px solid ${C.border}`, paddingLeft:"14px", marginBottom:"16px" }}>
            <div style={{ fontSize:"9px", color:C.muted, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.16em", marginBottom:"8px" }}>Zeichenidee · 30 Min</div>
            <div style={{ fontSize:"13px", color:C.text, lineHeight:1.8 }}>
              {inspo.drawingIdea || "Male das erste Bild das dir dazu einfällt — ohne nachzudenken. Stift auf Papier, fertig."}
            </div>
          </div>

          <div style={{ fontSize:"10px", color:C.muted, marginBottom:"14px", lineHeight:1.6, letterSpacing:"0.02em" }}>
            Kein Meisterwerk. Kein Können nötig. Das Ergebnis gehört nur dir.
          </div>

          <div onClick={() => onChange("sketchDone", !done)} style={{ display:"flex", gap:"10px", alignItems:"center", padding:"9px 12px", background:done?C.accentBg:"transparent", borderRadius:"8px", cursor:"pointer", border:`1px solid ${done?C.accentBorder:C.border}`, transition:"all .2s" }}>
            <div style={{ width:"16px", height:"16px", borderRadius:"4px", flexShrink:0, border:`1.5px solid ${done?C.accent:C.border}`, background:done?C.accent:"transparent", display:"flex", alignItems:"center", justifyContent:"center" }}>
              {done && <span style={{ color:"#000", fontSize:"9px", fontWeight:900 }}>✓</span>}
            </div>
            <div style={{ fontSize:"12.5px", color:done?C.accent:C.muted, fontWeight:done?600:400 }}>
              {done ? `Gezeichnet — ${inspo.word}` : "Heute gezeichnet?"}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
// PERSONALISIERTES TAGES-BRIEFING — Herzstück der Tagesplanung
// ══════════════════════════════════════════════════════════════════════════════
function DayBriefing({ cycle, energyLevel, adsLevel, whoopData, workoutType, calEvents }) {
  const w = whoopData || {};
  const rec = parseInt(w.recovery) || 50;
  const sleepScore = parseInt(w.sleepScore) || 0;
  const hrv = parseInt(w.hrv) || 0;

  // ── Energie-Status ──────────────────────────────────────────────────────────
  const energyLabel = ["Sehr niedrig (0–25%)", "Niedrig (25–50%)", "Moderat (50–75%)", "Hoch (75–100%)"];
  const el = energyLevel ?? 2;

  // ── Energie-Leckstellen & Wiederherstellung (ADS-spezifisch) ───────────────
  const ENERGY_LEAKS = [
    "Entscheidungsfatigue: Zu viele kleine Entscheidungen morgens (was anziehen, was essen) verbrauchen bereits Kapazität.",
    "Task-Switching: Jeder Aufgabenwechsel kostet ADS-Gehirne mehr als neurotypische — 15–20 Min Recovery pro Switch.",
    "Unstrukturierte Zeit: Ohne klaren Rahmen läuft das ADS-Gehirn auf Hochtouren ohne Ergebnis.",
    "Soziale Energie: Small Talk und oberflächliche Interaktionen können überraschend viel kosten.",
    "Bildschirmzeit morgens: Früher Social-Media-Konsum aktiviert Dopamin-Erschöpfung noch vor dem Mittag.",
  ];

  // ── ADS-basiertes Energiemanagement ────────────────────────────────────────
  const ADS_STRATEGIES = {
    0: { // Ruhig
      label: "Ruhiger Tag — guter Zeitpunkt für anspruchsvollere Aufgaben",
      tips: [
        "Deep Work Fenster: Heute 1–2 Stunden ungestörte Arbeit nutzen — dein Fokus ist verfügbar.",
        "Entscheidungen vorbereiten: Wenn du heute klar bist, triff Entscheidungen die du an schlechten Tagen aufschiebst.",
        "Bewegung einplanen: Nutze die Energie für Workout — das stabilisiert auch morgen.",
      ]
    },
    1: { // Moderat
      label: "Moderate ADS-Aktivierung — strukturiert durch den Tag",
      tips: [
        "Pomodoro 25/5: 25 Min fokussiert, 5 Min Pause — Timer hilft dem ADS-Gehirn den Überblick zu behalten.",
        "Eine Aufgabe zu Ende, dann die nächste: Kein Multitasking, auch wenn es sich verlockend anfühlt.",
        "Mittags 10 Min Pause ohne Bildschirm: Kurzer Reset verhindert den Nachmittags-Crash.",
      ]
    },
    2: { // Hibbelig
      label: "Hohe ADS-Aktivierung — Energie dosieren ist heute die Hauptaufgabe",
      tips: [
        "Schwerste Aufgabe JETZT: In den ersten 2 Stunden nach dem Aufwachen ist dein Dopamin noch frisch — nutze das für die wichtigste To-Do.",
        "Bewegungspausen einplanen: Alle 45 Min kurz aufstehen, Stretching oder 5 Min Spaziergang — reguliert das Nervensystem.",
        "Kein Rabbit-Hole: Wenn du merkst du scrollst, recherchierst oder 'kurz was nachschaust' — Timer auf 5 Min setzen.",
        "Nach 14 Uhr: Tempo bewusst reduzieren, keine neuen Großprojekte starten.",
      ]
    },
    3: { // Sehr hoch
      label: "Sehr hohe ADS-Aktivierung — heute Schaden begrenzen",
      tips: [
        "Nur 1 Priorität: Schreib heute Morgen einen Satz: 'Heute ist es ein Erfolg wenn ich ___ erledigt habe.' Mehr nicht.",
        "Alle 60 Min Pflicht-Pause: 10 Min ohne Bildschirm, Fenster auf, Atemübung oder Tee kochen.",
        "Entscheidungen minimieren: Iss was du gestern geplant hast. Zieh an was bereit liegt. Spar kognitive Kapazität.",
        "Abends früh runterfahren: 21 Uhr kein Input mehr — Musik, Skizzieren, nichts Stimulierendes.",
      ]
    }
  };

  // ── Recovery-Micro-Rituale (ADHS-geeignet, <10 Min) ────────────────────────
  const MICRO_RITUALS = [
    "4-7-8 Atemübung: 4 Sek einatmen, 7 Sek halten, 8 Sek ausatmen. 3 Runden. Aktiviert Parasympathikus.",
    "Cold Splash: Kurz kaltes Wasser ins Gesicht — sofortiger Cortisol-Reset.",
    "2-Min Body Scan: Augen zu, von Kopf bis Fuß scannen — wo ist Spannung? Loslassen.",
    "Fenster auf, 5 tiefe Atemzüge: CO₂ raus, frisches O₂ rein — direkt messbar im Fokus.",
    "Kurz raus: 5–10 Min Spaziergang ohne Ziel und ohne Handy. Optischer Fluss beruhigt das Nervensystem.",
  ];

  const ads = adsLevel ?? 1;
  const strategy = ADS_STRATEGIES[ads];

  // ── Koffein-Timing ──────────────────────────────────────────────────────────
  const coffeeTime = sleepScore > 0 && sleepScore < 45 ? "Schlaf war schwach — Koffein erst ab 10 Uhr, max. bis 13 Uhr. Kein zweiter Kaffee nach 14 Uhr." :
                     rec < 34    ? "Recovery niedrig — Koffein max. bis 13 Uhr." :
                     sleepScore >= 70 ? "Guter Schlaf — Koffein-Fenster 09:00–13:00 Uhr optimal." :
                                   "Koffein-Fenster: 09:00–13:00 Uhr.";

  if (energyLevel === undefined && adsLevel === undefined && !w.recovery) return null;

  return (
    <div style={CARD}>
      <Label c={C.accent}>Tages-Briefing</Label>

      {/* Status-Zeile */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"6px", marginBottom:"16px" }}>
        {[
          {l:"Energie", v: energyLevel !== undefined ? ["0–25%","25–50%","50–75%","75–100%"][el] : "–", c:[C.red,C.orange,C.accent,C.green][el]??C.muted},
          {l:"Recovery", v: w.recovery ? w.recovery+"%" : "–", c: rec>=67?C.green:rec>=34?C.orange:C.red},
          {l:"Schlafqualität", v: w.sleepScore ? w.sleepScore+"%" : "–", c: sleepScore>=70?C.green:sleepScore>=45?C.orange:C.red},
        ].map((s,i)=>(
          <div key={i} style={{ background:s.c+"15", borderRadius:"10px", padding:"8px", textAlign:"center", border:`1px solid ${s.c}25` }}>
            <div style={{ fontSize:"13px", fontWeight:700, color:s.c }}>{s.v}</div>
            <div style={{ fontSize:"9px", color:C.muted, marginTop:"2px" }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* ADS-Strategie */}
      {adsLevel !== undefined && (
        <div style={{ marginBottom:"16px" }}>
          <div style={{ fontSize:"9px", color:C.accent, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.16em", marginBottom:"8px" }}>
            Energiestrategie heute
          </div>
          <div style={{ fontSize:"12px", color:C.text, marginBottom:"10px", lineHeight:1.6 }}>
            {strategy.label}
          </div>
          {strategy.tips.map((tip,i)=>(
            <div key={i} style={{ display:"flex", gap:"10px", padding:"6px 0", borderBottom:i<strategy.tips.length-1?`1px solid ${C.faint}`:"none" }}>
              <div style={{ width:"4px", height:"4px", borderRadius:"50%", background:C.accent, flexShrink:0, marginTop:"8px" }} />
              <div style={{ fontSize:"12px", color:C.text, lineHeight:1.65 }}>{tip}</div>
            </div>
          ))}
        </div>
      )}

      {/* Koffein-Timing */}
      <div style={{ borderLeft:`2px solid ${C.border}`, paddingLeft:"12px", marginBottom:"16px" }}>
        <div style={{ fontSize:"9px", color:C.muted, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.14em", marginBottom:"5px" }}>Koffein</div>
        <div style={{ fontSize:"12px", color:C.text, lineHeight:1.6 }}>{coffeeTime}</div>
      </div>

      {/* Energie-Leckstellen */}
      {ads >= 2 && (
        <div style={{ marginBottom:"16px" }}>
          <div style={{ fontSize:"9px", color:C.muted, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.14em", marginBottom:"8px" }}>Wo Energie verloren geht — heute besonders beachten</div>
          {ENERGY_LEAKS.slice(0,3).map((l,i)=>(
            <div key={i} style={{ fontSize:"11.5px", color:C.muted, lineHeight:1.65, padding:"4px 0", borderBottom:i<2?`1px solid ${C.faint}`:"none" }}>{l}</div>
          ))}
        </div>
      )}

      {/* Micro-Rituale */}
      <div>
        <div style={{ fontSize:"9px", color:C.muted, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.14em", marginBottom:"8px" }}>Energie wiederherstellen — wähle eines</div>
        {MICRO_RITUALS.slice(0, ads>=2 ? 4 : 2).map((r,i)=>(
          <div key={i} style={{ fontSize:"11.5px", color:C.text, lineHeight:1.65, padding:"5px 0", borderBottom:i<(ads>=2?3:1)?`1px solid ${C.faint}`:"none" }}>{r}</div>
        ))}
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
// TASK ANALYZER — Hauptaufgabe analysieren & einplanen
// ══════════════════════════════════════════════════════════════════════════════
function TaskAnalyzer({ data, onChange, energyLevel, adsLevel, cycle, workoutType }) {
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState(data?.taskInput || "");
  const [localAnalysis, setLocalAnalysis] = useState(data?.taskAnalysis || null);
  const [localTaskInput, setLocalTaskInput] = useState(data?.taskInput || "");

  const analyze = async () => {
    if (!draft.trim()) return;
    setLoading(true);
    onChange("taskInput", draft);
    setLocalTaskInput(draft);

    const el = energyLevel ?? 2;
    const ads = adsLevel ?? 1;
    const elLabel = ["sehr niedrig (0–25%)", "niedrig (25–50%)", "moderat (50–75%)", "hoch (75–100%)"][el];
    const adsLabel = ["ruhig", "moderat", "hibbelig", "sehr hoch"][ads];
    const hasWorkout = workoutType !== "rest";

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 800,
          messages: [{
            role: "user",
            content: `Du bist persönlicher Assistent von Carlotta (29, Hamburg, ADS/ADHS, Depression, Genesungsphase nach Klinik-Aufenthalt). Sie plant ihren Tag mit einem Daily Briefing.

Ihre Aufgabe heute: "${draft}"

Kontext:
- Energielevel: ${elLabel}
- ADS heute: ${adsLabel}
- Zyklusphase: ${cycle.phase} (Tag ${cycle.day})
- Training heute: ${hasWorkout ? workoutType : "kein Training"}
- Genesungszeit: krankgeschrieben bis 24.03.2026

Analysiere die Aufgabe und gib ihr eine strukturierte Einplanung. Berücksichtige ADS-Besonderheiten (kurze Fokuseinheiten, klare Schritte, Pausen). Antworte nur als reines JSON:

{
  "bestTime": "Wann heute ist der beste Zeitpunkt (konkret, z.B. '09:00–10:30 Uhr')",
  "duration": "Realistischer Zeitaufwand (z.B. '45–60 Min')",
  "why": "1 Satz warum dieser Zeitpunkt gut passt — basierend auf Energie & ADS-Level",
  "steps": ["Schritt 1 (max 8 Wörter)", "Schritt 2", "Schritt 3"],
  "adsTip": "1 konkreter ADS-Tipp speziell für diese Aufgabe (z.B. Timer, Ort, Ablenkungen)",
  "watchOut": "1 typische Falle bei dieser Aufgabe für ADS-Gehirne",
  "quickStart": "Der allererste Mini-Schritt — so klein dass er in 2 Min erledigt ist"
}`
          }]
        })
      });
      const d = await res.json();
      const text = d.content.filter(c => c.type === "text").map(c => c.text).join("");
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      onChange("taskAnalysis", parsed);
      setLocalAnalysis(parsed);
    } catch {
      const fallback = {
        bestTime: "So frueh wie moeglich - innerhalb der ersten 2 Stunden",
        duration: "ca. 30-60 Min",
        why: "Morgens ist die kognitive Kapazitaet am groessten.",
        steps: ["Aufgabe in 3 Teilschritte aufteilen", "Ersten Schritt direkt beginnen", "Nach jedem Schritt kurze Pause"],
        adsTip: "Timer auf 25 Min stellen bevor du anfaengst - Pomodoro-Prinzip.",
        watchOut: "Nicht zu lange planen - direkt starten verhindert Prokrastination.",
        quickStart: "Aufgabe laut aussprechen und ersten Schritt benennen."
      };
      onChange("taskAnalysis", fallback);
      setLocalAnalysis(fallback);
    }
    setLoading(false);
  };

  const analysis = localAnalysis;
  const taskInput = localTaskInput;

  return (
    <div style={CARD}>
      <Label c={C.accent}>Hauptaufgabe heute</Label>

      {/* Input */}
      <div style={{ display:"flex", gap:"8px", marginBottom: analysis ? "16px" : "0" }}>
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === "Enter" && analyze()}
          placeholder="Was ist deine wichtigste Aufgabe heute?"
          style={{ ...INP, flex:1 }}
        />
        <button
          onClick={analyze}
          disabled={loading || !draft.trim()}
          style={{ padding:"9px 14px", borderRadius:"10px", background: draft.trim() ? C.accentBg : "transparent", border:`1px solid ${draft.trim() ? C.accentBorder : C.border}`, color: draft.trim() ? C.accent : C.muted, cursor: draft.trim() ? "pointer" : "default", fontFamily:"inherit", fontWeight:600, fontSize:"12px", whiteSpace:"nowrap", transition:"all .2s" }}>
          {loading ? "…" : "Analysieren"}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ padding:"20px 0", textAlign:"center" }}>
          <div style={{ fontSize:"11px", color:C.muted, letterSpacing:"0.1em" }}>analysiert…</div>
          <div style={{ height:"2px", background:C.faint, borderRadius:"1px", marginTop:"12px", overflow:"hidden" }}>
            <div style={{ height:"100%", width:"60%", background:C.accent, borderRadius:"1px", animation:"none", opacity:0.6 }} />
          </div>
        </div>
      )}

      {/* Result */}
      {!loading && analysis && taskInput && (
        <div>
          {/* Aufgabe + Timing Header */}
          <div style={{ background:C.accentBg, border:`1px solid ${C.accentBorder}`, borderRadius:"12px", padding:"13px 15px", marginBottom:"14px" }}>
            <div style={{ fontSize:"9px", color:C.accent, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.16em", marginBottom:"6px" }}>Einplanung</div>
            <div style={{ fontSize:"13px", fontWeight:600, color:C.text, marginBottom:"4px" }}>{taskInput}</div>
            <div style={{ display:"flex", gap:"12px", marginTop:"8px" }}>
              <div>
                <div style={{ fontSize:"9px", color:C.muted, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:"3px" }}>Wann</div>
                <div style={{ fontSize:"12.5px", color:C.accent, fontWeight:600 }}>{analysis.bestTime}</div>
              </div>
              <div style={{ width:"1px", background:C.border }} />
              <div>
                <div style={{ fontSize:"9px", color:C.muted, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:"3px" }}>Dauer</div>
                <div style={{ fontSize:"12.5px", color:C.accent, fontWeight:600 }}>{analysis.duration}</div>
              </div>
            </div>
            <div style={{ fontSize:"11.5px", color:C.muted, marginTop:"8px", fontStyle:"italic", lineHeight:1.6 }}>{analysis.why}</div>
          </div>

          {/* Quick Start */}
          <div style={{ borderLeft:`2px solid ${C.green}`, paddingLeft:"12px", marginBottom:"14px" }}>
            <div style={{ fontSize:"9px", color:C.green, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.14em", marginBottom:"5px" }}>Erster Schritt — jetzt sofort</div>
            <div style={{ fontSize:"13px", color:C.text, lineHeight:1.6 }}>{analysis.quickStart}</div>
          </div>

          {/* Schritte */}
          {analysis.steps?.length > 0 && (
            <div style={{ marginBottom:"14px" }}>
              <div style={{ fontSize:"9px", color:C.muted, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.14em", marginBottom:"8px" }}>Ablauf</div>
              {analysis.steps.map((s, i) => (
                <div key={i} style={{ display:"flex", gap:"10px", padding:"6px 0", borderBottom:i<analysis.steps.length-1?`1px solid ${C.faint}`:"none", alignItems:"flex-start" }}>
                  <div style={{ width:"18px", height:"18px", borderRadius:"50%", background:C.faint, border:`1px solid ${C.border}`, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"9px", color:C.muted, fontWeight:700 }}>{i+1}</div>
                  <div style={{ fontSize:"12.5px", color:C.text, lineHeight:1.6, paddingTop:"1px" }}>{s}</div>
                </div>
              ))}
            </div>
          )}

          {/* ADS Tipp + Watchout */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px" }}>
            <div style={{ background:C.greenBg, border:`1px solid ${C.greenBorder}`, borderRadius:"10px", padding:"10px 12px" }}>
              <div style={{ fontSize:"9px", color:C.green, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:"5px" }}>ADS-Tipp</div>
              <div style={{ fontSize:"11.5px", color:C.text, lineHeight:1.6 }}>{analysis.adsTip}</div>
            </div>
            <div style={{ background:C.redBg, border:`1px solid ${C.redBorder}`, borderRadius:"10px", padding:"10px 12px" }}>
              <div style={{ fontSize:"9px", color:C.red, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:"5px" }}>Achtung</div>
              <div style={{ fontSize:"11.5px", color:C.text, lineHeight:1.6 }}>{analysis.watchOut}</div>
            </div>
          </div>

          {/* Neue Aufgabe */}
          <button onClick={() => { onChange("taskAnalysis", null); onChange("taskInput", ""); setLocalAnalysis(null); setLocalTaskInput(""); setDraft(""); }}
            style={{ width:"100%", marginTop:"12px", padding:"8px", background:"transparent", border:`1px solid ${C.border}`, borderRadius:"8px", color:C.muted, fontSize:"11px", cursor:"pointer", fontFamily:"inherit", letterSpacing:"0.05em" }}>
            andere Aufgabe eingeben
          </button>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const cycle = getCycle();
  const [tab, setTab]           = useState("morning");
  const [reviewMode, setReview] = useState("week");
  const [glassMl, setGlassMl]   = useState(250);
  const [showGlass, setShowGlass] = useState(false);
  const [intention, setInt]     = useState("Consistency over Perfection");
  const [editInt, setEditInt]   = useState(false);
  const [intDraft, setIntDraft] = useState("");
  const [allData, setAllData]   = useState({});
  const [cryptoData, setCrypto] = useState(null);
  const [loadingC, setLoadingC] = useState(false);
  const [ready, setReady]       = useState(false);
  const [workoutOverride, setWorkoutOverride] = useState(null);

  const key   = dayKey();
  const today = allData[key]||{};

  useEffect(()=>{
    (async()=>{
      try {
        // Heutigen Tag laden
        const t = dayKey();
        const dayData = await loadDay(t);
        if (dayData) {
          setAllData(prev => ({...prev, [t]: dayData}));
          if (dayData._intention) setInt(dayData._intention);
          if (dayData._glassMl) setGlassMl(Number(dayData._glassMl));
        }
        // Letzte 30 Tage für Review
        const history = await loadLastDays(30);
        const mapped = {};
        history.forEach(({ date, payload }) => { if(payload) mapped[date] = payload; });
        setAllData(mapped);
        if (mapped[t]?._intention) setInt(mapped[t]._intention);
        if (mapped[t]?._glassMl) setGlassMl(Number(mapped[t]._glassMl));
      } catch(e) { console.error("Load error:", e); }
      setReady(true);
    })();
  },[]);

  const updateToday = useCallback(async (field,value)=>{
    const updated={...allData,[key]:{...(allData[key]||{}),[field]:value}};
    setAllData(updated);
    // Debounced save to Supabase
    const payload = {...updated[key], _intention: intention, _glassMl: glassMl};
    saveDayDebounced(key, payload);
  },[allData,key,intention,glassMl]);

  const saveInt  = async v=>{
    setInt(v);
    const payload = {...(allData[key]||{}), _intention: v, _glassMl: glassMl};
    saveDayDebounced(key, payload);
  };
  const saveGlass= async v=>{
    setGlassMl(v);
    const payload = {...(allData[key]||{}), _intention: intention, _glassMl: v};
    saveDayDebounced(key, payload);
  };

  // ── SYNC STATUS ───────────────────────────────────────────────────────────
  const [showDataPanel, setShowDataPanel] = useState(false);
  const [syncStatus, setSyncStatus] = useState("saved"); // saved | saving | error
  const [importText, setImportText] = useState("");
  const [importStatus, setImportStatus] = useState(null);

  const exportData = () => {
    const bundle = { allData, intention, glassMl, exportedAt: new Date().toISOString() };
    return JSON.stringify(bundle, null, 2);
  };

  const handleImport = async () => {
    try {
      const parsed = JSON.parse(importText.trim());
      if (parsed.allData) {
        // Import alte Daten nach Supabase
        for (const [date, payload] of Object.entries(parsed.allData)) {
          await saveDay(date, payload);
        }
        const merged = { ...parsed.allData, ...allData };
        setAllData(merged);
      }
      setImportStatus("ok");
      setTimeout(() => { setImportStatus(null); setImportText(""); setShowDataPanel(false); }, 2000);
    } catch {
      setImportStatus("error");
      setTimeout(() => setImportStatus(null), 3000);
    }
  };

  const storedDays = Object.keys(allData).filter(k=>k.startsWith("202")).sort();

  // Last 3 workout types from history
  const lastWorkouts = Object.keys(allData).sort().slice(-3).map(d=>allData[d]?.workoutType||null);

  // Workout recommendation
  const workoutRec = getWorkoutRec({
    cyclePhase:       cycle.phase,
    energyLevel:      today.energyLevel,
    whoopRecovery:    parseInt(today?.whoop?.recovery)||50,
    hasPilatesBooked: false, // would come from calendar in future
    hasGymBooked:     false,
    lastWorkouts,
    isSickLeave:      new Date() < SICK_END,
  });
  const workoutType = workoutOverride || workoutRec.type;

  const handleWorkoutOverride = (type)=>{
    setWorkoutOverride(type);
    updateToday("workoutType", type);
  };

  // Mark workout done
  useEffect(()=>{ if(workoutType) updateToday("workoutType",workoutType); },[workoutType]);

  const fetchCrypto = async()=>{
    setLoadingC(true);
    try {
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:700,tools:[{type:"web_search_20250305",name:"web_search"}],messages:[{role:"user",content:`Aktuelle Preise: ETH, VPAY (VPay by Virtuals Base-Chain), TIBBIR (Ribbita by Virtuals). USDC=$1.00. Holdings: 0.0941 ETH · 9611.45635 VPAY · 8.4731 USDC · 50.89285 TIBBIR. Gestern $219.13. Nur reines JSON: {"ETH":{"price":"$X","change":"+X%","trend":"up","holding":"0.0941 ETH","value":"$X"},"VPAY":{"price":"$X","change":"X%","trend":"up","holding":"9611 VPAY","value":"$X"},"USDC":{"price":"$1.00","change":"0%","trend":"stable","holding":"8.47 USDC","value":"$8.47"},"TIBBIR":{"price":"$X","change":"X%","trend":"up","holding":"50.89 TIBBIR","value":"$X"},"totalValue":"$X","totalChange":"+$X","summary":"1 Satz Deutsch"}`}]})});
      const d=await res.json();
      const text=d.content.filter(c=>c.type==="text").map(c=>c.text).join("");
      setCrypto(JSON.parse(text.replace(/```json|```/g,"").trim()));
    } catch {
      setCrypto({totalValue:"~$219",totalChange:"–",ETH:{holding:"0.0941 ETH",value:"–",change:"–",trend:"up"},VPAY:{holding:"9611 VPAY",value:"–",change:"–",trend:"up"},USDC:{holding:"8.47 USDC",value:"$8.47",change:"0%",trend:"stable"},TIBBIR:{holding:"50.89 TIBBIR",value:"–",change:"–",trend:"up"},summary:"Kurse nicht verfügbar."});
    }
    setLoadingC(false);
  };

  if(!ready) return <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center" }}><div style={{ color:C.muted, fontFamily:"'DM Sans', sans-serif", fontSize:"13px" }}>Lädt…</div></div>;

  return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text, fontFamily:"'DM Sans', -apple-system, sans-serif", maxWidth:"480px", margin:"0 auto" }}>
      <link href={FONT} rel="stylesheet" />

      <Header cycle={cycle} intention={intention} onTapInt={()=>{ setEditInt(true); setIntDraft(intention); }} />

      {/* Overlays */}
      {editInt&&(
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.78)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100, padding:"24px" }}>
          <div style={{ background:"#1a1918", borderRadius:"18px", padding:"24px", width:"100%", maxWidth:"400px", border:`1px solid ${C.border}` }}>
            <div style={{ fontSize:"11px", color:C.accent, fontWeight:600, marginBottom:"12px", textTransform:"uppercase", letterSpacing:"0.12em" }}>Wöchentliche Intention</div>
            <input value={intDraft} onChange={e=>setIntDraft(e.target.value)} style={{ ...INP, fontFamily:"'DM Serif Display', serif", fontSize:"16px", padding:"12px 14px" }} />
            <div style={{ display:"flex", gap:"8px", marginTop:"14px" }}>
              <button onClick={()=>setEditInt(false)} style={{ flex:1, padding:"11px", background:"transparent", border:`1px solid ${C.border}`, borderRadius:"10px", color:C.muted, cursor:"pointer", fontFamily:"inherit" }}>Abbrechen</button>
              <button onClick={()=>{ saveInt(intDraft); setEditInt(false); }} style={{ flex:2, padding:"11px", background:C.accentBg, border:`1px solid ${C.accentBorder}`, borderRadius:"10px", color:C.accent, cursor:"pointer", fontWeight:600, fontFamily:"inherit" }}>Speichern</button>
            </div>
          </div>
        </div>
      )}
      {showGlass&&(
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.78)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100, padding:"24px" }}>
          <div style={{ background:"#1a1918", borderRadius:"18px", padding:"24px", width:"100%", maxWidth:"360px", border:`1px solid ${C.border}` }}>
            <div style={{ fontSize:"11px", color:C.blue, fontWeight:600, marginBottom:"4px", textTransform:"uppercase", letterSpacing:"0.12em" }}>💧 Glasgröße</div>
            <div style={{ fontSize:"12px", color:C.muted, marginBottom:"14px" }}>Miss dein Glas aus und trage die ml ein.</div>
            <input type="number" value={glassMl} onChange={e=>setGlassMl(parseInt(e.target.value)||250)} style={{ ...INP, fontSize:"22px", textAlign:"center", fontWeight:700, padding:"12px" }} />
            <div style={{ fontSize:"11px", color:C.muted, marginTop:"4px", marginBottom:"14px", textAlign:"center" }}>Milliliter pro Glas</div>
            <div style={{ display:"flex", gap:"8px" }}>
              <button onClick={()=>setShowGlass(false)} style={{ flex:1, padding:"11px", background:"transparent", border:`1px solid ${C.border}`, borderRadius:"10px", color:C.muted, cursor:"pointer", fontFamily:"inherit" }}>Abbrechen</button>
              <button onClick={()=>{ saveGlass(glassMl); setShowGlass(false); }} style={{ flex:2, padding:"11px", background:C.blueBg, border:`1px solid rgba(93,173,226,0.3)`, borderRadius:"10px", color:C.blue, cursor:"pointer", fontWeight:600, fontFamily:"inherit" }}>Speichern</button>
            </div>
          </div>
        </div>
      )}

      {/* DATA PANEL OVERLAY */}
      {showDataPanel&&(
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.82)", display:"flex", alignItems:"flex-end", justifyContent:"center", zIndex:100, padding:"0" }}>
          <div style={{ background:"#1a1918", borderRadius:"20px 20px 0 0", padding:"24px", width:"100%", maxWidth:"480px", border:`1px solid ${C.border}`, maxHeight:"85vh", overflowY:"auto" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"16px" }}>
              <div style={{ fontSize:"14px", fontWeight:600, color:C.text }}>Datenverwaltung</div>
              <button onClick={()=>setShowDataPanel(false)} style={{ background:"none", border:"none", color:C.muted, fontSize:"20px", cursor:"pointer" }}>×</button>
            </div>

            {/* Status */}
            <div style={{ background:C.greenBg, border:`1px solid ${C.greenBorder}`, borderRadius:"12px", padding:"12px 14px", marginBottom:"16px" }}>
              <div style={{ fontSize:"11px", color:C.green, fontWeight:600, marginBottom:"4px" }}>💾 Lokal gespeichert</div>
              <div style={{ fontSize:"12px", color:C.text }}>{storedDays.length} Tage · von {storedDays[0]||"–"} bis {storedDays[storedDays.length-1]||"–"}</div>
              <div style={{ fontSize:"11px", color:C.muted, marginTop:"4px" }}>Daten bleiben auf diesem Gerät solange das Artifact geöffnet bleibt. Export sichert sie dauerhaft.</div>
            </div>

            {/* Export */}
            <div style={{ marginBottom:"16px" }}>
              <div style={{ fontSize:"11px", color:C.muted, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:"8px" }}>📤 Exportieren & sichern</div>
              <textarea readOnly value={exportData()} style={{ ...INP, resize:"none", height:"80px", fontSize:"10px", fontFamily:"monospace", opacity:0.7 }} />
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px", marginTop:"8px" }}>
                <button onClick={()=>{ try{navigator.clipboard.writeText(exportData());}catch{} }} style={{ padding:"10px", borderRadius:"10px", background:C.accentBg, border:`1px solid ${C.accentBorder}`, color:C.accent, cursor:"pointer", fontSize:"12px", fontFamily:"inherit", fontWeight:600 }}>📋 Kopieren</button>
                <button onClick={()=>{
                  const blob = new Blob([exportData()], {type:"text/plain"});
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a"); a.href=url; a.download=`briefing-backup-${dayKey()}.json`; a.click();
                  URL.revokeObjectURL(url);
                }} style={{ padding:"10px", borderRadius:"10px", background:C.blueBg, border:`1px solid rgba(93,173,226,0.3)`, color:C.blue, cursor:"pointer", fontSize:"12px", fontFamily:"inherit", fontWeight:600 }}>⬇️ Download</button>
              </div>
              <div style={{ fontSize:"10.5px", color:C.muted, marginTop:"8px", fontStyle:"italic" }}>💡 Tipp: Speichere den Export in deinen iPhone-Notizen oder iCloud — dann hast du ihn immer.</div>
            </div>

            {/* Import */}
            <div>
              <div style={{ fontSize:"11px", color:C.muted, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:"8px" }}>📥 Importieren (neues Gerät / Wiederherstellung)</div>
              <textarea value={importText} onChange={e=>setImportText(e.target.value)} placeholder="Backup hier einfügen…" style={{ ...INP, resize:"none", height:"70px", fontSize:"11px", fontFamily:"monospace" }} />
              <button onClick={handleImport} style={{ width:"100%", padding:"11px", borderRadius:"10px", background: importStatus==="ok"?C.greenBg : importStatus==="error"?C.redBg : C.faint, border:`1px solid ${importStatus==="ok"?C.greenBorder:importStatus==="error"?C.redBorder:C.border}`, color: importStatus==="ok"?C.green:importStatus==="error"?C.red:C.muted, cursor:"pointer", fontFamily:"inherit", fontWeight:600, fontSize:"12.5px", marginTop:"8px", transition:"all .3s" }}>
                {importStatus==="ok" ? "✓ Importiert!" : importStatus==="error" ? "✗ Fehler — gültiges JSON?" : "Importieren & zusammenführen"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TABS */}
      <div style={{ padding:"0 20px 14px" }}>
        <div style={{ display:"flex", gap:"6px", overflowX:"auto", paddingBottom:"8px" }}>
          {[{id:"morning",l:"☀️ Morgen"},{id:"evening",l:"🌙 Abend"},{id:"review",l:"📊 Review"}].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{ padding:"8px 16px", borderRadius:"20px", fontSize:"12.5px", fontWeight:500, border:`1px solid ${tab===t.id?C.accent:C.border}`, background:tab===t.id?C.accentBg:"transparent", color:tab===t.id?C.accent:C.muted, cursor:"pointer", whiteSpace:"nowrap", fontFamily:"inherit", transition:"all .2s" }}>{t.l}</button>
          ))}
          {tab==="morning"&&<Pill label={`Glas: ${glassMl}ml`} active={false} col={C.blue} onClick={()=>setShowGlass(true)} />}
          <Pill label={`💾 ${storedDays.length}d`} active={false} col={C.muted} onClick={()=>setShowDataPanel(true)} />
        </div>
        {/* Workout-Done Checkbox */}
        {tab==="morning"&&(
          <div onClick={()=>updateToday("workoutDone",!today.workoutDone)} style={{ display:"flex", gap:"10px", alignItems:"center", padding:"8px 12px", background:today.workoutDone?C.greenBg:C.faint, borderRadius:"10px", cursor:"pointer", border:`1px solid ${today.workoutDone?C.greenBorder:C.border}`, marginTop:"4px", transition:"all .2s" }}>
            <div style={{ width:"16px", height:"16px", borderRadius:"4px", border:`1.5px solid ${today.workoutDone?C.green:C.border}`, background:today.workoutDone?C.green:"transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              {today.workoutDone&&<span style={{ color:"#000", fontSize:"9px", fontWeight:800 }}>✓</span>}
            </div>
            <div style={{ fontSize:"12.5px", color:today.workoutDone?C.green:C.muted, fontWeight:500 }}>
              {today.workoutDone ? `Workout erledigt ✨ — ${WORKOUTS[workoutType]?.label||""}` : "Workout heute erledigt?"}
            </div>
          </div>
        )}
      </div>

      {/* CONTENT */}
      <div style={{ padding:"0 12px 60px" }}>
        {tab==="morning"&&(
          <>
            {/* ① Daten eintragen: WHOOP + Check-in */}
            <WhoopSection data={today} onChange={updateToday} />
            <MoodCheck data={today} onChange={updateToday} />

            {/* ② Hauptaufgabe analysieren */}
            <TaskAnalyzer data={today} onChange={updateToday} energyLevel={today.energyLevel} adsLevel={today.adsLevel} cycle={cycle} workoutType={workoutType} />

            {/* ③ Morgenroutine — ruhig abarbeiten */}
            <MorningRoutine data={today} onChange={updateToday} />

            {/* ③ Kreativ-Inspo — beim Kaffee */}
            <CreativeInspo data={today} onChange={updateToday} />

            {/* ④ Tagesübersicht: Empfehlung + Journal */}
            <DailyRec workoutRec={workoutRec} cycle={cycle} energyLevel={today.energyLevel} whoopData={today.whoop} workoutType={workoutType} onOverride={handleWorkoutOverride} />
            <DayBriefing cycle={cycle} energyLevel={today.energyLevel} adsLevel={today.adsLevel} whoopData={today.whoop} workoutType={workoutType} />
            <Journal data={today} onChange={updateToday} />

            {/* ⑤ Ernährung, Supplements, Fokus, Wasser */}
            <Nutrition cycle={cycle} workoutType={workoutType} whoopStrain={today?.whoop?.sleepScore} data={today} onChange={updateToday} />
            <Supplements data={today} onChange={updateToday} />
            <FocusToday data={today} onChange={updateToday} />
            <Hydration data={today} onChange={updateToday} hasTraining={workoutType==="gym"||workoutType==="pilates"} glassMl={glassMl} />

            {/* ⑥ Crypto */}
            <Crypto cryptoData={cryptoData} loading={loadingC} onRefresh={fetchCrypto} />
          </>
        )}
        {tab==="evening"&&(
          <>
            <EveningReflect data={today} onChange={updateToday} />
            <Journal data={today} onChange={updateToday} />
            <MoodCheck data={today} onChange={updateToday} />
            <Hydration data={today} onChange={updateToday} hasTraining={workoutType==="gym"||workoutType==="pilates"} glassMl={glassMl} />
            <Supplements data={today} onChange={updateToday} />
          </>
        )}
        {tab==="review"&&(
          <>
            <div style={{ display:"flex", gap:"6px", marginBottom:"12px" }}>
              <Pill label="7 Tage" active={reviewMode==="week"} col={C.purple} onClick={()=>setReview("week")} />
              <Pill label="30 Tage" active={reviewMode==="month"} col={C.purple} onClick={()=>setReview("month")} />
            </div>
            {/* Data health indicator */}
            <div onClick={()=>setShowDataPanel(true)} style={{ background:storedDays.length>1?C.greenBg:C.faint, border:`1px solid ${storedDays.length>1?C.greenBorder:C.border}`, borderRadius:"12px", padding:"10px 14px", marginBottom:"12px", cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ fontSize:"11px", fontWeight:600, color:storedDays.length>1?C.green:C.muted }}>
                  {storedDays.length>0 ? `💾 ${storedDays.length} Tage gespeichert` : "⚠️ Noch keine Daten"}
                </div>
                <div style={{ fontSize:"10px", color:C.muted, marginTop:"2px" }}>
                  {storedDays.length>0 ? `${storedDays[0]} → ${storedDays[storedDays.length-1]} · Tippen für Export` : "Fange heute an — morgen siehst du deinen ersten Verlauf"}
                </div>
              </div>
              <div style={{ fontSize:"11px", color:C.muted }}>↗</div>
            </div>
            <ReviewView allData={allData} mode={reviewMode} />
          </>
        )}
      </div>
    </div>
  );
}
