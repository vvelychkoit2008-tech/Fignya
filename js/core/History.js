class HistoryManager {
    constructor(engine) {
        this.engine = engine;
        this.history = [];
        this.historyIndex = -1;
        this.isRestoring = false;
        this.maxStates = 50;
    }

    save() {
        if (this.isRestoring) return;
        const state = this.engine.exportJSON();
        // Avoid saving identical states (e.g. on repeated selection events)
        if (this.historyIndex >= 0 && this.history[this.historyIndex] === state) return;

        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }
        this.history.push(state);
        this.historyIndex++;
        if (this.history.length > this.maxStates) {
            this.history.shift();
            this.historyIndex--;
        }
        // Notify StorageManager of state change for auto-save
        if (this.engine.callbacks.onStateChange) {
            this.engine.callbacks.onStateChange();
        }
    }

    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.restore();
        }
    }

    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.restore();
        }
    }

    restore() {
        this.isRestoring = true;
        this.engine.loadJSON(this.history[this.historyIndex]);
        this.isRestoring = false;
    }
}
