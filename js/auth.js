// Shared by every page: connects to member accounts and updates the "Sign in" link.
(function () {
  "use strict";
  var cfg = window.MYCELINK || {};
  var api = { client: null, session: null, log: function () {} };
  window.MycelinkAuth = api;

  var ok = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(cfg.supabaseUrl || "") && cfg.supabaseKey && window.supabase;
  if (!ok) return; // accounts not switched on: the Sign in link stays hidden

  var client = api.client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
  var links = document.querySelectorAll("[data-account]");

  function paint() {
    links.forEach(function (a) {
      a.hidden = false;
      a.textContent = api.session ? "Your account" : "Sign in";
    });
  }

  // Records which tool a signed-in member opened, for the admin view.
  // The same thing is not recorded twice within a minute.
  var recent = {};
  api.log = function (tool, detail) {
    if (!api.session) return;
    detail = detail ? String(detail).slice(0, 160) : null;
    var key = tool + "|" + (detail || "");
    if (recent[key] && Date.now() - recent[key] < 60000) return;
    recent[key] = Date.now();
    client.from("activity").insert({ tool: tool, detail: detail }).then(function () {}, function () {});
  };

  client.auth.onAuthStateChange(function (event, session) {
    api.session = session;
    paint();
    // Other scripts listen for this. Sent on the next tick so they can safely call the database.
    setTimeout(function () {
      document.dispatchEvent(new CustomEvent("mycelink:auth", { detail: { event: event, session: session } }));
    }, 0);
  });
})();
