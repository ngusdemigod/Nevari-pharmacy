from pathlib import Path

css_path = Path(r'NevariAdmin Storefront/app/globals.css')
dashboard_path = Path(r'NevariAdmin Storefront/app/_customer-dashboard.js')

css_lines = css_path.read_text(encoding='utf-8').splitlines()
for index, line in enumerate(css_lines):
    if line.strip() == '--spinner-size: 24px;':
        css_lines[index] = '  --spinner-size: 16px;'
        break
else:
    raise SystemExit('Spinner CSS line not found')
css_path.write_text('\n'.join(css_lines) + '\n', encoding='utf-8')

lines = dashboard_path.read_text(encoding='utf-8').splitlines()

def replace_block(start_line, end_line, new_block):
    try:
        start = lines.index(start_line)
    except ValueError as error:
        raise SystemExit(f'Start line not found: {start_line}') from error
    end = start
    while end < len(lines) and lines[end] != end_line:
        end += 1
    if end >= len(lines):
        raise SystemExit(f'End line not found after {start_line}: {end_line}')
    end += 1
    lines[start:end] = new_block

replace_block(
    '      const result = await uploadCustomerProfileImage(session, payload);',
    '      }',
    [
        '      const result = await uploadCustomerProfileImage(session, payload);',
        '      const nextAvatarUrl = result?.avatar_url || result?.src || "";',
        '      if (nextAvatarUrl) {',
        '        const nextProfile = {',
        '          ...(profile || {}),',
        '          ...(state.dashboard?.profile || {}),',
        '          avatar_url: nextAvatarUrl,',
        '          profile_image: nextAvatarUrl,',
        '        }',
        '        await mutateSummary((current) => current ? {',
        '          ...current,',
        '          profile: {',
        '            ...(current.profile || {}),',
        '            ...nextProfile,',
        '          },',
        '          dashboard: {',
        '            ...(current.dashboard || {}),',
        '            profile: {',
        '              ...(current.dashboard?.profile || {}),',
        '              ...nextProfile,',
        '            },',
        '          },',
        '        } : current, { revalidate: false })',
        '        setSession((current) => current ? {',
        '          ...current,',
        '          user: {',
        '            ...(current.user || {}),',
        '            avatar_url: nextAvatarUrl,',
        '            avatarUrl: nextAvatarUrl,',
        '            picture: nextAvatarUrl,',
        '          },',
        '        } : current)',
        '      }',
    ],
)

mobile_marker = "          swrKeys.proxy.path('/customer-dashboard/summary', withSessionCacheScope(session)),"
mobile_start = next((i for i, line in enumerate(lines) if line == '      const result = await uploadCustomerProfileImage(session, payload);' and i > 7000), None)
if mobile_start is None:
    raise SystemExit('Mobile start line not found')
mobile_end = mobile_start
while mobile_end < len(lines) and lines[mobile_end] != '      }':
    mobile_end += 1
if mobile_end >= len(lines):
    raise SystemExit('Mobile end line not found')
mobile_end += 1
lines[mobile_start:mobile_end] = [
    '      const result = await uploadCustomerProfileImage(session, payload);',
    '      const nextAvatarUrl = result?.avatar_url || result?.src || "";',
    '      if (nextAvatarUrl) {',
    '        const nextProfile = {',
    '          ...(profile || {}),',
    '          ...(state.dashboard?.profile || {}),',
    '          avatar_url: nextAvatarUrl,',
    '          profile_image: nextAvatarUrl,',
    '        }',
    '        await mobileGlobalMutate(',
    mobile_marker,
    '          (current) => current ? {',
    '            ...current,',
    '            profile: {',
    '              ...(current.profile || {}),',
    '              ...nextProfile,',
    '            },',
    '            dashboard: {',
    '              ...(current.dashboard || {}),',
    '              profile: {',
    '                ...(current.dashboard?.profile || {}),',
    '                ...nextProfile,',
    '              },',
    '            },',
    '          } : current,',
    '          { revalidate: false }',
    '        )',
    '        setSession((current) => current ? {',
    '          ...current,',
    '          user: {',
    '            ...(current.user || {}),',
    '            avatar_url: nextAvatarUrl,',
    '            avatarUrl: nextAvatarUrl,',
    '            picture: nextAvatarUrl,',
    '          },',
    '        } : current)',
    '      }',
]

dashboard_path.write_text('\n'.join(lines) + '\n', encoding='utf-8')
print('Applied profile upload fixes.')
