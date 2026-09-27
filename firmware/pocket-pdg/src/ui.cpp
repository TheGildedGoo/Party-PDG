#include "ui.h"

#include <Arduino.h>
#include <algorithm>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <vector>
#include <time.h>
#include <sys/time.h>
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

enum class Page { Boot, Wifi, Login, Home, Study, Notes, Settings, Quiz, Feedback, Result, Analytics, Alarm };

static Page page = Page::Boot;
static uint32_t pageAt = 0;
static uint32_t feedbackUntil = 0;
static bool feedbackOk = false;
static int feedbackChoice = -1;
static int analyticsChapter = 0;
static char statusLine[96] = "";
static lv_obj_t* emailBox = nullptr;
static lv_obj_t* passBox = nullptr;
static lv_obj_t* loginKb = nullptr;
static lv_obj_t* loginBtn = nullptr;
static lv_obj_t* skipBtn = nullptr;
static lv_obj_t* hideBtn = nullptr;
static bool passVisible = false;

static void showBoot();
static void showWifi();
static void showLogin();
static void showHome();
static void showStudy();
static void showNotes();
static void showSettings();
static bool grabNotes();
static void saveNotes();
static void saveColors();
static void syncNetTime();
static void setManualClock();
static void showQuiz();
static void showFeedback();
static void showResult();
static void showAnalytics();
static void showAlarm();

struct Palette {
  uint32_t bg;
  uint32_t fg;
  uint32_t btn;
  uint32_t btnFg;
  uint32_t accent;
  uint32_t accentFg;
};

static Palette palette() {
  Settings& s = settings();
  if (s.theme == 1) return {0x1C1C1C, 0xF4F1EA, 0x2A2A2A, 0xF4F1EA, 0xC4A35A, 0x1C1C1C};
  if (s.theme == 2) return {0x000000, 0xFFFFFF, 0x000000, 0xFFFFFF, 0xFFFF00, 0x000000};
  if (s.theme == 3) return {s.colorBg, s.colorFg, s.colorBtn, s.colorFg, s.colorBtn, s.colorBg};
  return {0x0B0D10, 0xE6E6E6, 0x1A1D22, 0xE6E6E6, 0x8AB4F8, 0x0B0D10};
}

static void paint(lv_obj_t* obj) {
  Palette p = palette();
  lv_obj_set_style_bg_color(obj, lv_color_hex(p.bg), 0);
  lv_obj_set_style_text_color(obj, lv_color_hex(p.fg), 0);
}

static lv_obj_t* fresh() {
  Palette p = palette();
  lv_obj_t* scr = lv_obj_create(nullptr);
  lv_obj_set_style_bg_color(scr, lv_color_hex(p.bg), 0);
  lv_obj_set_style_text_color(scr, lv_color_hex(p.fg), 0);
  lv_obj_set_style_text_font(scr, &lv_font_montserrat_16, 0);
  lv_obj_set_style_pad_all(scr, 8, 0);
  lv_obj_set_style_pad_row(scr, 6, 0);
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
  Palette p = palette();
  lv_obj_t* btn = lv_btn_create(parent);
  lv_obj_set_width(btn, lv_pct(100));
  lv_obj_set_height(btn, LV_SIZE_CONTENT);
  lv_obj_set_style_min_height(btn, 40, 0);
  lv_obj_set_style_pad_top(btn, 8, 0);
  lv_obj_set_style_pad_bottom(btn, 8, 0);
  lv_obj_set_style_pad_left(btn, 8, 0);
  lv_obj_set_style_pad_right(btn, 8, 0);
  lv_obj_set_style_bg_color(btn, lv_color_hex(accent ? p.accent : p.btn), 0);
  lv_obj_set_style_text_color(btn, lv_color_hex(accent ? p.accentFg : p.btnFg), 0);
  if (settings().theme == 2) {
    lv_obj_set_style_border_width(btn, 2, 0);
    lv_obj_set_style_border_color(btn, lv_color_hex(accent ? p.accent : p.fg), 0);
  }
  lv_obj_add_event_cb(btn, onTap, LV_EVENT_CLICKED, (void*)act);
  lv_obj_t* lab = lv_label_create(btn);
  lv_label_set_text(lab, text);
  lv_label_set_long_mode(lab, LV_LABEL_LONG_WRAP);
  lv_obj_set_width(lab, lv_pct(100));
  lv_obj_set_style_text_align(lab, LV_TEXT_ALIGN_CENTER, 0);
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
  if (act == 7 || act == 11) { showHome(); return; }
  if (act == 8) {
    quizStart(quizMissIndexes());
    if (quizLength() == 0) showHome();
    else showQuiz();
    return;
  }
  if (act == 9) { showAlarm(); return; }
  if (act == 10) {
    quizAdvance();
    if (quizFinished()) showResult();
    else showQuiz();
    return;
  }
  if (act == 12) { showStudy(); return; }
  if (act == 13) { showNotes(); return; }
  if (act == 14) { showSettings(); return; }
  if (act == 15 || act == 16 || act == 17) {
    settings().theme = (uint8_t)(act - 15);
    settingsSave();
    showSettings();
    return;
  }
  if (act == 48) {
    settings().clock12 = settings().clock12 ? 0 : 1;
    settingsSave();
    showSettings();
    return;
  }
  if (act >= 70 && act <= 74) {
    settings().hapticLevel = (uint8_t)(act - 69);
    settingsSave();
    hapticClick();
    showSettings();
    return;
  }
  if (act == 20) { settings().rank = 5; settingsSave(); showStudy(); return; }
  if (act == 21) { settings().rank = 6; settingsSave(); showStudy(); return; }
  if (act == 30 || act == 31 || act == 32 || act == 33) {
    const uint8_t sizes[] = {3, 5, 10, 15};
    settings().sessionSize = sizes[act - 30];
    settingsSave();
    showStudy();
    return;
  }
  if (act == 40) {
    settings().hapticOn = settings().hapticOn ? 0 : 1;
    settingsSave();
    showSettings();
    return;
  }
  if (act == 41) {
    settings().soundOn = settings().soundOn ? 0 : 1;
    settingsSave();
    showSettings();
    return;
  }
  if (act == 42) {
    settings().airplane = settings().airplane ? 0 : 1;
    if (settings().airplane) wifiForceOff();
    settingsSave();
    showSettings();
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
    showStudy();
    return;
  }
  if (act == 45) { saveNotes(); return; }
  if (act == 19) { saveColors(); return; }
  if (act == 46) { syncNetTime(); return; }
  if (act == 47) { setManualClock(); return; }
  if (act >= 300 && act < 306) {
    grabNotes();
    settings().slotOn[act - 300] = settings().slotOn[act - 300] ? 0 : 1;
    settingsSave();
    showNotes();
    return;
  }
  if (act >= 320 && act < 326) { adjustSlot((int)act - 320, 15); return; }
  if (act == 330) {
    grabNotes();
    settings().quietOn = settings().quietOn ? 0 : 1;
    settingsSave();
    showNotes();
    return;
  }
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
    if (feedbackOk) hapticClick();
    else hapticWrong();
    showFeedback();
  }
}

static void onBright(lv_event_t* e) {
  int value = lv_slider_get_value(lv_event_get_target(e));
  settings().brightness = (uint8_t)value;
  powerSetBrightness((uint8_t)value);
  if (lv_event_get_code(e) == LV_EVENT_RELEASED) settingsSave();
}

static void showKeyboard(bool open) {
  if (loginKb) {
    if (open) lv_obj_clear_flag(loginKb, LV_OBJ_FLAG_HIDDEN);
    else {
      lv_obj_add_flag(loginKb, LV_OBJ_FLAG_HIDDEN);
      lv_keyboard_set_textarea(loginKb, nullptr);
    }
  }
  if (loginBtn) {
    if (open) lv_obj_add_flag(loginBtn, LV_OBJ_FLAG_HIDDEN);
    else lv_obj_clear_flag(loginBtn, LV_OBJ_FLAG_HIDDEN);
  }
  if (skipBtn) {
    if (open) lv_obj_add_flag(skipBtn, LV_OBJ_FLAG_HIDDEN);
    else lv_obj_clear_flag(skipBtn, LV_OBJ_FLAG_HIDDEN);
  }
  if (hideBtn) {
    lv_obj_t* lab = lv_obj_get_child(hideBtn, 0);
    if (lab) lv_label_set_text(lab, open ? "Hide" : "Keys");
  }
}

static void onFocus(lv_event_t* e) {
  lv_obj_t* kb = (lv_obj_t*)lv_event_get_user_data(e);
  lv_keyboard_set_textarea(kb, lv_event_get_target(e));
  showKeyboard(true);
}

static void onKb(lv_event_t* e) {
  lv_event_code_t code = lv_event_get_code(e);
  if (code == LV_EVENT_READY || code == LV_EVENT_CANCEL) {
    lv_obj_add_flag(lv_event_get_target(e), LV_OBJ_FLAG_HIDDEN);
    showKeyboard(false);
  }
}

static void onHideKey(lv_event_t* e) {
  (void)e;
  bool open = loginKb && !lv_obj_has_flag(loginKb, LV_OBJ_FLAG_HIDDEN);
  showKeyboard(!open);
}

static void onShowPass(lv_event_t* e) {
  if (!passBox) return;
  passVisible = !passVisible;
  lv_textarea_set_password_mode(passBox, passVisible ? false : true);
  lv_obj_t* lab = lv_obj_get_child(lv_event_get_target(e), 0);
  if (lab) lv_label_set_text(lab, passVisible ? "Hide pw" : "Show pw");
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
  passVisible = false;
  lv_obj_t* scr = lv_obj_create(nullptr);
  lv_obj_set_size(scr, 320, 240);
  lv_obj_set_style_bg_color(scr, lv_color_hex(0x1C1C1C), 0);
  lv_obj_set_style_text_color(scr, lv_color_hex(0xF4F1EA), 0);
  lv_obj_set_style_text_font(scr, &lv_font_montserrat_16, 0);
  lv_obj_set_style_pad_all(scr, 0, 0);
  lv_obj_clear_flag(scr, LV_OBJ_FLAG_SCROLLABLE);
  lv_scr_load_anim(scr, LV_SCR_LOAD_ANIM_NONE, 0, 0, true);

  lv_obj_t* title = addLabel(scr, "Log in", &lv_font_montserrat_16);
  lv_obj_set_pos(title, 8, 4);
  if (statusLine[0]) {
    lv_obj_t* status = addLabel(scr, statusLine, &lv_font_montserrat_14);
    lv_obj_set_pos(status, 70, 6);
    lv_obj_set_width(status, 160);
  }

  hideBtn = lv_btn_create(scr);
  lv_obj_set_pos(hideBtn, 236, 2);
  lv_obj_set_size(hideBtn, 78, 26);
  lv_obj_set_style_bg_color(hideBtn, lv_color_hex(0x2A2A2A), 0);
  lv_obj_add_event_cb(hideBtn, onHideKey, LV_EVENT_CLICKED, nullptr);
  lv_obj_t* hideLab = lv_label_create(hideBtn);
  lv_label_set_text(hideLab, "Hide");
  lv_obj_center(hideLab);

  emailBox = lv_textarea_create(scr);
  lv_textarea_set_placeholder_text(emailBox, "Email");
  lv_textarea_set_one_line(emailBox, true);
  lv_textarea_set_text(emailBox, settings().email);
  lv_obj_set_pos(emailBox, 6, 32);
  lv_obj_set_size(emailBox, 308, 34);

  passBox = lv_textarea_create(scr);
  lv_textarea_set_placeholder_text(passBox, "Password");
  lv_textarea_set_one_line(passBox, true);
  lv_textarea_set_password_mode(passBox, true);
  lv_obj_set_pos(passBox, 6, 70);
  lv_obj_set_size(passBox, 200, 34);

  lv_obj_t* show = lv_btn_create(scr);
  lv_obj_set_pos(show, 212, 70);
  lv_obj_set_size(show, 102, 34);
  lv_obj_set_style_bg_color(show, lv_color_hex(0x2A2A2A), 0);
  lv_obj_add_event_cb(show, onShowPass, LV_EVENT_CLICKED, nullptr);
  lv_obj_t* showLab = lv_label_create(show);
  lv_label_set_text(showLab, "Show pw");
  lv_obj_center(showLab);

  loginKb = lv_keyboard_create(scr);
  lv_obj_set_size(loginKb, 320, 124);
  lv_obj_align(loginKb, LV_ALIGN_BOTTOM_MID, 0, 0);
  lv_obj_set_style_text_font(loginKb, &lv_font_montserrat_14, LV_PART_ITEMS);
  lv_keyboard_set_textarea(loginKb, emailBox);
  lv_obj_add_event_cb(loginKb, onKb, LV_EVENT_ALL, nullptr);
  lv_obj_add_event_cb(emailBox, onFocus, LV_EVENT_FOCUSED, loginKb);
  lv_obj_add_event_cb(passBox, onFocus, LV_EVENT_FOCUSED, loginKb);

  loginBtn = addButton(scr, "Log in", 1, true);
  lv_obj_set_pos(loginBtn, 6, 150);
  lv_obj_set_size(loginBtn, 308, 36);
  lv_obj_add_flag(loginBtn, LV_OBJ_FLAG_HIDDEN);
  skipBtn = nullptr;
  if (bankCount() > 0) {
    skipBtn = addButton(scr, "Skip, study offline", 2, false);
    lv_obj_set_pos(skipBtn, 6, 192);
    lv_obj_set_size(skipBtn, 308, 36);
    lv_obj_add_flag(skipBtn, LV_OBJ_FLAG_HIDDEN);
  }
}

static void hhmm(char* dst, size_t n, int minute) {
  snprintf(dst, n, "%02d:%02d", minute / 60, minute % 60);
}

static lv_obj_t* noteBox[8];
static lv_obj_t* colorBox[3];
static lv_obj_t* tzBox = nullptr;
static lv_obj_t* dateBox = nullptr;
static lv_obj_t* timeBox = nullptr;

static void formatMinute(char* dst, size_t n, int minute) {
  int h = minute / 60;
  int m = minute % 60;
  if (h < 0) h = 0;
  if (!settings().clock12) {
    snprintf(dst, n, "%02d:%02d", h, m);
    return;
  }
  const char* ap = h >= 12 ? "PM" : "AM";
  int h12 = h % 12;
  if (h12 == 0) h12 = 12;
  snprintf(dst, n, "%d:%02d %s", h12, m, ap);
}

static bool parseClock(const char* text, int* outMin) {
  if (!text || !outMin) return false;
  int h = 0, m = 0;
  char ap[4] = "";
  if (sscanf(text, "%d:%d %3s", &h, &m, ap) < 2) return false;
  if (ap[0] == 'p' || ap[0] == 'P') {
    if (h < 12) h += 12;
  } else if (ap[0] == 'a' || ap[0] == 'A') {
    if (h == 12) h = 0;
  }
  if (h < 0 || h > 23 || m < 0 || m > 59) return false;
  *outMin = h * 60 + m;
  return true;
}

static void onFieldFocus(lv_event_t* e) {
  lv_obj_t* kb = (lv_obj_t*)lv_event_get_user_data(e);
  if (!kb) return;
  lv_keyboard_set_textarea(kb, lv_event_get_target(e));
  lv_obj_clear_flag(kb, LV_OBJ_FLAG_HIDDEN);
}

static lv_obj_t* field(lv_obj_t* parent, const char* text, lv_obj_t* kb) {
  lv_obj_t* box = lv_textarea_create(parent);
  lv_textarea_set_one_line(box, true);
  lv_textarea_set_text(box, text);
  lv_obj_set_width(box, lv_pct(100));
  if (kb) lv_obj_add_event_cb(box, onFieldFocus, LV_EVENT_FOCUSED, kb);
  return box;
}

static bool grabNotes() {
  bool ok = true;
  for (int i = 0; i < 6; i++) {
    int minute = 0;
    if (!noteBox[i] || !parseClock(lv_textarea_get_text(noteBox[i]), &minute)) ok = false;
    else settings().slotMin[i] = (uint16_t)minute;
  }
  int start = 0, end = 0;
  if (!noteBox[6] || !parseClock(lv_textarea_get_text(noteBox[6]), &start)) ok = false;
  else settings().quietStart = (uint16_t)start;
  if (!noteBox[7] || !parseClock(lv_textarea_get_text(noteBox[7]), &end)) ok = false;
  else settings().quietEnd = (uint16_t)end;
  return ok;
}

static void saveNotes() {
  if (!grabNotes()) strncpy(statusLine, "Use 07:30 or 7:30 AM.", sizeof(statusLine) - 1);
  else {
    settingsSave();
    strncpy(statusLine, "Times saved.", sizeof(statusLine) - 1);
  }
  showNotes();
}

static bool parseHex(const char* text, uint32_t* out) {
  if (!text || !out) return false;
  if (text[0] == '#') text++;
  if (strlen(text) != 6) return false;
  char* end = nullptr;
  unsigned long value = strtoul(text, &end, 16);
  if (!end || end != text + 6) return false;
  *out = (uint32_t)value;
  return true;
}

static void saveColors() {
  uint32_t bg = 0, fg = 0, btn = 0;
  bool ok = colorBox[0] && colorBox[1] && colorBox[2]
      && parseHex(lv_textarea_get_text(colorBox[0]), &bg)
      && parseHex(lv_textarea_get_text(colorBox[1]), &fg)
      && parseHex(lv_textarea_get_text(colorBox[2]), &btn);
  if (!ok) strncpy(statusLine, "Colors need 6 hex digits, like 1C1C1C.", sizeof(statusLine) - 1);
  else {
    settings().theme = 3;
    settings().colorBg = bg;
    settings().colorFg = fg;
    settings().colorBtn = btn;
    settingsSave();
    strncpy(statusLine, "Custom colors saved.", sizeof(statusLine) - 1);
  }
  showSettings();
}

static void syncNetTime() {
  if (!wifiConnected()) {
    strncpy(statusLine, "Join Wi-Fi before syncing the clock.", sizeof(statusLine) - 1);
    showSettings();
    return;
  }
  if (tzBox) {
    int hours = settings().tzMinutes / 60;
    sscanf(lv_textarea_get_text(tzBox), "%d", &hours);
    if (hours < -12) hours = -12;
    if (hours > 14) hours = 14;
    settings().tzMinutes = (int16_t)(hours * 60);
  }
  settingsApplyTz();
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  settingsApplyTz();
  bool got = false;
  for (int i = 0; i < 20; i++) {
    delay(250);
    if (time(nullptr) > 1700000000) { got = true; break; }
  }
  settingsSave();
  strncpy(statusLine, got ? "Clock synced." : "Clock sync failed.", sizeof(statusLine) - 1);
  showSettings();
}

static void setManualClock() {
  int y = 0, mo = 0, d = 0, h = 0, m = 0;
  const char* date = dateBox ? lv_textarea_get_text(dateBox) : "";
  const char* clock = timeBox ? lv_textarea_get_text(timeBox) : "";
  int minute = 0;
  if (sscanf(date, "%d-%d-%d", &y, &mo, &d) != 3 || !parseClock(clock, &minute)) {
    strncpy(statusLine, "Date is YYYY-MM-DD. Time is 07:30 or 7:30 AM.", sizeof(statusLine) - 1);
    showSettings();
    return;
  }
  if (tzBox) {
    int hours = settings().tzMinutes / 60;
    sscanf(lv_textarea_get_text(tzBox), "%d", &hours);
    if (hours >= -12 && hours <= 14) settings().tzMinutes = (int16_t)(hours * 60);
  }
  settingsApplyTz();
  settingsSave();
  struct tm when = {};
  when.tm_year = y - 1900;
  when.tm_mon = mo - 1;
  when.tm_mday = d;
  when.tm_hour = minute / 60;
  when.tm_min = minute % 60;
  when.tm_isdst = 0;
  time_t sec = mktime(&when);
  timeval tv = {};
  tv.tv_sec = sec;
  settimeofday(&tv, nullptr);
  strncpy(statusLine, "Clock set.", sizeof(statusLine) - 1);
  showSettings();
}

static void wifiBadge(char* dst, size_t n) {
  if (settings().airplane) {
    snprintf(dst, n, "Airplane");
    return;
  }
  if (!wifiConnected()) {
    snprintf(dst, n, LV_SYMBOL_WIFI " off");
    return;
  }
  int rssi = wifiRssi();
  const char* bars = "|";
  if (rssi >= -55) bars = "||||";
  else if (rssi >= -67) bars = "|||";
  else if (rssi >= -75) bars = "||";
  char name[12];
  strncpy(name, settings().ssid[0] ? settings().ssid : "Wi-Fi", sizeof(name) - 1);
  name[sizeof(name) - 1] = 0;
  snprintf(dst, n, "%s %s %s", LV_SYMBOL_WIFI, bars, name);
}

static void showHome() {
  page = Page::Home;
  pageAt = millis();
  emailBox = nullptr;
  passBox = nullptr;
  loginKb = nullptr;
  loginBtn = nullptr;
  skipBtn = nullptr;
  hideBtn = nullptr;
  lv_obj_t* scr = fresh();
  lv_obj_t* bar = lv_obj_create(scr);
  lv_obj_set_width(bar, lv_pct(100));
  lv_obj_set_height(bar, LV_SIZE_CONTENT);
  lv_obj_set_flex_flow(bar, LV_FLEX_FLOW_ROW);
  lv_obj_set_style_bg_opa(bar, LV_OPA_TRANSP, 0);
  lv_obj_set_style_border_width(bar, 0, 0);
  lv_obj_set_style_pad_all(bar, 0, 0);
  lv_obj_t* title = lv_label_create(bar);
  lv_label_set_text(title, "Pocket PDG");
  lv_obj_set_style_text_font(title, &lv_font_montserrat_20, 0);
  lv_obj_set_flex_grow(title, 1);
  char badge[48];
  wifiBadge(badge, sizeof(badge));
  lv_obj_t* wifi = lv_label_create(bar);
  lv_label_set_text(wifi, badge);
  lv_obj_set_style_text_font(wifi, &lv_font_montserrat_14, 0);
  int bat = powerBatteryPercent();
  char head[64];
  if (bat < 0) snprintf(head, sizeof(head), "Battery n/a");
  else snprintf(head, sizeof(head), "Battery %d%%", bat);
  addLabel(scr, head, &lv_font_montserrat_14);
  char sync[80];
  snprintf(sync, sizeof(sync), "Sync %s%s", settings().lastSync, settings().syncFailed ? " (failed)" : "");
  addLabel(scr, sync, &lv_font_montserrat_14);
  char study[80];
  snprintf(study, sizeof(study), "Streak %d    Today %u/%u", srsStreak(), settings().todayCorrect,
           (unsigned)(settings().todayCorrect + settings().todayWrong));
  addLabel(scr, study, &lv_font_montserrat_16);
  if (statusLine[0]) addLabel(scr, statusLine, &lv_font_montserrat_14);
  if (bankUsingFixture()) addLabel(scr, "Fixture bank. Sync to load AFH 1.", &lv_font_montserrat_14);
  addButton(scr, "Start now", 3, true);
  addButton(scr, "Study configuration", 12, false);
  addButton(scr, "Notifications", 13, false);
  addButton(scr, "Settings", 14, false);
  addButton(scr, "Sync now", 4, false);
  addButton(scr, "Analytics", 5, false);
  addButton(scr, "Sleep", 6, false);
}

static void showStudy() {
  page = Page::Study;
  pageAt = millis();
  lv_obj_t* scr = fresh();
  addLabel(scr, "Study configuration", &lv_font_montserrat_20);
  addLabel(scr, "Rank", &lv_font_montserrat_14);
  addButton(scr, settings().rank == 5 ? "E-5 track  (on)" : "E-5 track", 20, settings().rank == 5);
  addButton(scr, settings().rank == 6 ? "E-6 track  (on)" : "E-6 track", 21, settings().rank == 6);
  addLabel(scr, "Session", &lv_font_montserrat_14);
  const int sizes[] = {3, 5, 10, 15};
  for (int i = 0; i < 4; i++) {
    char text[32];
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
  addButton(scr, "Home", 7, true);
}

static void showNotes() {
  page = Page::Notes;
  pageAt = millis();
  lv_obj_t* scr = fresh();
  lv_obj_set_style_pad_bottom(scr, 130, 0);
  addLabel(scr, "Notifications", &lv_font_montserrat_20);
  addLabel(scr, settings().clock12 ? "Times like 7:30 AM" : "Times like 07:30", &lv_font_montserrat_14);
  if (statusLine[0]) addLabel(scr, statusLine, &lv_font_montserrat_14);
  lv_obj_t* kb = lv_keyboard_create(scr);
  lv_obj_add_flag(kb, LV_OBJ_FLAG_FLOATING);
  lv_obj_set_size(kb, 320, 120);
  lv_obj_align(kb, LV_ALIGN_BOTTOM_MID, 0, 0);
  lv_obj_add_flag(kb, LV_OBJ_FLAG_HIDDEN);
  lv_obj_add_event_cb(kb, onKb, LV_EVENT_ALL, nullptr);
  for (int i = 0; i < 6; i++) {
    char label[24];
    char clock[16];
    formatMinute(clock, sizeof(clock), settings().slotMin[i]);
    snprintf(label, sizeof(label), "Slot %d  %s", i + 1, settings().slotOn[i] ? "on" : "off");
    addLabel(scr, label, &lv_font_montserrat_14);
    noteBox[i] = field(scr, clock, kb);
    addButton(scr, settings().slotOn[i] ? "Turn slot off" : "Turn slot on", 300 + i, false);
  }
  char start[16], end[16];
  formatMinute(start, sizeof(start), settings().quietStart);
  formatMinute(end, sizeof(end), settings().quietEnd);
  addLabel(scr, "Quiet hours start", &lv_font_montserrat_14);
  noteBox[6] = field(scr, start, kb);
  addLabel(scr, "Quiet hours end", &lv_font_montserrat_14);
  noteBox[7] = field(scr, end, kb);
  addButton(scr, settings().quietOn ? "Quiet hours on" : "Quiet hours off", 330, settings().quietOn);
  addButton(scr, "Save times", 45, true);
  addButton(scr, "Home", 7, false);
}

static void showSettings() {
  page = Page::Settings;
  pageAt = millis();
  lv_obj_t* scr = fresh();
  lv_obj_set_style_pad_bottom(scr, 130, 0);
  addLabel(scr, "Settings", &lv_font_montserrat_20);
  if (statusLine[0]) addLabel(scr, statusLine, &lv_font_montserrat_14);
  addLabel(scr, "Appearance", &lv_font_montserrat_14);
  addButton(scr, settings().theme == 0 ? "Dark  (on)" : "Dark", 15, settings().theme == 0);
  addButton(scr, settings().theme == 1 ? "Light  (on)" : "Light", 16, settings().theme == 1);
  addButton(scr, settings().theme == 2 ? "High contrast  (on)" : "High contrast", 17, settings().theme == 2);
  addLabel(scr, "Custom colors, 6 hex digits", &lv_font_montserrat_14);
  lv_obj_t* kb = lv_keyboard_create(scr);
  lv_obj_add_flag(kb, LV_OBJ_FLAG_FLOATING);
  lv_obj_set_size(kb, 320, 120);
  lv_obj_align(kb, LV_ALIGN_BOTTOM_MID, 0, 0);
  lv_obj_add_flag(kb, LV_OBJ_FLAG_HIDDEN);
  lv_obj_add_event_cb(kb, onKb, LV_EVENT_ALL, nullptr);
  char hex[8];
  snprintf(hex, sizeof(hex), "%06X", settings().colorBg);
  addLabel(scr, "Background", &lv_font_montserrat_14);
  colorBox[0] = field(scr, hex, kb);
  snprintf(hex, sizeof(hex), "%06X", settings().colorFg);
  addLabel(scr, "Text", &lv_font_montserrat_14);
  colorBox[1] = field(scr, hex, kb);
  snprintf(hex, sizeof(hex), "%06X", settings().colorBtn);
  addLabel(scr, "Button", &lv_font_montserrat_14);
  colorBox[2] = field(scr, hex, kb);
  addButton(scr, "Apply custom colors", 19, settings().theme == 3);
  addLabel(scr, "Brightness", &lv_font_montserrat_14);
  Palette p = palette();
  lv_obj_t* slider = lv_slider_create(scr);
  lv_obj_set_width(slider, lv_pct(100));
  lv_slider_set_range(slider, 5, 100);
  lv_slider_set_value(slider, settings().brightness, LV_ANIM_OFF);
  lv_obj_add_event_cb(slider, onBright, LV_EVENT_VALUE_CHANGED, nullptr);
  lv_obj_add_event_cb(slider, onBright, LV_EVENT_RELEASED, nullptr);
  lv_obj_set_style_bg_color(slider, lv_color_hex(p.accent), LV_PART_INDICATOR);
  lv_obj_set_style_bg_color(slider, lv_color_hex(p.accent), LV_PART_KNOB);
  addButton(scr, settings().hapticOn ? "Haptic on" : "Haptic off", 40, false);
  addLabel(scr, "Haptic strength", &lv_font_montserrat_14);
  for (int i = 1; i <= 5; i++) {
    char text[24];
    snprintf(text, sizeof(text), "Strength %d%s", i, settings().hapticLevel == i ? "  (on)" : "");
    addButton(scr, text, 69 + i, settings().hapticLevel == i);
  }
  addButton(scr, settings().soundOn ? "Sound on" : "Sound off", 41, false);
  addButton(scr, settings().airplane ? "Airplane on" : "Airplane off", 42, false);
  addButton(scr, "Wi-Fi setup", 43, false);
  addLabel(scr, "Clock", &lv_font_montserrat_14);
  addButton(scr, settings().clock12 ? "12 hour  (on)" : "24 hour  (on)", 48, false);
  char tz[8];
  snprintf(tz, sizeof(tz), "%+d", settings().tzMinutes / 60);
  addLabel(scr, "Time zone, hours from UTC", &lv_font_montserrat_14);
  tzBox = field(scr, tz, kb);
  addButton(scr, "Sync time from internet", 46, true);
  addLabel(scr, "Or set date YYYY-MM-DD", &lv_font_montserrat_14);
  dateBox = field(scr, "", kb);
  addLabel(scr, settings().clock12 ? "And time, like 7:30 AM" : "And time, like 19:30", &lv_font_montserrat_14);
  timeBox = field(scr, "", kb);
  addButton(scr, "Set clock", 47, false);
  addButton(scr, "Home", 7, false);
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
  addButton(scr, "Home", 7, false);
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
  lv_color_t color = lv_color_hex(feedbackOk ? 0x143D28 : 0x4A1C18);
  lv_obj_set_style_bg_color(scr, color, 0);
  lv_obj_set_style_text_color(scr, lv_color_hex(0xFFFFFF), 0);
  addButton(scr, quizFinished() ? "See score" : "Next", 10, true);
  addButton(scr, "Home", 7, false);
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
  if (page == Page::Alarm && millis() - pageAt > 45000) powerSleepUntilSchedule();
  bool waiting = page == Page::Home || page == Page::Study || page == Page::Notes || page == Page::Settings
      || page == Page::Result || page == Page::Analytics || page == Page::Wifi || page == Page::Login;
  if (page != Page::Alarm) powerDimCheck(waiting);
}
