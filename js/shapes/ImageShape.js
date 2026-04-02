class ImageShape extends BaseShape {
    constructor(params) {
        super(params);
        this.src = params.src || '';
    }

    render(svg) {
        this.node = document.createElementNS('http://www.w3.org/2000/svg', 'image');
        this.node.setAttribute('data-id', this.id);
        this.node.classList.add('shape');
        this.node.setAttribute('preserveAspectRatio', 'none');
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
        this.node.setAttribute('href', this.src);
    }
}
