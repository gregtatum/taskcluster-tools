log("popup.js")

/**
 * @param {any[]} args
 */
function log(...args) {
  console.log("%c[fxp-taskcluster]%c", "color: #0ff", "color: inherit", ...args)
}

/**
 * @param {string} id
 * @returns {HTMLElement}
 */
function getById(id) {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error("Could not find element by ID: " + id);
  }
  return el
}

class Panel {
  constructor() {
    this.elements = {
      hasTask: getById("hasTask"),
      noTask: getById("noTask"),
      viewTaskButton: getById("viewTaskButton"),
    }

    this.elements.viewTaskButton.addEventListener("click", this.onClick);
    this.updateView()
  }

  updateView() {
    this.elements.noTask.hidden = true;
  }

  onClick = () => {
    log("Clicked to open in taskcluster.");
    browser.runtime.sendMessage({ name: "open-taskgroup-in-profiler" })
  }
}

addEventListener("DOMContentLoaded", () => {
  new Panel();
}, { once: true, });
