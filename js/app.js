document.addEventListener('DOMContentLoaded', () => {
    const engineContainer = {
        svg: document.getElementById('canvas-svg'),
        ui: document.getElementById('ui-layer'),
        wrapper: document.getElementById('canvas-wrapper')
    };

    const engine = new FihnyaEngine(engineContainer.svg, engineContainer.ui, engineContainer.wrapper);

    const ui = {
        toolBtns: document.querySelectorAll('.tool-btn'),
        modeBtns: document.querySelectorAll('.mode-btn'),
        layersList: document.getElementById('layers-list'),
        propsPanel: document.getElementById('properties-panel'),
        btnExport: document.getElementById('btn-export'),
        btnPlay: document.getElementById('btn-play'),
        exportModal: document.getElementById('export-modal'),
        closeModal: document.querySelector('.close-modal'),
        btnExpJson: document.getElementById('exp-json'),
        btnImpJson: document.getElementById('imp-json'),
        btnExpPng: document.getElementById('exp-png'),
        btnExpJpg: document.getElementById('exp-jpg'),
        btnExpSvg: document.getElementById('exp-svg'),
        prototypePlayer: document.getElementById('prototype-player'),
        closePlayer: document.querySelector('.close-player'),
        playerStage: document.getElementById('player-stage'),
        imageUpload: document.getElementById('image-upload'),
        
        cm: document.getElementById('context-menu'),
        cmBringForward: document.getElementById('cm-bring-forward'),
        cmSendBackward: document.getElementById('cm-send-backward'),
        cmGroup: document.getElementById('cm-group'),
        cmUngroup: document.getElementById('cm-ungroup'),
        cmAutoLayout: document.getElementById('cm-auto-layout'),
        cmCopy: document.getElementById('cm-copy'),
        cmPaste: document.getElementById('cm-paste'),
        cmDuplicate: document.getElementById('cm-duplicate'),
        cmLock: document.getElementById('cm-lock'),
        cmHide: document.getElementById('cm-hide'),
        cmDelete: document.getElementById('cm-delete')
    };

    ui.toolBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tool = btn.dataset.tool;
            if (tool === 'image') { ui.imageUpload.click(); return; }
            ui.toolBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            engine.setTool(tool);
        });
    });

    ui.imageUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const img = new Image();
                img.onload = () => {
                    const cx = (-engine.targetTransform.x + window.innerWidth/2) / engine.targetTransform.scale - img.width/2;
                    const cy = (-engine.targetTransform.y + window.innerHeight/2) / engine.targetTransform.scale - img.height/2;
                    engine.addImageShape(cx, cy, ev.target.result, img.width, img.height);
                    ui.toolBtns.forEach(b => b.classList.remove('active'));
                    ui.toolBtns[0].classList.add('active');
                    engine.setTool('select');
                };
                img.src = ev.target.result;
            };
            reader.readAsDataURL(file);
        }
    });

    ui.modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            ui.modeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const mode = btn.dataset.mode;
            engine.setMode(mode);
            ui.btnPlay.style.display = mode === 'prototype' ? 'flex' : 'none';
            if (mode === 'prototype') ui.propsPanel.innerHTML = '<div class="empty-state">Режим прототипування. Оберіть фрейм та тягніть зв\'язок.</div>';
            else updatePropertiesPanel(engine.selectedIds);
        });
    });

    // Double Click Text Editing (On-Canvas)
    let activeEditor = null;
    engine.callbacks.onDoubleClickText = (shape, e) => {
        if (activeEditor) return;
        
        // Create editable div
        const editor = document.createElement('div');
        editor.className = 'on-canvas-text-editor';
        editor.contentEditable = true;
        editor.innerText = shape.text;
        
        // Exact visual positioning based on scale
        editor.style.left = (shape.x * engine.transform.scale) + 'px';
        editor.style.top = (shape.y * engine.transform.scale) + 'px';
        editor.style.minWidth = (Math.max(shape.width, 50) * engine.transform.scale) + 'px';
        editor.style.fontSize = (shape.fontSize * engine.transform.scale) + 'px';
        editor.style.fontWeight = shape.fontWeight || 400;
        editor.style.color = shape.fill === 'none' ? '#000' : shape.fill;
        editor.style.transform = `translate(${engine.transform.x}px, ${engine.transform.y}px)`;
        
        document.body.appendChild(editor);
        activeEditor = editor;
        
        shape.node.style.opacity = '0';
        
        editor.focus();
        document.execCommand('selectAll', false, null);
        
        editor.addEventListener('blur', () => {
            shape.text = editor.innerText || 'Новий текст';
            shape.node.style.opacity = '1';
            editor.remove();
            activeEditor = null;
            engine.updateShapeNode(shape);
            engine.saveState();
            updatePropertiesPanel(engine.selectedIds);
            engine.fireSelectionChange(); // trick to resize bbox
        });

        editor.addEventListener('keydown', (ev) => {
            if(ev.key === 'Escape' || (ev.key === 'Enter' && !ev.shiftKey)) {
                ev.preventDefault();
                editor.blur();
            }
        });
    };

    // Context Menu Logic
    engine.callbacks.onContextMenu = (e) => {
        const pt = engine.getCanvasPoint(e);
        let clickedShapeId = null;
        let targetNode = e.target;
        
        if (targetNode.hasAttribute('data-id')) {
            clickedShapeId = targetNode.getAttribute('data-id');
            const sh = engine.getShapeById(clickedShapeId);
            if (!engine.selectedIds.includes(clickedShapeId) && !sh.isLocked && !sh.isHidden) {
                engine.selectedIds = [clickedShapeId];
                engine.updateUI(); engine.fireSelectionChange();
            }
        } else {
            engine.selectedIds = []; engine.updateUI(); engine.fireSelectionChange();
        }

        ui.cm.style.left = `${Math.min(e.clientX, window.innerWidth - 240)}px`;
        ui.cm.style.top = `${Math.min(e.clientY, window.innerHeight - 300)}px`;
        ui.cm.classList.remove('hidden');
        
        // Trigger reflow for animation
        void ui.cm.offsetWidth;
        ui.cm.classList.add('visible');

        const hasSelection = engine.selectedIds.length > 0;
        const isMultiple = engine.selectedIds.length > 1;
        const firstSel = hasSelection ? engine.getShapeById(engine.selectedIds[0]) : null;
        
        ui.cmBringForward.style.display = hasSelection ? 'flex' : 'none';
        ui.cmSendBackward.style.display = hasSelection ? 'flex' : 'none';
        ui.cmCopy.style.display = hasSelection ? 'flex' : 'none';
        ui.cmDuplicate.style.display = hasSelection ? 'flex' : 'none';
        ui.cmDelete.style.display = hasSelection ? 'flex' : 'none';
        ui.cmLock.style.display = hasSelection ? 'flex' : 'none';
        ui.cmHide.style.display = hasSelection ? 'flex' : 'none';
        ui.cmGroup.style.display = isMultiple ? 'flex' : 'none';
        ui.cmUngroup.style.display = (firstSel && firstSel.type === 'group') ? 'flex' : 'none';
        ui.cmAutoLayout.style.display = (firstSel && firstSel.type === 'frame') ? 'flex' : 'none';
        ui.cmPaste.style.display = (engine.clipboard && engine.clipboard.length > 0) ? 'flex' : 'none';
        
        ui.cm.querySelectorAll('.cm-divider').forEach(d => d.style.display = 'block');
    };

    function closeCm() { ui.cm.classList.remove('visible'); setTimeout(() => ui.cm.classList.add('hidden'), 100); }
    document.addEventListener('click', (e) => { if (!ui.cm.contains(e.target)) closeCm(); });

    ui.cmBringForward.onclick = () => { engine.bringForward(); closeCm(); };
    ui.cmSendBackward.onclick = () => { engine.sendBackward(); closeCm(); };
    ui.cmCopy.onclick = () => { engine.copy(); closeCm(); };
    ui.cmPaste.onclick = () => { engine.paste(); closeCm(); };
    ui.cmDuplicate.onclick = () => { engine.duplicateSelected(); closeCm(); };
    ui.cmDelete.onclick = () => { engine.deleteSelected(); closeCm(); };
    ui.cmLock.onclick = () => { engine.toggleLockSelected(); closeCm(); };
    ui.cmHide.onclick = () => { engine.toggleHideSelected(); closeCm(); };
    ui.cmGroup.onclick = () => { engine.groupSelected(); closeCm(); };
    ui.cmUngroup.onclick = () => { engine.ungroupSelected(); closeCm(); };
    ui.cmAutoLayout.onclick = () => {
        if(engine.selectedIds.length === 1) {
            const sh = engine.getShapeById(engine.selectedIds[0]);
            if(sh.type === 'frame') { sh.isAutoLayout = true; engine.applyAutoLayout(sh); engine.saveState(); engine.fireSelectionChange(); }
        }
        closeCm();
    };

    engine.callbacks.onSelectionChange = (selectedIds) => { updatePropertiesPanel(selectedIds); updateLayersPanel(); };
    window.copyCode = (code) => { navigator.clipboard.writeText(code).then(() => { alert('CSS скопійовано!'); }); }

    function generateCSSCode(shape) {
        let code = `/* ${shape.name || shape.type} */\n`;
        code += `position: absolute;\n`;
        code += `left: ${Math.round(shape.x)}px;\n`;
        code += `top: ${Math.round(shape.y)}px;\n`;
        code += `width: ${Math.round(shape.width)}px;\n`;
        code += `height: ${Math.round(shape.height)}px;\n`;
        if (shape.fill && shape.fill !== 'none') code += `background-color: ${shape.fill};\n`;
        if (shape.stroke && shape.stroke !== 'none') code += `border: ${shape.strokeWidth}px solid ${shape.stroke};\n`;
        if (shape.type === 'ellipse') code += `border-radius: 50%;\n`;
        if (shape.isAutoLayout) {
            code += `display: flex;\n`;
            code += `flex-direction: ${shape.layoutDirection === 'horizontal' ? 'row' : 'column'};\n`;
            code += `gap: ${shape.gap}px;\n`;
            code += `padding: ${shape.padding}px;\n`;
        }
        if (shape.type === 'text') {
            code += `font-size: ${shape.fontSize}px;\n`;
            code += `font-weight: ${shape.fontWeight};\n`;
            code += `color: ${shape.fill};\n`;
        }
        return code;
    }

    // Beautiful UI Properties Engine (V4)
    function updatePropertiesPanel(selectedIds) {
        if (engine.mode === 'prototype') return;

        if (selectedIds.length === 0) { ui.propsPanel.innerHTML = '<div class="empty-state">Нічого не вибрано</div>'; return; }

        if (engine.mode === 'inspect') {
            if (selectedIds.length > 1) { ui.propsPanel.innerHTML = '<div class="empty-state">Оберіть лише 1 об\'єкт для Inspect</div>'; return; }
            const shape = engine.getShapeById(selectedIds[0]);
            if (!shape) return;
            
            function buildHTML(sh, indent='') {
                let s = '';
                if (['frame','group','rectangle'].includes(sh.type)) {
                    let cls = '';
                    if (sh.isAutoLayout) cls += ` display:flex; flex-direction:${sh.layoutDirection === 'horizontal'?'row':'column'}; gap:${sh.gap}px; padding:${sh.padding}px; `;
                    if (sh.fill && sh.fill !== 'none') cls += `background:${sh.fill}; `;
                    if (sh.cornerRadius) cls += `border-radius:${sh.cornerRadius}px; `;
                    if (sh.type === 'group') cls += `position:relative; `;
                    
                    s += `${indent}<div style="width:${Math.round(sh.width)}px; height:${Math.round(sh.height)}px; ${cls.trim()}">\n`;
                    const children = engine.shapes.filter(c => c.groupId === sh.id);
                    if (sh.layoutDirection === 'horizontal') children.sort((a,b)=>a.x-b.x);
                    else children.sort((a,b)=>a.y-b.y);
                    children.forEach(c => s += buildHTML(c, indent+'  '));
                    s += `${indent}</div>\n`;
                } else if (sh.type === 'text') {
                    s += `${indent}<span style="color:${sh.fill}; font-size:${sh.fontSize}px; font-weight:${sh.fontWeight};">${sh.text}</span>\n`;
                } else if (sh.type === 'image') {
                    s += `${indent}<img src="image_url" style="width:${Math.round(sh.width)}px; height:${Math.round(sh.height)}px;">\n`;
                } else if (sh.type === 'path') {
                    s += `${indent}<svg viewBox="0 0 ${sh.width} ${sh.height}"><path d="${sh.d}" stroke="${sh.stroke}" fill="${sh.fill}"/></svg>\n`;
                } else { s += `${indent}<!-- SVG Element ${sh.type} -->\n`; }
                return s;
            }

            const htmlCode = buildHTML(shape).trim();
            const cssCode = generateCSSCode(shape).trim();
            const e1 = htmlCode.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/([a-z-]+)=/g, '<span class="code-prop">$1</span>=');
            const e2 = cssCode.replace(/([a-z-]+):/g, '<span class="code-prop">$1</span>:').replace(/:(.+);/g, ':<span class="code-val">$1</span>;');
            
            ui.propsPanel.innerHTML = `
                <div class="prop-section-title">HTML (Flexbox Layout)</div>
                <div class="code-block" style="max-height: 200px; overflow-y:auto; font-size:11px;">${e1}</div>
                <button class="export-opt-btn" style="margin-top:8px; padding:6px; font-size:11px;" id="copy-html-btn">Скопіювати HTML</button>
                <div class="section-divider"></div>
                <div class="prop-section-title">CSS (Абсолютний)</div>
                <div class="code-block" style="max-height: 200px; overflow-y:auto; font-size:11px;">${e2}</div>
                <button class="export-opt-btn" style="margin-top:8px; padding:6px; font-size:11px;" id="copy-css-btn">Скопіювати CSS</button>
            `;
            document.getElementById('copy-html-btn').addEventListener('click', () => window.copyCode(htmlCode));
            document.getElementById('copy-css-btn').addEventListener('click', () => window.copyCode(cssCode));
            return;
        }

        if (selectedIds.length > 1) {
            ui.propsPanel.innerHTML = `
                <div class="prop-section-title">Вирівнювання</div>
                <div class="align-row">
                    <button class="align-btn" data-align="left" title="По лівому краю"><i data-lucide="align-left"></i></button>
                    <button class="align-btn" data-align="center" title="По центру (гориз)"><i data-lucide="align-center-horizontal"></i></button>
                    <button class="align-btn" data-align="right" title="По правому краю"><i data-lucide="align-right"></i></button>
                    <button class="align-btn" data-align="top" title="По верху"><i data-lucide="align-vertical-space-around"></i></button>
                    <button class="align-btn" data-align="middle" title="По центру (верт)"><i data-lucide="align-center-vertical"></i></button>
                    <button class="align-btn" data-align="bottom" title="По низу"><i data-lucide="align-vertical-space-between"></i></button>
                </div>
                <div class="empty-state">Вибрано ${selectedIds.length} об'єктів</div>
            `;
            lucide.createIcons({root: ui.propsPanel});
            ui.propsPanel.querySelectorAll('.align-btn').forEach(btn => btn.addEventListener('click', () => engine.alignSelected(btn.dataset.align)));
            return;
        }

        const shape = engine.getShapeById(selectedIds[0]);
        if (!shape) return;

        let html = `
            <div class="prop-section-title">Layout</div>
            <div class="prop-row">
                <div class="prop-group"><div class="prop-icon">X</div><input type="number" class="prop-input" data-key="x" value="${Math.round(shape.x)}"></div>
                <div class="prop-group"><div class="prop-icon">Y</div><input type="number" class="prop-input" data-key="y" value="${Math.round(shape.y)}"></div>
            </div>
            <div class="prop-row">
                <div class="prop-group"><div class="prop-icon">W</div><input type="number" class="prop-input" data-key="width" value="${Math.round(shape.width)}"></div>
                ${shape.type !== 'text' ? `<div class="prop-group"><div class="prop-icon">H</div><input type="number" class="prop-input" data-key="height" value="${Math.round(shape.height)}"></div>` : ''}
            </div>
            ${['rectangle', 'frame', 'image'].includes(shape.type) ? `
            <div class="prop-row">
                <div class="prop-group" title="Corner Radius"><i data-lucide="square-dashed-bottom" class="prop-icon"></i><input type="number" class="prop-input" data-key="cornerRadius" value="${shape.cornerRadius || 0}"></div>
                <div style="flex:1"></div>
            </div>` : ''}
            <div class="section-divider"></div>
        `;

        if (shape.type === 'frame') {
            html += `
                <div class="prop-section-title" style="color:var(--accent); display:flex; justify-content:space-between;">
                    Auto Layout <input type="checkbox" id="al-toggle" ${shape.isAutoLayout ? 'checked' : ''}>
                </div>
            `;
            if (shape.isAutoLayout) {
                html += `
                <div class="prop-row">
                    <div class="prop-group" title="Direction"><i data-lucide="move" class="prop-icon"></i>
                        <select class="prop-select" id="al-dir" data-key="layoutDirection">
                            <option value="vertical" ${shape.layoutDirection==='vertical'?'selected':''}>▼ Vertical</option>
                            <option value="horizontal" ${shape.layoutDirection==='horizontal'?'selected':''}>▶ Horizontal</option>
                        </select>
                    </div>
                </div>
                <div class="prop-row">
                    <div class="prop-group" title="Gap"><i data-lucide="unfold-horizontal" class="prop-icon"></i><input type="number" class="prop-input" data-key="gap" value="${shape.gap}"></div>
                    <div class="prop-group" title="Padding"><i data-lucide="box" class="prop-icon"></i><input type="number" class="prop-input" data-key="padding" value="${shape.padding}"></div>
                </div>
                `;
            }
            html += `<div class="section-divider"></div>`;
        }

        if (shape.type === 'text') {
            html += `
                <div class="prop-section-title">Text (Double-click Canvas to Edit)</div>
                <div class="prop-row">
                    <div class="prop-group"><i data-lucide="type" class="prop-icon"></i>
                        <select class="prop-select" data-key="fontWeight">
                            <option value="300" ${shape.fontWeight==300?'selected':''}>Light</option>
                            <option value="400" ${shape.fontWeight==400?'selected':''}>Regular</option>
                            <option value="500" ${shape.fontWeight==500?'selected':''}>Medium</option>
                            <option value="600" ${shape.fontWeight==600?'selected':''}>SemiBold</option>
                            <option value="700" ${shape.fontWeight==700?'selected':''}>Bold</option>
                        </select>
                    </div>
                    <div class="prop-group"><i data-lucide="case-sensitive" class="prop-icon"></i><input type="number" class="prop-input" data-key="fontSize" value="${shape.fontSize}"></div>
                </div>
                <div class="section-divider"></div>
            `;
        }

        if (shape.type !== 'image' && shape.type !== 'group') {
            html += `
                <div class="prop-section-title">Fill</div>
                <div class="prop-row">
                    <div class="prop-color">
                        <div class="color-preview" style="background:${shape.fill}">
                            <input type="color" data-key="fill" value="${shape.fill === 'none' ? '#000000' : shape.fill}">
                        </div>
                        <input type="text" class="prop-input" data-key="fill" value="${shape.fill}" style="text-transform:uppercase;">
                    </div>
                </div>
                <div class="section-divider"></div>
                <div class="prop-section-title">Stroke</div>
                <div class="prop-row">
                    <div class="prop-color">
                        <div class="color-preview" style="background:${shape.stroke === 'none' ? 'transparent' : shape.stroke}">
                            <input type="color" data-key="stroke" value="${shape.stroke === 'none' ? '#000000' : shape.stroke}">
                        </div>
                        <input type="text" class="prop-input" data-key="stroke" value="${shape.stroke}" style="text-transform:uppercase; width:70px;">
                    </div>
                    ${shape.stroke !== 'none' ? `<div class="prop-group" style="width:50px"><img src='data:image/svg+xml;utf8,<svg width="12" height="12" viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg"><path d="M1 6H11" stroke="%2398989D" stroke-width="2"/></svg>' class="prop-icon"/><input type="number" class="prop-input" data-key="strokeWidth" value="${shape.strokeWidth}"></div>` : ''}
                </div>
            `;
        }

        ui.propsPanel.innerHTML = html;
        lucide.createIcons({root: ui.propsPanel});

        ui.propsPanel.querySelectorAll('input, select').forEach(input => {
            if(input.id === 'al-toggle') {
                input.addEventListener('change', (e) => {
                    shape.isAutoLayout = e.target.checked;
                    engine.updateSelectedProperty('isAutoLayout', shape.isAutoLayout);
                    updatePropertiesPanel(engine.selectedIds); 
                });
                return;
            }
            input.addEventListener('change', (e) => {
                const key = e.target.dataset.key;
                let val = e.target.value;
                if (key === 'stroke' && val === '') val = 'none';
                engine.updateSelectedProperty(key, val);
                if(e.target.type === 'color') {
                    e.target.parentElement.style.background = val;
                    e.target.parentElement.nextElementSibling.value = val;
                }
            });
        });
    }

    engine.callbacks.onSceneChange = () => {
        updateLayersPanel();
        if (engine.mode === 'design') updatePropertiesPanel(engine.selectedIds);
    };

    function updateLayersPanel() {
        ui.layersList.innerHTML = '';
        // Group tree rendering
        const shapes = [...engine.shapes];
        const roots = shapes.filter(s => !s.groupId);
        
        function renderNode(shape, level) {
            const item = document.createElement('div');
            item.className = 'layer-item';
            if (engine.selectedIds.includes(shape.id)) item.classList.add('selected');
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
            const children = isFolder ? shapes.filter(s => s.groupId === shape.id) : [];
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
                ui.layersList.querySelectorAll('.layer-item').forEach(el => {
                    el.classList.remove('drop-before', 'drop-after', 'drop-inside');
                });
            });
            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                ui.layersList.querySelectorAll('.layer-item').forEach(el => {
                    if (el !== item) el.classList.remove('drop-before', 'drop-after', 'drop-inside');
                });
                const rect = item.getBoundingClientRect();
                const relY = e.clientY - rect.top;
                const isFolder = shape.type === 'group' || shape.type === 'frame';
                let dropPos = 'after';
                if (relY < rect.height * 0.25) dropPos = 'before';
                else if (isFolder && relY < rect.height * 0.75) dropPos = 'inside';
                else dropPos = 'after';
                item.dataset.dropPos = dropPos;
                item.classList.remove('drop-before', 'drop-after', 'drop-inside');
                item.classList.add(`drop-${dropPos}`);
            });
            item.addEventListener('dragleave', () => item.classList.remove('drop-before', 'drop-after', 'drop-inside'));
            item.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                item.classList.remove('drop-before', 'drop-after', 'drop-inside');
                const draggedId = e.dataTransfer.getData('text/plain');
                if (draggedId && draggedId !== shape.id) engine.reorderShape(draggedId, shape.id, item.dataset.dropPos);
            });

            item.addEventListener('click', (e) => {
                // If clicked action button
                const btn = e.target.closest('.layer-action-btn');
                if (btn) {
                    if (btn.dataset.action === 'lock') { shape.isLocked = !shape.isLocked; engine.updateShapeNode(shape); }
                    if (btn.dataset.action === 'hide') { shape.isHidden = !shape.isHidden; engine.updateShapeNode(shape); engine.fireSelectionChange(); }
                    engine.updateUI(); updateLayersPanel(); engine.saveState();
                    return;
                }

                if (e.shiftKey) {
                    if (engine.selectedIds.includes(shape.id)) engine.selectedIds = engine.selectedIds.filter(id => id !== shape.id);
                    else engine.selectedIds.push(shape.id);
                } else {
                    engine.selectedIds = [shape.id];
                }
                engine.activeTool = 'select';
                ui.toolBtns.forEach(b => b.classList.remove('active'));
                ui.toolBtns[0].classList.add('active');
                engine.updateUI(); updateLayersPanel(); updatePropertiesPanel(engine.selectedIds);
            });

            ui.layersList.appendChild(item);

            // Render children
            if (shape.type === 'group' || shape.type === 'frame') {
                const children = shapes.filter(s => s.groupId === shape.id);
                children.forEach(c => renderNode(c, level + 1));
            }
        }
        
        roots.slice().reverse().forEach(root => renderNode(root, 0));
        lucide.createIcons({root: ui.layersList});
    }

    // Global drop zone for layers panel (dropping at the root level)
    ui.layersList.addEventListener('dragover', (e) => e.preventDefault());
    ui.layersList.addEventListener('drop', (e) => {
        e.preventDefault();
        const draggedId = e.dataTransfer.getData('text/plain');
        if (draggedId && e.target === ui.layersList) {
            engine.reorderShape(draggedId, null, 'inside');
        }
    });

    // Export Modals (Preserved)
    ui.btnExport.addEventListener('click', () => ui.exportModal.classList.remove('hidden'));
    ui.closeModal.addEventListener('click', () => ui.exportModal.classList.add('hidden'));

    function downloadFile(content, fileName, type) {
        const a = document.createElement("a");
        const file = new Blob([content], {type: type});
        a.href = URL.createObjectURL(file); 
        a.download = fileName; 
        document.body.appendChild(a);
        a.click(); 
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(a.href), 150);
    }
    ui.btnExpJson.addEventListener('click', () => { downloadFile(engine.exportJSON(), 'fihnya-project.json', 'text/plain'); ui.exportModal.classList.add('hidden'); });
    ui.btnImpJson.addEventListener('change', (e) => {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => { engine.loadJSON(e.target.result); ui.exportModal.classList.add('hidden'); engine.saveState(); };
        reader.readAsText(file);
    });

    function exportToImage(format) {
        const svgClone = engine.svg.cloneNode(true);
        let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
        engine.shapes.forEach(s => {
            if(s.x < minX) minX = s.x; if(s.y < minY) minY = s.y;
            if(s.x+s.width > maxX) maxX = s.x+s.width; if(s.y+s.height > maxY) maxY = s.y+s.height;
        });
        if(minX === Infinity) { minX=0; minY=0; maxX=800; maxY=600; }
        minX-=50; minY-=50; maxX+=50; maxY+=50;
        const w = maxX - minX; const h = maxY - minY;
        svgClone.setAttribute('width', w); svgClone.setAttribute('height', h); svgClone.setAttribute('viewBox', `${minX} ${minY} ${w} ${h}`);
        svgClone.querySelectorAll('.arrow-line, marker, .bbox, .handle, .selection-box').forEach(n => n.remove());

        const svgData = new XMLSerializer().serializeToString(svgClone);
        if (format === 'svg') { downloadFile(svgData, 'fihnya-design.svg', 'image/svg+xml;charset=utf-8'); ui.exportModal.classList.add('hidden'); return; }

        const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d"); const img = new Image();
        const svgBlob = new Blob([svgData], {type: "image/svg+xml;charset=utf-8"});
        const url = URL.createObjectURL(svgBlob);
        
        img.onload = () => {
            if (format === 'jpg') { ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0,0,w,h); }
            ctx.drawImage(img, 0, 0); URL.revokeObjectURL(url);
            const imgURI = canvas.toDataURL(`image/${format === 'jpg' ? 'jpeg' : 'png'}`);
            const a = document.createElement("a"); 
            a.download = `fihnya-design.${format}`; 
            a.href = imgURI; 
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            ui.exportModal.classList.add('hidden');
        };
        img.src = url;
    }

    ui.btnExpSvg.addEventListener('click', () => exportToImage('svg'));
    ui.btnExpPng.addEventListener('click', () => exportToImage('png'));
    ui.btnExpJpg.addEventListener('click', () => exportToImage('jpg'));

    ui.btnPlay.addEventListener('click', () => {
        const firstFrame = engine.shapes.find(s => s.type === 'frame');
        if (!firstFrame) { alert('Створіть хоча б один Фрейм для запуску прототипу.'); return; }
        ui.prototypePlayer.classList.remove('hidden'); openFrame(firstFrame.id);
    });
    ui.closePlayer.addEventListener('click', () => { ui.prototypePlayer.classList.add('hidden'); ui.playerStage.innerHTML = ''; });

    function openFrame(frameId) {
        const frame = engine.getShapeById(frameId); if (!frame) return;
        const svgClone = engine.svg.cloneNode(true);
        svgClone.querySelectorAll('.arrow-line, marker, .bbox, .selection-box').forEach(n => n.remove());
        svgClone.setAttribute('width', frame.width); svgClone.setAttribute('height', frame.height);
        svgClone.setAttribute('viewBox', `${frame.x} ${frame.y} ${frame.width} ${frame.height}`);
        svgClone.style.background = '#FFFFFF';
        
        const frameNode = document.createElement('div'); frameNode.className = 'proto-frame proto-enter';
        frameNode.appendChild(svgClone);

        svgClone.querySelectorAll('.shape').forEach(node => {
            const id = node.getAttribute('data-id'); const link = engine.prototypeLinks.find(l => l.sourceId === id);
            if (link) {
                node.style.cursor = 'pointer';
                node.addEventListener('click', () => {
                    let targetFrameId = link.targetId; const targetShape = engine.getShapeById(link.targetId);
                    if (targetShape && targetShape.type !== 'frame') {
                        const f = engine.shapes.find(s => s.type === 'frame' && targetShape.x >= s.x && targetShape.x <= s.x + s.width && targetShape.y >= s.y && targetShape.y <= s.y + s.height);
                        if (f) targetFrameId = f.id;
                    }
                    if (targetFrameId) {
                        frameNode.classList.remove('proto-active'); frameNode.classList.add('proto-leave');
                        setTimeout(() => frameNode.remove(), 400); openFrame(targetFrameId);
                    }
                });
            }
        });
        ui.playerStage.appendChild(frameNode);
        requestAnimationFrame(() => { frameNode.classList.remove('proto-enter'); frameNode.classList.add('proto-active'); });
    }
});
