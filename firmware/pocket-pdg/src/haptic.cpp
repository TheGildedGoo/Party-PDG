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
static void buzz(int ms) {
  if (!ready || !settings().hapticOn) return;
  uint8_t level = settings().hapticLevel;
  if (level < 1) level = 1;
  if (level > 5) level = 5;
  const uint8_t amp[6] = {0, 28, 48, 72, 100, 127};
  drv.setMode(DRV2605_MODE_REALTIME);
  drv.setRealtimeValue(amp[level]);
  delay(ms);
  drv.setRealtimeValue(0);
}

void hapticTick() { buzz(12); }
void hapticClick() { buzz(20); }
void hapticWrong() { buzz(36); }

void hapticAlarm() {
  if (!ready || !settings().hapticOn) return;
  buzz(40);
  delay(180);
  buzz(24);
  delay(120);
  buzz(24);
}

void hapticStandby() {
  if (!ready) return;
  drv.setMode(0x40);
}
