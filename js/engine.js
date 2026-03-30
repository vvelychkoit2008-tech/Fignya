class FihnyaEngine {
    constructor(svgContainer, uiContainer, wrapper) {
        this.svg = svgContainer;
        this.ui = uiContainer;
        this.wrapper = wrapper;
        this.pixelGrid = document.getElementById('pixel-grid');
        this.rulerTop = document.getElementById('ruler-top');
        this.rulerLeft = document.getElementById('ruler-left');
        
        this.transform = { x: 0, y: 0, scale: 1 };
        this.targetTransform = { x: 0, y: 0, scale: 1 };
        this.isAnimatingZoom = false;

        this.shapes = []; 
        this.selectedIds = [];
        
        this.activeTool = 'select'; 
        this.mode = 'design'; 
        
        this.isDragging = false;
        this.isPanning = false;
        this.isResizing = false;
        this.isDrawing = false;
        this.isRubberbanding = false;
        this.lastMouse = { x: 0, y: 0 };
        this.dragStart = { x: 0, y: 0 };
        this.activeHandle = null;
        this.tempShape = null;
        
        this.prototypeLinks = []; 
        this.history = [];
        this.historyIndex = -1;
        this.isRestoringHistory = false;
        this.clipboard = null;
        this.smartGuides = []; // {type, pos, start, end}

        this.callbacks = {
            onSelectionChange: () => {},
            onSceneChange: () => {},
            onContextMenu: () => {},
            onDoubleClickText: () => {}
        };
        
        this.initEvents();
        this.updateTransform(true); // instant first render
        setTimeout(() => this.saveState(), 100);
        window.addEventListener('resize', () => this.drawRulers());
    }
    
    generateId() { return Math.random().toString(36).substr(2, 9); }

    saveState() {
        if (this.isRestoringHistory) return;
        const state = this.exportJSON();
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }
        this.history.push(state);
        this.historyIndex++;
        if (this.history.length > 50) {
            this.history.shift();
            this.historyIndex--;
        }
    }

    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.isRestoringHistory = true;
            this.loadJSON(this.history[this.historyIndex]);
            this.isRestoringHistory = false;
        }
    }

    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.isRestoringHistory = true;
            this.loadJSON(this.history[this.historyIndex]);
            this.isRestoringHistory = false;
        }
    }

    copy() {
        if (this.selectedIds.length === 0) return;
        this.clipboard = this.selectedIds.map(id => {
            const shape = this.getShapeById(id);
            const {node, ...rest} = shape;
            return JSON.parse(JSON.stringify(rest));
        });
    }

    paste(px=50, py=50) {
        if (!this.clipboard || this.clipboard.length === 0) return;
        const newIds = [];
        this.clipboard.forEach(clipShape => {
            const newShape = { ...clipShape };
            newShape.id = this.generateId(); 
            newShape.x += px; 
            newShape.y += py;
            if (newShape.name) newShape.name += ' (Копія)';
            this.shapes.push(newShape);
            this.renderShape(newShape);
            newIds.push(newShape.id);
        });
        
        // Зсуваємо буфер обміну для майбутніх вставок, щоб вони йшли сходинками
        this.clipboard.forEach(s => { s.x += 20; s.y += 20; });
        this.selectedIds = newIds;
        this.fireSelectionChange();
        this.updateUI();
        this.saveState();
        this.callbacks.onSceneChange();
    }

    duplicateSelected() {
        this.copy();
        this.paste();
    }

    deleteSelected() {
        if (this.selectedIds.length > 0) {
            this.selectedIds.forEach(id => this.deleteShapeObj(id)); 
            this.selectedIds = [];
            this.updateUI();
            this.fireSelectionChange();
            this.callbacks.onSceneChange();
            this.saveState();
        }
    }

    deleteShapeObj(id) {
        const idx = this.shapes.findIndex(s => s.id === id);
        if (idx !== -1) {
            const sh = this.shapes[idx];
            if (sh.type === 'group') {
                const children = this.shapes.filter(s => s.groupId === id);
                children.forEach(c => this.deleteShapeObj(c.id));
            }
            if (sh.node) sh.node.remove();
            this.shapes.splice(idx, 1);
            this.prototypeLinks = this.prototypeLinks.filter(l => l.sourceId !== id && l.targetId !== id);
        }
    }

    reorderShape(sourceId, targetId, position = 'before') {
        if (sourceId === targetId) return;
        
        let sourceIdx = this.shapes.findIndex(s => s.id === sourceId);
        let targetIdx = this.shapes.findIndex(s => s.id === targetId);
        if (sourceIdx === -1) return;
        
        const sourceShape = this.shapes[sourceIdx];
        
        // Prevent dropping parent inside its own children
        if (position === 'inside') {
            let current = this.shapes[targetIdx];
            while (current && current.groupId) {
                if (current.groupId === sourceId) return;
                current = this.getShapeById(current.groupId);
            }
        }
        
        // Temporarily extract source and all its children
        const toMove = [sourceShape];
        if (sourceShape.type === 'group' || sourceShape.type === 'frame') {
            const extractChildren = (parentId) => {
                const children = this.shapes.filter(s => s.groupId === parentId);
                children.forEach(c => {
                    if (!toMove.includes(c)) toMove.push(c);
                    if (c.type === 'group' || c.type === 'frame') extractChildren(c.id);
                });
            };
            extractChildren(sourceShape.id);
        }
        
        const moveIds = toMove.map(s => s.id);
        // Remove them from array
        this.shapes = this.shapes.filter(s => !moveIds.includes(s.id));
        
        // Find target again since array changed
        if (targetId) {
            targetIdx = this.shapes.findIndex(s => s.id === targetId);
            const tShape = this.shapes[targetIdx];
            
            if (position === 'inside') {
                sourceShape.groupId = tShape.id;
                // Insert at the end of the children of target
                const childrenCount = this.shapes.filter(s => s.groupId === tShape.id).length;
                this.shapes.splice(targetIdx + 1 + childrenCount, 0, ...toMove);
            } else {
                sourceShape.groupId = tShape.groupId || null;
                const insertIdx = position === 'before' ? targetIdx : targetIdx + 1;
                this.shapes.splice(insertIdx, 0, ...toMove);
            }
        } else {
            // Drop to root
            sourceShape.groupId = null;
            this.shapes.push(...toMove);
        }

        // Reorder DOM elements to match this.shapes array
        this.shapes.forEach(sh => {
            if (sh.node) this.svg.appendChild(sh.node); // append moves to end
        });
        
        if (sourceShape.groupId) {
            const parent = this.getShapeById(sourceShape.groupId);
            if (parent && parent.isAutoLayout) this.applyAutoLayout(parent);
        } else {
            this.triggerAutoLayoutPass(sourceShape);
        }

        this.renderPrototypeLinks();
        this.updateUI();
        this.callbacks.onSceneChange();
        this.saveState();
    }

    animateZoomLoop() {
        if(!this.isAnimatingZoom) return;
        
        const dx = this.targetTransform.x - this.transform.x;
        const dy = this.targetTransform.y - this.transform.y;
        const ds = this.targetTransform.scale - this.transform.scale;
        
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(ds) < 0.001) {
            this.transform.x = this.targetTransform.x;
            this.transform.y = this.targetTransform.y;
            this.transform.scale = this.targetTransform.scale;
            this.isAnimatingZoom = false;
            this.updateTransform(true);
            return;
        }

        this.transform.x += dx * 0.25;
        this.transform.y += dy * 0.25;
        this.transform.scale += ds * 0.25;
        
        this.updateTransform(true);
        requestAnimationFrame(() => this.animateZoomLoop());
    }

    initEvents() {
        const container = this.svg.parentElement.parentElement;
        
        container.addEventListener('wheel', (e) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const zoomFactor = 0.008; 
                let newScale = this.targetTransform.scale * (1 - Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY)*zoomFactor, 0.5));
                newScale = Math.min(Math.max(0.05, newScale), 50); 
                
                const rect = container.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                
                const ratio = 1 - newScale / this.targetTransform.scale;
                this.targetTransform.x += (mouseX - this.targetTransform.x) * ratio;
                this.targetTransform.y += (mouseY - this.targetTransform.y) * ratio;
                this.targetTransform.scale = newScale;

                if (!this.isAnimatingZoom) {
                    this.isAnimatingZoom = true;
                    requestAnimationFrame(() => this.animateZoomLoop());
                }
            } else {
                this.targetTransform.x -= e.deltaX;
                this.targetTransform.y -= e.deltaY;
                if (!this.isAnimatingZoom) {
                    this.isAnimatingZoom = true;
                    requestAnimationFrame(() => this.animateZoomLoop());
                }
            }
        }, { passive: false });

        container.addEventListener('pointerdown', this.onPointerDown.bind(this));
        window.addEventListener('pointermove', this.onPointerMove.bind(this));
        window.addEventListener('pointerup', this.onPointerUp.bind(this));
        
        container.addEventListener('dblclick', (e) => {
            const pt = this.getCanvasPoint(e);
            const shape = this.getShapeFromNode(e.target);
            if (shape && shape.type === 'text') {
                this.callbacks.onDoubleClickText(shape, e);
            }
        });

        container.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.callbacks.onContextMenu(e);
        });

        document.addEventListener('keydown', (e) => {
            if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
            if (document.activeElement.isContentEditable) return;

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); }
            if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); this.redo(); }
            if ((e.ctrlKey || e.metaKey) && e.key === 'c') { e.preventDefault(); this.copy(); }
            if ((e.ctrlKey || e.metaKey) && e.key === 'v') { e.preventDefault(); this.paste(); }
            if ((e.ctrlKey || e.metaKey) && e.key === 'd') { e.preventDefault(); this.duplicateSelected(); }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
                e.preventDefault();
                this.selectedIds = this.shapes.filter(s => !s.isHidden && !s.isLocked && !s.groupId && s.type !== 'group').map(s => s.id);
                this.updateUI();
                this.fireSelectionChange();
            }
            if (e.altKey && e.key === 'g' && !e.shiftKey) { e.preventDefault(); this.groupSelected(); }
            if (e.altKey && e.key === 'g' && e.shiftKey) { e.preventDefault(); this.ungroupSelected(); }
            if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.deleteSelected(); }

            if (e.key === 'Escape' || e.key === 'Enter') {
                if (this.isDrawingPen) {
                    this.isDrawingPen = false;
                    this.selectedIds = [this.tempShape.id];
                    this.activeTool = 'select';
                    this.tempShape = null;
                    this.updateUI();
                    this.callbacks.onSceneChange();
                    this.saveState();
                }
            }

            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && this.selectedIds.length > 0) {
                e.preventDefault();
                const step = e.shiftKey ? 10 : 1;
                let dx = 0, dy = 0;
                if (e.key === 'ArrowUp') dy = -step;
                if (e.key === 'ArrowDown') dy = step;
                if (e.key === 'ArrowLeft') dx = -step;
                if (e.key === 'ArrowRight') dx = step;

                // Move items handling locks
                let moved = false;
                this.selectedIds.forEach(id => {
                    const sh = this.getShapeById(id);
                    if (sh.isLocked || sh.isHidden) return;
                    if (sh.type === 'group' || sh.type === 'frame') {
                        const children = this.shapes.filter(c => c.groupId === id);
                        children.forEach(c => { if(!c.isLocked){c.x+=dx; c.y+=dy; this.updateShapeNode(c); moved=true; } });
                    }
                    sh.x += dx; sh.y += dy;
                    this.updateShapeNode(sh);
                    this.triggerAutoLayoutPass(sh);
                    moved = true;
                });
                if(moved) {
                    this.updateUI();
                    this.saveState();
                    this.callbacks.onSceneChange();
                }
            }
        });
    }

    updateTransform(forceDOMUpdate = false) {
        if (forceDOMUpdate) {
            this.wrapper.style.transform = `translate(${this.transform.x}px, ${this.transform.y}px) scale(${this.transform.scale})`;
            if (this.transform.scale > 8) this.pixelGrid.classList.remove('display-none');
            else this.pixelGrid.classList.add('display-none');
            this.drawRulers();
            this.updateUI();
        }
    }
    
    drawRulers() {
        if (!this.rulerTop || !this.rulerLeft) return;
        const wt = this.rulerTop.width = this.rulerTop.parentElement.clientWidth;
        const ht = this.rulerTop.height = 16;
        const wl = this.rulerLeft.width = 16;
        const hl = this.rulerLeft.height = this.rulerLeft.parentElement.clientHeight;
        
        const ctxTop = this.rulerTop.getContext('2d');
        const ctxLeft = this.rulerLeft.getContext('2d');
        
        ctxTop.clearRect(0, 0, wt, ht); ctxTop.fillStyle = '#98989D'; ctxTop.font = '9px Inter';
        ctxLeft.clearRect(0, 0, wl, hl); ctxLeft.fillStyle = '#98989D'; ctxLeft.font = '9px Inter';

        // Adaptive Step calculation
        const baseVisualDist = 100 * this.transform.scale;
        let logicalStep = 100;
        if (baseVisualDist < 30) logicalStep = 500;
        if (baseVisualDist < 10) logicalStep = 1000;
        if (baseVisualDist < 2) logicalStep = 5000;
        if (baseVisualDist > 500) logicalStep = 10;
        if (baseVisualDist > 2000) logicalStep = 1;

        const visualStep = logicalStep * this.transform.scale;
        
        // Top Ruler
        const offsetX = this.transform.x % visualStep;
        const startValX = -Math.floor(this.transform.x / visualStep) * logicalStep;
        for(let i = 0; i < wt + visualStep; i += visualStep) {
            const x = i + offsetX;
            const val = startValX + (i / visualStep) * logicalStep;
            ctxTop.fillRect(x, 10, 1, 6);
            if (x > -10 && x < wt) ctxTop.fillText(val, x + 2, 9);
        }
        
        // Left Ruler
        const offsetY = this.transform.y % visualStep;
        const startValY = -Math.floor(this.transform.y / visualStep) * logicalStep;
        ctxLeft.save();
        ctxLeft.translate(0, hl);
        ctxLeft.rotate(-Math.PI/2);
        for(let i = 0; i < hl + visualStep; i += visualStep) {
            const y = i - offsetY; 
            const val = startValY + Math.floor((hl - i) / visualStep) * logicalStep + logicalStep; 
            ctxLeft.fillRect(y, -16, 1, 6);
            if (y > -10 && y < hl) ctxLeft.fillText(val, y + 2, -1);
        }
        ctxLeft.restore();
    }

    getCanvasPoint(e) {
        const rect = this.wrapper.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / this.transform.scale,
            y: (e.clientY - rect.top) / this.transform.scale
        };
    }

    onPointerDown(e) {
        if (e.button === 1 || (e.button === 0 && e.code === 'Space')) {
            this.isPanning = true;
            this.lastMouse = { x: e.clientX, y: e.clientY };
            document.body.style.cursor = 'grabbing';
            return;
        }

        if (e.button === 2) return; 
        
        const pt = this.getCanvasPoint(e);
        this.lastMouse = { x: e.clientX, y: e.clientY };
        this.dragStart = { ...pt };

        if (e.target.classList.contains('handle')) {
            this.isResizing = true;
            this.activeHandle = e.target.dataset.dir;
            return;
        }

        if (this.mode === 'prototype') {
            const shape = this.getShapeFromNode(e.target);
            if (shape && !shape.isLocked && !shape.isHidden) {
                this.isDrawingLink = true;
                this.tempShape = shape;
                this.tempLinkNode = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                this.tempLinkNode.setAttribute('class', 'arrow-line');
                this.ui.appendChild(this.tempLinkNode);
            }
            return;
        }

        if (this.activeTool === 'select' || this.mode === 'inspect') {
            const shape = this.getShapeFromNode(e.target);
            if (shape && !shape.isLocked && !shape.isHidden) {
                this.isDragging = true;
                let targetId = shape.id;
                
                if (!e.ctrlKey && !e.metaKey && !this.selectedIds.includes(shape.id)) {
                    let current = shape;
                    while (current.groupId) {
                        const parent = this.getShapeById(current.groupId);
                        if (!parent) break;
                        current = parent;
                    }
                    targetId = current.id;
                }
                
                if (e.shiftKey) {
                    if (this.selectedIds.includes(targetId)) this.selectedIds = this.selectedIds.filter(id => id !== targetId);
                    else this.selectedIds.push(targetId);
                } else if (!this.selectedIds.includes(targetId)) {
                    this.selectedIds = [targetId];
                }
            } else {
                if (!e.shiftKey) this.selectedIds = [];
                if (this.mode !== 'inspect') {
                    this.isRubberbanding = true;
                    this.rubberbandBox = document.createElement('div');
                    this.rubberbandBox.className = 'selection-box';
                    this.ui.appendChild(this.rubberbandBox);
                }
            }
            this.fireSelectionChange();
            this.updateUI();
            } else if (this.activeTool === 'pen') {
                if (!this.isDrawingPen) {
                    this.isDrawingPen = true;
                    this.tempShape = this.createShapeParams('path', pt.x, pt.y);
                    this.shapes.push(this.tempShape);
                    this.renderShape(this.tempShape);
                } else {
                    this.tempShape.d += ` L ${pt.x} ${pt.y}`;
                    this.updateShapeNode(this.tempShape);
                }      
            } else {
            if (this.activeTool !== 'image') {
                this.isDrawing = true;
                this.tempShape = this.createShapeParams(this.activeTool, pt.x, pt.y);
                this.shapes.push(this.tempShape);
                this.renderShape(this.tempShape);
            }
        }
    }

    onPointerMove(e) {
        if (this.isPanning) {
            const dx = e.clientX - this.lastMouse.x;
            const dy = e.clientY - this.lastMouse.y;
            this.targetTransform.x += dx;
            this.targetTransform.y += dy;
            this.transform.x = this.targetTransform.x;
            this.transform.y = this.targetTransform.y;
            this.updateTransform(true);
            this.lastMouse = { x: e.clientX, y: e.clientY };
            return;
        }

        const pt = this.getCanvasPoint(e);
        
        if (this.isRubberbanding) {
            const w = pt.x - this.dragStart.x;
            const h = pt.y - this.dragStart.y;
            const rx = w < 0 ? pt.x : this.dragStart.x;
            const ry = h < 0 ? pt.y : this.dragStart.y;
            this.rubberbandBox.style.left = rx + 'px';
            this.rubberbandBox.style.top = ry + 'px';
            this.rubberbandBox.style.width = Math.abs(w) + 'px';
            this.rubberbandBox.style.height = Math.abs(h) + 'px';
        } else if (this.isDrawingPen && this.tempShape) {
            this.tempShape.node.setAttribute('d', this.tempShape.d + ` L ${pt.x} ${pt.y}`);
        } else if (this.isDrawingLink && this.tempShape) {
            const sx = this.tempShape.x + this.tempShape.width/2;
            const sy = this.tempShape.y + this.tempShape.height/2;
            const path = `M ${sx} ${sy} Q ${(sx+pt.x)/2} ${(sy+pt.y)/2-50} ${pt.x} ${pt.y}`;
            this.tempLinkNode.setAttribute('d', path);
        } else if (this.isDrawing && this.tempShape) {
            const w = pt.x - this.dragStart.x;
            const h = pt.y - this.dragStart.y;
            this.tempShape.x = w < 0 ? pt.x : this.dragStart.x;
            this.tempShape.y = h < 0 ? pt.y : this.dragStart.y;
            this.tempShape.width = Math.abs(w);
            this.tempShape.height = Math.abs(h);
            this.updateShapeNode(this.tempShape);
        } else if (this.isDragging && this.selectedIds.length > 0 && this.mode !== 'inspect') {
            const dx = pt.x - this.dragStart.x;
            const dy = pt.y - this.dragStart.y;
            this.dragStart = pt;
            
            let snapDx = dx; let snapDy = dy;
            this.smartGuides = [];
            
            if (this.selectedIds.length === 1 && !e.altKey && !this.isResizing) {
                const me = this.getShapeById(this.selectedIds[0]);
                if (me.type !== 'group' && !me.groupId) { // no snap for children of frames
                    const threshold = 5 / this.transform.scale;
                    let bX = null, bY = null, mX = Infinity, mY = Infinity;
                    const mcX = me.x + dx + me.width/2; const mcY = me.y + dy + me.height/2;

                    this.shapes.forEach(t => {
                        if(t.id === me.id || t.type === 'group' || t.isHidden || t.groupId) return;
                        const tcX = t.x + t.width/2; const tcY = t.y + t.height/2;
                        
                        if(Math.abs(mcX - tcX) < threshold && Math.abs(mcX - tcX) < mX) {
                            mX = Math.abs(mcX - tcX); bX = tcX - me.width/2 - me.x;
                            this.smartGuides = this.smartGuides.filter(g => g.type!=='v'); // only 1 line
                            this.smartGuides.push({type:'v', pos:tcX, start:Math.min(me.y, t.y), end:Math.max(me.y+me.height, t.y+t.height)});
                        }
                        if(Math.abs(mcY - tcY) < threshold && Math.abs(mcY - tcY) < mY) {
                            mY = Math.abs(mcY - tcY); bY = tcY - me.height/2 - me.y;
                            this.smartGuides = this.smartGuides.filter(g => g.type!=='h');
                            this.smartGuides.push({type:'h', pos:tcY, start:Math.min(me.x, t.x), end:Math.max(me.x+me.width, t.x+t.width)});
                        }
                    });
                    if(bX !== null) snapDx = bX; if(bY !== null) snapDy = bY;
                }
            }
            
            this.selectedIds.forEach(id => {
                const shape = this.getShapeById(id);
                if (shape.type === 'group' || shape.type === 'frame') {
                    const children = this.shapes.filter(c => c.groupId === id);
                    children.forEach(c => { c.x+=snapDx; c.y+=snapDy; this.updateShapeNode(c); });
                }
                shape.x += snapDx;
                shape.y += snapDy;
                this.updateShapeNode(shape);
                
                // If the item itself is part of an auto layout!
                if (shape.groupId) {
                    const parent = this.getShapeById(shape.groupId);
                    if (parent && parent.isAutoLayout) this.applyAutoLayout(parent);
                } else {
                    this.triggerAutoLayoutPass(shape);
                }
            });
            this.updateUI();
        } else if (this.isResizing && this.selectedIds.length === 1) {
            const shape = this.getShapeById(this.selectedIds[0]);
            const dx = pt.x - this.dragStart.x;
            const dy = pt.y - this.dragStart.y;
            this.dragStart = pt;

            if (this.activeHandle.includes('r')) shape.width += dx;
            if (this.activeHandle.includes('l')) { shape.width -= dx; shape.x += dx; }
            if (this.activeHandle.includes('b')) shape.height += dy;
            if (this.activeHandle.includes('t')) { shape.height -= dy; shape.y += dy; }
            
            shape.width = Math.max(1, shape.width);
            shape.height = Math.max(1, shape.height);
            
            if (shape.type !== 'group') {
                this.updateShapeNode(shape);
                if (shape.isAutoLayout) this.applyAutoLayout(shape);
            }
            this.updateUI();
            this.fireSelectionChange(); 
        }
    }

    onPointerUp(e) {
        if (this.isPanning) { this.isPanning = false; document.body.style.cursor = 'default'; }

        if (this.isRubberbanding) {
            this.isRubberbanding = false;
            const pt = this.getCanvasPoint(e);
            let w = pt.x - this.dragStart.x;
            let h = pt.y - this.dragStart.y;
            const rx = w < 0 ? pt.x : this.dragStart.x;
            const ry = h < 0 ? pt.y : this.dragStart.y;
            w = Math.abs(w); h = Math.abs(h);
            
            const newSelection = [];
            this.shapes.forEach(sh => {
                if (sh.isHidden || sh.isLocked) return;
                if (sh.x < rx+w && sh.x+sh.width > rx && sh.y < ry+h && sh.y+sh.height > ry && !sh.groupId && sh.type !== 'group') {
                    newSelection.push(sh.id);
                } else if (sh.type === 'group') {
                    if (sh.x < rx+w && sh.x+sh.width > rx && sh.y < ry+h && sh.y+sh.height > ry) newSelection.push(sh.id);
                }
            });
            if (e.shiftKey) this.selectedIds = [...new Set([...this.selectedIds, ...newSelection])];
            else this.selectedIds = newSelection;
            
            if (this.rubberbandBox) this.rubberbandBox.remove();
            this.fireSelectionChange();
            this.updateUI();
        } else if (this.isDrawingLink) {
            const targetShape = this.getShapeFromNode(e.target);
            if (targetShape && targetShape.id !== this.tempShape.id) {
                this.prototypeLinks.push({ id: this.generateId(), sourceId: this.tempShape.id, targetId: targetShape.id });
            }
            if (this.tempLinkNode) this.tempLinkNode.remove();
            this.isDrawingLink = false;
            this.tempShape = null;
            this.renderPrototypeLinks();
            this.callbacks.onSceneChange();
            this.saveState();
        } else if (this.isDrawing) {
            this.isDrawing = false;
            if (this.tempShape.width < 5 && this.tempShape.height < 5 && this.tempShape.type !== 'text') {
                this.deleteShapeObj(this.tempShape.id);
            } else {
                // Авто-вкладення в Фрейм або Групу
                const tCx = this.tempShape.x + this.tempShape.width/2;
                const tCy = this.tempShape.y + this.tempShape.height/2;
                const container = [...this.shapes].reverse().find(s => 
                    (s.type === 'frame' || s.type === 'group') && 
                    s.id !== this.tempShape.id && !s.isHidden && !s.isLocked &&
                    tCx >= s.x && tCx <= s.x + s.width && tCy >= s.y && tCy <= s.y + s.height
                );
                if (container) this.tempShape.groupId = container.id;

                this.selectedIds = [this.tempShape.id];
                this.activeTool = 'select';
                this.fireSelectionChange();
                this.updateUI();
                
                if (this.tempShape.type === 'text') {
                    // Start editing text immediately
                    this.callbacks.onDoubleClickText(this.tempShape, e);
                }
                this.callbacks.onSceneChange();
                this.saveState();
            }
            this.tempShape = null;
        } else if (this.isDragging || this.isResizing) {
            this.callbacks.onSceneChange();
            this.saveState();
        }

        this.isDragging = false;
        this.isResizing = false;
        this.activeHandle = null;
        this.smartGuides = [];
        this.updateUI();
    }

    createShapeParams(type, x, y) {
        const id = this.generateId();
        const base = { id, type, x, y, width: 0, height: 0, fill: '#D9D9D9', stroke: 'none', strokeWidth: 1, name: type + ' ' + Math.floor(Math.random()*100), isHidden: false, isLocked: false };
        if (type === 'frame') { base.fill = '#FFFFFF'; base.name = 'Frame'; base.isAutoLayout = false; base.layoutDirection = 'vertical'; base.gap = 10; base.padding = 10; base.cornerRadius = 0; } 
        else if (type === 'rectangle') { base.cornerRadius = 0; }
        else if (type === 'text') { base.fill = '#FFFFFF'; base.text = 'Новий текст'; base.width = 100; base.height = 30; base.fontSize = 16; base.fontWeight = 400; }
        else if (type === 'image') { base.name = 'Image'; base.width = 100; base.height = 100; }
        else if (type === 'group') { base.name = 'Group'; base.fill = 'none'; }
        else if (type === 'path') { base.name = 'Path'; base.fill = 'none'; base.stroke = '#0A84FF'; base.strokeWidth = 2; base.d = `M ${x} ${y}`; }
        return base;
    }

    renderShape(shape) {
        if (shape.type === 'group') return; 
        
        let node;
        switch(shape.type) {
            case 'rectangle':
            case 'frame': node = document.createElementNS('http://www.w3.org/2000/svg', 'rect'); break;
            case 'ellipse': node = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse'); break;
            case 'text':
                node = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                node.textContent = shape.text;
                node.setAttribute('font-family', 'Inter, sans-serif');
                node.setAttribute('dominant-baseline', 'text-before-edge');
                break;
            case 'path':
                node = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                break;
            case 'image':
                node = document.createElementNS('http://www.w3.org/2000/svg', 'image');
                node.setAttribute('href', shape.src || '');
                node.setAttribute('preserveAspectRatio', 'none');
                break;
        }
        
        node.setAttribute('data-id', shape.id);
        node.classList.add('shape');
        if (shape.type === 'frame') node.classList.add('frame');
        
        shape.node = node;
        this.svg.appendChild(node);
        this.updateShapeNode(shape);
    }

    updateShapeNode(shape) {
        if (!shape.node) return;
        
        if (shape.isHidden) shape.node.style.display = 'none';
        else shape.node.style.display = '';

        if (shape.isLocked) shape.node.style.pointerEvents = 'none';
        else shape.node.style.pointerEvents = '';

        if (shape.type === 'rectangle' || shape.type === 'frame' || shape.type === 'image') {
            shape.node.setAttribute('x', shape.x); shape.node.setAttribute('y', shape.y);
            shape.node.setAttribute('width', shape.width); shape.node.setAttribute('height', shape.height);
            if (shape.cornerRadius !== undefined) { shape.node.setAttribute('rx', shape.cornerRadius); shape.node.setAttribute('ry', shape.cornerRadius); }
        } else if (shape.type === 'ellipse') {
            shape.node.setAttribute('cx', shape.x + shape.width/2); shape.node.setAttribute('cy', shape.y + shape.height/2);
            shape.node.setAttribute('rx', shape.width/2); shape.node.setAttribute('ry', shape.height/2);
        } else if (shape.type === 'text') {
            shape.node.setAttribute('x', shape.x); shape.node.setAttribute('y', shape.y);
            shape.node.textContent = shape.text;
            shape.node.setAttribute('font-size', (shape.fontSize || 16) + 'px');
            shape.node.setAttribute('font-weight', shape.fontWeight || 400);
        } else if (shape.type === 'path') {
            shape.node.setAttribute('d', shape.d);
        }

        if (shape.type !== 'image') {
            shape.node.setAttribute('fill', shape.fill);
            shape.node.setAttribute('stroke', shape.stroke);
            shape.node.setAttribute('stroke-width', shape.strokeWidth);
        }
    }

    updateUI() {
        this.ui.querySelectorAll('.bbox').forEach(n => n.remove());
        
        // Remove hidden from selection
        this.selectedIds = this.selectedIds.filter(id => {
            const sh = this.getShapeById(id);
            return sh && !sh.isHidden;
        });

        if (this.selectedIds.length === 1 && (this.activeTool === 'select' || this.mode === 'inspect')) {
            const sh = this.getShapeById(this.selectedIds[0]);
            this.drawBoundingBox(sh, false, sh.type === 'group' || sh.isAutoLayout);
        } else if (this.selectedIds.length > 1 && (this.activeTool === 'select' || this.mode === 'inspect')) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            this.selectedIds.forEach(id => {
                const s = this.getShapeById(id);
                if(s.x < minX) minX = s.x; if(s.y < minY) minY = s.y;
                if(s.x+s.width > maxX) maxX = s.x+s.width; if(s.y+s.height > maxY) maxY = s.y+s.height;
            });
            const cbbox = { x: minX, y: minY, width: maxX - minX, height: maxY - minY, type: 'virtual' };
            this.drawBoundingBox(cbbox, true); 
        }

        // Draw Smart Guides
        this.smartGuides.forEach(g => {
            const line = document.createElement('div');
            line.className = 'bbox guide-line'; // using CSS
            line.style.borderColor = '#E33539'; line.style.borderStyle = 'dashed'; line.style.borderWidth = '1px';
            if(g.type === 'v') {
                line.style.left = g.pos + 'px'; line.style.top = g.start + 'px';
                line.style.width = '0px'; line.style.height = (g.end - g.start) + 'px';
            } else {
                line.style.left = g.start + 'px'; line.style.top = g.pos + 'px';
                line.style.width = (g.end - g.start) + 'px'; line.style.height = '0px';
            }
            this.ui.appendChild(line);
        });
    }

    drawBoundingBox(shape, isMultiple=false, isSpecial=false) {
        if (!shape) return;
        const bbox = document.createElement('div');
        bbox.className = 'bbox';
        if (isSpecial) bbox.classList.add('auto-layout');
        bbox.style.left = `${shape.x}px`; bbox.style.top = `${shape.y}px`;
        bbox.style.width = `${shape.width}px`; bbox.style.height = `${shape.height}px`;

        if (!isMultiple && shape.type !== 'group' && shape.type !== 'virtual' && !shape.isLocked) {
            const dirs = ['tl', 'tr', 'bl', 'br'];
            dirs.forEach(d => {
                const h = document.createElement('div');
                h.className = `handle ${d}`; h.dataset.dir = d;
                bbox.appendChild(h);
            });
        } else if (isMultiple || shape.type === 'group') {
            bbox.style.borderStyle = 'dashed'; 
        }
        this.ui.appendChild(bbox);
    }

    renderPrototypeLinks() {
        this.ui.querySelectorAll('.proto-link-node').forEach(n => n.remove());
        if (this.mode !== 'prototype') return;

        this.prototypeLinks.forEach(link => {
            const sShape = this.getShapeById(link.sourceId);
            const tShape = this.getShapeById(link.targetId);
            if (!sShape || !tShape) return;
            const sx = sShape.x + sShape.width/2; const sy = sShape.y + sShape.height/2;
            const tx = tShape.x + tShape.width/2; const ty = tShape.y + tShape.height/2;

            const pathNode = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            pathNode.setAttribute('class', 'arrow-line proto-link-node');
            pathNode.setAttribute('d', `M ${sx} ${sy} Q ${(sx+tx)/2} ${(sy+ty)/2-50} ${tx} ${ty}`);
            
            const id = 'arrowhead';
            if (!document.getElementById(id)) {
                const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
                marker.id = id;
                marker.setAttribute('markerWidth', '10'); marker.setAttribute('markerHeight', '7');
                marker.setAttribute('refX', '10'); marker.setAttribute('refY', '3.5');
                marker.setAttribute('orient', 'auto');
                const head = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                head.setAttribute('points', '0 0, 10 3.5, 0 7');
                head.setAttribute('class', 'arrow-head');
                marker.appendChild(head); this.svg.appendChild(marker);
            }
            pathNode.setAttribute('marker-end', `url(#${id})`);
            this.svg.appendChild(pathNode); 
        });
    }

    getShapeFromNode(node) {
        const id = node.getAttribute('data-id');
        return id ? this.shapes.find(s => s.id === id) : null;
    }

    getShapeById(id) { return this.shapes.find(s => s.id === id); }
    fireSelectionChange() { this.callbacks.onSelectionChange(this.selectedIds); }
    setTool(tool) { this.activeTool = tool; if (tool !== 'select') this.selectedIds = []; this.updateUI(); }
    setMode(mode) { this.mode = mode; this.selectedIds = []; this.updateUI(); this.renderPrototypeLinks(); }

    alignSelected(direction) {
        if (this.selectedIds.length < 2) return;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const shapes = this.selectedIds.map(id => this.getShapeById(id)).filter(s => s && !s.isLocked);
        if (shapes.length < 2) return;

        shapes.forEach(s => {
            if(s.x < minX) minX = s.x; if(s.y < minY) minY = s.y;
            if(s.x+s.width > maxX) maxX = s.x+s.width; if(s.y+s.height > maxY) maxY = s.y+s.height;
        });

        const centerX = minX + (maxX - minX) / 2;
        const centerY = minY + (maxY - minY) / 2;

        shapes.forEach(s => {
            let dx = 0, dy = 0;
            if (direction === 'left') dx = minX - s.x;
            else if (direction === 'center') dx = centerX - (s.x + s.width / 2);
            else if (direction === 'right') dx = maxX - (s.x + s.width);
            else if (direction === 'top') dy = minY - s.y;
            else if (direction === 'middle') dy = centerY - (s.y + s.height / 2);
            else if (direction === 'bottom') dy = maxY - (s.y + s.height);

            if (s.type === 'group' || s.type === 'frame') {
                const children = this.shapes.filter(c => c.groupId === s.id);
                children.forEach(c => { c.x += dx; c.y += dy; this.updateShapeNode(c); });
            }
            s.x += dx; s.y += dy;
            this.updateShapeNode(s);
            this.triggerAutoLayoutPass(s);
        });

        this.updateUI();
        this.saveState();
        this.callbacks.onSceneChange();
    }

    updateSelectedProperty(key, value) {
        let changed = false;
        this.selectedIds.forEach(id => {
            const shape = this.getShapeById(id);
            if (shape) {
                if (['x','y','width','height','strokeWidth','gap','padding','fontSize','fontWeight','cornerRadius'].includes(key)) value = parseFloat(value);
                shape[key] = value;
                this.updateShapeNode(shape);
                changed = true;
                if (shape.isAutoLayout) this.applyAutoLayout(shape);
                if (shape.groupId) { const pr = this.getShapeById(shape.groupId); if(pr && pr.isAutoLayout) this.applyAutoLayout(pr); }
            }
        });
        if (changed) {
            this.updateUI();
            this.callbacks.onSceneChange();
            this.saveState();
        }
    }

    exportJSON() { return JSON.stringify({ shapes: this.shapes.map(({node, ...rest}) => rest), links: this.prototypeLinks }); }
    loadJSON(json) {
        const data = JSON.parse(json);
        this.shapes.forEach(s => s.node && s.node.remove());
        this.svg.innerHTML = '';
        this.ui.querySelectorAll('.bbox, .selection-box, .proto-link-node').forEach(n => n.remove());
        this.shapes = []; this.prototypeLinks = data.links || [];
        data.shapes.forEach(s => { this.shapes.push(s); this.renderShape(s); });
        this.selectedIds = []; this.updateUI(); this.renderPrototypeLinks(); this.callbacks.onSceneChange();
    }

    alignSelected(type) {
        if (this.selectedIds.length < 2) return;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        this.selectedIds.forEach(id => {
            const s = this.getShapeById(id);
            if(s.x < minX) minX = s.x; if(s.y < minY) minY = s.y;
            if(s.x+s.width > maxX) maxX = s.x+s.width; if(s.y+s.height > maxY) maxY = s.y+s.height;
        });
        const centerX = minX + (maxX - minX) / 2; const centerY = minY + (maxY - minY) / 2;
        this.selectedIds.forEach(id => {
            const s = this.getShapeById(id);
            if(type === 'left') s.x = minX;
            else if(type === 'right') s.x = maxX - s.width;
            else if(type === 'center') s.x = centerX - s.width / 2;
            else if(type === 'top') s.y = minY;
            else if(type === 'bottom') s.y = maxY - s.height;
            else if(type === 'middle') s.y = centerY - s.height / 2;
            this.updateShapeNode(s);
        });
        this.updateUI(); this.callbacks.onSceneChange(); this.saveState();
    }

    addImageShape(x, y, dataUrl) {
        const imgShape = this.createShapeParams('image', x, y);
        imgShape.width = 200; imgShape.height = 200; imgShape.src = dataUrl;
        this.shapes.push(imgShape); this.renderShape(imgShape); this.saveState(); this.callbacks.onSceneChange();
    }
    
    groupSelected() {
        if (this.selectedIds.length < 2) return;
        const groupId = this.generateId();
        let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
        this.selectedIds.forEach(id => {
            const sh = this.getShapeById(id);
            sh.groupId = groupId;
            if(sh.x < minX) minX=sh.x; if(sh.y < minY) minY=sh.y;
            if(sh.x+sh.width > maxX) maxX=sh.x+sh.width; if(sh.y+sh.height > maxY) maxY=sh.y+sh.height;
        });
        const gShape = this.createShapeParams('group', minX, minY);
        gShape.id = groupId; gShape.width = maxX - minX; gShape.height = maxY - minY;
        this.shapes.push(gShape);
        this.selectedIds = [groupId];
        this.updateUI(); this.callbacks.onSceneChange(); this.saveState();
    }

    ungroupSelected() {
        const newSelection = [];
        this.selectedIds.forEach(id => {
            const sh = this.getShapeById(id);
            if (sh.type === 'group') {
                this.shapes.filter(s => s.groupId === id).forEach(child => {
                    delete child.groupId;
                    newSelection.push(child.id);
                });
                this.shapes = this.shapes.filter(s => s.id !== id);
            } else { newSelection.push(id); }
        });
        this.selectedIds = newSelection;
        this.updateUI(); this.callbacks.onSceneChange(); this.saveState();
    }

    toggleLockSelected() {
        this.selectedIds.forEach(id => {
            const s = this.getShapeById(id);
            if (s) { s.isLocked = !s.isLocked; this.updateShapeNode(s); }
        });
        this.saveState(); this.callbacks.onSceneChange(); this.updateUI();
    }

    toggleHideSelected() {
        this.selectedIds.forEach(id => {
            const s = this.getShapeById(id);
            if (s) { s.isHidden = !s.isHidden; this.updateShapeNode(s); }
        });
        this.saveState(); this.callbacks.onSceneChange(); this.updateUI();
    }
    
    bringForward() { this.reorderSelected('up'); }
    sendBackward() { this.reorderSelected('down'); }
    
    reorderSelected(dir) {
        this.selectedIds.forEach(id => {
            const idx = this.shapes.findIndex(s => s.id === id);
            if (dir === 'up' && idx < this.shapes.length-1) {
                [this.shapes[idx], this.shapes[idx+1]] = [this.shapes[idx+1], this.shapes[idx]];
                if (this.shapes[idx+1].node) this.svg.appendChild(this.shapes[idx+1].node); 
            } else if (dir === 'down' && idx > 0) {
                [this.shapes[idx], this.shapes[idx-1]] = [this.shapes[idx-1], this.shapes[idx]];
                if (this.shapes[idx].node && this.shapes[idx-1].node) this.svg.insertBefore(this.shapes[idx].node, this.shapes[idx-1].node);
            }
        });
        this.saveState(); this.callbacks.onSceneChange();
    }

    triggerAutoLayoutPass(child) {
        const frames = this.shapes.filter(s => s.type === 'frame' && s.isAutoLayout);
        frames.forEach(f => {
            if (child.x >= f.x - 50 && child.y >= f.y - 50 && child.x <= f.x+f.width+50 && child.y <= f.y+f.height+50) {
                this.applyAutoLayout(f);
            }
        });
    }

    applyAutoLayout(frame) {
        if (!frame.isAutoLayout) return;
        const children = this.shapes.filter(s => s.groupId === frame.id && !s.isHidden && s.type !== 'group');
        if (children.length === 0) return;
        
        let cx = frame.x + frame.padding;
        let cy = frame.y + frame.padding;
        let maxW = 0, maxH = 0;

        // Dynamic Sorting for Reordering (Figma style)
        if (frame.layoutDirection === 'vertical') children.sort((a,b) => a.y - b.y);
        else children.sort((a,b) => a.x - b.x);

        children.forEach(c => {
            c.x = cx; c.y = cy;
            if (frame.layoutDirection === 'vertical') {
                cy += c.height + frame.gap;
                if (c.width > maxW) maxW = c.width;
            } else {
                cx += c.width + frame.gap;
                if (c.height > maxH) maxH = c.height;
            }
            this.updateShapeNode(c);
        });
        
        const targetW = frame.layoutDirection === 'vertical' ? maxW + frame.padding*2 : cx - frame.x - frame.gap + frame.padding;
        const targetH = frame.layoutDirection === 'vertical' ? cy - frame.y - frame.gap + frame.padding : maxH + frame.padding*2;
        
        // Only update size implicitly if not hard-constrained, let's just make it hard-constrained for now
        frame.width = Math.max(frame.width, targetW);
        frame.height = Math.max(frame.height, targetH);
        
        if (frame.layoutDirection === 'vertical') frame.height = targetH;
        else frame.width = targetW;

        this.updateShapeNode(frame);
    }
}
