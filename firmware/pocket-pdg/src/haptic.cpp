#include "haptic.h"

#include <Arduino.h>
#include <Wire.h>
#include "board_pins.h"
#include "settings.h"

static bool ready = false;

static void wireFix() {
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  Wire.setClock(100000);
}

static bool writeReg(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(HAPTIC_I2C_ADDR);
  Wire.write(reg);
  Wire.write(val);
  return Wire.endTransmission() == 0;
}

void i2cBegin() {
  static bool started = false;
  if (started) return;
  wireFix();
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
  wireFix();
  if (touch) *touch = probe(TP_I2C_ADDR);
  if (haptic) *haptic = probe(HAPTIC_I2C_ADDR);
  if (codec) *codec = probe(CODEC_I2C_ADDR);
}

static void play(uint8_t effect) {
  if (!ready) return;
  if (!settings().hapticOn) {
    settings().hapticOn = 1;
    settingsSave();
  }
  wireFix();
  writeReg(0x01, 0x00);
  writeReg(0x1A, 0x36);
  writeReg(0x03, 0x01);
  writeReg(0x04, effect);
  writeReg(0x05, 0x00);
  writeReg(0x0C, 0x01);
  writeReg(0x01, 0x05);
  writeReg(0x02, 0x7F);
  delay(50);
  writeReg(0x02, 0x00);
  writeReg(0x01, 0x00);
}

void hapticBegin() {
  i2cBegin();
  wireFix();
  ready = probe(HAPTIC_I2C_ADDR);
  if (!ready) {
    Serial.println("DRV2605L not found at 0x5A");
    return;
  }
  settings().hapticOn = 1;
  settingsSave();
  Serial.println("DRV2605L click");
  play(1);
}

bool hapticReady() { return ready; }
void hapticTick() { play(4); }
void hapticClick() { play(1); }
void hapticWrong() { play(47); }

void hapticAlarm() {
  play(14);
  delay(180);
  play(1);
}

void hapticStandby() {
  if (!ready) return;
  wireFix();
  writeReg(0x01, 0x40);
}
