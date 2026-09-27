#include "sync.h"

#include <Arduino.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <string.h>
#include <time.h>
#include "bank.h"
#include "device_api.h"
#include "sd_store.h"
#include "settings.h"
#include "srs.h"
#include <SD_MMC.h>
#include "wifi_link.h"

static char lastError[140] = "";

const char* syncLastError() { return lastError; }

static void note(const char* msg) {
  strncpy(lastError, msg, sizeof(lastError) - 1);
  lastError[sizeof(lastError) - 1] = 0;
  Serial.println(lastError);
}

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

static bool streamBody(HTTPClient& http, const char* path) {
  WiFiClient* stream = http.getStreamPtr();
  if (!stream || !sdReady()) return false;
  char tmp[96];
  snprintf(tmp, sizeof(tmp), "%s.tmp", path);
  if (SD_MMC.exists(tmp)) SD_MMC.remove(tmp);
  File out = sdOpen(tmp, FILE_WRITE);
  if (!out) return false;
  int total = http.getSize();
  int got = 0;
  uint8_t buf[2048];
  uint32_t idle = millis();
  while (http.connected() || stream->available()) {
    int avail = stream->available();
    if (avail > 0) {
      int n = stream->readBytes(buf, avail > (int)sizeof(buf) ? sizeof(buf) : avail);
      if (n <= 0) break;
      if (out.write(buf, n) != (size_t)n) {
        out.close();
        return false;
      }
      got += n;
      idle = millis();
      if (total > 0 && got >= total) break;
    } else if (total >= 0 && got >= total) {
      break;
    } else if (millis() - idle > 12000) {
      break;
    } else {
      delay(2);
    }
  }
  out.close();
  Serial.printf("saved %d of %d bytes\n", got, total);
  if (got < 20) return false;
  if (total > 0 && got < total) return false;
  if (SD_MMC.exists(path)) SD_MMC.remove(path);
  return SD_MMC.rename(tmp, path);
}

static bool pullBank() {
  char query[180];
  snprintf(query, sizeof(query), "%s%s?rank=E%d&updated_since=%ld",
           settingsBaseUrl(), DEVICE_API_BANK, settings().rank == 6 ? 6 : 5, (long)settings().bankGeneratedAt);
  WiFiClientSecure client;
  HTTPClient http;
  if (!beginHttp(http, client, query)) {
    note("Could not open the bank request.");
    return false;
  }
  int code = http.GET();
  int size = http.getSize();
  Serial.printf("bank HTTP %d, %d bytes, heap %u, psram %u\n", code, size, ESP.getFreeHeap(), ESP.getFreePsram());
  if (code == 401) {
    settingsClearToken();
    http.end();
    note("Login expired. Log in again.");
    return false;
  }
  if (code != 200) {
    http.end();
    char msg[80];
    snprintf(msg, sizeof(msg), "Bank request failed (HTTP %d).", code);
    note(msg);
    return false;
  }
  if (size > 0 && size < 4096) {
    String response = http.getString();
    http.end();
    JsonDocument head;
    if (deserializeJson(head, response)) {
      note("Bank reply was not valid.");
      return false;
    }
    if (head["unchanged"] | false) {
      settings().bankGeneratedAt = head["generatedAt"] | settings().bankGeneratedAt;
      const char* hash = head["hash"] | "";
      if (hash[0]) strncpy(settings().bankHash, hash, sizeof(settings().bankHash) - 1);
      settingsSave();
      note("Bank already current.");
      return true;
    }
    if (!sdReplace(SD_PATH_BANK, response.c_str(), response.length())) {
      note("Could not write the bank to the SD card.");
      return false;
    }
  } else {
    bool saved = streamBody(http, SD_PATH_BANK);
    http.end();
    if (!saved) {
      note("Could not save the bank to the SD card.");
      return false;
    }
  }
  if (!bankLoadFile()) {
    if (!psramFound()) note("Enable OPI PSRAM in Tools and upload again. The bank is too big for internal RAM.");
    else note("Saved the bank, but it could not be loaded.");
    return false;
  }
  note("Bank loaded.");
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
    note("Login expired. Log in again.");
    return false;
  }
  if (code == 200) {
    if (!srsMergeRemote(response.c_str(), response.length())) {
      note("Progress reply was not valid.");
      return false;
    }
  } else if (code != 404) {
    char msg[64];
    snprintf(msg, sizeof(msg), "Progress read failed (HTTP %d).", code);
    note(msg);
    return false;
  }
  const char* body = srsExportJson();
  WiFiClientSecure client2;
  HTTPClient put;
  if (!beginHttp(put, client2, url)) {
    note("Could not open the progress upload.");
    return false;
  }
  put.addHeader("Content-Type", "application/json");
  int putCode = put.PUT(body);
  String merged = put.getString();
  put.end();
  Serial.printf("progress PUT %d\n", putCode);
  if (putCode != 200) {
    char msg[64];
    snprintf(msg, sizeof(msg), "Progress upload failed (HTTP %d).", putCode);
    note(msg);
    return false;
  }
  srsMergeRemote(merged.c_str(), merged.length());
  return true;
}

SyncResult syncNow() {
  lastError[0] = 0;
  if (wifiAirplane()) { note("Airplane mode is on."); return SyncResult::Airplane; }
  if (!settingsHasWifi()) { note("No Wi-Fi saved."); return SyncResult::Offline; }
  if (!wifiConnected() && !wifiConnect(settings().ssid, settings().pass, 12000)) {
    stamp(true);
    note("Could not join Wi-Fi.");
    return SyncResult::Offline;
  }
  configTime(0, 0, "pool.ntp.org");
  settingsApplyTz();
  if (!settingsHasToken()) {
    stamp(true);
    note("Log in to sync.");
    return SyncResult::Auth;
  }
  bool bankOk = pullBank();
  char bankMsg[140];
  strncpy(bankMsg, lastError, sizeof(bankMsg) - 1);
  bankMsg[sizeof(bankMsg) - 1] = 0;
  bool progressOk = pullPushProgress();
  if (bankOk && progressOk) {
    stamp(false);
    note("Sync finished.");
    return SyncResult::Ok;
  }
  stamp(true);
  if (!bankOk) note(bankMsg[0] ? bankMsg : "Bank sync failed.");
  return settingsHasToken() ? SyncResult::Failed : SyncResult::Auth;
}
