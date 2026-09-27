#pragma once

#include <stdint.h>
#include "schedule.h"

struct Settings {
  char ssid[33];
  char pass[65];
  char email[80];
  char token[160];
  char baseUrl[96];
  uint8_t rank;
  uint8_t sessionSize;
  uint8_t hapticOn;
  uint8_t soundOn;
  uint8_t airplane;
  uint8_t brightness;
  uint8_t slotOn[6];
  uint16_t slotMin[6];
  uint8_t quietOn;
  uint16_t quietStart;
  uint16_t quietEnd;
  uint32_t chapterMask;
  char lastSync[32];
  uint8_t syncFailed;
  char today[11];
  uint16_t todayCorrect;
  uint16_t todayWrong;
  int32_t bankGeneratedAt;
  char bankHash[68];
};

void settingsBegin();
Settings& settings();
void settingsSave();
void settingsNoteToday(bool correct);
int settingsStreakDays(const char* today);
PocketSchedule settingsSchedule();
bool settingsHasWifi();
bool settingsHasToken();
void settingsClearToken();
const char* settingsBaseUrl();
