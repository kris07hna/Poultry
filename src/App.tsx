import { useEffect, useState } from "react";
import { ref, onValue, query, limitToLast } from "firebase/database";
import { db } from "./lib/firebase";
import { CelestialSphere } from "./components/ui/celestial-sphere";
import { Typewriter } from "./components/ui/typewriter-text";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// ── Types ────────────────────────────────────────────────────────────────────
interface SensorReading {
  ts: number;
  temperature: number;
  humidity: number;
  lux: number;
  co2ppm: number;
  ppmNH3: number;
  ppmH2S: number;
  so2ppm: number;
  pm25: number;
  pm10: number;
}

type SensorKey = keyof Omit<SensorReading, "ts">;

// ── Sensor metadata ──────────────────────────────────────────────────────────
const SENSORS: {
  key: SensorKey;
  label: string;
  unit: string;
  icon: string;
  color: string;
  safe: number;
  danger: number;
}[] = [
    { key: "temperature", label: "Temperature", unit: "°C", icon: "🌡️", color: "#60a5fa", safe: 32, danger: 40 },
    { key: "humidity", label: "Humidity", unit: "%", icon: "💧", color: "#38bdf8", safe: 70, danger: 85 },
    { key: "lux", label: "Light Intensity", unit: " lux", icon: "💡", color: "#facc15", safe: 2000, danger: 10000 },
    { key: "co2ppm", label: "CO₂", unit: " ppm", icon: "🫧", color: "#a78bfa", safe: 2000, danger: 5000 },
    { key: "ppmNH3", label: "Ammonia (NH₃)", unit: " ppm", icon: "⚗️", color: "#34d399", safe: 20, danger: 50 },
    { key: "ppmH2S", label: "Hydrogen Sulfide (H₂S)", unit: " ppm", icon: "☣️", color: "#f87171", safe: 5, danger: 20 },
    { key: "so2ppm", label: "Sulfur Dioxide (SO₂)", unit: " ppm", icon: "🌫️", color: "#fb923c", safe: 2, danger: 10 },
    { key: "pm25", label: "PM2.5", unit: " µg/m³", icon: "🔵", color: "#c084fc", safe: 35, danger: 75 },
    { key: "pm10", label: "PM10", unit: " µg/m³", icon: "🟣", color: "#818cf8", safe: 50, danger: 150 },
  ];

const MAX_HISTORY = 30;

function fmt(v: number | null | undefined, digits = 1) {
  if (v == null || v < 0) return "—";
  return Number(v).toFixed(digits);
}

function statusColor(value: number, safe: number, danger: number) {
  if (value < 0) return "#6b7280";
  if (value <= safe) return "#22c55e";
  if (value <= danger) return "#f59e0b";
  return "#ef4444";
}

// ── Sensor Card ──────────────────────────────────────────────────────────────
function SensorCard({
  sensor,
  history,
}: {
  sensor: typeof SENSORS[0];
  history: SensorReading[];
}) {
  const latest = history.length ? history[history.length - 1][sensor.key] : -1;
  const dot = statusColor(latest, sensor.safe, sensor.danger);
  const chartData = history.map((r, i) => ({ i, v: r[sensor.key] }));

  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(8,8,32,0.82) 0%, rgba(15,8,45,0.78) 100%)",
      border: "1px solid rgba(139,92,246,0.22)",
      backdropFilter: "blur(20px)",
      borderRadius: 20,
      padding: "22px 24px 16px",
      display: "flex",
      flexDirection: "column",
      gap: 8,
      boxShadow: "0 8px 40px rgba(0,0,60,0.55), inset 0 1px 0 rgba(255,255,255,0.05)",
      transition: "transform 0.2s, box-shadow 0.2s",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Top glow accent line */}
      <div style={{
        position: "absolute", top: 0, left: "10%", right: "10%", height: 1,
        background: `linear-gradient(90deg, transparent, ${sensor.color}66, transparent)`,
      }} />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 22 }}>{sensor.icon}</span>
        <span style={{ color: "#c4b5fd", fontSize: 12, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", flex: 1 }}>
          {sensor.label}
        </span>
        <span style={{
          width: 10, height: 10, borderRadius: "50%",
          background: dot, boxShadow: `0 0 10px ${dot}, 0 0 20px ${dot}44`,
          flexShrink: 0,
        }} />
      </div>

      {/* Value */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 2 }}>
        <span style={{
          color: "#fff", fontSize: 38, fontWeight: 800, lineHeight: 1,
          textShadow: `0 0 20px ${sensor.color}88`,
        }}>
          {fmt(latest)}
        </span>
        <span style={{ color: "#7c3aed", fontSize: 14, fontWeight: 600 }}>{sensor.unit}</span>
      </div>

      {/* Threshold pills */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {[
          { label: `< ${sensor.safe}`, bg: "#14532d", text: "#4ade80" },
          { label: `< ${sensor.danger}`, bg: "#78350f", text: "#fb923c" },
          { label: `≥ ${sensor.danger}`, bg: "#450a0a", text: "#f87171" },
        ].map((p) => (
          <span key={p.label} style={{
            background: p.bg + "66", border: `1px solid ${p.text}33`,
            borderRadius: 999, padding: "2px 8px",
            fontSize: 10, color: p.text, fontWeight: 600, letterSpacing: 0.4,
          }}>{p.label}</span>
        ))}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "rgba(139,92,246,0.12)", margin: "4px 0" }} />

      {/* Chart */}
      <div style={{ height: 80 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <XAxis dataKey="i" hide />
            <YAxis hide domain={["auto", "auto"]} />
            <Tooltip
              contentStyle={{
                background: "#0d0d2e",
                border: `1px solid ${sensor.color}55`,
                borderRadius: 10, fontSize: 12, color: "#e2e8f0",
              }}
              formatter={(v: number | undefined) => [`${fmt(v ?? -1)}${sensor.unit}`, sensor.label]}
              labelFormatter={() => ""}
            />
            <Line
              type="monotone" dataKey="v"
              stroke={sensor.color} strokeWidth={2.5}
              dot={false} isAnimationActive={false}
              strokeLinecap="round"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [history, setHistory] = useState<SensorReading[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>("—");
  const [dbStatus, setDbStatus] = useState<"connecting" | "live" | "disconnected">("connecting");


  // ── Real-time DB connection status via .info/connected ──
  useEffect(() => {
    const connRef = ref(db, ".info/connected");
    const unsub = onValue(connRef, (snap) => {
      const isConnected = snap.val() === true;
      setDbStatus(isConnected ? "live" : "disconnected");

    });
    return () => unsub();
  }, []);

  // ── Sensor data listener ──
  useEffect(() => {
    const sensorsRef = query(ref(db, "/sensors"), limitToLast(MAX_HISTORY));
    const unsub = onValue(
      sensorsRef,
      (snap) => {
        if (!snap.exists()) return;
        const entries: SensorReading[] = [];
        snap.forEach((child) => {
          const v = child.val();
          entries.push({ ts: Number(child.key), ...v });
        });
        entries.sort((a, b) => a.ts - b.ts);
        setHistory(entries);
        setLastUpdated(new Date().toLocaleTimeString());
      }
    );
    return () => unsub();
  }, []);

  const latest = history.length ? history[history.length - 1] : null;

  return (
    <div style={{ minHeight: "100vh", background: "#00000e", fontFamily: "'Inter', sans-serif", position: "relative" }}>
      {/* WebGL Background */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}>
        <CelestialSphere hue={240} speed={0.25} zoom={1.3} particleSize={3.5} className="w-full h-full" />
      </div>

      {/* Overlay gradient for legibility */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 1,
        background: "radial-gradient(ellipse at 50% 0%, transparent 30%, rgba(0,0,15,0.55) 100%)",
        pointerEvents: "none",
      }} />

      {/* Content */}
      <div style={{ position: "relative", zIndex: 10, maxWidth: 1400, margin: "0 auto", padding: "0 28px 80px" }}>

        {/* ── Header ── */}
        <header style={{ paddingTop: 44, paddingBottom: 36 }}>

          {/* Status pill — centered */}
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 10,
              background: "rgba(10,10,40,0.75)", border: `1px solid ${dbStatus === "live" ? "rgba(34,197,94,0.35)" :
                dbStatus === "disconnected" ? "rgba(239,68,68,0.35)" :
                  "rgba(251,191,36,0.35)"
                }`,
              backdropFilter: "blur(14px)", borderRadius: 999, padding: "8px 22px",
              boxShadow: dbStatus === "live" ? "0 0 20px rgba(34,197,94,0.15)" :
                dbStatus === "disconnected" ? "0 0 20px rgba(239,68,68,0.15)" :
                  "0 0 20px rgba(251,191,36,0.12)",
            }}>
              {/* Pulsing dot */}
              <span style={{ position: "relative", display: "inline-flex", width: 10, height: 10 }}>
                <span style={{
                  position: "absolute", inset: 0, borderRadius: "50%",
                  background: dbStatus === "live" ? "#22c55e" : dbStatus === "disconnected" ? "#ef4444" : "#fbbf24",
                  opacity: 0.5,
                  animation: "ping 1.5s cubic-bezier(0,0,0.2,1) infinite",
                }} />
                <span style={{
                  width: 10, height: 10, borderRadius: "50%",
                  background: dbStatus === "live" ? "#22c55e" : dbStatus === "disconnected" ? "#ef4444" : "#fbbf24",
                  boxShadow: dbStatus === "live" ? "0 0 10px #22c55e" : dbStatus === "disconnected" ? "0 0 10px #ef4444" : "0 0 10px #fbbf24",
                  flexShrink: 0,
                }} />
              </span>

              <span style={{
                fontSize: 10, fontFamily: "'Press Start 2P', monospace", letterSpacing: 1,
                color: dbStatus === "live" ? "#86efac" : dbStatus === "disconnected" ? "#fca5a5" : "#fde68a"
              }}>
                {dbStatus === "live" && `⬤ RTDB CONNECTED`}
                {dbStatus === "disconnected" && `⬤ RTDB OFFLINE`}
                {dbStatus === "connecting" && `⬤ CONNECTING…`}
              </span>

              {dbStatus === "live" && lastUpdated !== "—" && (
                <span style={{ fontSize: 9, color: "#475569", fontFamily: "'Press Start 2P', monospace", borderLeft: "1px solid #334155", paddingLeft: 12 }}>
                  {lastUpdated}
                </span>
              )}
            </div>
          </div>

          {/* Main hero row: Bird left | Title center */}
          <div style={{ display: "flex", alignItems: "center", gap: 32, justifyContent: "center" }}>

            {/* Lottie bird */}
            <div style={{
              flexShrink: 0, width: 180, height: 180,
              filter: "drop-shadow(0 0 28px rgba(124,58,237,0.7))",
            }}>
              <DotLottieReact
                src="https://lottie.host/c2724d3a-7ad7-4bf8-a6e6-da3da3845002/xrp42rT4c1.lottie"
                loop
                autoplay
              />
            </div>

            {/* Title block */}
            <div style={{ textAlign: "left" }}>
              {/* Glow layer */}
              <div style={{ position: "relative", display: "inline-block" }}>
                <div style={{
                  position: "absolute", inset: "-20px -40px",
                  background: "radial-gradient(ellipse, rgba(124,58,237,0.38) 0%, transparent 70%)",
                  filter: "blur(22px)", pointerEvents: "none",
                }} />
                <h1 style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: "clamp(14px, 2.6vw, 34px)",
                  lineHeight: 1.65,
                  letterSpacing: 2,
                  margin: 0,
                  color: "#ffffff",
                  background: "none",
                  WebkitBackgroundClip: "unset",
                  WebkitTextFillColor: "#ffffff",
                  textShadow: [
                    "-1.5px -1.5px 0 #7c3aed",
                    " 1.5px -1.5px 0 #7c3aed",
                    "-1.5px  1.5px 0 #7c3aed",
                    " 1.5px  1.5px 0 #7c3aed",
                    "0 0 18px #a78bfa",
                    "0 0 40px #7c3aed88",
                  ].join(", "),
                  position: "relative",
                  minHeight: "3em",
                }}>
                  <Typewriter
                    text={["POULTRY ENVIRONMENT", "MONITORING SYSTEM"]}
                    speed={140}
                    deleteSpeed={60}
                    delay={2800}
                    loop
                    cursor="▮"
                  />
                </h1>
              </div>

              <p style={{
                color: "#ffffff",
                marginTop: 14, fontSize: 10,
                fontFamily: "'Press Start 2P', monospace",
                letterSpacing: 2,
                opacity: 0.75,
              }}>
                ESP32 → FIREBASE RTDB · REAL-TIME
              </p>
            </div>
          </div>
        </header>

        {/* ── Live summary strip ── */}
        {latest && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 40 }}>
            {[
              { label: "TEMP", value: `${fmt(latest.temperature)}°C`, color: "#60a5fa" },
              { label: "HUMIDITY", value: `${fmt(latest.humidity)}%`, color: "#38bdf8" },
              { label: "CO₂", value: `${fmt(latest.co2ppm, 0)} ppm`, color: "#a78bfa" },
              { label: "NH₃", value: `${fmt(latest.ppmNH3)} ppm`, color: "#34d399" },
              { label: "PM2.5", value: `${fmt(latest.pm25, 0)} µg`, color: "#c084fc" },
            ].map((s) => (
              <div key={s.label} style={{
                background: "rgba(10,8,40,0.72)", border: `1px solid ${s.color}33`,
                backdropFilter: "blur(12px)", borderRadius: 999, padding: "7px 20px",
                display: "flex", gap: 10, alignItems: "center",
                boxShadow: `0 0 16px ${s.color}18`,
              }}>
                <span style={{ fontSize: 10, color: "#6b7280", fontFamily: "'Press Start 2P', monospace", letterSpacing: 0.5 }}>{s.label}</span>
                <span style={{ fontWeight: 800, color: s.color, fontSize: 14, textShadow: `0 0 12px ${s.color}88` }}>{s.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Sensor Grid — 3 columns ── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 20,
        }}>
          {SENSORS.map((s) => (
            <SensorCard key={s.key} sensor={s} history={history} />
          ))}
        </div>


      </div>
    </div>
  );
}
