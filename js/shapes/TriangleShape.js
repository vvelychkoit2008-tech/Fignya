class TriangleShape extends BaseShape {
    constructor(params) {
        super(params);
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
        const p1 = `${this.x + this.width / 2},${this.y}`;
        const p2 = `${this.x + this.width},${this.y + this.height}`;
        const p3 = `${this.x},${this.y + this.height}`;
        this.node.setAttribute('points', `${p1} ${p2} ${p3}`);
    }
}
