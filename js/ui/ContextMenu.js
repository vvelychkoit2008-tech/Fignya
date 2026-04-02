class ContextMenuManager {
    constructor(engine) {
        this.engine = engine;
        this.node = document.getElementById('context-menu');
        this.init();
    }

    init() {
        document.addEventListener('contextmenu', (e) => {
            const isCanvas = e.target.closest('#canvas-container');
            const isLayers = e.target.closest('#layers-list');
            if (!isCanvas && !isLayers) return;

            e.preventDefault();
            const target = e.target.closest('.shape, .layer-item');
            if (target) {
                const id = target.getAttribute('data-id');
                if (id && !this.engine.selectedIds.includes(id)) {
                    this.engine.selectedIds = [id];
                    this.engine.updateUI();
                }
            }
            this.show(e.clientX, e.clientY);
        });

        document.addEventListener('click', () => this.hide());
        
        this.node.querySelectorAll('.cm-item').forEach(item => {
            item.addEventListener('click', () => {
                const action = item.dataset.action;
                this.handleAction(action);
                this.hide();
            });
        });
    }

    show(x, y) {
        this.node.classList.remove('hidden');
        this.node.style.left = x + 'px';
        this.node.style.top = y + 'px';
        requestAnimationFrame(() => {
            this.node.classList.add('visible');
        });
    }

    hide() {
        this.node.classList.remove('visible');
        setTimeout(() => {
            if (!this.node.classList.contains('visible')) {
                this.node.classList.add('hidden');
            }
        }, 150);
    }

    handleAction(action) {
        switch(action) {
            case 'copy': this.engine.clipboard.copy(); break;
            case 'paste': this.engine.clipboard.paste(); break;
            case 'duplicate': this.engine.clipboard.duplicate(); break;
            case 'delete': this.engine.deleteSelected(); break;
            case 'group': this.engine.groupSelected(); break;
            case 'ungroup': this.engine.ungroupSelected(); break;
            case 'lock': this.engine.toggleLockSelected(); break;
            case 'hide': this.engine.toggleHideSelected(); break;
            case 'forward': this.engine.bringForward(); break;
            case 'backward': this.engine.sendBackward(); break;
        }
        this.engine.updateUI();
    }
}
