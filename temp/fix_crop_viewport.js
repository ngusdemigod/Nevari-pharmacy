const fs = require('fs');
const path = 'NevariAdmin Storefront/app/_customer-dashboard.js';
let content = fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

function replaceString(oldText, newText, label) {
  if (!content.includes(oldText)) {
    throw new Error('Missing string anchor: ' + label);
  }
  content = content.replace(oldText, newText);
}

replaceString(
  '  const [pendingImageMeta, setPendingImageMeta] = useState(null);\n  const avatarUrl = String(profile?.avatar_url || "").trim();',
  '  const [pendingImageMeta, setPendingImageMeta] = useState(null);\n  const [cropViewportSize, setCropViewportSize] = useState(0);\n  const avatarUrl = String(profile?.avatar_url || "").trim();',
  'state block'
);

replaceString(
  '  useEffect(() => {\n    if (uploadOpen) {\n      uploadCloseRef.current?.focus();\n    }\n  }, [uploadOpen]);\n\n',
  '  useEffect(() => {\n    if (uploadOpen) {\n      uploadCloseRef.current?.focus();\n    }\n  }, [uploadOpen]);\n\n  useEffect(() => {\n    if (!uploadOpen) {\n      setCropViewportSize(0);\n      return undefined;\n    }\n\n    function measureCropViewport() {\n      const nextSize = Number(cropSurfaceRef.current?.clientWidth || 0);\n      setCropViewportSize((current) => (current !== nextSize ? nextSize : current));\n    }\n\n    measureCropViewport();\n\n    if (typeof ResizeObserver === "function" && cropSurfaceRef.current) {\n      const observer = new ResizeObserver(() => measureCropViewport());\n      observer.observe(cropSurfaceRef.current);\n      return () => observer.disconnect();\n    }\n\n    window.addEventListener("resize", measureCropViewport);\n    return () => window.removeEventListener("resize", measureCropViewport);\n  }, [uploadOpen]);\n\n  useEffect(() => {\n    if (!pendingImageMeta || !cropViewportSize) {\n      return;\n    }\n\n    setCropState((current) => createProfileImageCropState({\n      naturalWidth: pendingImageMeta.naturalWidth,\n      naturalHeight: pendingImageMeta.naturalHeight,\n      cropSize: cropViewportSize,\n      zoom: current?.zoom || PROFILE_IMAGE_MIN_ZOOM,\n      offsetX: current?.offsetX || 0,\n      offsetY: current?.offsetY || 0,\n    }));\n  }, [cropViewportSize, pendingImageMeta]);\n\n',
  'viewport effects'
);

replaceString(
  '  function resetCropState(meta) {\n    if (!meta) {\n      setCropState(null);\n      return;\n    }\n    setCropState(createProfileImageCropState(meta));\n  }',
  '  function resetCropState(meta) {\n    if (!meta || !cropViewportSize) {\n      setCropState(null);\n      return;\n    }\n    setCropState(createProfileImageCropState({\n      naturalWidth: meta.naturalWidth,\n      naturalHeight: meta.naturalHeight,\n      cropSize: cropViewportSize,\n    }));\n  }',
  'reset crop state'
);

replaceString(
  '      setPendingFile(file);\n      setPendingImageMeta(meta);\n      resetCropState(meta);',
  '      setPendingFile(file);\n      setPendingImageMeta(meta);\n      if (cropViewportSize) {\n        resetCropState(meta);\n      }',
  'file change crop init'
);

replaceString('  const cropImageStyle = cropState ? {', '  const cropImageStyle = cropState && cropViewportSize ? {', 'crop image style guard');
replaceString('{previewUrl && cropState ? <img src={previewUrl} alt="Profile crop preview" className="customer-profile-cropper-image" style={cropImageStyle} draggable="false" /> : null}', '{previewUrl && cropState && cropViewportSize ? <img src={previewUrl} alt="Profile crop preview" className="customer-profile-cropper-image" style={cropImageStyle} draggable="false" /> : null}', 'crop image render');
replaceString('{loadingCropImage ? <div className="customer-profile-cropper-loading"><span className="appointment-cta-spinner" aria-label="Loading image" /></div> : null}', '{loadingCropImage || (previewUrl && !cropViewportSize) ? <div className="customer-profile-cropper-loading"><span className="appointment-cta-spinner" aria-label="Loading image" /></div> : null}', 'crop loading overlay');

fs.writeFileSync(path, content.replace(/\n/g, '\r\n'));
