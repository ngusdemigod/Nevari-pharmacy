<?php
if (!defined('ABSPATH')) {
    exit;
}

final class Nevari_Emails {
    private const MAX_ATTEMPTS = 3;
    private const APPOINTMENT_SENT_COLUMNS = [
        'customer_confirmation_sent_at',
        'doctor_confirmation_sent_at',
    ];

    public static function init(): void {
        add_action('nevari_send_queued_email', [__CLASS__, 'send_queued_email'], 10, 1);
    }

    public static function get_active_template(string $template_key) {
        global $wpdb;
        $table = Nevari_Helpers::table('email_templates');
        return $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$table} WHERE template_key = %s AND status = 'active' ORDER BY version DESC LIMIT 1",
            sanitize_key($template_key)
        ));
    }

    public static function render_template($template, array $variables): array {
        $subject = (string) $template->subject;
        $body_html = (string) $template->body_html;
        $body_text = (string) $template->body_text;

        foreach ($variables as $key => $value) {
            if (is_array($value)) {
                $safe_html = isset($value['html']) ? wp_kses_post((string) $value['html']) : '';
                $safe_text = isset($value['text']) ? sanitize_text_field((string) $value['text']) : wp_strip_all_tags($safe_html);
            } elseif (is_scalar($value) || $value === null) {
                $safe_html = esc_html((string) $value);
                $safe_text = sanitize_text_field((string) $value);
            } else {
                continue;
            }

            $subject = str_replace('{{' . $key . '}}', $safe_text, $subject);
            $subject = str_replace('{{ ' . $key . ' }}', $safe_text, $subject);
            $subject = str_replace('{' . $key . '}', $safe_text, $subject);
            $body_html = str_replace('{{' . $key . '}}', $safe_html, $body_html);
            $body_html = str_replace('{{ ' . $key . ' }}', $safe_html, $body_html);
            $body_html = str_replace('{' . $key . '}', $safe_html, $body_html);
            $body_text = str_replace('{{' . $key . '}}', $safe_text, $body_text);
            $body_text = str_replace('{{ ' . $key . ' }}', $safe_text, $body_text);
            $body_text = str_replace('{' . $key . '}', $safe_text, $body_text);
        }

        $supported_placeholder = '/\{\{\s*[a-zA-Z0-9_]+\s*\}\}|\{[a-zA-Z0-9_]+\}/';
        $subject = preg_replace($supported_placeholder, '', $subject);
        $body_html = preg_replace($supported_placeholder, '', $body_html);
        $body_text = preg_replace($supported_placeholder, '', $body_text);

        return [
            'subject' => sanitize_text_field($subject),
            'body_html' => self::wrap_html(sanitize_text_field($subject), wp_kses_post($body_html)),
            'body_text' => sanitize_textarea_field($body_text),
        ];
    }

    public static function queue_or_send(array $args, bool $send_now = true) {
        global $wpdb;
        $template_key = isset($args['template_key']) ? sanitize_key((string) $args['template_key']) : '';
        $template = $template_key ? self::get_active_template($template_key) : null;

        $recipient_user_id = isset($args['recipient_user_id']) ? (int) $args['recipient_user_id'] : null;
        $recipient_email = isset($args['recipient_email']) ? sanitize_email((string) $args['recipient_email']) : '';
        if (!$recipient_email && $recipient_user_id) {
            $user = get_user_by('id', $recipient_user_id);
            $recipient_email = $user ? $user->user_email : '';
        }
        if (!$recipient_email || !is_email($recipient_email)) {
            return new WP_Error('invalid_recipient', 'A valid recipient email is required.');
        }

        if ($template) {
            $rendered = self::render_template($template, isset($args['variables']) && is_array($args['variables']) ? $args['variables'] : []);
            $subject = $rendered['subject'];
            $body_html = $rendered['body_html'];
            $body_text = $rendered['body_text'];
            $variables = isset($args['variables']) && is_array($args['variables']) ? $args['variables'] : [];
            $payment_link = isset($variables['payment_link']) ? esc_url_raw((string) $variables['payment_link']) : '';
            if ($template->template_key === 'order-invoice-email' && $payment_link && strpos($body_html, $payment_link) === false) {
                $payment_link_value = $variables['payment_link_html'] ?? '';
                $payment_link_html = is_array($payment_link_value)
                    ? wp_kses_post((string) ($payment_link_value['html'] ?? ''))
                    : wp_kses_post((string) $payment_link_value);
                if (!$payment_link_html) {
                    $payment_link_html = sprintf('<p><a href="%1$s" target="_blank" rel="noopener noreferrer">Pay now</a></p>', esc_url($payment_link));
                } else {
                    $payment_link_html = '<div class="payment-link-cta">' . $payment_link_html . '</div>';
                }
                $body_html .= '<div class="payment-link-cta" style="margin-top:24px;padding:18px;border:1px solid #d8e0ef;border-radius:16px;background:#f7f9fc;">'
                    . '<p style="margin:0 0 8px;">Pay your balance using the secure link below.</p>'
                    . $payment_link_html
                    . '</div>';
                if (strpos($body_text, $payment_link) === false) {
                    $body_text .= "\nPay here: " . $payment_link;
                }
            }
            $google_meet_link = isset($variables['google_meet_link']) ? esc_url_raw((string) $variables['google_meet_link']) : '';
            if ($google_meet_link && !wp_http_validate_url($google_meet_link)) {
                $google_meet_link = '';
            }
            $appointment_templates_with_meet_links = [
                'appointment_requested',
                'appointment_payment_receipt',
                'appointment_customer_confirmation',
                'appointment_doctor_notification',
                'appointment_admin_notification',
                'appointment_reminder',
                'appointment_customer_reminder_24h',
                'appointment_customer_reminder_1h',
                'appointment_customer_reminder_2h',
                'appointment_customer_reminder_30m',
                'appointment_customer_reminder_5m',
                'appointment_customer_start',
                'appointment_doctor_reminder_24h',
                'appointment_doctor_reminder_1h',
                'appointment_doctor_reminder_2h',
                'appointment_doctor_reminder_30m',
                'appointment_doctor_reminder_5m',
                'appointment_doctor_start',
                'appointment_customer_ending_soon',
                'appointment_doctor_ending_soon',
                'appointment_waiting_notification',
                'appointment_rescheduled',
                'appointment-approved',
            ];
            if (in_array($template->template_key, $appointment_templates_with_meet_links, true) && $google_meet_link && strpos($body_html, $google_meet_link) === false) {
                $google_meet_link_html = '';
                if (isset($variables['google_meet_link_html'])) {
                    $google_meet_link_html = is_array($variables['google_meet_link_html'])
                        ? wp_kses_post((string) ($variables['google_meet_link_html']['html'] ?? ''))
                        : wp_kses_post((string) $variables['google_meet_link_html']);
                }
                if (!$google_meet_link_html) {
                    $google_meet_link_html = sprintf('<a href="%1$s" target="_blank" rel="noopener noreferrer">Join Appointment</a>', esc_url($google_meet_link));
                }
                $body_html .= '<div class="meeting-link-cta" style="margin-top:24px;padding:18px;border:1px solid #d8e0ef;border-radius:16px;background:#f7f9fc;">'
                    . '<p style="margin:0 0 8px;">Join the consultation using the link below.</p>'
                    . $google_meet_link_html
                    . '</div>';
                if (strpos($body_text, $google_meet_link) === false) {
                    $body_text .= "\nJoin appointment: " . $google_meet_link;
                }
            }
        } else {
            $subject = isset($args['subject']) ? sanitize_text_field((string) $args['subject']) : '';
            $body_html = isset($args['body_html']) ? wp_kses_post((string) $args['body_html']) : '';
            $body_text = isset($args['body_text']) ? sanitize_textarea_field((string) $args['body_text']) : wp_strip_all_tags($body_html);
            if (!$subject || !$body_html) {
                return new WP_Error('template_not_found', 'Template not found and custom subject/body were not provided.');
            }
        }

        $now = Nevari_Helpers::now();
        $wpdb->insert(Nevari_Helpers::table('email_logs'), [
            'template_key' => $template ? $template->template_key : null,
            'template_version' => $template ? (int) $template->version : null,
            'recipient_email' => $recipient_email,
            'recipient_user_id' => $recipient_user_id ?: null,
            'sender_email' => get_option('admin_email'),
            'subject' => $subject,
            'body_preview' => wp_trim_words(wp_strip_all_tags($body_html), 40),
            'related_object_type' => isset($args['related_object_type']) ? sanitize_key((string) $args['related_object_type']) : null,
            'related_object_id' => isset($args['related_object_id']) ? (int) $args['related_object_id'] : null,
            'status' => 'queued',
            'provider' => 'wp_mail',
            'sent_by' => get_current_user_id() ?: null,
            'queued_at' => $now,
            'created_at' => $now,
        ], ['%s', '%d', '%s', '%d', '%s', '%s', '%s', '%s', '%d', '%s', '%s', '%d', '%s', '%s']);

        $log_id = (int) $wpdb->insert_id;
        update_option('_nevari_email_payload_' . $log_id, [
            'body_html' => $body_html,
            'body_text' => isset($body_text) ? $body_text : '',
            'attachments' => isset($args['attachments']) && is_array($args['attachments']) ? array_values($args['attachments']) : [],
            'attempts' => 0,
            'max_attempts' => isset($args['max_attempts']) ? max(1, (int) $args['max_attempts']) : self::MAX_ATTEMPTS,
        ], false);

        Nevari_Audit::log('emails', 'nevari', 'email.queued', 'success', [
            'email_log_id' => $log_id,
            'related_user_id' => $recipient_user_id ?: null,
            'message' => 'Email queued.',
        ]);

        if ($send_now) {
            self::send_queued_email($log_id);
        } elseif (function_exists('as_enqueue_async_action')) {
            as_enqueue_async_action('nevari_send_queued_email', [$log_id], 'nevari');
        } else {
            wp_schedule_single_event(time() + 5, 'nevari_send_queued_email', [$log_id]);
        }

        self::mark_appointment_email_sent_if_requested($args);

        return $log_id;
    }

    private static function mark_appointment_email_sent_if_requested(array $args): void {
        $related_type = isset($args['related_object_type']) ? sanitize_key((string) $args['related_object_type']) : '';
        $related_id = isset($args['related_object_id']) ? (int) $args['related_object_id'] : 0;
        $sent_column = isset($args['appointment_sent_column']) ? sanitize_key((string) $args['appointment_sent_column']) : '';
        if ($related_type !== 'appointment' || $related_id < 1 || !in_array($sent_column, self::APPOINTMENT_SENT_COLUMNS, true)) {
            return;
        }

        global $wpdb;
        $wpdb->update(Nevari_Helpers::table('appointments'), [
            $sent_column => Nevari_Helpers::now(),
            'updated_at' => Nevari_Helpers::now(),
        ], ['id' => $related_id], ['%s', '%s'], ['%d']);
    }

    public static function send_queued_email(int $log_id): void {
        global $wpdb;
        $table = Nevari_Helpers::table('email_logs');
        $log = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$table} WHERE id = %d", $log_id));
        if (!$log || !in_array($log->status, ['queued', 'failed'], true)) {
            return;
        }

        $payload = get_option('_nevari_email_payload_' . $log_id, []);
        $payload = is_array($payload) ? $payload : [];
        $body = isset($payload['body_html']) ? (string) $payload['body_html'] : '';
        $payload['attempts'] = isset($payload['attempts']) ? (int) $payload['attempts'] + 1 : 1;
        update_option('_nevari_email_payload_' . $log_id, $payload, false);
        $wpdb->update($table, ['status' => 'sending'], ['id' => $log_id], ['%s'], ['%d']);

        $attachments = self::materialize_attachments(isset($payload['attachments']) && is_array($payload['attachments']) ? $payload['attachments'] : []);
        $sent = wp_mail($log->recipient_email, $log->subject, $body, ['Content-Type: text/html; charset=UTF-8'], $attachments);
        self::cleanup_attachments($attachments);
        if ($sent) {
            $wpdb->update($table, [
                'status' => 'sent',
                'sent_at' => Nevari_Helpers::now(),
                'error_code' => null,
                'error_message' => null,
            ], ['id' => $log_id], ['%s', '%s', '%s', '%s'], ['%d']);
            Nevari_Audit::log('emails', 'nevari', 'email.sent', 'success', [
                'email_log_id' => $log_id,
                'related_user_id' => $log->recipient_user_id ? (int) $log->recipient_user_id : null,
                'message' => 'Email sent successfully.',
            ]);
        } else {
            $max_attempts = isset($payload['max_attempts']) ? (int) $payload['max_attempts'] : self::MAX_ATTEMPTS;
            $wpdb->update($table, [
                'status' => 'failed',
                'failed_at' => Nevari_Helpers::now(),
                'error_code' => 'wp_mail_failed',
                'error_message' => 'wp_mail returned false.',
            ], ['id' => $log_id], ['%s', '%s', '%s', '%s'], ['%d']);
            Nevari_Audit::log('emails', 'nevari', 'email.send_failed', 'error', [
                'email_log_id' => $log_id,
                'related_user_id' => $log->recipient_user_id ? (int) $log->recipient_user_id : null,
                'error_code' => 'wp_mail_failed',
                'error_message' => 'wp_mail returned false.',
                'message' => 'Email failed to send.',
            ]);
            if ((int) $payload['attempts'] < $max_attempts) {
                if (function_exists('as_schedule_single_action')) {
                    as_schedule_single_action(time() + 120, 'nevari_send_queued_email', [$log_id], 'nevari');
                } else {
                    wp_schedule_single_event(time() + 120, 'nevari_send_queued_email', [$log_id]);
                }
            }
        }
    }

    private static function wrap_html(string $subject, string $body_html): string {
        $site_name = wp_specialchars_decode(get_bloginfo('name'), ENT_QUOTES);
        return '<div style="margin:0;padding:24px;background:#f4efe7;font-family:Arial,sans-serif;color:#22314d;">'
            . '<div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #e6ded3;">'
            . '<div style="padding:28px 32px;background:#16356d;color:#ffffff;">'
            . '<div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.8;">' . esc_html($site_name) . '</div>'
            . '<h1 style="margin:10px 0 0;font-size:24px;line-height:1.3;">' . esc_html($subject) . '</h1>'
            . '</div>'
            . '<div style="padding:32px;font-size:15px;line-height:1.7;">' . $body_html . '</div>'
            . '<div style="padding:0 32px 28px;color:#6d7586;font-size:13px;">This email was sent by ' . esc_html($site_name) . '.</div>'
            . '</div>'
            . '</div>';
    }

    private static function materialize_attachments(array $attachments): array {
        $paths = [];
        foreach ($attachments as $attachment) {
            if (!is_array($attachment) || empty($attachment['filename'])) {
                continue;
            }
            $filename = sanitize_file_name((string) $attachment['filename']);
            if ($filename === '') {
                continue;
            }

            $upload_dir = wp_upload_dir();
            $base_dir = isset($upload_dir['basedir']) ? (string) $upload_dir['basedir'] : '';
            if ($base_dir === '') {
                continue;
            }

            $tmp_dir = trailingslashit($base_dir) . 'nevari-mail-tmp/' . wp_generate_uuid4();
            if (!wp_mkdir_p($tmp_dir)) {
                continue;
            }
            $tmp = trailingslashit($tmp_dir) . $filename;

            $content = '';
            if (!empty($attachment['base64'])) {
                $decoded = base64_decode((string) $attachment['base64'], true);
                $content = $decoded === false ? '' : $decoded;
            } elseif (!empty($attachment['content_base64'])) {
                $decoded = base64_decode((string) $attachment['content_base64'], true);
                $content = $decoded === false ? '' : $decoded;
            } elseif (isset($attachment['content'])) {
                $raw = (string) $attachment['content'];
                $decoded = base64_decode($raw, true);
                $content = $decoded !== false && $decoded !== '' ? $decoded : $raw;
            }
            if ($content === '') {
                continue;
            }
            $written = file_put_contents($tmp, $content);
            if ($written === false) {
                @rmdir($tmp_dir); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
                continue;
            }
            $paths[] = $tmp;
        }
        return $paths;
    }

    private static function cleanup_attachments(array $paths): void {
        foreach ($paths as $path) {
            if (is_string($path) && $path !== '' && file_exists($path)) {
                wp_delete_file($path);
                $dir = dirname($path);
                if (strpos($dir, 'nevari-mail-tmp') !== false && is_dir($dir)) {
                    @rmdir($dir); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
                }
            }
        }
    }
}
