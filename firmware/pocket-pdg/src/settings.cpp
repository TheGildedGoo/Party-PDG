#include "settings.h"

#include <Preferences.h>
#include <stdio.h>
#include <string.h>
#include <time.h>
#include "device_api.h"

static Preferences prefs;
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
  const uint16_t seeds[6] = {8 * 60, 12 * 60, 16 * 60, 20 * 60, 7 * 60, 21 * 60};
  for (int i = 0; i < 6; i++) state.slotMin[i] = seeds[i];
}

void settingsBegin() {
  defaults();
  prefs.begin("pocket", false);
  if (prefs.getUChar("ready", 0) != 1) {
    settingsSave();
    return;
  }
  copyText(state.ssid, sizeof(state.ssid), prefs.getString("ssid", "").c_str());
  copyText(state.pass, sizeof(state.pass), prefs.getString("pass", "").c_str());
  copyText(state.email, sizeof(state.email), prefs.getString("email", "").c_str());
  copyText(state.token, sizeof(state.token), prefs.getString("token", "").c_str());
  copyText(state.baseUrl, sizeof(state.baseUrl), prefs.getString("base", POCKET_BASE_URL).c_str());
  state.rank = prefs.getUChar("rank", 5);
  state.sessionSize = prefs.getUChar("size", 5);
  state.hapticOn = prefs.getUChar("haptic", 1);
  state.soundOn = prefs.getUChar("sound", 1);
  state.airplane = prefs.getUChar("air", 0);
  state.brightness = prefs.getUChar("bright", 70);
  state.quietOn = prefs.getUChar("qon", 1);
  state.quietStart = prefs.getUShort("qs", 22 * 60);
  state.quietEnd = prefs.getUShort("qe", 6 * 60);
  state.chapterMask = prefs.getUInt("ch", 0x00FFFFFFu);
  copyText(state.lastSync, sizeof(state.lastSync), prefs.getString("sync", "never").c_str());
  state.syncFailed = prefs.getUChar("syncbad", 0);
  copyText(state.today, sizeof(state.today), prefs.getString("day", "").c_str());
  state.todayCorrect = prefs.getUShort("dc", 0);
  state.todayWrong = prefs.getUShort("dw", 0);
  state.bankGeneratedAt = prefs.getInt("bgen", 0);
  copyText(state.bankHash, sizeof(state.bankHash), prefs.getString("bhash", "").c_str());
  for (int i = 0; i < 6; i++) {
    char key[8];
    snprintf(key, sizeof(key), "s%d", i);
    state.slotMin[i] = prefs.getUShort(key, state.slotMin[i]);
    snprintf(key, sizeof(key), "o%d", i);
    state.slotOn[i] = prefs.getUChar(key, 0);
  }
  if (state.rank != 6) state.rank = 5;
  if (state.sessionSize != 3 && state.sessionSize != 5 && state.sessionSize != 10 && state.sessionSize != 15) {
    state.sessionSize = 5;
  }
  if (state.brightness < 5) state.brightness = 5;
  if (!state.baseUrl[0]) copyText(state.baseUrl, sizeof(state.baseUrl), POCKET_BASE_URL);
}

Settings& settings() { return state; }

void settingsSave() {
  prefs.putUChar("ready", 1);
  prefs.putString("ssid", state.ssid);
  prefs.putString("pass", state.pass);
  prefs.putString("email", state.email);
  prefs.putString("token", state.token);
  prefs.putString("base", state.baseUrl);
  prefs.putUChar("rank", state.rank);
  prefs.putUChar("size", state.sessionSize);
  prefs.putUChar("haptic", state.hapticOn);
  prefs.putUChar("sound", state.soundOn);
  prefs.putUChar("air", state.airplane);
  prefs.putUChar("bright", state.brightness);
  prefs.putUChar("qon", state.quietOn);
  prefs.putUShort("qs", state.quietStart);
  prefs.putUShort("qe", state.quietEnd);
  prefs.putUInt("ch", state.chapterMask);
  prefs.putString("sync", state.lastSync);
  prefs.putUChar("syncbad", state.syncFailed);
  prefs.putString("day", state.today);
  prefs.putUShort("dc", state.todayCorrect);
  prefs.putUShort("dw", state.todayWrong);
  prefs.putInt("bgen", state.bankGeneratedAt);
  prefs.putString("bhash", state.bankHash);
  for (int i = 0; i < 6; i++) {
    char key[8];
    snprintf(key, sizeof(key), "s%d", i);
    prefs.putUShort(key, state.slotMin[i]);
    snprintf(key, sizeof(key), "o%d", i);
    prefs.putUChar(key, state.slotOn[i]);
  }
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
