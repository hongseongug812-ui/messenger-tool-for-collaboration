with open('src/renderer/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Find and print CSP line
import re
match = re.search(r'<meta http-equiv="Content-Security-Policy"[^>]*>', content)
if match:
    print("CSP found:")
    print(match.group(0))
else:
    print("CSP not found")
