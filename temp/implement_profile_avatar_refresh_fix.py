from pathlib import Path

js_path = Path(r'D:/dev/nevari-pharmacy-core/NevariAdmin Storefront/app/_customer-dashboard.js')
css_path = Path(r'D:/dev/nevari-pharmacy-core/NevariAdmin Storefront/app/globals.css')
js = js_path.read_text(encoding='utf-8')
css = css_path.read_text(encoding='utf-8')

replacements = []

replacements.append((
'''function createJourneyState() {
''',
'''function normalizeProfileAvatarUrl(value) {
  return String(value || "").trim();
}

function mergeCustomerProfileAvatar(profile, avatarUrl) {
  const nextAvatarUrl = normalizeProfileAvatarUrl(avatarUrl);
  if (!nextAvatarUrl) {
    return { ...(profile || {}) };
  }

  return {
    ...(profile || {}),
    avatar_url: nextAvatarUrl,
    profile_image: nextAvatarUrl,
  };
}

function patchCustomerProfileAvatarState(current, avatarUrl) {
  if (!current) {
    return current;
  }

  const nextProfile = mergeCustomerProfileAvatar(current.dashboard?.profile || current.profile || {}, avatarUrl);
  return {
    ...current,
    profile: {
      ...(current.profile || {}),
      ...nextProfile,
    },
    dashboard: {
      ...(current.dashboard || {}),
      profile: {
        ...(current.dashboard?.profile || {}),
        ...nextProfile,
      },
    },
  };
}

function createJourneyState() {
'''))

replacements.append((
'''  const [profileImageUploading, setProfileImageUploading] = useState(false);
  const [profileImageError, setProfileImageError] = useState("");
  const [profileImageSuccess, setProfileImageSuccess] = useState("");
''',
'''  const [profileImageSaving, setProfileImageSaving] = useState(false);
  const [profileImageRefreshing, setProfileImageRefreshing] = useState(false);
  const [pendingProfileAvatarUrl, setPendingProfileAvatarUrl] = useState("");
  const [profileImageError, setProfileImageError] = useState("");
  const [profileImageSuccess, setProfileImageSuccess] = useState("");
'''))

replacements.append((
'''      onSuccess: (nextState) => {
        if (cacheKey) {
          writeDashboardCache(cacheKey, { state: nextState });
        }
      }
''',
'''      onSuccess: (nextState) => {
        const cachedState = pendingProfileAvatarUrl
          && normalizeProfileAvatarUrl(nextState?.dashboard?.profile?.avatar_url || nextState?.dashboard?.profile?.profile_image) !== pendingProfileAvatarUrl
          ? patchCustomerProfileAvatarState(nextState, pendingProfileAvatarUrl)
          : nextState;
        if (cacheKey) {
          writeDashboardCache(cacheKey, { state: cachedState });
        }
      }
'''))

replacements.append((
'''  const profile = state.dashboard?.profile || {};
  const customerDisplayName = resolveCustomerPreferredName({
    settingsDisplayName: settings.displayName,
    profile,
    sessionUser: session?.user,
  });
  const customerFullName = resolveCustomerFullName(profile, session?.user, customerDisplayName);
  const customerEmailAddress = String(profile.email || session?.user?.email || settings.email || "No email available").trim() || "No email available";
  const customerProfileCompletion = useMemo(() => getCustomerProfileCompletion(settings, profile), [profile, settings]);
''',
'''  const baseProfile = state.dashboard?.profile || {};
  const confirmedProfileAvatarUrl = normalizeProfileAvatarUrl(baseProfile.avatar_url || baseProfile.profile_image);
  const fallbackProfileAvatarUrl = normalizeProfileAvatarUrl(session?.user?.avatar_url || session?.user?.avatarUrl || session?.user?.picture);
  const resolvedProfileAvatarUrl = pendingProfileAvatarUrl && confirmedProfileAvatarUrl !== pendingProfileAvatarUrl
    ? pendingProfileAvatarUrl
    : (confirmedProfileAvatarUrl || fallbackProfileAvatarUrl);
  const profile = useMemo(() => ({
    ...baseProfile,
    avatar_url: resolvedProfileAvatarUrl,
    profile_image: resolvedProfileAvatarUrl || normalizeProfileAvatarUrl(baseProfile.profile_image),
  }), [baseProfile, resolvedProfileAvatarUrl]);
  const customerDisplayName = resolveCustomerPreferredName({
    settingsDisplayName: settings.displayName,
    profile,
    sessionUser: session?.user,
  });
  const customerFullName = resolveCustomerFullName(profile, session?.user, customerDisplayName);
  const customerEmailAddress = String(profile.email || session?.user?.email || settings.email || "No email available").trim() || "No email available";
  const customerProfileCompletion = useMemo(() => getCustomerProfileCompletion(settings, profile), [profile, settings]);

  useEffect(() => {
    if (pendingProfileAvatarUrl && confirmedProfileAvatarUrl && confirmedProfileAvatarUrl === pendingProfileAvatarUrl) {
      setPendingProfileAvatarUrl("");
      setProfileImageRefreshing(false);
    }
  }, [confirmedProfileAvatarUrl, pendingProfileAvatarUrl]);
'''))

replacements.append((
'''  async function handleProfileImageSelected(fileOrEvent) {
    const preparedUpload = fileOrEvent && typeof fileOrEvent === "object" && typeof fileOrEvent.data_base64 === "string"
      ? fileOrEvent
      : null;
    const file = preparedUpload?.file || fileOrEvent?.target?.files?.[0] || fileOrEvent || null;
    const nextInput = fileOrEvent?.target || profileImageInputRef.current;
    setProfileImageError("");
    setProfileImageSuccess("");
    if (!preparedUpload) {
      const validationMessage = validateCustomerProfileImageFile(file);
      if (validationMessage) {
        setProfileImageError(validationMessage);
        if (nextInput) {
          nextInput.value = "";
        }
        return false;
      }
    }
    setProfileImageUploading(true);
    try {
      const payload = preparedUpload
        ? {
            filename: preparedUpload.filename,
            mime_type: preparedUpload.mime_type,
            data_base64: preparedUpload.data_base64,
          }
        : {
            filename: file.name,
            mime_type: file.type,
            data_base64: await readFileAsBase64(file),
          };
      const result = await uploadCustomerProfileImage(session, payload);
      const nextAvatarUrl = result?.avatar_url || result?.src || "";
      if (nextAvatarUrl) {
        const nextProfile = {
          ...(profile || {}),
          ...(state.dashboard?.profile || {}),
          avatar_url: nextAvatarUrl,
          profile_image: nextAvatarUrl,
        }
        await mutateSummary((current) => current ? {
          ...current,
          profile: {
            ...(current.profile || {}),
            ...nextProfile,
          },
          dashboard: {
            ...(current.dashboard || {}),
            profile: {
              ...(current.dashboard?.profile || {}),
              ...nextProfile,
            },
          },
        } : current, { revalidate: false })
        setSession((current) => current ? {
          ...current,
          user: {
            ...(current.user || {}),
            avatar_url: nextAvatarUrl,
            avatarUrl: nextAvatarUrl,
            picture: nextAvatarUrl,
          },
        } : current)
      }
      setProfileImageSuccess("Profile image updated successfully.");
      showDashboardToast("Profile image updated successfully.", "success");
      void globalMutate(swrKeys.proxy.path('/customer-dashboard/summary', withSessionCacheScope(session)));
      return true;
    } catch (error) {
      const message = error?.message || "Unable to upload image. Please try again.";
      setProfileImageError(message);
      showDashboardToast(message, "error");
      return false;
    } finally {
      setProfileImageUploading(false);
      if (nextInput) {
        nextInput.value = "";
      }
    }
  }
''',
'''  async function handleProfileImageSelected(fileOrEvent) {
    const preparedUpload = fileOrEvent && typeof fileOrEvent === "object" && typeof fileOrEvent.data_base64 === "string"
      ? fileOrEvent
      : null;
    const file = preparedUpload?.file || fileOrEvent?.target?.files?.[0] || fileOrEvent || null;
    const nextInput = fileOrEvent?.target || profileImageInputRef.current;
    let uploadedAvatarUrl = "";
    setProfileImageError("");
    setProfileImageSuccess("");
    if (!preparedUpload) {
      const validationMessage = validateCustomerProfileImageFile(file);
      if (validationMessage) {
        setProfileImageError(validationMessage);
        if (nextInput) {
          nextInput.value = "";
        }
        return false;
      }
    }
    setProfileImageSaving(true);
    setProfileImageRefreshing(false);
    try {
      const payload = preparedUpload
        ? {
            filename: preparedUpload.filename,
            mime_type: preparedUpload.mime_type,
            data_base64: preparedUpload.data_base64,
          }
        : {
            filename: file.name,
            mime_type: file.type,
            data_base64: await readFileAsBase64(file),
          };
      const result = await uploadCustomerProfileImage(session, payload);
      uploadedAvatarUrl = normalizeProfileAvatarUrl(result?.avatar_url || result?.src || "");
      if (uploadedAvatarUrl) {
        setPendingProfileAvatarUrl(uploadedAvatarUrl);
        setProfileImageRefreshing(true);
        await mutateSummary((current) => patchCustomerProfileAvatarState(current, uploadedAvatarUrl), { revalidate: false });
        setSession((current) => current ? {
          ...current,
          user: {
            ...(current.user || {}),
            avatar_url: uploadedAvatarUrl,
            avatarUrl: uploadedAvatarUrl,
            picture: uploadedAvatarUrl,
          },
        } : current);
        if (cacheKey) {
          writeDashboardCache(cacheKey, {
            state: patchCustomerProfileAvatarState(summaryState, uploadedAvatarUrl),
          });
        }
      }
      setProfileImageSuccess("Profile image updated successfully.");
      showDashboardToast("Profile image updated successfully.", "success");
      if (customerSummaryKey) {
        try {
          const refreshedState = await globalMutate(customerSummaryKey);
          const refreshedAvatarUrl = normalizeProfileAvatarUrl(
            refreshedState?.dashboard?.profile?.avatar_url
            || refreshedState?.dashboard?.profile?.profile_image
            || refreshedState?.profile?.avatar_url
            || refreshedState?.profile?.profile_image
          );
          if (uploadedAvatarUrl && refreshedAvatarUrl === uploadedAvatarUrl) {
            setPendingProfileAvatarUrl("");
          }
        } finally {
          setProfileImageRefreshing(false);
        }
      } else {
        setProfileImageRefreshing(false);
      }
      return true;
    } catch (error) {
      setProfileImageRefreshing(false);
      if (!uploadedAvatarUrl) {
        setPendingProfileAvatarUrl("");
      }
      const message = error?.message || "Unable to upload image. Please try again.";
      setProfileImageError(message);
      showDashboardToast(message, "error");
      return false;
    } finally {
      setProfileImageSaving(false);
      if (nextInput) {
        nextInput.value = "";
      }
    }
  }
'''))

replacements.append((
'''        uploading={profileImageUploading}
        imageError={profileImageError}
        imageSuccess={profileImageSuccess}
''',
'''        uploading={profileImageSaving}
        imageRefreshing={profileImageRefreshing}
        imageError={profileImageError}
        imageSuccess={profileImageSuccess}
'''))

replacements.append((
'''function SettingsPage({ profile, doctors, orders, appointments, settings, displayName = "Customer", uploading = false, imageError = "", imageSuccess = "", imageInputRef = null, onProfileImageSelect, onProfileImageOpen, validationErrors = {}, onSettingsChange, onLogout, logoutBusy = false }) {
''',
'''function SettingsPage({ profile, doctors, orders, appointments, settings, displayName = "Customer", uploading = false, imageRefreshing = false, imageError = "", imageSuccess = "", imageInputRef = null, onProfileImageSelect, onProfileImageOpen, validationErrors = {}, onSettingsChange, onLogout, logoutBusy = false }) {
'''))

replacements.append((
'''        uploading={uploading}
        error={imageError}
''',
'''        uploading={uploading}
        refreshing={imageRefreshing}
        error={imageError}
'''))

replacements.append((
'''function CustomerProfilePhotoWidget({ profile, displayName, uploading, error, success, inputRef, onSelect, onOpen, className = "" }) {
''',
'''function CustomerProfilePhotoWidget({ profile, displayName, uploading, refreshing = false, error, success, inputRef, onSelect, onOpen, className = "" }) {
'''))

replacements.append((
'''  const avatarUrl = String(profile?.avatar_url || "").trim();
  const previousUploadingRef = useRef(false);
''',
'''  const avatarUrl = String(profile?.avatar_url || "").trim();
  const previousUploadingRef = useRef(false);
'''))

replacements.append((
'''    if (uploading) {
      setUploadSettling(false);
    } else if (previousUploadingRef.current) {
      setUploadSettling(true);
      timeoutId = window.setTimeout(() => setUploadSettling(false), 720);
    }

    previousUploadingRef.current = uploading;
''',
'''    if (refreshing) {
      setUploadSettling(false);
    } else if (previousUploadingRef.current) {
      setUploadSettling(true);
      timeoutId = window.setTimeout(() => setUploadSettling(false), 720);
    }

    previousUploadingRef.current = refreshing;
'''))

replacements.append((
'''  }, [uploading, avatarUrl]);
''',
'''  }, [avatarUrl, refreshing]);
'''))

replacements.append((
'''  function closeUploadModal() {
    setUploadOpen(false);
''',
'''  function closeUploadModal() {
    if (uploading) {
      return;
    }
    setUploadOpen(false);
'''))

replacements.append((
'''  function handleAvatarClick() {
    if (uploading) {
      return;
    }
''',
'''  function handleAvatarClick() {
    if (uploading || refreshing) {
      return;
    }
'''))

replacements.append((
'''    uploading ? "is-uploading" : "",
    uploadSettling ? "is-upload-settling" : "",
''',
'''    refreshing ? "is-refreshing" : "",
    uploadSettling ? "is-upload-settling" : "",
'''))

replacements.append((
'''        disabled={uploading}
''',
'''        disabled={uploading || refreshing}
'''))

replacements.append((
'''        <div className="customer-mobile-avatar large customer-mobile-photo-avatar">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              onError={(event) => {
                event.currentTarget.style.display = "none";
                event.currentTarget.nextElementSibling.style.display = "inline";
              }}
            />
          ) : null}
          <span style={{ display: avatarUrl ? "none" : "inline" }}>{initials(displayName)}</span>
        </div>
''',
'''        <div className="customer-mobile-avatar large customer-mobile-photo-avatar">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              onError={(event) => {
                event.currentTarget.style.display = "none";
                event.currentTarget.nextElementSibling.style.display = "inline";
              }}
            />
          ) : null}
          <span style={{ display: avatarUrl ? "none" : "inline" }}>{initials(displayName)}</span>
          {refreshing ? <span className="customer-mobile-photo-processing" aria-hidden="true"><span className="appointment-cta-spinner" /></span> : null}
        </div>
'''))

replacements.append((
'''          <button type="button" role="menuitem" onClick={handleUploadPhoto}>
''',
'''          <button type="button" role="menuitem" onClick={handleUploadPhoto} disabled={refreshing}>
'''))

replacements.append((
'''        <div className="customer-photo-viewer customer-profile-upload-modal" role="dialog" aria-modal="true" aria-label="Upload Profile Image" onClick={closeUploadModal}>
''',
'''        <div className="customer-photo-viewer customer-profile-upload-modal" role="dialog" aria-modal="true" aria-label="Upload Profile Image" onClick={() => { if (!uploading) { closeUploadModal(); } }}>
'''))

replacements.append((
'''            <button ref={uploadCloseRef} className="customer-photo-viewer-close" type="button" onClick={closeUploadModal} aria-label="Close upload profile image modal">
''',
'''            <button ref={uploadCloseRef} className="customer-photo-viewer-close" type="button" onClick={closeUploadModal} aria-label="Close upload profile image modal" disabled={uploading}>
'''))

replacements.append((
'''      {uploading ? <span className="sr-only customer-mobile-save-status" aria-live="polite">Uploading profile photo</span> : null}
''',
'''      {uploading || refreshing ? <span className="sr-only customer-mobile-save-status" aria-live="polite">Uploading profile photo</span> : null}
'''))

replacements.append((
'''function ProfilePage({ profile, orders, appointments, doctors, settings, displayName = "Customer", uploading = false, imageError = "", imageSuccess = "", imageInputRef = null, onProfileImageSelect, onProfileImageOpen, subscriptionState = null, validationErrors = {}, onSettingsChange, onLogout, logoutBusy = false, onSaveSettings, profileSaveBusy = false, profileSaveError = "" }) {
''',
'''function ProfilePage({ profile, orders, appointments, doctors, settings, displayName = "Customer", uploading = false, imageRefreshing = false, imageError = "", imageSuccess = "", imageInputRef = null, onProfileImageSelect, onProfileImageOpen, subscriptionState = null, validationErrors = {}, onSettingsChange, onLogout, logoutBusy = false, onSaveSettings, profileSaveBusy = false, profileSaveError = "" }) {
'''))

replacements.append((
'''        uploading={uploading}
        error={imageError}
        success={imageSuccess}
''',
'''        uploading={uploading}
        refreshing={imageRefreshing}
        error={imageError}
        success={imageSuccess}
'''))

replacements.append((
'''  const [profileImageUploading, setProfileImageUploading] = useState(false);
  const [profileImageError, setProfileImageError] = useState("");
  const [profileImageSuccess, setProfileImageSuccess] = useState("");
  const profileImageInputRef = useRef(null);
  const customerDisplayName = resolveCustomerPreferredName({
    settingsDisplayName: settings?.displayName,
    profile,
    sessionUser: session?.user,
  });
''',
'''  const [profileImageSaving, setProfileImageSaving] = useState(false);
  const [profileImageRefreshing, setProfileImageRefreshing] = useState(false);
  const [pendingProfileAvatarUrl, setPendingProfileAvatarUrl] = useState("");
  const [profileImageError, setProfileImageError] = useState("");
  const [profileImageSuccess, setProfileImageSuccess] = useState("");
  const profileImageInputRef = useRef(null);
  const confirmedProfileAvatarUrl = normalizeProfileAvatarUrl(profile?.avatar_url || profile?.profile_image);
  const fallbackProfileAvatarUrl = normalizeProfileAvatarUrl(session?.user?.avatar_url || session?.user?.avatarUrl || session?.user?.picture);
  const resolvedProfileAvatarUrl = pendingProfileAvatarUrl && confirmedProfileAvatarUrl !== pendingProfileAvatarUrl
    ? pendingProfileAvatarUrl
    : (confirmedProfileAvatarUrl || fallbackProfileAvatarUrl);
  const resolvedProfile = useMemo(() => ({
    ...(profile || {}),
    avatar_url: resolvedProfileAvatarUrl,
    profile_image: resolvedProfileAvatarUrl || normalizeProfileAvatarUrl(profile?.profile_image),
  }), [profile, resolvedProfileAvatarUrl]);
  useEffect(() => {
    if (pendingProfileAvatarUrl && confirmedProfileAvatarUrl && confirmedProfileAvatarUrl === pendingProfileAvatarUrl) {
      setPendingProfileAvatarUrl("");
      setProfileImageRefreshing(false);
    }
  }, [confirmedProfileAvatarUrl, pendingProfileAvatarUrl]);
  const customerDisplayName = resolveCustomerPreferredName({
    settingsDisplayName: settings?.displayName,
    profile: resolvedProfile,
    sessionUser: session?.user,
  });
'''))

replacements.append((
'''    setProfileImageUploading(true);
    try {
''',
'''    setProfileImageSaving(true);
    setProfileImageRefreshing(false);
    let uploadedAvatarUrl = "";
    try {
'''))

replacements.append((
'''      const result = await uploadCustomerProfileImage(session, payload);
      const nextAvatarUrl = result?.avatar_url || result?.src || "";
      if (nextAvatarUrl) {
        const nextProfile = {
          ...(profile || {}),
          ...(state.dashboard?.profile || {}),
          avatar_url: nextAvatarUrl,
          profile_image: nextAvatarUrl,
        }
        await mobileGlobalMutate(
          swrKeys.proxy.path('/customer-dashboard/summary', withSessionCacheScope(session)),
          (current) => current ? {
            ...current,
            profile: {
              ...(current.profile || {}),
              ...nextProfile,
            },
            dashboard: {
              ...(current.dashboard || {}),
              profile: {
                ...(current.dashboard?.profile || {}),
                ...nextProfile,
              },
            },
          } : current,
          { revalidate: false }
        )
        setSession((current) => current ? {
          ...current,
          user: {
            ...(current.user || {}),
            avatar_url: nextAvatarUrl,
            avatarUrl: nextAvatarUrl,
            picture: nextAvatarUrl,
          },
        } : current)
      }
      setProfileImageSuccess('Profile image updated successfully.');
      void mobileGlobalMutate(swrKeys.proxy.path('/customer-dashboard/summary', withSessionCacheScope(session)));
      return true;
    } catch (error) {
      setProfileImageError(error?.message || 'Unable to upload image. Please try again.');
      return false;
    } finally {
      setProfileImageUploading(false);
''',
'''      const result = await uploadCustomerProfileImage(session, payload);
      uploadedAvatarUrl = normalizeProfileAvatarUrl(result?.avatar_url || result?.src || "");
      if (uploadedAvatarUrl) {
        setPendingProfileAvatarUrl(uploadedAvatarUrl);
        setProfileImageRefreshing(true);
        await mobileGlobalMutate(
          swrKeys.proxy.path('/customer-dashboard/summary', withSessionCacheScope(session)),
          (current) => patchCustomerProfileAvatarState(current, uploadedAvatarUrl),
          { revalidate: false }
        )
        setSession((current) => current ? {
          ...current,
          user: {
            ...(current.user || {}),
            avatar_url: uploadedAvatarUrl,
            avatarUrl: uploadedAvatarUrl,
            picture: uploadedAvatarUrl,
          },
        } : current)
      }
      setProfileImageSuccess('Profile image updated successfully.');
      try {
        const refreshedState = await mobileGlobalMutate(swrKeys.proxy.path('/customer-dashboard/summary', withSessionCacheScope(session)));
        const refreshedAvatarUrl = normalizeProfileAvatarUrl(
          refreshedState?.dashboard?.profile?.avatar_url
          || refreshedState?.dashboard?.profile?.profile_image
          || refreshedState?.profile?.avatar_url
          || refreshedState?.profile?.profile_image
        );
        if (uploadedAvatarUrl && refreshedAvatarUrl === uploadedAvatarUrl) {
          setPendingProfileAvatarUrl("");
        }
      } finally {
        setProfileImageRefreshing(false);
      }
      return true;
    } catch (error) {
      setProfileImageRefreshing(false);
      if (!uploadedAvatarUrl) {
        setPendingProfileAvatarUrl("");
      }
      setProfileImageError(error?.message || 'Unable to upload image. Please try again.');
      return false;
    } finally {
      setProfileImageSaving(false);
'''))

replacements.append((
'''          <CustomerProfilePhotoWidget profile={profile} displayName={customerDisplayName} uploading={profileImageUploading} error={profileImageError} success={profileImageSuccess} inputRef={profileImageInputRef} onSelect={handleProfileImageSelected} onOpen={() => profileImageInputRef.current?.click()} />
''',
'''          <CustomerProfilePhotoWidget profile={resolvedProfile} displayName={customerDisplayName} uploading={profileImageSaving} refreshing={profileImageRefreshing} error={profileImageError} success={profileImageSuccess} inputRef={profileImageInputRef} onSelect={handleProfileImageSelected} onOpen={() => profileImageInputRef.current?.click()} />
'''))

replacements.append((
'''              {profile.avatar_url ? <img src={profile.avatar_url} alt="" onError={(event) => { event.currentTarget.style.display = "none"; event.currentTarget.nextElementSibling.style.display = "inline"; }} /> : null}
              <span style={{ display: profile.avatar_url ? "none" : "inline" }}>{initials(customerDisplayName)}</span>
''',
'''              {resolvedProfile.avatar_url ? <img src={resolvedProfile.avatar_url} alt="" onError={(event) => { event.currentTarget.style.display = "none"; event.currentTarget.nextElementSibling.style.display = "inline"; }} /> : null}
              <span style={{ display: resolvedProfile.avatar_url ? "none" : "inline" }}>{initials(customerDisplayName)}</span>
'''))

replacements.append((
'''              <span>{profile.email || settings.email || "tee@example.com"}</span>
''',
'''              <span>{resolvedProfile.email || settings.email || "tee@example.com"}</span>
'''))

for old, new in replacements:
    if old not in js:
        if old not in css:
            raise SystemExit(f'Missing replacement target:\n{old[:220]}')

for old, new in replacements:
    if old in js:
        js = js.replace(old, new, 1)

css_replacements = [
(
'''.customer-mobile-photo-widget.is-uploading .customer-mobile-photo-avatar::after {
  opacity: 1;
  border-top-color: #0b55d9;
  border-right-color: rgba(11, 85, 217, 0.5);
  border-bottom-color: rgba(11, 85, 217, 0.2);
  border-left-color: rgba(11, 85, 217, 0.08);
  animation: customer-avatar-upload-spin 0.85s linear infinite;
}

.customer-mobile-photo-widget.is-upload-settling .customer-mobile-photo-avatar::after {
''',
'''.customer-mobile-photo-widget.is-refreshing .customer-mobile-photo-avatar::after {
  opacity: 0;
}

.customer-mobile-photo-widget.is-refreshing .customer-mobile-photo-avatar > img,
.customer-mobile-photo-widget.is-refreshing .customer-mobile-photo-avatar > span {
  opacity: 0.52;
}

.customer-mobile-photo-processing {
  position: absolute;
  inset: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.customer-mobile-photo-processing .appointment-cta-spinner {
  width: 20px;
  height: 20px;
}

.customer-mobile-photo-widget.is-upload-settling .customer-mobile-photo-avatar::after {
''')
]
for old, new in css_replacements:
    if old not in css:
        raise SystemExit(f'Missing CSS target:\n{old[:220]}')
    css = css.replace(old, new, 1)

js_path.write_text(js, encoding='utf-8')
css_path.write_text(css, encoding='utf-8')
print('Implemented profile avatar refresh fix.')
