/**
 * Runtime injected at the bottom of every JOTL page that uses script, control
 * flow, or reference syntax. See `spec/RULEBOOK.md` §9–§11 and §18. The script
 * body is interpolated via string replacement just before emission so this file
 * stays side-effect free.
 *
 * Markers this runtime understands:
 *   - [data-jotl-text="expr"]        replace textContent with expr result
 *   - [data-jotl-bind-ATTR="expr"]   sync ATTR with expr result
 *   - [data-jotl-on-EVENT="expr"]    bind EVENT (press→click, etc.) to expr
 *   - .jotl-if[data-jotl-if]         first matching <template data-jotl-case="expr"> wins
 *   - .jotl-for[data-jotl-for=iter]  clones first <template> per item
 */
export const CLIENT_RUNTIME = `(function(){
  "use strict";
  if (typeof document === "undefined") return;
  var stateStore = Object.create(null);
  var scheduled = false;
  var state = new Proxy(stateStore, {
    get: function (t, k) { return t[k]; },
    set: function (t, k, v) { t[k] = v; schedule(); return true; },
    has: function (t, k) { return k in t; }
  });
  var handlers = Object.create(null);
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    var raf = typeof requestAnimationFrame === "function"
      ? requestAnimationFrame
      : function (cb) { return setTimeout(function () { cb(0); }, 0); };
    raf(function () { scheduled = false; renderAll(); });
  }
  var cache = Object.create(null);
  function compile(expr) {
    if (cache[expr]) return cache[expr];
    try {
      cache[expr] = new Function("state", "handlers", "$scope", "return (" + expr + ");");
    } catch (err) {
      console.error("[jotl] compile error", expr, err);
      cache[expr] = function () { return ""; };
    }
    return cache[expr];
  }
  function evaluate(expr, scope) {
    try { return compile(expr)(state, handlers, scope); }
    catch (err) { console.error("[jotl] eval error", expr, err); return ""; }
  }
  function scopeOf(node) {
    var cur = node;
    while (cur) {
      if (cur.__jotlScope) return cur.__jotlScope;
      cur = cur.parentElement;
    }
    return {};
  }
  function fmt(v) {
    if (v === null || v === undefined) return "";
    if (typeof v === "object") try { return JSON.stringify(v); } catch (e) { return String(v); }
    return String(v);
  }
  var EVENT_ALIAS = { press: "click" };
  var wired = new WeakSet();
  function wireEvents(root) {
    var nodes = root.querySelectorAll("*");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (wired.has(el)) continue;
      var attrs = el.attributes;
      var bound = false;
      for (var j = 0; j < attrs.length; j++) {
        var a = attrs[j];
        if (a.name.indexOf("data-jotl-on-") !== 0) continue;
        var type = a.name.slice("data-jotl-on-".length);
        var event = EVENT_ALIAS[type] || type;
        (function (element, expr, evtName) {
          element.addEventListener(evtName, function (event) {
            var scope = scopeOf(element);
            try {
              var fn = new Function(
                "state", "handlers", "$scope", "event",
                "var __v = (" + expr + "); if (typeof __v === 'function') return __v(event); return __v;"
              );
              fn(state, handlers, scope, event);
            } catch (err) {
              console.error("[jotl] handler error", expr, err);
            }
          });
        })(el, a.value, event);
        bound = true;
      }
      if (bound) wired.add(el);
    }
  }
  function stampIf(root) {
    var containers = root.querySelectorAll("[data-jotl-if]");
    for (var i = 0; i < containers.length; i++) {
      var c = containers[i];
      var templates = c.querySelectorAll(":scope > template[data-jotl-case]");
      var match = -1;
      var scope = scopeOf(c);
      for (var j = 0; j < templates.length; j++) {
        var expr = templates[j].getAttribute("data-jotl-case") || "";
        if (expr === "" || evaluate(expr, scope)) { match = j; break; }
      }
      if (c.__jotlIf === match) continue;
      var stamped = c.querySelectorAll(":scope > [data-jotl-if-content]");
      for (var k = 0; k < stamped.length; k++) stamped[k].remove();
      if (match >= 0) {
        var tmpl = templates[match];
        var wrap = document.createElement("div");
        wrap.setAttribute("data-jotl-if-content", "");
        wrap.style.display = "contents";
        wrap.appendChild(tmpl.content.cloneNode(true));
        wrap.__jotlScope = scope;
        c.appendChild(wrap);
      }
      c.__jotlIf = match;
    }
  }
  function stampFor(root) {
    var containers = root.querySelectorAll("[data-jotl-for]");
    for (var i = 0; i < containers.length; i++) {
      var c = containers[i];
      var expr = c.getAttribute("data-jotl-for") || "";
      var itemName = c.getAttribute("data-jotl-item") || "item";
      var indexName = c.getAttribute("data-jotl-index") || "";
      var tmpl = c.querySelector(":scope > template");
      if (!tmpl) continue;
      var parentScope = scopeOf(c);
      var list = evaluate(expr, parentScope);
      var items = Array.isArray(list) ? list : [];
      var old = c.querySelectorAll(":scope > [data-jotl-for-item]");
      for (var k = 0; k < old.length; k++) old[k].remove();
      for (var j = 0; j < items.length; j++) {
        var wrap = document.createElement("div");
        wrap.setAttribute("data-jotl-for-item", "");
        wrap.style.display = "contents";
        wrap.appendChild(tmpl.content.cloneNode(true));
        var childScope = {};
        for (var key in parentScope) childScope[key] = parentScope[key];
        childScope[itemName] = items[j];
        if (indexName) childScope[indexName] = j;
        wrap.__jotlScope = childScope;
        c.appendChild(wrap);
      }
    }
  }
  function renderText(root) {
    var nodes = root.querySelectorAll("[data-jotl-text]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      el.textContent = fmt(evaluate(el.getAttribute("data-jotl-text") || "", scopeOf(el)));
    }
  }
  function renderAttrs(root) {
    var nodes = root.querySelectorAll("*");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var attrs = el.attributes;
      var targets = [];
      for (var j = 0; j < attrs.length; j++) {
        if (attrs[j].name.indexOf("data-jotl-bind-") === 0) {
          targets.push({ name: attrs[j].name.slice("data-jotl-bind-".length), expr: attrs[j].value });
        }
      }
      for (var k = 0; k < targets.length; k++) {
        var value = evaluate(targets[k].expr, scopeOf(el));
        if (value === false || value === null || value === undefined) {
          el.removeAttribute(targets[k].name);
        } else if (value === true) {
          el.setAttribute(targets[k].name, "");
        } else {
          el.setAttribute(targets[k].name, fmt(value));
        }
      }
    }
  }
  function renderAll() {
    stampIf(document.body);
    stampFor(document.body);
    wireEvents(document.body);
    renderText(document.body);
    renderAttrs(document.body);
  }
  function boot() {
    try { __JOTL_USER_SCRIPT__ } catch (err) { console.error("[jotl] script error", err); }
    renderAll();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();`
