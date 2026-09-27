#include "ui.h"

#include <Arduino.h>
#include <algorithm>
#include <stdio.h>
#include <vector>
#include "audio.h"
#include "bank.h"
#include "display.h"
#include "haptic.h"
#include "power.h"
#include "quiz.h"
#include "sd_store.h"
#include "settings.h"
#include "srs.h"
#include "sync.h"
#include "wifi_link.h"

enum class Page { Boot, Wifi, Login, Home, Quiz, Feedback, Result, Analytics, Alarm };

static Page page = Page::Boot;
static uint32_t pageAt = 0;
static uint32_t feedbackUntil = 0;
static bool feedbackOk = false;
static int feedbackChoice = -1;
static int analyticsChapter = 0;
static char statusLine[96] = "";
static lv_obj_t* emailBox = nullptr;
static lv_obj_t* passBox = nullptr;

static void showBoot();
static void showWifi();
static void showLogin();
static void showHome();
static void showQuiz();
static void showFeedback();
static void showResult();
static void showAnalytics();
static void showAlarm();

static lv_obj_t* fresh() {
  lv_obj_t* scr = lv_obj_create(nullptr);
  lv_obj_set_style_bg_color(scr, lv_color_hex(0x1C1C1C), 0);
  lv_obj_set_style_text_color(scr, lv_color_hex(0xF4F1EA), 0);
  lv_obj_set_style_text_font(scr, &lv_font_montserrat_16, 0);
  lv_obj_set_style_pad_all(scr, 8, 0);
  lv_obj_set_style_pad_row(scr, 8, 0);
  lv_obj_set_flex_flow(scr, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_scrollbar_mode(scr, LV_SCROLLBAR_MODE_AUTO);
  lv_scr_load_anim(scr, LV_SCR_LOAD_ANIM_NONE, 0, 0, true);
  return scr;
}

static lv_obj_t* addLabel(lv_obj_t* parent, const char* text, const lv_font_t* font) {
  lv_obj_t* lab = lv_label_create(parent);
  lv_label_set_text(lab, text);
  lv_label_set_long_mode(lab, LV_LABEL_LONG_WRAP);
  lv_obj_set_width(lab, lv_pct(100));
  if (font) lv_obj_set_style_text_font(lab, font, 0);
  return lab;
}

static void onTap(lv_event_t* e);

static lv_obj_t* addButton(lv_obj_t* parent, const char* text, intptr_t act, bool accent) {
  lv_obj_t* btn = lv_btn_create(parent);
  lv_obj_set_width(btn, lv_pct(100));
  lv_obj_set_style_min_height(btn, 44, 0);
  lv_obj_set_style_bg_color(btn, lv_color_hex(accent ? 0xC4A35A : 0x2A2A2A), 0);
  lv_obj_set_style_text_color(btn, lv_color_hex(accent ? 0x1C1C1C : 0xF4F1EA), 0);
  lv_obj_add_event_cb(btn, onTap, LV_EVENT_CLICKED, (void*)act);
  lv_obj_t* lab = lv_label_create(btn);
  lv_label_set_text(lab, text);
  lv_obj_center(lab);
  return btn;
}

static void routeAfterBoot() {
  if (settings().airplane || settingsHasWifi()) {
    if (!settingsHasToken() && !settings().airplane && settingsHasWifi()) showLogin();
    else showHome();
  } else {
    showWifi();
  }
}

static void startBuiltQuiz() {
  std::vector<int> ids = quizBuild();
  if (ids.empty()) {
    strncpy(statusLine, "No items in the selected chapters.", sizeof(statusLine) - 1);
    showHome();
    return;
  }
  quizStart(ids);
  showQuiz();
}

static void adjustSlot(int index, int delta) {
  int value = (int)settings().slotMin[index] + delta;
  if (value < 0) value += 24 * 60;
  if (value >= 24 * 60) value -= 24 * 60;
  settings().slotMin[index] = (uint16_t)value;
  settingsSave();
  showHome();
}

static void onTap(lv_event_t* e) {
  intptr_t act = (intptr_t)lv_event_get_user_data(e);
  hapticTick();
  powerWakeScreen();
  if (act == 1) {
    const char* email = emailBox ? lv_textarea_get_text(emailBox) : "";
    const char* pass = passBox ? lv_textarea_get_text(passBox) : "";
    if (syncLogin(email, pass)) {
      syncNow();
      showHome();
    } else {
      strncpy(statusLine, "Login failed. Check the account.", sizeof(statusLine) - 1);
      showLogin();
    }
    return;
  }
  if (act == 2) { showHome(); return; }
  if (act == 3) { startBuiltQuiz(); return; }
  if (act == 4) {
    SyncResult result = syncNow();
    if (result == SyncResult::Airplane) strncpy(statusLine, "Airplane mode is on.", sizeof(statusLine) - 1);
    else if (result == SyncResult::Auth) strncpy(statusLine, "Log in to sync.", sizeof(statusLine) - 1);
    else if (result == SyncResult::Ok) strncpy(statusLine, "Sync finished.", sizeof(statusLine) - 1);
    else strncpy(statusLine, "Sync failed. Local study kept.", sizeof(statusLine) - 1);
    showHome();
    return;
  }
  if (act == 5) { showAnalytics(); return; }
  if (act == 6) { powerSleepUntilSchedule(); return; }
  if (act == 7) { showHome(); return; }
  if (act == 8) {
    quizStart(quizMissIndexes());
    if (quizLength() == 0) showHome();
    else showQuiz();
    return;
  }
  if (act == 9) { showAlarm(); return; }
  if (act == 20) { settings().rank = 5; settingsSave(); showHome(); return; }
  if (act == 21) { settings().rank = 6; settingsSave(); showHome(); return; }
  if (act == 30 || act == 31 || act == 32 || act == 33) {
    const uint8_t sizes[] = {3, 5, 10, 15};
    settings().sessionSize = sizes[act - 30];
    settingsSave();
    showHome();
    return;
  }
  if (act == 40) {
    settings().hapticOn = settings().hapticOn ? 0 : 1;
    settingsSave();
    showHome();
    return;
  }
  if (act == 41) {
    settings().soundOn = settings().soundOn ? 0 : 1;
    settingsSave();
    showHome();
    return;
  }
  if (act == 42) {
    settings().airplane = settings().airplane ? 0 : 1;
    if (settings().airplane) wifiForceOff();
    settingsSave();
    showHome();
    return;
  }
  if (act == 43) { showWifi(); return; }
  if (act == 44) {
    if (!wifiPortalSaved()) strncpy(statusLine, "Open 192.168.4.1 and tap Save.", sizeof(statusLine) - 1);
    showWifi();
    return;
  }
  if (act == 50) { analyticsChapter = 0; showAnalytics(); return; }
  if (act >= 60 && act < 84) { analyticsChapter = (int)(act - 60); showAnalytics(); return; }
  if (act >= 100 && act < 124) {
    uint32_t bit = 1u << (act - 100);
    settings().chapterMask ^= bit;
    settingsSave();
    showHome();
    return;
  }
  if (act >= 300 && act < 306) {
    int i = (int)act - 300;
    settings().slotOn[i] = settings().slotOn[i] ? 0 : 1;
    settingsSave();
    showHome();
    return;
  }
  if (act >= 310 && act < 316) { adjustSlot((int)act - 310, -15); return; }
  if (act >= 320 && act < 326) { adjustSlot((int)act - 320, 15); return; }
  if (act == 330) { settings().quietOn = settings().quietOn ? 0 : 1; settingsSave(); showHome(); return; }
  if (act == 331 || act == 332 || act == 333 || act == 334) {
    uint16_t* field = (act == 331 || act == 332) ? &settings().quietStart : &settings().quietEnd;
    int delta = (act == 331 || act == 333) ? -15 : 15;
    int value = (int)(*field) + delta;
    if (value < 0) value += 1440;
    if (value >= 1440) value -= 1440;
    *field = (uint16_t)value;
    settingsSave();
    showHome();
    return;
  }
  if (act >= 400 && act < 404) {
    feedbackChoice = (int)act - 400;
    feedbackOk = quizAnswer(feedbackChoice);
    feedbackUntil = millis() + 700;
    showFeedback();
  }
}

static void onBright(lv_event_t* e) {
  int value = lv_slider_get_value(lv_event_get_target(e));
  settings().brightness = (uint8_t)value;
  powerSetBrightness((uint8_t)value);
  if (lv_event_get_code(e) == LV_EVENT_RELEASED) settingsSave();
}

static void onFocus(lv_event_t* e) {
  lv_obj_t* kb = (lv_obj_t*)lv_event_get_user_data(e);
  lv_keyboard_set_textarea(kb, lv_event_get_target(e));
}

static void showBoot() {
  page = Page::Boot;
  pageAt = millis();
  bool touch = false, motor = false, codec = false;
  i2cScan(&touch, &motor, &codec);
  lv_obj_t* scr = fresh();
  addLabel(scr, "Pocket PDG", &lv_font_montserrat_28);
  char line[96];
  snprintf(line, sizeof(line), "Touch %s   Motor %s\nCodec %s",
           touch ? "0x38" : "missing", motor ? "0x5A" : "missing", codec ? "0x18" : "missing");
  addLabel(scr, line, &lv_font_montserrat_16);
  addLabel(scr, sdReady() ? sdStatus() : "No SD card", &lv_font_montserrat_16);
  addLabel(scr, "Unofficial study aid.", &lv_font_montserrat_14);
}

static void showWifi() {
  page = Page::Wifi;
  pageAt = millis();
  if (!wifiApUp() && !settings().airplane) wifiStartSetupAp();
  lv_obj_t* scr = fresh();
  addLabel(scr, "Wi-Fi", &lv_font_montserrat_28);
  addLabel(scr, "Join PocketPDG-Setup, then open 192.168.4.1", &lv_font_montserrat_16);
  if (statusLine[0]) addLabel(scr, statusLine, &lv_font_montserrat_14);
  addButton(scr, "I saved the network", 44, true);
  if (bankCount() > 0) addButton(scr, "Skip, study offline", 2, false);
}

static void showLogin() {
  page = Page::Login;
  pageAt = millis();
  lv_obj_t* scr = fresh();
  addLabel(scr, "Log in", &lv_font_montserrat_28);
  if (statusLine[0]) addLabel(scr, statusLine, &lv_font_montserrat_14);
  emailBox = lv_textarea_create(scr);
  lv_textarea_set_placeholder_text(emailBox, "Email");
  lv_textarea_set_one_line(emailBox, true);
  lv_textarea_set_text(emailBox, settings().email);
  lv_obj_set_width(emailBox, lv_pct(100));
  passBox = lv_textarea_create(scr);
  lv_textarea_set_placeholder_text(passBox, "Password");
  lv_textarea_set_one_line(passBox, true);
  lv_textarea_set_password_mode(passBox, true);
  lv_obj_set_width(passBox, lv_pct(100));
  lv_obj_t* kb = lv_keyboard_create(scr);
  lv_obj_set_size(kb, lv_pct(100), 108);
  lv_obj_add_flag(kb, LV_OBJ_FLAG_FLOATING);
  lv_obj_align(kb, LV_ALIGN_BOTTOM_MID, 0, 0);
  lv_obj_set_style_pad_bottom(scr, 112, 0);
  lv_keyboard_set_textarea(kb, emailBox);
  lv_obj_add_event_cb(emailBox, onFocus, LV_EVENT_FOCUSED, kb);
  lv_obj_add_event_cb(passBox, onFocus, LV_EVENT_FOCUSED, kb);
  addButton(scr, "Log in", 1, true);
  if (bankCount() > 0) addButton(scr, "Skip, study offline", 2, false);
}

static void hhmm(char* dst, size_t n, int minute) {
  snprintf(dst, n, "%02d:%02d", minute / 60, minute % 60);
}

static void showHome() {
  page = Page::Home;
  pageAt = millis();
  emailBox = nullptr;
  passBox = nullptr;
  lv_obj_t* scr = fresh();
  addLabel(scr, "Pocket PDG", &lv_font_montserrat_20);
  int bat = powerBatteryPercent();
  char head[80];
  if (bat < 0) snprintf(head, sizeof(head), "Battery n/a   %s", settings().airplane ? "Airplane" : (wifiConnected() ? "Wi-Fi" : "Offline"));
  else snprintf(head, sizeof(head), "Battery %d%%   %s", bat, settings().airplane ? "Airplane" : (wifiConnected() ? "Wi-Fi" : "Offline"));
  addLabel(scr, head, &lv_font_montserrat_16);
  addLabel(scr, sdReady() ? sdStatus() : "Insert a FAT32 microSD", &lv_font_montserrat_14);
  char sync[80];
  snprintf(sync, sizeof(sync), "Sync %s%s", settings().lastSync, settings().syncFailed ? " (failed)" : "");
  addLabel(scr, sync, &lv_font_montserrat_14);
  char study[80];
  snprintf(study, sizeof(study), "Streak %d    Today %u/%u", srsStreak(), settings().todayCorrect,
           (unsigned)(settings().todayCorrect + settings().todayWrong));
  addLabel(scr, study, &lv_font_montserrat_16);
  if (statusLine[0]) addLabel(scr, statusLine, &lv_font_montserrat_14);
  if (bankUsingFixture()) addLabel(scr, "Fixture bank. Sync to load AFH 1.", &lv_font_montserrat_14);

  addLabel(scr, "Rank", &lv_font_montserrat_14);
  addButton(scr, settings().rank == 5 ? "E-5 track  (on)" : "E-5 track", 20, settings().rank == 5);
  addButton(scr, settings().rank == 6 ? "E-6 track  (on)" : "E-6 track", 21, settings().rank == 6);

  addLabel(scr, "Session", &lv_font_montserrat_14);
  const int sizes[] = {3, 5, 10, 15};
  for (int i = 0; i < 4; i++) {
    char text[24];
    snprintf(text, sizeof(text), "%d questions%s", sizes[i], settings().sessionSize == sizes[i] ? "  (on)" : "");
    addButton(scr, text, 30 + i, settings().sessionSize == sizes[i]);
  }

  addLabel(scr, "Chapters", &lv_font_montserrat_14);
  const ChapterInfo* chapters = nullptr;
  int n = bankChapters(&chapters);
  for (int i = 0; i < n; i++) {
    if (strcmp(chapters[i].waps, "off") == 0) continue;
    bool on = chapters[i].number >= 1 && (settings().chapterMask & (1u << (chapters[i].number - 1)));
    char text[80];
    snprintf(text, sizeof(text), "%s Ch %d %s", on ? "[x]" : "[ ]", chapters[i].number, chapters[i].title);
    addButton(scr, text, 100 + chapters[i].number - 1, false);
  }

  addLabel(scr, "Daily schedule", &lv_font_montserrat_14);
  for (int i = 0; i < 6; i++) {
    char text[40];
    char clock[8];
    hhmm(clock, sizeof(clock), settings().slotMin[i]);
    snprintf(text, sizeof(text), "%s  %s", settings().slotOn[i] ? "On" : "Off", clock);
    addButton(scr, text, 300 + i, settings().slotOn[i]);
    addButton(scr, "Earlier", 310 + i, false);
    addButton(scr, "Later", 320 + i, false);
  }

  char quiet[48];
  char a[8], b[8];
  hhmm(a, sizeof(a), settings().quietStart);
  hhmm(b, sizeof(b), settings().quietEnd);
  snprintf(quiet, sizeof(quiet), "Quiet hours %s  %s-%s", settings().quietOn ? "on" : "off", a, b);
  addLabel(scr, quiet, &lv_font_montserrat_14);
  addButton(scr, settings().quietOn ? "Quiet hours on" : "Quiet hours off", 330, settings().quietOn);
  addButton(scr, "Quiet start earlier", 331, false);
  addButton(scr, "Quiet start later", 332, false);
  addButton(scr, "Quiet end earlier", 333, false);
  addButton(scr, "Quiet end later", 334, false);

  addLabel(scr, "Brightness", &lv_font_montserrat_14);
  lv_obj_t* slider = lv_slider_create(scr);
  lv_obj_set_width(slider, lv_pct(100));
  lv_obj_set_style_min_height(slider, 44, 0);
  lv_slider_set_range(slider, 5, 100);
  lv_slider_set_value(slider, settings().brightness, LV_ANIM_OFF);
  lv_obj_add_event_cb(slider, onBright, LV_EVENT_VALUE_CHANGED, nullptr);
  lv_obj_add_event_cb(slider, onBright, LV_EVENT_RELEASED, nullptr);
  lv_obj_set_style_bg_color(slider, lv_color_hex(0xC4A35A), LV_PART_INDICATOR);
  lv_obj_set_style_bg_color(slider, lv_color_hex(0xC4A35A), LV_PART_KNOB);

  addButton(scr, settings().hapticOn ? "Haptic on" : "Haptic off", 40, false);
  addButton(scr, settings().soundOn ? "Sound on" : "Sound off", 41, false);
  addButton(scr, settings().airplane ? "Airplane on" : "Airplane off", 42, false);
  addButton(scr, "Wi-Fi setup", 43, false);
  addButton(scr, "Start now", 3, true);
  addButton(scr, "Sync now", 4, false);
  addButton(scr, "Analytics", 5, false);
  addButton(scr, "Sleep", 6, false);
}

static void showQuiz() {
  page = Page::Quiz;
  pageAt = millis();
  const Mcq* item = quizCurrent();
  if (!item) { showResult(); return; }
  lv_obj_t* scr = fresh();
  char meta[64];
  snprintf(meta, sizeof(meta), "%d / %d    Ch %u %s", quizPos() + 1, quizLength(), item->chapter, item->section);
  addLabel(scr, meta, &lv_font_montserrat_14);
  addLabel(scr, item->question, &lv_font_montserrat_16);
  for (int i = 0; i < 4; i++) addButton(scr, item->choice[i], 400 + i, false);
}

static void showFeedback() {
  page = Page::Feedback;
  const Mcq* item = quizCurrent();
  lv_obj_t* scr = fresh();
  addLabel(scr, feedbackOk ? "Correct" : "Not quite", feedbackOk ? &lv_font_montserrat_28 : &lv_font_montserrat_28);
  if (item) {
    addLabel(scr, item->choice[item->answer], &lv_font_montserrat_16);
    addLabel(scr, item->explain, &lv_font_montserrat_14);
    char cite[80];
    snprintf(cite, sizeof(cite), "Ch %u  %s  para %s", item->chapter, item->section, item->para);
    addLabel(scr, cite, &lv_font_montserrat_14);
    addLabel(scr, item->source, &lv_font_montserrat_14);
  }
  lv_color_t color = lv_color_hex(feedbackOk ? 0x3D9A6A : 0xC45C4A);
  lv_obj_set_style_bg_color(scr, color, 0);
}

static void showResult() {
  page = Page::Result;
  pageAt = millis();
  lv_obj_t* scr = fresh();
  char line[48];
  snprintf(line, sizeof(line), "%d / %d", quizScore(), quizLength());
  addLabel(scr, "Session", &lv_font_montserrat_14);
  addLabel(scr, line, &lv_font_montserrat_28);
  addButton(scr, "Home", 7, false);
  addButton(scr, "Retry misses", 8, true);
  addButton(scr, "Sleep", 6, false);
}

static void showAnalytics() {
  page = Page::Analytics;
  pageAt = millis();
  lv_obj_t* scr = fresh();
  addLabel(scr, "Missed", &lv_font_montserrat_20);
  char filter[40];
  snprintf(filter, sizeof(filter), analyticsChapter ? "Chapter %d" : "All chapters", analyticsChapter);
  addLabel(scr, filter, &lv_font_montserrat_14);
  addButton(scr, "All chapters", 50, analyticsChapter == 0);
  struct Row { int index; int wrong; };
  std::vector<Row> rows;
  for (int i = 0; i < bankCount(); i++) {
    const Mcq* item = bankAt(i);
    if (!item) continue;
    if (analyticsChapter && item->chapter != analyticsChapter) continue;
    int wrong = srsWrong(item->id);
    if (wrong <= 0) continue;
    rows.push_back({i, wrong});
  }
  std::sort(rows.begin(), rows.end(), [](const Row& a, const Row& b) { return a.wrong > b.wrong; });
  if (rows.empty()) addLabel(scr, "No misses yet.", &lv_font_montserrat_16);
  int shownChapters[24];
  int shownCount = 0;
  for (const Row& row : rows) {
    const Mcq* item = bankAt(row.index);
    int pick = srsLastPick(item->id);
    char block[420];
    const char* yours = (pick >= 0 && pick < 4) ? item->choice[pick] : "not on this brick";
    snprintf(block, sizeof(block), "%s\nYou: %s\nKey: %s\nCh %u  %s  para %s\n%s",
             item->question, yours, item->choice[item->answer], item->chapter, item->section, item->para, item->source);
    addLabel(scr, block, &lv_font_montserrat_14);
    bool have = false;
    for (int k = 0; k < shownCount; k++) if (shownChapters[k] == item->chapter) have = true;
    if (!have && shownCount < 24) shownChapters[shownCount++] = item->chapter;
  }
  for (int k = 0; k < shownCount; k++) {
    char text[24];
    snprintf(text, sizeof(text), "Only ch %d", shownChapters[k]);
    addButton(scr, text, 60 + shownChapters[k], false);
  }
  addButton(scr, "Home", 7, true);
}

static void showAlarm() {
  page = Page::Alarm;
  pageAt = millis();
  if (!powerQuietNow()) hapticAlarm();
  lv_obj_t* scr = fresh();
  addLabel(scr, "Session ready", &lv_font_montserrat_28);
  addLabel(scr, "Tap to start", &lv_font_montserrat_16);
  addButton(scr, "Start", 3, true);
  addButton(scr, "Not now", 6, false);
  powerSetBrightness(20);
}

void uiBegin() {
  pageAt = millis();
  if (powerWokeFromTimer()) {
    if (powerQuietNow()) powerSleepUntilSchedule();
    else showAlarm();
  } else {
    showBoot();
  }
}

void uiLoop() {
  wifiHandle();
  displayLoop();
  if (page == Page::Boot && millis() - pageAt > 900) routeAfterBoot();
  if (page == Page::Wifi && wifiPortalSaved()) {
    strncpy(settings().ssid, wifiPortalSsid(), sizeof(settings().ssid) - 1);
    strncpy(settings().pass, wifiPortalPass(), sizeof(settings().pass) - 1);
    settingsSave();
    wifiNotePortalSaved(false);
    wifiStopAp();
    if (wifiConnect(settings().ssid, settings().pass, 12000)) showLogin();
    else {
      strncpy(statusLine, "Could not join that network.", sizeof(statusLine) - 1);
      showWifi();
    }
  }
  if (page == Page::Feedback && (int32_t)(millis() - feedbackUntil) >= 0) {
    quizAdvance();
    if (quizFinished()) showResult();
    else showQuiz();
  }
  if (page == Page::Alarm && millis() - pageAt > 45000) powerSleepUntilSchedule();
  bool waiting = page == Page::Home || page == Page::Result || page == Page::Analytics || page == Page::Wifi || page == Page::Login;
  if (page != Page::Alarm) powerDimCheck(waiting);
}
