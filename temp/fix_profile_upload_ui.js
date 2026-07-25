const fs = require('fs');

const dashboardPath = 'NevariAdmin Storefront/app/_customer-dashboard.js';
const cssPath = 'NevariAdmin Storefront/app/globals.css';

let dashboard = fs.readFileSync(dashboardPath, 'utf8');
let css = fs.readFileSync(cssPath, 'utf8');

const spinnerOld = '.customer-profile-upload-card .button-spinner {\r\n  --spinner-size: 24px;\r\n}';
const spinnerNew = '.customer-profile-upload-card .button-spinner {\r\n  --spinner-size: 16px;\r\n}';
if (!css.includes(spinnerOld)) {
  throw new Error('Spinner CSS block not found');
}
css = css.replace(spinnerOld, spinnerNew);

const desktopOld = '        const result = await uploadCustomerProfileImage(session, payload);\r\n' +
  '        const nextAvatarUrl = result?.avatar_url || result?.src || "";\r\n' +
  '        if (nextAvatarUrl) {\r\n' +
  '          await mutateSummary((current) => current ? {\r\n' +
  '            ...current,\r\n' +
  '            dashboard: {\r\n' +
  '              ...(current.dashboard || {}),\r\n' +
  '              profile: {\r\n' +
  '                ...(current.dashboard?.profile || profile || {}),\r\n' +
  '                avatar_url: nextAvatarUrl,\r\n' +
  '                profile_image: nextAvatarUrl,\r\n' +
  '              },\r\n' +
  '            },\r\n' +
  '          } : current, { revalidate: false });\r\n' +
  '        }\r\n';

const desktopNew = '        const result = await uploadCustomerProfileImage(session, payload);\r\n' +
  '        const nextAvatarUrl = result?.avatar_url || result?.src || "";\r\n' +
  '        if (nextAvatarUrl) {\r\n' +
  '          const nextProfile = {\r\n' +
  '            ...(profile || {}),\r\n' +
  '            ...(state.dashboard?.profile || {}),\r\n' +
  '            avatar_url: nextAvatarUrl,\r\n' +
  '            profile_image: nextAvatarUrl,\r\n' +
  '          };\r\n' +
  '          await mutateSummary((current) => current ? {\r\n' +
  '            ...current,\r\n' +
  '            profile: {\r\n' +
  '              ...(current.profile || {}),\r\n' +
  '              ...nextProfile,\r\n' +
  '            },\r\n' +
  '            dashboard: {\r\n' +
  '              ...(current.dashboard || {}),\r\n' +
  '              profile: {\r\n' +
  '                ...(current.dashboard?.profile || {}),\r\n' +
  '                ...nextProfile,\r\n' +
  '              },\r\n' +
  '            },\r\n' +
  '          } : current, { revalidate: false });\r\n' +
  '          setSession((current) => current ? {\r\n' +
  '            ...current,\r\n' +
  '            user: {\r\n' +
  '              ...(current.user || {}),\r\n' +
  '              avatar_url: nextAvatarUrl,\r\n' +
  '              avatarUrl: nextAvatarUrl,\r\n' +
  '              picture: nextAvatarUrl,\r\n' +
  '            },\r\n' +
  '          } : current);\r\n' +
  '        }\r\n';

if (!dashboard.includes(desktopOld)) {
  throw new Error('Desktop upload block not found');
}
dashboard = dashboard.replace(desktopOld, desktopNew);

const mobileOld = '      const result = await uploadCustomerProfileImage(session, payload);\r\n' +
  '      const nextAvatarUrl = result?.avatar_url || result?.src || "";\r\n' +
  '      if (nextAvatarUrl) {\r\n' +
  '        await mobileGlobalMutate(\r\n' +
  "          swrKeys.proxy.path('/customer-dashboard/summary', withSessionCacheScope(session)),\r\n" +
  '          (current) => current ? {\r\n' +
  '            ...current,\r\n' +
  '            dashboard: {\r\n' +
  '              ...(current.dashboard || {}),\r\n' +
  '              profile: {\r\n' +
  '                ...(current.dashboard?.profile || profile || {}),\r\n' +
  '                avatar_url: nextAvatarUrl,\r\n' +
  '                profile_image: nextAvatarUrl,\r\n' +
  '              },\r\n' +
  '            },\r\n' +
  '          } : current,\r\n' +
  '          { revalidate: false }\r\n' +
  '        );\r\n' +
  '      }\r\n';

const mobileNew = '      const result = await uploadCustomerProfileImage(session, payload);\r\n' +
  '      const nextAvatarUrl = result?.avatar_url || result?.src || "";\r\n' +
  '      if (nextAvatarUrl) {\r\n' +
  '        const nextProfile = {\r\n' +
  '          ...(profile || {}),\r\n' +
  '          ...(state.dashboard?.profile || {}),\r\n' +
  '          avatar_url: nextAvatarUrl,\r\n' +
  '          profile_image: nextAvatarUrl,\r\n' +
  '        };\r\n' +
  '        await mobileGlobalMutate(\r\n' +
  "          swrKeys.proxy.path('/customer-dashboard/summary', withSessionCacheScope(session)),\r\n" +
  '          (current) => current ? {\r\n' +
  '            ...current,\r\n' +
  '            profile: {\r\n' +
  '              ...(current.profile || {}),\r\n' +
  '              ...nextProfile,\r\n' +
  '            },\r\n' +
  '            dashboard: {\r\n' +
  '              ...(current.dashboard || {}),\r\n' +
  '              profile: {\r\n' +
  '                ...(current.dashboard?.profile || {}),\r\n' +
  '                ...nextProfile,\r\n' +
  '              },\r\n' +
  '            },\r\n' +
  '          } : current,\r\n' +
  '          { revalidate: false }\r\n' +
  '        );\r\n' +
  '        setSession((current) => current ? {\r\n' +
  '          ...current,\r\n' +
  '          user: {\r\n' +
  '            ...(current.user || {}),\r\n' +
  '            avatar_url: nextAvatarUrl,\r\n' +
  '            avatarUrl: nextAvatarUrl,\r\n' +
  '            picture: nextAvatarUrl,\r\n' +
  '          },\r\n' +
  '        } : current);\r\n' +
  '      }\r\n';

if (!dashboard.includes(mobileOld)) {
  throw new Error('Mobile upload block not found');
}
dashboard = dashboard.replace(mobileOld, mobileNew);

fs.writeFileSync(dashboardPath, dashboard);
fs.writeFileSync(cssPath, css);
console.log('Applied profile upload UI fixes.');
