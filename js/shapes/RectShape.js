class RectShape extends BaseShape {
    constructor(params) {
        super(params);
        this.cornerRadius = params.cornerRadius || 0;
    }

    render(svg) {
        this.node = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        this.node.setAttribute('data-id', this.id);
        this.node.classList.add('shape');
        svg.appendChild(this.node);
        this.update();
    }

    update() {
        super.update();
        if (!this.node) return;
        this.node.setAttribute('x', this.x);
        this.node.setAttribute('y', this.y);
        this.node.setAttribute('width', this.width);
        this.node.setAttribute('height', this.height);
        this.node.setAttribute('rx', this.cornerRadius);
        this.node.setAttribute('ry', this.cornerRadius);
    }
}
