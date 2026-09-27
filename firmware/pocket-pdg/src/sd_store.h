#pragma once

#include <Arduino.h>
#include <FS.h>
#include <stddef.h>

/* Card paths. The FAT root is the card itself, not a PC drive letter. */
#define SD_PATH_BANK "/pocket/bank.json"
#define SD_PATH_BANK_ALT "/pocket/bank.mcq.json"
#define SD_PATH_BANK_ROOT "/bank.json"
#define SD_PATH_BANK_ROOT_MCQ "/bank.mcq.json"
#define SD_PATH_PROGRESS "/pocket/progress.json"
#define SD_PATH_SETTINGS "/pocket/settings.json"

bool sdBegin();
bool sdReady();
const char* sdStatus();

bool sdExists(const char* path);
File sdOpen(const char* path, const char* mode);
bool sdReplace(const char* path, const uint8_t* data, size_t length);
bool sdReplace(const char* path, const char* text, size_t length);
