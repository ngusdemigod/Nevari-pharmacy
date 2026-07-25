from pathlib import Path

path = Path(r'D:/dev/nevari-pharmacy-core/NevariAdmin Storefront/app/_customer-dashboard.js')
text = path.read_text(encoding='utf-8')

replacements = [
    (
        """function patchCustomerProfileAvatarState(current, avatarUrl) {
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

function createJourneyState() {""",
        """function patchCustomerProfileAvatarState(current, avatarUrl) {
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

function persistPatientSessionAvatar(avatarUrl) {
  if (typeof window === "undefined") {
    return;
  }
  const normalized = normalizeProfileAvatarUrl(avatarUrl);
  if (!normalized) {
    return;
  }
  try {
    const storageKey = FRONTENDS.patient?.storageKey;
    if (!storageKey) {
      return;
    }
    const current = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
    const next = {
      ...current,
      user: {
        ...(current?.user || {}),
        avatar_url: normalized,
        avatarUrl: normalized,
        picture: normalized,
      },
    };
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {}
}

function createJourneyState() {"""
    ),
    (
        """        setSession((current) => current ? {
          ...current,
          user: {
            ...(current.user || {}),
            avatar_url: refreshedAvatarUrl,
            avatarUrl: refreshedAvatarUrl,
            picture: refreshedAvatarUrl,
          },
        } : current);
        if (cacheKey) {""",
        """        setSession((current) => current ? {
          ...current,
          user: {
            ...(current.user || {}),
            avatar_url: refreshedAvatarUrl,
            avatarUrl: refreshedAvatarUrl,
            picture: refreshedAvatarUrl,
          },
        } : current);
        persistPatientSessionAvatar(refreshedAvatarUrl);
        if (cacheKey) {"""
    ),
    (
        """        setSession?.((current) => current ? {
          ...current,
          user: {
            ...(current.user || {}),
            avatar_url: refreshedAvatarUrl,
            avatarUrl: refreshedAvatarUrl,
            picture: refreshedAvatarUrl,
          },
        } : current);
      }
      setProfileImageSuccess('Profile image updated successfully.');""",
        """        setSession?.((current) => current ? {
          ...current,
          user: {
            ...(current.user || {}),
            avatar_url: refreshedAvatarUrl,
            avatarUrl: refreshedAvatarUrl,
            picture: refreshedAvatarUrl,
          },
        } : current);
        persistPatientSessionAvatar(refreshedAvatarUrl);
      }
      setProfileImageSuccess('Profile image updated successfully.');"""
    ),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit('Target snippet not found during avatar session persistence patch.')
    text = text.replace(old, new)

path.write_text(text, encoding='utf-8')
