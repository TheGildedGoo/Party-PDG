#include <assert.h>
#include <stdio.h>
#include <string.h>
#include <time.h>
#include "../include/schedule.h"
#include "../include/srs_algo.h"

static void testSm2() {
  SrCard card = {};
  SrCard next = gradeCard(card, 4, 1000);
  assert(next.reps == 1);
  assert(next.interval == 1);
  assert(next.dueMs == 1000 + 86400000LL);
  assert(next.lapses == 0);
  SrCard again = gradeCard(next, 1, next.dueMs);
  assert(again.reps == 0);
  assert(again.interval == 1);
  assert(again.lapses == 1);
  SrCard third = gradeCard(again, 5, 5000);
  third = gradeCard(third, 5, 9000);
  assert(third.reps == 2);
  assert(third.interval == 6);
}

static void testMix() {
  std::vector<MixRow> rows;
  for (int i = 0; i < 10; i++) rows.push_back({i, MixBucket::Due});
  for (int i = 10; i < 20; i++) rows.push_back({i, MixBucket::Review});
  for (int i = 20; i < 30; i++) rows.push_back({i, MixBucket::Unseen});
  std::vector<int> picked = mixSession(rows, 10, 7);
  assert(picked.size() == 10);
  int due = 0, review = 0, unseen = 0;
  for (int id : picked) {
    if (id < 10) due++;
    else if (id < 20) review++;
    else unseen++;
  }
  assert(due == 6);
  assert(review == 3);
  assert(unseen == 1);
}

static void testQuiet() {
  PocketSchedule sched = {};
  sched.quietOn = true;
  sched.quietStart = 22 * 60;
  sched.quietEnd = 6 * 60;
  assert(minuteInQuiet(23 * 60, sched));
  assert(minuteInQuiet(5 * 60, sched));
  assert(!minuteInQuiet(7 * 60, sched));
  assert(!minuteInQuiet(21 * 60, sched));
  sched.slotOn[0] = true;
  sched.slotMin[0] = 5 * 60;
  sched.slotOn[1] = true;
  sched.slotMin[1] = 7 * 60;
  setenv("TZ", "UTC0", 1);
  tzset();
  struct tm tm = {};
  tm.tm_year = 126;
  tm.tm_mon = 0;
  tm.tm_mday = 2;
  tm.tm_hour = 4;
  time_t now = mktime(&tm);
  time_t wake = nextWakeUnix(now, sched);
  struct tm at;
  localtime_r(&wake, &at);
  assert(at.tm_hour == 7);
}

int main() {
  testSm2();
  testMix();
  testQuiet();
  printf("host checks ok\n");
  return 0;
}
