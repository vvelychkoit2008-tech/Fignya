class ClipboardManager {
    constructor(engine) {
        this.engine = engine;
        this.clipboard = null;
    }

    copy() {
        if (this.engine.selectedIds.length === 0) return;
        this.clipboard = this.engine.selectedIds.map(id => {
            const shape = this.engine.getShapeById(id);
            const {node, ...rest} = shape;
            return JSON.parse(JSON.stringify(rest));
        });
    }

    paste(px=50, py=50) {
        if (!this.clipboard || this.clipboard.length === 0) return;
        const newIds = [];
        this.clipboard.forEach(clipShape => {
            const newShape = this.engine.createShapeByType(clipShape);
            newShape.id = this.engine.generateId(); 
            newShape.x += px; 
            newShape.y += py;
            if (newShape.name) newShape.name += ' (Копія)';
            this.engine.shapes.push(newShape);
            this.engine.renderShape(newShape);
            newIds.push(newShape.id);
        });
        
        // Offset clipboard for next paste
        this.clipboard.forEach(s => { s.x += 20; s.y += 20; });
        this.engine.selectedIds = newIds;
        this.engine.fireSelectionChange();
        this.engine.updateUI();
        this.engine.saveState();
        this.engine.callbacks.onSceneChange();
    }

    duplicate() {
        this.copy();
        this.paste();
    }
}
