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
int wifiScan();
int wifiScanCount();
const char* wifiScanSsid(int index);
int wifiScanRssi(int index);
void wifiNotePortalSaved(bool saved);
bool wifiPortalSaved();
const char* wifiPortalSsid();
const char* wifiPortalPass();
