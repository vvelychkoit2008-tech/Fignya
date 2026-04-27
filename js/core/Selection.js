class SelectionManager {
    constructor(engine, ui) {
        this.engine = engine;
        this.ui = ui;
        this.smartGuides = [];
    }

    updateUI() {
        this.ui.querySelectorAll('.bbox, .path-point, .path-handle, .path-handle-link').forEach(n => n.remove());
        
        // Remove hidden from selection
        this.engine.selectedIds = this.engine.selectedIds.filter(id => {
            const sh = this.engine.getShapeById(id);
            return sh && !sh.isHidden;
        });

        if (this.engine.selectedIds.length === 1 && (this.engine.activeTool !== 'hand' || this.engine.mode === 'inspect')) {
            const sh = this.engine.getShapeById(this.engine.selectedIds[0]);
            this.drawBoundingBox(sh, false, sh.type === 'group' || sh.isAutoLayout);
            if (sh && sh.type === 'path') this.drawPathEditor(sh);
        } else if (this.engine.selectedIds.length > 1 && (this.engine.activeTool !== 'hand' || this.engine.mode === 'inspect')) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            this.engine.selectedIds.forEach(id => {
                const s = this.engine.getShapeById(id);
                if(s.x < minX) minX = s.x; if(s.y < minY) minY = s.y;
                if(s.x+s.width > maxX) maxX = s.x+s.width; if(s.y+s.height > maxY) maxY = s.y+s.height;
            });
            const cbbox = { x: minX, y: minY, width: maxX - minX, height: maxY - minY, type: 'virtual' };
            this.drawBoundingBox(cbbox, true); 
        }

        this.drawSmartGuides();
    }

    drawBoundingBox(shape, isMulti = false, isGroup = false) {
        const bbox = document.createElement('div');
        bbox.className = 'bbox' + (isMulti ? ' multi' : '') + (isGroup ? ' group-bbox' : '');
        bbox.style.left = shape.x + 'px';
        bbox.style.top = shape.y + 'px';
        bbox.style.width = shape.width + 'px';
        bbox.style.height = shape.height + 'px';
        
        if (isGroup || shape.type === 'frame') {
            const label = document.createElement('div');
            label.className = 'frame-label';
            label.textContent = shape.name || (shape.type === 'frame' ? 'Фрейм' : 'Група');
            bbox.appendChild(label);
        }

        if (!isMulti && shape.type !== 'virtual' && shape.type !== 'group' && shape.type !== 'path' && !this.engine.isDrawing) {
            const handles = ['tl', 'tr', 'bl', 'br', 't', 'b', 'l', 'r'];
            handles.forEach(h => {
                const handle = document.createElement('div');
                handle.className = 'handle ' + h;
                handle.dataset.dir = h;
                bbox.appendChild(handle);
            });
        }
        this.ui.appendChild(bbox);
    }

    drawPathEditor(shape) {
        if (!shape.points || !shape.points.length) return;
        const isActiveDraft = this.engine.isDrawingPen && this.engine.tempShape && this.engine.tempShape.id === shape.id;
        const latestIndex = shape.points.length - 1;
        shape.points.forEach((point, index) => {
            if (point.handleIn) {
                this.drawHandleLink(point, point.handleIn);
                this.drawPathHandle(shape.id, index, 'in', point.handleIn.x, point.handleIn.y);
            }
            if (point.handleOut) {
                this.drawHandleLink(point, point.handleOut);
                this.drawPathHandle(shape.id, index, 'out', point.handleOut.x, point.handleOut.y);
            }
            this.drawPathPoint(shape.id, index, point.x, point.y, isActiveDraft && index === latestIndex);
        });
    }

    drawPathPoint(shapeId, pointIndex, x, y, isLatest = false) {
        const el = document.createElement('div');
        el.className = 'path-point';
        if (isLatest) el.classList.add('latest');
        el.dataset.shapeId = shapeId;
        el.dataset.pointIndex = pointIndex;
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        this.ui.appendChild(el);
    }

    drawPathHandle(shapeId, pointIndex, handleType, x, y) {
        const el = document.createElement('div');
        el.className = 'path-handle';
        el.dataset.shapeId = shapeId;
        el.dataset.pointIndex = pointIndex;
        el.dataset.handleType = handleType;
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        this.ui.appendChild(el);
    }

    drawHandleLink(point, handle) {
        const line = document.createElement('div');
        line.className = 'path-handle-link';
        const dx = handle.x - point.x;
        const dy = handle.y - point.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        line.style.left = `${point.x}px`;
        line.style.top = `${point.y}px`;
        line.style.width = `${len}px`;
        line.style.transform = `rotate(${angle}deg)`;
        this.ui.appendChild(line);
    }

    drawSmartGuides() {
        this.ui.querySelectorAll('.smart-guide').forEach(n => n.remove());
        this.smartGuides.forEach(g => {
            const guide = document.createElement('div');
            guide.className = 'smart-guide ' + g.type;
            const dist = Math.abs(g.end - g.start);
            
            if (g.type === 'v') {
                guide.style.left = g.pos + 'px';
                guide.style.top = Math.min(g.start, g.end) + 'px';
                guide.style.height = dist + 'px';
                
                if (dist > 10) {
                    const label = document.createElement('div');
                    label.className = 'smart-guide-label';
                    label.textContent = Math.round(dist);
                    guide.appendChild(label);
                }
            } else {
                guide.style.top = g.pos + 'px';
                guide.style.left = Math.min(g.start, g.end) + 'px';
                guide.style.width = dist + 'px';
                
                if (dist > 10) {
                    const label = document.createElement('div');
                    label.className = 'smart-guide-label';
                    label.textContent = Math.round(dist);
                    guide.appendChild(label);
                }
            }
            this.ui.appendChild(guide);
        });
    }
}
