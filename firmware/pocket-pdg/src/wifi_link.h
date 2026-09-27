#pragma once

#include <Arduino.h>

void wifiForceOff();
bool wifiAirplane();
bool wifiConnect(const char* ssid, const char* pass, uint32_t timeoutMs);
void wifiStartSetupAp();
void wifiStopAp();
bool wifiApUp();
void wifiHandle();
bool wifiConnected();
int wifiRssi();
void wifiNotePortalSaved(bool saved);
bool wifiPortalSaved();
const char* wifiPortalSsid();
const char* wifiPortalPass();
