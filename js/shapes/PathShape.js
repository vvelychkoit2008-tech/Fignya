class PathShape extends BaseShape {
    constructor(params) {
        super(params);
        this.d = params.d || '';
        this._finalized = params._finalized || false;
    }

    /**
     * Called once when pen drawing ends.
     * Converts absolute coordinates in `d` to relative (local-space),
     * and computes x, y, width, height from the bounding box.
     */
    finalize() {
        if (!this.d || this._finalized) return;

        const commands = [];
        this.d.replace(/([ML])\s*([-+]?[\d.]+)\s+([-+]?[\d.]+)/gi, (m, cmd, x, y) => {
            commands.push({ cmd: cmd.toUpperCase(), x: parseFloat(x), y: parseFloat(y) });
        });

        if (commands.length < 2) {
            this._finalized = true;
            return;
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        commands.forEach(c => {
            minX = Math.min(minX, c.x);
            minY = Math.min(minY, c.y);
            maxX = Math.max(maxX, c.x);
            maxY = Math.max(maxY, c.y);
        });

        this.x = minX;
        this.y = minY;
        this.width = Math.max(1, maxX - minX);
        this.height = Math.max(1, maxY - minY);

        // Store d in local coords (relative to x, y)
        this.d = commands.map(c => `${c.cmd} ${c.x - minX} ${c.y - minY}`).join(' ');
        this._finalized = true;
    }

    render(svg) {
        this.node = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        this.node.setAttribute('data-id', this.id);
        this.node.classList.add('shape');
        svg.appendChild(this.node);
        this.update();
    }

    update() {
        if (!this.node) return;
        super.update();

        if (this._finalized) {
            // After finalization: d is in local coords, use translate for positioning
            this.node.setAttribute('d', this.d);
            const rot = this.rotation || 0;
            let transform = `translate(${this.x}, ${this.y})`;
            if (rot) transform += ` rotate(${rot}, ${this.width / 2}, ${this.height / 2})`;
            this.node.setAttribute('transform', transform);
        } else {
            // During pen drawing: d has absolute coords, render directly
            this.node.setAttribute('d', this.d);
            this.node.removeAttribute('transform');
        }

        // Ensure thin paths (lines) are clickable via a fat invisible stroke
        this.node.setAttribute('pointer-events', 'all');
        if ((this.width === 0 || this.height === 0) && this._finalized) {
            this.node.setAttribute('stroke-width', Math.max(this.strokeWidth || 1, 6));
        }
    }

    getExportData() {
        const data = super.getExportData();
        data._finalized = this._finalized;
        return data;
    }
}
