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

enum class Page { Boot, Wifi, Login, Home, Study, Notes, Settings, Pick, Quiz, Feedback, Result, Analytics, Alarm, Debug };

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
static int returnScroll = 0;
static Page returnPage = Page::Boot;
static int pickWhich = 0;
static bool passVisible = false;
static int wifiView = 0;
static char pickedSsid[33] = "";
static lv_obj_t* wifiSsidBox = nullptr;
static lv_obj_t* wifiPassBox = nullptr;

static void showBoot();
static void showWifi();
static lv_obj_t* field(lv_obj_t* parent, const char* text, lv_obj_t* kb);
static void showLogin();
static void showHome();
static void showStudy();
static void showNotes();
static void showSettings();
static void showResetConfirm();
static void showDebug();
static void showColor();
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
  if (s.theme == 1) return {0xF7F4EE, 0x1C1C1C, 0xC4A35A, 0x1C1C1C, 0x8A5A2B, 0xFFFFFF};
  if (s.theme == 2) return {0x000000, 0xFFFFFF, 0x000000, 0xFFFFFF, 0xFFFF00, 0x000000};
  if (s.theme == 3) return {s.colorBg, s.colorFg, s.colorBtn, s.colorBtnFg, s.colorBtn, s.colorBtnFg};
  return {0x000000, 0xFFFFFF, 0x8EB7FF, 0x102033, 0x8EB7FF, 0x102033};
}

static lv_obj_t* pageScr = nullptr;
static lv_obj_t* pageBody = nullptr;
static lv_obj_t* topBar = nullptr;
static lv_obj_t* barClock = nullptr;
static lv_obj_t* barWifi = nullptr;
static lv_obj_t* pickPreview = nullptr;
static lv_color_hsv_t pickHsv;

static void wifiBadge(char* dst, size_t n);
static void onTap(lv_event_t* e);

static void clockText(char* dst, size_t n) {
  time_t now = time(nullptr);
  struct tm local;
  if (now < 1700000000 || !localtime_r(&now, &local)) {
    snprintf(dst, n, "--:--");
    return;
  }
  if (settings().clock12) {
    int h = local.tm_hour % 12;
    if (h == 0) h = 12;
    snprintf(dst, n, "%d:%02d%s %d/%d", h, local.tm_min, local.tm_hour >= 12 ? "p" : "a", local.tm_mon + 1, local.tm_mday);
  } else {
    snprintf(dst, n, "%02d:%02d %d/%d", local.tm_hour, local.tm_min, local.tm_mon + 1, local.tm_mday);
  }
}

static void refreshBar() {
  if (!barClock || !barWifi) return;
  char clock[40];
  char shown[48];
  clockText(clock, sizeof(clock));
  if (powerCharging()) snprintf(shown, sizeof(shown), LV_SYMBOL_CHARGE " %s", clock);
  else if (powerChargeFull()) snprintf(shown, sizeof(shown), "Full %s", clock);
  else snprintf(shown, sizeof(shown), "%s", clock);
  char badge[40];
  wifiBadge(badge, sizeof(badge));
  if (strcmp(lv_label_get_text(barClock), shown) != 0) lv_label_set_text(barClock, shown);
  if (strcmp(lv_label_get_text(barWifi), badge) != 0) lv_label_set_text(barWifi, badge);
}

static void buildBar(lv_obj_t* scr) {
  Palette p = palette();
  topBar = lv_obj_create(scr);
  lv_obj_set_pos(topBar, 0, 0);
  lv_obj_set_size(topBar, 320, 26);
  lv_obj_add_flag(topBar, LV_OBJ_FLAG_FLOATING);
  lv_obj_clear_flag(topBar, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_set_style_radius(topBar, 0, 0);
  lv_obj_set_style_border_width(topBar, 0, 0);
  lv_obj_set_style_pad_all(topBar, 0, 0);
  lv_obj_set_style_bg_color(topBar, lv_color_hex(0x000000), 0);
  lv_obj_set_style_bg_opa(topBar, LV_OPA_COVER, 0);
  lv_obj_set_style_text_color(topBar, lv_color_hex(p.fg), 0);

  lv_obj_t* home = lv_btn_create(topBar);
  lv_obj_set_pos(home, 0, 0);
  lv_obj_set_size(home, 44, 26);
  lv_obj_set_style_radius(home, 0, 0);
  lv_obj_set_style_pad_all(home, 0, 0);
  lv_obj_set_style_bg_color(home, lv_color_hex(p.btn), 0);
  lv_obj_set_style_bg_opa(home, LV_OPA_COVER, 0);
  lv_obj_set_style_text_color(home, lv_color_hex(p.btnFg), 0);
  lv_obj_add_event_cb(home, onTap, LV_EVENT_CLICKED, (void*)(intptr_t)7);
  lv_obj_t* icon = lv_label_create(home);
  lv_label_set_text(icon, LV_SYMBOL_HOME);
  lv_obj_set_style_text_color(icon, lv_color_hex(p.btnFg), 0);
  lv_obj_center(icon);

  barClock = lv_label_create(topBar);
  lv_obj_set_style_text_font(barClock, &lv_font_montserrat_14, 0);
  lv_obj_set_style_text_color(barClock, lv_color_hex(p.fg), 0);
  lv_label_set_text(barClock, "--:--");
  lv_obj_align(barClock, LV_ALIGN_LEFT_MID, 48, 0);

  barWifi = lv_label_create(topBar);
  lv_obj_set_width(barWifi, 118);
  lv_obj_set_style_text_font(barWifi, &lv_font_montserrat_14, 0);
  lv_obj_set_style_text_color(barWifi, lv_color_hex(p.fg), 0);
  lv_obj_set_style_text_align(barWifi, LV_TEXT_ALIGN_RIGHT, 0);
  lv_label_set_long_mode(barWifi, LV_LABEL_LONG_DOT);
  lv_label_set_text(barWifi, "");
  lv_obj_align(barWifi, LV_ALIGN_RIGHT_MID, -2, 0);
  refreshBar();
  lv_obj_move_foreground(topBar);
}

static lv_obj_t* fresh() {
  Palette p = palette();
  lv_obj_t* scr = lv_obj_create(nullptr);
  pageScr = scr;
  lv_obj_set_size(scr, 320, 240);
  lv_obj_set_style_bg_color(scr, lv_color_hex(p.bg), 0);
  lv_obj_set_style_bg_opa(scr, LV_OPA_COVER, 0);
  lv_obj_set_style_text_color(scr, lv_color_hex(p.fg), 0);
  lv_obj_set_style_text_font(scr, &lv_font_montserrat_16, 0);
  lv_obj_set_style_pad_all(scr, 0, 0);
  lv_obj_clear_flag(scr, LV_OBJ_FLAG_SCROLLABLE);
  lv_scr_load_anim(scr, LV_SCR_LOAD_ANIM_NONE, 0, 0, true);
  buildBar(scr);
  pageBody = lv_obj_create(scr);
  lv_obj_set_pos(pageBody, 0, 26);
  lv_obj_set_size(pageBody, 320, 214);
  lv_obj_set_style_bg_color(pageBody, lv_color_hex(p.bg), 0);
  lv_obj_set_style_bg_opa(pageBody, LV_OPA_COVER, 0);
  lv_obj_set_style_border_width(pageBody, 0, 0);
  lv_obj_set_style_radius(pageBody, 0, 0);
  lv_obj_set_style_pad_all(pageBody, 6, 0);
  lv_obj_set_style_pad_row(pageBody, 6, 0);
  lv_obj_set_flex_flow(pageBody, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_scrollbar_mode(pageBody, LV_SCROLLBAR_MODE_AUTO);
  lv_obj_move_foreground(topBar);
  return pageBody;
}

static lv_obj_t* addLabel(lv_obj_t* parent, const char* text, const lv_font_t* font) {
  Palette p = palette();
  lv_obj_t* lab = lv_label_create(parent);
  lv_label_set_text(lab, text);
  lv_label_set_long_mode(lab, LV_LABEL_LONG_WRAP);
  lv_obj_set_width(lab, lv_pct(100));
  lv_obj_set_style_text_color(lab, lv_color_hex(p.fg), 0);
  lv_obj_set_style_text_opa(lab, LV_OPA_COVER, 0);
  if (font) lv_obj_set_style_text_font(lab, font, 0);
  return lab;
}

static void onTap(lv_event_t* e);

static void restoreScroll(Page which) {
  if (pageBody && returnPage == which && returnScroll > 0) {
    lv_obj_update_layout(pageBody);
    lv_obj_scroll_to_y(pageBody, returnScroll, LV_ANIM_OFF);
  }
  returnPage = Page::Boot;
  returnScroll = 0;
}

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
  lv_obj_set_style_bg_opa(btn, LV_OPA_COVER, 0);
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
  lv_obj_set_style_text_color(lab, lv_color_hex(accent ? p.accentFg : p.btnFg), 0);
  lv_obj_set_style_text_opa(lab, LV_OPA_COVER, 0);
  lv_obj_set_width(lab, lv_pct(100));
  lv_obj_set_style_text_align(lab, LV_TEXT_ALIGN_CENTER, 0);
  return btn;
}

static void routeAfterBoot() {
  if (!settings().airplane && settingsHasWifi() && !wifiConnected()) {
    if (pageBody) addLabel(pageBody, "Joining saved network...", &lv_font_montserrat_14);
    lv_refr_now(NULL);
    if (!wifiConnect(settings().ssid, settings().pass, 15000)) {
      strncpy(statusLine, "Saved Wi-Fi did not connect.", sizeof(statusLine) - 1);
    }
  }
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
  returnPage = page;
  returnScroll = pageBody ? lv_obj_get_scroll_y(pageBody) : 0;
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
    const char* why = syncLastError();
    if (why && why[0]) strncpy(statusLine, why, sizeof(statusLine) - 1);
    else if (result == SyncResult::Ok) strncpy(statusLine, "Sync finished.", sizeof(statusLine) - 1);
    else strncpy(statusLine, "Sync failed.", sizeof(statusLine) - 1);
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
  if (act == 250) { showResetConfirm(); return; }
  if (act == 263) {
    hapticStandby();
    delay(10);
    hapticClick();
    showDebug();
    return;
  }
  if (act == 260) { showDebug(); return; }
  if (act == 261) {
    hapticClick();
    showDebug();
    return;
  }
  if (act == 262) {
    hapticBuzz(180);
    showDebug();
    return;
  }
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
  if (act == 89 || (act >= 84 && act <= 86)) {
    pickWhich = act == 89 ? 3 : (int)act - 84;
    if (settings().theme != 3) {
      Palette p = palette();
      settings().colorBg = p.bg;
      settings().colorFg = p.fg;
      settings().colorBtn = p.btn;
      settings().colorBtnFg = p.btnFg;
    }
    showColor();
    return;
  }
  if (act == 87) {
    lv_color_t c = lv_color_hsv_to_rgb(pickHsv.h, pickHsv.s, pickHsv.v);
    uint32_t packed = lv_color_to32(c) & 0xFFFFFFu;
    if (pickWhich == 0) settings().colorBg = packed;
    else if (pickWhich == 1) settings().colorFg = packed;
    else if (pickWhich == 3) settings().colorBtnFg = packed;
    else settings().colorBtn = packed;
    settings().theme = 3;
    settingsSave();
    strncpy(statusLine, "Color saved.", sizeof(statusLine) - 1);
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
  if (act == 43) {
    wifiView = 0;
    showWifi();
    return;
  }
  if (act == 244 && wifiPassBox) {
    passVisible = !passVisible;
    lv_textarea_set_password_mode(wifiPassBox, passVisible ? false : true);
    lv_obj_t* lab = lv_obj_get_child(lv_event_get_target(e), 0);
    if (lab) lv_label_set_text(lab, passVisible ? "Hide password" : "Show password");
    return;
  }
  if (act == 240) {
    wifiView = 2;
    showWifi();
    return;
  }
  if (act == 243) {
    wifiView = 0;
    showWifi();
    return;
  }
  if (act >= 220 && act < 230) {
    int index = (int)act - 220;
    strncpy(pickedSsid, wifiScanSsid(index), sizeof(pickedSsid) - 1);
    pickedSsid[sizeof(pickedSsid) - 1] = 0;
    if (!pickedSsid[0]) return;
    wifiView = 1;
    showWifi();
    return;
  }
  if (act == 242) {
    strncpy(statusLine, "Scanning...", sizeof(statusLine) - 1);
    wifiView = 0;
    showWifi();
    lv_refr_now(NULL);
    wifiScan();
    if (wifiScanCount() == 0) strncpy(statusLine, "No 2.4 GHz networks found. Type the name.", sizeof(statusLine) - 1);
    else statusLine[0] = 0;
    showWifi();
    return;
  }
  if (act == 241) {
    const char* ssid = wifiView == 2 && wifiSsidBox ? lv_textarea_get_text(wifiSsidBox) : pickedSsid;
    const char* pass = wifiPassBox ? lv_textarea_get_text(wifiPassBox) : "";
    if (!ssid || !ssid[0]) {
      strncpy(statusLine, "Type the network name.", sizeof(statusLine) - 1);
      showWifi();
      return;
    }
    strncpy(settings().ssid, ssid, sizeof(settings().ssid) - 1);
    settings().ssid[sizeof(settings().ssid) - 1] = 0;
    strncpy(settings().pass, pass ? pass : "", sizeof(settings().pass) - 1);
    settings().pass[sizeof(settings().pass) - 1] = 0;
    strncpy(statusLine, "Joining...", sizeof(statusLine) - 1);
    showWifi();
    lv_refr_now(NULL);
    settingsSave();
    if (wifiConnect(settings().ssid, settings().pass, 12000)) {
      statusLine[0] = 0;
      wifiView = 0;
      if (settingsHasToken()) showHome();
      else showLogin();
    } else {
      strncpy(statusLine, "Could not join that network.", sizeof(statusLine) - 1);
      showWifi();
    }
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

static void onHapticLevel(lv_event_t* e) {
  settings().hapticLevel = (uint8_t)lv_slider_get_value(lv_event_get_target(e));
  if (lv_event_get_code(e) == LV_EVENT_RELEASED) {
    settingsSave();
    hapticClick();
  }
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
  if (hapticReady()) motor = true;
  lv_obj_t* scr = fresh();
  addLabel(scr, "Pocket PDG", &lv_font_montserrat_28);
  char line[96];
  snprintf(line, sizeof(line), "Touch %s\nMotor %s\nCodec %s",
           touch ? "ready" : "waking", motor ? "ready" : "missing", codec ? "ready" : "off");
  addLabel(scr, line, &lv_font_montserrat_16);
  addLabel(scr, sdReady() ? sdStatus() : "No SD card", &lv_font_montserrat_16);
  if (settingsHasWifi()) {
    char saved[64];
    snprintf(saved, sizeof(saved), "Saved Wi-Fi: %s", settings().ssid);
    addLabel(scr, saved, &lv_font_montserrat_14);
  }
  addLabel(scr, "Unofficial study aid.", &lv_font_montserrat_14);
}

static void showWifi() {
  page = Page::Wifi;
  pageAt = millis();
  if (wifiApUp()) wifiStopAp();
  loginKb = nullptr;
  lv_obj_t* scr = fresh();
  lv_obj_set_style_pad_bottom(scr, wifiView == 0 ? 8 : 110, 0);
  if (wifiView == 0) {
    wifiSsidBox = nullptr;
    wifiPassBox = nullptr;
    passBox = nullptr;
    addLabel(scr, "Wi-Fi", &lv_font_montserrat_28);
    addLabel(scr, "2.4 GHz only. Type the name if it is not in the list.", &lv_font_montserrat_14);
    if (statusLine[0]) addLabel(scr, statusLine, &lv_font_montserrat_14);
    addButton(scr, "Scan networks", 242, true);
    addButton(scr, "Type the network name", 240, false);
    for (int i = 0; i < wifiScanCount(); i++) {
      char text[48];
      snprintf(text, sizeof(text), "%s   %d", wifiScanSsid(i), wifiScanRssi(i));
      addButton(scr, text, 220 + i, false);
    }
    if (bankCount() > 0) addButton(scr, "Skip, study offline", 2, false);
    return;
  }
  lv_obj_t* kb = lv_keyboard_create(pageScr);
  lv_obj_add_flag(kb, LV_OBJ_FLAG_FLOATING);
  lv_obj_set_size(kb, 320, 100);
  lv_obj_align(kb, LV_ALIGN_BOTTOM_MID, 0, 0);
  lv_obj_add_event_cb(kb, onKb, LV_EVENT_ALL, nullptr);
  if (topBar) lv_obj_move_foreground(topBar);
  if (wifiView == 2) {
    addLabel(scr, "Network name", &lv_font_montserrat_16);
    wifiSsidBox = field(scr, pickedSsid, kb);
    lv_obj_add_event_cb(wifiSsidBox, onFocus, LV_EVENT_FOCUSED, kb);
  } else {
    wifiSsidBox = nullptr;
    addLabel(scr, pickedSsid, &lv_font_montserrat_16);
  }
  addLabel(scr, "Password", &lv_font_montserrat_14);
  wifiPassBox = field(scr, "", kb);
  passBox = wifiPassBox;
  lv_textarea_set_password_mode(wifiPassBox, true);
  lv_obj_add_event_cb(wifiPassBox, onFocus, LV_EVENT_FOCUSED, kb);
  lv_keyboard_set_textarea(kb, wifiView == 2 ? wifiSsidBox : wifiPassBox);
  if (statusLine[0]) addLabel(scr, statusLine, &lv_font_montserrat_14);
  addButton(scr, "Show password", 244, false);
  addButton(scr, "Join", 241, true);
  addButton(scr, "Back", 243, false);
}

static void showLogin() {
  page = Page::Login;
  pageAt = millis();
  passVisible = false;
  Palette p = palette();
  lv_obj_t* scr = lv_obj_create(nullptr);
  lv_obj_set_size(scr, 320, 240);
  lv_obj_set_style_bg_color(scr, lv_color_hex(p.bg), 0);
  lv_obj_set_style_bg_opa(scr, LV_OPA_COVER, 0);
  lv_obj_set_style_text_color(scr, lv_color_hex(p.fg), 0);
  lv_obj_set_style_text_font(scr, &lv_font_montserrat_16, 0);
  lv_obj_set_style_pad_all(scr, 0, 0);
  lv_obj_clear_flag(scr, LV_OBJ_FLAG_SCROLLABLE);
  lv_scr_load_anim(scr, LV_SCR_LOAD_ANIM_NONE, 0, 0, true);
  pageScr = scr;
  pageBody = nullptr;
  buildBar(scr);

  lv_obj_t* title = addLabel(scr, "Log in", &lv_font_montserrat_16);
  lv_obj_set_pos(title, 8, 30);
  if (statusLine[0]) {
    lv_obj_t* status = addLabel(scr, statusLine, &lv_font_montserrat_14);
    lv_obj_set_pos(status, 70, 32);
    lv_obj_set_width(status, 160);
  }

  hideBtn = lv_btn_create(scr);
  lv_obj_set_pos(hideBtn, 236, 28);
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
  lv_obj_set_pos(emailBox, 6, 56);
  lv_obj_set_size(emailBox, 308, 34);

  passBox = lv_textarea_create(scr);
  lv_textarea_set_placeholder_text(passBox, "Password");
  lv_textarea_set_one_line(passBox, true);
  lv_textarea_set_password_mode(passBox, true);
  lv_obj_set_pos(passBox, 6, 94);
  lv_obj_set_size(passBox, 200, 34);

  lv_obj_t* show = lv_btn_create(scr);
  lv_obj_set_pos(show, 212, 94);
  lv_obj_set_size(show, 102, 34);
  lv_obj_set_style_bg_color(show, lv_color_hex(0x2A2A2A), 0);
  lv_obj_add_event_cb(show, onShowPass, LV_EVENT_CLICKED, nullptr);
  lv_obj_t* showLab = lv_label_create(show);
  lv_label_set_text(showLab, "Show pw");
  lv_obj_center(showLab);

  loginKb = lv_keyboard_create(scr);
  lv_obj_add_flag(loginKb, LV_OBJ_FLAG_FLOATING);
  lv_obj_set_size(loginKb, 320, 100);
  lv_obj_align(loginKb, LV_ALIGN_BOTTOM_MID, 0, 0);
  lv_obj_set_style_text_font(loginKb, &lv_font_montserrat_14, LV_PART_ITEMS);
  lv_keyboard_set_textarea(loginKb, emailBox);
  lv_obj_add_event_cb(loginKb, onKb, LV_EVENT_ALL, nullptr);
  lv_obj_add_event_cb(emailBox, onFocus, LV_EVENT_FOCUSED, loginKb);
  lv_obj_add_event_cb(passBox, onFocus, LV_EVENT_FOCUSED, loginKb);
  if (topBar) lv_obj_move_foreground(topBar);

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
  lv_obj_set_style_text_color(box, lv_color_hex(palette().fg), 0);
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
  addLabel(scr, "Pocket PDG", &lv_font_montserrat_20);
  int bat = powerBatteryPercent();
  char head[72];
  const char* extra = "";
  if (powerChargeFull()) extra = "  Full";
  else if (powerCharging()) extra = "  Charging";
  if (bat < 0) snprintf(head, sizeof(head), "Battery n/a");
  else snprintf(head, sizeof(head), "Battery %d%%%s", bat, extra);
  addLabel(scr, head, &lv_font_montserrat_14);
  char sync[140];
  if (settings().syncFailed && statusLine[0]) snprintf(sync, sizeof(sync), "%s", statusLine);
  else snprintf(sync, sizeof(sync), "Sync %s%s", settings().lastSync, settings().syncFailed ? " (failed)" : "");
  addLabel(scr, sync, &lv_font_montserrat_14);
  char study[80];
  snprintf(study, sizeof(study), "Streak %d    Today %u/%u", srsStreak(), settings().todayCorrect,
           (unsigned)(settings().todayCorrect + settings().todayWrong));
  addLabel(scr, study, &lv_font_montserrat_16);
  if (statusLine[0] && !settings().syncFailed) addLabel(scr, statusLine, &lv_font_montserrat_14);
  if (bankUsingFixture()) addLabel(scr, "Fixture bank. Sync to load AFH 1.", &lv_font_montserrat_14);
  addButton(scr, "Start now", 3, true);
  addButton(scr, "Study configuration", 12, false);
  addButton(scr, "Notifications", 13, false);
  addButton(scr, "Settings", 14, false);
  addButton(scr, "Sync now", 4, false);
  addButton(scr, "Analytics", 5, false);
  addButton(scr, "Sleep", 6, false);
  restoreScroll(Page::Home);
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
  restoreScroll(Page::Study);
}

static void showNotes() {
  page = Page::Notes;
  pageAt = millis();
  lv_obj_t* scr = fresh();
  lv_obj_set_style_pad_bottom(scr, 130, 0);
  addLabel(scr, "Notifications", &lv_font_montserrat_20);
  addLabel(scr, settings().clock12 ? "Times like 7:30 AM" : "Times like 07:30", &lv_font_montserrat_14);
  if (statusLine[0]) addLabel(scr, statusLine, &lv_font_montserrat_14);
  lv_obj_t* kb = lv_keyboard_create(pageScr);
  lv_obj_add_flag(kb, LV_OBJ_FLAG_FLOATING);
  lv_obj_set_size(kb, 320, 100);
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
  restoreScroll(Page::Notes);
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
  addButton(scr, "Background color", 84, false);
  addButton(scr, "Text color", 85, false);
  addButton(scr, "Button color", 86, false);
  addButton(scr, "Button text", 89, false);
  lv_obj_t* kb = lv_keyboard_create(pageScr);
  lv_obj_add_flag(kb, LV_OBJ_FLAG_FLOATING);
  lv_obj_set_size(kb, 320, 100);
  lv_obj_align(kb, LV_ALIGN_BOTTOM_MID, 0, 0);
  lv_obj_add_flag(kb, LV_OBJ_FLAG_HIDDEN);
  lv_obj_add_event_cb(kb, onKb, LV_EVENT_ALL, nullptr);
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
  lv_obj_t* hap = lv_slider_create(scr);
  lv_obj_set_width(hap, lv_pct(100));
  lv_slider_set_range(hap, 1, 100);
  lv_slider_set_value(hap, settings().hapticLevel < 1 ? 45 : settings().hapticLevel, LV_ANIM_OFF);
  lv_obj_add_event_cb(hap, onHapticLevel, LV_EVENT_VALUE_CHANGED, nullptr);
  lv_obj_add_event_cb(hap, onHapticLevel, LV_EVENT_RELEASED, nullptr);
  lv_obj_set_style_bg_color(hap, lv_color_hex(p.accent), LV_PART_INDICATOR);
  lv_obj_set_style_bg_color(hap, lv_color_hex(p.accent), LV_PART_KNOB);
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
  addButton(scr, "Debug", 260, false);
  addButton(scr, "Factory reset", 250, false);
  restoreScroll(Page::Settings);
}

static void showDebug() {
  page = Page::Debug;
  pageAt = millis();
  lv_obj_t* scr = fresh();
  addLabel(scr, "Debug", &lv_font_montserrat_20);
  char motor[140];
  hapticDebug(motor, sizeof(motor));
  addLabel(scr, motor, &lv_font_montserrat_14);
  char mem[80];
  snprintf(mem, sizeof(mem), "Heap %u   PSRAM %s %u", (unsigned)ESP.getFreeHeap(),
           psramFound() ? "on" : "off", (unsigned)ESP.getFreePsram());
  addLabel(scr, mem, &lv_font_montserrat_14);
  char net[80];
  if (wifiConnected()) snprintf(net, sizeof(net), "Wi-Fi %s  %d", settings().ssid, wifiRssi());
  else snprintf(net, sizeof(net), "Wi-Fi off");
  addLabel(scr, net, &lv_font_montserrat_14);
  addButton(scr, "Test click", 261, true);
  addButton(scr, "Test buzz", 262, false);
  addButton(scr, "Clear motor fault", 263, false);
  addButton(scr, "Refresh", 260, false);
}

static void closeReset(lv_event_t* e) {
  lv_obj_t* dim = (lv_obj_t*)lv_event_get_user_data(e);
  if (dim) lv_obj_del(dim);
}

static void doReset(lv_event_t* e) {
  (void)e;
  settingsFactoryReset();
}

static void showResetConfirm() {
  Palette p = palette();
  lv_obj_t* host = pageScr ? pageScr : lv_scr_act();
  lv_obj_t* dim = lv_obj_create(host);
  lv_obj_set_size(dim, 320, 240);
  lv_obj_set_pos(dim, 0, 0);
  lv_obj_add_flag(dim, LV_OBJ_FLAG_FLOATING);
  lv_obj_clear_flag(dim, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_set_style_radius(dim, 0, 0);
  lv_obj_set_style_border_width(dim, 0, 0);
  lv_obj_set_style_bg_color(dim, lv_color_hex(0x000000), 0);
  lv_obj_set_style_bg_opa(dim, LV_OPA_70, 0);
  lv_obj_move_foreground(dim);

  lv_obj_t* card = lv_obj_create(dim);
  lv_obj_set_width(card, 280);
  lv_obj_set_height(card, LV_SIZE_CONTENT);
  lv_obj_align(card, LV_ALIGN_CENTER, 0, 0);
  lv_obj_set_style_bg_color(card, lv_color_hex(p.bg), 0);
  lv_obj_set_style_bg_opa(card, LV_OPA_COVER, 0);
  lv_obj_set_style_border_width(card, 0, 0);
  lv_obj_set_style_pad_all(card, 10, 0);
  lv_obj_set_style_pad_row(card, 8, 0);
  lv_obj_set_flex_flow(card, LV_FLEX_FLOW_COLUMN);
  lv_obj_clear_flag(card, LV_OBJ_FLAG_SCROLLABLE);
  addLabel(card, "Erase this device?", &lv_font_montserrat_16);
  addLabel(card, "This deletes the login, saved Wi-Fi, and study progress on the SD card.", &lv_font_montserrat_14);

  lv_obj_t* cancel = lv_btn_create(card);
  lv_obj_set_width(cancel, lv_pct(100));
  lv_obj_set_style_bg_color(cancel, lv_color_hex(p.btn), 0);
  lv_obj_set_style_bg_opa(cancel, LV_OPA_COVER, 0);
  lv_obj_add_event_cb(cancel, closeReset, LV_EVENT_CLICKED, dim);
  lv_obj_t* cancelLab = lv_label_create(cancel);
  lv_label_set_text(cancelLab, "Cancel");
  lv_obj_set_style_text_color(cancelLab, lv_color_hex(p.btnFg), 0);
  lv_obj_center(cancelLab);

  lv_obj_t* erase = lv_btn_create(card);
  lv_obj_set_width(erase, lv_pct(100));
  lv_obj_set_style_bg_color(erase, lv_color_hex(0x8E2F2F), 0);
  lv_obj_set_style_bg_opa(erase, LV_OPA_COVER, 0);
  lv_obj_add_event_cb(erase, doReset, LV_EVENT_CLICKED, nullptr);
  lv_obj_t* eraseLab = lv_label_create(erase);
  lv_label_set_text(eraseLab, "Erase everything");
  lv_obj_set_style_text_color(eraseLab, lv_color_hex(0xFFFFFF), 0);
  lv_obj_center(eraseLab);
}

static void onHsv(lv_event_t* e) {
  int part = (int)(intptr_t)lv_event_get_user_data(e);
  int value = lv_slider_get_value(lv_event_get_target(e));
  if (part == 0) pickHsv.h = value;
  else if (part == 1) pickHsv.s = value;
  else pickHsv.v = value;
  if (!pickPreview) return;
  lv_obj_set_style_bg_color(pickPreview, lv_color_hsv_to_rgb(pickHsv.h, pickHsv.s, pickHsv.v), 0);
}

static lv_obj_t* hsvSlider(lv_obj_t* parent, const char* name, int value, int max, int part) {
  addLabel(parent, name, &lv_font_montserrat_14);
  lv_obj_t* slider = lv_slider_create(parent);
  lv_obj_set_width(slider, lv_pct(100));
  lv_slider_set_range(slider, 0, max);
  lv_slider_set_value(slider, value, LV_ANIM_OFF);
  lv_obj_add_event_cb(slider, onHsv, LV_EVENT_VALUE_CHANGED, (void*)(intptr_t)part);
  Palette p = palette();
  lv_obj_set_style_bg_color(slider, lv_color_hex(p.accent), LV_PART_INDICATOR);
  lv_obj_set_style_bg_color(slider, lv_color_hex(p.accent), LV_PART_KNOB);
  return slider;
}

static void showColor() {
  page = Page::Pick;
  pageAt = millis();
  const char* name = pickWhich == 0 ? "Background" : pickWhich == 1 ? "Page text" : pickWhich == 3 ? "Button text" : "Buttons";
  uint32_t current = pickWhich == 0 ? settings().colorBg : pickWhich == 1 ? settings().colorFg : pickWhich == 3 ? settings().colorBtnFg : settings().colorBtn;
  pickHsv = lv_color_to_hsv(lv_color_hex(current));
  lv_obj_t* scr = fresh();
  addLabel(scr, name, &lv_font_montserrat_20);
  pickPreview = lv_obj_create(scr);
  lv_obj_set_width(pickPreview, lv_pct(100));
  lv_obj_set_height(pickPreview, 28);
  lv_obj_set_style_radius(pickPreview, 4, 0);
  lv_obj_set_style_border_width(pickPreview, 0, 0);
  lv_obj_set_style_bg_opa(pickPreview, LV_OPA_COVER, 0);
  lv_obj_set_style_bg_color(pickPreview, lv_color_hex(current), 0);
  lv_obj_clear_flag(pickPreview, LV_OBJ_FLAG_SCROLLABLE);
  hsvSlider(scr, "Hue", pickHsv.h, 359, 0);
  hsvSlider(scr, "Saturation", pickHsv.s, 100, 1);
  hsvSlider(scr, "Brightness", pickHsv.v, 100, 2);
  addButton(scr, "Use this color", 87, true);
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
  lv_color_t color = lv_color_hex(feedbackOk ? 0x143D28 : 0x4A1C18);
  lv_obj_set_style_bg_color(scr, color, 0);
  lv_obj_set_style_text_color(scr, lv_color_hex(0xFFFFFF), 0);
  addButton(scr, quizFinished() ? "See score" : "Next", 10, true);
}

static void showResult() {
  page = Page::Result;
  pageAt = millis();
  lv_obj_t* scr = fresh();
  char line[48];
  snprintf(line, sizeof(line), "%d / %d", quizScore(), quizLength());
  addLabel(scr, "Session", &lv_font_montserrat_14);
  addLabel(scr, line, &lv_font_montserrat_28);
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
  hapticService();
  wifiHandle();
  displayLoop();
  refreshBar();
  if (page == Page::Boot && millis() - pageAt > 900) routeAfterBoot();
  if (page == Page::Alarm && millis() - pageAt > 45000) powerSleepUntilSchedule();
  bool waiting = page == Page::Home || page == Page::Study || page == Page::Notes || page == Page::Settings
      || page == Page::Result || page == Page::Analytics || page == Page::Wifi || page == Page::Login || page == Page::Pick || page == Page::Debug;
  if (page != Page::Alarm) powerDimCheck(waiting);
}
