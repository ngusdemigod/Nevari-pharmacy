const fs = require('fs');

const updates = [
  {
    path: 'D:/dev/nevari-pharmacy-core/nevari-pharmacy-core/includes/class-nevari-helpers.php',
    oldText: "            'rest_prescriptions_write' => ['limit' => 20, 'window' => MINUTE_IN_SECONDS],\r\n            'rest_emails_write' => ['limit' => 5, 'window' => MINUTE_IN_SECONDS],",
    newText: "            'rest_prescriptions_write' => ['limit' => 20, 'window' => MINUTE_IN_SECONDS],\r\n            'rest_customer_profile_image_write' => ['limit' => 12, 'window' => HOUR_IN_SECONDS],\r\n            'rest_emails_write' => ['limit' => 5, 'window' => MINUTE_IN_SECONDS],"
  },
  {
    path: 'D:/dev/nevari-pharmacy-core/nevari-pharmacy-core/includes/class-nevari-admin.php',
    oldText: "            'rest_prescriptions_read' => ['label' => 'Prescriptions read', 'default_limit' => 120, 'default_window' => MINUTE_IN_SECONDS],\r\n            'rest_prescriptions_write' => ['label' => 'Prescriptions write', 'default_limit' => 20, 'default_window' => MINUTE_IN_SECONDS],\r\n            'rest_emails_write' => ['label' => 'Email send/template actions', 'default_limit' => 5, 'default_window' => MINUTE_IN_SECONDS],",
    newText: "            'rest_prescriptions_read' => ['label' => 'Prescriptions read', 'default_limit' => 120, 'default_window' => MINUTE_IN_SECONDS],\r\n            'rest_prescriptions_write' => ['label' => 'Prescriptions write', 'default_limit' => 20, 'default_window' => MINUTE_IN_SECONDS],\r\n            'rest_customer_profile_image_write' => ['label' => 'Customer profile image uploads', 'default_limit' => 12, 'default_window' => HOUR_IN_SECONDS],\r\n            'rest_emails_write' => ['label' => 'Email send/template actions', 'default_limit' => 5, 'default_window' => MINUTE_IN_SECONDS],"
  }
];

for (const update of updates) {
  const text = fs.readFileSync(update.path, 'utf8');
  if (!text.includes(update.oldText)) {
    throw new Error();
  }
  fs.writeFileSync(update.path, text.replace(update.oldText, update.newText));
}
