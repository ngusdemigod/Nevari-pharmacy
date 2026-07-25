from pathlib import Path
text = Path(r'D:/dev/nevari-pharmacy-core/NevariAdmin Storefront/app/_customer-dashboard.js').read_text(encoding='utf-8')
for marker in ['function patchCustomerProfileAvatarState', 'setSession((current) => current ? {', 'setSession?.((current) => current ? {']:
    idx = text.find(marker)
    print('MARKER', marker, idx)
    print(text[idx:idx+600])
    print('---')
