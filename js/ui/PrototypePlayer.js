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
        this.node.classList.remove('hidden');
        this.node.style.display = 'flex'; // Ensure flex layout
        this.openFrame(startFrame.id);
        lucide.createIcons({root: this.node});
    }

    stop() {
        this.node.classList.add('hidden');
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
        
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.position = 'absolute';
        svg.style.top = '0';
        svg.style.left = '0';
        svg.setAttribute('viewBox', `${frame.x} ${frame.y} ${frame.width} ${frame.height}`);
        
        const renderDescendants = (parentId) => {
            const children = this.engine.shapes.filter(s => s.groupId === parentId);
            children.forEach(c => {
                if (c.isHidden) return;
                
                // Clone the actual SVG node to preserve all visual properties exactly
                if (c.node) {
                    const clone = c.node.cloneNode(true);
                    
                    const link = this.engine.prototype.links.find(l => l.sourceId === c.id);
                    if(link) {
                        clone.style.cursor = 'pointer';
                        clone.style.pointerEvents = 'all';
                        // Add a subtle stroke or filter to indicate interactability if wanted
                        clone.onclick = (e) => {
                            e.stopPropagation();
                            this.openFrame(link.targetId);
                        };
                    } else {
                        // Allow click-through naturally if no link exists
                    }
                    
                    svg.appendChild(clone);
                }
                
                if (c.type === 'group' || c.type === 'frame') {
                    renderDescendants(c.id);
                }
            });
        };
        
        renderDescendants(id);
        this.inner.appendChild(svg);
    }
}
