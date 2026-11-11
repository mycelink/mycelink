// Mycelink dashboard.
// One "pane" shows one tool. Split view puts two panes side by side.
// A tool is only loaded the first time it is opened in a pane.
(function () {
  "use strict";

  var cfg = (window.MYCELINK && window.MYCELINK.defaults) || {};
  var TOOLS = [
    { id: "tradingview", name: "TradingView" },
    { id: "dexscreener", name: "DexScreener" },
    { id: "coinmarketcap", name: "CoinMarketCap" },
    { id: "checkonchain", name: "Checkonchain" }
  ];
  var IDS = TOOLS.map(function (t) { return t.id; });
  var panes = {};
  var split = false;

  // Remembering choices is a nice-to-have, so storage errors are ignored.
  function remember(key, value) { try { localStorage.setItem("mycelink." + key, value); } catch (e) {} }
  function recall(key) { try { return localStorage.getItem("mycelink." + key); } catch (e) { return null; } }

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") n.textContent = attrs[k];
      else if (k === "class") n.className = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  function head(title, desc, form) {
    return el("div", { class: "panel-head" }, [
      el("div", {}, [el("h2", { text: title }), el("p", { text: desc })]),
      form
    ]);
  }

  function searchForm(id, label, placeholder, button) {
    var input = el("input", { id: id, "data-search": "", autocomplete: "off", spellcheck: "false", placeholder: placeholder });
    var form = el("form", { class: "search" }, [
      el("label", { for: id, text: label }),
      input,
      el("button", { class: "btn btn-primary", type: "submit", text: button })
    ]);
    return { form: form, input: input };
  }

  function fallback(text, linkText, href) {
    return el("div", { class: "fallback" }, [
      el("p", { text: text }),
      el("a", { class: "btn btn-primary", href: href, target: "_blank", rel: "noopener noreferrer", text: linkText })
    ]);
  }

  // ---------- TradingView (official embed widget) ----------
  function loadTradingView(frame, symbol) {
    frame.textContent = "";
    var script = el("script", { src: "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js", async: "" });
    script.text = JSON.stringify({
      autosize: true,
      symbol: symbol,
      interval: "D",
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      backgroundColor: "#081d29",
      gridColor: "rgba(18, 48, 58, 0.6)",
      allow_symbol_change: true,
      hide_side_toolbar: false,
      calendar: false,
      support_host: "https://www.tradingview.com"
    });
    frame.appendChild(el("div", { class: "tradingview-widget-container" }, [
      el("div", { class: "tradingview-widget-container__widget" }),
      script
    ]));
  }

  function cleanSymbol(raw) {
    var s = String(raw || "").trim().toUpperCase().replace(/[^A-Z0-9:._!\-\/]/g, "").slice(0, 40);
    return s || null;
  }

  function buildTradingView(pane) {
    var key = "tv" + pane.suffix;
    var fallbackSymbol = pane.key === "a" ? cfg.tradingviewSymbol : "BINANCE:ETHUSDT";
    var symbol = cleanSymbol(recall(key)) || cleanSymbol(fallbackSymbol) || "BINANCE:BTCUSDT";
    var s = searchForm("tv-symbol-" + pane.key, "Symbol", "e.g. BINANCE:ETHUSDT", "Show");
    var frame = el("div", { class: "frame" });
    s.input.value = symbol;
    s.form.addEventListener("submit", function (e) {
      e.preventDefault();
      var next = cleanSymbol(s.input.value);
      if (!next) return;
      s.input.value = next;
      remember(key, next);
      loadTradingView(frame, next);
    });
    loadTradingView(frame, symbol);
    return [head("TradingView", "Full charting. Type a symbol to change the chart.", s.form), frame];
  }

  // ---------- DexScreener (public search API + official chart embed) ----------
  function money(n) {
    n = Number(n);
    if (!isFinite(n)) return "–";
    if (n >= 1) return "$" + n.toLocaleString("en-GB", { maximumFractionDigits: 2 });
    return "$" + n.toPrecision(3);
  }

  function buildDexScreener(pane) {
    var key = "dex" + pane.suffix;
    var s = searchForm("dex-query-" + pane.key, "Token", "name, symbol or address", "Search");
    var status = el("p", { class: "status", role: "status" });
    var list = el("div", { class: "results" });
    var frame = el("div", { class: "frame" });

    function showPair(pair, button) {
      Array.prototype.forEach.call(list.children, function (b) { b.setAttribute("aria-pressed", "false"); });
      button.setAttribute("aria-pressed", "true");
      frame.textContent = "";
      // Only ever embed real dexscreener.com pages, whatever the API sends back.
      var url;
      try { url = new URL(pair.url); } catch (e) { return; }
      if (url.protocol !== "https:" || url.hostname !== "dexscreener.com") return;
      url.search = "?embed=1&theme=dark&trades=0&info=0";
      frame.appendChild(el("iframe", { src: url.toString(), title: "DexScreener chart", loading: "lazy" }));
    }

    function search(query) {
      status.textContent = "Searching DexScreener…";
      list.textContent = "";
      fetch("https://api.dexscreener.com/latest/dex/search?q=" + encodeURIComponent(query))
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(function (data) {
          var pairs = (data && Array.isArray(data.pairs) ? data.pairs : [])
            .filter(function (p) { return p && p.url && p.baseToken && p.quoteToken; })
            .sort(function (a, b) { return ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0); })
            .slice(0, 8);
          if (!pairs.length) { status.textContent = "No pairs found for “" + query + "”. Try another name or paste a token address."; return; }
          status.textContent = "Top " + pairs.length + " pairs by liquidity. Pick one:";
          pairs.forEach(function (p, i) {
            var change = p.priceChange ? Number(p.priceChange.h24) : NaN;
            var price = el("small", { text: money(p.priceUsd) + (isFinite(change) ? "  " + (change >= 0 ? "▲ +" : "▼ ") + change.toFixed(2) + "% 24h" : "") });
            if (isFinite(change)) price.className = change >= 0 ? "up" : "down";
            var b = el("button", { type: "button", class: "result", "aria-pressed": "false" }, [
              el("b", { text: p.baseToken.symbol + " / " + p.quoteToken.symbol }),
              el("small", { text: (p.chainId || "?") + " · " + (p.dexId || "?") }),
              price
            ]);
            b.addEventListener("click", function () { showPair(p, b); });
            list.appendChild(b);
            if (i === 0) showPair(p, b);
          });
        })
        .catch(function () {
          status.textContent = "Could not reach DexScreener just now. Check your connection and press Search again.";
        });
    }

    s.form.addEventListener("submit", function (e) {
      e.preventDefault();
      var q = s.input.value.trim().slice(0, 80);
      if (!q) return;
      remember(key, q);
      frame.textContent = "";
      search(q);
    });

    var first = recall(key) || (pane.key === "a" ? cfg.dexSearch : "ETH") || "SOL";
    s.input.value = first;
    search(first);
    return [head("DexScreener", "Search a token, then pick a pair to see its live chart.", s.form), status, list, frame];
  }

  // ---------- CoinMarketCap (their price-strip widget) ----------
  function buildCoinMarketCap() {
    var kids = [head("CoinMarketCap", "Prices and rankings across coins.")];
    // Their widget can only appear once on a page.
    if (!document.getElementById("coinmarketcap-widget-marquee")) {
      var widget = el("div", {
        id: "coinmarketcap-widget-marquee",
        coins: String(cfg.cmcCoins || "1,1027").replace(/[^0-9,]/g, ""),
        currency: "USD", theme: "dark", transparent: "true", "show-symbol-logo": "true"
      });
      kids.push(el("div", { class: "cmc-strip" }, [
        widget,
        el("script", { src: "https://files.coinmarketcap.com/static/widget/coinMarquee.js", async: "" })
      ]));
    }
    kids.push(fallback(
      "CoinMarketCap only lets other sites show its small price strip, not its full pages. Open the full site for rankings and coin pages.",
      "Open CoinMarketCap", "https://coinmarketcap.com/"));
    return kids;
  }

  // ---------- Checkonchain ----------
  function buildCheckonchain() {
    return [
      head("Checkonchain", "On-chain Bitcoin charts and cycle data."),
      fallback(
        "If the charts below stay blank, Checkonchain is not allowing itself to be shown inside other sites. Use the button to open it instead.",
        "Open Checkonchain", "https://charts.checkonchain.com/"),
      el("div", { class: "frame" }, [
        el("iframe", { src: "https://charts.checkonchain.com/", title: "Checkonchain charts", loading: "lazy", referrerpolicy: "no-referrer" })
      ])
    ];
  }

  var BUILDERS = {
    tradingview: buildTradingView,
    dexscreener: buildDexScreener,
    coinmarketcap: buildCoinMarketCap,
    checkonchain: buildCheckonchain
  };

  // ---------- panes ----------
  function createPane(key, label) {
    var pane = { key: key, suffix: key === "a" ? "" : "B", tool: null, tabs: {}, sections: {} };
    var tablist = el("div", { class: "tabs", role: "tablist", "aria-label": label + " tool" });
    TOOLS.forEach(function (t, i) {
      var tab = el("button", {
        class: "tab", type: "button", role: "tab",
        id: "tab-" + key + "-" + t.id, "aria-controls": "panel-" + key + "-" + t.id, text: t.name
      });
      if (key === "a") tab.appendChild(el("kbd", { text: String(i + 1) }));
      tab.addEventListener("click", function () { show(pane, t.id); });
      pane.tabs[t.id] = tab;
      tablist.appendChild(tab);
    });
    tablist.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      var i = (IDS.indexOf(pane.tool) + (e.key === "ArrowRight" ? 1 : IDS.length - 1)) % IDS.length;
      show(pane, IDS[i], true);
      e.preventDefault();
    });
    pane.body = el("div", {});
    pane.root = el("section", { class: "pane", "aria-label": label }, [tablist, pane.body]);
    document.getElementById("panes").appendChild(pane.root);
    panes[key] = pane;
    return pane;
  }

  function show(pane, tool, focusTab) {
    if (IDS.indexOf(tool) === -1) tool = IDS[0];
    pane.tool = tool;
    IDS.forEach(function (id) {
      var on = id === tool;
      pane.tabs[id].setAttribute("aria-selected", on ? "true" : "false");
      pane.tabs[id].tabIndex = on ? 0 : -1;
      if (pane.sections[id]) pane.sections[id].hidden = !on;
    });
    if (!pane.sections[tool]) {
      pane.sections[tool] = el("div", {
        class: "panel", role: "tabpanel",
        id: "panel-" + pane.key + "-" + tool, "aria-labelledby": "tab-" + pane.key + "-" + tool
      }, BUILDERS[tool](pane));
      pane.body.appendChild(pane.sections[tool]);
    }
    if (focusTab) pane.tabs[tool].focus();
    remember("tab" + pane.suffix, tool);
    if (pane.key === "a" && location.hash.slice(1) !== tool) history.replaceState(null, "", "#" + tool);
  }

  // ---------- split view ----------
  var splitButton = document.getElementById("split-toggle");
  var hint = document.getElementById("hint");

  function setSplit(on) {
    split = on;
    if (on && !panes.b) {
      var other = IDS.filter(function (id) { return id !== panes.a.tool; })[0];
      show(createPane("b", "Right side"), recall("tabB") || other);
    }
    if (panes.b) panes.b.root.hidden = !on;
    document.getElementById("panes").classList.toggle("is-split", on);
    document.body.classList.toggle("split-on", on);
    splitButton.setAttribute("aria-pressed", on ? "true" : "false");
    splitButton.lastChild.textContent = on ? "Single view" : "Split view";
    hint.textContent = on
      ? "Press 1 to 4 for the left side, Shift and 1 to 4 for the right, / to search, S for single view"
      : "Press 1 to 4 to switch tool, / to search, S for split view";
    remember("split", on ? "1" : "0");
  }

  splitButton.addEventListener("click", function () { setSplit(!split); });

  // ---------- keyboard ----------
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable) return;
    var digit = /^Digit([1-4])$/.exec(e.code || "");
    if (digit) {
      var pane = e.shiftKey && split ? panes.b : panes.a;
      show(pane, IDS[Number(digit[1]) - 1], true);
      e.preventDefault();
      return;
    }
    if (e.key === "s" || e.key === "S") { setSplit(!split); return; }
    if (e.key === "/") {
      var inB = split && panes.b.root.contains(document.activeElement);
      var p = inB ? panes.b : panes.a;
      var box = p.sections[p.tool].querySelector("[data-search]");
      if (box) { box.focus(); box.select(); e.preventDefault(); }
    }
  });

  window.addEventListener("hashchange", function () { show(panes.a, location.hash.slice(1)); });

  show(createPane("a", "Left side"), location.hash.slice(1) || recall("tab") || IDS[0]);
  setSplit(recall("split") === "1");
})();
