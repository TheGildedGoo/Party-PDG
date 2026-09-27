#include "haptic.h"

#include <Arduino.h>
#include <Wire.h>
#include "board_pins.h"
#include "settings.h"

static bool ready = false;
static int lastErr = 0;
static int writeErr = 0;
static int modeAck = -1;
static uint8_t modeRead = 0x40;
static uint8_t modeBack = 0x40;
static uint8_t rtpRead = 0x00;
static bool rtpTried = false;
static volatile bool busBad = false;
static volatile bool wantPulse = false;
static uint8_t wantEffect = 1;

void i2cNoteFail() { busBad = true; }

/* Full stop between the pointer and the data. This core's repeated-start
   path returns i2cWriteReadNonStop -1 and then ESP_ERR_INVALID_STATE. */
static int writeReg(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(HAPTIC_I2C_ADDR);
  Wire.write(reg);
  Wire.write(val);
  writeErr = Wire.endTransmission(true);
  lastErr = writeErr;
  return writeErr;
}

static uint8_t readReg(uint8_t reg) {
  Wire.beginTransmission(HAPTIC_I2C_ADDR);
  Wire.write(reg);
  int err = Wire.endTransmission(true);
  if (err != 0) {
    lastErr = err;
    return 0xFF;
  }
  if (Wire.requestFrom((int)HAPTIC_I2C_ADDR, 1) != 1) {
    lastErr = -2;
    return 0xFF;
  }
  lastErr = 0;
  return (uint8_t)Wire.read();
}

/* While STANDBY is 1 the chip accepts a MODE write and nothing else.
   Do not set DEV_RESET. That bit restores standby when it finishes. */
static bool wake() {
  if (!ready) return false;
  rtpTried = false;
  writeReg(0x01, 0x00);
  delay(2);
  modeAck = writeErr;
  modeBack = readReg(0x01);
  modeRead = modeBack;
  Serial.printf("MODE write 00 ack %d readback %02X\n", modeAck, modeBack);
  if (modeBack & 0x40) {
    delay(8);
    writeReg(0x01, 0x00);
    delay(2);
    modeAck = writeErr;
    modeBack = readReg(0x01);
    modeRead = modeBack;
    Serial.printf("MODE retry ack %d readback %02X\n", modeAck, modeBack);
  }
  if (modeBack & 0x40) {
    writeReg(0x02, 0xA5);
    rtpRead = readReg(0x02);
    rtpTried = true;
    Serial.printf("RTP canary ack %d read %02X\n", writeErr, rtpRead);
    return false;
  }
  return true;
}

static void drive(uint8_t effect) {
  if (!wake()) return;
  uint8_t fb = readReg(0x1A);
  if (fb != 0xFF) writeReg(0x1A, (uint8_t)(fb & 0x7F));
  writeReg(0x03, 0x01);
  writeReg(0x04, effect);
  writeReg(0x05, 0x00);
  writeReg(0x0C, 0x01);
  modeRead = readReg(0x01);
  Serial.printf("effect %u GO mode %02X\n", effect, modeRead);
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

static void queue(uint8_t effect) {
  if (!ready || !settings().hapticOn) return;
  wantEffect = effect;
  wantPulse = true;
}

void hapticService() {
  if (busBad) {
    busBad = false;
    Wire.end();
    delay(2);
    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
    Wire.setClock(100000);
  }
  if (!wantPulse) return;
  wantPulse = false;
  drive(wantEffect);
}

void hapticBegin() {
  i2cBegin();
  ready = probe(HAPTIC_I2C_ADDR);
  if (!ready) {
    Serial.println("DRV2605L not found at 0x5A");
    return;
  }
  if (settings().hapticOn) drive(1);
  else wake();
}

bool hapticReady() { return ready; }
void hapticTick() { queue(4); }
void hapticClick() { queue(1); }
void hapticWrong() { queue(47); }

void hapticAlarm() {
  if (!ready || !settings().hapticOn) return;
  drive(14);
  delay(160);
  drive(1);
}

void hapticProbe() {
  if (!ready) return;
  wake();
}

void hapticTest(uint8_t effect) {
  if (!ready) return;
  drive(effect);
}

void hapticBuzz(uint16_t ms) {
  (void)ms;
  hapticTest(14);
}

void hapticDebug(char* dst, size_t n) {
  if (!dst || n < 8) return;
  if (!ready) {
    snprintf(dst, n, "Motor missing at 0x5A\nI2C err %d", lastErr);
    return;
  }
  uint8_t status = readReg(0x00);
  uint8_t mode = readReg(0x01);
  modeRead = mode;
  const char* fault = "no fault";
  if (status == 0xFF) fault = "no reply";
  else if (status & 0x04) fault = "overcurrent, output off";
  else if (status & 0x02) fault = "over temp";
  else if (status & 0x01) fault = "diagnostic failed";
  const char* gate = (mode & 0x40) ? "STANDBY" : "awake";
  if (rtpTried && rtpRead != 0xA5) {
    snprintf(dst, n, "Motor found\nStatus %02X  %s\nMode %02X  %s\nAck %d readback %02X\nRTP %02X writes ignored\nTie motor EN to 3V3",
             status, fault, mode, gate, modeAck, modeBack, rtpRead);
  } else {
    snprintf(dst, n, "Motor found\nStatus %02X  %s\nMode %02X  %s\nAck %d readback %02X",
             status, fault, mode, gate, modeAck, modeBack);
  }
}

void hapticStandby() {
  if (!ready) return;
  writeReg(0x01, 0x40);
  modeBack = 0x40;
  modeRead = 0x40;
}
