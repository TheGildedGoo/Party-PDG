# Pocket PDG

ESP32-S3 firmware for the Hosyond / LCDWiki ES3C28P (2.8 inch, 240x320). It studies the same MCQ bank as [pdg-play.com](https://pdg-play.com) and syncs spaced repetition through `/api/device/*`.

The motor is driven only by a DRV2605L on the external I2C header. Do not PWM the motor from a GPIO.

## Wiring

One 1S LiPo on the board JST 1.25. The DRV2605L and the FT6336 share the board I2C bus.

| DRV2605L | ES3C28P header |
| --- | --- |
| VIN | 3V3 |
| GND | GND |
| SCL | GPIO15 |
| SDA | GPIO16 |
| IN | not used |

| ERM | DRV2605L |
| --- | --- |
| lead | OUT+ |
| lead | OUT- |

Library 1, ERM mode. Not LRA. A boot scan should see touch `0x38` and the motor driver `0x5A`. The onboard ES8311 codec, if it answers, is `0x18` on that same bus.

| Function | GPIO |
| --- | --- |
| LCD CS, DC, SCLK, MOSI, MISO, backlight | 10, 46, 12, 11, 13, 45 |
| LCD reset | board RESET, shared with EN. Firmware does not drive it. |
| Touch SDA, SCL, INT, RST | 16, 15, 17, 18 |
| Amp enable (active low), I2S MCLK, BCLK, DOUT, LRCK, DIN | 1, 4, 5, 8, 7, 6 |
| Battery ADC | 9 |
| microSD CLK, CMD, D0, D1, D2, D3 | 38, 40, 39, 41, 48, 47 |

The microSD slot is the onboard 4-bit SDIO socket. Do not wire it to the LCD SPI pins.

LCDWiki lists I2S data out on GPIO8. If the speaker stays silent, swap DOUT and DIN in `src/board_pins.h` only.

## Flash

```bash
cd firmware/pocket-pdg
pio run -t upload
```

Flash writes the program into the ESP32-S3's own flash chip. The ROM inside the chip can only start code from that flash. It cannot boot the app from the microSD card. You flash once over USB. After that, the card holds the study data.

`platformio.ini` targets an 8MB flash so a smaller module still boots. For a 16MB N16R8 module, set `board_build.flash_size` and `board_upload.flash_size` to `16MB`. PSRAM mode is `qio_opi`. If the board boot-loops before the logo, try `qio_qspi`.

## Arduino IDE

Hosyond, LCDWiki, and ES3C28P are not board names in Arduino IDE or PlatformIO. Do not search for those. In PlatformIO, skip Create New Project and use File, Open Folder on this directory. The board is already `esp32-s3-devkitc-1` in `platformio.ini`.

In Arduino IDE:

1. Boards Manager: install `esp32` by Espressif Systems, version 2.0.17. Do not use 3.x. The audio code uses the 2.x I2S driver.
2. Library Manager, exact versions: `lvgl` 8.3.11, `TFT_eSPI` 2.5.43, `ArduinoJson` 7.2.1 or any 7.x, `Adafruit DRV2605`, `Adafruit BusIO`.
3. File, Open `pocket-pdg.ino`.
4. Tools menu:

| Menu | Value |
| --- | --- |
| Board | ESP32S3 Dev Module |
| USB CDC On Boot | Enabled |
| CPU Frequency | 240MHz (WiFi) |
| Flash Mode | QIO 80MHz |
| Flash Size | 16MB (32Mb) |
| Partition Scheme | Custom |
| PSRAM | OPI PSRAM |
| USB Mode | Hardware CDC and JTAG |
| Upload Speed | 921600 |
| Port | the COM port that appears |

5. Click Upload. If the port never shows, hold BOOT, tap RESET, release BOOT, and click Upload again.

If the metal can says N8R8 instead of N16R8, set Flash Size to 8MB. If the screen stays black after a good upload, change PSRAM from OPI PSRAM to QSPI PSRAM and upload again.

## SD card

Format the card FAT32. exFAT and NTFS will not mount. Copy the `pocket` folder to the root of the card:

```text
/pocket/bank.json
/pocket/progress.json
/pocket/settings.json
```

`bank.json` is the question bank. You can drop `web/data/bank.mcq.json` onto the card under that name and skip the first download. `progress.json` and `settings.json` are created on first boot. Wi-Fi password and the device token are plain text in `settings.json`.

A failed sync does not delete the bank or progress. With no card, the brick still boots on eight built-in questions, but nothing is saved until a card is in the slot at power-on.

There is no "boot from SD" mode. A loader would still have to live in flash, read a file, and jump to it. That is a second program in flash, not the chip starting from the card. To change Pocket PDG itself, flash over USB again. To change questions or progress, edit the card.

## Wi-Fi

With no saved network, the brick opens an open AP named `PocketPDG-Setup`. Join it and open `http://192.168.4.1`. Airplane mode never brings the radio up.

## API host

The default base URL is `https://pdg-play.com`. A saved URL in settings wins. To bake a preview host:

```bash
pio run -e esp32-s3 --build-flags "-DPOCKET_BASE_URL=\\\"https://your-preview.vercel.app\\\""
```

Or change the default in `src/device_api.h`.

## Bank cache

The bank and progress live on the microSD card, in `/pocket/bank.json` and `/pocket/progress.json`. The first boot uses eight fixture MCQs from two chapters when those files are missing, so the brick works with no network. Sync replaces the bank file with `GET /api/device/bank` (MCQ only, cite chapter, section, and paragraph).

Full-bank parse wants PSRAM. Without it, the fixture bank still runs.
