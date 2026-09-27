#pragma once

#include <vector>
#include "bank.h"

void quizStart(const std::vector<int>& indexes);
std::vector<int> quizBuild();
bool quizActive();
const Mcq* quizCurrent();
int quizPos();
int quizLength();
int quizScore();
bool quizFinished();
bool quizAnswer(int choice);
void quizAdvance();
std::vector<int> quizMissIndexes();
const std::vector<int>& quizIndexes();
