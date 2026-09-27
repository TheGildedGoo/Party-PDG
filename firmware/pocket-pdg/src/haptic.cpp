#include "haptic.h"

#include <Arduino.h>
#include <Wire.h>
#include "board_pins.h"
#include "settings.h"

static bool ready = false;
static int lastErr = 0;

static bool writeReg(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(HAPTIC_I2C_ADDR);
  Wire.write(reg);
  Wire.write(val);
  lastErr = Wire.endTransmission();
  return lastErr == 0;
}

static uint8_t readReg(uint8_t reg) {
  Wire.beginTransmission(HAPTIC_I2C_ADDR);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) {
    lastErr = -1;
    return 0xFF;
  }
  if (Wire.requestFrom((int)HAPTIC_I2C_ADDR, 1) != 1) {
    lastErr = -2;
    return 0xFF;
  }
  lastErr = 0;
  return Wire.read();
}

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
  writeReg(0x01, 0x00);
  writeReg(0x1A, 0x36);
  writeReg(0x03, 0x01);
  writeReg(0x04, effect);
  writeReg(0x05, 0x00);
  writeReg(0x0C, 0x01);
}

void hapticBegin() {
  i2cBegin();
  ready = probe(HAPTIC_I2C_ADDR);
  if (!ready) {
    Serial.println("DRV2605L not found at 0x5A");
    return;
  }
  writeReg(0x01, 0x40);
  delay(5);
  play(1);
  uint8_t status = readReg(0x00);
  Serial.printf("DRV2605L status 0x%02X i2c %d\n", status, lastErr);
}

bool hapticReady() { return ready; }
void hapticTick() { play(4); }
void hapticClick() { play(1); }
void hapticWrong() { play(47); }

void hapticAlarm() {
  if (!ready || !settings().hapticOn) return;
  play(14);
  delay(160);
  play(1);
}

void hapticBuzz(uint16_t ms) {
  if (!ready) return;
  if (ms < 40) ms = 40;
  if (ms > 400) ms = 400;
  writeReg(0x01, 0x05);
  writeReg(0x02, 0x7F);
  delay(ms);
  writeReg(0x02, 0x00);
  writeReg(0x01, 0x00);
}

void hapticDebug(char* dst, size_t n) {
  if (!dst || n < 8) return;
  if (!ready) {
    snprintf(dst, n, "Motor missing at 0x5A\nI2C err %d", lastErr);
    return;
  }
  uint8_t status = readReg(0x00);
  uint8_t mode = readReg(0x01);
  const char* fault = "no fault";
  if (status == 0xFF) fault = "no reply";
  else if (status & 0x04) fault = "overcurrent, output off";
  else if (status & 0x02) fault = "over temp";
  else if (status & 0x01) fault = "diagnostic failed";
  snprintf(dst, n, "Motor found\nStatus %02X  %s\nMode %02X\nI2C err %d", status, fault, mode, lastErr);
}

void hapticStandby() {
  if (!ready) return;
  writeReg(0x01, 0x40);
}
