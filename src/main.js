/* main.js - browser entry point.
 *
 * The only module that touches the DOM at load time: it boots the app once the
 * document is ready. Tests never load this file; they call MTT.app.boot()
 * directly with an injected document.
 */
(function (global) {
  "use strict";

  function start() {
    if (global.MTT && global.MTT.app) global.MTT.app.boot();
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start);
    } else {
      start();
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
