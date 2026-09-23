/* Accounts, splash, billing, and admin. Solo/multi chrome stays in host.js. */
(function () {
  var PDG = window.PDG = window.PDG || {};
  var state = {
    ready: false,
    saas: false,
    user: null,
    guest: false,
    preview: false,
    configError: "",
    authScreen: "splash",
    panel: "",
    adminTab: "users",
    admin: null,
    error: "",
    notice: "",
    resetToken: "",
    promo: "",
    applying: false
  };
  var syncTimer = null;

  function esc(value) {
    return PDG.esc ? PDG.esc(value) : String(value == null ? "" : value);
  }

  function request() {
    if (PDG.requestRender) PDG.requestRender();
  }

  function api(path, opts) {
    opts = opts || {};
    var headers = { accept: "application/json" };
    if (opts.body) headers["content-type"] = "application/json";
    return fetch(path, {
      method: opts.method || "GET",
      credentials: "same-origin",
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      var type = res.headers.get("content-type") || "";
      if (type.indexOf("json") === -1) throw new Error("Request failed.");
      return res.json().then(function (data) {
        if (!res.ok) throw new Error((data && data.error) || "Request failed.");
        return data;
      });
    });
  }

  function entitlement() {
    return (state.user && state.user.entitlement) || { canPlay: false, reason: "auth" };
  }

  function gate() {
    if (!state.saas) return "";
    if (!state.ready) return "loading";
    if (state.resetToken) return "reset";
    if (state.configError && !state.user) return "unavailable";
    if (state.guest || state.preview) return "";
    if (!state.user) return state.authScreen || "splash";
    var reason = entitlement().reason;
    if (reason === "password") return "password";
    if (reason === "unverified") return "verify";
    if (reason === "disabled") return "disabled";
    if (!entitlement().canPlay) return "subscribe";
    return "";
  }

  function blocksPlay() { return !!gate(); }
  function demoOnly() { return !!(state.guest || state.preview); }

  function canSync() {
    return state.saas && state.user && state.user.emailVerifiedAt && !state.user.mustChangePassword && !state.user.disabledAt && !demoOnly();
  }

  function readStore(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function localSnapshot() {
    return {
      sr: PDG.sr ? PDG.sr.load() : {},
      achievements: readStore("pdg-party-ach-v1", { unlocked: {} }) || { unlocked: {} },
      focus: readStore("pdg-party-focus-v1", {}) || {},
      lastSession: readStore("pdg-party-last-session", null)
    };
  }

  function applySnapshot(progress) {
    if (!progress || !PDG.sr) return;
    state.applying = true;
    try {
      PDG.sr.save(progress.sr || {});
      localStorage.setItem("pdg-party-ach-v1", JSON.stringify(progress.achievements || { unlocked: {} }));
      localStorage.setItem("pdg-party-focus-v1", JSON.stringify(progress.focus || {}));
      if (progress.lastSession) localStorage.setItem("pdg-party-last-session", JSON.stringify(progress.lastSession));
    } catch (e) { /* quota */ }
    state.applying = false;
  }

  function syncProgress() {
    if (!canSync()) return Promise.resolve();
    return api("/api/progress", { method: "PUT", body: localSnapshot() }).then(function (data) {
      applySnapshot(data.progress);
    }).catch(function (err) { console.error(err); });
  }

  PDG.onProgressSaved = function () {
    if (state.applying || !canSync()) return;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(syncProgress, 1200);
  };

  function setUser(user) {
    state.user = user || null;
    state.error = "";
    if (user && !blocksPlay()) syncProgress();
    request();
  }

  function boot() {
    try { state.promo = sessionStorage.getItem("pdg-promo") || ""; } catch (e) { state.promo = ""; }
    try { if (sessionStorage.getItem("pdg-guest") === "1") state.guest = true; } catch (e) { /* ignore */ }
    if (location.protocol === "file:") {
      state.saas = false;
      state.ready = true;
      return Promise.resolve();
    }
    var params = new URLSearchParams(location.search);
    state.resetToken = params.get("reset") || "";
    var verifyFlag = params.get("verify") || "";
    var billing = params.get("billing") || "";
    var sessionId = params.get("session_id") || "";
    if (verifyFlag === "invalid") state.notice = "That verification link is invalid or expired.";
    if (billing === "cancel") state.notice = "Checkout canceled. No charge was made.";
    return fetch("/api/auth/me", { credentials: "same-origin", headers: { accept: "application/json" } }).then(function (res) {
      var type = res.headers.get("content-type") || "";
      if (type.indexOf("json") === -1) {
        state.saas = false;
        state.ready = true;
        return null;
      }
      return res.json().then(function (data) {
        if (!data || data.saas !== true) {
          state.saas = false;
          state.ready = true;
          return null;
        }
        state.saas = true;
        if (!res.ok && !data.user) {
          state.configError = data.error || "Accounts are not configured yet.";
          state.ready = true;
          return null;
        }
        state.user = data.user || null;
        if (billing === "success" && sessionId && state.user) {
          return api("/api/billing/confirm", { method: "POST", body: { sessionId: sessionId } }).catch(function (err) {
            state.notice = err.message;
            return null;
          });
        }
        return null;
      });
    }).then(function (confirmed) {
      if (confirmed && confirmed.user) state.user = confirmed.user;
      if (state.saas) history.replaceState({}, "", location.pathname);
      state.ready = true;
      if (!blocksPlay() && canSync()) return syncProgress();
      return null;
    }).catch(function () {
      state.saas = false;
      state.ready = true;
    });
  }

  function disclaimer() {
    return '<p class="disclaimer">Unofficial study aid. Not an Air Force product, not a substitute for AFH 1, and not a source the Air Force uses to write the PFE. Promotion test content is determined solely by the Air Force. Group study for the purpose of enlisted promotion testing is prohibited by DAFMAN 36-2664.</p>' +
      '<p class="disclaimer">Party-PDG multiplayer runs offline on a local network with anonymous score competition — no named roster and no shared answer key — so we treat it as competitive practice, not group study under that policy.</p>';
  }

  function note() {
    return (state.notice ? '<p class="fine">' + esc(state.notice) + "</p>" : "") +
      (state.error ? '<p class="warn">' + esc(state.error) + "</p>" : "");
  }

  function splash() {
    return '<div class="auth-wrap"><div class="sky"><div class="hazard"></div><div class="auth-card">' +
      '<p class="kicker">AFH 1 study party</p><h1>PDG PARTY</h1>' +
      "<p>Party-PDG is a living-room study game for AFH 1. Run Quiet Hours on one screen, or host a room and let phones join.</p>" +
      disclaimer() +
      '<ul class="feature-list">' +
      "<li>Quiet Hours solo desk with a light review schedule</li>" +
      "<li>Boards &amp; Brief, Lightning, and Decoy Brief</li>" +
      "<li>Flight vs Flight and SJT Brief</li>" +
      "<li>Focus rollup and achievements saved to your account</li>" +
      "<li>Optional party rooms when phones are on the same Wi-Fi</li>" +
      "</ul>" +
      '<p class="fine">$1 a month after a 30-day trial. Cancel anytime in the billing portal.</p>' +
      note() +
      '<div class="row">' +
      '<button class="btn amber" id="go-register" type="button">Register now</button>' +
      '<button class="btn" id="go-login" type="button">Log in</button>' +
      '<button class="btn ghost" id="go-demo" type="button">Try demo</button>' +
      "</div></div></div></div>";
  }

  function authCard(title, inner) {
    return '<div class="auth-wrap"><div class="sky"><div class="hazard"></div><div class="auth-card"><p class="kicker">Party-PDG</p><h2>' +
      esc(title) + "</h2>" + note() + inner + "</div></div></div>";
  }

  function registerForm() {
    return authCard("Register", '<form id="register-form" class="stack">' +
      '<label class="field">Email<input id="reg-email" name="email" type="email" autocomplete="email" required></label>' +
      '<label class="field">Username<input id="reg-username" name="username" type="text" autocomplete="username" required minlength="3" maxlength="20" pattern="[A-Za-z0-9_\\-]{3,20}" title="3–20 letters, numbers, underscores, or dashes"></label>' +
      '<p class="fine">This is the name on the scoreboard. Not your real name.</p>' +
      '<label class="field">Password<input id="reg-password" name="password" type="password" autocomplete="new-password" required></label>' +
      '<label class="field">Confirm password<input name="confirm" type="password" autocomplete="new-password" required></label>' +
      '<label class="field">Discount code (optional)<input id="reg-code" name="code" type="text" value="' + esc(state.promo) + '" autocomplete="off"></label>' +
      '<button class="btn amber" type="submit">Create account</button></form>' +
      '<p class="fine">We email a verification link. The 30-day trial starts at checkout, after the email is verified.</p>' +
      '<button class="btn ghost" id="go-login" type="button">Log in</button>' +
      '<button class="btn ghost" id="go-splash" type="button">Back</button>');
  }

  function loginForm() {
    return authCard("Log in", '<form id="login-form" class="stack">' +
      '<label class="field">Email<input name="email" type="email" autocomplete="email" required></label>' +
      '<label class="field">Password<input name="password" type="password" autocomplete="current-password" required></label>' +
      '<button class="btn amber" type="submit">Log in</button></form>' +
      '<button class="btn ghost" id="go-forgot" type="button">Forgot password</button>' +
      '<button class="btn ghost" id="go-register" type="button">Register now</button>' +
      '<button class="btn ghost" id="go-splash" type="button">Back</button>');
  }

  function forgotForm() {
    return authCard("Reset password", '<form id="forgot-form" class="stack">' +
      '<label class="field">Email<input name="email" type="email" autocomplete="email" required></label>' +
      '<button class="btn amber" type="submit">Send reset link</button></form>' +
      '<button class="btn ghost" id="go-login" type="button">Back to log in</button>');
  }

  function resetForm() {
    return authCard("Choose a new password", '<form id="reset-form" class="stack">' +
      '<label class="field">New password<input name="password" type="password" autocomplete="new-password" required></label>' +
      '<label class="field">Confirm<input name="confirm" type="password" autocomplete="new-password" required></label>' +
      '<button class="btn amber" type="submit">Save password</button></form>');
  }

  function passwordForm() {
    return authCard("Change your password", '<p>This account has to pick a new password before anything else.</p><form id="password-form" class="stack">' +
      '<label class="field">Current password<input name="current" type="password" autocomplete="current-password" required></label>' +
      '<label class="field">New password<input name="next" type="password" autocomplete="new-password" required></label>' +
      '<label class="field">Confirm<input name="confirm" type="password" autocomplete="new-password" required></label>' +
      '<button class="btn amber" type="submit">Update password</button></form>' +
      '<button class="btn ghost" id="logout-btn" type="button">Log out</button>');
  }

  function verifyForm() {
    return authCard("Check your email", '<p>We sent a verification link to <strong>' + esc(state.user && state.user.email) + "</strong>. Play stays locked until that link is opened.</p>" +
      '<button class="btn amber" id="resend-verify" type="button">Resend email</button>' +
      '<button class="btn ghost" id="logout-btn" type="button">Log out</button>');
  }

  function subscribeForm() {
    var status = (state.user && state.user.subscriptionStatus) || "none";
    var lapsed = entitlement().reason === "lapsed";
    return authCard(lapsed ? "Subscribe to keep playing" : "Start the 30-day trial",
      "<p>" + (lapsed
        ? "The trial or payment is no longer active. Subscribe for $1/month. Cancel anytime in the billing portal."
        : "Party-PDG is $1/month after a 30-day free trial. Checkout collects a card. You are not charged today unless a discount code says otherwise.") + "</p>" +
      '<form id="checkout-form" class="stack">' +
      '<label class="field">Discount code (optional)<input id="sub-code" name="code" type="text" value="' + esc(state.promo) + '" autocomplete="off"></label>' +
      '<p class="fine" id="code-summary"></p>' +
      '<button class="btn amber" type="submit">Subscribe</button></form>' +
      (state.user && state.user.hasBillingCustomer ? '<button class="btn" id="portal-btn" type="button">Manage billing</button>' : "") +
      '<button class="btn ghost" id="preview-demo" type="button">Preview the demo bank</button>' +
      '<p class="fine">Plan status: ' + esc(status) + "</p>" +
      deleteBlock() +
      '<button class="btn ghost" id="logout-btn" type="button">Log out</button>');
  }

  function deleteBlock() {
    return '<form id="delete-form" class="stack danger-box"><h3>Delete account</h3><p class="fine">This cancels an active Stripe subscription, then removes the login and wipes saved progress.</p>' +
      '<label class="field">Type your email to confirm<input name="email" type="email" autocomplete="off"></label>' +
      '<button class="btn danger" type="submit">Delete account</button></form>';
  }

  function renderGate() {
    var name = gate();
    if (name === "loading") return '<div class="auth-wrap"><div class="sky"><div class="panel"><h1>PDG PARTY</h1><p>Loading…</p></div></div></div>';
    if (name === "unavailable") {
      return authCard("Accounts are not ready", "<p>" + esc(state.configError) + "</p><p>You can still try the demo bank on this browser. Full play needs the database, Resend, and Stripe env vars from docs/SAAS.md.</p>" +
        '<button class="btn amber" id="go-demo" type="button">Try demo</button>');
    }
    if (name === "splash") return splash();
    if (name === "register") return registerForm();
    if (name === "login") return loginForm();
    if (name === "forgot") return forgotForm();
    if (name === "reset") return resetForm();
    if (name === "password") return passwordForm();
    if (name === "verify") return verifyForm();
    if (name === "disabled") return authCard("Account disabled", "<p>This login was disabled.</p>" + '<button class="btn" id="logout-btn" type="button">Log out</button>');
    if (name === "subscribe") return subscribeForm();
    return "";
  }

  function statusLine() {
    var user = state.user || {};
    var ent = entitlement();
    var who = user.username || "No username yet";
    return "<p>Signed in as <strong>" + esc(who) + "</strong> · " + esc(user.role || "user") +
      " · plan " + esc(user.subscriptionStatus || "none") + " · " + esc(ent.reason || "") + "</p>" +
      "<p class='fine'>" + esc(user.email || "") + "</p>";
  }

  function settingsHTML() {
    return '<div class="saas-panel"><p class="kicker">Account</p><h2>Settings</h2>' + note() + statusLine() +
      '<div class="row"><button class="btn" id="portal-btn" type="button">Manage billing</button>' +
      '<button class="btn amber" id="subscribe-again" type="button">Subscribe</button>' +
      '<button class="btn ghost" id="panel-close" type="button">Back to play</button></div>' +
      '<form id="username-form" class="stack"><h3>Username</h3>' +
      '<label class="field">Username<input name="username" type="text" autocomplete="username" required minlength="3" maxlength="20" pattern="[A-Za-z0-9_\\-]{3,20}" title="3–20 letters, numbers, underscores, or dashes" value="' + esc((state.user && state.user.username) || "") + '"></label>' +
      '<p class="fine">Scoreboards use this name. 3–20 letters, numbers, underscores, or dashes.</p>' +
      '<button class="btn" type="submit">Save username</button></form>' +
      '<form id="password-form" class="stack"><h3>Change password</h3>' +
      '<label class="field">Current<input name="current" type="password" autocomplete="current-password" required></label>' +
      '<label class="field">New<input name="next" type="password" autocomplete="new-password" required></label>' +
      '<label class="field">Confirm<input name="confirm" type="password" autocomplete="new-password" required></label>' +
      '<button class="btn" type="submit">Update password</button></form>' +
      deleteBlock() + "</div>";
  }

  function usersTable() {
    var rows = (state.admin && state.admin.users) || [];
    if (!rows.length) return "<p>No accounts yet.</p>";
    return '<div class="table-wrap"><table class="admin-table"><thead><tr><th>Username</th><th>Email</th><th>Verified</th><th>Plan</th><th>Role</th><th></th></tr></thead><tbody>' +
      rows.map(function (user) {
        var mine = state.user && user.id === state.user.id;
        return "<tr><td>" + esc(user.username || "—") + "</td><td>" + esc(user.email) + "</td><td>" + (user.emailVerifiedAt ? "Yes" : "No") + "</td><td>" +
          esc(user.subscriptionStatus || "none") + (user.trialEndsAt ? "<div class='fine'>trial " + esc(String(user.trialEndsAt).slice(0, 10)) + "</div>" : "") +
          "</td><td>" + esc(user.role) + (user.disabledAt ? " · disabled" : "") + "</td><td>" +
          (mine ? "<span class='fine'>you</span>" : (
            '<button class="btn small" type="button" data-user="' + esc(user.id) + '" data-act="' + (user.disabledAt ? "enable" : "disable") + '">' +
            (user.disabledAt ? "Enable" : "Disable") + '</button> <button class="btn small danger" type="button" data-user="' + esc(user.id) + '" data-act="delete">Delete</button>'
          )) + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }

  function codesTable() {
    var rows = (state.admin && state.admin.codes) || [];
    if (!rows.length) return "<p>No discount codes yet.</p>";
    return rows.map(function (code) {
      var who = (code.redemptions || []).map(function (item) {
        return "<li>" + esc(item.email) + (item.revoked ? " · revoked" : "") + "</li>";
      }).join("") || "<li>No redemptions yet.</li>";
      return '<article class="code-card"><header><strong>' + esc(code.code) + "</strong> · " + esc(code.kind) +
        (code.active ? "" : " · disabled") + "</header><p>" + esc(code.summary) + "</p>" +
        "<p class='fine'>Max " + esc(code.maxRedemptions || "unlimited") + " · expires " + esc(code.expiresAt ? String(code.expiresAt).slice(0, 10) : "never") +
        (code.notes ? " · " + esc(code.notes) : "") + "</p>" +
        "<details><summary>" + (code.redemptions || []).length + " tracked redemptions</summary><ul>" + who + "</ul></details>" +
        '<div class="row"><button class="btn small" type="button" data-code="' + esc(code.id) + '" data-act="' + (code.active ? "disable" : "enable") + '">' +
        (code.active ? "Disable" : "Enable") + '</button><button class="btn small danger" type="button" data-code="' + esc(code.id) + '" data-act="delete">Delete</button></div></article>';
    }).join("");
  }

  function codeForm() {
    return '<form id="code-form" class="stack"><h3>New code</h3>' +
      '<label class="field">Code<input name="code" type="text" required maxlength="40" autocomplete="off"></label>' +
      '<label class="field">Type<select name="kind" id="code-kind"><option value="comp">Free / 100% off</option><option value="percent">Percent off</option><option value="amount">Amount off the $1 price</option></select></label>' +
      '<label class="field" id="percent-field" hidden>Percent off<input name="percentOff" type="number" min="1" max="100" step="1"></label>' +
      '<label class="field" id="amount-field" hidden>Dollars off (0.50 means they pay $0.50)<input name="amountOff" type="text" inputmode="decimal" placeholder="0.50"></label>' +
      '<label class="field">Months (blank = forever)<input name="months" type="number" min="1" max="36" step="1"></label>' +
      '<label class="field">Max redemptions (optional)<input name="maxRedemptions" type="number" min="1" step="1"></label>' +
      '<label class="field">Expires (optional)<input name="expiresAt" type="datetime-local"></label>' +
      '<label class="field">Notes<input name="notes" type="text" maxlength="500"></label>' +
      '<button class="btn amber" type="submit">Create code</button></form>';
  }

  function adminHTML() {
    var loading = state.admin && state.admin.loading;
    var tab = state.adminTab;
    return '<div class="saas-panel"><p class="kicker">Admin</p><h2>Members and codes</h2>' + note() +
      (state.admin && state.admin.error ? '<p class="warn">' + esc(state.admin.error) + "</p>" : "") +
      '<div class="row"><button class="btn' + (tab === "users" ? " amber" : "") + '" id="tab-users" type="button">Users</button>' +
      '<button class="btn' + (tab === "codes" ? " amber" : "") + '" id="tab-codes" type="button">Discount codes</button>' +
      '<button class="btn ghost" id="panel-close" type="button">Back to play</button></div>' +
      (loading ? "<p>Loading…</p>" : (tab === "users" ? usersTable() : "<p class='fine'>" + esc((state.admin && state.admin.note) || "") + "</p>" + codeForm() + codesTable())) +
      "</div>";
  }

  function panelHTML() {
    if (!state.saas || blocksPlay() || !state.panel) return "";
    if (state.panel === "admin") {
      if (!state.user || state.user.role !== "admin") return "";
      return adminHTML();
    }
    if (state.panel === "settings") return settingsHTML();
    return "";
  }

  function chromeHTML() {
    if (!state.saas || blocksPlay()) return "";
    if (demoOnly()) {
      return '<button class="icon-btn" id="demo-leave" type="button">Leave demo</button>' +
        '<button class="icon-btn" id="auth-login" type="button">Log in</button>' +
        '<button class="icon-btn" id="auth-register" type="button">Register</button>';
    }
    var html = state.user && state.user.username ? '<span class="who">' + esc(state.user.username) + "</span>" : "";
    if (state.user && state.user.role === "admin") html += '<button class="icon-btn" id="admin-open" type="button">Admin</button>';
    html += '<button class="icon-btn" id="account-open" type="button">Account</button>';
    html += '<button class="icon-btn" id="logout-btn" type="button">Log out</button>';
    return html;
  }

  function rememberPromo(code) {
    state.promo = String(code || "").trim();
    try { sessionStorage.setItem("pdg-promo", state.promo); } catch (e) { /* ignore */ }
  }

  function startDemo() {
    state.guest = !state.user;
    state.preview = !!state.user;
    state.panel = "";
    try { sessionStorage.setItem("pdg-guest", state.guest ? "1" : "0"); } catch (e) { /* ignore */ }
    if (PDG.enterDemo) PDG.enterDemo();
    else request();
  }

  function leaveDemo() {
    state.guest = false;
    state.preview = false;
    try { sessionStorage.removeItem("pdg-guest"); } catch (e) { /* ignore */ }
    state.authScreen = "splash";
    request();
  }

  function logout() {
    api("/api/auth/logout", { method: "POST", body: {} }).catch(function () { /* still clear */ }).then(function () {
      state.user = null;
      state.panel = "";
      state.guest = false;
      state.preview = false;
      state.authScreen = "splash";
      request();
    });
  }

  function goCheckout(code) {
    rememberPromo(code);
    var body = {};
    if (code) body.code = code;
    var pending = code ? api("/api/billing/validate-code", { method: "POST", body: { code: code } }) : Promise.resolve(null);
    return pending.then(function (info) {
      var slot = document.getElementById("code-summary");
      if (slot && info && info.summary) slot.textContent = info.summary;
      return api("/api/billing/checkout", { method: "POST", body: body });
    }).then(function (data) {
      if (data.url) location.href = data.url;
    });
  }

  function openPortal() {
    return api("/api/billing/portal", { method: "POST", body: {} }).then(function (data) {
      if (data.url) location.href = data.url;
    });
  }

  function submitPassword(data) {
    return api("/api/auth/password", { method: "POST", body: {
      current: data.get("current"), next: data.get("next"), confirm: data.get("confirm")
    } }).then(function (res) { setUser(res.user); state.panel = ""; });
  }

  function submitDelete(data) {
    return api("/api/auth/delete", { method: "POST", body: { email: data.get("email") } }).then(function () {
      state.user = null;
      state.panel = "";
      state.authScreen = "splash";
      request();
    });
  }

  function loadAdmin() {
    state.admin = { loading: true, users: [], codes: [], error: "", note: "" };
    request();
    Promise.all([api("/api/admin/users"), api("/api/admin/codes")]).then(function (parts) {
      state.admin = {
        loading: false,
        users: parts[0].users || [],
        codes: parts[1].codes || [],
        note: parts[1].note || "",
        error: ""
      };
      request();
    }).catch(function (err) {
      state.admin = { loading: false, users: [], codes: [], error: err.message, note: "" };
      request();
    });
  }

  function catchErr(err) {
    state.error = err.message || "Request failed.";
    request();
  }

  function bindShared() {
    var map = {
      "go-register": function () { state.authScreen = "register"; state.error = ""; request(); },
      "go-login": function () { state.authScreen = "login"; state.error = ""; request(); },
      "go-splash": function () { state.authScreen = "splash"; state.error = ""; request(); },
      "go-forgot": function () { state.authScreen = "forgot"; state.error = ""; request(); },
      "go-demo": startDemo,
      "preview-demo": startDemo,
      "demo-leave": leaveDemo,
      "auth-login": function () { leaveDemo(); state.authScreen = "login"; request(); },
      "auth-register": function () { leaveDemo(); state.authScreen = "register"; request(); },
      "logout-btn": logout,
      "resend-verify": function () { api("/api/auth/resend-verification", { method: "POST", body: {} }).then(function () { state.notice = "Verification email sent."; state.error = ""; request(); }).catch(catchErr); },
      "portal-btn": function () { openPortal().catch(catchErr); },
      "subscribe-again": function () { goCheckout(state.promo).catch(catchErr); },
      "panel-close": function () { state.panel = ""; state.error = ""; request(); },
      "account-open": function () { state.panel = "settings"; state.error = ""; request(); },
      "admin-open": function () { state.panel = "admin"; state.adminTab = "users"; loadAdmin(); },
      "tab-users": function () { state.adminTab = "users"; request(); },
      "tab-codes": function () { state.adminTab = "codes"; request(); }
    };
    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("click", function (ev) { ev.preventDefault(); map[id](); });
    });
    var register = document.getElementById("register-form");
    if (register) register.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var data = new FormData(register);
      rememberPromo(data.get("code"));
      var created = api("/api/auth/register", { method: "POST", body: {
        email: data.get("email"), username: data.get("username"), password: data.get("password"), confirm: data.get("confirm")
      } });
      created.then(function (res) {
        state.notice = res.emailSent ? "Account created. Check your email." : "Account created, but the verification email did not send. Use Resend on the next screen.";
        setUser(res.user);
      }).catch(catchErr);
    });
    var login = document.getElementById("login-form");
    if (login) login.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var data = new FormData(login);
      api("/api/auth/login", { method: "POST", body: { email: data.get("email"), password: data.get("password") } })
        .then(function (res) { setUser(res.user); }).catch(catchErr);
    });
    var forgot = document.getElementById("forgot-form");
    if (forgot) forgot.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var data = new FormData(forgot);
      api("/api/auth/forgot", { method: "POST", body: { email: data.get("email") } }).then(function () {
        state.notice = "If that account can receive mail, a link is on the way.";
        state.authScreen = "login";
        state.error = "";
        request();
      }).catch(catchErr);
    });
    var reset = document.getElementById("reset-form");
    if (reset) reset.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var data = new FormData(reset);
      api("/api/auth/reset", { method: "POST", body: { token: state.resetToken, password: data.get("password"), confirm: data.get("confirm") } })
        .then(function (res) { state.resetToken = ""; setUser(res.user); }).catch(catchErr);
    });
    var username = document.getElementById("username-form");
    if (username) username.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var data = new FormData(username);
      api("/api/auth/username", { method: "POST", body: { username: data.get("username") } }).then(function (res) {
        state.notice = "Username saved.";
        state.error = "";
        setUser(res.user);
      }).catch(catchErr);
    });
    var password = document.getElementById("password-form");
    if (password) password.addEventListener("submit", function (ev) {
      ev.preventDefault();
      submitPassword(new FormData(password)).catch(catchErr);
    });
    var del = document.getElementById("delete-form");
    if (del) del.addEventListener("submit", function (ev) {
      ev.preventDefault();
      submitDelete(new FormData(del)).catch(catchErr);
    });
    var checkout = document.getElementById("checkout-form");
    if (checkout) checkout.addEventListener("submit", function (ev) {
      ev.preventDefault();
      goCheckout(String(new FormData(checkout).get("code") || "").trim()).catch(catchErr);
    });
    var kind = document.getElementById("code-kind");
    function syncKind() {
      if (!kind) return;
      var percent = document.getElementById("percent-field");
      var amount = document.getElementById("amount-field");
      if (percent) percent.hidden = kind.value !== "percent";
      if (amount) amount.hidden = kind.value !== "amount";
    }
    if (kind) { kind.addEventListener("change", syncKind); syncKind(); }
    var codeFormEl = document.getElementById("code-form");
    if (codeFormEl) codeFormEl.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var data = new FormData(codeFormEl);
      api("/api/admin/codes", { method: "POST", body: {
        code: data.get("code"),
        kind: data.get("kind"),
        percentOff: data.get("percentOff"),
        amountOff: data.get("amountOff"),
        months: data.get("months"),
        maxRedemptions: data.get("maxRedemptions"),
        expiresAt: data.get("expiresAt") ? new Date(data.get("expiresAt")).toISOString() : "",
        notes: data.get("notes"),
        active: true
      } }).then(function () { state.notice = "Code created in Stripe."; loadAdmin(); }).catch(catchErr);
    });
    document.querySelectorAll("[data-user]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var act = btn.getAttribute("data-act");
        if (act === "delete" && !window.confirm("Delete this account and cancel its subscription?")) return;
        api("/api/admin/users", { method: "POST", body: { id: btn.getAttribute("data-user"), action: act } })
          .then(loadAdmin).catch(catchErr);
      });
    });
    document.querySelectorAll("[data-code]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var act = btn.getAttribute("data-act");
        if (act === "delete" && !window.confirm("Delete this code? Free comps will have their subscriptions canceled.")) return;
        api("/api/admin/codes?action=1", { method: "POST", body: { id: btn.getAttribute("data-code"), action: act } })
          .then(function (res) {
            if (res.revokeFailures && res.revokeFailures.length) state.notice = "Some comps could not be canceled: " + res.revokeFailures.join(", ");
            loadAdmin();
          }).catch(catchErr);
      });
    });
  }

  PDG.account = {
    boot: boot,
    blocksPlay: blocksPlay,
    demoOnly: demoOnly,
    saas: false,
    displayName: function () {
      return (state.user && state.user.username) || "";
    },
    viewKey: function () {
      var name = state.user && state.user.username ? state.user.username : "";
      return [gate(), state.panel, state.adminTab, state.guest ? "g" : "", state.preview ? "p" : "", state.error, state.notice, name, state.admin && state.admin.loading ? "1" : "0"].join("|");
    },
    renderGate: renderGate,
    bindGate: bindShared,
    panelHTML: panelHTML,
    bindPanel: bindShared,
    chromeHTML: chromeHTML,
    pullProgress: syncProgress
  };

  Object.defineProperty(PDG.account, "saas", {
    get: function () { return state.saas; }
  });
})();
