#include "sync.h"

#include <Arduino.h>
#include <HTTPClient.h>
#include <LittleFS.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <string.h>
#include <time.h>
#include "bank.h"
#include "device_api.h"
#include "settings.h"
#include "srs.h"
#include "wifi_link.h"

static void stamp(bool failed) {
  time_t now = time(nullptr);
  struct tm local;
  if (now > 1700000000 && localtime_r(&now, &local)) {
    snprintf(settings().lastSync, sizeof(settings().lastSync), "%04d-%02d-%02d %02d:%02d",
             local.tm_year + 1900, local.tm_mon + 1, local.tm_mday, local.tm_hour, local.tm_min);
  } else if (failed) {
    strncpy(settings().lastSync, "failed", sizeof(settings().lastSync) - 1);
  }
  settings().syncFailed = failed ? 1 : 0;
  settingsSave();
}

static bool beginHttp(HTTPClient& http, WiFiClientSecure& client, const String& url) {
  client.setInsecure();
  http.setTimeout(25000);
  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
  if (!http.begin(client, url)) return false;
  if (settingsHasToken()) {
    http.addHeader("Authorization", String("Bearer ") + settings().token);
  }
  return true;
}

bool syncLogin(const char* email, const char* password) {
  if (wifiAirplane()) return false;
  if (!wifiConnected() && !wifiConnect(settings().ssid, settings().pass, 12000)) return false;
  configTime(0, 0, "pool.ntp.org");
  setenv("TZ", "CET-1CEST,M3.5.0,M10.5.0/3", 1);
  tzset();
  WiFiClientSecure client;
  HTTPClient http;
  String url = String(settingsBaseUrl()) + DEVICE_API_LOGIN;
  if (!beginHttp(http, client, url)) return false;
  http.addHeader("Content-Type", "application/json");
  JsonDocument body;
  body["email"] = email;
  body["password"] = password;
  body["deviceName"] = "Pocket PDG";
  String payload;
  serializeJson(body, payload);
  int code = http.POST(payload);
  String response = http.getString();
  http.end();
  if (code != 200) return false;
  JsonDocument doc;
  if (deserializeJson(doc, response)) return false;
  const char* token = doc["token"] | "";
  if (!token[0]) return false;
  strncpy(settings().email, email, sizeof(settings().email) - 1);
  strncpy(settings().token, token, sizeof(settings().token) - 1);
  settingsSave();
  return true;
}

static bool pullBank() {
  char query[160];
  snprintf(query, sizeof(query), "%s%s?rank=E%d&updated_since=%ld",
           settingsBaseUrl(), DEVICE_API_BANK, settings().rank == 6 ? 6 : 5, (long)settings().bankGeneratedAt);
  WiFiClientSecure client;
  HTTPClient http;
  if (!beginHttp(http, client, query)) return false;
  int code = http.GET();
  if (code == 401) {
    settingsClearToken();
    http.end();
    return false;
  }
  if (code != 200) {
    http.end();
    return false;
  }
  String response = http.getString();
  http.end();
  JsonDocument head;
  if (deserializeJson(head, response)) return false;
  bool unchanged = head["unchanged"] | false;
  int32_t generated = head["generatedAt"] | 0;
  const char* hash = head["hash"] | "";
  if (unchanged) {
    settings().bankGeneratedAt = generated;
    strncpy(settings().bankHash, hash, sizeof(settings().bankHash) - 1);
    settingsSave();
    return true;
  }
  if (!head["items"].is<JsonArray>()) return false;
  File file = LittleFS.open("/bank.json", "w");
  if (!file) return false;
  file.print(response);
  file.close();
  if (!bankLoadFile()) return false;
  settings().bankGeneratedAt = generated;
  strncpy(settings().bankHash, hash, sizeof(settings().bankHash) - 1);
  settingsSave();
  return true;
}

static bool pullPushProgress() {
  WiFiClientSecure client;
  HTTPClient http;
  String url = String(settingsBaseUrl()) + DEVICE_API_PROGRESS;
  if (!beginHttp(http, client, url)) return false;
  int code = http.GET();
  String response = http.getString();
  http.end();
  if (code == 401) {
    settingsClearToken();
    return false;
  }
  if (code == 200) {
    if (!srsMergeRemote(response.c_str(), response.length())) return false;
  } else if (code != 404) {
    return false;
  }
  const char* body = srsExportJson();
  WiFiClientSecure client2;
  HTTPClient put;
  if (!beginHttp(put, client2, url)) return false;
  put.addHeader("Content-Type", "application/json");
  int putCode = put.PUT(body);
  String merged = put.getString();
  put.end();
  if (putCode != 200) return false;
  srsMergeRemote(merged.c_str(), merged.length());
  return true;
}

SyncResult syncNow() {
  if (wifiAirplane()) return SyncResult::Airplane;
  if (!settingsHasWifi()) return SyncResult::Offline;
  if (!wifiConnected() && !wifiConnect(settings().ssid, settings().pass, 12000)) {
    stamp(true);
    return SyncResult::Offline;
  }
  configTime(0, 0, "pool.ntp.org");
  setenv("TZ", "CET-1CEST,M3.5.0,M10.5.0/3", 1);
  tzset();
  if (!settingsHasToken()) {
    stamp(true);
    return SyncResult::Auth;
  }
  bool bankOk = pullBank();
  bool progressOk = pullPushProgress();
  if (!bankOk && !progressOk) {
    stamp(true);
    return settingsHasToken() ? SyncResult::Failed : SyncResult::Auth;
  }
  stamp(!(bankOk && progressOk));
  return (bankOk && progressOk) ? SyncResult::Ok : SyncResult::Failed;
}
