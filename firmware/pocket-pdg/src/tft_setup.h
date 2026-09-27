#pragma once
/* Force-included before TFT_eSPI. USER_SETUP_LOADED is set in platformio.ini. */

#include "board_pins.h"

#define ILI9341_DRIVER
#define TFT_WIDTH 240
#define TFT_HEIGHT 320

#define TFT_MISO PIN_LCD_MISO
#define TFT_MOSI PIN_LCD_MOSI
#define TFT_SCLK PIN_LCD_SCLK
#define TFT_CS PIN_LCD_CS
#define TFT_DC PIN_LCD_DC
#define TFT_RST PIN_LCD_RST
#define TFT_BL -1

#define LOAD_GLCD
#define LOAD_FONT2
#define LOAD_FONT4

#define SPI_FREQUENCY 40000000
#define SPI_READ_FREQUENCY 16000000
#define TOUCH_CS -1
