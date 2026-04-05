document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Engine
    const svg = document.getElementById('canvas-svg');
    const uiOverlay = document.getElementById('ui-layer');
    const wrapper = document.getElementById('canvas-wrapper');
    const engine = new FihnyaEngine(svg, uiOverlay, wrapper);

    // 2. Initialize UI Managers
    const toolbar = new ToolbarManager(
        engine, 
        document.querySelectorAll('.tool-btn'), 
        document.querySelectorAll('.mode-btn'), 
        document.getElementById('btn-play')
    );
    const layersPanel = new LayersPanelManager(engine, document.getElementById('layers-list'));
    const propertiesPanel = new PropertiesPanelManager(engine, document.getElementById('properties-panel'));
    const contextMenu = new ContextMenuManager(engine);
    const exportManager = new ExportManager(engine);
    const prototypePlayer = new PrototypePlayer(engine);
    const themeManager = new ThemeManager();

    // 3. Connect Engine Callbacks to UI
    engine.callbacks.onSelectionChange = () => {
        const selected = engine.selectedIds.map(id => engine.getShapeById(id));
        layersPanel.update();
        propertiesPanel.update();
        if (selected.length > 0) {
            toolbar.updateFromSelection(selected[selected.length - 1]);
        }
        toolbar.updateContextualToolbar(selected);
    };

    propertiesPanel.onUpdate = () => {
        const selected = engine.selectedIds.map(id => engine.getShapeById(id));
        if (selected.length > 0) {
            toolbar.updateFromSelection(selected[selected.length - 1]);
        }
    };

    engine.callbacks.onSceneChange = () => {
        layersPanel.update();
        propertiesPanel.update();
    };

    engine.callbacks.onPropertyChange = (shape, key, value) => {
        if (key === 'fill' || key === 'stroke') {
            toolbar.updateFromSelection(shape);
        }
        propertiesPanel.updateValues(shape);
        toolbar.updateContextualToolbar(engine.selectedIds.map(id => engine.getShapeById(id)));
    };

    engine.callbacks.onDoubleClickText = (shape, e) => {
        startTextEditing(shape, e);
    };

    engine.callbacks.onContextMenu = (e) => {
        contextMenu.show(e.clientX, e.clientY);
    };

    engine.callbacks.onToolChange = (tool) => {
        if (tool === 'image') {
            toolbar.imageUpload.click();
            return;
        }
        toolbar.toolBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === tool);
        });
    };

    // 4. Global UI Listeners
    document.getElementById('btn-export-png').onclick = () => exportManager.exportToImage('png');
    document.getElementById('btn-export-svg').onclick = () => exportManager.exportToImage('svg');
    document.getElementById('btn-export-json').onclick = () => exportManager.exportJSON();
    document.getElementById('btn-import-json').onclick = () => document.getElementById('import-input').click();
    
    document.getElementById('import-input').onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => engine.loadJSON(ev.target.result);
            reader.readAsText(file);
        }
    };

    document.getElementById('btn-play').onclick = () => prototypePlayer.start();

    // 5. Special UI: Text Editing logic (kept here or can be moved to dedicated manager)
    function startTextEditing(shape, e) {
        const editor = document.createElement('textarea');
        editor.className = 'on-canvas-text-editor';
        const rect = shape.node.getBoundingClientRect();
        
        editor.style.left = shape.x + 'px';
        editor.style.top = shape.y + 'px';
        editor.style.width = Math.max(shape.width, 100) + 'px';
        editor.style.height = Math.max(shape.height, 40) + 'px';
        editor.style.fontSize = (shape.fontSize || 16) + 'px';
        editor.style.color = shape.fill;
        editor.value = shape.text;

        uiOverlay.appendChild(editor);
        editor.focus();
        editor.select();

        const finish = () => {
            shape.text = editor.value;
            engine.updateShapeNode(shape);
            editor.remove();
            engine.saveState();
            engine.updateUI();
            layersPanel.update();
            propertiesPanel.update();
        };

        editor.onblur = finish;
        editor.onkeydown = (ev) => {
            if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); finish(); }
            if (ev.key === 'Escape') { editor.remove(); }
        };
    }

    // Zoom Controls
    document.getElementById('btn-zoom-in').addEventListener('click', () => {
        const cx = window.innerWidth / 2; const cy = window.innerHeight / 2;
        engine.viewport.zoom(engine.viewport.targetTransform.scale * 1.25, cx, cy);
    });
    document.getElementById('btn-zoom-out').addEventListener('click', () => {
        const cx = window.innerWidth / 2; const cy = window.innerHeight / 2;
        engine.viewport.zoom(engine.viewport.targetTransform.scale / 1.25, cx, cy);
    });
    document.getElementById('zoom-level').addEventListener('click', () => {
        const cx = window.innerWidth / 2; const cy = window.innerHeight / 2;
        engine.viewport.zoom(1, cx, cy);
    });

    // Export Controls (Local Backend)
    const btnExportPng = document.getElementById('btn-export-png');
    if (btnExportPng) btnExportPng.addEventListener('click', () => exportManager.exportToImage('png'));
    
    const btnExportSvg = document.getElementById('btn-export-svg');
    if (btnExportSvg) btnExportSvg.addEventListener('click', () => exportManager.exportToImage('svg'));
    
    const btnExportJson = document.getElementById('btn-export-json');
    if (btnExportJson) btnExportJson.addEventListener('click', () => exportManager.exportJSON());

    const btnImportJson = document.getElementById('btn-import-json');
    const inputImport = document.getElementById('import-input');
    if (btnImportJson && inputImport) {
        btnImportJson.addEventListener('click', () => inputImport.click());
        inputImport.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                engine.loadJSON(ev.target.result);
                layersPanel.update();
                propertiesPanel.update();
                engine.history.save();
            };
            reader.readAsText(file);
            inputImport.value = ''; // Reset
        });
    }

    // Initial render
    layersPanel.update();
    propertiesPanel.update();
    lucide.createIcons();
});
