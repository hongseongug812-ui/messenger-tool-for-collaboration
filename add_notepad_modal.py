import re

# Read file
with open('src/renderer/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Notepad modal HTML
notepad_modal = '''
  <!-- 공유 메모장 모달 -->
  <div class="modal-overlay" id="notepad-modal" style="display: none;">
    <div class="modal notepad-modal" style="width: 900px; max-width: 95vw;">
      <div class="modal-header">
        <h3>📝 공유 메모장</h3>
        <span class="notepad-sync-status" id="notepad-sync-status">실시간 동기화 중</span>
        <button class="icon-btn modal-close" id="close-notepad">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
        </button>
      </div>
      <div class="notepad-toolbar">
        <div class="toolbar-group">
          <button class="tool-btn" id="np-bold" title="굵게 (Ctrl+B)"><b>B</b></button>
          <button class="tool-btn" id="np-italic" title="기울임 (Ctrl+I)"><i>I</i></button>
          <button class="tool-btn" id="np-underline" title="밑줄 (Ctrl+U)"><u>U</u></button>
          <button class="tool-btn" id="np-strike" title="취소선"><s>S</s></button>
        </div>
        <div class="toolbar-divider"></div>
        <div class="toolbar-group">
          <button class="tool-btn" id="np-h1" title="제목 1">H1</button>
          <button class="tool-btn" id="np-h2" title="제목 2">H2</button>
        </div>
        <div class="toolbar-divider"></div>
        <div class="toolbar-group">
          <button class="tool-btn" id="np-ul" title="글머리 기호">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M8 6h13M8 12h13M8 18h13M3 6h0M3 12h0M3 18h0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
          <button class="tool-btn" id="np-ol" title="번호 매기기">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M10 6h11M10 12h11M10 18h11M4 6h1v-2M3 8h3M4 12h2M3 17v-1h3l-2 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
        <div class="toolbar-divider"></div>
        <div class="toolbar-group">
          <button class="tool-btn" id="np-code" title="코드">&lt;/&gt;</button>
          <button class="tool-btn" id="np-link" title="링크">🔗</button>
        </div>
        <div class="toolbar-divider"></div>
        <div class="toolbar-group">
          <button class="tool-btn danger" id="np-clear" title="전체 지우기">🗑️</button>
        </div>
      </div>
      <div class="modal-body notepad-body">
        <div class="notepad-editor" id="notepad-editor" contenteditable="true" placeholder="여기에 메모를 작성하세요... 실시간으로 팀원들과 공유됩니다."></div>
      </div>
    </div>
  </div>

'''

# Add before whiteboard modal
target = '<!-- 화이트보드 모달 -->'
new_content = content.replace(target, notepad_modal + target)

if new_content != content:
    with open('src/renderer/index.html', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Notepad modal added!")
else:
    print("Pattern not found")
