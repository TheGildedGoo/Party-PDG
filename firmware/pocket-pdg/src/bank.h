#pragma once

#include <stddef.h>
#include <stdint.h>

struct Mcq {
  char id[16];
  char question[192];
  char choice[4][128];
  char section[8];
  char para[8];
  char title[40];
  char explain[320];
  char source[96];
  uint8_t answer;
  uint8_t difficulty;
  uint8_t chapter;
  uint8_t ranks;
};

struct ChapterInfo {
  int number;
  char title[48];
  char waps[12];
};

void bankBegin();
int bankCount();
const Mcq* bankAt(int index);
bool bankUsingFixture();
int bankChapters(const ChapterInfo** out);
bool bankLoadFile();
bool bankIngest(const char* json, size_t length);
int bankIndexOf(const char* id);
