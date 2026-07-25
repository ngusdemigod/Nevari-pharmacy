(function () {
  "use strict";

  function config() {
    return window.NevariReviews || {};
  }

  function postForm(data) {
    var body = new URLSearchParams();
    Object.keys(data).forEach(function (key) {
      if (data[key] !== undefined && data[key] !== null) {
        body.append(key, data[key]);
      }
    });
    return fetch(config().ajaxUrl, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body: body.toString(),
    }).then(function (res) {
      return res.json().catch(function () {
        return { success: false, data: {} };
      });
    });
  }

  function hideFlags(opts) {
    opts = opts || {};
    return {
      hide_title: opts.show_title ? "" : "1",
      hide_verified: opts.show_verified ? "" : "1",
      hide_reviewer: opts.show_reviewer ? "" : "1",
      hide_date: opts.show_date ? "" : "1",
    };
  }

  function initStarInput(root, state) {
    var wrap = root.querySelector("[data-nevari-reviews-star-input]");
    var hidden = root.querySelector("[data-nevari-reviews-rating]");
    if (!wrap || !hidden) {
      return;
    }
    var buttons = Array.prototype.slice.call(wrap.querySelectorAll("button"));

    function paint(value, hover) {
      buttons.forEach(function (btn) {
        var v = parseInt(btn.getAttribute("data-value"), 10);
        btn.classList.toggle("is-active", !hover && v <= state.rating);
        btn.classList.toggle("is-hover", hover && v <= value);
      });
    }

    buttons.forEach(function (btn) {
      var v = parseInt(btn.getAttribute("data-value"), 10);
      btn.addEventListener("mouseenter", function () {
        paint(v, true);
      });
      btn.addEventListener("focus", function () {
        paint(v, true);
      });
      btn.addEventListener("click", function () {
        state.rating = v;
        hidden.value = String(v);
        paint(v, false);
      });
    });

    wrap.addEventListener("mouseleave", function () {
      paint(state.rating, false);
    });
  }

  function showMessage(root, text, type) {
    var box = root.querySelector(".nevari-reviews__message");
    if (!box) {
      return;
    }
    box.textContent = text || "";
    box.classList.remove("is-success", "is-error");
    box.classList.add(type === "error" ? "is-error" : "is-success");
    box.hidden = !text;
  }

  function initWidget(root) {
    var raw = root.getAttribute("data-nevari-reviews");
    if (!raw) {
      return;
    }
    var cfg;
    try {
      cfg = JSON.parse(raw);
    } catch (e) {
      return;
    }

    var state = { page: 1, sort: cfg.sort || "recent", rating: 0 };
    var list = root.querySelector("[data-nevari-reviews-list]");
    var sortSelect = root.querySelector("[data-nevari-reviews-sort]");
    var loadMore = root.querySelector("[data-nevari-reviews-load-more]");
    var form = root.querySelector("[data-nevari-reviews-form]");

    function baseArgs() {
      var args = {
        action: "nevari_fetch_product_reviews",
        nonce: config().nonce,
        product_id: cfg.productId,
        per_page: cfg.perPage,
        sort: state.sort,
        empty_text: cfg.emptyText || "",
      };
      var flags = hideFlags(cfg.opts);
      Object.keys(flags).forEach(function (k) {
        args[k] = flags[k];
      });
      return args;
    }

    function fetchPage(page, replace) {
      var args = baseArgs();
      args.page = page;
      return postForm(args).then(function (res) {
        if (!res || !res.success) {
          return;
        }
        var html = res.data && res.data.html ? res.data.html : "";
        if (replace) {
          list.innerHTML = html;
        } else {
          list.insertAdjacentHTML("beforeend", html);
        }
        state.page = page;
        if (loadMore) {
          loadMore.hidden = !(res.data && res.data.hasMore);
        }
      });
    }

    if (sortSelect) {
      sortSelect.addEventListener("change", function () {
        state.sort = sortSelect.value;
        fetchPage(1, true);
      });
    }

    if (loadMore) {
      loadMore.addEventListener("click", function () {
        loadMore.disabled = true;
        fetchPage(state.page + 1, false).then(function () {
          loadMore.disabled = false;
        });
      });
    }

    if (form) {
      initStarInput(form, state);
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        var submit = form.querySelector(".nevari-reviews__submit");
        var fd = new FormData(form);
        var payload = {
          action: "nevari_submit_product_review",
          nonce: config().nonce,
          product_id: cfg.productId,
          rating: state.rating || fd.get("rating") || 0,
          title: fd.get("title") || "",
          review: fd.get("review") || "",
          author: fd.get("author") || "",
          email: fd.get("email") || "",
        };
        if (submit) {
          submit.disabled = true;
        }
        postForm(payload).then(function (res) {
          if (submit) {
            submit.disabled = false;
          }
          var messages = cfg.messages || {};
          if (res && res.success) {
            var pending = res.data && res.data.pending;
            showMessage(root, pending ? messages.pending : messages.success, "success");
            form.reset();
            state.rating = 0;
            var hidden = form.querySelector("[data-nevari-reviews-rating]");
            if (hidden) {
              hidden.value = "0";
            }
            form.querySelectorAll(".nevari-reviews__star-input button").forEach(function (b) {
              b.classList.remove("is-active", "is-hover");
            });
            if (!pending) {
              fetchPage(1, true);
            }
          } else {
            var data = (res && res.data) || {};
            var msg = data.message || messages.error;
            if (data.code === "not_buyer" && messages.notBuyer) {
              msg = messages.notBuyer;
            }
            showMessage(root, msg, "error");
          }
        });
      });
    }
  }

  function init() {
    document.querySelectorAll(".nevari-reviews[data-nevari-reviews]").forEach(initWidget);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
