class EllipseShape extends BaseShape {
    render(svg) {
        this.node = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        this.node.setAttribute('data-id', this.id);
        this.node.classList.add('shape');
        svg.appendChild(this.node);
        this.update();
    }

    update() {
        super.update();
        if (!this.node) return;
        const cx = Number(this.x) + Number(this.width) / 2;
        const cy = Number(this.y) + Number(this.height) / 2;
        const rx = Math.abs(Number(this.width) / 2);
        const ry = Math.abs(Number(this.height) / 2);
        
        this.node.setAttribute('cx', cx);
        this.node.setAttribute('cy', cy);
        this.node.setAttribute('rx', rx);
        this.node.setAttribute('ry', ry);
    }
}
