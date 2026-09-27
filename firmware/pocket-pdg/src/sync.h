#pragma once

enum class SyncResult { Ok, Offline, Airplane, Auth, Failed };

SyncResult syncNow();
bool syncLogin(const char* email, const char* password);
const char* syncLastError();
