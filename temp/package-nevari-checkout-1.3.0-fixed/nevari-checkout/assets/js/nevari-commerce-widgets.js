(function (window, document) {
    'use strict';

    var config = window.NevariCommerce || {};
    var timers = new WeakMap();

    function post(action, values, signal) {
        var body = new URLSearchParams();
        body.set('action', action);
        Object.keys(values || {}).forEach(function (key) {
            body.set(key, values[key]);
        });

        return fetch(config.ajaxUrl, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'},
            body: body.toString(),
            signal: signal
        }).then(function (response) {
            return response.json().then(function (payload) {
                if (!response.ok || !payload || !payload.success) {
                    var message = payload && payload.data && payload.data.message ? payload.data.message : (config.messages && config.messages.genericError);
                    throw new Error(message || 'Request failed.');
                }
                return payload.data || {};
            });
        });
    }

    function setBusy(root, busy) {
        root.classList.toggle('is-processing', busy);
        root.setAttribute('aria-busy', busy ? 'true' : 'false');
    }

    function announce(root, message, error) {
        var node = root.querySelector('[data-nevari-message]');
        if (!node) return;
        node.textContent = message || '';
        node.classList.toggle('is-error', !!error);
    }

    function html(node, value) {
        if (node && typeof value === 'string') node.innerHTML = value;
    }

    function applySnapshot(snapshot) {
        if (!snapshot) return;
        document.querySelectorAll('[data-nevari-widget="cart"], [data-nevari-widget="checkout"]').forEach(function (root) {
            html(root.querySelector('[data-nevari-items-total]'), snapshot.itemsTotalHtml);
            html(root.querySelector('[data-nevari-shipping]'), snapshot.shippingHtml);
            html(root.querySelector('[data-nevari-service-fee]'), snapshot.serviceFeeHtml);
            html(root.querySelector('[data-nevari-discount]'), snapshot.discountHtml);
            html(root.querySelector('[data-nevari-tax]'), snapshot.taxHtml);
            html(root.querySelector('[data-nevari-total]'), snapshot.totalHtml);
            html(root.querySelector('[data-nevari-button-total]'), snapshot.totalHtml);

            var progress = root.querySelector('[data-nevari-progress-fill]');
            if (progress) progress.style.width = Math.max(0, Math.min(100, Number(snapshot.progress) || 0)) + '%';
            var progressMessage = root.querySelector('[data-nevari-progress-message]');
            if (progressMessage) progressMessage.textContent = snapshot.progressMessage || '';
            var discountRow = root.querySelector('[data-nevari-discount-row]');
            if (discountRow) discountRow.hidden = !snapshot.appliedCoupons || !snapshot.appliedCoupons.length;
            var list = root.querySelector('[data-nevari-coupon-list]');
            if (list) {
                list.replaceChildren();
                (snapshot.appliedCoupons || []).forEach(function (code) {
                    var button = document.createElement('button');
                    button.type = 'button';
                    button.setAttribute('data-nevari-coupon-remove', code);
                    var removeLabel = list.getAttribute('data-remove-label') || 'Remove';
                    button.textContent = code + ' Ã—';
                    button.setAttribute('aria-label', removeLabel + ' ' + code);
                    list.appendChild(button);
                });
            }

            if (root.matches('[data-nevari-widget="cart"]')) {
                var content = root.querySelector('[data-nevari-content]');
                var empty = root.querySelector('[data-nevari-empty]');
                if (content) content.hidden = !!snapshot.empty;
                if (empty) empty.hidden = !snapshot.empty;
                Object.keys(snapshot.items || {}).forEach(function (key) {
                    var row = root.querySelector('[data-cart-item-key="' + cssEscape(key) + '"]');
                    if (!row) return;
                    var input = row.querySelector('.nevari-qty-value');
                    var item = snapshot.items[key];
                    if (input) {
                        input.value = item.quantity;
                        input.min = item.minimum;
                        input.max = item.maximum;
                    }
                    var minus = row.querySelector('.nevari-qty-minus');
                    var plus = row.querySelector('.nevari-qty-plus');
                    if (minus) minus.disabled = item.quantity <= item.minimum;
                    if (plus) plus.disabled = item.quantity >= item.maximum;
                });
            }
        });
        document.dispatchEvent(new CustomEvent('nevari_cart_updated', {detail: snapshot}));
    }

    function cssEscape(value) {
        if (window.CSS && window.CSS.escape) return window.CSS.escape(value);
        return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
    }

    function refreshSnapshot(root) {
        return post('nevari_get_cart_total', {nonce: config.totalNonce}).then(function (data) {
            applySnapshot(data.snapshot || data);
            announce(root, '');
        });
    }

    function updateQuantity(root, row, quantity, previous) {
        setBusy(root, true);
        announce(root, config.messages && config.messages.cartUpdating || 'Updating cart…');
        return post('nevari_update_cart_quantity', {
            nonce: config.cartNonce,
            cart_item_key: row.getAttribute('data-cart-item-key') || '',
            quantity: quantity
        }).then(function (data) {
            applySnapshot(data.snapshot || data);
            announce(root, '');
        }).catch(function (error) {
            var input = row.querySelector('.nevari-qty-value');
            if (input) input.value = previous;
            announce(root, error.message, true);
        }).finally(function () {
            setBusy(root, false);
        });
    }

    function queueQuantity(root, row, quantity, previous) {
        var input = row.querySelector('.nevari-qty-value');
        if (input) input.value = quantity;
        if (root.getAttribute('data-update-mode') === 'manual') {
            row.setAttribute('data-pending-quantity', quantity);
            return;
        }
        var priorTimer = timers.get(row);
        if (priorTimer) window.clearTimeout(priorTimer);
        timers.set(row, window.setTimeout(function () {
            updateQuantity(root, row, quantity, previous);
        }, Math.max(100, Number(root.getAttribute('data-debounce')) || 350)));
    }

    function initCart(root) {
        root.addEventListener('click', function (event) {
            var quantityButton = event.target.closest('[data-nevari-quantity]');
            if (quantityButton && root.contains(quantityButton)) {
                var row = quantityButton.closest('[data-cart-item-key]');
                var input = row && row.querySelector('.nevari-qty-value');
                if (!row || !input) return;
                var previous = Number(input.value) || 1;
                var min = Number(input.min) || 1;
                var max = Number(input.max) || 9999;
                var next = quantityButton.getAttribute('data-nevari-quantity') === 'increase' ? previous + 1 : previous - 1;
                queueQuantity(root, row, Math.max(min, Math.min(max, next)), previous);
                return;
            }

            var remove = event.target.closest('[data-nevari-remove]');
            if (remove && root.contains(remove)) {
                var removeRow = remove.closest('[data-cart-item-key]');
                if (!removeRow) return;
                setBusy(root, true);
                post('nevari_remove_cart_item', {nonce: config.cartNonce, cart_item_key: removeRow.getAttribute('data-cart-item-key') || ''})
                    .then(function (data) {
                        removeRow.remove();
                        applySnapshot(data.snapshot);
                        announce(root, '');
                    }).catch(function (error) {
                        announce(root, error.message, true);
                    }).finally(function () {
                        setBusy(root, false);
                    });
                return;
            }

            var manual = event.target.closest('[data-nevari-manual-update]');
            if (manual && root.contains(manual)) {
                var pending = Array.prototype.slice.call(root.querySelectorAll('[data-pending-quantity]'));
                pending.reduce(function (promise, row) {
                    return promise.then(function () {
                        var value = Number(row.getAttribute('data-pending-quantity'));
                        row.removeAttribute('data-pending-quantity');
                        return updateQuantity(root, row, value, value);
                    });
                }, Promise.resolve());
            }
        });

        root.addEventListener('change', function (event) {
            if (!event.target.matches('.nevari-qty-value')) return;
            var row = event.target.closest('[data-cart-item-key]');
            var min = Number(event.target.min) || 1;
            var max = Number(event.target.max) || 9999;
            var next = Math.max(min, Math.min(max, Number(event.target.value) || min));
            queueQuantity(root, row, next, next);
        });
    }

    function initCheckout(root) {
        root.addEventListener('change', function (event) {
            if (event.target.matches('input[name="payment_method"]') && window.jQuery) {
                window.jQuery(document.body).trigger('update_checkout');
            }
        });

        root.addEventListener('click', function (event) {
            var tip = event.target.closest('[data-nevari-tip]');
            if (tip && root.contains(tip)) {
                root.querySelectorAll('[data-nevari-tip]').forEach(function (node) { node.classList.toggle('is-selected', node === tip); });
                var value = tip.getAttribute('data-nevari-tip');
                var custom = root.querySelector('.nevari-custom-tip');
                if (custom) custom.hidden = value !== 'other';
                if (value === 'other') {
                    setTip(root, '0', '');
                    if (custom) custom.focus();
                } else {
                    setTip(root, value, tip.textContent.trim());
                }
                return;
            }

            var toggle = event.target.closest('[data-nevari-coupon-toggle]');
            if (toggle && root.contains(toggle)) {
                var panel = root.querySelector('.nevari-coupon-panel');
                if (panel) {
                    panel.hidden = !panel.hidden;
                    toggle.setAttribute('aria-expanded', panel.hidden ? 'false' : 'true');
                    if (!panel.hidden) panel.querySelector('input').focus();
                }
                return;
            }

            var removeCoupon = event.target.closest('[data-nevari-coupon-remove]');
            if (removeCoupon && root.contains(removeCoupon)) {
                setBusy(root, true);
                post('nevari_remove_checkout_coupon', {nonce: config.couponNonce, coupon_code: removeCoupon.getAttribute('data-nevari-coupon-remove') || ''})
                    .then(function (data) { applySnapshot(data.snapshot); announce(root, data.message || ''); })
                    .catch(function (error) { announce(root, error.message, true); })
                    .finally(function () { setBusy(root, false); });
                return;
            }

            var apply = event.target.closest('[data-nevari-coupon-apply]');
            if (apply && root.contains(apply)) {
                var field = root.querySelector('[data-nevari-coupon-code]');
                var code = field ? field.value.trim() : '';
                if (!code) return;
                setBusy(root, true);
                post('nevari_apply_checkout_coupon', {nonce: config.couponNonce, coupon_code: code})
                    .then(function (data) {
                        if (data.snapshot) applySnapshot(data.snapshot); else return refreshSnapshot(root);
                    }).catch(function (error) {
                        announce(root, error.message, true);
                    }).finally(function () {
                        setBusy(root, false);
                    });
            }
        });

        var customTip = root.querySelector('[data-nevari-custom-tip]');
        if (customTip) {
            customTip.addEventListener('change', function () {
                setTip(root, customTip.value, customTip.value);
            });
        }

        root.addEventListener('submit', function () {
            var button = root.querySelector('.nevari-place-order');
            if (button) {
                button.disabled = true;
                button.textContent = button.getAttribute('data-loading-label') || button.textContent;
            }
            setBusy(root, true);
        });

        if (window.jQuery) {
            window.jQuery(document.body).on('updated_checkout.nevariCommerce', function () {
                refreshSnapshot(root).catch(function () {});
            });
            window.jQuery(document.body).on('checkout_error.nevariCommerce', function () {
                var button = root.querySelector('.nevari-place-order');
                if (button) {
                    button.disabled = false;
                    button.textContent = button.getAttribute('data-value') || button.textContent;
                }
                setBusy(root, false);
                var firstError = root.querySelector('.woocommerce-invalid input, :invalid');
                if (firstError) firstError.focus();
            });
        }
    }

    function setTip(root, value, label) {
        var amount = root.querySelector('input[name="nevari_selected_tip"]');
        var text = root.querySelector('input[name="nevari_selected_tip_label"]');
        if (amount) amount.value = value;
        if (text) text.value = label;
        if (window.jQuery) window.jQuery(document.body).trigger('update_checkout');
    }

    function initOrder(root) {
        if (root.getAttribute('data-auto-refresh') !== 'yes' || root.getAttribute('data-final') === 'yes') return;
        var interval = Math.max(15, Number(root.getAttribute('data-refresh-interval')) || 30) * 1000;
        var timer;
        function schedule() {
            window.clearTimeout(timer);
            if (!document.hidden && root.getAttribute('data-final') !== 'yes') timer = window.setTimeout(poll, interval);
        }
        function poll() {
            if (document.hidden) { schedule(); return; }
            setBusy(root, true);
            post('nevari_get_order_progress', {
                nonce: config.orderNonce,
                order_id: root.getAttribute('data-order-id') || '',
                poll_token: root.getAttribute('data-poll-token') || ''
            }).then(function (data) {
                var label = root.querySelector('[data-nevari-status-label]');
                if (label) label.textContent = data.statusLabel || '';
                root.className = root.className.replace(/stage-[a-z-]+/g, '').trim() + ' stage-' + (data.stage || 'placed');
                updateTimeline(root, data.stage);
                announce(root, data.statusLabel || '');
                if (data.final) root.setAttribute('data-final', 'yes');
                document.dispatchEvent(new CustomEvent('nevari_order_status_changed', {detail: data}));
            }).catch(function (error) {
                announce(root, error.message, true);
            }).finally(function () {
                setBusy(root, false);
                schedule();
            });
        }
        document.addEventListener('visibilitychange', schedule);
        schedule();
    }

    function updateTimeline(root, current) {
        var rank = {placed: 1, processing: 2, completed: 3};
        root.querySelectorAll('[data-stage]').forEach(function (step) {
            var target = rank[step.getAttribute('data-stage')] || 99;
            var now = rank[current] || 1;
            step.classList.toggle('is-complete', target < now);
            step.classList.toggle('is-active', target === now);
            step.classList.toggle('is-upcoming', target > now);
        });
    }

    function init(root) {
        if (!root || root.getAttribute('data-nevari-initialized') === 'yes') return;
        root.setAttribute('data-nevari-initialized', 'yes');
        var type = root.getAttribute('data-nevari-widget');
        if (type === 'cart') initCart(root);
        if (type === 'checkout') initCheckout(root);
        if (type === 'order-progress') initOrder(root);
    }

    function initAll(scope) {
        (scope || document).querySelectorAll('[data-nevari-widget]').forEach(init);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { initAll(document); });
    else initAll(document);

    if (window.jQuery) {
        window.jQuery(window).on('elementor/frontend/init', function () {
            if (!window.elementorFrontend || !window.elementorFrontend.hooks) return;
            ['nevari-cart.default', 'nevari-checkout.default', 'nevari-order-progress.default'].forEach(function (name) {
                window.elementorFrontend.hooks.addAction('frontend/element_ready/' + name, function (scope) {
                    initAll(scope[0] || scope);
                });
            });
        });
    }
})(window, document);

