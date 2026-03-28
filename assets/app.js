const storageKey = "dreamhubs-theme";
const root = document.documentElement;
const buttons = Array.from(document.querySelectorAll("[data-theme-choice]"));

function getSystemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(choice) {
  const resolved = choice === "system" ? getSystemTheme() : choice;
  root.dataset.theme = resolved;

  buttons.forEach((button) => {
    button.classList.toggle("active", button.dataset.themeChoice === choice);
  });
}

function setTheme(choice) {
  localStorage.setItem(storageKey, choice);
  applyTheme(choice);
}

const savedTheme = localStorage.getItem(storageKey) || "system";
applyTheme(savedTheme);

buttons.forEach((button) => {
  button.addEventListener("click", () => {
    setTheme(button.dataset.themeChoice);
  });
});

window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", () => {
    const current = localStorage.getItem(storageKey) || "system";
    if (current === "system") {
      applyTheme("system");
    }
  });
