class BaseShape {
    constructor(params) {
        this.id = params.id;
        this.type = params.type;
        this.x = params.x || 0;
        this.y = params.y || 0;
        this.width = params.width || 0;
        this.height = params.height || 0;
        this.fill = params.fill || '#D9D9D9';
        this.stroke = params.stroke || 'none';
        this.strokeWidth = params.strokeWidth || 1;
        this.opacity = params.opacity !== undefined ? params.opacity : 1;
        this.rotation = params.rotation || 0;
        this.name = params.name || (this.type + ' ' + Math.floor(Math.random() * 100));
        this.isHidden = params.isHidden || false;
        this.isLocked = params.isLocked || false;
        this.groupId = params.groupId || null;
        this.node = null;
    }

    render(svg) {
        // Base render logic (to be overriden)
    }

    update() {
        if (!this.node) return;
        this.node.style.display = this.isHidden ? 'none' : '';
        this.node.style.pointerEvents = this.isLocked ? 'none' : '';
        this.applyCommonAttributes();
    }

    applyCommonAttributes() {
        if (!this.node) return;
        if (this.type !== 'image') {
            this.node.setAttribute('fill', this.fill);
            this.node.setAttribute('stroke', this.stroke);
            this.node.setAttribute('stroke-width', this.strokeWidth);
        }
        // Opacity
        this.node.style.opacity = this.opacity !== undefined ? this.opacity : 1;
        // Rotation
        if (this.rotation) {
            const cx = this.x + this.width / 2;
            const cy = this.y + this.height / 2;
            this.node.setAttribute('transform', `rotate(${this.rotation}, ${cx}, ${cy})`);
        } else {
            this.node.removeAttribute('transform');
        }
        // Clip Path
        if (this.clipPath) {
            this.node.setAttribute('clip-path', this.clipPath);
        } else {
            this.node.removeAttribute('clip-path');
        }
    }

    getExportData() {
        const { node, ...data } = this;
        return data;
    }
}
