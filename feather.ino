#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>

// —— Wi-Fi credentials ——
const char* SSID     = "WiFi-5808";
const char* PASSWORD = "14731976";

// —— Server settings ——
const char* SERVER        = "192.168.1.119";
const uint16_t PORT       = 4000;
const char* ACTIVATE_PATH = "/remote/active";
const char* CMD_PATH      = "/command";
const char* LATEST_PATH   = "/data/latest";

// —— TFT display instance ——
Adafruit_ST7789 tft = Adafruit_ST7789(TFT_CS, TFT_DC, TFT_RST);

// —— Remote state ——
bool remoteActive  = false;
bool locked        = false;
bool warningActive = false;
String warningTime;

// Activate remote on server
void activateRemote() {
  HTTPClient http;
  http.begin(String("http://") + SERVER + ":" + PORT + ACTIVATE_PATH);
  http.addHeader("Content-Type", "application/json");
  http.POST("{\"active\":true}");
  http.end();
}

// Fetch remote active flag
void fetchRemoteActive() {
  HTTPClient http;
  http.begin(String("http://") + SERVER + ":" + PORT + ACTIVATE_PATH);
  if (http.GET() == 200) {
    StaticJsonDocument<64> doc;
    deserializeJson(doc, http.getString());
    remoteActive = doc["active"];
  }
  http.end();
}

// Fetch latest lock/unlock command
void fetchCommand() {
  HTTPClient http;
  http.begin(String("http://") + SERVER + ":" + PORT + CMD_PATH);
  if (http.GET() == 200) {
    StaticJsonDocument<128> doc;
    deserializeJson(doc, http.getString());
    const char* action = doc["action"];
    locked = (strcmp(action, "lock") == 0);
  }
  http.end();
}

// Fetch the latest sensor reading
bool fetchLatest(bool &outDoor, float &outTemp, String &outTime) {
  HTTPClient http;
  http.begin(String("http://") + SERVER + ":" + PORT + LATEST_PATH);
  if (http.GET() == 200) {
    StaticJsonDocument<256> doc;
    deserializeJson(doc, http.getString());
    outDoor = doc["door_open"];
    outTemp = doc["temperature"];
    outTime = String(doc["timestamp"].as<const char*>());
    http.end();
    return true;
  }
  http.end();
  return false;
}

// Display normal reading
void displayReading(bool doorOpen, float temp) {
  tft.fillScreen(doorOpen ? ST77XX_RED : ST77XX_GREEN);
  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(3);
  tft.setCursor(10, 50);
  tft.print(doorOpen ? "DOOR OPEN" : "DOOR CLOSED");
  tft.setTextSize(2);
  tft.setCursor(10, 120);
  tft.printf("Temp: %.1fC", temp);
}

// Display full-screen warning
void displayWarning(const String &time) {
  tft.fillScreen(ST77XX_YELLOW);
  tft.setTextColor(ST77XX_BLACK);
  tft.setTextSize(4);
  tft.setCursor(10, 40);
  tft.print("!!! WARNING !!!");
  tft.setTextSize(2);
  tft.setCursor(10, 100);
  tft.print("Locked door opened");
  tft.setCursor(10, 130);
  tft.print("at:");
  tft.setCursor(10, 160);
  tft.print(time);
}

// Setup
void setup() {
  Serial.begin(115200);
  // TFT init
  pinMode(TFT_BACKLITE, OUTPUT); digitalWrite(TFT_BACKLITE, HIGH);
  pinMode(TFT_I2C_POWER, OUTPUT); digitalWrite(TFT_I2C_POWER, HIGH);
  delay(10);
  tft.init(135, 240);
  tft.setRotation(3);
  tft.fillScreen(ST77XX_BLACK);
  // Wi-Fi connect
  WiFi.begin(SSID, PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(250);
  }
  activateRemote();
}

// Main loop
void loop() {
  fetchRemoteActive();
  fetchCommand();

  if (remoteActive) {
    bool door;
    float temp;
    String time;
    if (fetchLatest(door, temp, time)) {
      if (locked && door) {
        // show a 3-second warning
        if (!warningActive) {
          warningActive = true;
          displayWarning(time);
          delay(3000);
          warningActive = false;
        }
      } else {
        // normal display
        warningActive = false;
        displayReading(door, temp);
      }
    }
  } else {
    // remote off screen
    tft.fillScreen(ST77XX_BLACK);
    tft.setTextColor(ST77XX_WHITE);
    tft.setTextSize(2);
    tft.setCursor(10, 100);
    tft.print("REMOTE OFF");
  }

  delay(1000);  // poll every second
}
