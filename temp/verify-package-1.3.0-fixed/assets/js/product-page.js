(function () {
    function initGallery() {
        var galleries = document.querySelectorAll('[data-nevari-gallery]');

        galleries.forEach(function (gallery) {
            var mainImage = gallery.querySelector('[data-nevari-gallery-main]');
            var thumbs = gallery.querySelectorAll('[data-nevari-gallery-thumb]');

            if (!mainImage || !thumbs.length) {
                return;
            }

            thumbs.forEach(function (thumb) {
                thumb.addEventListener('click', function () {
                    var full = thumb.getAttribute('data-full');
                    var alt = thumb.getAttribute('data-alt') || '';

                    if (full) {
                        mainImage.setAttribute('src', full);
                    }

                    mainImage.setAttribute('alt', alt);

                    thumbs.forEach(function (item) {
                        item.classList.remove('is-active');
                    });

                    thumb.classList.add('is-active');
                });
            });
        });
    }

    function initAccordion() {
        document.querySelectorAll('[data-nevari-accordion-trigger]').forEach(function (trigger) {
            trigger.addEventListener('click', function () {
                var item = trigger.closest('.nevari-product-accordion__item');
                var panel = item ? item.querySelector('[data-nevari-accordion-panel]') : null;
                var isOpen = trigger.getAttribute('aria-expanded') === 'true';

                if (!item || !panel) {
                    return;
                }

                trigger.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
                item.classList.toggle('is-open', !isOpen);

                if (isOpen) {
                    panel.hidden = true;
                } else {
                    panel.hidden = false;
                }
            });
        });
    }

    function initReviewScroll() {
        document.querySelectorAll('[data-nevari-review-scroll]').forEach(function (button) {
            if (button.dataset.bound === 'true') {
                return;
            }

            button.dataset.bound = 'true';

            button.addEventListener('click', function () {
                var target = document.getElementById('review_form_wrapper');

                if (!target) {
                    return;
                }

                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            });
        });
    }

    function initAjaxQuantityControls() {
        document.querySelectorAll('[data-nevari-ajax-qty-control]').forEach(function (control) {
            if (control.dataset.bound === 'true') {
                return;
            }

            control.dataset.bound = 'true';

            var input = control.querySelector('[data-nevari-ajax-quantity-input]');
            var decreaseButton = control.querySelector('[data-qty-action="decrease"]');
            var increaseButton = control.querySelector('[data-qty-action="increase"]');
            var wrap = control.closest('.nevari-ajax-add-to-cart-wrap');
            var addButton = wrap ? wrap.querySelector('[data-nevari-ajax-add-to-cart]') : null;
            var quantityPulseTimer = null;

            if (!input) {
                return;
            }

            function syncQuantityState() {
                var currentValue = parseInt(input.value, 10);

                if (isNaN(currentValue) || currentValue < 1) {
                    currentValue = 1;
                }

                input.value = currentValue;

                if (decreaseButton) {
                    decreaseButton.disabled = currentValue <= 1 || control.dataset.loading === 'true';
                }

                if (increaseButton) {
                    increaseButton.disabled = control.dataset.loading === 'true';
                }

                if (addButton) {
                    addButton.setAttribute('data-quantity', currentValue);
                }
            }

            function setLoadingState(isLoading) {
                control.dataset.loading = isLoading ? 'true' : 'false';
                control.classList.toggle('is-updating', isLoading);

                if (wrap) {
                    wrap.classList.toggle('is-loading', isLoading);
                    wrap.setAttribute('aria-busy', isLoading ? 'true' : 'false');
                }

                if (input) {
                    input.disabled = isLoading;
                }

                if (decreaseButton) {
                    decreaseButton.disabled = isLoading || parseInt(input.value, 10) <= 1;
                }

                if (increaseButton) {
                    increaseButton.disabled = isLoading;
                }

                if (addButton) {
                    addButton.classList.toggle('is-loading', isLoading);
                    addButton.disabled = isLoading;
                    addButton.setAttribute('aria-busy', isLoading ? 'true' : 'false');
                }
            }

            function setQuantitySyncState(isSyncing) {
                control.classList.toggle('is-syncing', isSyncing);

                if (wrap) {
                    wrap.classList.toggle('is-syncing', isSyncing);
                }
            }

            function pulseQuantitySync() {
                if (control.dataset.loading === 'true') {
                    return;
                }

                window.clearTimeout(quantityPulseTimer);
                setQuantitySyncState(true);

                quantityPulseTimer = window.setTimeout(function () {
                    setQuantitySyncState(false);
                }, 500);
            }

            control.querySelectorAll('[data-qty-action]').forEach(function (button) {
                button.addEventListener('click', function () {
                    if (control.dataset.loading === 'true') {
                        return;
                    }

                    var action = button.getAttribute('data-qty-action');
                    var currentValue = parseInt(input.value, 10);

                    if (isNaN(currentValue) || currentValue < 1) {
                        currentValue = 1;
                    }

                    if (action === 'increase') {
                        currentValue = currentValue + 1;
                    } else {
                        currentValue = Math.max(1, currentValue - 1);
                    }

                    input.value = currentValue;
                    syncQuantityState();
                    pulseQuantitySync();
                });
            });

            input.addEventListener('input', function () {
                syncQuantityState();
                pulseQuantitySync();
            });
            input.addEventListener('change', function () {
                syncQuantityState();
                pulseQuantitySync();
            });

            syncQuantityState();
            setLoadingState(false);
        });
    }

    function getSnackbarConfig() {
        var defaults = {
            messageTemplate: 'Product added to cart.',
            position: 'top-right',
            duration: 3800,
            showCartLink: true,
            showContinueLink: true,
            cartLabel: 'View cart',
            continueLabel: 'Continue shopping',
            cartUrl: '',
            continueUrl: ''
        };

        var config = window.NevariProductPage && window.NevariProductPage.snackbar ? window.NevariProductPage.snackbar : {};

        return Object.assign({}, defaults, config);
    }

    function getSnackbarElement() {
        return document.querySelector('[data-nevari-add-to-cart-snackbar]');
    }

    function formatSnackbarMessage(template, productName) {
        var text = template || 'Product added to cart.';

        return text.replace('{product_name}', productName || '').replace(/\s+/g, ' ').trim();
    }

    function setSnackbarLinks(snackbar, payload) {
        var cartLink = snackbar.querySelector('[data-nevari-snackbar-cart]');
        var continueLink = snackbar.querySelector('[data-nevari-snackbar-continue]');
        var actions = snackbar.querySelector('.nevari-add-to-cart-snackbar__actions');
        var hasVisibleLink = false;

        if (cartLink) {
            cartLink.href = payload.cartUrl || getSnackbarConfig().cartUrl || '#';
            cartLink.textContent = payload.cartLabel || getSnackbarConfig().cartLabel;
            cartLink.hidden = !payload.showCartLink;
            hasVisibleLink = hasVisibleLink || !cartLink.hidden;
        }

        if (continueLink) {
            continueLink.href = payload.continueUrl || getSnackbarConfig().continueUrl || '#';
            continueLink.textContent = payload.continueLabel || getSnackbarConfig().continueLabel;
            continueLink.hidden = !payload.showContinueLink;
            hasVisibleLink = hasVisibleLink || !continueLink.hidden;
        }

        if (actions) {
            actions.hidden = !hasVisibleLink;
        }
    }

    function hideSnackbar(snackbar) {
        if (!snackbar) {
            return;
        }

        snackbar.dataset.state = 'hiding';
        snackbar.classList.remove('is-visible');
        snackbar.setAttribute('aria-hidden', 'true');

        window.clearTimeout(snackbar._nevariHideTimer);
        window.clearTimeout(snackbar._nevariResetTimer);

        snackbar._nevariResetTimer = window.setTimeout(function () {
            snackbar.hidden = true;
            snackbar.dataset.state = 'idle';
        }, 260);
    }

    function showSnackbar(payload) {
        var snackbar = getSnackbarElement();
        var config = getSnackbarConfig();
        var data = Object.assign({}, config, payload || {});
        var titleNode = snackbar ? snackbar.querySelector('[data-nevari-snackbar-title]') : null;
        var messageNode = snackbar ? snackbar.querySelector('[data-nevari-snackbar-message]') : null;

        if (!snackbar || !messageNode) {
            return;
        }

        window.clearTimeout(snackbar._nevariHideTimer);
        window.clearTimeout(snackbar._nevariResetTimer);

        if (titleNode) {
            titleNode.textContent = data.title || 'Product added to cart';
        }

        messageNode.textContent = formatSnackbarMessage(data.message || data.messageTemplate, data.productName || '');
        setSnackbarLinks(snackbar, data);

        snackbar.hidden = false;
        snackbar.setAttribute('aria-hidden', 'false');
        snackbar.dataset.position = data.position || 'top-right';
        snackbar.dataset.state = 'showing';

        requestAnimationFrame(function () {
            snackbar.classList.add('is-visible');
            snackbar.dataset.state = 'visible';
        });

        snackbar._nevariHideTimer = window.setTimeout(function () {
            hideSnackbar(snackbar);
        }, Math.max(1800, parseInt(data.duration, 10) || 3800));
    }

    function initAddToCartSnackbar() {
        var snackbar = getSnackbarElement();
        if (!snackbar || snackbar.dataset.bound === 'true') {
            return;
        }

        snackbar.dataset.bound = 'true';

        var closeButton = snackbar.querySelector('[data-nevari-snackbar-close]');

        if (closeButton) {
            closeButton.addEventListener('click', function (event) {
                event.preventDefault();
                hideSnackbar(snackbar);
            });
        }

        if (window.jQuery) {
            window.jQuery(document.body).on('added_to_cart.nevariSnackbar', function (_event, _fragments, _cartHash, button) {
                var targetButton = button && button.jquery ? button.get(0) : button;
                if (targetButton && targetButton.classList && targetButton.classList.contains('nevari-ajax-add-to-cart')) {
                    return;
                }

                var productName = targetButton && targetButton.getAttribute ? (targetButton.getAttribute('data-product-name') || targetButton.getAttribute('data-product_name') || '') : '';
                var template = getSnackbarConfig().messageTemplate;
                var snackbarConfig = getSnackbarConfig();

                showSnackbar({
                    title: snackbarConfig.title,
                    message: formatSnackbarMessage(template, productName),
                    productName: productName,
                    cartUrl: snackbarConfig.cartUrl,
                    continueUrl: snackbarConfig.continueUrl,
                    cartLabel: snackbarConfig.cartLabel,
                    continueLabel: snackbarConfig.continueLabel,
                    showCartLink: snackbarConfig.showCartLink,
                    showContinueLink: snackbarConfig.showContinueLink,
                    position: snackbarConfig.position,
                    duration: snackbarConfig.duration
                });
            });
        }
    }

    function initAjaxAddToCart() {
        document.querySelectorAll('[data-nevari-ajax-add-to-cart]').forEach(function (button) {
            if (button.dataset.bound === 'true') {
                return;
            }

            button.dataset.bound = 'true';

            button.addEventListener('click', function () {
                var wrap = button.closest('.nevari-ajax-add-to-cart-wrap');
                var control = wrap ? wrap.querySelector('[data-nevari-ajax-qty-control]') : null;
                var quantityInput = control ? control.querySelector('[data-nevari-ajax-quantity-input]') : null;

                if (button.dataset.loading === 'true' || (control && control.dataset.loading === 'true')) {
                    return;
                }

                var productId = button.getAttribute('data-product-id');
                var quantity = quantityInput ? quantityInput.value : (button.getAttribute('data-quantity') || '1');
                var labelNode = button.querySelector('.nevari-ajax-add-to-cart__label');
                var statusNode = wrap ? wrap.querySelector('.nevari-ajax-add-to-cart__status') : null;
                var addedLabel = button.getAttribute('data-added-label') || (window.NevariProductPage && window.NevariProductPage.messages ? window.NevariProductPage.messages.addToCartDone : 'Added to cart.');
                var noticeTemplate = button.getAttribute('data-snackbar-template') || button.getAttribute('data-notice-template') || '{product_name} has been added to cart';
                var productName = button.getAttribute('data-product-name') || '';

                if (!productId) {
                    return;
                }

                var snackbarConfig = getSnackbarConfig();
                button.dataset.loading = 'true';
                button.classList.add('is-loading');
                button.disabled = true;
                button.setAttribute('aria-busy', 'true');
                if (control) {
                    control.dataset.loading = 'true';
                    control.classList.add('is-updating');
                }
                if (wrap) {
                    wrap.classList.add('is-loading');
                }

                var originalLabel = labelNode ? labelNode.textContent : button.textContent;

                if (statusNode) {
                    statusNode.textContent = '';
                }

                var body = new URLSearchParams();
                body.set('action', 'nevari_add_to_cart');
                body.set('product_id', productId);
                body.set('quantity', quantity);
                body.set('nonce', window.NevariProductPage ? window.NevariProductPage.addToCartNonce : '');

                fetch(window.NevariProductPage.ajaxUrl, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
                    },
                    body: body.toString()
                }).then(function (response) {
                    return response.json();
                }).then(function (payload) {
                    if (!payload || !payload.success) {
                        throw new Error(payload && payload.data && payload.data.message ? payload.data.message : 'Request failed');
                    }

                    if (labelNode) {
                        labelNode.textContent = addedLabel;
                    } else {
                        button.textContent = addedLabel;
                    }

                    button.classList.remove('is-loading');
                    button.classList.add('is-added');
                    button.disabled = false;
                    button.setAttribute('aria-busy', 'false');
                    button.dataset.loading = 'false';
                    if (control) {
                        control.dataset.loading = 'false';
                        control.classList.remove('is-updating');
                    }
                    if (wrap) {
                        wrap.classList.remove('is-loading');
                        wrap.setAttribute('aria-busy', 'false');
                    }

                    if (statusNode) {
                        statusNode.textContent = window.NevariProductPage && window.NevariProductPage.messages ? window.NevariProductPage.messages.addToCartDone : addedLabel;
                    }

                    showSnackbar(payload.data && payload.data.snackbar ? payload.data.snackbar : {
                        title: snackbarConfig.title,
                        message: formatSnackbarMessage(noticeTemplate, productName),
                        product_name: productName,
                        cart_url: snackbarConfig.cartUrl,
                        continue_url: snackbarConfig.continueUrl,
                        cart_label: snackbarConfig.cartLabel,
                        continue_label: snackbarConfig.continueLabel,
                        show_cart_link: snackbarConfig.showCartLink,
                        show_continue_link: snackbarConfig.showContinueLink,
                        position: snackbarConfig.position,
                        duration: snackbarConfig.duration
                    });

                    if (window.jQuery) {
                        window.jQuery(document.body).trigger('added_to_cart', [{}, '', button]);
                    }

                    window.setTimeout(function () {
                        if (labelNode) {
                            labelNode.textContent = originalLabel;
                        } else {
                            button.textContent = originalLabel;
                        }

                        button.classList.remove('is-added');
                        button.setAttribute('aria-busy', 'false');
                    }, 1800);
                }).catch(function () {
                    button.classList.remove('is-loading');
                    button.disabled = false;
                    button.setAttribute('aria-busy', 'false');
                    button.dataset.loading = 'false';
                    if (control) {
                        control.dataset.loading = 'false';
                        control.classList.remove('is-updating');
                    }
                    if (wrap) {
                        wrap.classList.remove('is-loading');
                        wrap.setAttribute('aria-busy', 'false');
                    }

                    if (statusNode) {
                        statusNode.textContent = window.NevariProductPage && window.NevariProductPage.messages ? window.NevariProductPage.messages.addToCartError : 'Unable to add this product to the cart.';
                    }

                    if (window.console && window.console.warn) {
                        window.console.warn(window.NevariProductPage && window.NevariProductPage.messages ? window.NevariProductPage.messages.addToCartError : 'Unable to add this product to the cart.');
                    }
                });
            });
        });
    }

    function init() {
        initGallery();
        initAccordion();
        initReviewScroll();
        initAjaxQuantityControls();
        initAddToCartSnackbar();
        initAjaxAddToCart();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
