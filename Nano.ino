#include <WiFi.h>
#include <HTTPClient.h>

// —— Wi-Fi credentials ——
const char* SSID     = "WiFi-5808";
const char* PASSWORD = "14731976";

// —— Central web server ——
const char* SERVER_HOST = "192.168.1.119";
const uint16_t SERVER_PORT = 4000;
const char* POST_PATH     = "/data";

// —— Sensor pins on the Nano ——
#define DOOR_PIN    10    // reed switch → GPIO 10 (INPUT_PULLUP)
#define TMP_PIN      A1   // TMP36 analog input
#define BUZZER_PIN  11    // beeper on door‐state change

// Track last states so we only POST on changes
bool lastDoorOpen = false;
bool lastTempHigh = false;

void setup() {
  Serial.begin(115200);
  while (!Serial) {}

  pinMode(DOOR_PIN,   INPUT_PULLUP);
  pinMode(BUZZER_PIN, OUTPUT);
  analogReadResolution(12);  // 0–4095

  // Read initial door state
  lastDoorOpen = (digitalRead(DOOR_PIN) == HIGH);

  // Join your AP (locks the radio to that 2.4 GHz channel)
  Serial.print("[NANO] Joining WiFi “");
  Serial.print(SSID);
  Serial.println("”");
  WiFi.mode(WIFI_STA);
  WiFi.begin(SSID, PASSWORD);

  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 5000) {
    Serial.print(".");
    delay(250);
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("[NANO] WiFi OK, IP = ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("[NANO] WiFi FAILED");
  }
}

void loop() {
  // 1) Read sensors
  bool doorOpen = (digitalRead(DOOR_PIN) == HIGH);

  int raw = analogRead(TMP_PIN);
  float voltage    = raw * (3.3f / 4095.0f);
  float temperature = (voltage - 0.5f) * 100.0f;  
  bool tempHigh    = (temperature > 50.0f);

  // 2) If door toggles, or temp just crossed above 50 °C, POST
  if (doorOpen != lastDoorOpen || (tempHigh && !lastTempHigh)) {
    // Beep on door change
    if (doorOpen != lastDoorOpen) {
      Serial.printf("[NANO] Door %s → %s\n",
                    lastDoorOpen ? "OPEN" : "CLOSED",
                    doorOpen     ? "OPEN" : "CLOSED");
      digitalWrite(BUZZER_PIN, HIGH);
      delay(100);
      digitalWrite(BUZZER_PIN, LOW);
    }

    // Build JSON payload
    String body = String("{\"node\":\"nano1\",") +
                  "\"door_open\":"   + String(doorOpen?"true":"false") + "," +
                  "\"temperature\":" + String(temperature,1) +
                  "}";

    // POST to web server
    String url = String("http://") + SERVER_HOST + ":" + SERVER_PORT + POST_PATH;
    Serial.print("[NANO] POST ");
    Serial.println(url);
    Serial.print("[NANO] BODY ");
    Serial.println(body);

    HTTPClient http;
    http.begin(url);
    http.addHeader("Content-Type","application/json");
    int code = http.POST(body);
    Serial.printf("[NANO] HTTP code = %d\n", code);
    http.end();

    // Update trackers
    lastDoorOpen = doorOpen;
    lastTempHigh = tempHigh;
  }

  delay(1000);
}
