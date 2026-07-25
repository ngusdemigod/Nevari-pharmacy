const fs = require('fs');

function patchFile(path, updater) {
  const raw = fs.readFileSync(path, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  let content = raw.replace(/\r\n/g, '\n');
  content = updater(content);
  fs.writeFileSync(path, content.replace(/\n/g, eol));
}

function replaceOrThrow(content, oldText, newText, label) {
  if (!content.includes(oldText)) {
    throw new Error('Missing anchor: ' + label);
  }
  return content.replace(oldText, newText);
}

patchFile('NevariAdmin Storefront/app/_customer-dashboard.js', (content) => {
  content = replaceOrThrow(
    content,
    '  function handleUploadPhoto() {\n    closeMenu();\n    setPendingFile(null);\n    setPendingImageMeta(null);\n    setCropState(null);\n    setCropError("");\n    setLocalError("");\n    setUploadOpen(true);\n  }',
    '  function handleUploadPhoto() {\n    closeMenu();\n    setPendingFile(null);\n    setPendingImageMeta(null);\n    setCropState(null);\n    setCropError("");\n    setLocalError("");\n    setUploadOpen(false);\n    window.setTimeout(() => inputRef?.current?.click(), 0);\n  }',
    'handleUploadPhoto'
  );

  content = replaceOrThrow(
    content,
    '      setPendingFile(file);\n      setPendingImageMeta(meta);\n      if (cropViewportSize) {\n        resetCropState(meta);\n      }',
    '      setPendingFile(file);\n      setPendingImageMeta(meta);\n      setUploadOpen(true);\n      if (cropViewportSize) {\n        resetCropState(meta);\n      }',
    'handleNativeFileChange success'
  );

  content = replaceOrThrow(
    content,
    '      {uploadOpen ? (\n        <div className="customer-photo-viewer customer-profile-upload-modal" role="dialog" aria-modal="true" aria-label="Upload Profile Image" onClick={closeUploadModal}>',
    '      <input ref={inputRef} className="customer-mobile-photo-input" type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={handleNativeFileChange} />\n\n      {uploadOpen ? (\n        <div className="customer-photo-viewer customer-profile-upload-modal" role="dialog" aria-modal="true" aria-label="Upload Profile Image" onClick={closeUploadModal}>',
    'always-mounted input'
  );

  content = replaceOrThrow(
    content,
    '                <div className="customer-profile-cropper-overlay" aria-hidden="true">\n                  <span />\n                  <span />\n                  <span />\n                  <span />\n                </div>',
    '                <div className="customer-profile-cropper-overlay" aria-hidden="true">\n                  <div className="customer-profile-cropper-ring" />\n                </div>',
    'circular overlay markup'
  );

  content = replaceOrThrow(
    content,
    '                <button type="button" className="pill-button tertiary customer-profile-cropper-reset" onClick={handleResetCrop} disabled={!cropState || loadingCropImage || uploading}>',
    '                <button type="button" className="pill-button tertiary customer-profile-cropper-reset" onClick={handleResetCrop} disabled={!cropState || loadingCropImage || uploading}>',
    'reset button passthrough'
  );

  content = replaceOrThrow(
    content,
    '            <div className="customer-profile-upload-actions">\n              <button type="button" className="pill-button tertiary" onClick={() => inputRef?.current?.click()} disabled={uploading || loadingCropImage}>\n                Select Different Image\n              </button>\n              <input ref={inputRef} className="customer-mobile-photo-input" type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={handleNativeFileChange} />\n            </div>',
    '            <div className="customer-profile-upload-actions">\n              <button type="button" className="pill-button tertiary" onClick={() => inputRef?.current?.click()} disabled={uploading || loadingCropImage}>\n                Select Different Image\n              </button>\n            </div>',
    'remove modal input'
  );

  content = replaceOrThrow(
    content,
    '              <button type="button" className="pill-button tertiary" onClick={closeUploadModal} disabled={uploading}>Cancel</button>\n              <button type="button" className="pill-button" onClick={handleSaveImage} disabled={uploading || loadingCropImage || !pendingFile || !cropState}>\n                {uploading ? <span className="appointment-cta-spinner" aria-label="Saving image" /> : "Save Image"}\n              </button>',
    '              <button type="button" className="pill-button tertiary" onClick={closeUploadModal} disabled={uploading}>Cancel</button>\n              <button type="button" className="pill-button primary" onClick={handleSaveImage} disabled={uploading || loadingCropImage || !pendingFile || !cropState}>\n                {uploading ? <BrandedSpinner className="button-spinner" label="Saving image" /> : "Save"}\n              </button>',
    'modal actions'
  );

  content = replaceOrThrow(
    content,
    '          <button type="button" role="menuitem" onClick={handleUploadPhoto}>\n            Upload Image\n          </button>',
    '          <button type="button" role="menuitem" onClick={handleUploadPhoto}>\n            Upload Image\n          </button>',
    'upload menu passthrough'
  );

  content = replaceOrThrow(
    content,
    '              <p>Drag to frame your photo</p>',
    '              <p>Drag to frame your photo</p>',
    'copy passthrough'
  );

  return content;
});

patchFile('NevariAdmin Storefront/app/globals.css', (content) => {
  content = replaceOrThrow(
    content,
    '.customer-profile-cropper-overlay {\n  position: absolute;\n  inset: 0;\n  pointer-events: none;\n  background: linear-gradient(rgba(255, 255, 255, 0.28), rgba(255, 255, 255, 0.28));\n  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.5);\n}\n\n.customer-profile-cropper-overlay::before,\n.customer-profile-cropper-overlay::after,\n.customer-profile-cropper-overlay span::before,\n.customer-profile-cropper-overlay span::after {\n  content: "";\n  position: absolute;\n  background: rgba(255, 255, 255, 0.56);\n}\n\n.customer-profile-cropper-overlay::before {\n  top: 0;\n  bottom: 0;\n  left: 33.333%;\n  width: 1px;\n}\n\n.customer-profile-cropper-overlay::after {\n  top: 0;\n  bottom: 0;\n  right: 33.333%;\n  width: 1px;\n}\n\n.customer-profile-cropper-overlay span:first-child::before {\n  left: 0;\n  right: 0;\n  top: 33.333%;\n  height: 1px;\n}\n\n.customer-profile-cropper-overlay span:first-child::after {\n  left: 0;\n  right: 0;\n  bottom: 33.333%;\n  height: 1px;\n}',
    '.customer-profile-cropper-overlay {\n  position: absolute;\n  inset: 0;\n  pointer-events: none;\n}\n\n.customer-profile-cropper-ring {\n  position: absolute;\n  inset: 7.5%;\n  border-radius: 50%;\n  box-shadow: 0 0 0 999px rgba(15, 23, 42, 0.42);\n  border: 1px solid rgba(255, 255, 255, 0.85);\n}\n\n.customer-profile-cropper-ring::before,\n.customer-profile-cropper-ring::after {\n  content: "";\n  position: absolute;\n  inset: 0;\n  border-radius: inherit;\n}\n\n.customer-profile-cropper-ring::before {\n  left: 33.333%;\n  right: 33.333%;\n  border-left: 1px solid rgba(255, 255, 255, 0.45);\n  border-right: 1px solid rgba(255, 255, 255, 0.45);\n}\n\n.customer-profile-cropper-ring::after {\n  top: 33.333%;\n  bottom: 33.333%;\n  border-top: 1px solid rgba(255, 255, 255, 0.45);\n  border-bottom: 1px solid rgba(255, 255, 255, 0.45);\n}',
    'cropper overlay styles'
  );

  content = replaceOrThrow(
    content,
    '.customer-profile-cropper-loading {\n  position: absolute;\n  inset: 0;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  background: rgba(15, 23, 42, 0.18);\n}',
    '.customer-profile-cropper-loading {\n  position: absolute;\n  inset: 0;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  background: rgba(15, 23, 42, 0.18);\n}\n\n.customer-profile-upload-card .button-spinner {\n  --spinner-size: 24px;\n}',
    'cropper loading spinner size'
  );

  return content;
});
