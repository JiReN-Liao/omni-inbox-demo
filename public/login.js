/* =========================================================================
   Omni Inbox - sign-in controller
   Vanilla JS, no build step. Posts to /api/auth/login and, on success, lets the
   server-set HttpOnly session cookie carry the operator into the console.
   ========================================================================= */

const i18n = {
  zh: {
    htmlLang: "zh-Hant",
    brandSubtitle: "跨平台社群客服控制台",
    eyebrow: "安全登入",
    heading: "登入客服控制台",
    sub: "請輸入您的帳號與密碼，以進入統一收件匣。",
    channelsLabel: "支援平台",
    username: "帳號",
    password: "密碼",
    submit: "登入",
    submitting: "登入中…",
    showPassword: "顯示密碼",
    hidePassword: "隱藏密碼",
    langGroup: "介面語言",
    foot: "資料以 SQLite 安全保存，並定期建立快照與備份。",
    errFields: "請輸入帳號與密碼。",
    errInvalid: "帳號或密碼不正確，請再試一次。",
    errLocked: "登入嘗試次數過多，請稍候幾分鐘後再試。",
    errNetwork: "無法連線至伺服器，請檢查網路後再試。",
    errUnknown: "登入失敗，請稍後再試。"
  },
  en: {
    htmlLang: "en",
    brandSubtitle: "Omnichannel social support",
    eyebrow: "Secure sign-in",
    heading: "Sign in to your console",
    sub: "Enter your username and password to open the unified inbox.",
    channelsLabel: "Channels",
    username: "Username",
    password: "Password",
    submit: "Sign in",
    submitting: "Signing in…",
    showPassword: "Show password",
    hidePassword: "Hide password",
    langGroup: "Interface language",
    foot: "Data is stored safely in SQLite with regular snapshots and backups.",
    errFields: "Enter your username and password.",
    errInvalid: "Incorrect username or password. Please try again.",
    errLocked: "Too many sign-in attempts. Please wait a few minutes and retry.",
    errNetwork: "Could not reach the server. Check your connection and retry.",
    errUnknown: "Sign-in failed. Please try again later."
  }
};

let lang = localStorage.getItem("lineUnifiedLanguage") === "en" ? "en" : "zh";

const els = {};
["brandSubtitle", "loginEyebrow", "loginHeading", "loginSub", "channelsLabel",
 "usernameLabel", "passwordLabel", "submitLabel", "loginFoot",
 "loginForm", "loginSubmit", "username", "password", "togglePassword", "eyeIcon",
 "loginAlert", "loginAlertText", "langToggle"
].forEach((id) => { els[id] = document.getElementById(id); });

const t = (key) => i18n[lang][key] ?? key;

function applyLanguage() {
  const dict = i18n[lang];
  document.documentElement.lang = dict.htmlLang;
  els.brandSubtitle.textContent = dict.brandSubtitle;
  els.loginEyebrow.textContent = dict.eyebrow;
  els.loginHeading.textContent = dict.heading;
  els.loginSub.textContent = dict.sub;
  els.channelsLabel.textContent = dict.channelsLabel;
  els.usernameLabel.textContent = dict.username;
  els.passwordLabel.textContent = dict.password;
  els.submitLabel.textContent = dict.submit;
  els.loginFoot.textContent = dict.foot;
  els.langToggle.setAttribute("aria-label", dict.langGroup);
  els.togglePassword.setAttribute("aria-label", isPasswordVisible() ? dict.hidePassword : dict.showPassword);
  els.langToggle.querySelectorAll("button").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.lang === lang));
  });
  document.title = "Omni Inbox";
}

function setLanguage(next) {
  if (next === lang) return;
  lang = next;
  localStorage.setItem("lineUnifiedLanguage", lang);
  applyLanguage();
  // Drop any stale alert so its text never lingers in the previous language.
  clearAlert();
}

function isPasswordVisible() {
  return els.password.type === "text";
}

function togglePassword() {
  const visible = !isPasswordVisible();
  els.password.type = visible ? "text" : "password";
  els.togglePassword.setAttribute("aria-pressed", String(visible));
  els.togglePassword.setAttribute("aria-label", visible ? t("hidePassword") : t("showPassword"));
  els.eyeIcon.innerHTML = visible
    ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
    : '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>';
  els.password.focus();
}

function showAlert(message) {
  els.loginAlertText.textContent = message;
  els.loginAlert.classList.add("show");
  els.username.setAttribute("aria-invalid", "true");
  els.password.setAttribute("aria-invalid", "true");
}

function clearAlert() {
  els.loginAlert.classList.remove("show");
  els.username.removeAttribute("aria-invalid");
  els.password.removeAttribute("aria-invalid");
}

function setLoading(loading) {
  els.loginSubmit.classList.toggle("is-loading", loading);
  els.loginSubmit.disabled = loading;
  els.submitLabel.textContent = loading ? t("submitting") : t("submit");
}

/** Only allow same-origin, absolute-path redirects (never //evil.example). */
function safeNext() {
  const next = new URLSearchParams(location.search).get("next");
  if (next && /^\/(?!\/)/.test(next)) return next;
  return "/";
}

async function handleSubmit(event) {
  event.preventDefault();
  clearAlert();
  const username = els.username.value.trim();
  const password = els.password.value;
  if (!username || !password) {
    showAlert(t("errFields"));
    (username ? els.password : els.username).focus();
    return;
  }

  setLoading(true);
  let response;
  try {
    response = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "Accept-Language": lang === "zh" ? "zh-TW" : "en-US"
      },
      body: JSON.stringify({ username, password })
    });
  } catch {
    setLoading(false);
    showAlert(t("errNetwork"));
    return;
  }

  if (response.ok) {
    // Success: the HttpOnly session cookie is set; hand off to the console.
    location.assign(safeNext());
    return;
  }

  setLoading(false);
  const body = await response.json().catch(() => ({}));
  if (response.status === 429 || body.code === "ACCOUNT_LOCKED") showAlert(t("errLocked"));
  else if (response.status === 401 || body.code === "INVALID_CREDENTIALS") showAlert(t("errInvalid"));
  else if (body.code === "LOGIN_FIELDS_REQUIRED") showAlert(t("errFields"));
  else showAlert(t("errUnknown"));
  els.password.focus();
  els.password.select();
}

function wire() {
  els.langToggle.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => setLanguage(button.dataset.lang));
  });
  els.togglePassword.addEventListener("click", togglePassword);
  els.loginForm.addEventListener("submit", handleSubmit);
  [els.username, els.password].forEach((input) => input.addEventListener("input", clearAlert));
}

applyLanguage();
wire();
els.username.focus();
