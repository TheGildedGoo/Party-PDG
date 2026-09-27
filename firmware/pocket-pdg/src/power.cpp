#include "power.h"

#include <Arduino.h>
#include <WiFi.h>
#include <esp_sleep.h>
#include <time.h>
#include "audio.h"
#include "board_pins.h"
#include "haptic.h"
#include "schedule.h"
#include "settings.h"
#include "wifi_link.h"

static uint32_t awakeAt = 0;
static bool dimmed = false;

void powerBegin() {
  ledcSetup(0, 5000, 8);
  ledcAttachPin(PIN_LCD_BL, 0);
  awakeAt = millis();
  powerSetBrightness(settings().brightness);
  analogReadResolution(12);
  analogSetPinAttenuation(PIN_BAT_ADC, ADC_11db);
}

void powerSetBrightness(uint8_t percent) {
  if (percent < 5) percent = 5;
  if (percent > 100) percent = 100;
  settings().brightness = percent;
  ledcWrite(0, (uint32_t)percent * 255 / 100);
  dimmed = false;
  awakeAt = millis();
}

void powerWakeScreen() {
  awakeAt = millis();
  if (dimmed) powerSetBrightness(settings().brightness);
}

void powerDimCheck(bool waiting) {
  uint32_t idle = millis() - awakeAt;
  if (waiting && idle > 45000) {
    ledcWrite(0, 0);
    dimmed = true;
    return;
  }
  if (idle > 20000 && !dimmed) {
    uint8_t low = settings().brightness / 4;
    if (low < 5) low = 5;
    ledcWrite(0, (uint32_t)low * 255 / 100);
    dimmed = true;
  }
}

int powerBatteryPercent() {
  int raw = analogRead(PIN_BAT_ADC);
  if (raw < 50) return -1;
  float pinV = (raw / 4095.0f) * 3.3f;
  float bat = pinV * BAT_DIVIDER;
  float pct = (bat - BAT_EMPTY_V) / (BAT_FULL_V - BAT_EMPTY_V) * 100.0f;
  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;
  return (int)pct;
}

bool powerQuietNow() {
  time_t now = time(nullptr);
  struct tm local;
  if (now < 1700000000 || !localtime_r(&now, &local)) return false;
  return minuteInQuiet(local.tm_hour * 60 + local.tm_min, settingsSchedule());
}

bool powerWokeFromTimer() {
  return esp_sleep_get_wakeup_cause() == ESP_SLEEP_WAKEUP_TIMER;
}

void powerSleepUntilSchedule() {
  time_t now = time(nullptr);
  time_t when = 0;
  if (now > 1700000000) when = nextWakeUnix(now, settingsSchedule());
  uint64_t usec = 8ULL * 3600ULL * 1000000ULL;
  if (when > now + 30) usec = (uint64_t)(when - now) * 1000000ULL;
  wifiForceOff();
  audioOff();
  hapticStandby();
  ledcWrite(0, 0);
  esp_sleep_disable_wakeup_source(ESP_SLEEP_WAKEUP_ALL);
  esp_sleep_enable_timer_wakeup(usec);
  pinMode(PIN_TP_INT, INPUT_PULLUP);
  esp_sleep_enable_ext0_wakeup((gpio_num_t)PIN_TP_INT, 0);
  esp_deep_sleep_start();
}
