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
  Wire.setTimeOut(100);
  pinMode(PIN_TP_INT, INPUT);
  pinMode(PIN_TP_RST, OUTPUT);
  digitalWrite(PIN_TP_RST, LOW);
  delay(10);
  digitalWrite(PIN_TP_RST, HIGH);
  delay(120);
  Wire.beginTransmission(TP_I2C_ADDR);
  Wire.write(0x00);
  Wire.write(0x00);
  Wire.endTransmission();
  Wire.beginTransmission(TP_I2C_ADDR);
  Wire.write(0xA4);
  Wire.write(0x00);
  Wire.endTransmission();
  started = true;
}

static bool probe(uint8_t addr) {
  for (int i = 0; i < 5; i++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) return true;
    delay(20);
  }
  return false;
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
  if (settings().hapticOn) {
    drv.setWaveform(0, 1);
    drv.setWaveform(1, 0);
    drv.go();
  }
}

bool hapticReady() { return ready; }

static void pulse(uint8_t effect) {
  if (!ready || !settings().hapticOn) return;
  int level = settings().hapticLevel;
  if (level < 1) level = 45;
  if (level > 100) level = 100;
  uint8_t amp = (uint8_t)(30 + (level * 97) / 100);
  drv.setMode(DRV2605_MODE_INTTRIG);
  drv.selectLibrary(1);
  drv.setWaveform(0, effect);
  drv.setWaveform(1, 0);
  drv.go();
  drv.setMode(DRV2605_MODE_REALTIME);
  drv.setRealtimeValue(amp);
  delay(30 + level / 5);
  drv.setRealtimeValue(0);
  drv.setMode(DRV2605_MODE_INTTRIG);
}

void hapticTick() { pulse(1); }
void hapticClick() { pulse(1); }
void hapticWrong() { pulse(47); }

void hapticAlarm() {
  pulse(1);
  delay(120);
  pulse(1);
}

void hapticStandby() {
  if (!ready) return;
  drv.setMode(0x40);
}
