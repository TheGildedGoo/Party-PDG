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

LCDWiki lists I2S data out on GPIO8. If the speaker stays silent, swap DOUT and DIN in `include/board_pins.h` only.

## Flash

```bash
cd firmware/pocket-pdg
pio run -t upload
pio run -t uploadfs
```

`platformio.ini` targets an 8MB flash so a smaller module still boots. For a 16MB N16R8 module, set `board_build.flash_size` and `board_upload.flash_size` to `16MB`. PSRAM mode is `qio_opi`. If the board boot-loops before the logo, try `qio_qspi`.

## Wi-Fi

With no saved network, the brick opens an open AP named `PocketPDG-Setup`. Join it and open `http://192.168.4.1`. Airplane mode never brings the radio up.

## API host

The default base URL is `https://pdg-play.com`. A saved URL in settings wins. To bake a preview host:

```bash
pio run -e esp32-s3 --build-flags "-DPOCKET_BASE_URL=\\\"https://your-preview.vercel.app\\\""
```

Or change the default in `include/device_api.h`.

## Bank cache

`/bank.json` and `/progress.json` live on LittleFS. The first boot uses eight fixture MCQs from two chapters so the brick works with no network. Sync replaces that file with `GET /api/device/bank` (MCQ only, cite chapter, section, and paragraph). A failed sync does not delete the local bank or progress.

Full-bank parse wants PSRAM. Without it, the fixture bank still runs.
