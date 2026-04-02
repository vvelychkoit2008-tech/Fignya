class PathShape extends BaseShape {
    constructor(params) {
        super(params);
        this.d = params.d || `M ${this.x} ${this.y}`;
    }

    render(svg) {
        this.node = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        this.node.setAttribute('data-id', this.id);
        this.node.classList.add('shape');
        svg.appendChild(this.node);
        this.update();
    }

    update() {
        super.update();
        if (!this.node) return;
        this.node.setAttribute('d', this.d);
    }
}
