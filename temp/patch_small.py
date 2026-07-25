from pathlib import Path
p = Path(r'D:/dev/nevari-pharmacy-core/NevariAdmin Storefront/app/_customer-dashboard.js')
lines = p.read_text(encoding='utf-8').splitlines()
lines[5112] = '                {uploading ? <span className="appointment-cta-spinner" aria-label="Saving image" /> : "Save"}'
lines[1582:1603] = [
    '      setProfileImageSuccess("Profile image updated successfully.");',
    '      showDashboardToast("Profile image updated successfully.", "success");',
    '      if (customerSummaryKey) {',
    '        void globalMutate(customerSummaryKey).then((refreshedState) => {',
    '          const refreshedAvatarUrl = normalizeProfileAvatarUrl(',
    '            refreshedState?.dashboard?.profile?.avatar_url',
    '            || refreshedState?.dashboard?.profile?.profile_image',
    '            || refreshedState?.profile?.avatar_url',
    '            || refreshedState?.profile?.profile_image',
    '          );',
    '          if (uploadedAvatarUrl && refreshedAvatarUrl === uploadedAvatarUrl) {',
    '            setPendingProfileAvatarUrl("");',
    '          }',
    '        }).finally(() => {',
    '          setProfileImageRefreshing(false);',
    '        });',
    '      } else {',
    '        setProfileImageRefreshing(false);',
    '      }',
    '      return true;'
]
lines[7743:7759] = [
    "      setProfileImageSuccess('Profile image updated successfully.');",
    "      void mobileGlobalMutate(swrKeys.proxy.path('/customer-dashboard/summary', withSessionCacheScope(session))).then((refreshedState) => {",
    '        const refreshedAvatarUrl = normalizeProfileAvatarUrl(',
    '          refreshedState?.dashboard?.profile?.avatar_url',
    '          || refreshedState?.dashboard?.profile?.profile_image',
    '          || refreshedState?.profile?.avatar_url',
    '          || refreshedState?.profile?.profile_image',
    '        );',
    '        if (uploadedAvatarUrl && refreshedAvatarUrl === uploadedAvatarUrl) {',
    '          setPendingProfileAvatarUrl("");',
    '        }',
    '      }).finally(() => {',
    '        setProfileImageRefreshing(false);',
    '      });',
    '      return true;'
]
p.write_text('\n'.join(lines) + '\n', encoding='utf-8')
print('patched by line index')
