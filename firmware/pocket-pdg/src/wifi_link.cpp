#include "wifi_link.h"

#include <WebServer.h>
#include <WiFi.h>
#include "settings.h"

static WebServer server(80);
static bool apUp = false;
static bool portalSaved = false;
static String portalSsid;
static String portalPass;

void wifiForceOff() {
  if (apUp) server.stop();
  apUp = false;
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
}

bool wifiAirplane() { return settings().airplane != 0; }

bool wifiConnect(const char* ssid, const char* pass, uint32_t timeoutMs) {
  if (wifiAirplane() || !ssid || !ssid[0]) return false;
  if (apUp) wifiStopAp();
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, pass);
  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < timeoutMs) {
    delay(40);
  }
  return WiFi.status() == WL_CONNECTED;
}

static void handleRoot() {
  server.send(200, "text/html",
              "<!doctype html><meta name=viewport content=\"width=device-width,initial-scale=1\">"
              "<body style=\"font-family:sans-serif;background:#1c1c1c;color:#f4f1ea;padding:16px\">"
              "<h1>Pocket PDG</h1><p>Join this network, then save the Wi-Fi the brick should use.</p>"
              "<form method=POST action=/save>"
              "<label>Network<br><input name=ssid required style=\"font-size:18px;width:100%\"></label><br><br>"
              "<label>Password<br><input name=pass type=password style=\"font-size:18px;width:100%\"></label><br><br>"
              "<button style=\"font-size:18px;padding:12px 16px\">Save</button></form></body>");
}

static void handleSave() {
  portalSsid = server.arg("ssid");
  portalPass = server.arg("pass");
  portalSsid.trim();
  portalSaved = portalSsid.length() > 0;
  server.send(200, "text/html",
              "<body style=\"font-family:sans-serif;background:#1c1c1c;color:#f4f1ea;padding:16px\">"
              "<h1>Saved</h1><p>You can leave this page. The brick will join that network.</p></body>");
}

void wifiStartSetupAp() {
  if (wifiAirplane()) return;
  WiFi.mode(WIFI_AP);
  WiFi.softAP("PocketPDG-Setup");
  server.on("/", HTTP_GET, handleRoot);
  server.on("/save", HTTP_POST, handleSave);
  server.begin();
  apUp = true;
  portalSaved = false;
}

void wifiStopAp() {
  if (!apUp) return;
  server.stop();
  WiFi.softAPdisconnect(true);
  apUp = false;
}

bool wifiApUp() { return apUp; }
void wifiHandle() {
  if (apUp) server.handleClient();
}
bool wifiConnected() { return WiFi.status() == WL_CONNECTED; }
int wifiRssi() { return wifiConnected() ? WiFi.RSSI() : 0; }

struct WifiHit {
  char ssid[33];
  int rssi;
};

static WifiHit hits[10];
static int hitCount = 0;

int wifiScan() {
  hitCount = 0;
  if (apUp) wifiStopAp();
  WiFi.mode(WIFI_STA);
  WiFi.disconnect(false, false);
  delay(60);
  int found = WiFi.scanNetworks(false, true);
  if (found < 0) found = 0;
  for (int i = 0; i < found; i++) {
    String name = WiFi.SSID(i);
    name.trim();
    if (!name.length() || name.length() > 32) continue;
    int rssi = WiFi.RSSI(i);
    int slot = -1;
    for (int j = 0; j < hitCount; j++) {
      if (strcmp(hits[j].ssid, name.c_str()) == 0) slot = j;
    }
    if (slot >= 0) {
      if (rssi > hits[slot].rssi) hits[slot].rssi = rssi;
      continue;
    }
    if (hitCount >= 10) continue;
    strncpy(hits[hitCount].ssid, name.c_str(), sizeof(hits[hitCount].ssid) - 1);
    hits[hitCount].ssid[sizeof(hits[hitCount].ssid) - 1] = 0;
    hits[hitCount].rssi = rssi;
    hitCount++;
  }
  for (int i = 0; i < hitCount; i++) {
    for (int j = i + 1; j < hitCount; j++) {
      if (hits[j].rssi > hits[i].rssi) {
        WifiHit tmp = hits[i];
        hits[i] = hits[j];
        hits[j] = tmp;
      }
    }
  }
  WiFi.scanDelete();
  return hitCount;
}

int wifiScanCount() { return hitCount; }
const char* wifiScanSsid(int index) {
  if (index < 0 || index >= hitCount) return "";
  return hits[index].ssid;
}
int wifiScanRssi(int index) {
  if (index < 0 || index >= hitCount) return 0;
  return hits[index].rssi;
}
void wifiNotePortalSaved(bool saved) { portalSaved = saved; }
bool wifiPortalSaved() { return portalSaved; }
const char* wifiPortalSsid() { return portalSsid.c_str(); }
const char* wifiPortalPass() { return portalPass.c_str(); }
