import { useEffect, useState } from "react";
import { ref, onValue, query, limitToLast } from "firebase/database";
import { db } from "./lib/firebase";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { GoogleGenerativeAI } from "@google/generative-ai";
import "./App.css";
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
  timestamp?: number;
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

type SensorKey = keyof Omit<SensorReading, "ts" | "timestamp">;

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

// Keys where 0 means "sensor offline" (LDR excluded — 0 lux is valid in darkness)
const ZERO_IS_OFFLINE: Set<SensorKey> = new Set([
  "temperature", "humidity", "co2ppm", "ppmNH3", "ppmH2S", "so2ppm", "pm25", "pm10",
]);

function isOffline(key: SensorKey, value: number) {
  return ZERO_IS_OFFLINE.has(key) && value === 0;
}

function fmt(v: number | null | undefined, digits = 1) {
  if (v == null || v < 0) return "—";
  return Number(v).toFixed(digits);
}

function statusColor(value: number, safe: number, danger: number, offline: boolean) {
  if (offline || value < 0) return "#6b7280";
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
  const offline = isOffline(sensor.key, latest);
  const dot = statusColor(latest, sensor.safe, sensor.danger, offline);
  const chartData = history.map((r, i) => ({ i, v: r[sensor.key] }));
  const allZero = ZERO_IS_OFFLINE.has(sensor.key) && chartData.length > 0 && chartData.every((d) => d.v === 0);

  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(255,253,240,0.9) 0%, rgba(253,248,225,0.85) 100%)",
      border: "2px solid rgba(250,204,21,0.5)",
      borderRadius: 12,
      padding: "22px 24px 16px",
      display: "flex",
      flexDirection: "column",
      gap: 8,
      boxShadow: "0 4px 15px rgba(250,204,21,0.15)",
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
        <span style={{ color: "#451a03", fontSize: 12, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", flex: 1 }}>
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
        {offline ? (
          <>
            <span style={{
              color: "#6b7280", fontSize: 22, fontWeight: 700, lineHeight: 1,
              fontFamily: "'Press Start 2P', monospace", letterSpacing: 1,
            }}>
              NO DATA
            </span>
            <span style={{
              background: "#78350f88", border: "1px solid #fb923c44",
              borderRadius: 999, padding: "2px 8px", marginLeft: 4,
              fontSize: 9, color: "#fbbf24", fontWeight: 600,
            }}>SENSOR OFFLINE</span>
          </>
        ) : (
          <>
            <span style={{
              color: "#1e293b", fontSize: 38, fontWeight: 800, lineHeight: 1,
              fontFamily: "'Inter', sans-serif",
            }}>
              {fmt(latest)}
            </span>
            <span style={{ color: "#4c1d95", fontSize: 12, fontWeight: 600, fontFamily: "'Inter', sans-serif" }}>{sensor.unit}</span>
          </>
        )}
      </div>

      {/* Threshold pills */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {[
          { label: `< ${sensor.safe}`, bg: "#bbf7d0", text: "#14532d" },
          { label: `< ${sensor.danger}`, bg: "#fed7aa", text: "#7c2d12" },
          { label: `≥ ${sensor.danger}`, bg: "#fecaca", text: "#7f1d1d" },
        ].map((p) => (
          <span key={p.label} style={{
            background: p.bg + "66", border: `1px solid ${p.text}33`,
            borderRadius: 999, padding: "2px 8px",
            fontSize: 10, color: p.text, fontWeight: 600, letterSpacing: 0.4,
          }}>{p.label}</span>
        ))}
      </div>

      <div style={{ height: 1, background: "rgba(250,204,21,0.3)", margin: "4px 0" }} />

      {/* Chart */}
      <div style={{ height: 80, position: "relative" }}>
        {allZero ? (
          <div style={{
            height: "100%", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 6,
            background: "rgba(107,114,128,0.06)", borderRadius: 12,
            border: "1px dashed rgba(107,114,128,0.2)",
          }}>
            <span style={{
              fontSize: 10, color: "#6b7280",
              fontFamily: "'Press Start 2P', monospace", letterSpacing: 1,
            }}>
              NO DATA AVAILABLE
            </span>
            <span style={{ fontSize: 9, color: "#4b5563" }}>
              Sensor not connected
            </span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <XAxis dataKey="i" hide />
              <YAxis hide domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{
                  background: "#fffbeb",
                  border: `1px solid ${sensor.color}88`,
                  borderRadius: 10, fontSize: 12, color: "#000",
                }}
                formatter={(v: number | undefined) => [`${fmt(v ?? -1)}${sensor.unit}`, sensor.label]}
                labelFormatter={() => ""}
              />
              <Line
                type="monotone" dataKey="v"
                stroke="#0f172a" strokeWidth={3}
                dot={false} isAnimationActive={false}
                strokeLinecap="round"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// ── AI Suggestion Box ────────────────────────────────────────────────────────
function AiSuggestionBox({ data }: { data: SensorReading | null }) {
  const [suggestion, setSuggestion] = useState<string>("Analyzing current environmental data...");
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const generateSuggestion = async () => {
      setLoading(true);

      let csvDataStr = "";
      try {
        const res = await fetch("/test.csv");
        if (res.ok) {
          const text = await res.text();
          const lines = text.trim().split("\n");
          csvDataStr = lines.slice(-5).join("\n"); // Include last 5 rows for AI context
        }
      } catch (err) {
        console.warn("Could not load test.csv", err);
      }

      try {
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        if (!apiKey) throw new Error("Missing Gemini API Key");

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        let prompt = "You are an expert poultry farm AI. Analyze the environment and give positive, encouraging, point-wise actionable guidance. Always highlight what's going well first, then give gentle recommendations.\n";

        if (data && data.temperature !== 0) {
          prompt += `CURRENT LIVE DATA:\nTemp: ${data.temperature}°C, Hum: ${data.humidity}%, NH3: ${data.ppmNH3}ppm, H2S: ${data.ppmH2S}ppm, CO2: ${data.co2ppm}ppm, PM2.5: ${data.pm25}µg.\n`;
        } else {
          prompt += `CURRENT LIVE DATA is offline. Instead of environment guidance, provide an interesting, little-known scientific fact or tip about the poultry business that enhances farm productivity.\n`;
        }

        if (csvDataStr) {
          prompt += `\nRECENT HISTORICAL DATA (from test.csv):\n${csvDataStr}\n\n`;
        }

        prompt += "Respond ONLY with EXACTLY 4 very short, crisp, uplifting bullet points (starting with \u2022) giving immediate actionable advice. Maximum 10 words per point. Do not include any introductory or concluding text.";

        const result = await model.generateContent(prompt);
        // Clean up markdown bolding from API response so it renders cleanly
        let cleanText = result.response.text().replace(/\*\*/g, "");
        setSuggestion(cleanText);
      } catch (error) {
        console.error("Gemini Error:", error);
        setSuggestion("AI Guidance: Unable to connect to Gemini API. Please review sensor parameters manually.");
      }
      setLoading(false);
    };

    generateSuggestion();

    // Evaluate every 6 hours (21600000 ms)
    const interval = setInterval(generateSuggestion, 21600000);
    return () => clearInterval(interval);
  }, [data]);

  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(255,253,240,0.95) 0%, rgba(253,248,225,0.9) 100%)",
      border: "2px solid rgba(250,204,21,0.5)",
      borderRadius: 12,
      padding: "24px",
      marginTop: "16px",
      boxShadow: "0 4px 15px rgba(250,204,21,0.15)",
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 24 }}>✨</span>
          <h3 style={{ margin: 0, color: "#451a03", fontFamily: "'Press Start 2P', monospace", fontSize: 12, lineHeight: 1.4 }}>
            POULTRY AI
          </h3>
        </div>
        <span style={{ color: "#92400e", fontSize: 10, fontFamily: "'Inter', sans-serif", fontWeight: 700, paddingLeft: 32 }}>
          your personalised assistant
        </span>
      </div>
      <p style={{
        color: "#1e293b", fontSize: 13, lineHeight: 1.6, margin: 0,
        fontFamily: "'Inter', sans-serif", fontWeight: 500,
        fontStyle: loading ? "italic" : "normal", opacity: loading ? 0.7 : 1,
        whiteSpace: "pre-wrap"
      }}>
        {suggestion}
      </p>
      <div style={{ marginTop: 16, fontSize: 10, color: "#4c1d95", fontFamily: "'Press Start 2P', monospace" }}>
        UPDATES EVERY 6 HRS
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [history, setHistory] = useState<SensorReading[]>([]);
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
      }
    );
    return () => unsub();
  }, []);

  const latest = history.length ? history[history.length - 1] : null;

  return (
    <div style={{ minHeight: "100vh", background: "#00000e", fontFamily: "'Press Start 2P', monospace", position: "relative", overflowX: "hidden" }}>
      {/* Background Image */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 0,
        backgroundImage: "url('/background.avif')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        opacity: 0.8
      }} />

      {/* Content Layout wrapper */}
      <div style={{ display: "flex", minHeight: "100vh", position: "relative", zIndex: 10 }}>

        {/* ── Left Sidebar Panel (20-25% width) ── */}
        <div style={{
          width: "25%",
          minWidth: "300px",
          maxWidth: "380px",
          background: "linear-gradient(135deg, rgba(255,253,240,0.85) 0%, rgba(253,248,225,0.8) 100%)",
          borderRight: "2px solid rgba(250,204,21,0.5)",
          padding: "32px 24px",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
          boxShadow: "4px 0 24px rgba(250,204,21,0.15)",
          zIndex: 20
        }}>
          {/* Status pill — moved to sidebar edge */}
          <div style={{}}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "rgba(255,255,255,0.75)", border: `1px solid ${dbStatus === "live" ? "rgba(34,197,94,0.5)" :
                dbStatus === "disconnected" ? "rgba(239,68,68,0.5)" :
                  "rgba(251,191,36,0.5)"
                }`,
              borderRadius: 999, padding: "6px 16px",
              boxShadow: dbStatus === "live" ? "0 0 10px rgba(34,197,94,0.15)" :
                dbStatus === "disconnected" ? "0 0 10px rgba(239,68,68,0.15)" :
                  "0 0 10px rgba(251,191,36,0.15)",
            }}>
              {/* Pulsing dot */}
              <span style={{ position: "relative", display: "inline-flex", width: 8, height: 8 }}>
                <span style={{
                  position: "absolute", inset: 0, borderRadius: "50%",
                  background: dbStatus === "live" ? "#22c55e" : dbStatus === "disconnected" ? "#ef4444" : "#fbbf24",
                  opacity: 0.5,
                  animation: "ping 1.5s cubic-bezier(0,0,0.2,1) infinite",
                }} />
                <span style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: dbStatus === "live" ? "#22c55e" : dbStatus === "disconnected" ? "#ef4444" : "#fbbf24",
                  boxShadow: dbStatus === "live" ? "0 0 8px #22c55e" : dbStatus === "disconnected" ? "0 0 8px #ef4444" : "0 0 8px #fbbf24",
                  flexShrink: 0,
                }} />
              </span>

              <span style={{
                fontSize: 9, fontFamily: "'Press Start 2P', monospace", letterSpacing: 0.5,
                color: dbStatus === "live" ? "#166534" : dbStatus === "disconnected" ? "#991b1b" : "#b45309"
              }}>
                {dbStatus === "live" ? `CONNECTED` : dbStatus === "disconnected" ? `OFFLINE` : `CONNECTING…`}
              </span>
            </div>
          </div>

          <div style={{
            display: "flex", justifyContent: "center", alignItems: "center",
            marginTop: "10px", marginBottom: "0px"
          }}>
            <div style={{ width: "70%", aspectRatio: "1/1", filter: "drop-shadow(0 0 15px rgba(250,204,21,0.4))" }}>
              <DotLottieReact src="https://lottie.host/a237d635-2f13-40cf-8952-75db60ad8832/iMRBRQ6mXj.lottie" loop autoplay />
            </div>
          </div>
          <AiSuggestionBox data={latest} />
        </div>

        {/* ── Main Content Area (Right) ── */}
        <div style={{ flex: 1, position: "relative", padding: "0 40px 120px", overflowY: "auto" }}>

          {/* ── Header ── */}
          <header style={{ paddingTop: 44, paddingBottom: 36 }}>

            {/* Main hero row: Title center */}
            <div style={{ display: "flex", alignItems: "center", gap: 32, justifyContent: "center" }}>

              {/* Left Rooster */}
              <div style={{ width: 140, height: 140, transform: "scaleX(-1)", filter: "drop-shadow(0 0 10px rgba(250,204,21,0.5))" }}>
                <DotLottieReact src="https://lottie.host/c2724d3a-7ad7-4bf8-a6e6-da3da3845002/xrp42rT4c1.lottie" loop autoplay />
              </div>

              {/* Title block */}
              <div style={{ textAlign: "center" }}>
                {/* Glow layer */}
                <div style={{ position: "relative", display: "inline-block" }}>
                  <div style={{
                    position: "absolute", inset: "-20px -40px",
                    background: "radial-gradient(ellipse, rgba(124,58,237,0.38) 0%, transparent 70%)",
                    filter: "blur(22px)", pointerEvents: "none",
                  }} />
                  <h1 style={{
                    fontFamily: "'Bungee Inline', cursive",
                    fontSize: "clamp(24px, 4vw, 56px)",
                    lineHeight: 1.2,
                    letterSpacing: 2,
                    margin: 0,
                    color: "#ffffff",
                    textShadow: [
                      "-2px -2px 0 #facc15",
                      " 2px -2px 0 #facc15",
                      "-2px  2px 0 #facc15",
                      " 2px  2px 0 #facc15",
                      "0 0 10px #facc1588",
                    ].join(", "),
                    position: "relative",
                  }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", justifyContent: "center" }}>
                      <span style={{ display: "block", marginBottom: 12 }}>SMART POULTRY</span>
                      <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
                        MANAGEMENT
                        <div style={{ width: 110, height: 110, filter: "drop-shadow(0 0 10px rgba(250,204,21,0.5))", marginTop: -10 }}>
                          <DotLottieReact src="https://lottie.host/0b3ad356-d726-4427-9447-59b33b500da8/BpzFqSGdWG.lottie" loop autoplay />
                        </div>
                      </span>
                    </div>
                  </h1>
                </div>

                <p style={{
                  color: "#facc15",
                  marginTop: 14, fontSize: 10,
                  fontFamily: "'Press Start 2P', monospace",
                  letterSpacing: 2,
                  opacity: 0.9,
                  textShadow: "1px 1px 0 #000",
                }}>
                  ESP32 → FIREBASE RTDB · REAL-TIME
                </p>
              </div>

              {/* Right Rooster */}
              <div style={{ width: 140, height: 140, filter: "drop-shadow(0 0 10px rgba(250,204,21,0.5))" }}>
                <DotLottieReact src="https://lottie.host/c2724d3a-7ad7-4bf8-a6e6-da3da3845002/xrp42rT4c1.lottie" loop autoplay />
              </div>

            </div>
          </header>

          {/* ── Live summary strip ── */}
          {latest && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", marginBottom: 48 }}>
              {[
                { label: "TEMP", value: latest.temperature === 0 ? "OFFLINE" : `${fmt(latest.temperature)}°C`, color: "#facc15", off: latest.temperature === 0 },
                { label: "HUMIDITY", value: latest.humidity === 0 ? "OFFLINE" : `${fmt(latest.humidity)}%`, color: "#facc15", off: latest.humidity === 0 },
                { label: "LUX", value: `${fmt(latest.lux, 0)} lux`, color: "#facc15", off: false },
                { label: "CO₂", value: latest.co2ppm === 0 ? "OFFLINE" : `${fmt(latest.co2ppm, 0)} ppm`, color: "#facc15", off: latest.co2ppm === 0 },
                { label: "NH₃", value: latest.ppmNH3 === 0 ? "OFFLINE" : `${fmt(latest.ppmNH3)} ppm`, color: "#facc15", off: latest.ppmNH3 === 0 },
                { label: "H₂S", value: latest.ppmH2S === 0 ? "OFFLINE" : `${fmt(latest.ppmH2S)} ppm`, color: "#facc15", off: latest.ppmH2S === 0 },
                { label: "SO₂", value: latest.so2ppm === 0 ? "OFFLINE" : `${fmt(latest.so2ppm)} ppm`, color: "#facc15", off: latest.so2ppm === 0 },
                { label: "PM2.5", value: latest.pm25 === 0 ? "OFFLINE" : `${fmt(latest.pm25, 0)} µg`, color: "#facc15", off: latest.pm25 === 0 },
                { label: "PM10", value: latest.pm10 === 0 ? "OFFLINE" : `${fmt(latest.pm10, 0)} µg`, color: "#facc15", off: latest.pm10 === 0 },
              ].map((s) => (
                <div key={s.label} style={{
                  background: "rgba(10,5,25,0.75)", border: `1px solid rgba(250,204,21,0.5)`,
                  borderRadius: 999, padding: "8px 20px", display: "flex", alignItems: "baseline", gap: 10,
                  boxShadow: `0 0 15px rgba(0,0,0,0.4)`
                }}>
                  <span style={{ fontSize: 9, color: s.off ? "#6b7280" : "#d1d5db", fontFamily: "'Press Start 2P', monospace", letterSpacing: 0.5 }}>{s.label}</span>
                  <span style={{ fontWeight: 800, color: s.off ? "#6b7280" : s.color, fontSize: s.off ? 10 : 16, textShadow: s.off ? "none" : `0 0 10px ${s.color}66`, fontFamily: "'Inter', sans-serif" }}>{s.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── Main Layout (Right Grid only) ── */}
          <div style={{ maxWidth: 1400, margin: "0 auto" }}>
            {/* Right Panel: Sensors */}
            <div className="sensor-grid-smaller">
              {SENSORS.map((s) => (
                <SensorCard key={s.key} sensor={s} history={history} />
              ))}
            </div>
          </div>

          {/* ── Foreground Animations ── */}
          {/* Chicken bottom right */}
          <div style={{ position: "fixed", bottom: -20, right: 20, width: 200, height: 200, zIndex: 50, pointerEvents: "none", filter: "drop-shadow(0 5px 15px rgba(0,0,0,0.5))" }}>
            <DotLottieReact src="https://lottie.host/0b3ad356-d726-4427-9447-59b33b500da8/BpzFqSGdWG.lottie" loop autoplay />
          </div>

        </div>
      </div>
    </div>
  );
}
