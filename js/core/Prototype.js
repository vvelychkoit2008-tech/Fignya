class PrototypeManager {
    constructor(engine, svg, ui) {
        this.engine = engine;
        this.svg = svg;
        this.ui = ui;
        this.links = [];
        this.selectedLinkId = null;
        this.hoveredShapeId = null;
    }

    // ═══════════════════════════════════════════
    //  LINK CRUD
    // ═══════════════════════════════════════════

    addLink(sourceId, targetId, trigger = 'click', animation = 'slide-left') {
        // Don't add duplicate links from same source
        const existing = this.links.find(l => l.sourceId === sourceId);
        if (existing) {
            existing.targetId = targetId;
            existing.trigger = trigger;
            existing.animation = animation;
        } else {
            this.links.push({
                id: this.engine.generateId(),
                sourceId,
                targetId,
                trigger,
                animation
            });
        }
        this.render();
        this.engine.saveState();
    }

    removeLink(linkId) {
        this.links = this.links.filter(l => l.id !== linkId);
        if (this.selectedLinkId === linkId) this.selectedLinkId = null;
        this.render();
        this.engine.saveState();
    }

    removeLinkBySource(sourceId) {
        this.links = this.links.filter(l => l.sourceId !== sourceId);
        this.render();
    }

    getLinkBySource(sourceId) {
        return this.links.find(l => l.sourceId === sourceId);
    }

    selectLink(linkId) {
        this.selectedLinkId = linkId;
        this.render();
    }

    deselectLink() {
        this.selectedLinkId = null;
        this.render();
    }

    getStartFrame() {
        // First frame in the shapes array is the start frame
        return this.engine.shapes.find(s => s.type === 'frame');
    }

    // ═══════════════════════════════════════════
    //  RENDERING — ARROWS & HANDLES
    // ═══════════════════════════════════════════

    render() {
        // Clean up all prototype visual nodes
        this.svg.querySelectorAll('.proto-link-node').forEach(n => n.remove());
        this.ui.querySelectorAll('.proto-handle, .proto-link-label, .proto-link-delete, .proto-start-badge').forEach(n => n.remove());

        if (this.engine.mode !== 'prototype') return;

        // Ensure arrowhead marker exists
        this._ensureMarker();

        // Render start frame badge
        this._renderStartBadge();

        // Render connection handles on all shapes
        this._renderConnectionHandles();

        // Render all link arrows
        this.links.forEach(link => {
            this._renderLinkArrow(link);
        });
    }

    _ensureMarker() {
        // Normal arrowhead marker  
        if (!this.svg.querySelector('#proto-arrowhead')) {
            const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            
            const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
            marker.id = 'proto-arrowhead';
            marker.setAttribute('markerWidth', '12');
            marker.setAttribute('markerHeight', '8');
            marker.setAttribute('refX', '11');
            marker.setAttribute('refY', '4');
            marker.setAttribute('orient', 'auto');
            marker.setAttribute('markerUnits', 'userSpaceOnUse');
            const head = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            head.setAttribute('points', '0 0, 12 4, 0 8');
            head.setAttribute('fill', '#0A84FF');
            marker.appendChild(head);
            defs.appendChild(marker);

            // Selected arrowhead
            const markerSel = marker.cloneNode(true);
            markerSel.id = 'proto-arrowhead-selected';
            markerSel.querySelector('polygon').setAttribute('fill', '#30D158');
            defs.appendChild(markerSel);

            this.svg.insertBefore(defs, this.svg.firstChild);
        }
    }

    _renderStartBadge() {
        const startFrame = this.getStartFrame();
        if (!startFrame) return;

        const badge = document.createElement('div');
        badge.className = 'proto-start-badge';
        badge.textContent = '▶ Start';
        badge.style.position = 'absolute';
        badge.style.left = startFrame.x + 'px';
        badge.style.top = (startFrame.y - 28) + 'px';
        badge.style.pointerEvents = 'none';
        this.ui.appendChild(badge);
    }

    _renderConnectionHandles() {
        const shapes = this.engine.shapes.filter(s => 
            !s.isHidden && !s.isLocked && s.type !== 'group'
        );

        shapes.forEach(shape => {
            const hasLink = this.links.some(l => l.sourceId === shape.id);
            
            // Right-side connection handle (Figma-style blue circle)
            const handle = document.createElement('div');
            handle.className = `proto-handle ${hasLink ? 'has-link' : ''}`;
            handle.dataset.sourceId = shape.id;
            handle.style.position = 'absolute';
            handle.style.left = (shape.x + shape.width) + 'px';
            handle.style.top = (shape.y + shape.height / 2) + 'px';
            handle.style.pointerEvents = 'auto';

            // Tooltip
            if (hasLink) {
                const link = this.getLinkBySource(shape.id);
                const target = this.engine.getShapeById(link.targetId);
                handle.title = `→ ${target ? target.name || target.type : 'deleted'}`;
            } else {
                handle.title = 'Перетягніть для з\'єднання';
            }

            this.ui.appendChild(handle);
        });
    }

    _renderLinkArrow(link) {
        const sShape = this.engine.getShapeById(link.sourceId);
        const tShape = this.engine.getShapeById(link.targetId);
        if (!sShape || !tShape) return;

        const isSelected = link.id === this.selectedLinkId;

        // Source: right edge center
        const sx = sShape.x + sShape.width;
        const sy = sShape.y + sShape.height / 2;
        // Target: left edge center
        const tx = tShape.x;
        const ty = tShape.y + tShape.height / 2;

        // Calculate control points for a nice bezier curve
        const dx = Math.abs(tx - sx);
        const controlDist = Math.max(dx * 0.5, 80);

        const pathD = `M ${sx} ${sy} C ${sx + controlDist} ${sy}, ${tx - controlDist} ${ty}, ${tx} ${ty}`;

        // Arrow path
        const pathNode = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathNode.setAttribute('class', `proto-link-arrow proto-link-node ${isSelected ? 'selected' : ''}`);
        pathNode.setAttribute('d', pathD);
        pathNode.setAttribute('marker-end', `url(#proto-arrowhead${isSelected ? '-selected' : ''})`);
        pathNode.dataset.linkId = link.id;

        // Fat invisible hitbox for clicking
        const hitbox = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        hitbox.setAttribute('class', 'proto-link-hitbox proto-link-node');
        hitbox.setAttribute('d', pathD);
        hitbox.dataset.linkId = link.id;
        hitbox.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectLink(link.id);
            this.engine.selectedIds = [];
            this.engine.updateUI();
            this.engine.fireSelectionChange();
        });

        this.svg.appendChild(hitbox);
        this.svg.appendChild(pathNode);

        // Link label (target frame name) at midpoint
        const midX = (sx + tx) / 2;
        const midY = (sy + ty) / 2 - 16;
        const targetName = tShape.name || tShape.type || 'Frame';

        const label = document.createElement('div');
        label.className = `proto-link-label proto-link-node ${isSelected ? 'selected' : ''}`;
        label.style.position = 'absolute';
        label.style.left = midX + 'px';
        label.style.top = midY + 'px';
        label.innerHTML = `
            <span class="proto-label-trigger">${this._getTriggerIcon(link.trigger)}</span>
            <span class="proto-label-text">→ ${this._escapeHtml(targetName)}</span>
        `;
        label.dataset.linkId = link.id;
        label.style.pointerEvents = 'auto';
        label.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectLink(link.id);
            this.engine.selectedIds = [];
            this.engine.updateUI();
            this.engine.fireSelectionChange();
        });
        this.ui.appendChild(label);

        // Delete button (only when selected)
        if (isSelected) {
            const delBtn = document.createElement('div');
            delBtn.className = 'proto-link-delete';
            delBtn.style.position = 'absolute';
            delBtn.style.left = (midX + 60) + 'px';
            delBtn.style.top = midY + 'px';
            delBtn.innerHTML = '✕';
            delBtn.title = 'Видалити зв\'язок';
            delBtn.style.pointerEvents = 'auto';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeLink(link.id);
            });
            this.ui.appendChild(delBtn);
        }
    }

    _getTriggerIcon(trigger) {
        const icons = {
            'click': '👆',
            'hover': '🖱',
            'drag': '↕',
            'timer': '⏱'
        };
        return icons[trigger] || '👆';
    }

    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }

    // ═══════════════════════════════════════════
    //  INTERACTION — DRAWING LINKS
    // ═══════════════════════════════════════════

    /** Create a visible dragging line on the SVG canvas */
    createDragLine() {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        line.setAttribute('class', 'proto-drag-line proto-link-node');
        line.setAttribute('marker-end', 'url(#proto-arrowhead)');
        this.svg.appendChild(line);
        return line;
    }

    /** Update the dragging line path */
    updateDragLine(line, sx, sy, ex, ey) {
        const dx = Math.abs(ex - sx);
        const controlDist = Math.max(dx * 0.5, 40);
        const pathD = `M ${sx} ${sy} C ${sx + controlDist} ${sy}, ${ex - controlDist} ${ey}, ${ex} ${ey}`;
        line.setAttribute('d', pathD);
    }

    /** Check if a shape can be a valid drop target (must be a frame) */
    isValidTarget(shape, sourceId) {
        if (!shape) return false;
        if (shape.id === sourceId) return false;
        // Target should be a frame (like Figma — you navigate between frames)
        return shape.type === 'frame';
    }

    /** Highlight valid drop targets */
    highlightFrames(sourceId) {
        this.engine.shapes.forEach(s => {
            if (s.type === 'frame' && s.node) {
                s.node.classList.add('proto-drop-target');
            }
        });
    }

    /** Remove frame highlights */
    unhighlightFrames() {
        this.engine.shapes.forEach(s => {
            if (s.node) {
                s.node.classList.remove('proto-drop-target', 'proto-drop-target-hover');
            }
        });
    }
}
