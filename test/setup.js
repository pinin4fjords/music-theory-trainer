/**
 * Loads the app's classic-script modules onto `globalThis` in the same
 * dependency order the browser uses (see index.html). Each module attaches its
 * API to `globalThis.MTT.<name>` and also sets `module.exports`, so requiring
 * them here mirrors the real runtime exactly - no bundler, no ESM rewrite.
 *
 * `main.js` is deliberately excluded: it is the only module that touches the
 * DOM at load time (auto-boot). DOM tests call `MTT.app.boot()` themselves.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.dirname(fileURLToPath(import.meta.url));
const src = (p) => require(path.join(root, "..", "src", p));

// Order matters: a module reads its dependencies from globalThis.MTT at load.
src("core/rng.js");
src("music.js");
src("core/validate.js");
src("core/diagnose.js");
src("notation.js");
src("audio.js");
src("core/srs.js");
src("core/analytics.js");
src("core/storage.js");
src("core/persist.js");
src("content.js");
src("core/session.js");
src("core/state.js");

// UI modules are loaded only when a DOM is present (jsdom test files).
if (typeof document !== "undefined") {
  src("ui/components.js");
  src("ui/router.js");
  src("ui/views/home.js");
  src("ui/views/learn.js");
  src("ui/views/quiz.js");
  src("ui/views/explainer.js");
  src("ui/views/playground.js");
  src("ui/app.js");
}
