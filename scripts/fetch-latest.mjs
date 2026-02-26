/**
 * fetch-latest.mjs
 * ─────────────────────────────────────────────────────
 * Fetches the latest sensor reading from Firebase RTDB
 * and prints it to the console.
 *
 * Usage:
 *   node scripts/fetch-latest.mjs            # last 1 entry
 *   node scripts/fetch-latest.mjs --count 5  # last 5 entries
 * ─────────────────────────────────────────────────────
 */

import { initializeApp } from "firebase/app";
import { getDatabase, ref, query, limitToLast, get } from "firebase/database";

// ── Firebase config (mirrors .env) ───────────────────
const firebaseConfig = {
    apiKey: "AIzaSyC1kAsG2GZVOJrg7MKLLphJGr-W64pBykQ",
    authDomain: "poultryfaring.firebaseapp.com",
    databaseURL: "https://poultryfaring-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "poultryfaring",
    storageBucket: "poultryfaring.firebasestorage.app",
    messagingSenderId: "1006683453133",
    appId: "1:1006683453133:web:32b6f879c7d2ac5f119b84",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ── CLI args ─────────────────────────────────────────
const args = process.argv.slice(2);
const countIdx = args.indexOf("--count");
const count = countIdx !== -1 ? parseInt(args[countIdx + 1], 10) || 1 : 1;

// ── Sensor thresholds (for status display) ───────────
const THRESHOLDS = {
    temperature: { safe: 32, danger: 40, unit: "°C" },
    humidity: { safe: 70, danger: 85, unit: "%" },
    lux: { safe: 2000, danger: 10000, unit: "lux" },
    co2ppm: { safe: 2000, danger: 5000, unit: "ppm" },
    ppmNH3: { safe: 20, danger: 50, unit: "ppm" },
    ppmH2S: { safe: 5, danger: 20, unit: "ppm" },
    so2ppm: { safe: 2, danger: 10, unit: "ppm" },
    pm25: { safe: 35, danger: 75, unit: "µg/m³" },
    pm10: { safe: 50, danger: 150, unit: "µg/m³" },
};

function statusEmoji(value, safe, danger) {
    if (value <= 0) return "⚠️  NO DATA";
    if (value <= safe) return "✅ SAFE";
    if (value <= danger) return "⚠️  WARNING";
    return "🚨 DANGER";
}

// ── Fetch ────────────────────────────────────────────
async function fetchLatest() {
    console.log(`\n🔍 Fetching latest ${count} reading(s) from Firebase RTDB...\n`);

    const sensorsRef = query(ref(db, "/sensors"), limitToLast(count));
    const snap = await get(sensorsRef);

    if (!snap.exists()) {
        console.log("❌ No data found at /sensors");
        process.exit(1);
    }

    const entries = [];
    snap.forEach((child) => {
        entries.push({ key: child.key, ...child.val() });
    });

    // Sort newest first
    entries.sort((a, b) => Number(b.key) - Number(a.key));

    for (const entry of entries) {
        console.log(`══════════════════════════════════════════════`);
        console.log(`📦 Path: /sensors/${entry.key}`);
        console.log(`──────────────────────────────────────────────`);

        const sensorKeys = Object.keys(THRESHOLDS);
        let allZero = true;

        for (const sk of sensorKeys) {
            const val = entry[sk] ?? -1;
            const th = THRESHOLDS[sk];
            const status = statusEmoji(val, th.safe, th.danger);
            const display = val <= 0 ? "0 (sensor offline)" : `${val} ${th.unit}`;
            console.log(`  ${sk.padEnd(14)} : ${display.padEnd(26)} ${status}`);
            if (val > 0) allZero = false;
        }

        if (entry.timestamp != null) {
            console.log(`  ${"timestamp".padEnd(14)} : ${entry.timestamp}s (ESP32 uptime)`);
        }

        if (allZero) {
            console.log(`\n  ⚠️  ALL SENSORS READ ZERO — check wiring / power!`);
        }

        console.log();
    }

    console.log("✅ Done.\n");
    process.exit(0);
}

fetchLatest().catch((err) => {
    console.error("Fatal error:", err.message);
    process.exit(1);
});
