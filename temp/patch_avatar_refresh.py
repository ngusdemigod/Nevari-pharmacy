from pathlib import Path

path = Path(r'D:/dev/nevari-pharmacy-core/NevariAdmin Storefront/app/_customer-dashboard.js')
text = path.read_text(encoding='utf-8')

replacements = [
    (
        """function normalizeProfileAvatarUrl(value) {
  return String(value || \"\").trim();
}
""",
        """function normalizeProfileAvatarUrl(value) {
  return String(value || \"\").trim();
}

function profileAvatarUrlKey(value) {
  const normalized = normalizeProfileAvatarUrl(value);
  if (!normalized) {
    return \"\";
  }
  return normalized.replace(/[?#].*$/, \"\");
}

function withProfileAvatarRefreshToken(value, token) {
  const normalized = normalizeProfileAvatarUrl(value);
  if (!normalized) {
    return \"\";
  }
  const safeToken = String(token || \"\").trim();
  if (!safeToken) {
    return normalized;
  }
  return normalized + (normalized.includes(\"?\") ? \"&\" : \"?\") + \"nevari_avatar_v=\" + encodeURIComponent(safeToken);
}
"""
    ),
    (
        """        const cachedState = pendingProfileAvatarUrl
          && normalizeProfileAvatarUrl(nextState?.dashboard?.profile?.avatar_url || nextState?.dashboard?.profile?.profile_image) !== pendingProfileAvatarUrl
          ? patchCustomerProfileAvatarState(nextState, pendingProfileAvatarUrl)
          : nextState;""",
        """        const cachedState = pendingProfileAvatarUrl
          && profileAvatarUrlKey(nextState?.dashboard?.profile?.avatar_url || nextState?.dashboard?.profile?.profile_image) !== profileAvatarUrlKey(pendingProfileAvatarUrl)
          ? patchCustomerProfileAvatarState(nextState, pendingProfileAvatarUrl)
          : nextState;"""
    ),
    (
        """  const resolvedProfileAvatarUrl = pendingProfileAvatarUrl && confirmedProfileAvatarUrl !== pendingProfileAvatarUrl
    ? pendingProfileAvatarUrl
    : (confirmedProfileAvatarUrl || fallbackProfileAvatarUrl);""",
        """  const resolvedProfileAvatarUrl = pendingProfileAvatarUrl && profileAvatarUrlKey(confirmedProfileAvatarUrl) !== profileAvatarUrlKey(pendingProfileAvatarUrl)
    ? pendingProfileAvatarUrl
    : (confirmedProfileAvatarUrl || fallbackProfileAvatarUrl);"""
    ),
    (
        """    if (pendingProfileAvatarUrl && confirmedProfileAvatarUrl && confirmedProfileAvatarUrl === pendingProfileAvatarUrl) {
      setPendingProfileAvatarUrl(\"\");
      setProfileImageRefreshing(false);
    }""",
        """    if (pendingProfileAvatarUrl && confirmedProfileAvatarUrl && profileAvatarUrlKey(confirmedProfileAvatarUrl) === profileAvatarUrlKey(pendingProfileAvatarUrl)) {
      setPendingProfileAvatarUrl(\"\");
      setProfileImageRefreshing(false);
    }"""
    ),
    (
        """      uploadedAvatarUrl = normalizeProfileAvatarUrl(result?.avatar_url || result?.src || \"\");
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
      }""",
        """      uploadedAvatarUrl = normalizeProfileAvatarUrl(result?.avatar_url || result?.src || \"\");
      if (uploadedAvatarUrl) {
        const refreshedAvatarUrl = withProfileAvatarRefreshToken(uploadedAvatarUrl, Date.now());
        setPendingProfileAvatarUrl(refreshedAvatarUrl);
        setProfileImageRefreshing(true);
        await mutateSummary((current) => patchCustomerProfileAvatarState(current, refreshedAvatarUrl), { revalidate: false });
        setSession((current) => current ? {
          ...current,
          user: {
            ...(current.user || {}),
            avatar_url: refreshedAvatarUrl,
            avatarUrl: refreshedAvatarUrl,
            picture: refreshedAvatarUrl,
          },
        } : current);
        if (cacheKey) {
          writeDashboardCache(cacheKey, {
            state: patchCustomerProfileAvatarState(summaryState, refreshedAvatarUrl),
          });
        }
      }"""
    ),
    (
        """          if (uploadedAvatarUrl && refreshedAvatarUrl === uploadedAvatarUrl) {
            setPendingProfileAvatarUrl(\"\");
          }""",
        """          if (uploadedAvatarUrl && profileAvatarUrlKey(refreshedAvatarUrl) === profileAvatarUrlKey(uploadedAvatarUrl)) {
            setPendingProfileAvatarUrl(\"\");
          }"""
    ),
    (
        """      uploadedAvatarUrl = normalizeProfileAvatarUrl(result?.avatar_url || result?.src || \"\");
      if (uploadedAvatarUrl) {
        setPendingProfileAvatarUrl(uploadedAvatarUrl);
        setProfileImageRefreshing(true);
        void mobileGlobalMutate(
          swrKeys.proxy.path('/customer-dashboard/summary', withSessionCacheScope(session)),
          (current) => patchCustomerProfileAvatarState(current, uploadedAvatarUrl),
          { revalidate: false }
        );
        setSession?.((current) => current ? {
          ...current,
          user: {
            ...(current.user || {}),
            avatar_url: uploadedAvatarUrl,
            avatarUrl: uploadedAvatarUrl,
            picture: uploadedAvatarUrl,
          },
        } : current);
      }""",
        """      uploadedAvatarUrl = normalizeProfileAvatarUrl(result?.avatar_url || result?.src || \"\");
      if (uploadedAvatarUrl) {
        const refreshedAvatarUrl = withProfileAvatarRefreshToken(uploadedAvatarUrl, Date.now());
        setPendingProfileAvatarUrl(refreshedAvatarUrl);
        setProfileImageRefreshing(true);
        void mobileGlobalMutate(
          swrKeys.proxy.path('/customer-dashboard/summary', withSessionCacheScope(session)),
          (current) => patchCustomerProfileAvatarState(current, refreshedAvatarUrl),
          { revalidate: false }
        );
        setSession?.((current) => current ? {
          ...current,
          user: {
            ...(current.user || {}),
            avatar_url: refreshedAvatarUrl,
            avatarUrl: refreshedAvatarUrl,
            picture: refreshedAvatarUrl,
          },
        } : current);
      }"""
    ),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit('Target snippet not found during avatar refresh patch.')
    text = text.replace(old, new)

path.write_text(text, encoding='utf-8')
