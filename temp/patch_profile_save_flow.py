from pathlib import Path

p = Path(r'D:/dev/nevari-pharmacy-core/NevariAdmin Storefront/app/_customer-dashboard.js')
text = p.read_text(encoding='utf-8')

old_btn = '{uploading ? <BrandedSpinner className="button-spinner" label="Saving image" /> : "Save"}'
new_btn = '{uploading ? <span className="appointment-cta-spinner" aria-label="Saving image" /> : "Save"}'
if old_btn not in text:
    raise SystemExit('save button loader block not found')
text = text.replace(old_btn, new_btn, 1)

old_desktop = '''      setProfileImageSuccess("Profile image updated successfully.");
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
      return true;'''
new_desktop = '''      setProfileImageSuccess("Profile image updated successfully.");
      showDashboardToast("Profile image updated successfully.", "success");
      if (customerSummaryKey) {
        void globalMutate(customerSummaryKey).then((refreshedState) => {
          const refreshedAvatarUrl = normalizeProfileAvatarUrl(
            refreshedState?.dashboard?.profile?.avatar_url
            || refreshedState?.dashboard?.profile?.profile_image
            || refreshedState?.profile?.avatar_url
            || refreshedState?.profile?.profile_image
          );
          if (uploadedAvatarUrl && refreshedAvatarUrl === uploadedAvatarUrl) {
            setPendingProfileAvatarUrl("");
          }
        }).finally(() => {
          setProfileImageRefreshing(false);
        });
      } else {
        setProfileImageRefreshing(false);
      }
      return true;'''
if old_desktop not in text:
    raise SystemExit('desktop refresh block not found')
text = text.replace(old_desktop, new_desktop, 1)

old_mobile = '''      setProfileImageSuccess('Profile image updated successfully.');
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
      return true;'''
new_mobile = '''      setProfileImageSuccess('Profile image updated successfully.');
      void mobileGlobalMutate(swrKeys.proxy.path('/customer-dashboard/summary', withSessionCacheScope(session))).then((refreshedState) => {
        const refreshedAvatarUrl = normalizeProfileAvatarUrl(
          refreshedState?.dashboard?.profile?.avatar_url
          || refreshedState?.dashboard?.profile?.profile_image
          || refreshedState?.profile?.avatar_url
          || refreshedState?.profile?.profile_image
        );
        if (uploadedAvatarUrl && refreshedAvatarUrl === uploadedAvatarUrl) {
          setPendingProfileAvatarUrl("");
        }
      }).finally(() => {
        setProfileImageRefreshing(false);
      });
      return true;'''
if old_mobile not in text:
    raise SystemExit('mobile refresh block not found')
text = text.replace(old_mobile, new_mobile, 1)

p.write_text(text, encoding='utf-8')
print('patched save loader and async refresh flow')
p = Path(r'D:/dev/nevari-pharmacy-core/NevariAdmin Storefront/app/_customer-dashboard.js'
text = p.read_text(encoding='utf-8') 
 
old_btn = '{uploading ? <BrandedSpinner className=\\\"button-spinner\\\" label=\\\"Saving image\\\" /> : \\\"Save\\\"}' 
new_btn = '{uploading ? <span className=\\\"appointment-cta-spinner\\\" aria-label=\\\"Saving image\\\" /> : \\\"Save\\\"}' 
if old_btn not in text: 
    raise SystemExit('save button loader block not found') 
text = text.replace(old_btn, new_btn, 1) 
 
old_desktop = '''      setProfileImageSuccess(\"Profile image updated successfully.\"); 
      showDashboardToast(\"Profile image updated successfully.\", \"success\"); 
      if (customerSummaryKey) { 
        try { 
          const refreshedState = await globalMutate(customerSummaryKey); 
          const refreshedAvatarUrl = normalizeProfileAvatarUrl( 
            refreshedState?.dashboard?.profile?.avatar_url 
            || refreshedState?.dashboard?.profile?.profile_image 
            || refreshedState?.profile?.avatar_url 
            || refreshedState?.profile?.profile_image 
          ); 
          if (uploadedAvatarUrl && refreshedAvatarUrl == uploadedAvatarUrl) { 
            setPendingProfileAvatarUrl(\"\"); 
          } 
        } finally { 
          setProfileImageRefreshing(false); 
        } 
      } else { 
        setProfileImageRefreshing(false); 
      } 
      return true;''' 
new_desktop = '''      setProfileImageSuccess(\"Profile image updated successfully.\"); 
      showDashboardToast(\"Profile image updated successfully.\", \"success\"); 
      if (customerSummaryKey) { 
        void globalMutate(customerSummaryKey).then^((refreshedState) => { 
          const refreshedAvatarUrl = normalizeProfileAvatarUrl( 
            refreshedState?.dashboard?.profile?.avatar_url 
            || refreshedState?.dashboard?.profile?.profile_image 
            || refreshedState?.profile?.avatar_url 
            || refreshedState?.profile?.profile_image 
          ); 
          if (uploadedAvatarUrl && refreshedAvatarUrl == uploadedAvatarUrl) { 
            setPendingProfileAvatarUrl(\"\"); 
          } 
        }).finally^(() => { 
          setProfileImageRefreshing(false); 
        }); 
      } else { 
        setProfileImageRefreshing(false); 
      } 
      return true;''' 
if old_desktop not in text: 
    raise SystemExit('desktop refresh block not found') 
text = text.replace(old_desktop, new_desktop, 1) 
 
old_mobile = '''      setProfileImageSuccess('Profile image updated successfully.'); 
      try { 
        const refreshedState = await mobileGlobalMutate(swrKeys.proxy.path('/customer-dashboard/summary', withSessionCacheScope(session))); 
        const refreshedAvatarUrl = normalizeProfileAvatarUrl( 
          refreshedState?.dashboard?.profile?.avatar_url 
          || refreshedState?.dashboard?.profile?.profile_image 
          || refreshedState?.profile?.avatar_url 
          || refreshedState?.profile?.profile_image 
        ); 
        if (uploadedAvatarUrl && refreshedAvatarUrl == uploadedAvatarUrl) { 
          setPendingProfileAvatarUrl(\"\"); 
        } 
      } finally { 
        setProfileImageRefreshing(false); 
      } 
      return true;''' 
new_mobile = '''      setProfileImageSuccess('Profile image updated successfully.'); 
      void mobileGlobalMutate(swrKeys.proxy.path('/customer-dashboard/summary', withSessionCacheScope(session))).then^((refreshedState) => { 
        const refreshedAvatarUrl = normalizeProfileAvatarUrl( 
          refreshedState?.dashboard?.profile?.avatar_url 
          || refreshedState?.dashboard?.profile?.profile_image 
          || refreshedState?.profile?.avatar_url 
          || refreshedState?.profile?.profile_image 
        ); 
        if (uploadedAvatarUrl && refreshedAvatarUrl == uploadedAvatarUrl) { 
          setPendingProfileAvatarUrl(\"\"); 
        } 
      }).finally^(() => { 
        setProfileImageRefreshing(false); 
      }); 
      return true;''' 
if old_mobile not in text: 
    raise SystemExit('mobile refresh block not found') 
text = text.replace(old_mobile, new_mobile, 1) 
 
p.write_text(text, encoding='utf-8') 
print('patched save loader and async refresh flow') 
