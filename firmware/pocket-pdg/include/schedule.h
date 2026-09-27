#pragma once

#include <time.h>

struct PocketSchedule {
  int slotMin[6];
  bool slotOn[6];
  int quietStart;
  int quietEnd;
  bool quietOn;
};

inline bool minuteInQuiet(int minute, const PocketSchedule& sched) {
  if (!sched.quietOn) return false;
  int start = sched.quietStart;
  int end = sched.quietEnd;
  if (start < 0) start = 0;
  if (end < 0) end = 0;
  if (start == end) return false;
  if (start < end) return minute >= start && minute < end;
  return minute >= start || minute < end;
}

/* Next enabled slot strictly after `now`, skipping quiet hours. 0 if none in 8 days. */
inline time_t nextWakeUnix(time_t now, const PocketSchedule& sched) {
  if (now <= 0) return 0;
  for (int day = 0; day < 8; day++) {
    time_t probe = now + (time_t)day * 86400;
    struct tm local;
    if (!localtime_r(&probe, &local)) continue;
    local.tm_hour = 0;
    local.tm_min = 0;
    local.tm_sec = 0;
    time_t midnight = mktime(&local);
    if (midnight < 0) continue;
    for (int i = 0; i < 6; i++) {
      if (!sched.slotOn[i]) continue;
      int minute = sched.slotMin[i];
      if (minute < 0 || minute >= 24 * 60) continue;
      time_t when = midnight + (time_t)minute * 60;
      if (when <= now + 20) continue;
      struct tm at;
      if (!localtime_r(&when, &at)) continue;
      int minuteOfDay = at.tm_hour * 60 + at.tm_min;
      if (minuteInQuiet(minuteOfDay, sched)) continue;
      return when;
    }
  }
  return 0;
}
