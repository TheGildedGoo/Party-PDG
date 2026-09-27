# Pocket PDG handoff (sketch 21)

Arduino only. User flashes the zip and will not hand-edit. Do not redesign the UI. Do not add features. Fix the motor, then ship one zip. No em dashes in replies to the user.

## Hardware

- Board: Hosyond / LCDWiki ES3C28P, 2.8 inch ILI9341, landscape 320x240.
- Wiki: https://www.lcdwiki.com/2.8inch_ESP32-S3_Display
- Schematic: https://www.lcdwiki.com/res/ES3C28P/2.8inch_ESP32-S3_Display_Schematic.pdf
- ESP32-S3, 16MB flash, OPI PSRAM (about 8MB). Heap was about 195000.
- Arduino IDE: board ESP32S3 Dev Module, USB CDC On Boot Enabled, Flash Size 16MB, PSRAM OPI PSRAM, partition scheme whose maximum is 3145728 bytes, USB Mode Hardware CDC and JTAG, upload port /dev/cu.usbmodem2101, serial 115200.
- If upload dies after the stub: Upload Speed 115200, close Serial Monitor, hold BOOT, tap RESET, release BOOT, upload immediately.
- Display: TFT_eSPI, setRotation(1), invertDisplay(true). Do not drive the LCD reset pin.
- Touch: FT6336-class at I2C 0x38. SDA GPIO16, SCL GPIO15, INT GPIO17, RST GPIO18.
- Haptic: DRV2605-family at I2C 0x5A on that SAME bus. Not on its own pins. Status ID nibble is 0xE0 (DRV2605L).
- There is no charge-status GPIO. Charging is inferred from battery ADC GPIO9.
- SD: SD_MMC. Settings and progress: /pocket/settings.json and /pocket/progress.json.
- Radio is 2.4 GHz only.
- Repo: https://github.com/TheGildedGoo/Party-PDG
- Firmware: firmware/pocket-pdg/
- This tree is commit adf87a7 (sketch 21).

## What already works

- Landscape UI, login, progress sync, SD settings.
- Touch and motor share I2C and both ACK.
- Bank download dechunk works. Serial: `bank dechunked 381567 bytes`. Confirm the quiz list actually loaded before changing bank code.
- Standby can be cleared. A single MODE write sticks.

## Motor bug, as of the user's last sketch 21 test

Serial, in order:

```
MODE write 00 ack 0 readback 00
bank dechunked 381567 bytes
lib 1 burst ack 0
after lib mode 00
lib 1 burst ack 0
after lib mode 40
lib 1 burst ack 0
after lib mode 40
lib 4 burst ack 0
after lib mode 40
lib 1 burst ack 0
after lib mode 40
```

User: the debug screen says awake, then Test click puts it back in standby. They did not report any vibration. There is no `RTP on` line, so Test buzz was not pressed on this build.

Facts from that log:

- `writeReg(0x01, 0x00)` returns ack 0 and reads back 0x00. Bit 6 clears. EN is high enough for the digital core to keep a write. Do not send them hunting for an EN wire unless a lone MODE write stops sticking.
- The play path never writes 0x40. `hapticStandby()` writes 0x40 only from `powerSleepUntilSchedule()`, immediately before deep sleep. The 0x40 in this log is the chip's reply, not that call.
- `playLib()` writes one 13-byte burst starting at register 0x01: mode 0x00, RTP 0x00, library 0x01, waveform, six zeros, GO 0x01. endTransmission returns 0. After 40 ms, MODE reads 0x00 the first time and 0x40 every time after.
- 0x40 is the power-on default (STANDBY set, mode bits 0). Something after the first burst puts the part back there. A timed-out read is 0xFF, and this screen labels 0xFF as "no reply", not STANDBY. This 0x40 is real.
- Debug UI reads STATUS and MODE again after the play function returns. The label is that fresh read.

## What failed already (do not repeat)

- Sketch 18/19: MODE stayed 0x40 and the code printed `Write 0 Read 0` while calling it standby. The write path now works. Do not go back to claiming the write was ignored.
- `DEV_RESET` (MODE 0x80) was tried. It restores standby when it finishes. Do not write 0x80.
- Do not write MODE 0x40 at boot.
- Do not force `hapticOn = 1` at boot.
- Adafruit `DRV2605::begin()` calls `Wire.begin()` with no pins and moves the bus off GPIO16/15. If you use that library, call `i2cBegin()` first and do not let `begin()` touch Wire.
- Commit c0eb0fd (Adafruit selectLibrary(1), useERM, setMode(internal trigger), effect 1) vibrated once. A later rebuild of that file did not, because `begin()` stole the pins. Do not treat "library effect" as untested, and do not treat the current burst as the same sequence.
- RTP while MODE was stuck at 0x40 did nothing. RTP was not retested after standby started clearing. Sketch 21's Test buzz is RTP and was not pressed.
- Putting `delay()` or `Wire.begin()` inside the LVGL touch read callback wedges the bus and makes Home miss taps. `hapticTick()` may only set a flag. `hapticService()` in `uiLoop()` does the I2C.
- A read of MODE, then a later single-register write, stored the next address byte into MODE. Serial on sketch 20: `effect 1 GO mode 03`. 0x03 is the library register address, and it is also PWM mode, so GO does not play a ROM click. That is why sketch 21 uses one burst. The burst acks, but later reads are 0x40, so the burst did not finish the job.
- Error 263 from `Wire.requestFrom` is ESP_ERR_TIMEOUT (0x107 = 263), not INVALID_STATE (259). Sketch 21's log has no 263. Do not "fix" a timeout that is not in this log.
- The old debug line called 0xFF "STANDBY" because bit 6 is set in 0xFF. That bug is fixed in sketch 21. Do not reopen it.

## Useful code map

- `src/haptic.cpp`: `wake()`, `playLib()`, `playRtp()`, `hapticDebug()`, `busRecover()`.
- `src/display.cpp` `readPoint()`: touch read. On a short read it sets `busBad`. It must not call `Wire.begin()`.
- `src/ui.cpp`: Test click is `hapticTest(1)` then `showDebug()`. Test buzz is `hapticTest(14)` (RTP, 160 ms). Every tap also queues effect 4 via `hapticTick()`, played on the next `uiLoop`.
- `src/bank.cpp`: dechunk before JSON parse.
- `src/board_pins.h`: I2C pins and addresses.

## Next measurement, before any new pattern

One change at a time, with serial, and do not claim a click unless MODE reads back as something other than 0x40 and the user says the brick moved.

1. Write only `{0x01, 0x00}`. Read MODE. (Known good: ack 0, readback 00.)
2. Write only `{0x0C, 0x01}` (GO, nothing else). Wait 40 ms. Read MODE and STATUS (0x00). This tells you whether GO alone sets standby.
3. If MODE is still 0x00, add the library and waveform writes as their own transactions, reading MODE after each. The write that turns 0x00 into 0x40 is the bug.
4. Read STATUS in the same test. OC is bit 0, overtemp is bit 1, DIAG_RESULT is bit 3, device id is bits 7:5 (0xE0). If the id nibble changes, the part reset. If it stays 0xE0 and MODE is 0x40, the part set STANDBY by itself or the MODE write was overwritten.
5. Press Test buzz once. Sketch 21 logs `RTP on ack N`. That path was not in the failing log.

I2C rules that stay: `Wire.begin(16, 15)` once, `setClock(100000)`, stop-separated reads (`endTransmission(true)` then `requestFrom`). No repeated start. No `Wire.begin()` inside the touch callback.

## Flash

Zip layout is `pocket-pdg/pocket-pdg.ino` plus `src/`. Open that folder in Arduino IDE. Partition max 3145728. Do not compile `platformio.ini`.
