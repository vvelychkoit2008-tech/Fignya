class LineShape extends BaseShape {
    constructor(params) {
        super(params);
        this.x1 = params.x1 || this.x;
        this.y1 = params.y1 || this.y;
        this.x2 = params.x2 || (this.x + (this.width || 0));
        this.y2 = params.y2 || (this.y + (this.height || 0));
        this.lineStyle = params.lineStyle || 'straight'; // straight, wavy
        this.amplitude = params.amplitude !== undefined ? params.amplitude : 10;
        this.frequency = params.frequency !== undefined ? params.frequency : 0.05;
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

        // Recalculate width/height from x1,y1,x2,y2
        this.x = Math.min(this.x1, this.x2);
        this.y = Math.min(this.y1, this.y2);
        this.width = Math.max(1, Math.abs(this.x2 - this.x1));
        this.height = Math.max(1, Math.abs(this.y2 - this.y1));

        const d = this.generatePath();
        this.node.setAttribute('d', d);
        
        // Lines MUST have a stroke to be visible. If user set stroke to 'none', we force a subtle one or respect it but it's risky
        // For LineShape, we'll ensure fill is always none and stroke is what's used.
        this.node.setAttribute('fill', 'none');
        if (!this.stroke || this.stroke === 'none') {
            this.node.setAttribute('stroke', '#000000');
            this.node.setAttribute('stroke-width', '1');
        }
        
        this.node.setAttribute('pointer-events', 'visibleStroke');
    }

    generatePath() {
        if (this.lineStyle === 'straight') {
            return `M ${this.x1} ${this.y1} L ${this.x2} ${this.y2}`;
        } else if (this.lineStyle === 'wavy') {
            const dx = this.x2 - this.x1;
            const dy = this.y2 - this.y1;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);
            
            let path = `M ${this.x1} ${this.y1}`;
            const steps = Math.ceil(length); 
            
            for (let i = 0; i <= steps; i++) {
                const dist = i;
                const waveY = Math.sin(dist * this.frequency) * this.amplitude;
                
                // Rotate wave point back to line angle
                const rx = dist * Math.cos(angle) - waveY * Math.sin(angle);
                const ry = dist * Math.sin(angle) + waveY * Math.cos(angle);
                
                path += ` L ${this.x1 + rx} ${this.y1 + ry}`;
            }
            return path;
        }
        return '';
    }

    getExportData() {
        const data = super.getExportData();
        data.x1 = this.x1; data.y1 = this.y1;
        data.x2 = this.x2; data.y2 = this.y2;
        data.lineStyle = this.lineStyle;
        data.amplitude = this.amplitude;
        data.frequency = this.frequency;
        return data;
    }
}
