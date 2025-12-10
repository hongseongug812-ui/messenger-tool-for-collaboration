import re

# Read file
with open('src/renderer/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Notepad button to add before voice call button
notepad_btn = '''<button class="icon-btn" title="공유 메모장" id="open-notepad-btn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
              </svg>
            </button>
            '''

# Find voice call button and add notepad before it
target = '<button class="icon-btn" title="음성/화상 통화" id="start-call-btn"'
new_content = content.replace(target, notepad_btn + target)

if new_content != content:
    with open('src/renderer/index.html', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Notepad button added!")
else:
    print("Pattern not found")
