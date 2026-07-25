const fs = require('fs');
const path = 'D:/dev/nevari-pharmacy-core/nevari-pharmacy-core/includes/class-nevari-admin.php';
const text = fs.readFileSync(path, 'utf8');
const oldText = "            'rest_prescriptions_write' => ['label' => 'Prescriptions write', 'default_limit' => 20, 'default_window' => MINUTE_IN_SECONDS],\n            'rest_emails_write' => ['label' => 'Email send/template actions', 'default_limit' => 5, 'default_window' => MINUTE_IN_SECONDS],";
const newText = "            'rest_prescriptions_write' => ['label' => 'Prescriptions write', 'default_limit' => 20, 'default_window' => MINUTE_IN_SECONDS],\n            'rest_customer_profile_image_write' => ['label' => 'Customer profile image uploads', 'default_limit' => 12, 'default_window' => HOUR_IN_SECONDS],\n            'rest_emails_write' => ['label' => 'Email send/template actions', 'default_limit' => 5, 'default_window' => MINUTE_IN_SECONDS],";
if (!text.includes(oldText)) {
  throw new Error('Target snippet not found in class-nevari-admin.php');
}
fs.writeFileSync(path, text.replace(oldText, newText));
