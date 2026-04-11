class FihnyaEngine {
    constructor(svgContainer, uiContainer, wrapper) {
        this.svg = svgContainer;
        this.ui = uiContainer;
        this.wrapper = wrapper;
        
        // Internal State
        this.shapes = []; 
        this.selectedIds = [];
        this.activeTool = 'select'; 
        this.mode = 'design'; 
        this.defaultStyle = { fill: '#D9D9D9', stroke: 'none', strokeWidth: 1 };
        
        // Interaction State
        this.isDragging = false;
        this.isPanning = false;
        this.isResizing = false;
        this.isDrawing = false;
        this.isRubberbanding = false;
        this.isDrawingPen = false;
        this.isDrawingLink = false;
        this.lastMouse = { x: 0, y: 0 };
        this.dragStart = { x: 0, y: 0 };
        this.activeHandle = null;
        this.tempShape = null;
        this.tempLinkNode = null;

        // Callbacks
        this.callbacks = {
            onSelectionChange: () => {},
            onSceneChange: () => {},
            onPropertyChange: (shape, key, value) => {},
            onContextMenu: () => {},
            onDoubleClickText: () => {},
            onStateChange: () => {},
            onToolChange: null
        };

        // Initialize Managers
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
            if (sh.type === 'group' || sh.type === 'frame') {
                this.shapes.filter(s => s.groupId === id).forEach(c => this.deleteShapeObj(c.id));
            }
            if (sh.node) sh.node.remove();
            this.shapes.splice(idx, 1);
            this.prototype.links = this.prototype.links.filter(l => l.sourceId !== id && l.targetId !== id);
            this.selectedIds = this.selectedIds.filter(sid => sid !== id);
        }
    }
    reorderShape(sourceId, targetId, position = 'before') {
        const sourceIdx = this.shapes.findIndex(s => s.id === sourceId);
        if (sourceIdx === -1) return;
        
        const sourceShape = this.shapes[sourceIdx];
        
        if (position === 'inside') {
            let current = this.getShapeById(targetId);
            while (current && current.groupId) {
                if (current.groupId === sourceId) return;
                current = this.getShapeById(current.groupId);
            }
            sourceShape.groupId = targetId;
        } else if (targetId) {
            const tShape = this.getShapeById(targetId);
            sourceShape.groupId = tShape.groupId || null;
            
            // Move sourceShape to correct array position locally to influence the later sync sort
            this.shapes.splice(sourceIdx, 1);
            let targetIdx = this.shapes.findIndex(s => s.id === targetId);
            
            // If dropping "before" in the panel (visually higher), we put it after in the array (higher z-index).
            // But we must place it after T's entire group subtree!
            if (position === 'before') {
                targetIdx = this._getLastDescendantIndex(tShape.id);
                this.shapes.splice(targetIdx + 1, 0, sourceShape);
            } else {
                this.shapes.splice(targetIdx, 0, sourceShape);
            }
        } else {
            sourceShape.groupId = null;
            this.shapes.splice(sourceIdx, 1);
            this.shapes.push(sourceShape);
        }

        this.syncTreeOrder();
        
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

    _getLastDescendantIndex(parentId) {
        let maxIdx = this.shapes.findIndex(s => s.id === parentId);
        const children = this.shapes.filter(s => s.groupId === parentId);
        children.forEach(c => {
            const childMax = this._getLastDescendantIndex(c.id);
            if (childMax > maxIdx) maxIdx = childMax;
        });
        return maxIdx;
    }

    syncTreeOrder() {
        const sorted = [];
        const addNode = (node) => {
            if (!sorted.includes(node)) sorted.push(node);
            const children = this.shapes.filter(s => s.groupId === node.id);
            children.sort((a,b) => this.shapes.indexOf(a) - this.shapes.indexOf(b));
            children.forEach(c => addNode(c));
        };
        const roots = this.shapes.filter(s => !s.groupId);
        roots.sort((a,b) => this.shapes.indexOf(a) - this.shapes.indexOf(b));
        roots.forEach(root => addNode(root));
        
        // Now capture any lingering orphans due to bad state
        this.shapes.forEach(s => { if (!sorted.includes(s)) sorted.push(s); });
        
        this.shapes = sorted;
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
        const params = { 
            id: this.generateId(), 
            type, x, y, 
            width: 0, height: 0, 
            fill: this.defaultStyle.fill, 
            stroke: this.defaultStyle.stroke, 
            strokeWidth: this.defaultStyle.strokeWidth 
        };
        return this.createShapeByType(params);
    }

    renderShape(shape) { if (shape.render) shape.render(this.svg); }
    updateShapeNode(shape) { if (shape.update) shape.update(); }

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

    // ═══════════════════════════════════════════
    //  LAYER ORDERING
    // ═══════════════════════════════════════════

    bringToFront() {
        if (!this.selectedIds.length) return;
        this.selectedIds.forEach(id => {
            const s = this.getShapeById(id);
            if (!s) return;
            const groupSiblings = this.shapes.filter(sh => sh.groupId === s.groupId);
            this.shapes = this.shapes.filter(sh => sh.id !== id);
            
            // Insert at the very end of its visual grouping
            if (s.groupId) {
                const lastSibling = groupSiblings[groupSiblings.length-1];
                let insertIdx = this._getLastDescendantIndex(lastSibling.id);
                this.shapes.splice(insertIdx + 1, 0, s);
            } else {
                this.shapes.push(s);
            }
        });
        this.syncTreeOrder();
        this.saveState(); this.callbacks.onSceneChange();
    }

    bringForward() {
        if (!this.selectedIds.length) return;
        // Same logic: move slightly up within its group constraints
        this.selectedIds.forEach(id => {
            const s = this.getShapeById(id);
            if (!s) return;
            const siblings = this.shapes.filter(sh => sh.groupId === s.groupId);
            const myIndex = siblings.indexOf(s);
            if (myIndex < siblings.length - 1) {
                const nextSibling = siblings[myIndex + 1];
                // we want to place s right after nextSibling's descendants
                this.shapes = this.shapes.filter(sh => sh.id !== id);
                let newIdx = this._getLastDescendantIndex(nextSibling.id);
                this.shapes.splice(newIdx + 1, 0, s);
            }
        });
        this.syncTreeOrder();
        this.saveState(); this.callbacks.onSceneChange();
    }


    sendToBack() {
        if (!this.selectedIds.length) return;
        this.selectedIds.forEach(id => {
            const s = this.getShapeById(id);
            if (!s) return;
            this.shapes = this.shapes.filter(sh => sh.id !== id);
            
            if (s.groupId) {
                const parentIdx = this.shapes.findIndex(sh => sh.id === s.groupId);
                this.shapes.splice(parentIdx + 1, 0, s);
            } else {
                this.shapes.unshift(s);
            }
        });
        this.syncTreeOrder();
        this.saveState(); this.callbacks.onSceneChange();
    }

    sendBackward() {
        if (!this.selectedIds.length) return;
        this.selectedIds.forEach(id => {
            const s = this.getShapeById(id);
            if (!s) return;
            const siblings = this.shapes.filter(sh => sh.groupId === s.groupId);
            const myIndex = siblings.indexOf(s);
            if (myIndex > 0) {
                const prevSibling = siblings[myIndex - 1];
                this.shapes = this.shapes.filter(sh => sh.id !== id);
                let newIdx = this.shapes.findIndex(sh => sh.id === prevSibling.id);
                this.shapes.splice(newIdx, 0, s); // Place BEFORE PREV sibling
            }
        });
        this.syncTreeOrder();
        this.saveState(); this.callbacks.onSceneChange();
    }

    toggleHideSelected() {
        this.selectedIds.forEach(id => {
            const s = this.getShapeById(id);
            if (s) { s.isHidden = !s.isHidden; this.updateShapeNode(s); }
        });
        this.saveState(); this.callbacks.onSceneChange(); this.updateUI();
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
        this.ui.querySelectorAll('.bbox, .selection-box, .proto-link-node, .proto-handle, .proto-link-label, .proto-link-delete, .proto-start-badge').forEach(n => n.remove());
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
        const container = this.svg.parentElement.parentElement;
        
        container.addEventListener('wheel', (e) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const rect = container.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                const zoomFactor = 0.008; 
                let newScale = this.viewport.targetTransform.scale * (1 - Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY)*zoomFactor, 0.5));
                this.viewport.zoom(newScale, mouseX, mouseY);
            } else {
                this.viewport.pan(-e.deltaX, -e.deltaY);
            }
        }, { passive: false });

        container.addEventListener('pointerdown', this.onPointerDown.bind(this));
        window.addEventListener('pointermove', this.onPointerMove.bind(this));
        window.addEventListener('pointerup', this.onPointerUp.bind(this));
        
        container.addEventListener('dblclick', (e) => {
            const shape = this.getShapeFromNode(e.target);
            if (shape && shape.type === 'text') this.callbacks.onDoubleClickText(shape, e);
        });

        container.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.callbacks.onContextMenu(e);
        });

        document.addEventListener('keydown', (e) => {
            if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA' || document.activeElement.isContentEditable) return;

            if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyZ') && !e.shiftKey) { e.preventDefault(); this.undo(); }
            if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey))) { e.preventDefault(); this.redo(); }
            if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyC')) { e.preventDefault(); this.copy(); }
            if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyV')) { e.preventDefault(); this.paste(); }
            if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyD')) { e.preventDefault(); this.duplicateSelected(); }
            if (e.code === 'BracketLeft') { e.preventDefault(); this.sendBackward(); }
            if (e.code === 'BracketRight') { e.preventDefault(); this.bringForward(); }
            if ((e.ctrlKey || e.metaKey) && e.code === 'KeyA') {
                e.preventDefault();
                this.selectedIds = this.shapes.filter(s => !s.isHidden && !s.isLocked && !s.groupId && s.type !== 'group').map(s => s.id);
                this.updateUI();
                this.fireSelectionChange();
            }
            if ((e.ctrlKey || e.metaKey) && e.code === 'KeyG' && !e.shiftKey) { e.preventDefault(); this.groupSelected(); }
            if ((e.ctrlKey || e.metaKey) && e.code === 'KeyG' && e.shiftKey) { e.preventDefault(); this.ungroupSelected(); }
            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                // Delete selected prototype link if any
                if (this.mode === 'prototype' && this.prototype.selectedLinkId) {
                    this.prototype.removeLink(this.prototype.selectedLinkId);
                } else {
                    this.deleteSelected();
                }
            }

            // Layer ordering shortcuts
            if ((e.ctrlKey || e.metaKey) && e.key === ']') { e.preventDefault(); this.bringForward(); }
            if ((e.ctrlKey || e.metaKey) && e.key === '[') { e.preventDefault(); this.sendBackward(); }
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === '}') { e.preventDefault(); this.bringToFront(); }
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === '{') { e.preventDefault(); this.sendToBack(); }

            if (e.key === 'Escape' || e.key === 'Enter') {
                if (this.isDrawingPen && this.tempShape) {
                    e.preventDefault();
                    this.isDrawingPen = false;
                    this.tempShape.updateBounds();
                    this.updateUI();
                    this.fireSelectionChange();
                    this.tempShape = null;
                    this.saveState();
                }
                if (e.key === 'Escape') {
                    this.setTool('select');
                    if (this.callbacks.onToolChange) this.callbacks.onToolChange('select');
                }
            }
            if (e.key === 'Alt') { e.preventDefault(); document.body.classList.add('show-hotkeys'); }

            // Tool hotkeys (layout independent)
            const keyCodeMap = { 'KeyV': 'select', 'KeyR': 'rectangle', 'KeyO': 'ellipse', 'KeyC': 'ellipse', 'KeyP': 'pen', 'KeyT': 'text', 'KeyF': 'frame', 'KeyI': 'image' };
            const toolMap = { 'v': 'select', 'r': 'rectangle', 'o': 'ellipse', 'c': 'ellipse', 'p': 'pen', 't': 'text', 'f': 'frame', 'i': 'image', 'м': 'select', 'к': 'rectangle', 'щ': 'ellipse', 'с': 'ellipse', 'з': 'pen', 'е': 'text', 'а': 'frame', 'ш': 'image' };
            
            let toolKey = keyCodeMap[e.code] || toolMap[e.key.toLowerCase()];
            
            // Special Shift + Key for shapes
            if (e.shiftKey) {
                if (e.code === 'KeyT') toolKey = 'triangle';
                if (e.code === 'KeyS') toolKey = 'star';
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

            if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
                e.preventDefault();
                if (!this.isSpaceDown) {
                    this.isSpaceDown = true;
                    document.body.style.cursor = 'grab';
                }
            }

            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && this.selectedIds.length > 0) {
                e.preventDefault();
                const step = e.shiftKey ? 10 : 1;
                let dx = 0, dy = 0;
                if (e.key === 'ArrowUp') dy = -step; if (e.key === 'ArrowDown') dy = step;
                if (e.key === 'ArrowLeft') dx = -step; if (e.key === 'ArrowRight') dx = step;

                let moved = false;
                this.selectedIds.forEach(id => {
                    const sh = this.getShapeById(id);
                    if (!sh || sh.isLocked || sh.isHidden) return;
                    if (sh.type === 'group' || sh.type === 'frame') {
                        this.shapes.filter(c => c.groupId === id).forEach(c => { if(!c.isLocked){c.x+=dx; c.y+=dy; this.updateShapeNode(c); moved=true; } });
                    }
                    sh.x += dx; sh.y += dy;
                    this.updateShapeNode(sh);
                    this.autoLayout.triggerPass(sh);
                    moved = true;
                });
                if(moved) { this.updateUI(); this.saveState(); this.callbacks.onSceneChange(); }
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.key === 'Alt') document.body.classList.remove('show-hotkeys');
            if (e.code === 'Space') {
                this.isSpaceDown = false;
                document.body.style.cursor = 'default';
            }
        });
    }

    onPointerDown(e) {
        if (e.button === 1 || this.isSpaceDown) {
            this.isPanning = true;
            this.lastMouse = { x: e.clientX, y: e.clientY };
            document.body.style.cursor = 'grabbing';
            return;
        }
        if (e.button === 2) return; 
        
        const pt = this.viewport.getCanvasPoint(e);
        this.lastMouse = { x: e.clientX, y: e.clientY };
        this.dragStart = { ...pt };

        if (e.target.classList.contains('handle')) {
            this.isResizing = true;
            this.activeHandle = e.target.dataset.dir;
            return;
        }

        if (this.mode === 'prototype') {
            // Check if clicking a proto-handle (connection dot)
            const isHandle = e.target.classList.contains('proto-handle');
            const shape = isHandle 
                ? this.getShapeById(e.target.dataset.sourceId)
                : this.getShapeFromNode(e.target);
            
            if (shape && !shape.isLocked && !shape.isHidden) {
                this.isDrawingLink = true;
                this.tempShape = shape;
                // Create drag line on SVG canvas (not div!)
                this.tempLinkNode = this.prototype.createDragLine();
                // Highlight valid drop targets (frames)
                this.prototype.highlightFrames(shape.id);
                // Deselect any selected link
                this.prototype.deselectLink();
            } else {
                // Clicked on empty space — deselect link
                this.prototype.deselectLink();
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
        } else if (this.activeTool !== 'image') {
            this.isDrawing = true;
            this.tempShape = this.createShapeParams(this.activeTool, pt.x, pt.y);
            this.shapes.push(this.tempShape);
            this.renderShape(this.tempShape);
        }
    }

    onPointerMove(e) {
        if (this.isPanning) {
            const dx = e.clientX - this.lastMouse.x;
            const dy = e.clientY - this.lastMouse.y;
            this.viewport.pan(dx, dy);
            this.lastMouse = { x: e.clientX, y: e.clientY };
            return;
        }

        if (this.isDrawingPen && this.activeTool !== 'pen') {
            this.isDrawingPen = false;
            if (this.tempShape) this.tempShape.updateBounds();
            this.tempShape = null;
        }

        const pt = this.viewport.getCanvasPoint(e);
        
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
            const sx = this.tempShape.x + this.tempShape.width;
            const sy = this.tempShape.y + this.tempShape.height / 2;
            this.prototype.updateDragLine(this.tempLinkNode, sx, sy, pt.x, pt.y);
            // Highlight frame under cursor
            const hoverTarget = this.getShapeFromNode(e.target);
            this.shapes.forEach(s => {
                if (s.node) s.node.classList.remove('proto-drop-target-hover');
            });
            if (hoverTarget && this.prototype.isValidTarget(hoverTarget, this.tempShape.id)) {
                hoverTarget.node.classList.add('proto-drop-target-hover');
            }
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
            this.selection.smartGuides = [];
            
            if (this.selectedIds.length === 1 && !e.altKey && !this.isResizing) {
                const me = this.getShapeById(this.selectedIds[0]);
                if (me && !me.groupId) {
                    const threshold = 5 / this.viewport.transform.scale;
                    let bX = null, bY = null, mX = Infinity, mY = Infinity;
                    const mcX = me.x + dx + me.width/2; const mcY = me.y + dy + me.height/2;
                    this.shapes.forEach(t => {
                        if(t.id === me.id || t.type === 'group' || t.isHidden || t.groupId) return;
                        const tcX = t.x + t.width/2; const tcY = t.y + t.height/2;
                        if(Math.abs(mcX - tcX) < threshold && Math.abs(mcX - tcX) < mX) {
                            mX = Math.abs(mcX - tcX); bX = tcX - me.width/2 - me.x;
                            this.selection.smartGuides = this.selection.smartGuides.filter(g => g.type!=='v');
                            this.selection.smartGuides.push({type:'v', pos:tcX, start:Math.min(me.y, t.y), end:Math.max(me.y+me.height, t.y+t.height)});
                        }
                        if(Math.abs(mcY - tcY) < threshold && Math.abs(mcY - tcY) < mY) {
                            mY = Math.abs(mcY - tcY); bY = tcY - me.height/2 - me.y;
                            this.selection.smartGuides = this.selection.smartGuides.filter(g => g.type!=='h');
                            this.selection.smartGuides.push({type:'h', pos:tcY, start:Math.min(me.x, t.x), end:Math.max(me.x+me.width, t.x+t.width)});
                        }
                    });
                    if(bX !== null) snapDx = bX; if(bY !== null) snapDy = bY;
                }
            }
            
            const moveShapeRecursive = (shapeId, dx, dy) => {
                const shape = this.getShapeById(shapeId);
                if (!shape) return;
                if (shape.type === 'group' || shape.type === 'frame') {
                    this.shapes.filter(c => c.groupId === shapeId).forEach(c => moveShapeRecursive(c.id, dx, dy));
                }
                shape.x += dx; shape.y += dy;
                this.updateShapeNode(shape);
            };

            this.selectedIds.forEach(id => {
                const shape = this.getShapeById(id);
                if (!shape) return;
                
                moveShapeRecursive(id, snapDx, snapDy);
                
                if (shape.groupId) {
                    const parent = this.getShapeById(shape.groupId);
                    if (parent && parent.isAutoLayout) this.autoLayout.apply(parent);
                } else this.autoLayout.triggerPass(shape);
            });
            this.updateUI();
        } else if (this.isResizing && this.selectedIds.length === 1) {
            const shape = this.getShapeById(this.selectedIds[0]);
            const dx = pt.x - this.dragStart.x; const dy = pt.y - this.dragStart.y;
            this.dragStart = pt;
            
            const oldW = shape.width; const oldH = shape.height;
            const oldX = shape.x; const oldY = shape.y;

            if (this.activeHandle.includes('r')) shape.width += dx;
            if (this.activeHandle.includes('l')) { shape.width -= dx; shape.x += dx; }
            if (this.activeHandle.includes('b')) shape.height += dy;
            if (this.activeHandle.includes('t')) { shape.height -= dy; shape.y += dy; }
            shape.width = Math.max(1, shape.width); shape.height = Math.max(1, shape.height);

            // Scale children if it's a group
            if (shape.type === 'group' || shape.type === 'frame') {
                const scaleX = shape.width / oldW;
                const scaleY = shape.height / oldH;
                this.shapes.filter(s => s.groupId === shape.id).forEach(c => {
                    c.x = shape.x + (c.x - oldX) * scaleX;
                    c.y = shape.y + (c.y - oldY) * scaleY;
                    c.width *= scaleX;
                    c.height *= scaleY;
                    this.updateShapeNode(c);
                });
            }

            this.updateShapeNode(shape);
            if (shape.isAutoLayout) this.autoLayout.apply(shape);
            this.updateUI();
        }
    }

    onPointerUp(e) {
        if (this.isPanning) { this.isPanning = false; document.body.style.cursor = 'default'; }
        if (this.isRubberbanding) {
            this.isRubberbanding = false;
            const pt = this.viewport.getCanvasPoint(e);
            let w = pt.x - this.dragStart.x; let h = pt.y - this.dragStart.y;
            const rx = w < 0 ? pt.x : this.dragStart.x; const ry = h < 0 ? pt.y : this.dragStart.y;
            w = Math.abs(w); h = Math.abs(h);
            const newSel = [];
            this.shapes.forEach(sh => {
                if (sh.isHidden || sh.isLocked) return;
                if (sh.x < rx+w && sh.x+sh.width > rx && sh.y < ry+h && sh.y+sh.height > ry && !sh.groupId && sh.type !== 'group') newSel.push(sh.id);
                else if (sh.type === 'group' && sh.x < rx+w && sh.x+sh.width > rx && sh.y < ry+h && sh.y+sh.height > ry) newSel.push(sh.id);
            });
            this.selectedIds = e.shiftKey ? [...new Set([...this.selectedIds, ...newSel])] : newSel;
            if (this.rubberbandBox) this.rubberbandBox.remove();
            this.fireSelectionChange(); this.updateUI();
        } else if (this.isDrawingLink) {
            const target = this.getShapeFromNode(e.target);
            if (target && this.prototype.isValidTarget(target, this.tempShape.id)) {
                this.prototype.addLink(this.tempShape.id, target.id, 'click', 'slide-left');
            }
            if (this.tempLinkNode) this.tempLinkNode.remove();
            this.prototype.unhighlightFrames();
            this.isDrawingLink = false; this.tempShape = null; this.prototype.render(); this.saveState();
        } else if (this.isDrawing) {
            this.isDrawing = false;
            if (this.tempShape.width < 5 && this.tempShape.height < 5 && this.tempShape.type !== 'text' && this.tempShape.type !== 'path') this.deleteShapeObj(this.tempShape.id);
            else {
                const tCx = this.tempShape.x + this.tempShape.width/2; const tCy = this.tempShape.y + this.tempShape.height/2;
                const container = [...this.shapes].reverse().find(s => (s.type === 'frame' || s.type === 'group') && s.id !== this.tempShape.id && !s.isHidden && !s.isLocked && tCx >= s.x && tCx <= s.x + s.width && tCy >= s.y && tCy <= s.y + s.height);
                if (container) this.tempShape.groupId = container.id;
                this.selectedIds = [this.tempShape.id]; 
                
                // Visual Pulse for creation
                if (this.tempShape.node) {
                    this.tempShape.node.classList.add('creation-pulse');
                    setTimeout(() => this.tempShape.node.classList.remove('creation-pulse'), 1500);
                }

                if (this.tempShape.type === 'frame') {
                    this.setTool('select');
                    if (this.callbacks.onToolChange) this.callbacks.onToolChange('select');
                }

                this.fireSelectionChange(); this.updateUI();
                if (this.tempShape.type === 'text') this.callbacks.onDoubleClickText(this.tempShape, e);
                this.callbacks.onSceneChange(); this.saveState();
            }
            this.tempShape = null;
        } else if (this.isDragging) {
            // Drag-to-nest logic
            this.selectedIds.forEach(id => {
                const shape = this.getShapeById(id);
                if (!shape || shape.type === 'group' || shape.type === 'frame') return;
                
                const tCx = shape.x + shape.width/2; const tCy = shape.y + shape.height/2;
                const container = [...this.shapes].reverse().find(s => s.type === 'frame' && s.id !== shape.id && !s.isHidden && !s.isLocked && tCx >= s.x && tCx <= s.x + s.width && tCy >= s.y && tCy <= s.y + s.height);
                
                if (container) {
                    shape.groupId = container.id;
                    if (container.isAutoLayout) this.autoLayout.apply(container);
                } else if (shape.groupId) {
                    const oldParent = this.getShapeById(shape.groupId);
                    delete shape.groupId;
                    if (oldParent && oldParent.isAutoLayout) this.autoLayout.apply(oldParent);
                }
            });
            this.callbacks.onSceneChange(); this.saveState();
        } else if (this.isResizing) {
            this.callbacks.onSceneChange(); this.saveState();
        }
        this.isDragging = false; this.isResizing = false; this.activeHandle = null; this.selection.smartGuides = [];
        this.updateUI();
    }
}
