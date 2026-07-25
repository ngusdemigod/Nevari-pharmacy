(function () {
    function getConfig() {
        return window.NevariAuthWidget || {};
    }

    function setMessage(widget, message, type) {
        var box = widget.querySelector('.nevari-auth-widget__message');
        if (!box) {
            return;
        }

        if (!message) {
            box.hidden = true;
            box.textContent = '';
            box.classList.remove('is-error', 'is-success');
            return;
        }

        box.hidden = false;
        box.textContent = message;
        box.classList.toggle('is-error', type === 'error');
        box.classList.toggle('is-success', type === 'success');
    }

    function activateTab(widget, tabName) {
        widget.querySelectorAll('.nevari-auth-widget__tab').forEach(function (tab) {
            var isActive = tab.getAttribute('data-nevari-auth-tab') === tabName;
            tab.classList.toggle('is-active', isActive);
        });
    }

    function setState(widget, stateName) {
        widget.querySelectorAll('[data-nevari-auth-state]').forEach(function (state) {
            var active = state.getAttribute('data-nevari-auth-state') === stateName;
            state.hidden = !active;
            state.classList.toggle('is-active', active);
        });

        if (stateName === 'signup') {
            activateTab(widget, 'signup');
        } else {
            activateTab(widget, 'login');
        }
    }

    function updateVerifyState(widget, payload) {
        var challenge = widget.querySelector('[data-nevari-auth-challenge]');
        var frontend = widget.querySelector('[data-nevari-auth-frontend-type]');
        var maskedEmail = widget.querySelector('[data-nevari-auth-masked-email]');
        var ssoTransaction = widget.querySelector('[data-nevari-auth-sso-transaction]');

        if (challenge && payload.challenge_id) {
            challenge.value = payload.challenge_id;
        }
        if (frontend && payload.frontend_type) {
            frontend.value = payload.frontend_type;
        }
        if (maskedEmail && payload.masked_email) {
            maskedEmail.textContent = payload.masked_email;
        }
        if (ssoTransaction && payload.sso_transaction_id) {
            ssoTransaction.value = payload.sso_transaction_id;
        }
    }

    function disableForm(form, disabled) {
        form.querySelectorAll('input, button').forEach(function (field) {
            field.disabled = disabled;
        });
    }

    function postForm(formData) {
        var config = getConfig();
        return fetch(config.ajaxUrl, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
            },
            body: new URLSearchParams(formData).toString()
        }).then(function (response) {
            return response.json().then(function (json) {
                return {
                    ok: response.ok,
                    status: response.status,
                    json: json
                };
            });
        });
    }

    function handleSuccess(widget, formType, payload) {
        if (payload.verification_required) {
            updateVerifyState(widget, payload);
            setState(widget, 'verify');
            setMessage(widget, payload.message || 'Verification required.', 'success');
            return;
        }

        if (formType === 'reset') {
            setMessage(widget, payload.message || 'Request submitted.', 'success');
            setState(widget, 'login');
            return;
        }

        if (formType === 'verify' || formType === 'login' || formType === 'signup') {
            setMessage(widget, payload.message || 'Success.', 'success');
        }

        var checkoutModal = widget.closest('[data-nevari-checkout-auth-modal]');
        if (checkoutModal && (formType === 'verify' || formType === 'login' || formType === 'signup')) {
            checkoutModal.hidden = true;
            document.documentElement.style.overflow = '';
            document.documentElement.classList.remove('nevari-checkout-auth-lock');
            document.body.classList.remove('nevari-checkout-auth-lock');
            document.dispatchEvent(new CustomEvent('nevari:checkout-authenticated'));
            if (window.jQuery) {
                window.jQuery(document.body).trigger('update_checkout');
            }
            return;
        }

        if (payload.redirect_url) {
            window.location.href = payload.redirect_url;
        }
    }

    function bindForm(widget, form) {
        var formType = form.getAttribute('data-nevari-auth-form');
        if (!formType || form.dataset.bound === 'true') {
            return;
        }

        form.dataset.bound = 'true';

        form.addEventListener('submit', function (event) {
            event.preventDefault();
            setMessage(widget, '', '');

            var formData = new FormData(form);
            if (!formData.get('nonce')) {
                formData.set('nonce', getConfig().nonce || '');
            }

            disableForm(form, true);

            postForm(formData)
                .then(function (result) {
                    var payload = result && result.json && result.json.data ? result.json.data : {};
                    if (!result || !result.json || !result.json.success) {
                        var errorPayload = result && result.json && result.json.data ? result.json.data : {};
                        setMessage(widget, errorPayload.message || 'Unable to complete this request.', 'error');
                        return;
                    }

                    handleSuccess(widget, formType, payload);
                })
                .catch(function () {
                    setMessage(widget, 'Unable to complete this request.', 'error');
                })
                .finally(function () {
                    disableForm(form, false);
                });
        });
    }

    function bindViewTriggers(widget) {
        widget.querySelectorAll('[data-nevari-auth-view]').forEach(function (button) {
            if (button.dataset.bound === 'true') {
                return;
            }

            button.dataset.bound = 'true';
            button.addEventListener('click', function () {
                setMessage(widget, '', '');
                setState(widget, button.getAttribute('data-nevari-auth-view'));
            });
        });

        widget.querySelectorAll('.nevari-auth-widget__tab').forEach(function (button) {
            if (button.dataset.bound === 'true') {
                return;
            }

            button.dataset.bound = 'true';
            button.addEventListener('click', function () {
                setMessage(widget, '', '');
                setState(widget, button.getAttribute('data-nevari-auth-tab'));
            });
        });
    }

    function bindResend(widget) {
        var button = widget.querySelector('[data-nevari-auth-resend]');
        if (!button || button.dataset.bound === 'true') {
            return;
        }

        button.dataset.bound = 'true';

        button.addEventListener('click', function () {
            var challenge = widget.querySelector('[data-nevari-auth-challenge]');
            var frontend = widget.querySelector('[data-nevari-auth-frontend-type]');
            if (!challenge || !frontend || !challenge.value || !frontend.value) {
                setMessage(widget, 'Verification details are missing.', 'error');
                return;
            }

            var formData = new FormData();
            formData.set('action', 'nevari_auth_widget_resend_code');
            formData.set('nonce', getConfig().nonce || '');
            formData.set('challenge_id', challenge.value);
            formData.set('frontend_type', frontend.value);

            button.disabled = true;

            postForm(formData)
                .then(function (result) {
                    var payload = result && result.json && result.json.data ? result.json.data : {};
                    if (!result || !result.json || !result.json.success) {
                        setMessage(widget, payload.message || 'We could not resend the code right now.', 'error');
                        return;
                    }

                    updateVerifyState(widget, payload);
                    setMessage(widget, payload.message || 'A new verification code has been sent.', 'success');
                })
                .catch(function () {
                    setMessage(widget, 'We could not resend the code right now.', 'error');
                })
                .finally(function () {
                    window.setTimeout(function () {
                        button.disabled = false;
                    }, 1500);
                });
        });
    }

    function initWidget(widget) {
        bindViewTriggers(widget);
        bindResend(widget);
        widget.querySelectorAll('[data-nevari-auth-form]').forEach(function (form) {
            bindForm(widget, form);
        });

        if (widget.getAttribute('data-initial-challenge')) {
            setState(widget, 'verify');
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        document.querySelectorAll('.nevari-auth-widget').forEach(initWidget);
        if (window.jQuery) {
            window.jQuery(document.body).on('checkout_error', function () {
                var modal = document.querySelector('[data-nevari-checkout-auth-modal]');
                var notices = document.querySelector('.woocommerce-error');
                if (modal && notices && /sign in|create an account/i.test(notices.textContent || '')) {
                    modal.hidden = false;
                    document.documentElement.style.overflow = 'hidden';
                }
            });
        }
    });
})();
