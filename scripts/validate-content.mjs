/* Standalone content validator (run via `npm run validate-content`).
 *
 * Loads the app modules and asserts: the whole curriculum is structurally valid,
 * and a large sample of generated questions from every generator passes the
 * Question schema under a fixed seed. Exits non-zero on any failure, so CI fails
 * fast on malformed content.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.dirname(fileURLToPath(import.meta.url));
const src = (p) => require(path.join(root, "..", "src", p));

src("core/rng.js");
src("music.js");
src("core/validate.js");
src("core/diagnose.js");
src("notation.js");
src("audio.js");
src("core/srs.js");
src("core/analytics.js");
src("core/storage.js");
src("content.js");
src("core/session.js");

const { content, validate, session, rng } = MTT;

let failures = 0;
function fail(msg) { failures++; console.error("FAIL:", msg); }

// 1. Curriculum structure.
const cv = validate.validateContent(content);
if (!cv.ok) cv.errors.forEach((e) => fail(e));

// 2. Every quizable generator: 60 questions each under a fixed seed.
const SAMPLES = 60;
const topics = session.quizableTopics(content);
let totalChecked = 0;
for (const t of topics) {
  const r = rng.create("validate-" + t.id);
  for (let i = 0; i < SAMPLES; i++) {
    let q;
    try {
      q = t.questions(r);
    } catch (err) {
      fail(`${t.id}: generator threw: ${err.message}`);
      break;
    }
    const res = validate.validateQuestion(q);
    if (!res.ok) {
      fail(`${t.id} #${i}: ${res.errors.join("; ")}`);
      break;
    }
    totalChecked++;
  }
}

if (failures) {
  console.error(`\n${failures} content validation failure(s).`);
  process.exit(1);
}
console.log(`OK: curriculum valid; ${totalChecked} generated questions across ${topics.length} generators passed.`);
