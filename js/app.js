// Mycelink dashboard: four tools as tabs. Each tool only loads the first time it is opened.
(function () {
  "use strict";

  var cfg = (window.MYCELINK && window.MYCELINK.defaults) || {};
  var TOOLS = ["tradingview", "dexscreener", "coinmarketcap", "checkonchain"];
  var loaded = {};

  function $(id) { return document.getElementById(id); }

  // Remembering the last tab is a nice-to-have, so storage errors are ignored.
  function remember(key, value) { try { localStorage.setItem("mycelink." + key, value); } catch (e) {} }
  function recall(key) { try { return localStorage.getItem("mycelink." + key); } catch (e) { return null; } }

  // ---------- tabs ----------
  function show(tool, focusTab) {
    if (TOOLS.indexOf(tool) === -1) tool = TOOLS[0];
    TOOLS.forEach(function (t) {
      var on = t === tool;
      var tab = $("tab-" + t);
      tab.setAttribute("aria-selected", on ? "true" : "false");
      tab.tabIndex = on ? 0 : -1;
      $("panel-" + t).hidden = !on;
      if (on && focusTab) tab.focus();
    });
    if (!loaded[tool]) { loaded[tool] = true; LOADERS[tool](); }
    remember("tab", tool);
    if (location.hash.slice(1) !== tool) history.replaceState(null, "", "#" + tool);
  }

  function current() {
    for (var i = 0; i < TOOLS.length; i++) if (!$("panel-" + TOOLS[i]).hidden) return TOOLS[i];
    return TOOLS[0];
  }

  // ---------- TradingView (official embed widget) ----------
  function loadTradingView(symbol) {
    var frame = $("tv-frame");
    frame.textContent = "";
    var box = document.createElement("div");
    box.className = "tradingview-widget-container";
    var inner = document.createElement("div");
    inner.className = "tradingview-widget-container__widget";
    var script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
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
    box.appendChild(inner);
    box.appendChild(script);
    frame.appendChild(box);
  }

  function cleanSymbol(raw) {
    var s = String(raw || "").trim().toUpperCase().replace(/[^A-Z0-9:._!\-\/]/g, "").slice(0, 40);
    return s || null;
  }

  // ---------- DexScreener (public search API + official chart embed) ----------
  function money(n) {
    n = Number(n);
    if (!isFinite(n)) return "–";
    if (n >= 1) return "$" + n.toLocaleString("en-GB", { maximumFractionDigits: 2 });
    return "$" + n.toPrecision(3);
  }

  function showPair(pair, button) {
    document.querySelectorAll("#dex-results .result").forEach(function (b) { b.setAttribute("aria-pressed", "false"); });
    if (button) button.setAttribute("aria-pressed", "true");
    var frame = $("dex-frame");
    frame.textContent = "";
    // Only ever embed real dexscreener.com pages, whatever the API sends back.
    var url;
    try { url = new URL(pair.url); } catch (e) { return; }
    if (url.protocol !== "https:" || url.hostname !== "dexscreener.com") return;
    url.search = "?embed=1&theme=dark&trades=0&info=0";
    var iframe = document.createElement("iframe");
    iframe.src = url.toString();
    iframe.title = "DexScreener chart";
    iframe.loading = "lazy";
    frame.appendChild(iframe);
  }

  function searchDex(query) {
    var status = $("dex-status");
    var list = $("dex-results");
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
          var b = document.createElement("button");
          b.type = "button";
          b.className = "result";
          b.setAttribute("aria-pressed", "false");
          var name = document.createElement("b");
          name.textContent = p.baseToken.symbol + " / " + p.quoteToken.symbol;
          var where = document.createElement("small");
          where.textContent = (p.chainId || "?") + " · " + (p.dexId || "?");
          var price = document.createElement("small");
          var change = p.priceChange ? Number(p.priceChange.h24) : NaN;
          price.textContent = money(p.priceUsd) + (isFinite(change) ? "  " + (change >= 0 ? "▲ +" : "▼ ") + change.toFixed(2) + "% 24h" : "");
          if (isFinite(change)) price.className = change >= 0 ? "up" : "down";
          b.appendChild(name); b.appendChild(where); b.appendChild(price);
          b.addEventListener("click", function () { showPair(p, b); });
          list.appendChild(b);
          if (i === 0) showPair(p, b);
        });
      })
      .catch(function () {
        status.textContent = "Could not reach DexScreener just now. Check your connection and press Search again.";
      });
  }

  // ---------- CoinMarketCap (their price-strip widget) ----------
  function loadCmc() {
    var strip = $("cmc-strip");
    var widget = document.createElement("div");
    widget.id = "coinmarketcap-widget-marquee";
    widget.setAttribute("coins", String(cfg.cmcCoins || "1,1027").replace(/[^0-9,]/g, ""));
    widget.setAttribute("currency", "USD");
    widget.setAttribute("theme", "dark");
    widget.setAttribute("transparent", "true");
    widget.setAttribute("show-symbol-logo", "true");
    strip.appendChild(widget);
    var s = document.createElement("script");
    s.src = "https://files.coinmarketcap.com/static/widget/coinMarquee.js";
    s.async = true;
    strip.appendChild(s);
  }

  // ---------- Checkonchain ----------
  function loadCheckonchain() {
    var iframe = document.createElement("iframe");
    iframe.src = "https://charts.checkonchain.com/";
    iframe.title = "Checkonchain charts";
    iframe.loading = "lazy";
    iframe.referrerPolicy = "no-referrer";
    $("coc-frame").appendChild(iframe);
  }

  var LOADERS = {
    tradingview: function () {
      var symbol = cleanSymbol(recall("tv")) || cleanSymbol(cfg.tradingviewSymbol) || "BINANCE:BTCUSDT";
      $("tv-symbol").value = symbol;
      loadTradingView(symbol);
    },
    dexscreener: function () {
      var q = recall("dex") || cfg.dexSearch || "SOL";
      $("dex-query").value = q;
      searchDex(q);
    },
    coinmarketcap: loadCmc,
    checkonchain: loadCheckonchain
  };

  // ---------- wiring ----------
  TOOLS.forEach(function (t) {
    $("tab-" + t).addEventListener("click", function () { show(t); });
  });

  document.querySelector(".tabs").addEventListener("keydown", function (e) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    var i = TOOLS.indexOf(current());
    i = (i + (e.key === "ArrowRight" ? 1 : TOOLS.length - 1)) % TOOLS.length;
    show(TOOLS[i], true);
    e.preventDefault();
  });

  $("tv-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var s = cleanSymbol($("tv-symbol").value);
    if (!s) return;
    $("tv-symbol").value = s;
    remember("tv", s);
    loadTradingView(s);
  });

  $("dex-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var q = $("dex-query").value.trim().slice(0, 80);
    if (!q) return;
    remember("dex", q);
    $("dex-frame").textContent = "";
    searchDex(q);
  });

  // Shortcuts: 1–4 switch tool, "/" jumps to the search box. Ignored while typing.
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable) return;
    if (e.key >= "1" && e.key <= "4") { show(TOOLS[Number(e.key) - 1], true); return; }
    if (e.key === "/") {
      var box = document.querySelector("#panel-" + current() + " [data-search]");
      if (box) { box.focus(); box.select(); e.preventDefault(); }
    }
  });

  window.addEventListener("hashchange", function () { show(location.hash.slice(1)); });

  show(location.hash.slice(1) || recall("tab") || TOOLS[0]);
})();
