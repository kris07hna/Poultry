/**
 * cleanup-and-fetch.mjs
 * ─────────────────────────────────────────────────────
 * 1. Removes old seed data (keys > 1 billion = Date.now() based)
 * 2. Shows the REAL ESP32 data (keys < 1 billion = millis() based)
 *
 * Usage:
 *   node scripts/cleanup-and-fetch.mjs          # preview only
 *   node scripts/cleanup-and-fetch.mjs --delete  # actually delete old data
 * ─────────────────────────────────────────────────────
 */

import { initializeApp } from "firebase/app";
import { getDatabase, ref, get, remove } from "firebase/database";

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

const doDelete = process.argv.includes("--delete");
const SEED_THRESHOLD = 1_000_000_000; // 1 billion — seed keys are ~1.77 trillion

async function main() {
    console.log("\n🔍 Fetching ALL entries from /sensors...\n");

    const snap = await get(ref(db, "/sensors"));
    if (!snap.exists()) {
        console.log("❌ No data at /sensors");
        process.exit(1);
    }

    const seedKeys = [];
    const realKeys = [];

    snap.forEach((child) => {
        const k = Number(child.key);
        if (k > SEED_THRESHOLD) {
            seedKeys.push(child.key);
        } else {
            realKeys.push({ key: child.key, data: child.val() });
        }
    });

    console.log(`📊 Total entries: ${seedKeys.length + realKeys.length}`);
    console.log(`   🧪 Old seed data (key > 1B): ${seedKeys.length}`);
    console.log(`   📡 Real ESP32 data (key < 1B): ${realKeys.length}\n`);

    // ── Delete old seed data ──
    if (seedKeys.length > 0) {
        if (doDelete) {
            console.log(`🗑️  Deleting ${seedKeys.length} old seed entries...`);
            for (const key of seedKeys) {
                await remove(ref(db, `/sensors/${key}`));
            }
            console.log("✅ Old seed data deleted!\n");
        } else {
            console.log(`⚠️  ${seedKeys.length} old seed entries found.`);
            console.log(`   Run with --delete to remove them:\n`);
            console.log(`   node scripts/cleanup-and-fetch.mjs --delete\n`);
        }
    }

    // ── Show real ESP32 data ──
    if (realKeys.length === 0) {
        console.log("📡 No real ESP32 data found yet.\n");
    } else {
        console.log(`📡 Latest ${Math.min(5, realKeys.length)} real ESP32 readings:\n`);
        // Sort by key descending (newest first)
        realKeys.sort((a, b) => Number(b.key) - Number(a.key));

        for (const entry of realKeys.slice(0, 5)) {
            console.log(`══════════════════════════════════════════════`);
            console.log(`📦 /sensors/${entry.key}  (uptime: ${(Number(entry.key) / 1000).toFixed(0)}s)`);
            console.log(`──────────────────────────────────────────────`);
            const d = entry.data;
            const fields = [
                ["temperature", d.temperature, "°C"],
                ["humidity", d.humidity, "%"],
                ["lux", d.lux, "lux"],
                ["co2ppm", d.co2ppm, "ppm"],
                ["ppmNH3", d.ppmNH3, "ppm"],
                ["ppmH2S", d.ppmH2S, "ppm"],
                ["so2ppm", d.so2ppm, "ppm"],
                ["pm25", d.pm25, "µg/m³"],
                ["pm10", d.pm10, "µg/m³"],
            ];
            for (const [name, val, unit] of fields) {
                const v = val ?? -1;
                const display = v === 0 ? "0 (offline)" : `${v} ${unit}`;
                console.log(`  ${name.padEnd(14)} : ${display}`);
            }
            console.log();
        }
    }

    console.log("✅ Done.\n");
    process.exit(0);
}

main().catch((err) => {
    console.error("Fatal:", err.message);
    process.exit(1);
});
