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

        // Update active button
        document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`wb-tool-${tool}`)?.classList.add('active');

        // Update cursor
        if (tool === 'eraser') {
            this.canvas.classList.add('eraser-cursor');
        } else {
            this.canvas.classList.remove('eraser-cursor');
        }
    }

    startDraw(e) {
        this.isDrawing = true;
        const rect = this.canvas.getBoundingClientRect();
        this.startX = e.clientX - rect.left;
        this.startY = e.clientY - rect.top;

        if (this.currentTool === 'pen' || this.currentTool === 'eraser') {
            this.ctx.beginPath();
            this.ctx.moveTo(this.startX, this.startY);
        } else {
            // Save canvas state for shapes
            this.snapshot = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    draw(e) {
        if (!this.isDrawing) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

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
            this.drawShape(this.startX, this.startY, x, y);
        }
    }

    stopDraw() {
        if (!this.isDrawing) return;

        this.isDrawing = false;
        this.ctx.closePath();

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
        const channelId = this.app.serverManager.currentChannel?.id;
        console.log('[WhiteboardManager] emitDrawData - channelId:', channelId, 'data:', data.type);
        if (!channelId) {
            console.warn('[WhiteboardManager] No channel ID, cannot emit');
            return;
        }

        this.app.socketManager.emit('whiteboard_draw', {
            channelId: channelId,
            drawData: data
        });
        console.log('[WhiteboardManager] Emitted whiteboard_draw event');
    }

    handleRemoteDraw(data) {
        const channelId = this.app.serverManager.currentChannel?.id;
        if (data.channelId !== channelId) return;

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
            this.drawShape(drawData.startX, drawData.startY, drawData.endX, drawData.endY, false);
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
        const channelId = this.app.serverManager.currentChannel?.id;
        if (channelId) {
            this.app.socketManager.emit('whiteboard_clear', { channelId });
        }
    }

    handleRemoteClear(data) {
        if (!data) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.saveState();
            return;
        }

        const channelId = this.app.serverManager.currentChannel?.id;
        if (data.channelId === channelId) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.saveState();
        }
    }

    open() {
        document.getElementById('whiteboard-modal').style.display = 'flex';
        if (!this.isInitialized) {
            this.initialize();
        }
    }

    close() {
        document.getElementById('whiteboard-modal').style.display = 'none';
    }
}
