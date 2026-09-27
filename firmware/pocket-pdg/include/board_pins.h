#pragma once

/* Hosyond / LCDWiki ES3C28P. Pins match the module, not a generic DevKit. */

#define PIN_LCD_CS 10
#define PIN_LCD_DC 46
#define PIN_LCD_SCLK 12
#define PIN_LCD_MOSI 11
#define PIN_LCD_MISO 13
#define PIN_LCD_BL 45
/* LCD reset is the board RESET key, shared with the ESP32-S3 EN pin. Do not drive it. */
#define PIN_LCD_RST -1

#define PIN_TP_SDA 16
#define PIN_TP_SCL 15
#define PIN_TP_INT 17
#define PIN_TP_RST 18
#define TP_I2C_ADDR 0x38

/* Same I2C bus as the external header. DRV2605L ERM driver. */
#define PIN_I2C_SDA PIN_TP_SDA
#define PIN_I2C_SCL PIN_TP_SCL
#define HAPTIC_I2C_ADDR 0x5A

/* ES8311 codec shares that I2C bus. Address 0x18 is the usual CE strap. */
#define CODEC_I2C_ADDR 0x18

/* Audio from the LCDWiki ES3C28P ESP-IDF pin table.
   AMP_EN is active low. I2S data out is GPIO8. A few third-party BSPs swap
   GPIO8 and GPIO6. If the speaker stays silent, swap DOUT and DIN only. */
#define PIN_AMP_EN 1
#define PIN_I2S_MCLK 4
#define PIN_I2S_BCLK 5
#define PIN_I2S_DOUT 8
#define PIN_I2S_LRCK 7
#define PIN_I2S_DIN 6

#define PIN_BAT_ADC 9
#define BAT_DIVIDER 2.0f
#define BAT_EMPTY_V 3.40f
#define BAT_FULL_V 4.20f

/* Portrait mapping. Set to 1 if taps land on the wrong axis. */
#define TOUCH_SWAP_XY 1
#define TOUCH_INVERT_X 0
#define TOUCH_INVERT_Y 1
