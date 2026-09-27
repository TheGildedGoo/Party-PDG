#include "display.h"

#include <Arduino.h>
#include <TFT_eSPI.h>
#include <Wire.h>
#include "board_pins.h"
#include "haptic.h"
#include "power.h"

static TFT_eSPI tft;
static lv_disp_draw_buf_t drawBuf;
static lv_color_t buf[240 * 32];
static lv_disp_drv_t dispDrv;

static void flush(lv_disp_drv_t* drv, const lv_area_t* area, lv_color_t* color) {
  uint32_t w = area->x2 - area->x1 + 1;
  uint32_t h = area->y2 - area->y1 + 1;
  tft.startWrite();
  tft.setAddrWindow(area->x1, area->y1, w, h);
  tft.pushColors((uint16_t*)&color->full, w * h, true);
  tft.endWrite();
  lv_disp_flush_ready(drv);
}

static bool readPoint(int* x, int* y) {
  Wire.beginTransmission(TP_I2C_ADDR);
  Wire.write(0x02);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom((int)TP_I2C_ADDR, 5) < 5) return false;
  uint8_t points = Wire.read() & 0x0F;
  uint8_t xh = Wire.read();
  uint8_t xl = Wire.read();
  uint8_t yh = Wire.read();
  uint8_t yl = Wire.read();
  if (!points) return false;
  int rx = ((xh & 0x0F) << 8) | xl;
  int ry = ((yh & 0x0F) << 8) | yl;
  int sx = rx;
  int sy = ry;
  if (TOUCH_SWAP_XY) {
    sx = ry;
    sy = rx;
  }
  if (TOUCH_INVERT_X) sx = 239 - sx;
  if (TOUCH_INVERT_Y) sy = 319 - sy;
  if (sx < 0) sx = 0;
  if (sy < 0) sy = 0;
  if (sx > 239) sx = 239;
  if (sy > 319) sy = 319;
  *x = sx;
  *y = sy;
  return true;
}

static void readTouch(lv_indev_drv_t* drv, lv_indev_data_t* data) {
  (void)drv;
  int x = 0;
  int y = 0;
  if (readPoint(&x, &y)) {
    data->state = LV_INDEV_STATE_PR;
    data->point.x = x;
    data->point.y = y;
    powerWakeScreen();
  } else {
    data->state = LV_INDEV_STATE_REL;
  }
}

void displayBegin() {
  i2cBegin();
  tft.init();
  tft.setRotation(0);
  tft.fillScreen(TFT_BLACK);
  lv_init();
  lv_disp_draw_buf_init(&drawBuf, buf, nullptr, 240 * 32);
  lv_disp_drv_init(&dispDrv);
  dispDrv.hor_res = 240;
  dispDrv.ver_res = 320;
  dispDrv.flush_cb = flush;
  dispDrv.draw_buf = &drawBuf;
  lv_disp_drv_register(&dispDrv);
  static lv_indev_drv_t indev;
  lv_indev_drv_init(&indev);
  indev.type = LV_INDEV_TYPE_POINTER;
  indev.read_cb = readTouch;
  lv_indev_drv_register(&indev);
}

void displayLoop() { lv_timer_handler(); }
void displayWake() { powerWakeScreen(); }
