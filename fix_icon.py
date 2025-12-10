import re

# Read file
with open('src/renderer/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Old icon pattern (sun-like icon)
old_svg = r'<svg width="22" height="22" viewBox="0 0 24 24" fill="none">\s*<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1\.5" />\s*<path\s*d="M12 1v2M12 21v2M4\.22 4\.22l1\.42 1\.42M18\.36 18\.36l1\.42 1\.42M1 12h2M21 12h2M4\.22 19\.78l1\.42-1\.42M18\.36 5\.64l1\.42-1\.42"\s*stroke="currentColor" stroke-width="1\.5" stroke-linecap="round" />\s*</svg>'

# New gear icon
new_svg = '''<svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" stroke-width="1.5"/>
            </svg>'''

# Replace
new_content = re.sub(old_svg, new_svg, content)

if new_content != content:
    with open('src/renderer/index.html', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Settings icon updated to gear!")
else:
    print("Pattern not found, no changes made")
