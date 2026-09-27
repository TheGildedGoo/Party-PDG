#include "bank.h"

#include <Arduino.h>
#include <ArduinoJson.h>
#include <string.h>
#include "fixture_bank.h"
#include "sd_store.h"

static Mcq* items = nullptr;
static int count = 0;
static bool fixture = true;
static ChapterInfo chapters[24];
static int chapterCount = 0;

static void copyText(char* dst, size_t n, const char* src) {
  if (!src) src = "";
  strncpy(dst, src, n - 1);
  dst[n - 1] = 0;
}

static uint8_t rankBits(JsonArray ranks) {
  uint8_t bits = 0;
  for (JsonVariant rank : ranks) {
    const char* text = rank.as<const char*>();
    if (!text) continue;
    if (strcmp(text, "E5") == 0) bits |= 1;
    if (strcmp(text, "E6") == 0) bits |= 2;
  }
  return bits;
}

static uint8_t rankBitsText(const char* text) {
  uint8_t bits = 0;
  if (text && strstr(text, "E5")) bits |= 1;
  if (text && strstr(text, "E6")) bits |= 2;
  return bits;
}

static void setChaptersFixture() {
  chapterCount = 2;
  memset(chapters, 0, sizeof(chapters));
  chapters[0].number = 1;
  strncpy(chapters[0].title, "Professionalism", sizeof(chapters[0].title) - 1);
  strncpy(chapters[0].waps, "E5+E6", sizeof(chapters[0].waps) - 1);
  chapters[1].number = 9;
  strncpy(chapters[1].title, "Enlisted Promotions", sizeof(chapters[1].title) - 1);
  strncpy(chapters[1].waps, "E5+E6", sizeof(chapters[1].waps) - 1);
}

static bool allocItems(int n) {
  if (items) {
    heap_caps_free(items);
    items = nullptr;
  }
  count = 0;
  if (n <= 0) return false;
  uint32_t caps = MALLOC_CAP_8BIT;
  if (psramFound()) caps |= MALLOC_CAP_SPIRAM;
  items = (Mcq*)heap_caps_malloc(sizeof(Mcq) * n, caps);
  if (!items && psramFound()) items = (Mcq*)heap_caps_malloc(sizeof(Mcq) * n, MALLOC_CAP_8BIT);
  if (!items) return false;
  memset(items, 0, sizeof(Mcq) * n);
  return true;
}

static void loadFixture() {
  if (!allocItems(FIXTURE_BANK_COUNT)) return;
  for (int i = 0; i < FIXTURE_BANK_COUNT; i++) {
    const FixtureMcq& src = FIXTURE_BANK[i];
    Mcq& dst = items[i];
    copyText(dst.id, sizeof(dst.id), src.id);
    copyText(dst.question, sizeof(dst.question), src.question);
    for (int c = 0; c < 4; c++) copyText(dst.choice[c], sizeof(dst.choice[c]), src.choices[c]);
    copyText(dst.section, sizeof(dst.section), src.section);
    copyText(dst.para, sizeof(dst.para), src.para);
    copyText(dst.title, sizeof(dst.title), src.title);
    copyText(dst.explain, sizeof(dst.explain), src.explain);
    copyText(dst.source, sizeof(dst.source), src.source);
    dst.answer = (uint8_t)src.answer;
    dst.difficulty = (uint8_t)src.difficulty;
    dst.chapter = (uint8_t)src.chapter;
    dst.ranks = rankBitsText(src.ranks);
  }
  count = FIXTURE_BANK_COUNT;
  fixture = true;
  setChaptersFixture();
}

struct PsramAlloc : ArduinoJson::Allocator {
  void* allocate(size_t size) override {
    return heap_caps_malloc(size, psramFound() ? (MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT) : MALLOC_CAP_8BIT);
  }
  void deallocate(void* ptr) override { heap_caps_free(ptr); }
  void* reallocate(void* ptr, size_t size) override {
    return heap_caps_realloc(ptr, size, psramFound() ? (MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT) : MALLOC_CAP_8BIT);
  }
};

void bankBegin() {
  if (!bankLoadFile()) loadFixture();
}

int bankCount() { return count; }
const Mcq* bankAt(int index) {
  if (!items || index < 0 || index >= count) return nullptr;
  return &items[index];
}
bool bankUsingFixture() { return fixture; }

int bankChapters(const ChapterInfo** out) {
  if (out) *out = chapters;
  return chapterCount;
}

static bool readPath(const char* path) {
  if (!sdExists(path)) return false;
  File file = sdOpen(path, FILE_READ);
  if (!file) return false;
  size_t n = file.size();
  if (n < 20 || n > 900000) {
    file.close();
    return false;
  }
  char* buf = (char*)heap_caps_malloc(n + 1, psramFound() ? (MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT) : MALLOC_CAP_8BIT);
  if (!buf) {
    file.close();
    return false;
  }
  file.readBytes(buf, n);
  buf[n] = 0;
  file.close();
  bool ok = bankIngest(buf, n);
  heap_caps_free(buf);
  return ok;
}

bool bankLoadFile() {
  const char* paths[] = {SD_PATH_BANK, SD_PATH_BANK_ALT, SD_PATH_BANK_ROOT, SD_PATH_BANK_ROOT_MCQ};
  for (const char* path : paths) {
    if (readPath(path)) return true;
  }
  return false;
}

bool bankIngest(const char* json, size_t length) {
  PsramAlloc alloc;
  JsonDocument doc(&alloc);
  if (deserializeJson(doc, json, length)) return false;
  JsonArray rawItems = doc["items"].is<JsonArray>() ? doc["items"].as<JsonArray>() : doc.as<JsonArray>();
  if (rawItems.isNull()) return false;
  int n = rawItems.size();
  if (n <= 0 || n > 2000) return false;
  if (!allocItems(n)) return false;
  int wrote = 0;
  for (JsonObject raw : rawItems) {
    const char* kind = raw["kind"] | "mcq";
    if (strcmp(kind, "mcq") != 0) continue;
    JsonArray choices = raw["choices"].as<JsonArray>();
    if (choices.size() != 4) continue;
    JsonObject cite = raw["cite"].as<JsonObject>();
    const char* para = cite["para"] | "";
    if (!para[0] || cite["chapter"].isNull() || !cite["section"].is<const char*>()) continue;
    Mcq& dst = items[wrote++];
    copyText(dst.id, sizeof(dst.id), raw["id"] | "");
    copyText(dst.question, sizeof(dst.question), raw["question"] | "");
    for (int c = 0; c < 4; c++) copyText(dst.choice[c], sizeof(dst.choice[c]), choices[c] | "");
    copyText(dst.section, sizeof(dst.section), cite["section"] | "");
    copyText(dst.para, sizeof(dst.para), para);
    copyText(dst.title, sizeof(dst.title), cite["title"] | "");
    copyText(dst.explain, sizeof(dst.explain), raw["explain"] | "");
    copyText(dst.source, sizeof(dst.source), raw["source"] | "");
    dst.answer = (uint8_t)(raw["answerIndex"] | 0);
    dst.difficulty = (uint8_t)(raw["difficulty"] | 1);
    dst.chapter = (uint8_t)(cite["chapter"] | 0);
    dst.ranks = rankBits(raw["ranks"].as<JsonArray>());
  }
  count = wrote;
  fixture = false;
  chapterCount = 0;
  JsonArray rawChapters = doc["chapters"].as<JsonArray>();
  for (JsonObject raw : rawChapters) {
    if (chapterCount >= 24) break;
    ChapterInfo& ch = chapters[chapterCount++];
    ch.number = raw["number"] | raw["chapter"] | 0;
    copyText(ch.title, sizeof(ch.title), raw["title"] | "");
    copyText(ch.waps, sizeof(ch.waps), raw["waps"] | "off");
  }
  if (chapterCount == 0) setChaptersFixture();
  return wrote > 0;
}

int bankIndexOf(const char* id) {
  if (!id) return -1;
  for (int i = 0; i < count; i++) {
    if (strcmp(items[i].id, id) == 0) return i;
  }
  return -1;
}
