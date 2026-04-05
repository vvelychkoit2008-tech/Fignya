class TextShape extends BaseShape {
    constructor(params) {
        super(params);
        this.text = params.text || 'Новий текст';
        this.fontSize = params.fontSize || 16;
        this.fontWeight = params.fontWeight || 400;
        this.fontFamily = params.fontFamily || 'Inter, sans-serif';
    }

    render(svg) {
        this.node = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        this.node.setAttribute('data-id', this.id);
        this.node.classList.add('shape');
        this.node.setAttribute('dominant-baseline', 'text-before-edge');
        svg.appendChild(this.node);
        this.update();
    }

    update() {
        if (!this.node) return;
        super.update();
        this.node.setAttribute('x', this.x);
        this.node.setAttribute('y', this.y);
        this.node.textContent = this.text;
        this.node.setAttribute('font-size', (this.fontSize || 16) + 'px');
        this.node.setAttribute('font-weight', this.fontWeight || 400);
        this.node.setAttribute('font-family', this.fontFamily || 'Inter, sans-serif');
        this.node.setAttribute('pointer-events', 'visiblePainted');
        this.node.style.cursor = 'text';
    }
}
