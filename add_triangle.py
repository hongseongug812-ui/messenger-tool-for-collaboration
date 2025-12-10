import re

# Read file
with open('src/renderer/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Triangle button HTML to add after circle button
triangle_btn = '''            <button class="tool-btn" data-tool="triangle" title="삼각형">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 3L22 21H2L12 3z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
              </svg>
            </button>
'''

# Find the circle button end and insert triangle after it
circle_end = '</button>\n            <button class="tool-btn" data-tool="text"'
new_content = content.replace(circle_end, f'</button>\n{triangle_btn}            <button class="tool-btn" data-tool="text"')

if new_content != content:
    with open('src/renderer/index.html', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Triangle button added!")
else:
    print("Pattern not found")
