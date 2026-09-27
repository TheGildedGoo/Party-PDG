#pragma once

#include <stdint.h>
#include <algorithm>
#include <cmath>
#include <string>
#include <vector>

/* SM-2 matching web/js/logic.js sm2(). `ease` is the site's `ef`.
   `lapses` counts scores below 3. The site ignores unknown fields, and
   merge keeps the card with more reps (then the later due). */

struct SrCard {
  float ease;
  int interval;
  int reps;
  int lapses;
  int64_t dueMs;
};

inline int jsRoundPositive(float value) {
  return (int)std::floor(value + 0.5f);
}

inline SrCard gradeCard(SrCard card, int quality, int64_t nowMs) {
  float ease = card.ease > 0.01f ? card.ease : 2.5f;
  int interval = card.interval > 0 ? card.interval : 0;
  int reps = card.reps > 0 ? card.reps : 0;
  int lapses = card.lapses > 0 ? card.lapses : 0;
  int q = quality;
  if (q < 0) q = 0;
  if (q > 5) q = 5;
  if (q < 3) {
    reps = 0;
    interval = 1;
    lapses += 1;
  } else {
    if (reps == 0) interval = 1;
    else if (reps == 1) interval = 6;
    else interval = std::max(1, jsRoundPositive((float)interval * ease));
    ease = ease + (0.1f - (5 - q) * (0.08f + (5 - q) * 0.02f));
    if (ease < 1.3f) ease = 1.3f;
    reps += 1;
  }
  ease = std::floor(ease * 100.0f + 0.5f) / 100.0f;
  SrCard out;
  out.ease = ease;
  out.interval = interval;
  out.reps = reps;
  out.lapses = lapses;
  out.dueMs = nowMs + (int64_t)interval * 86400000LL;
  return out;
}

enum class MixBucket { Due, Review, Unseen };

struct MixRow {
  int index;
  MixBucket bucket;
};

inline bool cardIsDue(const SrCard* card, int wrong, int correct, int64_t nowMs) {
  if (card && card->dueMs > 0 && card->dueMs <= nowMs) return true;
  if (wrong > correct && (wrong + correct) > 0) return true;
  return false;
}

/* 60% due/weak, 30% review, 10% unseen. Short buckets spill into the others. */
inline std::vector<int> mixSession(const std::vector<MixRow>& rows, int count, uint32_t seed) {
  std::vector<int> due, review, unseen;
  uint32_t state = seed ? seed : 1u;
  auto nextRand = [&state]() {
    state = state * 1664525u + 1013904223u;
    return state;
  };
  auto take = [&](std::vector<int>& bag) {
    if (bag.empty()) return;
    size_t at = nextRand() % bag.size();
    std::swap(bag[at], bag.back());
  };
  for (const MixRow& row : rows) {
    if (row.bucket == MixBucket::Due) due.push_back(row.index);
    else if (row.bucket == MixBucket::Review) review.push_back(row.index);
    else unseen.push_back(row.index);
  }
  for (int i = (int)due.size() - 1; i > 0; i--) {
    size_t j = nextRand() % (size_t)(i + 1);
    std::swap(due[i], due[j]);
  }
  for (int i = (int)review.size() - 1; i > 0; i--) {
    size_t j = nextRand() % (size_t)(i + 1);
    std::swap(review[i], review[j]);
  }
  for (int i = (int)unseen.size() - 1; i > 0; i--) {
    size_t j = nextRand() % (size_t)(i + 1);
    std::swap(unseen[i], unseen[j]);
  }
  (void)take;
  int wantDue = (count * 60) / 100;
  int wantReview = (count * 30) / 100;
  int wantUnseen = count - wantDue - wantReview;
  if (count < 3) {
    wantDue = count;
    wantReview = 0;
    wantUnseen = 0;
  }
  std::vector<int> out;
  auto pull = [&](std::vector<int>& bag, int n) {
    while (n > 0 && !bag.empty() && (int)out.size() < count) {
      out.push_back(bag.back());
      bag.pop_back();
      n--;
    }
  };
  pull(due, wantDue);
  pull(review, wantReview);
  pull(unseen, wantUnseen);
  pull(due, count);
  pull(review, count);
  pull(unseen, count);
  return out;
}
