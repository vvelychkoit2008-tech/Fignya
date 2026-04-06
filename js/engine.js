class FihnyaEngine {
    constructor(svgContainer, uiContainer, wrapper) {
        this.svg = svgContainer;
        this.ui = uiContainer;
        this.wrapper = wrapper;
        
        // Data State
        this.shapes = []; 
        this.selectedIds = [];
        this.activeTool = 'select'; 
        this.mode = 'design'; 
        this.defaultStyle = { fill: '#D9D9D9', stroke: 'none', strokeWidth: 1 };
        
        // Interaction System
        this.interaction = {
            state: 'idle', // 'idle', 'dragging', 'panning', 'resizing', 'drawing', 'rubberbanding', 'pen', 'link'
            lastMouse: { x: 0, y: 0 },
            dragStart: { x: 0, y: 0 },
            activeHandle: null,
            tempShape: null,
            tempLinkNode: null,
            rubberbandBox: null,
            isSpaceDown: false,
            didPan: false,
            didFinishPen: false
        };

        // Callbacks
        this.callbacks = {
            onSelectionChange: () => {},
            onSceneChange: () => {},
            onPropertyChange: (shape, key, value) => {},
            onContextMenu: () => {},
            onDoubleClickText: () => {},
            onToolChange: () => {}
        };

        // UI Managers
        this.viewport = new ViewportManager(this, this.svg, this.ui, this.wrapper);
        this.history = new HistoryManager(this);
        this.clipboard = new ClipboardManager(this);
        this.autoLayout = new AutoLayoutManager(this);
        this.selection = new SelectionManager(this, this.ui);
        this.prototype = new PrototypeManager(this, this.svg, this.ui);

        this.initEvents();
        
        // Initial setup
        setTimeout(() => {
            this.viewport.update(true);
            this.history.save();
        }, 100);
        
        window.addEventListener('resize', () => this.viewport.drawRulers());
    }
    
    // Core Utilities
    generateId() { return Math.random().toString(36).substr(2, 9); }
    getShapeById(id) { return this.shapes.find(s => s.id === id); }
    getShapeFromNode(node) {
        const id = node.getAttribute('data-id');
        return id ? this.getShapeById(id) : null;
    }
    fireSelectionChange() { this.callbacks.onSelectionChange(this.selectedIds); }
    
    // Delegation Methods
    saveState() { this.history.save(); }
    undo() { this.history.undo(); }
    redo() { this.history.redo(); }
    copy() { this.clipboard.copy(); }
    paste() { this.clipboard.paste(); }
    duplicateSelected() { this.clipboard.duplicate(); }
    
    setTool(tool) { 
        this.activeTool = tool; 
        if (tool !== 'select') this.selectedIds = []; 
        this.updateUI(); 
    }
    
    setMode(mode) { 
        this.mode = mode; 
        this.selectedIds = []; 
        this.updateUI(); 
        this.prototype.render(); 
    }

    updateUI() {
        this.selection.updateUI();
    }

    // Scene Actions
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
                this.shapes.filter(s => s.groupId === id).forEach(c => this.deleteShapeObj(c.id));
            }
            if (sh.node) sh.node.remove();
            this.shapes.splice(idx, 1);
            this.prototype.links = this.prototype.links.filter(l => l.sourceId !== id && l.targetId !== id);
        }
    }

    reorderShape(sourceId, targetId, position = 'before') {
        // Logic for reordering in array and DOM
        let sourceIdx = this.shapes.findIndex(s => s.id === sourceId);
        let targetIdx = this.shapes.findIndex(s => s.id === targetId);
        if (sourceIdx === -1) return;
        
        const sourceShape = this.shapes[sourceIdx];
        if (position === 'inside') {
            let current = this.shapes[targetIdx];
            while (current && current.groupId) {
                if (current.groupId === sourceId) return;
                current = this.getShapeById(current.groupId);
            }
        }
        
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
        this.shapes = this.shapes.filter(s => !moveIds.includes(s.id));
        
        if (targetId) {
            targetIdx = this.shapes.findIndex(s => s.id === targetId);
            if (targetIdx === -1) {
                this.shapes.push(...toMove);
                sourceShape.groupId = null;
            } else {
                const tShape = this.shapes[targetIdx];
                if (position === 'inside') {
                    sourceShape.groupId = tShape.id;
                    const childrenCount = this.shapes.filter(s => s.groupId === tShape.id).length;
                    this.shapes.splice(targetIdx + 1 + childrenCount, 0, ...toMove);
                } else {
                    sourceShape.groupId = tShape.groupId || null;
                    const insertIdx = position === 'before' ? targetIdx + 1 : targetIdx;
                    this.shapes.splice(insertIdx, 0, ...toMove);
                }
            }
        } else {
            sourceShape.groupId = null;
            this.shapes.push(...toMove);
        }

        this.syncDOMOrder();
        
        if (sourceShape.groupId) {
            const parent = this.getShapeById(sourceShape.groupId);
            if (parent && parent.isAutoLayout) this.autoLayout.apply(parent);
        } else {
            this.autoLayout.triggerPass(sourceShape);
        }

        this.prototype.render();
        this.updateUI();
        this.callbacks.onSceneChange();
        this.saveState();
    }

    syncDOMOrder() {
        this.shapes.forEach(sh => {
            if (sh.node) this.svg.appendChild(sh.node);
        });
    }

    // Shape Creation
    createShapeByType(params) {
        let shape;
        switch(params.type) {
            case 'rectangle': shape = new RectShape(params); break;
            case 'ellipse': shape = new EllipseShape(params); break;
            case 'triangle': shape = new TriangleShape(params); break;
            case 'arrow': shape = new ArrowShape(params); break;
            case 'star': shape = new StarShape(params); break;
            case 'text': shape = new TextShape(params); break;
            case 'path': shape = new PathShape(params); break;
            case 'image': shape = new ImageShape(params); break;
            case 'frame': shape = new FrameShape(params); break;
            case 'group': shape = new GroupShape(params); break;
            default: shape = new BaseShape(params);
        }
        return shape;
    }

    createShapeParams(type, x, y) {
        const isFrame = type === 'frame';
        const params = { 
            id: this.generateId(), 
            type, x, y, 
            width: 0, height: 0, 
            fill: isFrame ? '#ffffff' : this.defaultStyle.fill, 
            stroke: this.defaultStyle.stroke, 
            strokeWidth: this.defaultStyle.strokeWidth 
        };
        return this.createShapeByType(params);
    }

    renderShape(shape) { if (shape.render) shape.render(this.svg); }
    updateShapeNode(shape) { 
        if (shape.type === 'frame') this.syncFrameClipPath(shape);
        const isDragging = this.interaction.state === 'dragging' && this.selectedIds.includes(shape.id);
        shape.clipPath = (shape.groupId && !isDragging) ? `url(#clip-${shape.groupId})` : null;
        if (shape.update) shape.update(); 
    }

    syncFrameClipPath(frame) {
        let defs = this.svg.querySelector('defs');
        if (!defs) {
            defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            this.svg.prepend(defs);
        }
        let clip = defs.querySelector(`#clip-${frame.id}`);
        if (!clip) {
            clip = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
            clip.id = `clip-${frame.id}`;
            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            clip.appendChild(rect);
            defs.appendChild(clip);
        }
        const rect = clip.querySelector('rect');
        rect.setAttribute('x', frame.x);
        rect.setAttribute('y', frame.y);
        rect.setAttribute('width', frame.width);
        rect.setAttribute('height', frame.height);
    }

    addImageShape(x, y, dataUrl, w=200, h=200) {
        const imgShape = this.createShapeParams('image', x, y);
        imgShape.width = w; imgShape.height = h; imgShape.src = dataUrl;
        this.shapes.push(imgShape); this.renderShape(imgShape); this.saveState(); this.callbacks.onSceneChange();
    }

    // Selection Logic Extended
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
            if (sh && sh.type === 'group') {
                const parentId = sh.groupId || null;
                this.shapes.filter(s => s.groupId === id).forEach(child => {
                    if (parentId) child.groupId = parentId;
                    else delete child.groupId;
                    newSelection.push(child.id);
                });
                this.shapes = this.shapes.filter(s => s.id !== id);
            } else if(sh) { newSelection.push(id); }
        });
        this.selectedIds = [...new Set(newSelection)];
        this.updateUI(); this.callbacks.onSceneChange(); this.saveState();
    }

    toggleLockSelected() {
        this.selectedIds.forEach(id => {
            const s = this.getShapeById(id);
            if (s) { s.isLocked = !s.isLocked; this.updateShapeNode(s); }
        });
        this.saveState(); this.callbacks.onSceneChange(); this.updateUI();
    }

    alignSelected(alignment) {
        if (this.selectedIds.length < 2) return;
        
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        this.selectedIds.forEach(id => {
            const sh = this.getShapeById(id);
            if(sh.x < minX) minX = sh.x; if(sh.y < minY) minY = sh.y;
            if(sh.x+sh.width > maxX) maxX = sh.x+sh.width; if(sh.y+sh.height > maxY) maxY = sh.y+sh.height;
        });

        const centerX = minX + (maxX - minX) / 2;
        const centerY = minY + (maxY - minY) / 2;

        this.selectedIds.forEach(id => {
            const sh = this.getShapeById(id);
            switch (alignment) {
                case 'left': sh.x = minX; break;
                case 'center': sh.x = centerX - sh.width / 2; break;
                case 'right': sh.x = maxX - sh.width; break;
                case 'top': sh.y = minY; break;
                case 'middle': sh.y = centerY - sh.height / 2; break;
                case 'bottom': sh.y = maxY - sh.height; break;
            }
            this.updateShapeNode(sh);
        });
        
        this.updateUI();
        this.saveState();
        this.callbacks.onPropertyChange(this.getShapeById(this.selectedIds[0]));
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

    updateSelectedProperty(key, value) {
        let changed = false;
        this.selectedIds.forEach(id => {
            const shape = this.getShapeById(id);
            if (shape) {
                if (['x','y','width','height','strokeWidth','gap','padding','fontSize','fontWeight','cornerRadius','opacity','rotation'].includes(key)) {
                    value = parseFloat(value);
                    if(isNaN(value)) return;
                }
                shape[key] = value;
                this.updateShapeNode(shape);
                this.callbacks.onPropertyChange(shape, key, value);
                changed = true;
                if (shape.isAutoLayout) this.autoLayout.apply(shape);
                if (shape.groupId) { 
                    const pr = this.getShapeById(shape.groupId); 
                    if(pr && pr.isAutoLayout) this.autoLayout.apply(pr); 
                }
            }
        });
        if (changed) {
            this.updateUI();
            this.callbacks.onSceneChange();
            this.saveState();
        }
    }

    // Data Management
    exportJSON() { 
        return JSON.stringify({ 
            shapes: this.shapes.map(({node, ...rest}) => rest), 
            links: this.prototype.links 
        }); 
    }
    
    loadJSON(json) {
        const data = JSON.parse(json);
        this.svg.innerHTML = '';
        this.ui.querySelectorAll('.bbox, .selection-box, .proto-link-node').forEach(n => n.remove());
        this.shapes = data.shapes.map(params => {
            const shape = this.createShapeByType(params);
            this.renderShape(shape);
            return shape;
        });
        this.prototype.links = data.links || [];
        this.selectedIds = []; 
        this.viewport.update(true); 
        this.prototype.render(); 
        this.callbacks.onSceneChange();
    }

    // Interaction Handlers
    initEvents() {
        const container = this.wrapper;
        
        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = container.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const zoomFactor = 0.005; 
            let newScale = this.viewport.targetTransform.scale * (1 - Math.sign(e.deltaY) * 0.1); 
            this.viewport.zoom(newScale, mouseX, mouseY);
        }, { passive: false });

        container.addEventListener('pointerdown', this.onPointerDown.bind(this));
        window.addEventListener('pointermove', this.onPointerMove.bind(this));
        window.addEventListener('pointerup', this.onPointerUp.bind(this));
        
        container.addEventListener('dblclick', (e) => {
            const shape = this.getShapeFromNode(e.target);
            if (shape && shape.type === 'text') this.callbacks.onDoubleClickText(shape, e);
        });

        container.addEventListener('contextmenu', (e) => {
            if (this.interaction.didPan || this.interaction.didFinishPen) {
                this.interaction.didPan = false;
                this.interaction.didFinishPen = false;
                e.preventDefault();
                return;
            }
            if (this.activeTool === 'pen') {
                e.preventDefault();
                return;
            }
            e.preventDefault();
            this.callbacks.onContextMenu(e);
        });

        document.addEventListener('keydown', (e) => {
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) || document.activeElement.isContentEditable) return;

            // History & Clipboard
            if ((e.ctrlKey || e.metaKey)) {
                switch(e.key.toLowerCase()) {
                    case 'z': e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); break;
                    case 'y': e.preventDefault(); this.redo(); break;
                    case 'c': e.preventDefault(); this.copy(); break;
                    case 'v': e.preventDefault(); this.paste(); break;
                    case 'd': e.preventDefault(); this.duplicateSelected(); break;
                    case 'a': 
                        e.preventDefault();
                        this.selectedIds = this.shapes.filter(s => !s.isHidden && !s.isLocked && !s.groupId && s.type !== 'group').map(s => s.id);
                        this.updateUI(); this.fireSelectionChange();
                        break;
                    case 'g':
                        e.preventDefault(); e.shiftKey ? this.ungroupSelected() : this.groupSelected();
                        break;
                }
            }

            // Layer Stack
            if (e.key === '[' || e.key === 'х') { e.preventDefault(); this.sendBackward(); }
            if (e.key === ']' || e.key === 'ї') { e.preventDefault(); this.bringForward(); }
            
            // Deletion
            if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.deleteSelected(); }

            // Pen Tool / Finish interactions
            if (e.key === 'Escape' || e.key === 'Enter') {
                if (this.interaction.state === 'pen') {
                    e.preventDefault();
                    this.finalizePen();
                } else if (e.key === 'Escape') {
                    this.setTool('select');
                    if (this.callbacks.onToolChange) this.callbacks.onToolChange('select');
                }
            }

            if (e.key === 'Alt') { e.preventDefault(); document.body.classList.add('show-hotkeys'); }

            // Tool Shortcuts
            this.handleKeyboardTools(e);

            // Pan shortcut (Space)
            if (e.code === 'Space') {
                e.preventDefault();
                if (!this.interaction.isSpaceDown) {
                    this.interaction.isSpaceDown = true;
                    document.body.style.cursor = 'grab';
                }
            }

            // Nudge
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                this.handleNudge(e);
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.key === 'Alt') document.body.classList.remove('show-hotkeys');
            if (e.code === 'Space') {
                this.interaction.isSpaceDown = false;
                if (this.interaction.state !== 'panning') document.body.style.cursor = 'default';
            }
        });
    }

    handleKeyboardTools(e) {
        const keyCodeMap = { 'KeyV': 'select', 'KeyR': 'rectangle', 'KeyO': 'ellipse', 'KeyC': 'ellipse', 'KeyP': 'pen', 'KeyT': 'text', 'KeyF': 'frame', 'KeyI': 'image' };
        const toolMap = { 'v': 'select', 'r': 'rectangle', 'o': 'ellipse', 'c': 'ellipse', 'p': 'pen', 't': 'text', 'f': 'frame', 'i': 'image', 'м': 'select', 'к': 'rectangle', 'щ': 'ellipse', 'с': 'ellipse', 'з': 'pen', 'е': 'text', 'а': 'frame', 'ш': 'image' };
        
        let toolKey = keyCodeMap[e.code] || toolMap[e.key.toLowerCase()];
        
        if (e.shiftKey) {
            if (e.code === 'KeyT') toolKey = 'triangle';
            if (e.code === 'KeyS') toolKey = 'star';
            if (e.code === 'KeyA') toolKey = 'arrow';
        }

        if (toolKey && (!e.ctrlKey || e.shiftKey) && !e.metaKey && !e.altKey) {
            e.preventDefault();
            if (toolKey === 'image') {
                if (this.callbacks.onToolChange) this.callbacks.onToolChange('image');
            } else {
                this.setTool(toolKey);
                if (this.callbacks.onToolChange) this.callbacks.onToolChange(toolKey);
            }
        }
    }

    handleNudge(e) {
        if (this.selectedIds.length === 0) return;
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        let dx = 0, dy = 0;
        if (e.key === 'ArrowUp') dy = -step; if (e.key === 'ArrowDown') dy = step;
        if (e.key === 'ArrowLeft') dx = -step; if (e.key === 'ArrowRight') dx = step;

        this.selectedIds.forEach(id => {
            const sh = this.getShapeById(id);
            if (!sh || sh.isLocked || sh.isHidden) return;
            sh.x += dx; sh.y += dy;
            this.updateShapeNode(sh);
            this.autoLayout.triggerPass(sh);
        });
        
        this.updateUI();
        this.callbacks.onSceneChange();
        this.saveState();
    }

    onPointerDown(e) {
        if (this.interaction.state === 'pen' && e.button === 2) {
            e.preventDefault();
            this.interaction.didFinishPen = true;
            this.finalizePen();
            return;
        }

        if (e.button === 1 || e.button === 2 || this.interaction.isSpaceDown) {
            this.interaction.didPan = false;
            this.startPanning(e);
            return;
        }
        const pt = this.viewport.getCanvasPoint(e);
        this.interaction.lastMouse = { x: e.clientX, y: e.clientY };
        this.interaction.dragStart = { ...pt };

        if (e.target.classList.contains('handle')) {
            const dir = e.target.dataset.dir;
            if (dir === 'rot') this.startRotating(e);
            else this.startResizing(dir);
            return;
        }

        if (this.mode === 'prototype') {
            this.startLinking(e);
            return;
        }

        if (this.activeTool === 'select' || this.mode === 'inspect') {
            this.handleSelectPointerDown(e, pt);
        } else if (this.activeTool === 'pen') {
            this.handlePenPointerDown(pt);
        } else if (this.activeTool !== 'image') {
            this.startDrawing(pt);
        }
    }

    onPointerMove(e) {
        const state = this.interaction.state;
        const pt = this.viewport.getCanvasPoint(e);

        if (state === 'panning') {
            this.viewport.pan(e.clientX - this.interaction.lastMouse.x, e.clientY - this.interaction.lastMouse.y);
            this.interaction.lastMouse = { x: e.clientX, y: e.clientY };
            this.interaction.didPan = true;
        } else if (state === 'rubberbanding') {
            this.updateRubberband(pt);
        } else if (state === 'pen' && this.interaction.tempShape) {
            let ptX = pt.x; let ptY = pt.y;
            const threshold = 5 / this.viewport.transform.scale;
            this.selection.smartGuides = [];
            this.shapes.forEach(t => {
                if (t.id === this.interaction.tempShape.id || t.isHidden || t.isLocked) return;
                [t.x, t.x + t.width/2, t.x + t.width].forEach(xVal => {
                    if (Math.abs(pt.x - xVal) < threshold) { ptX = xVal; this.selection.smartGuides.push({type:'v', pos:xVal, start:Math.min(pt.y, t.y), end:Math.max(pt.y, t.y+t.height)}); }
                });
                [t.y, t.y + t.height/2, t.y + t.height].forEach(yVal => {
                    if (Math.abs(pt.y - yVal) < threshold) { ptY = yVal; this.selection.smartGuides.push({type:'h', pos:yVal, start:Math.min(pt.x, t.x), end:Math.max(pt.x, t.x+t.width)}); }
                });
            });
            this.interaction.lastMouse = { x: ptX, y: ptY }; // Store snapped for next point
            this.interaction.tempShape.node.setAttribute('d', this.interaction.tempShape.d + ` L ${ptX} ${ptY}`);
            this.updateUI();
        } else if (state === 'link' && this.interaction.tempShape) {
            this.updateTempLink(pt);
        } else if (state === 'drawing' && this.interaction.tempShape) {
            this.updateDrawing(pt);
        } else if (state === 'dragging' && this.selectedIds.length > 0 && this.mode !== 'inspect') {
            this.updateDragging(e, pt);
        } else if (state === 'resizing' && this.selectedIds.length === 1) {
            this.updateResizing(e, pt);
        } else if (state === 'rotating' && this.selectedIds.length === 1) {
            this.updateRotating(pt);
        }
    }

    onPointerUp(e) {
        const state = this.interaction.state;
        const pt = this.viewport.getCanvasPoint(e);
        if (state === 'panning') {
            this.interaction.state = 'idle';
            document.body.style.cursor = 'default';
        } else if (state === 'rubberbanding') {
            this.finishRubberband(e);
        } else if (state === 'link') {
            this.finishLinking(e);
        } else if (state === 'drawing') {
            this.finishDrawing(e);
        } else if (state === 'dragging') {
            this.finishDragging(pt);
        } else if (state === 'resizing') {
            this.finishResizing();
        } else if (state === 'rotating') {
            this.finishRotating();
        }
        
        if (this.interaction.state !== 'pen') {
            this.interaction.state = 'idle';
        }
        this.selection.smartGuides = [];
        this.updateUI();
    }

    // Interaction Sub-handlers
    startPanning(e) {
        this.interaction.state = 'panning';
        this.interaction.lastMouse = { x: e.clientX, y: e.clientY };
        document.body.style.cursor = 'grabbing';
    }

    startResizing(dir) {
        this.interaction.state = 'resizing';
        this.interaction.activeHandle = dir;
    }

    startRotating(e) {
        this.interaction.state = 'rotating';
    }

    startLinking(e) {
        const shape = this.getShapeFromNode(e.target);
        if (shape && !shape.isLocked && !shape.isHidden) {
            this.interaction.state = 'link';
            this.interaction.tempShape = shape;
            this.interaction.tempLinkNode = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            this.interaction.tempLinkNode.setAttribute('class', 'arrow-line');
            this.ui.appendChild(this.interaction.tempLinkNode);
        }
    }

    handleSelectPointerDown(e, pt) {
        const shape = this.getShapeFromNode(e.target);
        if (shape && !shape.isLocked && !shape.isHidden) {
            this.interaction.state = 'dragging';
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
                this.interaction.state = 'rubberbanding';
                this.interaction.rubberbandBox = document.createElement('div');
                this.interaction.rubberbandBox.className = 'selection-box';
                this.ui.appendChild(this.interaction.rubberbandBox);
            }
        }
        this.fireSelectionChange();
        this.updateUI();
    }

    handlePenPointerDown(pt) {
        if (this.interaction.state !== 'pen') {
            this.interaction.state = 'pen';
            this.interaction.tempShape = this.createShapeParams('path', pt.x, pt.y);
            this.interaction.tempShape.d = `M ${pt.x} ${pt.y}`;
            this.shapes.push(this.interaction.tempShape);
            this.renderShape(this.interaction.tempShape);
        } else {
            this.interaction.tempShape.d += ` L ${pt.x} ${pt.y}`;
            this.updateShapeNode(this.interaction.tempShape);
        }
    }

    startDrawing(pt) {
        this.interaction.state = 'drawing';
        this.interaction.tempShape = this.createShapeParams(this.activeTool, pt.x, pt.y);
        this.shapes.push(this.interaction.tempShape);
        this.renderShape(this.interaction.tempShape);
    }

    updateRubberband(pt) {
        const w = pt.x - this.interaction.dragStart.x;
        const h = pt.y - this.interaction.dragStart.y;
        this.interaction.rubberbandBox.style.left = (w < 0 ? pt.x : this.interaction.dragStart.x) + 'px';
        this.interaction.rubberbandBox.style.top = (h < 0 ? pt.y : this.interaction.dragStart.y) + 'px';
        this.interaction.rubberbandBox.style.width = Math.abs(w) + 'px';
        this.interaction.rubberbandBox.style.height = Math.abs(h) + 'px';
    }

    updateTempLink(pt) {
        const sx = this.interaction.tempShape.x + this.interaction.tempShape.width/2;
        const sy = this.interaction.tempShape.y + this.interaction.tempShape.height/2;
        const path = `M ${sx} ${sy} Q ${(sx+pt.x)/2} ${(sy+pt.y)/2-50} ${pt.x} ${pt.y}`;
        this.interaction.tempLinkNode.setAttribute('d', path);
    }

    updateDrawing(pt) {
        let ptX = pt.x; let ptY = pt.y;
        const threshold = 5 / this.viewport.transform.scale;
        this.selection.smartGuides = [];

        this.shapes.forEach(t => {
            if (t.id === this.interaction.tempShape.id || t.isHidden || t.isLocked) return;
            [t.x, t.x + t.width/2, t.x + t.width].forEach(xVal => {
                if (Math.abs(pt.x - xVal) < threshold) { ptX = xVal; this.selection.smartGuides.push({type:'v', pos:xVal, start:Math.min(this.interaction.dragStart.y, t.y), end:Math.max(pt.y, t.y+t.height)}); }
            });
            [t.y, t.y + t.height/2, t.y + t.height].forEach(yVal => {
                if (Math.abs(pt.y - yVal) < threshold) { ptY = yVal; this.selection.smartGuides.push({type:'h', pos:yVal, start:Math.min(this.interaction.dragStart.x, t.x), end:Math.max(pt.x, t.x+t.width)}); }
            });
        });

        const w = ptX - this.interaction.dragStart.x;
        const h = ptY - this.interaction.dragStart.y;
        this.interaction.tempShape.x = w < 0 ? ptX : this.interaction.dragStart.x;
        this.interaction.tempShape.y = h < 0 ? ptY : this.interaction.dragStart.y;
        this.interaction.tempShape.width = Math.abs(w);
        this.interaction.tempShape.height = Math.abs(h);
        this.updateShapeNode(this.interaction.tempShape);
    }

    updateDragging(e, pt) {
        const dx = pt.x - this.interaction.dragStart.x;
        const dy = pt.y - this.interaction.dragStart.y;
        this.interaction.dragStart = pt;
        
        let snapDx = dx; let snapDy = dy;
        this.selection.smartGuides = [];
        
        if (this.selectedIds.length === 1 && !e.altKey) {
            const me = this.getShapeById(this.selectedIds[0]);
            if (me && !me.groupId) {
                const threshold = 5 / this.viewport.transform.scale;
                
                let checkX = dx; let checkY = dy;
                if (e.shiftKey) {
                    if (Math.abs(dx) > Math.abs(dy)) checkY = 0;
                    else checkX = 0;
                }
                
                const mcX = me.x + checkX + me.width/2; const mcY = me.y + checkY + me.height/2;
                this.shapes.forEach(t => {
                    if(t.id === me.id || t.isHidden || t.groupId) return;
                    if(Math.abs(mcX - (t.x + t.width/2)) < threshold) { snapDx = (t.x + t.width/2) - me.width/2 - me.x; this.selection.smartGuides.push({type:'v', pos:t.x + t.width/2, start:Math.min(me.y, t.y), end:Math.max(me.y+me.height, t.y+t.height)}); }
                    if(Math.abs(mcY - (t.y + t.height/2)) < threshold) { snapDy = (t.y + t.height/2) - me.height/2 - me.y; this.selection.smartGuides.push({type:'h', pos:t.y + t.height/2, start:Math.min(me.x, t.x), end:Math.max(me.x+me.width, t.x+t.width)}); }
                });
            }
        }

        let mDx = dx; let mDy = dy;
        if (e.shiftKey) {
            if (Math.abs(dx) > Math.abs(dy)) mDy = 0;
            else mDx = 0;
        }

        this.selectedIds.forEach(id => {
            const shape = this.getShapeById(id);
            if (!shape) return;
            this.moveShapeRecursive(id, mDx + snapDx, mDy + snapDy);
            if (shape.node) this.svg.appendChild(shape.node); // Bring to front during drag
            if (shape.groupId) {
                const parent = this.getShapeById(shape.groupId);
                if (parent && parent.isAutoLayout) this.autoLayout.apply(parent);
            } else this.autoLayout.triggerPass(shape);
        });

        // Highlight potential parent
        this.svg.querySelectorAll('.potential-parent').forEach(n => n.classList.remove('potential-parent'));
        if (this.selectedIds.length === 1) {
            const shape = this.getShapeById(this.selectedIds[0]);
            if (['rectangle', 'ellipse', 'star', 'triangle', 'arrow', 'path', 'text', 'image'].includes(shape.type)) {
                const container = [...this.shapes].reverse().find(s => s.type === 'frame' && s.id !== shape.id && !s.isHidden && !s.isLocked && pt.x >= s.x && pt.x <= s.x + s.width && pt.y >= s.y && pt.y <= s.y + s.height);
                if (container && container.node) container.node.classList.add('potential-parent');
            }
        }
        
        this.updateUI();
    }

    moveShapeRecursive(shapeId, dx, dy) {
        const shape = this.getShapeById(shapeId);
        if (!shape) return;
        this.shapes.filter(c => c.groupId === shapeId).forEach(c => this.moveShapeRecursive(c.id, dx, dy));
        shape.x += dx; shape.y += dy;
        this.updateShapeNode(shape);
    }

    updateResizing(e, pt) {
        const shape = this.getShapeById(this.selectedIds[0]);
        let dx = pt.x - this.interaction.dragStart.x; 
        let dy = pt.y - this.interaction.dragStart.y;
        this.interaction.dragStart = pt;
        
        const old = { w: shape.width, h: shape.height, x: shape.x, y: shape.y };
        
        if (e.shiftKey) {
            const ratio = old.w / old.h;
            if (this.interaction.activeHandle.length === 2) { // Corners
                if (Math.abs(dx) > Math.abs(dy)) dy = dx / ratio;
                else dx = dy * ratio;
            }
        }
        
        if (this.interaction.activeHandle.includes('r')) shape.width += dx;
        if (this.interaction.activeHandle.includes('l')) { shape.width -= dx; shape.x += dx; }
        if (this.interaction.activeHandle.includes('b')) shape.height += dy;
        if (this.interaction.activeHandle.includes('t')) { shape.height -= dy; shape.y += dy; }
        shape.width = Math.max(1, shape.width); shape.height = Math.max(1, shape.height);

        if (shape.type === 'group' || shape.type === 'frame') {
            const sx = shape.width / old.w; const sy = shape.height / old.h;
            this.shapes.filter(s => s.groupId === shape.id).forEach(c => {
                c.x = shape.x + (c.x - old.x) * sx; c.y = shape.y + (c.y - old.y) * sy;
                c.width *= sx; c.height *= sy;
                this.updateShapeNode(c);
            });
        }
        this.updateShapeNode(shape);
        if (shape.isAutoLayout) this.autoLayout.apply(shape);
        this.updateUI();
    }

    updateRotating(pt) {
        const shape = this.getShapeById(this.selectedIds[0]);
        if (!shape) return;
        
        const cx = shape.x + shape.width / 2;
        const cy = shape.y + shape.height / 2;
        
        // Calculate the angle between the vertical axis and the line from center to mouse
        const angle = Math.atan2(pt.y - cy, pt.x - cx) * 180 / Math.PI;
        
        // +90 because the handle is at the top
        shape.rotation = Math.round(angle + 90);
        this.updateShapeNode(shape);
        this.updateUI();
        this.callbacks.onPropertyChange(shape, 'rotation', shape.rotation);
    }

    finalizePen() {
        if (this.interaction.tempShape) {
            if (this.interaction.tempShape.finalize) this.interaction.tempShape.finalize();
            if (this.interaction.tempShape.width < 2 && this.interaction.tempShape.height < 2) {
                this.deleteShapeObj(this.interaction.tempShape.id);
            } else {
                this.selectedIds = [this.interaction.tempShape.id];
                this.callbacks.onSceneChange(); this.saveState();
            }
        }
        this.interaction.state = 'idle';
        this.setTool('select');
        if (this.callbacks.onToolChange) this.callbacks.onToolChange('select');
        this.updateUI(); this.fireSelectionChange();
        this.interaction.tempShape = null;
    }

    finishRubberband(e) {
        const pt = this.viewport.getCanvasPoint(e);
        const w = pt.x - this.interaction.dragStart.x; const h = pt.y - this.interaction.dragStart.y;
        const rx = w < 0 ? pt.x : this.interaction.dragStart.x; const ry = h < 0 ? pt.y : this.interaction.dragStart.y;
        const absW = Math.abs(w); const absH = Math.abs(h);
        
        const newSel = [];
        this.shapes.forEach(sh => {
            if (sh.isHidden || sh.isLocked) return;
            const inBox = sh.x < rx+absW && sh.x+sh.width > rx && sh.y < ry+absH && sh.y+sh.height > ry;
            if (inBox && (!sh.groupId || sh.type === 'group')) newSel.push(sh.id);
        });
        this.selectedIds = e.shiftKey ? [...new Set([...this.selectedIds, ...newSel])] : newSel;
        if (this.interaction.rubberbandBox) this.interaction.rubberbandBox.remove();
        this.fireSelectionChange();
    }

    finishLinking(e) {
        const target = this.getShapeFromNode(e.target);
        if (target && target.id !== this.interaction.tempShape.id) {
            this.prototype.links.push({ id: this.generateId(), sourceId: this.interaction.tempShape.id, targetId: target.id });
        }
        if (this.interaction.tempLinkNode) this.interaction.tempLinkNode.remove();
        this.interaction.tempShape = null; this.prototype.render(); this.saveState();
    }

    finishDrawing(e) {
        const shape = this.interaction.tempShape;
        if (shape.width < 5 && shape.height < 5 && !['text', 'path'].includes(shape.type)) {
            this.deleteShapeObj(shape.id);
        } else {
            const tCx = shape.x + shape.width/2; const tCy = shape.y + shape.height/2;
            const container = [...this.shapes].reverse().find(s => (s.type === 'frame' || s.type === 'group') && s.id !== shape.id && !s.isHidden && !s.isLocked && tCx >= s.x && tCx <= s.x + s.width && tCy >= s.y && tCy <= s.y + s.height);
            
            if (container) {
                this.reorderShape(shape.id, container.id, 'inside');
            } else {
                this.reorderShape(shape.id, null, null);
            }
            
            this.selectedIds = [shape.id]; 
            if (shape.node) {
                shape.node.classList.add('creation-pulse');
                setTimeout(() => shape.node.classList.remove('creation-pulse'), 1500);
            }
            this.setTool('select');
            if (this.callbacks.onToolChange) this.callbacks.onToolChange('select');
            if (shape.type === 'text') this.callbacks.onDoubleClickText(shape, e);
            this.callbacks.onSceneChange(); this.saveState();
        }
        this.interaction.tempShape = null;
        this.fireSelectionChange();
        this.updateUI();
    }

    finishDragging(pt) {
        this.svg.querySelectorAll('.potential-parent').forEach(n => n.classList.remove('potential-parent'));
        this.selectedIds.forEach(id => {
            const shape = this.getShapeById(id);
            if (!shape || ['group', 'frame'].includes(shape.type)) return;
            const container = pt ? [...this.shapes].reverse().find(s => s.type === 'frame' && s.id !== shape.id && !s.isHidden && !s.isLocked && pt.x >= s.x && pt.x <= s.x + s.width && pt.y >= s.y && pt.y <= s.y + s.height) : null;
            
            if (container) {
                if (shape.groupId !== container.id) {
                    this.reorderShape(shape.id, container.id, 'inside');
                    if (container.isAutoLayout) this.autoLayout.apply(container);
                }
            } else if (shape.groupId) {
                const oldParent = this.getShapeById(shape.groupId);
                this.reorderShape(shape.id, null, null);
                if (oldParent && oldParent.isAutoLayout) this.autoLayout.apply(oldParent);
            }
        });
        this.callbacks.onSceneChange(); this.saveState();
        this.updateUI();
    }

    finishResizing() {
        this.callbacks.onSceneChange(); this.saveState();
        this.updateUI();
    }

    finishRotating() {
        this.callbacks.onSceneChange(); this.saveState();
        this.updateUI();
    }
}
