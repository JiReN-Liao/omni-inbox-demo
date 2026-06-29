import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("frontend includes bilingual language switching hooks", () => {
  const html = fs.readFileSync("public/index.html", "utf8");
  const app = fs.readFileSync("public/app.js", "utf8");

  assert.match(html, /id="languageMenuButton"/);
  assert.match(html, /id="languageMenu"/);
  assert.match(app, /lineUnifiedLanguage/);
  assert.match(app, /Unified Support Inbox/);
  assert.match(app, /Omnichannel social support/);
  assert.match(app, /Manage LINE, Messenger, and Instagram conversations/);
});

test("platform connectors use local logo assets", () => {
  const html = fs.readFileSync("public/index.html", "utf8");
  for (const asset of ["line.png", "messenger.svg", "instagram.svg"]) {
    assert.equal(fs.existsSync(`public/assets/platforms/${asset}`), true);
    assert.match(html, new RegExp(`/assets/platforms/${asset.replace(".", "\\.")}`));
  }
});

test("Traditional Chinese mode does not leak untranslated interface terms", () => {
  const html = fs.readFileSync("public/index.html", "utf8");
  const app = fs.readFileSync("public/app.js", "utf8");
  const start = app.indexOf("  zh: {");
  const end = app.indexOf("  en: {", start);
  const zh = app.slice(start, end);

  assert.doesNotMatch(zh, /\b(?:SLA|AI|Webhook|English)\b|Messaging API|Developers Console|Channel Secret|Access Token/);
  assert.match(zh, /enLanguage: "英文"/);
  assert.doesNotMatch(html, /aria-label="(?:Primary|Conversations|Conversation|Customer context)"/);
  assert.match(app, /primaryNavAria: "主要導覽"/);
  assert.match(app, /contextRegionAria: "客戶資訊區"/);
  assert.match(app, /const formElement = event\.currentTarget;[\s\S]*formElement\.reset\(\)/);
});
