/**
 * ============================================================
 *  POULTRY FARMING SENSOR NODE
 *  Board  : ESP32
 *  Lib    : Firebase ESP Client by Mobizt (v4.x+)
 *           https://github.com/mobizt/Firebase-ESP-Client
 *  Sensors: NH3, H2S, CO2 (UART), PM2.5/PM10 (SDS011 UART),
 *           SO2 (UART), DHT11, LDR
 * ============================================================
 */

#include <Arduino.h>
#include <WiFi.h>
#include <FirebaseESP32.h>
#include <addons/TokenHelper.h>
#include <addons/RTDBHelper.h>
#include <DHT.h>

// ── WiFi ─────────────────────────────────────────────────────
#define WIFI_SSID      "OPPO A6x 5G h3ed"
#define WIFI_PASSWORD  ""

// ── Firebase ─────────────────────────────────────────────────
#define DATABASE_URL   "https://poultryfaring-default-rtdb.asia-southeast1.firebasedatabase.app"
#define DATABASE_SECRET "rAPsUY5BTK3PTdo2raXjQWdGls7YdG80VLwNcPNb"

FirebaseData   fbdo;
FirebaseAuth   auth;
FirebaseConfig config;

// ── Analog Gas Sensors ────────────────────────────────────────
#define NH3_PIN            34
#define H2S_PIN            35
#define ADC_RESOLUTION     4095.0f
#define VREF               3.3f
#define R_FEEDBACK         100000.0f   // 100 kΩ
#define SENSOR_SENSITIVITY 100.0f      // nA / ppm

// ── CO2 Sensor (MH-Z19 / MH-Z14 UART) ────────────────────────
#define CO2_RX       4
#define CO2_TX       5
#define CO2_ZERO_PIN 18

// ── PM Sensor (SDS011 UART) ───────────────────────────────────
#define PM_RX  16
#define PM_TX  17

// ── SO2 Sensor (UART, same protocol as CO2) ──────────────────
#define SO2_RX  21
#define SO2_TX  19

// ── DHT11 ─────────────────────────────────────────────────────
#define DHT_PIN   32
#define DHT_TYPE  DHT11

// ── LDR ──────────────────────────────────────────────────────
#define LDR_PIN       33
#define REF_RESISTOR  10.0f   // kΩ

// ── UART commands ─────────────────────────────────────────────
static const uint8_t CO2_CMD[9] = {0xFF,0x01,0x86,0,0,0,0,0,0x79};
static const uint8_t SO2_CMD[9] = {0xFF,0x01,0x86,0,0,0,0,0,0x79};

DHT dht(DHT_PIN, DHT_TYPE);

// ── Forward declarations ──────────────────────────────────────
int   readCO2();
bool  readPM(int &pm25, int &pm10);
int   readSO2();
float readAnalogPPM(uint8_t pin);
void  connectWiFi();
void  initFirebase();
void  pushToFirebase(FirebaseJson &json);

// =============================================================
void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n=== POULTRY FARMING SENSOR NODE BOOT ===");

    analogReadResolution(12);

    pinMode(CO2_ZERO_PIN, OUTPUT);
    digitalWrite(CO2_ZERO_PIN, LOW);

    dht.begin();
    connectWiFi();
    initFirebase();
}

// =============================================================
void loop() {
    Serial.println("\n--- SENSOR READINGS ---");

    // ── NH3 ──
    float ppmNH3 = readAnalogPPM(NH3_PIN);
    if (isnan(ppmNH3) || ppmNH3 < 0.0f) ppmNH3 = 0.0f;
    Serial.printf("NH3 : %.3f ppm\n", ppmNH3);

    // ── H2S ──
    float ppmH2S = readAnalogPPM(H2S_PIN);
    if (isnan(ppmH2S) || ppmH2S < 0.0f) ppmH2S = 0.0f;
    Serial.printf("H2S : %.3f ppm\n", ppmH2S);

    // ── CO2 ──
    int co2ppm = readCO2();
    if (co2ppm < 0) co2ppm = 0;
    Serial.printf("CO2 : %d ppm\n", co2ppm);

    // ── PM2.5 / PM10 ──
    int pm25 = -1, pm10 = -1;
    if (!readPM(pm25, pm10)) {
        Serial.println("PM  : No response from sensor!");
        pm25 = 0;
        pm10 = 0;
    }
    Serial.printf("PM2.5: %d ug/m3  PM10: %d ug/m3\n", pm25, pm10);

    // ── SO2 ──
    int so2ppm = readSO2();
    if (so2ppm < 0) so2ppm = 0;
    Serial.printf("SO2 : %d ppm\n", so2ppm);

    // ── DHT11 (Temperature & Humidity) ──
    float temperature = dht.readTemperature();
    float humidity    = dht.readHumidity();
    if (isnan(temperature) || isnan(humidity)) {
        Serial.println("DHT : Read failed!");
        temperature = 0.0f;
        humidity    = 0.0f;
    } else {
        Serial.printf("Temp: %.2f C   Humidity: %.2f %%\n", temperature, humidity);
    }

    // ── LDR (Light / Lux) ──
    int ldrRaw = analogRead(LDR_PIN);
    float lux = 0.0f;
    if (ldrRaw == 0) {
        Serial.println("LDR : No signal (raw=0)");
    } else {
        float vOut = ldrRaw * (VREF / ADC_RESOLUTION);
        if (vOut <= 0.0f) {
            Serial.println("LDR : Invalid voltage");
        } else {
            float rLdr = REF_RESISTOR * ((VREF / vOut) - 1.0f);
            // Empirical formula — adjust exponent/multiplier for your LDR type
            lux = pow((500.0f / rLdr), 1.4f) * 1000.0f;
            if (isnan(lux) || lux < 0.0f || isinf(lux)) lux = 0.0f;
            Serial.printf("LDR : %.2f lux\n", lux);
        }
    }

    // ── Build JSON payload ──
    FirebaseJson json;
    json.set("timestamp",   (int)(millis() / 1000));
    json.set("ppmNH3",      ppmNH3);
    json.set("ppmH2S",      ppmH2S);
    json.set("co2ppm",      co2ppm);
    json.set("pm25",        pm25);
    json.set("pm10",        pm10);
    json.set("so2ppm",      so2ppm);
    json.set("temperature", temperature);
    json.set("humidity",    humidity);
    json.set("lux",         lux);

    pushToFirebase(json);

    Serial.println("--- END OF CYCLE ---");
    delay(5000);
}

// =============================================================
// WiFi
// =============================================================
void connectWiFi() {
    Serial.printf("Connecting to WiFi: %s\n", WIFI_SSID);
    WiFi.mode(WIFI_STA);
    if (strlen(WIFI_PASSWORD) == 0) {
        WiFi.begin(WIFI_SSID);
    } else {
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    }

    int retry = 0;
    while (WiFi.status() != WL_CONNECTED && retry < 40) {
        delay(500);
        Serial.printf("Attempt %d: Status=%d\n", retry + 1, WiFi.status());
        retry++;
    }
    if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("[WiFi] Connected. IP: %s\n", WiFi.localIP().toString().c_str());
    } else {
        Serial.println("[WiFi] Failed to connect. Continuing without WiFi.");
    }
}

// =============================================================
// Firebase initialisation
// =============================================================
void initFirebase() {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[Firebase] Skipped - no WiFi.");
        return;
    }

    config.database_url = DATABASE_URL;
    config.signer.tokens.legacy_token = DATABASE_SECRET;
    config.timeout.serverResponse = 10 * 1000;

    Firebase.begin(&config, &auth);
    Firebase.reconnectWiFi(true);

    Serial.print("[Firebase] Authenticating");
    unsigned long t0 = millis();
    while (!Firebase.ready() && millis() - t0 < 15000) {
        delay(300);
        Serial.print(".");
    }
    Serial.println(Firebase.ready()
        ? "\n[Firebase] Ready!"
        : "\n[Firebase] Not ready. Check DB secret & URL.");
}

// =============================================================
// Push JSON to /sensors/<millis>
// =============================================================
void pushToFirebase(FirebaseJson &json) {
    if (!Firebase.ready()) {
        Serial.println("[Firebase] Not ready - skipping upload.");
        return;
    }

    char path[40];
    snprintf(path, sizeof(path), "/sensors/%lu", millis());

    if (Firebase.setJSON(fbdo, path, json)) {
        Serial.print("[Firebase] Uploaded: ");
        Serial.println(path);
    } else {
        Serial.print("[Firebase] Error: ");
        Serial.println(fbdo.errorReason());
    }
}

// =============================================================
// Sensor helpers
// =============================================================

float readAnalogPPM(uint8_t pin) {
    int   raw     = analogRead(pin);
    float voltage = (raw / ADC_RESOLUTION) * VREF;
    float current = (voltage / R_FEEDBACK) * 1e9f;  // nA
    return current / SENSOR_SENSITIVITY;             // ppm
}

int readCO2() {
    Serial1.end();
    Serial1.begin(9600, SERIAL_8N1, CO2_RX, CO2_TX);
    delay(50);
    while (Serial1.available()) Serial1.read();

    Serial1.write(CO2_CMD, 9);
    delay(150);

    if (Serial1.available() >= 9) {
        uint8_t buf[9];
        Serial1.readBytes(buf, 9);
        if (buf[0] == 0xFF && buf[1] == 0x86) {
            return (buf[2] << 8) | buf[3];
        }
    }
    Serial.println("CO2: No valid response.");
    return -1;
}

bool readPM(int &pm25, int &pm10) {
    Serial1.end();
    Serial1.begin(9600, SERIAL_8N1, PM_RX, PM_TX);
    delay(1500);

    unsigned long t0 = millis();
    while (millis() - t0 < 2000) {
        if (Serial1.available() >= 10 && Serial1.read() == 0xAA) {
            uint8_t buf[9];
            Serial1.readBytes(buf, 9);
            if (buf[0] == 0xC0 && buf[8] == 0xAB) {
                pm25 = ((buf[2] << 8) | buf[1]) / 10;
                pm10 = ((buf[4] << 8) | buf[3]) / 10;
                return true;
            }
        }
    }
    return false;
}

int readSO2() {
    Serial1.end();
    Serial1.begin(9600, SERIAL_8N1, SO2_RX, SO2_TX);
    delay(50);
    while (Serial1.available()) Serial1.read();

    Serial1.write(SO2_CMD, 9);
    delay(150);

    if (Serial1.available() >= 9) {
        uint8_t buf[9];
        Serial1.readBytes(buf, 9);
        if (buf[0] == 0xFF && buf[1] == 0x86) {
            return (buf[2] << 8) | buf[3];
        }
    }
    Serial.println("SO2: No valid response.");
    return -1;
}
