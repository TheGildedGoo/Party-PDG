#include "srs.h"

#include <Arduino.h>
#include <ArduinoJson.h>
#include <algorithm>
#include <map>
#include <string>
#include <vector>
#include "sd_store.h"
#include "settings.h"
#include "srs_algo.h"

struct Seen {
  int correct = 0;
  int wrong = 0;
  int64_t last = 0;
  int pick = -1;
};

static std::map<std::string, SrCard> cards;
static std::map<std::string, Seen> seen;
static std::map<std::string, std::pair<int, int>> chapters;
static std::vector<std::string> days;
static std::string exportCache;

static const char* todayText() {
  static char buf[11];
  time_t now = time(nullptr);
  struct tm local;
  if (now < 1700000000 || !localtime_r(&now, &local)) return "";
  snprintf(buf, sizeof(buf), "%04d-%02d-%02d", local.tm_year + 1900, local.tm_mon + 1, local.tm_mday);
  return buf;
}

static void addDay(const char* day) {
  if (!day || !day[0]) return;
  for (const std::string& have : days) {
    if (have == day) return;
  }
  days.push_back(day);
  std::sort(days.begin(), days.end());
}

static bool loadFile() {
  if (!sdExists(SD_PATH_PROGRESS)) return false;
  File file = sdOpen(SD_PATH_PROGRESS, FILE_READ);
  if (!file) return false;
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, file);
  file.close();
  if (err) return false;
  JsonObject sr = doc["sr"].is<JsonObject>() ? doc["sr"].as<JsonObject>() : doc.as<JsonObject>();
  cards.clear();
  seen.clear();
  chapters.clear();
  days.clear();
  for (JsonPair kv : sr["cards"].as<JsonObject>()) {
    JsonObject raw = kv.value().as<JsonObject>();
    SrCard card = {};
    card.ease = raw["ease"] | raw["ef"] | 2.5f;
    card.interval = raw["interval"] | 0;
    card.reps = raw["reps"] | 0;
    card.lapses = raw["lapses"] | 0;
    card.dueMs = raw["due"] | (int64_t)0;
    cards[kv.key().c_str()] = card;
  }
  for (JsonPair kv : sr["seen"].as<JsonObject>()) {
    JsonObject raw = kv.value().as<JsonObject>();
    Seen row;
    row.correct = raw["correct"] | 0;
    row.wrong = raw["wrong"] | 0;
    row.last = raw["last"] | (int64_t)0;
    row.pick = raw["pick"] | -1;
    seen[kv.key().c_str()] = row;
  }
  for (JsonPair kv : sr["chapters"].as<JsonObject>()) {
    JsonObject raw = kv.value().as<JsonObject>();
    chapters[kv.key().c_str()] = {raw["correct"] | 0, raw["wrong"] | 0};
  }
  for (const char* day : sr["days"].as<JsonArray>()) addDay(day);
  return true;
}

void srsBegin() { loadFile(); }
bool srsReload() { return loadFile(); }

bool srsLookup(const char* id, SrCard* out) {
  if (!id) return false;
  auto it = cards.find(id);
  if (it == cards.end()) return false;
  if (out) *out = it->second;
  return true;
}

void srsGrade(const Mcq& item, bool correct, int picked) {
  int64_t now = (int64_t)millis();
  time_t wall = time(nullptr);
  if (wall > 1700000000) now = (int64_t)wall * 1000LL;
  SrCard prev = {};
  auto it = cards.find(item.id);
  if (it != cards.end()) prev = it->second;
  cards[item.id] = gradeCard(prev, correct ? 4 : 1, now);
  Seen row = seen[item.id];
  if (correct) row.correct++;
  else row.wrong++;
  row.last = now;
  row.pick = picked;
  seen[item.id] = row;
  std::string key = std::to_string(item.chapter);
  auto ch = chapters[key];
  if (correct) ch.first++;
  else ch.second++;
  chapters[key] = ch;
  addDay(todayText());
  settingsNoteToday(correct);
  srsSave();
}

int srsWrong(const char* id) {
  auto it = seen.find(id);
  return it == seen.end() ? 0 : it->second.wrong;
}
int srsCorrect(const char* id) {
  auto it = seen.find(id);
  return it == seen.end() ? 0 : it->second.correct;
}
int srsLastPick(const char* id) {
  auto it = seen.find(id);
  return it == seen.end() ? -1 : it->second.pick;
}

int srsStreak() {
  if (days.empty()) return 0;
  const char* today = todayText();
  if (!today[0]) return (int)days.size() > 0 ? 1 : 0;
  auto has = [&](const std::string& day) {
    return std::find(days.begin(), days.end(), day) != days.end();
  };
  struct tm local = {};
  int y, m, d;
  if (sscanf(today, "%d-%d-%d", &y, &m, &d) != 3) return 0;
  local.tm_year = y - 1900;
  local.tm_mon = m - 1;
  local.tm_mday = d;
  time_t cursor = mktime(&local);
  if (!has(today)) cursor -= 86400;
  int streak = 0;
  for (int i = 0; i < 400; i++) {
    struct tm at;
    localtime_r(&cursor, &at);
    char key[11];
    snprintf(key, sizeof(key), "%04d-%02d-%02d", at.tm_year + 1900, at.tm_mon + 1, at.tm_mday);
    if (!has(key)) break;
    streak++;
    cursor -= 86400;
  }
  return streak;
}

static void writeSnapshot(JsonObject root) {
  JsonObject sr = root["sr"].to<JsonObject>();
  JsonObject cardObj = sr["cards"].to<JsonObject>();
  for (const auto& kv : cards) {
    JsonObject row = cardObj[kv.first].to<JsonObject>();
    row["ease"] = kv.second.ease;
    row["ef"] = kv.second.ease;
    row["interval"] = kv.second.interval;
    row["reps"] = kv.second.reps;
    row["lapses"] = kv.second.lapses;
    row["due"] = kv.second.dueMs;
  }
  JsonObject seenObj = sr["seen"].to<JsonObject>();
  for (const auto& kv : seen) {
    JsonObject row = seenObj[kv.first].to<JsonObject>();
    row["correct"] = kv.second.correct;
    row["wrong"] = kv.second.wrong;
    row["last"] = kv.second.last;
    row["pick"] = kv.second.pick;
  }
  JsonObject chObj = sr["chapters"].to<JsonObject>();
  for (const auto& kv : chapters) {
    JsonObject row = chObj[kv.first].to<JsonObject>();
    row["correct"] = kv.second.first;
    row["wrong"] = kv.second.second;
  }
  JsonArray dayArr = sr["days"].to<JsonArray>();
  for (const std::string& day : days) dayArr.add(day);
  sr["mocks"].to<JsonArray>();
}

bool srsSave() {
  if (!sdReady()) return false;
  JsonDocument doc;
  writeSnapshot(doc.to<JsonObject>());
  String body;
  serializeJson(doc, body);
  return sdReplace(SD_PATH_PROGRESS, body.c_str(), body.length());
}

static int64_t endedAt(JsonObject snap) {
  const char* text = snap["lastSession"]["endedAt"] | "";
  if (!text[0]) return 0;
  return (int64_t)strlen(text);
}

bool srsMergeRemote(const char* json, size_t length) {
  JsonDocument remote;
  if (deserializeJson(remote, json, length)) return false;
  JsonObject snap = remote["progress"].is<JsonObject>() ? remote["progress"].as<JsonObject>() : remote.as<JsonObject>();
  JsonObject sr = snap["sr"].as<JsonObject>();
  if (sr.isNull()) return false;
  for (JsonPair kv : sr["cards"].as<JsonObject>()) {
    JsonObject raw = kv.value().as<JsonObject>();
    SrCard incoming = {};
    incoming.ease = raw["ease"] | raw["ef"] | 2.5f;
    incoming.interval = raw["interval"] | 0;
    incoming.reps = raw["reps"] | 0;
    incoming.lapses = raw["lapses"] | 0;
    incoming.dueMs = raw["due"] | (int64_t)0;
    auto it = cards.find(kv.key().c_str());
    if (it == cards.end()) {
      cards[kv.key().c_str()] = incoming;
      continue;
    }
    SrCard& local = it->second;
    int localReps = local.reps > 0 ? local.reps : 0;
    int remoteReps = incoming.reps > 0 ? incoming.reps : 0;
    if (remoteReps > localReps || (remoteReps == localReps && incoming.dueMs > local.dueMs)) {
      if (local.lapses > incoming.lapses) incoming.lapses = local.lapses;
      local = incoming;
    }
  }
  for (JsonPair kv : sr["seen"].as<JsonObject>()) {
    JsonObject raw = kv.value().as<JsonObject>();
    Seen& row = seen[kv.key().c_str()];
    int correct = raw["correct"] | 0;
    int wrong = raw["wrong"] | 0;
    int64_t last = raw["last"] | (int64_t)0;
    if (correct > row.correct) row.correct = correct;
    if (wrong > row.wrong) row.wrong = wrong;
    if (last > row.last) row.last = last;
  }
  for (JsonPair kv : sr["chapters"].as<JsonObject>()) {
    JsonObject raw = kv.value().as<JsonObject>();
    auto& row = chapters[kv.key().c_str()];
    int correct = raw["correct"] | 0;
    int wrong = raw["wrong"] | 0;
    if (correct > row.first) row.first = correct;
    if (wrong > row.second) row.second = wrong;
  }
  for (const char* day : sr["days"].as<JsonArray>()) addDay(day);
  (void)endedAt;
  return srsSave();
}

const char* srsExportJson() {
  JsonDocument doc;
  JsonObject root = doc.to<JsonObject>();
  writeSnapshot(root);
  exportCache.clear();
  serializeJson(doc, exportCache);
  return exportCache.c_str();
}
