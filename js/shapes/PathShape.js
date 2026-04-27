class PathShape extends BaseShape {
    constructor(params) {
        super(params);
        this.d = params.d || '';
        this.isDraft = !!params.isDraft;
        this.curveType = params.curveType || 'cubic';
        this.smoothness = params.smoothness !== undefined ? params.smoothness : 0.5;
        this.points = Array.isArray(params.points) ? params.points.map(p => ({
            x: p.x,
            y: p.y,
            handleIn: p.handleIn ? { x: p.handleIn.x, y: p.handleIn.y } : null,
            handleOut: p.handleOut ? { x: p.handleOut.x, y: p.handleOut.y } : null
        })) : [];
        this.previewPoint = params.previewPoint || null;
        this._finalized = params._finalized || false;
        this.rebuildPath();
    }

    /**
     * Called once when pen drawing ends.
     * Converts absolute coordinates in `d` to relative (local-space),
     * and computes x, y, width, height from the bounding box.
     */
    finalize() {
        if (this.points.length < 2 || this._finalized) return;
        this.previewPoint = null;
        this.rebuildPath();
        this.updateBounds();
        this._finalized = true;
        this.isDraft = false;
    }

    addPoint(x, y) {
        this.points.push({
            x,
            y,
            handleIn: null,
            handleOut: null
        });
        this.rebuildPath();
    }

    setPointHandles(index, handleIn, handleOut) {
        const point = this.points[index];
        if (!point) return;
        point.handleIn = handleIn ? { x: handleIn.x, y: handleIn.y } : null;
        point.handleOut = handleOut ? { x: handleOut.x, y: handleOut.y } : null;
        this.rebuildPath();
    }

    setPreviewPoint(point) {
        this.previewPoint = point ? { x: point.x, y: point.y } : null;
        this.rebuildPath();
    }

    movePoint(index, x, y) {
        const point = this.points[index];
        if (!point) return;
        const dx = x - point.x;
        const dy = y - point.y;
        point.x = x;
        point.y = y;
        if (point.handleIn) {
            point.handleIn.x += dx;
            point.handleIn.y += dy;
        }
        if (point.handleOut) {
            point.handleOut.x += dx;
            point.handleOut.y += dy;
        }
        this.rebuildPath();
        this.updateBounds();
    }

    moveHandle(index, handleType, x, y, mirror = false) {
        const point = this.points[index];
        if (!point) return;
        if (handleType === 'in') {
            point.handleIn = { x, y };
            if (mirror) {
                point.handleOut = {
                    x: point.x + (point.x - x),
                    y: point.y + (point.y - y)
                };
            }
        } else {
            point.handleOut = { x, y };
            if (mirror) {
                point.handleIn = {
                    x: point.x + (point.x - x),
                    y: point.y + (point.y - y)
                };
            }
        }
        this.rebuildPath();
        this.updateBounds();
    }

    translate(dx, dy) {
        if (!this.points.length) return;
        this.points.forEach(point => {
            point.x += dx;
            point.y += dy;
            if (point.handleIn) {
                point.handleIn.x += dx;
                point.handleIn.y += dy;
            }
            if (point.handleOut) {
                point.handleOut.x += dx;
                point.handleOut.y += dy;
            }
        });
        this.rebuildPath();
        this.updateBounds();
    }

    scaleToBounds(targetX, targetY, targetW, targetH) {
        if (!this.points.length) return;
        this.updateBounds();
        const baseW = Math.max(this.width, 1);
        const baseH = Math.max(this.height, 1);
        const scaleX = targetW / baseW;
        const scaleY = targetH / baseH;
        this.points.forEach(point => {
            point.x = targetX + (point.x - this.x) * scaleX;
            point.y = targetY + (point.y - this.y) * scaleY;
            if (point.handleIn) {
                point.handleIn.x = targetX + (point.handleIn.x - this.x) * scaleX;
                point.handleIn.y = targetY + (point.handleIn.y - this.y) * scaleY;
            }
            if (point.handleOut) {
                point.handleOut.x = targetX + (point.handleOut.x - this.x) * scaleX;
                point.handleOut.y = targetY + (point.handleOut.y - this.y) * scaleY;
            }
        });
        this.rebuildPath();
        this.updateBounds();
    }

    buildSmoothPath(chain) {
        if (chain.length < 2) return '';
        const t = Math.max(0, Math.min(1, this.smoothness));
        const parts = [`M ${chain[0].x} ${chain[0].y}`];
        for (let i = 0; i < chain.length - 1; i++) {
            const p0 = chain[i - 1] || chain[i];
            const p1 = chain[i];
            const p2 = chain[i + 1];
            const p3 = chain[i + 2] || p2;
            const cp1x = p1.x + ((p2.x - p0.x) / 6) * t;
            const cp1y = p1.y + ((p2.y - p0.y) / 6) * t;
            const cp2x = p2.x - ((p3.x - p1.x) / 6) * t;
            const cp2y = p2.y - ((p3.y - p1.y) / 6) * t;
            parts.push(`C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`);
        }
        return parts.join(' ');
    }

    rebuildPath() {
        if (!this.points.length) {
            this.d = '';
            return;
        }
        const chain = this.previewPoint ? [...this.points, { x: this.previewPoint.x, y: this.previewPoint.y, handleIn: null, handleOut: null }] : this.points;
        if (this.curveType === 'smooth') {
            this.d = this.buildSmoothPath(chain);
            return;
        }
        const parts = [`M ${chain[0].x} ${chain[0].y}`];
        for (let i = 1; i < chain.length; i++) {
            const prev = chain[i - 1];
            const curr = chain[i];
            if (this.curveType === 'line') {
                parts.push(`L ${curr.x} ${curr.y}`);
                continue;
            }
            if (this.curveType === 'quadratic') {
                const q = curr.handleIn || prev.handleOut || { x: (prev.x + curr.x) / 2, y: (prev.y + curr.y) / 2 };
                parts.push(`Q ${q.x} ${q.y} ${curr.x} ${curr.y}`);
                continue;
            }
            const cp1 = prev.handleOut || { x: prev.x, y: prev.y };
            const cp2 = curr.handleIn || { x: curr.x, y: curr.y };
            if (prev.handleOut || curr.handleIn) {
                parts.push(`C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${curr.x} ${curr.y}`);
            } else {
                parts.push(`L ${curr.x} ${curr.y}`);
            }
        }
        this.d = parts.join(' ');
    }

    updateBounds() {
        if (!this.points.length) return;
        const coords = [];
        this.points.forEach(p => {
            coords.push([p.x, p.y]);
            if (p.handleIn) coords.push([p.handleIn.x, p.handleIn.y]);
            if (p.handleOut) coords.push([p.handleOut.x, p.handleOut.y]);
        });
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        coords.forEach(([x, y]) => {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        });
        this.x = minX;
        this.y = minY;
        this.width = Math.max(1, maxX - minX);
        this.height = Math.max(1, maxY - minY);
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

        this.rebuildPath();
        this.node.setAttribute('d', this.d);
        this.node.classList.toggle('path-draft', !!this.isDraft);
        if (this.rotation) {
            const cx = this.x + this.width / 2;
            const cy = this.y + this.height / 2;
            this.node.setAttribute('transform', `rotate(${this.rotation}, ${cx}, ${cy})`);
        } else {
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
        data.points = this.points;
        data.curveType = this.curveType;
        data.smoothness = this.smoothness;
        return data;
    }
}
