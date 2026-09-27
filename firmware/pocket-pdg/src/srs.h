#pragma once

#include <stddef.h>
#include <stdint.h>
#include "bank.h"
#include "srs_algo.h"

void srsBegin();
void srsGrade(const Mcq& item, bool correct, int picked);
bool srsLookup(const char* id, SrCard* out);
int srsWrong(const char* id);
int srsCorrect(const char* id);
int srsLastPick(const char* id);
int srsStreak();
bool srsSave();
bool srsMergeRemote(const char* json, size_t length);
const char* srsExportJson();
