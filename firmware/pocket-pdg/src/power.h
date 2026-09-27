#pragma once

#include <stdint.h>

void powerBegin();
void powerSetBrightness(uint8_t percent);
void powerDimCheck(bool waiting);
void powerWakeScreen();
int powerBatteryPercent();
void powerSleepUntilSchedule();
bool powerWokeFromTimer();
bool powerQuietNow();
