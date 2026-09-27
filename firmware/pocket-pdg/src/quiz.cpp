#include "quiz.h"

#include <Arduino.h>
#include "audio.h"
#include "haptic.h"
#include "settings.h"
#include "srs.h"
#include "srs_algo.h"

static std::vector<int> indexes;
static std::vector<int> wrongIndexes;
static int pos = 0;
static int score = 0;
static bool finished = false;
static bool answered = false;

std::vector<int> quizBuild() {
  std::vector<MixRow> rows;
  const Settings& cfg = settings();
  int64_t now = (int64_t)time(nullptr) * 1000LL;
  if (now < 1700000000000LL) now = (int64_t)millis();
  for (int i = 0; i < bankCount(); i++) {
    const Mcq* item = bankAt(i);
    if (!item) continue;
    if (cfg.rank == 5 && (item->ranks & 1) == 0) continue;
    if (cfg.rank == 6 && (item->ranks & 2) == 0) continue;
    if (item->chapter < 1 || item->chapter > 24) continue;
    if ((cfg.chapterMask & (1u << (item->chapter - 1))) == 0) continue;
    MixRow row;
    row.index = i;
    int wrong = srsWrong(item->id);
    int correct = srsCorrect(item->id);
    SrCard card = {};
    bool studied = srsLookup(item->id, &card) || (wrong + correct) > 0;
    if (!studied) row.bucket = MixBucket::Unseen;
    else if (cardIsDue(srsLookup(item->id, &card) ? &card : nullptr, wrong, correct, now)) row.bucket = MixBucket::Due;
    else row.bucket = MixBucket::Review;
    rows.push_back(row);
  }
  return mixSession(rows, cfg.sessionSize, (uint32_t)millis());
}

void quizStart(const std::vector<int>& next) {
  indexes = next;
  wrongIndexes.clear();
  pos = 0;
  score = 0;
  finished = indexes.empty();
  answered = false;
}

bool quizActive() { return !indexes.empty() && !finished; }
const Mcq* quizCurrent() {
  if (!quizActive()) return nullptr;
  return bankAt(indexes[pos]);
}
int quizPos() { return pos; }
int quizLength() { return (int)indexes.size(); }
int quizScore() { return score; }
bool quizFinished() { return finished; }
const std::vector<int>& quizIndexes() { return indexes; }

bool quizAnswer(int choice) {
  if (!quizActive() || answered) return false;
  const Mcq* item = quizCurrent();
  if (!item) return false;
  answered = true;
  bool ok = choice == item->answer;
  if (ok) {
    score++;
    hapticClick();
    audioCorrect();
  } else {
    wrongIndexes.push_back(indexes[pos]);
    hapticWrong();
    audioWrong();
  }
  srsGrade(*item, ok, choice);
  return ok;
}

void quizAdvance() {
  if (!answered) return;
  answered = false;
  pos++;
  if (pos >= (int)indexes.size()) finished = true;
}

std::vector<int> quizMissIndexes() { return wrongIndexes; }
