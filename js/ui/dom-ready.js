export function runWhenDomReady(callback) {
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", callback, { once: true });
  } else {
    callback();
  }
}
