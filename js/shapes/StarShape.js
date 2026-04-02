class StarShape extends BaseShape {
    constructor(params) {
        super(params);
        this.points = params.points || 5;
        this.innerRadiusRatio = params.innerRadiusRatio || 0.4;
    }

    render(svg) {
        this.node = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        this.node.setAttribute('data-id', this.id);
        this.node.classList.add('shape');
        svg.appendChild(this.node);
        this.update();
    }

    update() {
        super.update();
        if (!this.node) return;
        this.points = Math.max(3, parseFloat(this.points) || 5);
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const rx = this.width / 2;
        const ry = this.height / 2;
        const pts = [];
        const numPoints = this.points * 2;
        for (let i = 0; i < numPoints; i++) {
            const angle = (i * Math.PI) / this.points - Math.PI / 2;
            const r = i % 2 === 0 ? 1 : this.innerRadiusRatio;
            pts.push(`${cx + rx * r * Math.cos(angle)},${cy + ry * r * Math.sin(angle)}`);
        }
        this.node.setAttribute('points', pts.join(' '));
    }
}
