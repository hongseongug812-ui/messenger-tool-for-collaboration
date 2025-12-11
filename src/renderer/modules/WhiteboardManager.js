export class WhiteboardManager {
    constructor(app) {
        this.app = app;
        this.canvas = null;
        this.ctx = null;
        this.isDrawing = false;
        this.currentTool = 'pen';
        this.currentColor = '#000000';
        this.brushSize = 2;

        // For shapes
        this.startX = 0;
        this.startY = 0;
        this.snapshot = null;

        // History for undo/redo
        this.history = [];
        this.historyStep = -1;
        this.maxHistory = 50;

        this.isInitialized = false;

        // 서버/채널별 캔버스 상태 저장 (key: "serverId:channelId")
        this.canvasStates = {};
        this.currentStateKey = null;
    }

    // 채널 변경 시 호출 - 현재 상태 저장
    onChannelChange() {
        if (this.currentStateKey && this.canvas && this.ctx) {
            this.canvasStates[this.currentStateKey] = this.canvas.toDataURL();
            console.log('[WhiteboardManager] Saved state on channel change for:', this.currentStateKey);
        }
        // 키 초기화 - 다음 open()에서 새로 설정됨
        this.currentStateKey = null;
    }

    initialize() {
        if (this.isInitialized) return;

        this.canvas = document.getElementById('whiteboard-canvas');
        if (!this.canvas) {
            console.error('[WhiteboardManager] Canvas not found');
            return;
        }

        console.log('[WhiteboardManager] Initializing canvas');

        // Set canvas size
        this.canvas.width = 1500;
        this.canvas.height = 900;

        this.ctx = this.canvas.getContext('2d');
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.bindEvents();
        this.saveState();
        this.isInitialized = true;

        console.log('[WhiteboardManager] Initialized successfully');
    }

    bindEvents() {
        // Tool buttons
        document.getElementById('wb-tool-pen')?.addEventListener('click', () => this.setTool('pen'));
        document.getElementById('wb-tool-eraser')?.addEventListener('click', () => this.setTool('eraser'));
        document.getElementById('wb-tool-line')?.addEventListener('click', () => this.setTool('line'));
        document.getElementById('wb-tool-rect')?.addEventListener('click', () => this.setTool('rect'));
        document.getElementById('wb-tool-circle')?.addEventListener('click', () => this.setTool('circle'));
        document.getElementById('wb-tool-triangle')?.addEventListener('click', () => this.setTool('triangle'));

        // Also bind via data-tool attribute
        document.querySelectorAll('.whiteboard-toolbar [data-tool]').forEach(btn => {
            btn.addEventListener('click', () => {
                const tool = btn.dataset.tool === 'rectangle' ? 'rect' : btn.dataset.tool;
                this.setTool(tool);
            });
        });

        // Color picker
        const colorPicker = document.getElementById('wb-color');
        if (colorPicker) {
            colorPicker.addEventListener('change', (e) => {
                this.currentColor = e.target.value;
            });
        }

        // Brush size
        const brushSlider = document.getElementById('wb-brush-size');
        const brushLabel = document.getElementById('wb-brush-size-label');
        if (brushSlider && brushLabel) {
            brushSlider.addEventListener('input', (e) => {
                this.brushSize = parseInt(e.target.value);
                brushLabel.textContent = this.brushSize;
            });
        }

        // Action buttons
        document.getElementById('wb-undo')?.addEventListener('click', () => this.undo());
        document.getElementById('wb-redo')?.addEventListener('click', () => this.redo());
        document.getElementById('wb-clear')?.addEventListener('click', () => this.clear());
        document.getElementById('wb-download')?.addEventListener('click', () => this.download());

        // Canvas events
        this.canvas.addEventListener('mousedown', (e) => this.startDraw(e));
        this.canvas.addEventListener('mousemove', (e) => this.draw(e));
        this.canvas.addEventListener('mouseup', () => this.stopDraw());
        this.canvas.addEventListener('mouseout', () => this.stopDraw());

        // Socket.IO events for real-time sync
        this.bindSocketEvents();
    }

    bindSocketEvents() {
        // Use electronAPI to listen for socket events
        console.log('[WhiteboardManager] bindSocketEvents called, electronAPI:', !!window.electronAPI);

        if (window.electronAPI && window.electronAPI.onSocketEvent) {
            console.log('[WhiteboardManager] Binding socket events for whiteboard via electronAPI');

            window.electronAPI.onSocketEvent('whiteboard_draw', (data) => {
                console.log('[WhiteboardManager] Received whiteboard_draw:', data);
                this.handleRemoteDraw(data);
            });

            window.electronAPI.onSocketEvent('whiteboard_clear', (data) => {
                console.log('[WhiteboardManager] Received whiteboard_clear:', data);
                this.handleRemoteClear(data);
            });
        } else {
            console.log('[WhiteboardManager] electronAPI not ready, retrying in 1s...');
            setTimeout(() => this.bindSocketEvents(), 1000);
        }
    }

    setTool(tool) {
        this.currentTool = tool;

        // Update active button - find by data-tool attribute
        document.querySelectorAll('.whiteboard-toolbar .tool-btn').forEach(btn => btn.classList.remove('active'));

        // Handle rectangle vs rect difference
        const toolAttr = tool === 'rect' ? 'rectangle' : tool;
        const activeBtn = document.querySelector(`.whiteboard-toolbar [data-tool="${toolAttr}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }

        // Update cursor
        if (tool === 'eraser') {
            this.canvas.classList.add('eraser-cursor');
        } else {
            this.canvas.classList.remove('eraser-cursor');
        }

        console.log('[WhiteboardManager] Tool selected:', tool);
    }

    startDraw(e) {
        this.isDrawing = true;
        const rect = this.canvas.getBoundingClientRect();

        // Account for CSS scaling - map mouse position to canvas coordinates
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;

        this.startX = (e.clientX - rect.left) * scaleX;
        this.startY = (e.clientY - rect.top) * scaleY;

        if (this.currentTool === 'pen' || this.currentTool === 'eraser') {
            this.ctx.beginPath();
            this.ctx.moveTo(this.startX, this.startY);
        } else {
            // Save canvas state for shapes
            this.snapshot = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        }

        console.log('[WhiteboardManager] startDraw - tool:', this.currentTool, 'x:', this.startX, 'y:', this.startY);
    }

    draw(e) {
        if (!this.isDrawing) return;

        const rect = this.canvas.getBoundingClientRect();

        // Account for CSS scaling - map mouse position to canvas coordinates
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;

        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        this.ctx.strokeStyle = this.currentTool === 'eraser' ? '#ffffff' : this.currentColor;
        this.ctx.lineWidth = this.currentTool === 'eraser' ? this.brushSize * 3 : this.brushSize;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        if (this.currentTool === 'pen' || this.currentTool === 'eraser') {
            this.ctx.lineTo(x, y);
            this.ctx.stroke();

            // Emit drawing data to other users
            this.emitDrawData({
                tool: this.currentTool,
                color: this.currentColor,
                size: this.brushSize,
                startX: this.startX,
                startY: this.startY,
                endX: x,
                endY: y,
                type: 'path'
            });

            this.startX = x;
            this.startY = y;
        } else {
            // For shapes, restore snapshot and draw preview
            this.ctx.putImageData(this.snapshot, 0, 0);
            this.drawShape(this.startX, this.startY, x, y, false); // Don't emit during drag
            this.lastX = x;
            this.lastY = y;
        }
    }

    stopDraw(e) {
        if (!this.isDrawing) return;

        // For shapes, emit the final shape
        if (this.currentTool !== 'pen' && this.currentTool !== 'eraser' && this.lastX !== undefined) {
            this.emitDrawData({
                tool: this.currentTool,
                color: this.currentColor,
                size: this.brushSize,
                startX: this.startX,
                startY: this.startY,
                endX: this.lastX,
                endY: this.lastY,
                type: 'shape'
            });
        }

        this.isDrawing = false;
        this.ctx.closePath();
        this.lastX = undefined;
        this.lastY = undefined;

        // Save state for undo/redo
        this.saveState();
    }

    drawShape(startX, startY, endX, endY, emit = true) {
        this.ctx.strokeStyle = this.currentColor;
        this.ctx.lineWidth = this.brushSize;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        switch (this.currentTool) {
            case 'line':
                this.ctx.beginPath();
                this.ctx.moveTo(startX, startY);
                this.ctx.lineTo(endX, endY);
                this.ctx.stroke();
                break;

            case 'rect':
                const width = endX - startX;
                const height = endY - startY;
                this.ctx.strokeRect(startX, startY, width, height);
                break;

            case 'circle':
                const radius = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
                this.ctx.beginPath();
                this.ctx.arc(startX, startY, radius, 0, 2 * Math.PI);
                this.ctx.stroke();
                break;

            case 'triangle':
                const triWidth = endX - startX;
                const triHeight = endY - startY;
                this.ctx.beginPath();
                this.ctx.moveTo(startX + triWidth / 2, startY);
                this.ctx.lineTo(startX, endY);
                this.ctx.lineTo(endX, endY);
                this.ctx.closePath();
                this.ctx.stroke();
                break;
        }

        if (emit) {
            // Emit shape data to other users
            this.emitDrawData({
                tool: this.currentTool,
                color: this.currentColor,
                size: this.brushSize,
                startX: startX,
                startY: startY,
                endX: endX,
                endY: endY,
                type: 'shape'
            });
        }
    }

    emitDrawData(data) {
        const serverId = this.app.serverManager.currentServer?.id;
        const channelId = this.app.serverManager.currentChannel?.id;
        console.log('[WhiteboardManager] emitDrawData - serverId:', serverId, 'channelId:', channelId, 'data:', data.type);
        if (!serverId || !channelId) {
            console.warn('[WhiteboardManager] No server/channel ID, cannot emit');
            return;
        }

        this.app.socketManager.emit('whiteboard_draw', {
            serverId: serverId,
            channelId: channelId,
            drawData: data
        });
        console.log('[WhiteboardManager] Emitted whiteboard_draw event');
    }

    handleRemoteDraw(data) {
        const serverId = this.app.serverManager.currentServer?.id;
        const channelId = this.app.serverManager.currentChannel?.id;
        if (data.serverId !== serverId || data.channelId !== channelId) return;

        const drawData = data.drawData;

        if (drawData.type === 'path') {
            this.ctx.strokeStyle = drawData.tool === 'eraser' ? '#ffffff' : drawData.color;
            this.ctx.lineWidth = drawData.tool === 'eraser' ? drawData.size * 3 : drawData.size;
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';

            this.ctx.beginPath();
            this.ctx.moveTo(drawData.startX, drawData.startY);
            this.ctx.lineTo(drawData.endX, drawData.endY);
            this.ctx.stroke();
            this.ctx.closePath();
        } else if (drawData.type === 'shape') {
            // Save current tool state
            const savedTool = this.currentTool;
            const savedColor = this.currentColor;
            const savedBrushSize = this.brushSize;

            // Set remote tool state
            this.currentTool = drawData.tool;
            this.currentColor = drawData.color;
            this.brushSize = drawData.size;

            // Draw the shape
            this.drawShape(drawData.startX, drawData.startY, drawData.endX, drawData.endY, false);

            // Restore original tool state
            this.currentTool = savedTool;
            this.currentColor = savedColor;
            this.brushSize = savedBrushSize;
        }

        this.saveState();
    }

    saveState() {
        // Remove any states after current step
        this.history = this.history.slice(0, this.historyStep + 1);

        // Save current state
        this.history.push(this.canvas.toDataURL());

        // Limit history size
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        } else {
            this.historyStep++;
        }
    }

    undo() {
        if (this.historyStep > 0) {
            this.historyStep--;
            this.restoreState(this.history[this.historyStep]);
        }
    }

    redo() {
        if (this.historyStep < this.history.length - 1) {
            this.historyStep++;
            this.restoreState(this.history[this.historyStep]);
        }
    }

    restoreState(dataUrl) {
        const img = new Image();
        img.src = dataUrl;
        img.onload = () => {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.drawImage(img, 0, 0);
        };
    }

    clear() {
        if (!confirm('화이트보드를 전체 지우시겠습니까?')) return;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.saveState();

        // Emit clear event to other users
        const serverId = this.app.serverManager.currentServer?.id;
        const channelId = this.app.serverManager.currentChannel?.id;
        if (serverId && channelId) {
            this.app.socketManager.emit('whiteboard_clear', { serverId, channelId });
        }
    }

    handleRemoteClear(data) {
        if (!data) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.saveState();
            return;
        }

        const serverId = this.app.serverManager.currentServer?.id;
        const channelId = this.app.serverManager.currentChannel?.id;
        if (data.serverId === serverId && data.channelId === channelId) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.saveState();
        }
    }

    download() {
        const link = document.createElement('a');
        link.download = `whiteboard_${new Date().toISOString().slice(0, 10)}.png`;
        link.href = this.canvas.toDataURL('image/png');
        link.click();
    }

    open() {
        document.getElementById('whiteboard-modal').style.display = 'flex';
        if (!this.isInitialized) {
            this.initialize();
        }

        // 현재 서버 ID로 키 계산 (서버별로 그림판 분리)
        const serverId = this.app.serverManager.currentServer?.id || 'default';

        console.log('[WhiteboardManager] open() - 현재키:', this.currentStateKey, '새키:', serverId);

        // 서버가 변경된 경우에만 캔버스 전환
        if (serverId !== this.currentStateKey) {
            console.log('[WhiteboardManager] 서버 변경 감지! 캔버스 전환 시작...');

            // 이전 서버의 캔버스 상태 저장
            if (this.currentStateKey && this.canvas && this.ctx) {
                const dataUrl = this.canvas.toDataURL();
                this.canvasStates[this.currentStateKey] = dataUrl;
                console.log('[WhiteboardManager] 이전 서버 상태 저장:', this.currentStateKey);
            }

            // 새 서버로 키 변경
            this.currentStateKey = serverId;

            // 새 서버의 저장된 캔버스가 있으면 복원
            if (this.canvasStates[serverId]) {
                console.log('[WhiteboardManager] 저장된 상태 복원:', serverId);
                const img = new Image();
                img.src = this.canvasStates[serverId];
                img.onload = () => {
                    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                    this.ctx.drawImage(img, 0, 0);
                    this.history = [];
                    this.historyStep = -1;
                    this.saveState();
                };
            } else {
                // 새 서버는 빈 캔버스
                console.log('[WhiteboardManager] 새 빈 캔버스 생성:', serverId);
                this.ctx.fillStyle = '#ffffff';
                this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                this.history = [];
                this.historyStep = -1;
                this.saveState();
            }
        } else {
            console.log('[WhiteboardManager] 같은 서버 - 캔버스 유지');
        }
    }

    close() {
        // 닫을 때 현재 상태 저장
        if (this.currentStateKey && this.canvas && this.ctx) {
            this.canvasStates[this.currentStateKey] = this.canvas.toDataURL();
            console.log('[WhiteboardManager] 닫기 시 상태 저장:', this.currentStateKey);
        }

        document.getElementById('whiteboard-modal').style.display = 'none';
    }
}
