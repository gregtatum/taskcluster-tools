
/**
 * @param {any[]} args
 */
function log(...args) {
  console.log("%c[fxp-taskcluster]%c", "color: #0ff", "color: inherit", ...args)
}

log("extension/profiler_content.js")

browser.runtime.onMessage.addListener((message) => {
  switch (message.name) {
    case "inject-profile": {
      // Wait two rAFs to ensure the page has rendered after DOMContentLoaded.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          log("Injecting the profile");
          window.postMessage(message, "*")
        })
      })
    }
  }
});
