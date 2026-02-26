/**
 * seed.mjs
 * ─────────────────────────────────────────────────────────────
 * Simulates the ESP32 by reading test.csv and uploading each
 * row to Firebase RTDB under /sensors/{millis}, exactly as the
 * real device does.
 *
 * Usage:
 *   node scripts/seed.mjs              # 2s between rows (real-time)
 *   node scripts/seed.mjs --fast       # 300ms between rows (quick test)
 *   node scripts/seed.mjs --burst      # upload all rows instantly
 * ─────────────────────────────────────────────────────────────
 */

import { initializeApp } from "firebase/app";
import { getDatabase, ref, set } from "firebase/database";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ── Firebase config (mirrors .env) ───────────────────────────
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

// ── Column name mapping: CSV → Firebase ───────────────────────
// CSV:  created_at, entry_id, pm2.5, so2, light, temperature,
//       humidity, h2s, co2, pm10, nh3
// RTDB: pm25, so2ppm, lux, temperature, humidity, ppmH2S,
//       co2ppm, pm10, ppmNH3
const mapRow = (row) => ({
    pm25: parseFloat(row["pm2.5"]),
    so2ppm: parseFloat(row["so2"]),
    lux: parseFloat(row["light"]),
    temperature: parseFloat(row["temperature"]),
    humidity: parseFloat(row["humidity"]),
    ppmH2S: parseFloat(row["h2s"]),
    co2ppm: parseFloat(row["co2"]),
    pm10: parseFloat(row["pm10"]),
    ppmNH3: parseFloat(row["nh3"]),
});

// ── Parse CSV ─────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.resolve(__dirname, "../test.csv");
const raw = fs.readFileSync(csvPath, "utf8");
const lines = raw.split(/\r?\n/).filter(Boolean);
const headers = lines[0].split(",");

const rows = lines.slice(1).map((line) => {
    const values = line.split(",");
    return Object.fromEntries(headers.map((h, i) => [h.trim(), values[i]?.trim()]));
});

console.log(`📄 Loaded ${rows.length} rows from test.csv`);
console.log(`   Columns: ${headers.join(", ")}\n`);

// ── CLI options ───────────────────────────────────────────────
const args = process.argv.slice(2);
const isFast = args.includes("--fast");
const isBurst = args.includes("--burst");
const delayMs = isBurst ? 0 : isFast ? 300 : 2000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Upload loop ───────────────────────────────────────────────
async function upload() {
    console.log(`🚀 Starting upload — mode: ${isBurst ? "burst" : isFast ? "fast (300ms)" : "real-time (2s)"}\n`);

    // Use a millis counter starting from now, incrementing like ESP32
    let millis = Date.now();

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const data = mapRow(row);

        // Skip rows where all sensor values are invalid (-1 everywhere)
        const allInvalid = Object.values(data).every((v) => isNaN(v) || v === -1);
        if (allInvalid) {
            console.log(`⏭  Row ${i + 1} — all values invalid, skipping`);
            continue;
        }

        const path = `/sensors/${millis}`;

        try {
            await set(ref(db, path), data);
            const vals = [
                `T:${data.temperature}°C`,
                `H:${data.humidity}%`,
                `CO2:${data.co2ppm}ppm`,
                `NH3:${data.ppmNH3}ppm`,
                `PM2.5:${data.pm25}µg`,
            ].join("  ");
            console.log(`✅ [${i + 1}/${rows.length}] /sensors/${millis}\n   ${vals}`);
        } catch (err) {
            console.error(`❌ [${i + 1}] Failed:`, err.message);
        }

        millis += delayMs || 2000; // advance millis key even in burst mode
        if (delayMs > 0) await sleep(delayMs);
    }

    console.log("\n🎉 Done! All rows uploaded to Firebase RTDB.");
    process.exit(0);
}

upload().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
