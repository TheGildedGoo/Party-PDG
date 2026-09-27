#include <Arduino.h>
#include "audio.h"
#include "bank.h"
#include "display.h"
#include "haptic.h"
#include "power.h"
#include "settings.h"
#include "srs.h"
#include "ui.h"
#include "wifi_link.h"

void setup() {
  Serial.begin(115200);
  delay(150);
  settingsBegin();
  if (settings().airplane) wifiForceOff();
  hapticBegin();
  audioBegin();
  powerBegin();
  bankBegin();
  srsBegin();
  displayBegin();
  uiBegin();
}

void loop() {
  uiLoop();
  delay(5);
}
