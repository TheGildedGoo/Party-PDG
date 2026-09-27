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

static void play(uint8_t effect) {
  if (!ready || !settings().hapticOn) return;
  drv.setMode(DRV2605_MODE_INTTRIG);
  drv.setWaveform(0, effect);
  drv.setWaveform(1, 0);
  drv.go();
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
void hapticTick() { play(4); }
void hapticClick() { play(1); }
void hapticWrong() { play(47); }

void hapticAlarm() {
  if (!ready || !settings().hapticOn) return;
  play(14);
  delay(220);
  play(4);
  delay(140);
  play(4);
}

void hapticStandby() {
  if (!ready) return;
  drv.setMode(0x40);
}
