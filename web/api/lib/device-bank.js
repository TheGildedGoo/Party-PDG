import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const EDITION = "AFH1-2025";

function here() {
  return dirname(fileURLToPath(import.meta.url));
}

export function bankPaths() {
  const traced = fileURLToPath(new URL("../../data/bank.mcq.json", import.meta.url));
  const root = join(here(), "..", "..", "data");
  return [
    traced,
    join(root, "bank.mcq.json"),
    join(process.cwd(), "data", "bank.mcq.json"),
    join("/var/task", "data", "bank.mcq.json"),
  ];
}

export function loadDeviceCatalog() {
  for (const path of bankPaths()) {
    if (!existsSync(path)) continue;
    const catalog = JSON.parse(readFileSync(path, "utf8"));
    if (!catalog || !Array.isArray(catalog.items)) continue;
    return catalog;
  }
  const err = new Error("Question bank is not on this server.");
  err.status = 503;
  throw err;
}

export function wapsLabel(flag) {
  const value = String(flag || "").toLowerCase();
  if (value === "both" || value === "e5+e6") return "E5+E6";
  if (value === "e6") return "E6";
  if (value === "off") return "off";
  return "off";
}

function compactItem(item) {
  const cite = item && item.cite ? item.cite : {};
  const para = cite.para || cite.paragraph || "";
  const kind = item.kind || item.type || "mcq";
  if (kind !== "mcq") return null;
  if (!item.id || !item.question || !Array.isArray(item.choices) || item.choices.length !== 4) return null;
  if (cite.chapter == null || !cite.section || !para) return null;
  const answerIndex = Number(item.answerIndex);
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) return null;
  const out = {
    id: String(item.id),
    question: String(item.question),
    choices: item.choices.map((choice) => String(choice)),
    answerIndex,
    difficulty: Number(item.difficulty) || 1,
    ranks: Array.isArray(item.ranks) ? item.ranks.map(String) : [],
    cite: {
      chapter: Number(cite.chapter),
      section: String(cite.section),
      para: String(para),
    },
    explain: String(item.explain || ""),
    source: String(item.source || ""),
  };
  if (cite.title) out.cite.title = String(cite.title);
  return out;
}

function hashItems(items) {
  return createHash("sha256").update(JSON.stringify(items)).digest("hex");
}

export function shapeBank(catalog, query = {}) {
  const rank = String(query.rank || "E5").toUpperCase();
  if (rank !== "E5" && rank !== "E6") {
    const err = new Error("Rank must be E5 or E6.");
    err.status = 400;
    throw err;
  }
  const chapters = (catalog.chapters || []).map((chapter) => ({
    number: Number(chapter.number != null ? chapter.number : chapter.chapter),
    title: String(chapter.title || ""),
    waps: wapsLabel(chapter.waps),
  }));
  const items = [];
  for (const raw of catalog.items || []) {
    const item = compactItem(raw);
    if (!item) continue;
    if (!item.ranks.includes(rank)) continue;
    items.push(item);
  }
  const generatedAt = Number(catalog.generatedAt) || 0;
  const hash = hashItems(items);
  let since = Number(query.updated_since);
  if (Number.isFinite(since) && since > 1e12) since = Math.floor(since / 1000);
  const unchanged = Number.isFinite(since) && since > 0 && generatedAt > 0 && since >= generatedAt;
  const body = {
    edition: catalog.edition || EDITION,
    generatedAt,
    count: items.length,
    hash,
    chapters,
  };
  if (unchanged) {
    body.unchanged = true;
    return body;
  }
  body.items = items;
  return body;
}
