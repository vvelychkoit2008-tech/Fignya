class ViewportManager {
    constructor(engine, svg, ui, wrapper) {
        this.engine = engine;
        this.svg = svg;
        this.ui = ui;
        this.wrapper = wrapper;
        this.pixelGrid = document.getElementById('pixel-grid');
        this.rulerTop = document.getElementById('ruler-top');
        this.rulerLeft = document.getElementById('ruler-left');
        this.zoomLevelLabel = document.getElementById('zoom-level');

        this.transform = { x: 0, y: 0, scale: 1 };
        this.targetTransform = { x: 0, y: 0, scale: 1 };
        this.isAnimating = false;
    }

    update(force = false) {
        if (force) {
            this.wrapper.style.transform = `translate(${this.transform.x}px, ${this.transform.y}px) scale(${this.transform.scale})`;
            this.wrapper.style.setProperty('--zoom-scale', this.transform.scale);
            if (this.transform.scale > 8) this.pixelGrid?.classList.remove('display-none');
            else this.pixelGrid?.classList.add('display-none');
            if (this.zoomLevelLabel) this.zoomLevelLabel.textContent = Math.round(this.transform.scale * 100) + '%';
            this.drawRulers();
        }
    }

    pan(dx, dy) {
        this.targetTransform.x += dx;
        this.targetTransform.y += dy;
        this.animate();
    }

    zoom(newScale, mouseX, mouseY) {
        newScale = Math.min(Math.max(0.05, newScale), 50);
        const ratio = 1 - newScale / this.targetTransform.scale;
        this.targetTransform.x += (mouseX - this.targetTransform.x) * ratio;
        this.targetTransform.y += (mouseY - this.targetTransform.y) * ratio;
        this.targetTransform.scale = newScale;
        this.animate();
    }

    animate() {
        if (this.isAnimating) return;
        this.isAnimating = true;
        const loop = () => {
            const dx = this.targetTransform.x - this.transform.x;
            const dy = this.targetTransform.y - this.transform.y;
            const ds = this.targetTransform.scale - this.transform.scale;

            if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(ds) < 0.001) {
                this.transform.x = this.targetTransform.x;
                this.transform.y = this.targetTransform.y;
                this.transform.scale = this.targetTransform.scale;
                this.isAnimating = false;
                this.update(true);
                return;
            }

            this.transform.x += dx * 0.25;
            this.transform.y += dy * 0.25;
            this.transform.scale += ds * 0.25;
            this.update(true);
            requestAnimationFrame(loop);
        };
        loop();
    }

    drawRulers() {
        if (!this.rulerTop || !this.rulerLeft) return;
        const wt = this.rulerTop.width = this.rulerTop.parentElement.clientWidth;
        const ht = this.rulerTop.height = 16;
        const wl = this.rulerLeft.width = 16;
        const hl = this.rulerLeft.height = this.rulerLeft.parentElement.clientHeight;
        
        const ctxTop = this.rulerTop.getContext('2d');
        const ctxLeft = this.rulerLeft.getContext('2d');
        
        ctxTop.clearRect(0, 0, wt, ht); ctxTop.fillStyle = '#98989D'; ctxTop.font = '9px Inter';
        ctxLeft.clearRect(0, 0, wl, hl); ctxLeft.fillStyle = '#98989D'; ctxLeft.font = '9px Inter';

        const baseVisualDist = 100 * this.transform.scale;
        let logicalStep = 100;
        if (baseVisualDist < 30) logicalStep = 500;
        if (baseVisualDist < 10) logicalStep = 1000;
        if (baseVisualDist < 2) logicalStep = 5000;
        if (baseVisualDist > 500) logicalStep = 10;
        if (baseVisualDist > 2000) logicalStep = 1;

        const visualStep = logicalStep * this.transform.scale;
        
        const offsetX = this.transform.x % visualStep;
        const startValX = -Math.floor(this.transform.x / visualStep) * logicalStep;
        for(let i = 0; i < wt + visualStep; i += visualStep) {
            const x = i + offsetX;
            const val = startValX + (i / visualStep) * logicalStep;
            ctxTop.fillRect(x, 10, 1, 6);
            if (x > -10 && x < wt) ctxTop.fillText(val, x + 2, 9);
        }
        
        const offsetY = this.transform.y % visualStep;
        const startValY = -Math.floor(this.transform.y / visualStep) * logicalStep;
        ctxLeft.save();
        ctxLeft.translate(0, hl); ctxLeft.rotate(-Math.PI/2);
        for(let i = 0; i < hl + visualStep; i += visualStep) {
            const y = i - offsetY; 
            const val = startValY + Math.floor((hl - i) / visualStep) * logicalStep + logicalStep; 
            ctxLeft.fillRect(y, -16, 1, 6);
            if (y > -10 && y < hl) ctxLeft.fillText(val, y + 2, -1);
        }
        ctxLeft.restore();
    }

    getCanvasPoint(e) {
        const rect = this.wrapper.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / this.transform.scale,
            y: (e.clientY - rect.top) / this.transform.scale
        };
    }
}
