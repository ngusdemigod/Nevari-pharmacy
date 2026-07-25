from pathlib import Path

path = Path(r'D:/dev/nevari-pharmacy-core/NevariAdmin Storefront/app/_customer-dashboard.js')
text = path.read_text(encoding='utf-8')
old = '''const CUSTOMER_NOTIFICATION_OPTIONS = [
  ["appointmentReminders", "Appointment reminders"],
  ["prescriptionAlerts", "Medication reminders"],
  ["refundTracking", "Lab result updates"],
  ["paymentReceipts", "Payment updates"],
  ["marketingOptIn", "Health tips"]
];'''
new = '''const CUSTOMER_NOTIFICATION_OPTIONS = [
  ["appointmentReminders", "Appointment reminders"],
  ["prescriptionAlerts", "Medication reminders"],
  ["paymentReceipts", "Payment updates"]
];'''
if old not in text:
    raise SystemExit('Notification options snippet not found.')
path.write_text(text.replace(old, new), encoding='utf-8')
