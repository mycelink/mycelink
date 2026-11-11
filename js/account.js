// The account page: sign in, create an account, reset a password, sign out.
(function () {
  "use strict";
  var auth = window.MycelinkAuth || {};
  var client = auth.client;
  function $(id) { return document.getElementById(id); }

  var views = ["view-auth", "view-reset", "view-member", "view-offline"];
  function showView(id) { views.forEach(function (v) { $(v).hidden = v !== id; }); }
  function say(text, kind) {
    var s = $("acct-status");
    s.textContent = text || "";
    s.className = "notice" + (kind ? " " + kind : "");
    s.hidden = !text;
  }
  function busy(form, on) {
    Array.prototype.forEach.call(form.querySelectorAll("button, input"), function (n) { n.disabled = on; });
  }
  // Turns the service's messages into plain words.
  function plain(error) {
    var m = (error && error.message) || "";
    if (/invalid login credentials/i.test(m)) return "That email and password don't match. Check them and try again.";
    if (/email not confirmed/i.test(m)) return "Please click the link in the email we sent you, then sign in.";
    if (/already registered|already been registered/i.test(m)) return "There is already an account with that email. Try signing in.";
    if (/password/i.test(m) && /(short|least|weak)/i.test(m)) return "Please choose a longer password: at least 8 characters.";
    if (/rate limit|too many/i.test(m)) return "Too many tries. Please wait a minute and try again.";
    if (/fetch|network/i.test(m)) return "Could not reach the server. Check your connection and try again.";
    return m || "Something went wrong. Please try again.";
  }
  var here = location.origin + location.pathname;

  if (!client) { showView("view-offline"); say(""); return; }

  // ---------- switch between "Sign in" and "Create account" ----------
  function mode(name) {
    $("form-signin").hidden = name !== "signin";
    $("form-signup").hidden = name !== "signup";
    $("mode-signin").setAttribute("aria-pressed", name === "signin" ? "true" : "false");
    $("mode-signup").setAttribute("aria-pressed", name === "signup" ? "true" : "false");
    say("");
  }
  $("mode-signin").addEventListener("click", function () { mode("signin"); });
  $("mode-signup").addEventListener("click", function () { mode("signup"); });

  // ---------- sign in ----------
  $("form-signin").addEventListener("submit", function (e) {
    e.preventDefault();
    var form = e.target;
    busy(form, true); say("Signing in…");
    client.auth.signInWithPassword({ email: $("in-email").value.trim(), password: $("in-password").value })
      .then(function (r) { busy(form, false); if (r.error) say(plain(r.error), "bad"); else say(""); });
  });

  $("forgot").addEventListener("click", function () {
    var email = $("in-email").value.trim();
    if (!email) { say("Type your email in the box first, then press “Forgot password” again.", "bad"); $("in-email").focus(); return; }
    say("Sending…");
    client.auth.resetPasswordForEmail(email, { redirectTo: here }).then(function (r) {
      if (r.error) say(plain(r.error), "bad");
      else say("If there is an account for " + email + ", a reset link is on its way. Check your inbox.", "good");
    });
  });

  // ---------- create account ----------
  $("form-signup").addEventListener("submit", function (e) {
    e.preventDefault();
    var form = e.target;
    if (!$("up-agree").checked) { say("Please tick the box to say you have read the Terms and Privacy pages.", "bad"); return; }
    if ($("up-password").value.length < 8) { say("Please choose a longer password: at least 8 characters.", "bad"); return; }
    busy(form, true); say("Creating your account…");
    client.auth.signUp({
      email: $("up-email").value.trim(),
      password: $("up-password").value,
      options: { data: { display_name: $("up-name").value.trim().slice(0, 60) }, emailRedirectTo: here }
    }).then(function (r) {
      busy(form, false);
      if (r.error) { say(plain(r.error), "bad"); return; }
      if (!r.data.session) {
        form.reset();
        say("Almost there. We sent a link to your email. Click it to finish creating your account.", "good");
      }
    });
  });

  // ---------- choose a new password (after clicking a reset link) ----------
  $("form-reset").addEventListener("submit", function (e) {
    e.preventDefault();
    var form = e.target;
    if ($("new-password").value.length < 8) { say("Please choose a longer password: at least 8 characters.", "bad"); return; }
    busy(form, true); say("Saving…");
    client.auth.updateUser({ password: $("new-password").value }).then(function (r) {
      busy(form, false);
      if (r.error) { say(plain(r.error), "bad"); return; }
      form.reset(); recovering = false; showMember(auth.session);
      say("Your new password is saved.", "good");
    });
  });

  $("sign-out").addEventListener("click", function () {
    say("Signing out…");
    client.auth.signOut().then(function () { say("You are signed out.", "good"); });
  });

  // ---------- signed-in view ----------
  function showMember(session) {
    showView("view-member");
    var user = session.user;
    $("me-email").textContent = user.email || "";
    $("me-name").textContent = (user.user_metadata && user.user_metadata.display_name) || "Not set";
    $("me-since").textContent = new Date(user.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    client.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", user.id).then(function () {}, function () {});
  }

  var recovering = false;
  var settled = false;
  // Safety net: if the sign-in check is slow, show the form anyway after a few seconds.
  setTimeout(function () { if (!settled) { showView("view-auth"); say(""); } }, 4000);
  document.addEventListener("mycelink:auth", function (e) {
    settled = true;
    var event = e.detail.event, session = e.detail.session;
    if (event === "PASSWORD_RECOVERY") { recovering = true; showView("view-reset"); say("Choose a new password."); return; }
    if (recovering) return;
    if (session) { showMember(session); if (event === "SIGNED_IN") say(""); }
    else { showView("view-auth"); if (event === "INITIAL_SESSION") say(""); }
  });
})();
