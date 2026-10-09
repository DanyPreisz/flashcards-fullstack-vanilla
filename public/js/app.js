import { api, setSession, clearSession, getToken } from "./api.js";
const authView = document.querySelector("#auth-view");
const appView = document.querySelector("#app-view");
const authForm = document.querySelector("#auth-form");
const authError = document.querySelector("#auth-error");
const authSubmit = document.querySelector("#auth-submit");
const listEl = document.querySelector("#list");
const decksEl = document.querySelector("#decks");
const study = document.querySelector("#study");
const form = document.querySelector("#card-form");
const formError = document.querySelector("#form-error");
let mode = "login";
let deck = "";
let cards = [];
let index = 0;
let flipped = false;
const showError = (el, message) => { el.hidden = !message; el.textContent = message || ""; };

function setMode(next) {
  mode = next;
  document.querySelectorAll("#auth-view .tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === mode));
  authSubmit.textContent = mode === "login" ? "Entrar" : "Crear cuenta";
}
function paintStudy() {
  if (!cards.length) { study.classList.add("hidden"); return; }
  study.classList.remove("hidden");
  const card = cards[index % cards.length];
  study.textContent = flipped ? card.back : card.front;
}
async function refresh() {
  const data = await api(`/api/cards?deck=${encodeURIComponent(deck)}`);
  cards = data.cards;
  decksEl.innerHTML = "";
  ["", ...data.decks].forEach((name) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tab${deck === name ? " active" : ""}`;
    button.textContent = name || "Todos";
    button.addEventListener("click", async () => { deck = name; index = 0; flipped = false; await refresh(); });
    decksEl.append(button);
  });
  paintStudy();
  listEl.innerHTML = "";
  cards.forEach((card) => {
    const li = document.createElement("li");
    li.className = "item";
    const text = document.createElement("span");
    text.textContent = `${card.deck} \u00b7 ${card.front} \u00b7 ${card.known}`;
    const del = document.createElement("button");
    del.type = "button";
    del.className = "ghost";
    del.textContent = "Borrar";
    del.addEventListener("click", async () => { await api(`/api/cards/${card.id}`, { method: "DELETE" }); await refresh(); });
    li.append(text, del);
    listEl.append(li);
  });
}
async function boot() {
  if (!getToken()) return;
  try {
    const { user } = await api("/api/auth/me");
    authView.classList.add("hidden");
    appView.classList.remove("hidden");
    document.querySelector("#user-name").textContent = user.username;
    await refresh();
  } catch { clearSession(); }
}
document.querySelectorAll("#auth-view .tab").forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.mode)));
authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(authError, "");
  const fd = new FormData(authForm);
  try {
    const data = await api(mode === "login" ? "/api/auth/login" : "/api/auth/register", { method: "POST", body: JSON.stringify({ username: fd.get("username"), password: fd.get("password") }) });
    setSession(data.token);
    authForm.reset();
    await boot();
  } catch (err) { showError(authError, err.message); }
});
document.querySelector("#logout").addEventListener("click", () => { clearSession(); appView.classList.add("hidden"); authView.classList.remove("hidden"); });
study.addEventListener("click", async () => {
  if (!cards.length) return;
  if (!flipped) { flipped = true; paintStudy(); return; }
  await api(`/api/cards/${cards[index % cards.length].id}/known`, { method: "POST" });
  index += 1;
  flipped = false;
  await refresh();
});
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(formError, "");
  try {
    await api("/api/cards", { method: "POST", body: JSON.stringify({ deck: document.querySelector("#deck").value.trim(), front: document.querySelector("#front").value.trim(), back: document.querySelector("#back").value.trim() }) });
    document.querySelector("#front").value = "";
    document.querySelector("#back").value = "";
    await refresh();
  } catch (err) { showError(formError, err.message); }
});
boot();
