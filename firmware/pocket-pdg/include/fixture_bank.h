#pragma once
/* Eight MCQs from the Party-PDG bank so the brick boots with no network.
   A sync replaces this with GET /api/device/bank. */
struct FixtureMcq {
  const char* id;
  const char* question;
  const char* choices[4];
  int answer;
  int difficulty;
  int chapter;
  const char* section;
  const char* para;
  const char* title;
  const char* explain;
  const char* source;
  const char* ranks;
};
static const FixtureMcq FIXTURE_BANK[] = {
  {
    "q-01-13-01",
    "Which three standards does AFH 1 name as the Air Force core values?",
    {"Integrity First, Service Before Self, and Excellence In All We Do", "Loyalty, Duty, and Respect", "Duty, Honor, Country", "Honor, Courage, and Commitment"},
    0, 1, 1,
    "1C", "1.3", "Air Force Core Values",
    "Paragraph 1.3 names Integrity First, Service Before Self, and Excellence In All We Do. The other trios are sister-service language or virtues of a single core value.",
    "AFH 1 (2025) para 1.3 — Air Force Core Values.",
    "E5,E6",
  },
  {
    "q-01-131-02",
    "AFH 1 lists which virtues under Integrity First?",
    {"Honesty, courage, and accountability", "Honor, courage, and commitment", "Duty, loyalty, and respect", "Mission, discipline, and teamwork"},
    0, 2, 1,
    "1C", "1.3.1", "Integrity First",
    "Paragraph 1.3.1 assigns honesty, courage, and accountability to Integrity First. Duty, loyalty, and respect belong to Service Before Self, and mission, discipline, and teamwork belong to Excellence.",
    "AFH 1 (2025) para 1.3.1 — Integrity First.",
    "E5,E6",
  },
  {
    "q-01-132-03",
    "Which virtues does AFH 1 attach to Service Before Self?",
    {"Candor, competence, and commitment", "Duty, loyalty, and respect", "Mission, discipline, and teamwork", "Honesty, courage, and accountability"},
    1, 2, 1,
    "1C", "1.3.2", "Service Before Self",
    "Paragraph 1.3.2 names duty, loyalty, and respect as the virtues of Service Before Self. The other sets belong to Integrity First, Excellence, or a different service.",
    "AFH 1 (2025) para 1.3.2 — Service Before Self.",
    "E5,E6",
  },
  {
    "q-01-133-04",
    "AFH 1 says the virtues of Excellence In All We Do are which set?",
    {"Duty, loyalty, and respect", "Honesty, courage, and accountability", "Precision, initiative, and resilience", "Mission, discipline, and teamwork"},
    3, 2, 1,
    "1C", "1.3.3", "Excellence In All We Do",
    "Paragraph 1.3.3 names mission, discipline, and teamwork. The other lists are either another core value's virtues or foundational competencies, not this trio.",
    "AFH 1 (2025) para 1.3.3 — Excellence In All We Do.",
    "E5,E6",
  },
  {
    "q-09-91-74",
    "Which instruction does AFH 1 name as the detailed source for enlisted promotion and demotion?",
    {"AFH 36-2647", "AFI 36-2502", "AFI 1-1", "DAFI 90-802"},
    1, 2, 9,
    "9A", "9.1", "Enlisted Promotion Systems",
    "Paragraph 9.1 points to AFI 36-2502 for enlisted promotion and demotion programs. AFI 1-1 is standards, and 90-802 is risk management.",
    "AFH 1 (2025) para 9.1 — Enlisted Promotion Systems.",
    "E5,E6",
  },
  {
    "q-09-91-75",
    "AFH 1 says the promotions chapter applies to which component's enlisted system?",
    {"Only civilians", "Only the Space Force", "Only the Air National Guard", "Regular Air Force"},
    3, 2, 9,
    "9A", "9.1", "Enlisted Promotion Systems",
    "Paragraph 9.1 notes the chapter applies to RegAF enlisted promotions. Guard and Reserve systems are not the chapter's scope note.",
    "AFH 1 (2025) para 9.1 — Enlisted Promotion Systems.",
    "E5,E6",
  },
  {
    "q-09-92-76",
    "AFH 1 says the authorized fiscal-year average for E-9 may not exceed what share of enlisted RegAF strength?",
    {"25 percent", "2.5 percent", "1.25 percent", "10 percent"},
    2, 3, 9,
    "9A", "9.2", "Promotion Quotas",
    "Paragraph 9.2 says E-8 may not average more than 2.5 percent and E-9 may not average more than 1.25 percent. The larger figure is the E-8 cap.",
    "AFH 1 (2025) para 9.2 — Promotion Quotas.",
    "E5,E6",
  },
  {
    "q-09-92-77",
    "AFH 1 caps the E-8 fiscal-year average at what percent of enlisted RegAF strength?",
    {"1.25 percent", "2.5 percent", "15 percent", "5 percent"},
    1, 3, 9,
    "9A", "9.2", "Promotion Quotas",
    "Paragraph 9.2 sets 2.5 percent for E-8 and 1.25 percent for E-9. Swapping those caps is a common mix-up.",
    "AFH 1 (2025) para 9.2 — Promotion Quotas.",
    "E5,E6",
  },
};
static const int FIXTURE_BANK_COUNT = 8;
