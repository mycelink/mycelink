// Shared by every page: fills in the social links from js/config.js.
(function () {
  var socials = (window.MYCELINK && window.MYCELINK.socials) || {};
  document.querySelectorAll("[data-social]").forEach(function (el) {
    var url = socials[el.getAttribute("data-social")];
    if (url && /^https:\/\//.test(url)) {
      el.href = url;
      el.target = "_blank";
      el.rel = "noopener noreferrer";
    } else {
      // No link yet: show it as "coming soon" instead of a dead button.
      var off = document.createElement("span");
      off.className = el.className + " social-off";
      off.textContent = el.textContent + " · link soon";
      el.replaceWith(off);
    }
  });
})();
