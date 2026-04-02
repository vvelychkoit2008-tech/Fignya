class PrototypePlayer {
    constructor(engine) {
        this.engine = engine;
        this.node = document.getElementById('proto-player');
        this.inner = document.getElementById('proto-player-inner');
        this.btnClose = document.getElementById('btn-close-proto');
        this.currentFrameId = null;
        this.init();
    }

    init() {
        if (this.btnClose) {
            this.btnClose.addEventListener('click', () => this.stop());
        }
    }

    start() {
        const startFrame = this.engine.shapes.find(s => s.type === 'frame');
        if (!startFrame) { alert('Будь ласка, створіть хоча б один фрейм!'); return; }
        this.node.style.display = 'flex';
        this.openFrame(startFrame.id);
    }

    stop() {
        this.node.style.display = 'none';
        this.inner.innerHTML = '';
    }

    openFrame(id) {
        const frame = this.engine.getShapeById(id);
        if (!frame) return;
        this.currentFrameId = id;
        this.inner.innerHTML = '';
        this.inner.style.width = (frame.width) + 'px';
        this.inner.style.height = (frame.height) + 'px';
        this.inner.style.background = frame.fill;
        this.inner.style.position = 'relative';
        this.inner.style.overflow = 'hidden';
        
        const children = this.engine.shapes.filter(s => s.groupId === id);
        children.forEach(c => {
            const el = document.createElement('div');
            el.className = 'proto-element';
            el.style.position = 'absolute';
            el.style.left = (c.x - frame.x) + 'px';
            el.style.top = (c.y - frame.y) + 'px';
            el.style.width = c.width + 'px';
            el.style.height = c.height + 'px';
            
            if (c.type === 'text') {
                el.textContent = c.text;
                el.style.color = c.fill;
                el.style.fontSize = (c.fontSize || 16) + 'px';
                el.style.fontWeight = c.fontWeight || 400;
                el.style.fontFamily = 'Inter, sans-serif';
            } else if (c.type === 'image') {
                el.style.backgroundImage = `url(${c.src})`;
                el.style.backgroundSize = 'cover';
                el.style.backgroundPosition = 'center';
            } else {
                el.style.background = c.fill || '#ccc';
                el.style.borderRadius = (c.cornerRadius || 0) + 'px';
                if(c.stroke && c.stroke !== 'none') {
                    el.style.border = `${c.strokeWidth}px solid ${c.stroke}`;
                }
            }

            const link = this.engine.prototype.links.find(l => l.sourceId === c.id);
            if(link) {
                el.style.cursor = 'pointer';
                el.style.boxShadow = '0 0 0 2px rgba(10, 132, 255, 0.3)';
                el.onclick = () => this.openFrame(link.targetId);
            }
            this.inner.appendChild(el);
        });
    }
}
