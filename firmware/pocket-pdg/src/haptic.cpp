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
static volatile bool busBad = false;
static volatile bool wantPulse = false;
static uint8_t wantEffect = 1;
static bool recovering = false;

void i2cNoteFail() { busBad = true; }

static void busRecover() {
  if (recovering) return;
  recovering = true;
  Wire.end();
  pinMode(PIN_I2C_SDA, INPUT_PULLUP);
  pinMode(PIN_I2C_SCL, OUTPUT_OPEN_DRAIN);
  digitalWrite(PIN_I2C_SCL, HIGH);
  delayMicroseconds(8);
  for (int i = 0; i < 9; i++) {
    digitalWrite(PIN_I2C_SCL, LOW);
    delayMicroseconds(5);
    digitalWrite(PIN_I2C_SCL, HIGH);
    delayMicroseconds(5);
  }
  pinMode(PIN_I2C_SDA, OUTPUT_OPEN_DRAIN);
  digitalWrite(PIN_I2C_SDA, LOW);
  delayMicroseconds(5);
  digitalWrite(PIN_I2C_SCL, HIGH);
  delayMicroseconds(5);
  digitalWrite(PIN_I2C_SDA, HIGH);
  delayMicroseconds(5);
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  Wire.setClock(100000);
  Wire.setTimeOut(100);
  recovering = false;
}

static int writeBurst(const uint8_t* buf, size_t n) {
  Wire.beginTransmission(HAPTIC_I2C_ADDR);
  Wire.write(buf, n);
  writeErr = Wire.endTransmission(true);
  if (writeErr != 0) {
    busRecover();
    Wire.beginTransmission(HAPTIC_I2C_ADDR);
    Wire.write(buf, n);
    writeErr = Wire.endTransmission(true);
  }
  lastErr = writeErr;
  return writeErr;
}

static int writeReg(uint8_t reg, uint8_t val) {
  uint8_t buf[2] = {reg, val};
  return writeBurst(buf, 2);
}

static uint8_t readReg(uint8_t reg) {
  for (int attempt = 0; attempt < 2; attempt++) {
    Wire.beginTransmission(HAPTIC_I2C_ADDR);
    Wire.write(reg);
    int err = Wire.endTransmission(true);
    if (err != 0) {
      lastErr = err;
      busRecover();
      continue;
    }
    if (Wire.requestFrom((int)HAPTIC_I2C_ADDR, 1) == 1) {
      lastErr = 0;
      return (uint8_t)Wire.read();
    }
    lastErr = -2;
    busRecover();
  }
  return 0xFF;
}

/* One write clears standby. No software reset. A read of 0xFF is a timeout, not standby. */
static bool wake() {
  if (!ready) return false;
  writeReg(0x01, 0x00);
  delay(2);
  modeAck = writeErr;
  modeBack = readReg(0x01);
  modeRead = modeBack;
  Serial.printf("MODE write 00 ack %d readback %02X\n", modeAck, modeBack);
  return modeBack != 0xFF && (modeBack & 0x40) == 0;
}

/* ERM open-loop defaults from the DRV2605 datasheet. Library effects need these. */
static void configEr() {
  uint8_t fb[2] = {0x1A, 0x36};
  uint8_t ctl[2] = {0x1D, 0xA0};
  writeBurst(fb, 2);
  writeBurst(ctl, 2);
}

/* Mode, library, waveform, and GO in one burst. No read before it.
   A read leaves the pointer mid-register, and the next write was landing in MODE
   (serial showed mode 03, which is the library address byte). */
static void playLib(uint8_t effect) {
  if (!ready) return;
  configEr();
  uint8_t seq[13] = {
      0x01, 0x00, 0x00, 0x01, effect, 0x00,
      0, 0, 0, 0, 0, 0, 0x01};
  int ack = writeBurst(seq, sizeof(seq));
  modeAck = ack;
  Serial.printf("lib %u burst ack %d\n", effect, ack);
  delay(40);
  modeBack = readReg(0x01);
  modeRead = modeBack;
  Serial.printf("after lib mode %02X\n", modeBack);
}

/* Direct drive in one burst: MODE 0x05 and amplitude together. No I2C while it spins. */
static void playRtp(uint16_t ms) {
  if (!ready) return;
  if (ms < 40) ms = 40;
  if (ms > 250) ms = 250;
  configEr();
  uint8_t on[3] = {0x01, 0x05, 0x7F};
  int ack = writeBurst(on, sizeof(on));
  modeAck = ack;
  Serial.printf("RTP on ack %d %u ms\n", ack, ms);
  delay(ms);
  uint8_t off[3] = {0x01, 0x00, 0x00};
  writeBurst(off, sizeof(off));
  modeBack = readReg(0x01);
  modeRead = modeBack;
  Serial.printf("after RTP mode %02X\n", modeBack);
}

static void drive(uint8_t effect) {
  if (effect == 14) playRtp(160);
  else playLib(effect);
}

void i2cBegin() {
  static bool started = false;
  if (started) return;
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  Wire.setClock(100000);
  Wire.setTimeOut(100);
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
    busRecover();
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
  wake();
}

bool hapticReady() { return ready; }
void hapticTick() { queue(4); }
void hapticClick() { queue(1); }
void hapticWrong() { queue(47); }

void hapticAlarm() {
  if (!ready || !settings().hapticOn) return;
  playRtp(80);
  delay(40);
  playRtp(80);
}

void hapticProbe() {
  if (!ready) return;
  wake();
}

void hapticTest(uint8_t effect) {
  if (!ready) return;
  drive(effect);
}

void hapticBuzz(uint16_t ms) { playRtp(ms); }

static const char* modeName(uint8_t mode) {
  if (mode == 0xFF) return "no reply";
  if (mode & 0x40) return "STANDBY";
  switch (mode & 0x07) {
    case 0: return "awake";
    case 3: return "PWM";
    case 5: return "RTP";
    default: return "other";
  }
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
  else if (status & 0x01) fault = "overcurrent, output off";
  else if (status & 0x02) fault = "over temp";
  else if (status & 0x08) fault = "diagnostic failed";
  snprintf(dst, n, "Motor found\nStatus %02X  %s\nMode %02X  %s\nAck %d readback %02X",
           status, fault, mode, modeName(mode), modeAck, modeBack);
}

void hapticStandby() {
  if (!ready) return;
  writeReg(0x01, 0x40);
  modeBack = 0x40;
  modeRead = 0x40;
}
