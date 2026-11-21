import "./index.css";

const form = document.querySelector<HTMLFormElement>("#login-form");
const username = document.querySelector<HTMLInputElement>("#username");
const password = document.querySelector<HTMLInputElement>("#password");
const submit = document.querySelector<HTMLButtonElement>("#submit");
const error = document.querySelector<HTMLDivElement>("#error");

if (
  form === null ||
  username === null ||
  password === null ||
  submit === null ||
  error === null
) {
  throw new Error("Login-Formular unvollständig.");
}

const switching = new URLSearchParams(window.location.search).has("switch");

if (!switching) {
  fetch("/api/me", { cache: "no-store" })
    .then((response) => {
      if (response.ok) {
        window.location.replace("/");
      }
    })
    .catch(() => {});
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  error.classList.add("hidden");
  submit.disabled = true;

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: username.value,
        password: password.value,
      }),
    });

    if (!response.ok) {
      const text = error.querySelector("span") ?? error;
      text.textContent =
        response.status === 429
          ? "Zu viele Anmeldeversuche. Bitte später erneut versuchen."
          : response.status >= 500
            ? "Serverfehler. Bitte später erneut versuchen."
            : "Zugangsdaten falsch. Bitte erneut versuchen.";
      error.classList.remove("hidden");
      submit.disabled = false;
      return;
    }

    window.location.replace("/");
  } catch {
    error.classList.remove("hidden");
    submit.disabled = false;
  }
});
