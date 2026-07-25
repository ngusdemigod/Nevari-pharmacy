from pathlib import Path
p = Path(r'D:/dev/nevari-pharmacy-core/NevariAdmin Storefront/app/_customer-dashboard.js')
text = p.read_text(encoding='utf-8')
old = '''    function handleEscape(event) {
      if (event.key === "Escape") {
        setViewerOpen(false);
        setUploadOpen(false);
        setMenuOpen(false);
        setPendingFile(null);
        setPendingImageMeta(null);
        setCropState(null);
        setCropError("");
        setLocalError("");
        if (inputRef?.current) {
          inputRef.current.value = "";
        }
        window.setTimeout(() => triggerRef.current?.focus(), 0);
      }
    }'''
new = '''    function handleEscape(event) {
      if (event.key === "Escape") {
        if (uploading) {
          return;
        }
        setViewerOpen(false);
        setUploadOpen(false);
        setMenuOpen(false);
        setPendingFile(null);
        setPendingImageMeta(null);
        setCropState(null);
        setCropError("");
        setLocalError("");
        if (inputRef?.current) {
          inputRef.current.value = "";
        }
        window.setTimeout(() => triggerRef.current?.focus(), 0);
      }
    }'''
if old not in text:
    raise SystemExit('widget escape block not found')
p.write_text(text.replace(old, new, 1), encoding='utf-8')
print('patched escape guard')
