/* =========================================================================
   PharmInvMS - shared loading system  (js/loading.js)
   Load this BEFORE auth.js on every page.

   Public API (all on window.PharmLoader, plus window.fetchWithLoading):

     fetchWithLoading(url, options, cfg)   native fetch + loading + timeout
     PharmLoader.show(message) -> id       full-screen overlay (ref-counted)
     PharmLoader.hide(id)
     PharmLoader.setButtonLoading(btn, isLoading, text)
     PharmLoader.setInlineLoading(container, isLoading, message)
     PharmLoader.renderError(container, message, onRetry)
     PharmLoader.friendlyStatusMessage(status)

   cfg for fetchWithLoading:
     mode            "overlay" | "button" | "inline" | "none"   (default "none")
     message         text shown while loading
     slowMessage     text shown if the request is slow (cold start)
     button          <button> element          (mode "button")
     buttonText      label while loading       (mode "button")
     keepOnSuccess   true = leave button in loading state if response.ok
                     (use when you are about to redirect)
     container       element for inline loader (mode "inline")
     retries         auto-retries on network failure / 502-504.
                     Defaults to 2 for GET/HEAD and ALWAYS 0 for
                     POST/PUT/PATCH/DELETE (never auto-repeated).
     timeout         ms, default 65000
     onSlow          callback when the request passes the "slow" threshold
   ========================================================================= */
(function (global) {
    "use strict";

    var SHOW_DELAY_MS = 250;      // skip the overlay for fast requests (no flicker)
    var SLOW_AFTER_MS = 4000;     // show the "server is waking up" hint
    var TIMEOUT_MS = 65000;       // Render free-tier cold starts can take ~50s
    var RETRY_DELAYS = [1500, 4000];
    var SAFE_METHODS = ["GET", "HEAD"];
    var RETRY_STATUSES = [502, 503, 504];

    var DEFAULT_MESSAGE = "Connecting to pharmacy database\u2026";
    var DEFAULT_SLOW = "The server is waking up. This can take up to a minute.";

    /* ---------------------------------------------------------------------
       Styles (injected once, so no edits to your main CSS are required).
       Colours reuse your existing CSS variables when present.
       --------------------------------------------------------------------- */
    function injectStyles() {
        if (document.getElementById("pim-loading-styles")) return;
        var css = [
            ".pim-loader{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(249,248,246,.82);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)}",
            ".pim-loader[hidden]{display:none}",
            ".pim-loader__card{width:100%;max-width:340px;padding:28px 24px;text-align:center;background:var(--surface,#fff);border:1px solid var(--line,#dcdcdc);border-top:3px solid var(--ink,#0d2426);border-radius:var(--radius,4px);box-shadow:0 8px 24px rgba(13,36,38,.12)}",
            ".pim-loader__msg{margin:16px 0 0;font:500 .95rem/1.4 'Inter',system-ui,Arial,sans-serif;color:var(--ink,#0d2426)}",
            ".pim-loader__hint{margin:8px 0 0;font:400 .82rem/1.5 'Inter',system-ui,Arial,sans-serif;color:var(--ink-soft,#4a5c5d)}",
            ".pim-loader__hint:empty{display:none}",
            ".pim-spinner{display:inline-block;width:36px;height:36px;border:3px solid var(--line,#dcdcdc);border-top-color:var(--ink,#0d2426);border-radius:50%;animation:pim-spin .8s linear infinite}",
            ".pim-spinner--sm{width:15px;height:15px;border-width:2px;border-color:rgba(255,255,255,.35);border-top-color:currentColor}",
            ".pim-spinner--inline{width:20px;height:20px;border-width:2px}",
            "@keyframes pim-spin{to{transform:rotate(360deg)}}",
            ".pim-btn-loading{display:inline-flex!important;align-items:center;justify-content:center;gap:10px;cursor:progress!important;opacity:.88}",
            ".pim-btn-loading:disabled{cursor:progress}",
            ".pim-inline-host{position:relative}",
            ".pim-inline-veil{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;gap:10px;padding:12px;background:rgba(255,255,255,.72);font:500 .85rem 'Inter',system-ui,Arial,sans-serif;color:var(--ink,#0d2426)}",
            ".pim-inline-row td{padding:20px 12px;text-align:center;color:var(--ink-soft,#4a5c5d);font:400 .85rem 'Inter',system-ui,Arial,sans-serif}",
            ".pim-inline-row .pim-spinner{vertical-align:middle;margin-right:10px}",
            ".pim-error{padding:16px;text-align:center;font:400 .88rem/1.5 'Inter',system-ui,Arial,sans-serif;color:var(--ink,#0d2426)}",
            ".pim-error p{margin:0 0 12px}",
            ".pim-error button{padding:8px 16px;border:1px solid var(--ink,#0d2426);border-radius:var(--radius,4px);background:var(--ink,#0d2426);color:#fff;font:500 .85rem 'Inter',system-ui,Arial,sans-serif;cursor:pointer}",
            ".pim-error button:hover{background:#183d40}",
            ".pim-error button:focus-visible{outline:2px solid var(--gold,#b38600);outline-offset:2px}",
            "@media (prefers-reduced-motion:reduce){.pim-spinner{animation-duration:2.4s}}"
        ].join("\n");
        var style = document.createElement("style");
        style.id = "pim-loading-styles";
        style.textContent = css;
        document.head.appendChild(style);
    }

    /* ---------------------------------------------------------------------
       Full-screen overlay: reference counted.
       Every show() returns an id; the overlay stays up until EVERY id has
       been hidden, so one finished request can't hide another's loader.
       --------------------------------------------------------------------- */
    var overlayEl = null;
    var active = new Map();   // id -> { message, slow }
    var seq = 0;
    var revealTimer = null;

    function ensureOverlay() {
        if (overlayEl) return overlayEl;
        injectStyles();
        overlayEl = document.createElement("div");
        overlayEl.className = "pim-loader";
        overlayEl.hidden = true;
        overlayEl.setAttribute("role", "status");
        overlayEl.setAttribute("aria-live", "polite");

        var card = document.createElement("div");
        card.className = "pim-loader__card";

        var spinner = document.createElement("div");
        spinner.className = "pim-spinner";
        spinner.setAttribute("aria-hidden", "true");

        var msg = document.createElement("p");
        msg.className = "pim-loader__msg";

        var hint = document.createElement("p");
        hint.className = "pim-loader__hint";

        card.appendChild(spinner);
        card.appendChild(msg);
        card.appendChild(hint);
        overlayEl.appendChild(card);
        document.body.appendChild(overlayEl);
        return overlayEl;
    }

    function renderOverlay() {
        if (active.size === 0) {
            clearTimeout(revealTimer);
            revealTimer = null;
            if (overlayEl) overlayEl.hidden = true;
            document.body.removeAttribute("aria-busy");
            return;
        }

        var el = ensureOverlay();
        var latest = null;
        var anySlow = false;
        active.forEach(function (entry) {
            latest = entry;
            if (entry.slow) anySlow = true;
        });
        el.querySelector(".pim-loader__msg").textContent = latest.message;
        el.querySelector(".pim-loader__hint").textContent = anySlow ? DEFAULT_SLOW : "";

        if (el.hidden && !revealTimer) {
            revealTimer = setTimeout(function () {
                revealTimer = null;
                if (active.size > 0) {
                    el.hidden = false;
                    document.body.setAttribute("aria-busy", "true");
                }
            }, SHOW_DELAY_MS);
        }
    }

    function showOverlay(message) {
        var id = ++seq;
        active.set(id, { message: message || DEFAULT_MESSAGE, slow: false });
        renderOverlay();
        return id;
    }

    function hideOverlay(id) {
        active.delete(id);
        renderOverlay();
    }

    function markOverlaySlow(id) {
        var entry = active.get(id);
        if (entry) {
            entry.slow = true;
            renderOverlay();
        }
    }

    /* ---------------------------------------------------------------------
       Button loading state
       --------------------------------------------------------------------- */
    function setButtonLoading(btn, isLoading, text) {
        if (!btn) return;

        if (isLoading) {
            injectStyles();
            if (btn.dataset.pimBusy !== "1") {
                btn.dataset.pimBusy = "1";
                btn._pimNodes = Array.prototype.slice.call(btn.childNodes);
                btn.disabled = true;
                btn.setAttribute("aria-busy", "true");
                btn.classList.add("pim-btn-loading");
            }
            // (re)build the loading content; also used to update the label
            while (btn.firstChild) btn.removeChild(btn.firstChild);
            var spin = document.createElement("span");
            spin.className = "pim-spinner pim-spinner--sm";
            spin.setAttribute("aria-hidden", "true");
            var label = document.createElement("span");
            label.textContent = text || "Please wait\u2026";
            btn.appendChild(spin);
            btn.appendChild(label);
        } else {
            if (btn.dataset.pimBusy !== "1") return;
            while (btn.firstChild) btn.removeChild(btn.firstChild);
            (btn._pimNodes || []).forEach(function (n) { btn.appendChild(n); });
            btn._pimNodes = null;
            delete btn.dataset.pimBusy;
            btn.disabled = false;
            btn.removeAttribute("aria-busy");
            btn.classList.remove("pim-btn-loading");
        }
    }

    /* ---------------------------------------------------------------------
       Inline loading (tables / panels). Ref-counted per container.
       - <tbody>/<table>: shows a status row at the top
       - anything else: a translucent veil over the container
       --------------------------------------------------------------------- */
    var inlineCounts = new WeakMap();

    function isTable(el) {
        return el.tagName === "TBODY" || el.tagName === "TABLE";
    }

    function setInlineLoading(container, isLoading, message) {
        if (!container) return;
        injectStyles();

        var count = inlineCounts.get(container) || 0;
        count = isLoading ? count + 1 : Math.max(0, count - 1);
        inlineCounts.set(container, count);

        var existing = container.querySelector(".pim-inline-veil, .pim-inline-row");

        if (count > 0) {
            if (existing) {
                var txt = existing.querySelector(".pim-inline-text");
                if (txt && message) txt.textContent = message;
                return;
            }
            var spinner = document.createElement("span");
            spinner.className = "pim-spinner pim-spinner--inline";
            spinner.setAttribute("aria-hidden", "true");
            var text = document.createElement("span");
            text.className = "pim-inline-text";
            text.textContent = message || "Retrieving your data\u2026";

            if (isTable(container)) {
                var tbody = container.tagName === "TABLE" ? (container.tBodies[0] || container) : container;
                var cols = 1;
                var sample = tbody.rows && tbody.rows[0];
                if (sample) cols = sample.cells.length || 1;
                else if (container.tagName === "TABLE" && container.tHead && container.tHead.rows[0]) cols = container.tHead.rows[0].cells.length || 1;
                var tr = document.createElement("tr");
                tr.className = "pim-inline-row";
                tr.setAttribute("role", "status");
                var td = document.createElement("td");
                td.colSpan = cols;
                td.appendChild(spinner);
                td.appendChild(text);
                tr.appendChild(td);
                tbody.insertBefore(tr, tbody.firstChild);
            } else {
                container.classList.add("pim-inline-host");
                container.setAttribute("aria-busy", "true");
                var veil = document.createElement("div");
                veil.className = "pim-inline-veil";
                veil.setAttribute("role", "status");
                veil.appendChild(spinner);
                veil.appendChild(text);
                container.appendChild(veil);
            }
        } else {
            var targets = container.querySelectorAll(".pim-inline-veil, .pim-inline-row");
            Array.prototype.forEach.call(targets, function (n) { n.remove(); });
            container.classList.remove("pim-inline-host");
            container.removeAttribute("aria-busy");
        }
    }

    /* ---------------------------------------------------------------------
       Error panel with optional Retry (replaces the container's content)
       --------------------------------------------------------------------- */
    function renderError(container, message, onRetry) {
        if (!container) return;
        injectStyles();

        var box = document.createElement("div");
        box.className = "pim-error";
        box.setAttribute("role", "alert");
        var p = document.createElement("p");
        p.textContent = message || "Something went wrong. Please try again.";
        box.appendChild(p);

        if (typeof onRetry === "function") {
            var btn = document.createElement("button");
            btn.type = "button";
            btn.textContent = "Try again";
            btn.addEventListener("click", function () { onRetry(); }, { once: true });
            box.appendChild(btn);
        }

        if (container.tagName === "TBODY" || container.tagName === "TABLE") {
            var tbody = container.tagName === "TABLE" ? (container.tBodies[0] || container) : container;
            while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
            var tr = document.createElement("tr");
            var td = document.createElement("td");
            td.colSpan = 99;
            td.appendChild(box);
            tr.appendChild(td);
            tbody.appendChild(tr);
        } else {
            while (container.firstChild) container.removeChild(container.firstChild);
            container.appendChild(box);
        }
    }

    /* ---------------------------------------------------------------------
       Friendly errors
       --------------------------------------------------------------------- */
    function friendlyStatusMessage(status) {
        if (status === 401) return "Your session has expired or your credentials are incorrect.";
        if (status === 403) return "You don't have permission to do that.";
        if (status === 404) return "We couldn't find what you asked for.";
        if (status >= 500) return "The server is temporarily unavailable. Please try again in a moment.";
        return "Something went wrong. Please try again.";
    }

    function toFriendlyError(err, timedOut) {
        var e = new Error(
            timedOut
                ? "The server is taking too long to respond. It may be starting up. Please try again in a moment."
                : "Unable to reach the server. Check your internet connection and try again."
        );
        e.userMessage = e.message;
        e.isNetworkError = true;
        e.cause = err;
        return e;
    }

    /* ---------------------------------------------------------------------
       fetchWithLoading
       --------------------------------------------------------------------- */
    function sleep(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    function fetchOnce(url, options, timeoutMs) {
        var controller = new AbortController();
        var timedOut = false;
        var timer = setTimeout(function () { timedOut = true; controller.abort(); }, timeoutMs);

        // respect a caller-supplied signal
        if (options.signal) {
            if (options.signal.aborted) controller.abort();
            else options.signal.addEventListener("abort", function () { controller.abort(); }, { once: true });
        }

        var opts = Object.assign({}, options, { signal: controller.signal });
        return fetch(url, opts).then(
            function (res) { clearTimeout(timer); return res; },
            function (err) { clearTimeout(timer); err._pimTimedOut = timedOut; throw err; }
        );
    }

    async function fetchWithLoading(url, options, cfg) {
        options = options || {};
        cfg = cfg || {};

        var method = (options.method || "GET").toUpperCase();
        var isSafe = SAFE_METHODS.indexOf(method) !== -1;
        // POST / PUT / PATCH / DELETE are never auto-repeated
        var maxRetries = isSafe ? (typeof cfg.retries === "number" ? cfg.retries : RETRY_DELAYS.length) : 0;
        var timeoutMs = cfg.timeout || TIMEOUT_MS;
        var mode = cfg.mode || "none";

        // ---- start loading UI
        var overlayId = null;
        var succeeded = false;
        if (mode === "overlay") overlayId = showOverlay(cfg.message);
        else if (mode === "button") setButtonLoading(cfg.button, true, cfg.buttonText);
        else if (mode === "inline") setInlineLoading(cfg.container, true, cfg.message);

        var slowTimer = setTimeout(function () {
            if (mode === "overlay") markOverlaySlow(overlayId);
            else if (mode === "button") setButtonLoading(cfg.button, true, cfg.slowMessage || "Still connecting\u2026");
            else if (mode === "inline") setInlineLoading(cfg.container, true, cfg.slowMessage || "Waking up the server\u2026");
            if (typeof cfg.onSlow === "function") {
                try { cfg.onSlow(); } catch (e) { console.error(e); }
            }
        }, SLOW_AFTER_MS);

        try {
            for (var attempt = 0; ; attempt++) {
                try {
                    var res = await fetchOnce(url, options, timeoutMs);
                    if (isSafe && RETRY_STATUSES.indexOf(res.status) !== -1 && attempt < maxRetries) {
                        await sleep(RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)]);
                        continue;
                    }
                    succeeded = res.ok;
                    return res; // caller keeps handling res.ok / res.json() as before
                } catch (err) {
                    var callerAborted = options.signal && options.signal.aborted;
                    if (callerAborted) throw err;
                    if (attempt < maxRetries) {
                        await sleep(RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)]);
                        continue;
                    }
                    throw toFriendlyError(err, err._pimTimedOut);
                }
            }
        } finally {
            // always runs: success, HTTP error, network failure or timeout
            clearTimeout(slowTimer);
            if (mode === "overlay") hideOverlay(overlayId);
            else if (mode === "button") {
                if (!(cfg.keepOnSuccess && succeeded)) setButtonLoading(cfg.button, false);
            } else if (mode === "inline") setInlineLoading(cfg.container, false);
        }
    }

    global.PharmLoader = {
        show: showOverlay,
        hide: hideOverlay,
        setButtonLoading: setButtonLoading,
        setInlineLoading: setInlineLoading,
        renderError: renderError,
        friendlyStatusMessage: friendlyStatusMessage,
        fetchWithLoading: fetchWithLoading
    };
    global.fetchWithLoading = fetchWithLoading;
})(window);
