class ToolbarManager {
    constructor(engine, toolBtns, modeBtns, btnPlay) {
        this.engine = engine;
        this.toolBtns = toolBtns;
        this.modeBtns = modeBtns;
        this.btnPlay = btnPlay;
        this.imageUpload = document.getElementById('image-upload');
        this.colorPicker = new ColorPicker({
            onChange: (hex) => {
                if (this.activeColorType === 'fill') {
                    this.engine.defaultStyle.fill = hex;
                    document.getElementById('preview-default-fill').style.background = hex;
                    if (this.engine.selectedIds.length > 0) this.engine.updateSelectedProperty('fill', hex);
                } else if (this.activeColorType === 'stroke') {
                    this.engine.defaultStyle.stroke = hex;
                    document.getElementById('preview-default-stroke').style.background = hex;
                    if (this.engine.selectedIds.length > 0) this.engine.updateSelectedProperty('stroke', hex);
                }
            }
        });
        this.activeColorType = null;
        this.init();
    }

    init() {
        this.toolBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tool = btn.dataset.tool;
                if (tool === 'image') { this.imageUpload.click(); return; }
                this.setActiveTool(btn);
                this.engine.setTool(tool);
                if (tool === 'triangle' || tool === 'star') {
                    // Force refresh contextual toolbar if needed
                }
            });
        });

        this.modeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.setActiveMode(btn);
                const mode = btn.dataset.mode;
                this.engine.setMode(mode);
                this.btnPlay.style.display = mode === 'prototype' ? 'flex' : 'none';
                this.updateProtoHelper(mode === 'prototype');
                this.engine.fireSelectionChange();
            });
        });

        // Quick Actions
        document.getElementById('btn-undo').onclick = () => this.engine.undo();
        document.getElementById('btn-redo').onclick = () => this.engine.redo();
        document.getElementById('btn-group-cmd').onclick = () => this.engine.groupSelected();
        document.getElementById('btn-ungroup-cmd').onclick = () => this.engine.ungroupSelected();
        document.getElementById('btn-delete-cmd').onclick = () => this.engine.deleteSelected();

        this.imageUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const img = new Image();
                    img.onload = () => {
                        const cx = (-this.engine.viewport.targetTransform.x + window.innerWidth/2) / this.engine.viewport.targetTransform.scale - img.width/2;
                        const cy = (-this.engine.viewport.targetTransform.y + window.innerHeight/2) / this.engine.viewport.targetTransform.scale - img.height/2;
                        this.engine.addImageShape(cx, cy, ev.target.result, img.width, img.height);
                        this.setActiveTool(this.toolBtns[0]);
                        this.engine.setTool('select');
                    };
                    img.src = ev.target.result;
                };
                reader.readAsDataURL(file);
            }
        });

        // Default Styles (Paint-style)
        this.previewFill = document.getElementById('preview-default-fill');
        this.previewStroke = document.getElementById('preview-default-stroke');
        this.defaultStrokeWidth = document.getElementById('input-default-stroke-width');
        
        if (this.previewFill) {
            this.previewFill.addEventListener('click', () => {
                this.activeColorType = 'fill';
                this.colorPicker.open(this.previewFill, this.engine.defaultStyle.fill);
            });
        }
        if (this.previewStroke) {
            this.previewStroke.addEventListener('click', () => {
                this.activeColorType = 'stroke';
                this.colorPicker.open(this.previewStroke, this.engine.defaultStyle.stroke);
            });
        }
        if (this.defaultStrokeWidth) {
            this.defaultStrokeWidth.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value) || 1;
                this.engine.defaultStyle.strokeWidth = val;
                if (this.engine.selectedIds.length > 0) {
                    this.engine.updateSelectedProperty('strokeWidth', val);
                }
            });
        }
    }

    updateProtoHelper(visible) {
        let helper = document.getElementById('proto-helper');
        if (visible) {
            if (!helper) {
                helper = document.createElement('div');
                helper.id = 'proto-helper';
                helper.className = 'proto-helper-panel';
                helper.innerHTML = `
                    <div class="ph-title"><i data-lucide="info"></i> Як працює прототипування</div>
                    <div class="ph-step">1. Виберіть об'єкт, який буде "кнопкою"</div>
                    <div class="ph-step">2. Затисніть та тягніть синю лінію до іншого фрейму</div>
                    <div class="ph-step">3. Натисніть Play у верхньому правому куті</div>
                `;
                document.body.appendChild(helper);
                lucide.createIcons({root: helper});
            }
            helper.classList.remove('hidden');
        } else if (helper) {
            helper.classList.add('hidden');
        }
    }

    updateFromSelection(shape) {
        if (!shape) return;
        if (this.previewFill && shape.fill) {
            this.previewFill.style.background = shape.fill;
            this.engine.defaultStyle.fill = shape.fill;
        }
        if (this.previewStroke && shape.stroke) {
            this.previewStroke.style.background = shape.stroke;
            this.engine.defaultStyle.stroke = shape.stroke;
        }
        if (this.defaultStrokeWidth && shape.strokeWidth !== undefined) {
            this.defaultStrokeWidth.value = shape.strokeWidth;
            this.engine.defaultStyle.strokeWidth = shape.strokeWidth;
        }
    }

    setActiveTool(btn) {
        this.toolBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }

    setActiveMode(btn) {
        this.modeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }

    updateContextualToolbar(shapes) {
        const container = document.getElementById('contextual-toolbar');
        if (!container) return;

        if (!shapes || shapes.length === 0) {
            container.classList.add('hidden');
            container.innerHTML = '';
            return;
        }

        container.classList.remove('hidden');
        container.innerHTML = '';

        // Case: Multi-selection alignment (if needed)
        if (shapes.length > 1) {
            this.renderMultiSelectContext(container, shapes);
            return;
        }

        const shape = shapes[0];
        this.renderSingleSelectContext(container, shape);
        lucide.createIcons({root: container});
    }

    renderSingleSelectContext(container, shape) {
        // Group 1: Geometry basics
        const geoGroup = document.createElement('div');
        geoGroup.className = 'ctx-tool-group';
        
        if (shape.type === 'rectangle' || shape.type === 'frame') {
            geoGroup.innerHTML += `
                <i data-lucide="corner-up-right" style="width:12px;opacity:0.6" title="Радіус кутів"></i>
                <input type="number" class="ctx-input" value="${shape.cornerRadius || 0}" data-key="cornerRadius">
            `;
        }

        if (shape.type === 'text') {
            geoGroup.innerHTML += `
                <i data-lucide="type" style="width:12px;opacity:0.6" title="Розмір тексту"></i>
                <input type="number" class="ctx-input" value="${shape.fontSize || 16}" data-key="fontSize">
                <select class="ctx-select" data-key="fontWeight">
                    <option value="400" ${shape.fontWeight == 400 ? 'selected' : ''}>Regular</option>
                    <option value="600" ${shape.fontWeight == 600 ? 'selected' : ''}>Bold</option>
                </select>
            `;
        }

        if (shape.type === 'star') {
            geoGroup.innerHTML += `
                <i data-lucide="star" style="width:12px;opacity:0.6" title="Кількість променів"></i>
                <input type="number" class="ctx-input" value="${shape.points || 5}" data-key="points" min="3" max="20">
            `;
        }

        container.appendChild(geoGroup);

        if (geoGroup.childNodes.length > 0) {
            const divider = document.createElement('div');
            divider.className = 'ctx-divider';
            container.appendChild(divider);
        }

        // Group 2: Fill & Stroke (if applicable)
        const styleGroup = document.createElement('div');
        styleGroup.className = 'ctx-tool-group';
        if (shape.type !== 'image' && shape.type !== 'group' && shape.type !== 'path') {
             styleGroup.innerHTML += `
                <i data-lucide="move-horizontal" style="width:12px;opacity:0.6" title="Товщина контуру"></i>
                <input type="number" class="ctx-input" value="${shape.strokeWidth || 0}" data-key="strokeWidth" min="0">
            `;
        }
        container.appendChild(styleGroup);

        // Add Event Listeners
        container.querySelectorAll('input, select').forEach(el => {
            el.addEventListener('input', (e) => {
                const key = el.dataset.key;
                let val = e.target.value;
                if (el.type === 'number') val = parseFloat(val);
                this.engine.updateSelectedProperty(key, val);
            });
        });
    }

    renderMultiSelectContext(container, shapes) {
        container.innerHTML = `<span style="font-size:11px;opacity:0.6">${shapes.length} об'єктів вибрано</span>`;
    }
}
