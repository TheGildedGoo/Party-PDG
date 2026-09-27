#include "settings.h"

#include <ArduinoJson.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include "device_api.h"
#include "sd_store.h"
#include "wifi_link.h"
#include <SD_MMC.h>

static Settings state;

static void copyText(char* dst, size_t n, const char* src) {
  if (!src) src = "";
  strncpy(dst, src, n - 1);
  dst[n - 1] = 0;
}

static void defaults() {
  memset(&state, 0, sizeof(state));
  copyText(state.baseUrl, sizeof(state.baseUrl), POCKET_BASE_URL);
  state.rank = 5;
  state.sessionSize = 5;
  state.hapticOn = 1;
  state.soundOn = 1;
  state.brightness = 70;
  state.quietOn = 1;
  state.quietStart = 22 * 60;
  state.quietEnd = 6 * 60;
  state.chapterMask = 0x00FFFFFFu;
  copyText(state.lastSync, sizeof(state.lastSync), "never");
  state.theme = 0;
  state.colorBg = 0x000000;
  state.colorFg = 0xFFFFFF;
  state.colorBtn = 0x8EB7FF;
  state.colorBtnFg = 0x102033;
  state.hapticLevel = 45;
  state.clock12 = 0;
  state.tzMinutes = 120;
  const uint16_t seeds[6] = {8 * 60, 12 * 60, 16 * 60, 20 * 60, 7 * 60, 21 * 60};
  for (int i = 0; i < 6; i++) state.slotMin[i] = seeds[i];
}

static void clamp() {
  if (state.rank != 6) state.rank = 5;
  if (state.sessionSize != 3 && state.sessionSize != 5 && state.sessionSize != 10 && state.sessionSize != 15) {
    state.sessionSize = 5;
  }
  if (state.brightness < 5) state.brightness = 5;
  if (state.theme > 3) state.theme = 0;
  if (state.hapticLevel < 1 || state.hapticLevel > 100) state.hapticLevel = 45;
  if (!state.colorBtnFg) state.colorBtnFg = 0x102033;
  if (state.tzMinutes < -12 * 60 || state.tzMinutes > 14 * 60) state.tzMinutes = 120;
  if (!state.colorBg && !state.colorFg) {
    state.colorBg = 0x0B0D10;
    state.colorFg = 0xE6E6E6;
    state.colorBtn = 0x8AB4F8;
  }
  if (!state.baseUrl[0]) copyText(state.baseUrl, sizeof(state.baseUrl), POCKET_BASE_URL);
}

static void readDoc(JsonDocument& doc) {
  copyText(state.ssid, sizeof(state.ssid), doc["ssid"] | "");
  copyText(state.pass, sizeof(state.pass), doc["pass"] | "");
  copyText(state.email, sizeof(state.email), doc["email"] | "");
  copyText(state.token, sizeof(state.token), doc["token"] | "");
  copyText(state.baseUrl, sizeof(state.baseUrl), doc["baseUrl"] | POCKET_BASE_URL);
  state.rank = doc["rank"] | 5;
  state.sessionSize = doc["sessionSize"] | 5;
  state.hapticOn = doc["hapticOn"] | 1;
  state.soundOn = doc["soundOn"] | 1;
  state.airplane = doc["airplane"] | 0;
  state.brightness = doc["brightness"] | 70;
  state.quietOn = doc["quietOn"] | 1;
  state.quietStart = doc["quietStart"] | (22 * 60);
  state.quietEnd = doc["quietEnd"] | (6 * 60);
  state.chapterMask = doc["chapterMask"] | 0x00FFFFFFu;
  copyText(state.lastSync, sizeof(state.lastSync), doc["lastSync"] | "never");
  state.syncFailed = doc["syncFailed"] | 0;
  copyText(state.today, sizeof(state.today), doc["today"] | "");
  state.todayCorrect = doc["todayCorrect"] | 0;
  state.todayWrong = doc["todayWrong"] | 0;
  state.bankGeneratedAt = doc["bankGeneratedAt"] | 0;
  copyText(state.bankHash, sizeof(state.bankHash), doc["bankHash"] | "");
  state.theme = doc["theme"] | 0;
  state.colorBg = doc["colorBg"] | 0x000000;
  state.colorFg = doc["colorFg"] | 0xFFFFFF;
  state.colorBtn = doc["colorBtn"] | 0x8EB7FF;
  state.colorBtnFg = doc["colorBtnFg"] | 0x102033;
  state.hapticLevel = doc["hapticLevel"] | 45;
  if (doc["colorBtnFg"].isNull() && state.hapticLevel > 0 && state.hapticLevel <= 5) {
    state.hapticLevel = (uint8_t)(state.hapticLevel * 18);
  }
  state.clock12 = doc["clock12"] | 0;
  state.tzMinutes = doc["tzMinutes"] | 120;
  JsonArray slots = doc["slots"].as<JsonArray>();
  int i = 0;
  for (JsonObject slot : slots) {
    if (i >= 6) break;
    state.slotOn[i] = slot["on"] | 0;
    state.slotMin[i] = slot["min"] | state.slotMin[i];
    i++;
  }
  clamp();
}

void settingsBegin() {
  defaults();
  if (sdReady()) {
    File file = sdOpen(SD_PATH_SETTINGS, FILE_READ);
    if (!file) settingsSave();
    else {
      JsonDocument doc;
      DeserializationError err = deserializeJson(doc, file);
      file.close();
      if (err) settingsSave();
      else readDoc(doc);
    }
  }
  settingsApplyTz();
}

Settings& settings() { return state; }

void settingsSave() {
  if (!sdReady()) return;
  JsonDocument doc;
  doc["ssid"] = state.ssid;
  doc["pass"] = state.pass;
  doc["email"] = state.email;
  doc["token"] = state.token;
  doc["baseUrl"] = state.baseUrl;
  doc["rank"] = state.rank;
  doc["sessionSize"] = state.sessionSize;
  doc["hapticOn"] = state.hapticOn;
  doc["soundOn"] = state.soundOn;
  doc["airplane"] = state.airplane;
  doc["brightness"] = state.brightness;
  doc["quietOn"] = state.quietOn;
  doc["quietStart"] = state.quietStart;
  doc["quietEnd"] = state.quietEnd;
  doc["chapterMask"] = state.chapterMask;
  doc["lastSync"] = state.lastSync;
  doc["syncFailed"] = state.syncFailed;
  doc["today"] = state.today;
  doc["todayCorrect"] = state.todayCorrect;
  doc["todayWrong"] = state.todayWrong;
  doc["bankGeneratedAt"] = state.bankGeneratedAt;
  doc["bankHash"] = state.bankHash;
  doc["theme"] = state.theme;
  doc["colorBg"] = state.colorBg;
  doc["colorFg"] = state.colorFg;
  doc["colorBtn"] = state.colorBtn;
  doc["colorBtnFg"] = state.colorBtnFg;
  doc["hapticLevel"] = state.hapticLevel;
  doc["clock12"] = state.clock12;
  doc["tzMinutes"] = state.tzMinutes;
  JsonArray slots = doc["slots"].to<JsonArray>();
  for (int i = 0; i < 6; i++) {
    JsonObject slot = slots.add<JsonObject>();
    slot["on"] = state.slotOn[i];
    slot["min"] = state.slotMin[i];
  }
  String body;
  serializeJson(doc, body);
  sdReplace(SD_PATH_SETTINGS, body.c_str(), body.length());
}

void settingsFactoryReset() {
  wifiForceOff();
  defaults();
  settingsSave();
  if (sdReady()) {
    SD_MMC.remove(SD_PATH_PROGRESS);
    SD_MMC.remove("/pocket/progress.json.tmp");
  }
  delay(80);
  ESP.restart();
}

void settingsNoteToday(bool correct) {
  time_t now = time(nullptr);
  struct tm local;
  if (now > 1700000000 && localtime_r(&now, &local)) {
    char day[11];
    snprintf(day, sizeof(day), "%04d-%02d-%02d", local.tm_year + 1900, local.tm_mon + 1, local.tm_mday);
    if (strcmp(state.today, day) != 0) {
      copyText(state.today, sizeof(state.today), day);
      state.todayCorrect = 0;
      state.todayWrong = 0;
    }
  }
  if (correct) state.todayCorrect++;
  else state.todayWrong++;
  settingsSave();
}

int settingsStreakDays(const char* /*today*/) { return 0; }

PocketSchedule settingsSchedule() {
  PocketSchedule sched = {};
  for (int i = 0; i < 6; i++) {
    sched.slotMin[i] = state.slotMin[i];
    sched.slotOn[i] = state.slotOn[i] != 0;
  }
  sched.quietStart = state.quietStart;
  sched.quietEnd = state.quietEnd;
  sched.quietOn = state.quietOn != 0;
  return sched;
}

bool settingsHasWifi() { return state.ssid[0] != 0; }
bool settingsHasToken() { return state.token[0] != 0; }

void settingsClearToken() {
  state.token[0] = 0;
  settingsSave();
}

const char* settingsBaseUrl() {
  return state.baseUrl[0] ? state.baseUrl : POCKET_BASE_URL;
}

void settingsApplyTz() {
  int mins = state.tzMinutes;
  int hours = mins / 60;
  int rem = mins % 60;
  if (rem < 0) rem = -rem;
  char tz[24];
  snprintf(tz, sizeof(tz), "UTC%+d:%02d", -hours, rem);
  setenv("TZ", tz, 1);
  tzset();
}
