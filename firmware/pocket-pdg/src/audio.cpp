#include "audio.h"

#include <Arduino.h>
#include <Wire.h>
#include <driver/i2s.h>
#include <math.h>
#include "board_pins.h"
#include "haptic.h"
#include "settings.h"

static bool codecOk = false;
static bool i2sOk = false;

static void writeReg(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(CODEC_I2C_ADDR);
  Wire.write(reg);
  Wire.write(val);
  Wire.endTransmission();
}

static void initCodec() {
  /* Short playback path. Register map follows the ES8311 datasheet clock/DAC start. */
  writeReg(0x00, 0x1F);
  delay(20);
  writeReg(0x00, 0x00);
  writeReg(0x01, 0x30);
  writeReg(0x02, 0x10);
  writeReg(0x03, 0x10);
  writeReg(0x04, 0x10);
  writeReg(0x05, 0x00);
  writeReg(0x06, 0x03);
  writeReg(0x07, 0x00);
  writeReg(0x08, 0xFF);
  writeReg(0x09, 0x0C);
  writeReg(0x0A, 0x0C);
  writeReg(0x0B, 0x00);
  writeReg(0x0C, 0x00);
  writeReg(0x10, 0x1F);
  writeReg(0x11, 0x7F);
  writeReg(0x12, 0x00);
  writeReg(0x13, 0x10);
  writeReg(0x14, 0x1A);
  writeReg(0x32, 0xBF);
  writeReg(0x37, 0x08);
}

void audioBegin() {
  i2cBegin();
  pinMode(PIN_AMP_EN, OUTPUT);
  digitalWrite(PIN_AMP_EN, HIGH);
  Wire.beginTransmission(CODEC_I2C_ADDR);
  codecOk = Wire.endTransmission() == 0;
  if (!codecOk) {
    Serial.println("ES8311 not found; tones off");
    return;
  }
  initCodec();
  i2s_config_t cfg = {};
  cfg.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX);
  cfg.sample_rate = 16000;
  cfg.bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT;
  cfg.channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT;
  cfg.communication_format = I2S_COMM_FORMAT_STAND_I2S;
  cfg.intr_alloc_flags = ESP_INTR_FLAG_LEVEL1;
  cfg.dma_buf_count = 4;
  cfg.dma_buf_len = 128;
  cfg.use_apll = false;
  cfg.tx_desc_auto_clear = true;
  i2s_pin_config_t pins = {};
  pins.mck_io_num = PIN_I2S_MCLK;
  pins.bck_io_num = PIN_I2S_BCLK;
  pins.ws_io_num = PIN_I2S_LRCK;
  pins.data_out_num = PIN_I2S_DOUT;
  pins.data_in_num = I2S_PIN_NO_CHANGE;
  i2sOk = i2s_driver_install(I2S_NUM_0, &cfg, 0, nullptr) == ESP_OK
      && i2s_set_pin(I2S_NUM_0, &pins) == ESP_OK;
  if (i2sOk) i2s_zero_dma_buffer(I2S_NUM_0);
}

static void tone(int freq, int ms) {
  if (!settings().soundOn || !i2sOk) return;
  digitalWrite(PIN_AMP_EN, LOW);
  const int rate = 16000;
  int samples = rate * ms / 1000;
  int16_t frame[2];
  size_t wrote = 0;
  for (int i = 0; i < samples; i++) {
    float t = (float)i / (float)rate;
    int16_t sample = (int16_t)(sin(2.0f * 3.1415926f * freq * t) * 6000);
    frame[0] = sample;
    frame[1] = sample;
    i2s_write(I2S_NUM_0, frame, sizeof(frame), &wrote, 20);
  }
  digitalWrite(PIN_AMP_EN, HIGH);
}

void audioCorrect() { tone(880, 90); }
void audioWrong() { tone(220, 180); }

void audioOff() {
  digitalWrite(PIN_AMP_EN, HIGH);
}
