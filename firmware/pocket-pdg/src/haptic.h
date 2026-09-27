#pragma once

#include <stddef.h>
#include <stdint.h>

void i2cBegin();
void i2cScan(bool* touch, bool* haptic, bool* codec);
void hapticBegin();
bool hapticReady();
void hapticTick();
void hapticClick();
void hapticWrong();
void hapticAlarm();
void hapticStandby();
void hapticBuzz(uint16_t ms);
void hapticDebug(char* dst, size_t n);
