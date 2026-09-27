#include "sd_store.h"

#include <SD_MMC.h>
#include <string.h>
#include "board_pins.h"

static bool ready = false;
static char status[40] = "No SD card";

static bool mount(bool oneBit) {
  if (oneBit) SD_MMC.setPins(PIN_SD_CLK, PIN_SD_CMD, PIN_SD_D0);
  else SD_MMC.setPins(PIN_SD_CLK, PIN_SD_CMD, PIN_SD_D0, PIN_SD_D1, PIN_SD_D2, PIN_SD_D3);
  return SD_MMC.begin("/sdcard", oneBit, false, 20000);
}

bool sdBegin() {
  if (ready) return true;
  if (!mount(false)) {
    SD_MMC.end();
    if (!mount(true)) {
      strncpy(status, "No SD card", sizeof(status) - 1);
      status[sizeof(status) - 1] = 0;
      ready = false;
      return false;
    }
  }
  SD_MMC.mkdir("/pocket");
  uint64_t mb = SD_MMC.cardSize() / (1024ULL * 1024ULL);
  snprintf(status, sizeof(status), "SD %llu MB", (unsigned long long)mb);
  ready = SD_MMC.cardType() != CARD_NONE;
  if (!ready) strncpy(status, "No SD card", sizeof(status) - 1);
  return ready;
}

bool sdReady() { return ready; }
const char* sdStatus() { return status; }

bool sdExists(const char* path) {
  return ready && path && SD_MMC.exists(path);
}

File sdOpen(const char* path, const char* mode) {
  if (!ready || !path) return File();
  return SD_MMC.open(path, mode);
}

bool sdReplace(const char* path, const uint8_t* data, size_t length) {
  if (!ready || !path || !data) return false;
  char tmp[80];
  snprintf(tmp, sizeof(tmp), "%s.tmp", path);
  if (SD_MMC.exists(tmp)) SD_MMC.remove(tmp);
  File file = SD_MMC.open(tmp, FILE_WRITE);
  if (!file) return false;
  size_t wrote = file.write(data, length);
  file.close();
  if (wrote != length) {
    SD_MMC.remove(tmp);
    return false;
  }
  if (SD_MMC.exists(path)) SD_MMC.remove(path);
  if (!SD_MMC.rename(tmp, path)) return false;
  return true;
}

bool sdReplace(const char* path, const char* text, size_t length) {
  return sdReplace(path, (const uint8_t*)text, length);
}
