import re

with open('src/renderer/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Add nickname and status_message fields after email field
old_pattern = '''          <div class="form-group">
            <label for="edit-profile-email">이메일</label>
            <input type="email" id="edit-profile-email" placeholder="이메일을 입력하세요">
          </div>

          <div class="profile-section-title" style="margin-top: 16px;">조직 정보</div>'''

new_content = '''          <div class="form-group">
            <label for="edit-profile-email">이메일</label>
            <input type="email" id="edit-profile-email" placeholder="이메일을 입력하세요">
          </div>

          <div class="form-group">
            <label for="edit-profile-nickname">닉네임</label>
            <input type="text" id="edit-profile-nickname" placeholder="닉네임을 입력하세요">
          </div>

          <div class="form-group">
            <label for="edit-profile-status-msg">상태 메시지</label>
            <input type="text" id="edit-profile-status-msg" placeholder="상태 메시지를 입력하세요">
          </div>

          <div class="profile-section-title" style="margin-top: 16px;">조직 정보</div>'''

content = content.replace(old_pattern, new_content)

with open('src/renderer/index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print('Success')
