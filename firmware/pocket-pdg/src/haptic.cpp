#include "haptic.h"

#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_DRV2605.h>
#include "board_pins.h"
#include "settings.h"

static Adafruit_DRV2605 drv;
static bool ready = false;

void i2cBegin() {
  static bool started = false;
  if (started) return;
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  Wire.setClock(100000);
  pinMode(PIN_TP_RST, OUTPUT);
  digitalWrite(PIN_TP_RST, LOW);
  delay(8);
  digitalWrite(PIN_TP_RST, HIGH);
  delay(40);
  started = true;
}

static bool probe(uint8_t addr) {
  Wire.beginTransmission(addr);
  return Wire.endTransmission() == 0;
}

void i2cScan(bool* touch, bool* haptic, bool* codec) {
  i2cBegin();
  if (touch) *touch = probe(TP_I2C_ADDR);
  if (haptic) *haptic = probe(HAPTIC_I2C_ADDR);
  if (codec) *codec = probe(CODEC_I2C_ADDR);
}

void hapticBegin() {
  i2cBegin();
  ready = drv.begin(&Wire);
  if (!ready) {
    Serial.println("DRV2605L not found at 0x5A");
    return;
  }
  drv.selectLibrary(1);
  drv.useERM();
  drv.setMode(DRV2605_MODE_INTTRIG);
  Serial.println("DRV2605L ERM library 1");
}

bool hapticReady() { return ready; }
static uint8_t levelEffect(bool hard) {
  uint8_t level = settings().hapticLevel;
  if (level < 1) level = 1;
  if (level > 5) level = 5;
  const uint8_t soft[6] = {0, 9, 8, 6, 5, 4};
  const uint8_t firm[6] = {0, 3, 6, 5, 2, 1};
  return hard ? firm[level] : soft[level];
}

static void play(uint8_t effect) {
  if (!ready || !settings().hapticOn || effect == 0) return;
  drv.setMode(DRV2605_MODE_INTTRIG);
  drv.setWaveform(0, effect);
  drv.setWaveform(1, 0);
  drv.go();
}

void hapticTick() { play(levelEffect(false)); }
void hapticClick() { play(levelEffect(true)); }
void hapticWrong() { play(settings().hapticLevel >= 4 ? 47 : levelEffect(true)); }

void hapticAlarm() {
  play(levelEffect(true));
  delay(160);
  play(levelEffect(false));
  delay(120);
  play(levelEffect(false));
}

void hapticStandby() {
  if (!ready) return;
  drv.setMode(0x40);
}
