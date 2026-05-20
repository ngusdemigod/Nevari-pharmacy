<?php
if (!defined('ABSPATH')) {
    exit;
}

final class Nevari_Emails {
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
            if (is_scalar($value) || $value === null) {
                $safe_html = esc_html((string) $value);
                $safe_text = sanitize_text_field((string) $value);
                $subject = str_replace('{{' . $key . '}}', $safe_text, $subject);
                $subject = str_replace('{{ ' . $key . ' }}', $safe_text, $subject);
                $body_html = str_replace('{{' . $key . '}}', $safe_html, $body_html);
                $body_html = str_replace('{{ ' . $key . ' }}', $safe_html, $body_html);
                $body_text = str_replace('{{' . $key . '}}', $safe_text, $body_text);
                $body_text = str_replace('{{ ' . $key . ' }}', $safe_text, $body_text);
            }
        }

        return [
            'subject' => sanitize_text_field($subject),
            'body_html' => wp_kses_post($body_html),
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
        } else {
            $subject = isset($args['subject']) ? sanitize_text_field((string) $args['subject']) : '';
            $body_html = isset($args['body_html']) ? wp_kses_post((string) $args['body_html']) : '';
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
        update_option('_nevari_email_body_' . $log_id, $body_html, false);

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

        return $log_id;
    }

    public static function send_queued_email(int $log_id): void {
        global $wpdb;
        $table = Nevari_Helpers::table('email_logs');
        $log = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$table} WHERE id = %d", $log_id));
        if (!$log || !in_array($log->status, ['queued', 'failed'], true)) {
            return;
        }

        $body = (string) get_option('_nevari_email_body_' . $log_id, '');
        $wpdb->update($table, ['status' => 'sending'], ['id' => $log_id], ['%s'], ['%d']);

        $sent = wp_mail($log->recipient_email, $log->subject, $body, ['Content-Type: text/html; charset=UTF-8']);
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
        }
    }
}
