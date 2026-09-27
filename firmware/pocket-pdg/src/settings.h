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
  uint8_t theme;
  uint32_t colorBg;
  uint32_t colorFg;
  uint32_t colorBtn;
  uint32_t colorBtnFg;
  uint8_t hapticLevel;
  uint8_t clock12;
  int16_t tzMinutes;
};

void settingsBegin();
Settings& settings();
void settingsSave();
void settingsFactoryReset();
void settingsNoteToday(bool correct);
int settingsStreakDays(const char* today);
PocketSchedule settingsSchedule();
bool settingsHasWifi();
bool settingsHasToken();
void settingsClearToken();
const char* settingsBaseUrl();
void settingsApplyTz();
