class LayersPanelManager {
    constructor(engine, layersList) {
        this.engine = engine;
        this.layersList = layersList;
        this.init();
    }

    init() {
        this.layersList.addEventListener('dragover', (e) => e.preventDefault());
        this.layersList.addEventListener('drop', (e) => {
            e.preventDefault();
            const draggedId = e.dataTransfer.getData('text/plain');
            if (draggedId && e.target === this.layersList) {
                this.engine.reorderShape(draggedId, null, 'inside');
            }
        });
    }

    update() {
        this.layersList.innerHTML = '';
        const shapes = [...this.engine.shapes];
        const roots = shapes.filter(s => !s.groupId);
        
        roots.slice().reverse().forEach(root => this.renderNode(root, 0));
        lucide.createIcons({root: this.layersList});
    }

    renderNode(shape, level) {
        const item = document.createElement('div');
        item.className = 'layer-item';
        if (this.engine.selectedIds.includes(shape.id)) item.classList.add('selected');
        if (shape.isHidden) item.classList.add('hidden-shape');
        
        let icon = 'square';
        if (shape.type === 'frame' && shape.isAutoLayout) icon = 'layout-grid';
        else if (shape.type === 'frame') icon = 'frame';
        else if (shape.type === 'ellipse') icon = 'circle';
        else if (shape.type === 'text') icon = 'type';
        else if (shape.type === 'image') icon = 'image';
        else if (shape.type === 'group') icon = 'layers';
        else if (shape.type === 'path') icon = 'pen-tool';

        let indentHTML = '';
        for(let i=0; i<level; i++) indentHTML += '<div class="layer-indent"></div>';

        const visibilityIcon = shape.isHidden ? 'eye-off' : 'eye';
        const lockIcon = shape.isLocked ? 'lock' : 'unlock';
        
        const isFolder = shape.type === 'group' || shape.type === 'frame';
        const children = isFolder ? this.engine.shapes.filter(s => s.groupId === shape.id) : [];
        const hasChildren = children.length > 0;
        const chevron = isFolder ? `<i data-lucide="chevron-down" style="width:14px; height:14px; opacity:${hasChildren ? 0.7 : 0}; margin-left:4px;"></i>` : '';

        item.innerHTML = `
            ${indentHTML}
            ${chevron}
            <i data-lucide="${icon}" class="layer-icon" style="margin-left:${isFolder ? 4 : 8}px;"></i>
            <span style="flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:12px; margin-left:6px;">${shape.name}</span>
            <div class="layer-actions">
                <button class="layer-action-btn" data-action="lock" title="Lock/Unlock"><i data-lucide="${lockIcon}"></i></button>
                <button class="layer-action-btn" data-action="hide" title="Hide/Show"><i data-lucide="${visibilityIcon}"></i></button>
                <button class="layer-action-btn" data-action="delete" title="Видалити"><i data-lucide="trash-2"></i></button>
            </div>
        `;

        item.setAttribute('draggable', 'true');
        item.dataset.id = shape.id;
        
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', shape.id);
            item.classList.add('dragging');
        });
        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            this.layersList.querySelectorAll('.layer-item').forEach(el => {
                el.classList.remove('drop-before', 'drop-after', 'drop-inside');
            });
        });
        item.addEventListener('dragover', (e) => {
            e.preventDefault(); e.stopPropagation();
            const rect = item.getBoundingClientRect();
            const relY = e.clientY - rect.top;
            const isTargetFolder = shape.type === 'group' || shape.type === 'frame';
            let dropPos = 'after';
            if (relY < rect.height * 0.25) dropPos = 'before';
            else if (isTargetFolder && relY < rect.height * 0.75) dropPos = 'inside';
            else dropPos = 'after';
            item.dataset.dropPos = dropPos;
            this.layersList.querySelectorAll('.layer-item').forEach(el => el.classList.remove('drop-before', 'drop-after', 'drop-inside'));
            item.classList.add(`drop-${dropPos}`);
        });
        item.addEventListener('drop', (e) => {
            e.preventDefault(); e.stopPropagation();
            const draggedId = e.dataTransfer.getData('text/plain');
            if (draggedId && draggedId !== shape.id) this.engine.reorderShape(draggedId, shape.id, item.dataset.dropPos);
        });

        item.addEventListener('click', (e) => {
            const btn = e.target.closest('.layer-action-btn');
            if (btn) {
                if (btn.dataset.action === 'lock') { shape.isLocked = !shape.isLocked; this.engine.updateShapeNode(shape); }
                if (btn.dataset.action === 'hide') { shape.isHidden = !shape.isHidden; this.engine.updateShapeNode(shape); this.engine.fireSelectionChange(); }
                if (btn.dataset.action === 'delete') { this.engine.deleteShapeObj(shape.id); }
                this.engine.fireSelectionChange(); this.engine.updateUI(); this.update(); this.engine.saveState();
                return;
            }
            if (e.ctrlKey || e.metaKey) {
                if (this.engine.selectedIds.includes(shape.id)) this.engine.selectedIds = this.engine.selectedIds.filter(id => id !== shape.id);
                else this.engine.selectedIds.push(shape.id);
            } else if (e.shiftKey) {
                if (this.engine.selectedIds.length > 0) {
                    const lastSelectedId = this.engine.selectedIds[this.engine.selectedIds.length - 1];
                    const visibleItems = Array.from(this.layersList.querySelectorAll('.layer-item'));
                    const p1 = visibleItems.findIndex(el => el.dataset.id === lastSelectedId);
                    const p2 = visibleItems.findIndex(el => el.dataset.id === shape.id);
                    if (p1 !== -1 && p2 !== -1) {
                        const start = Math.min(p1, p2);
                        const end = Math.max(p1, p2);
                        for (let i = start; i <= end; i++) {
                            const addId = visibleItems[i].dataset.id;
                            if (!this.engine.selectedIds.includes(addId)) this.engine.selectedIds.push(addId);
                        }
                    } else {
                        if (!this.engine.selectedIds.includes(shape.id)) this.engine.selectedIds.push(shape.id);
                    }
                } else {
                    this.engine.selectedIds = [shape.id];
                }
            } else {
                this.engine.selectedIds = [shape.id];
            }
            this.engine.fireSelectionChange(); this.engine.updateUI();
        });

        this.layersList.appendChild(item);

        if (shape.type === 'group' || shape.type === 'frame') {
            const children = this.engine.shapes.filter(s => s.groupId === shape.id);
            children.slice().reverse().forEach(c => this.renderNode(c, level + 1));
        }
    }
}
