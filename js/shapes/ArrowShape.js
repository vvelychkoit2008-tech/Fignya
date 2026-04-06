class ArrowShape extends BaseShape {
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
        
        // Малюємо стрілку, що вказує праворуч в межах виділення
        const tailH = this.height * 0.4; // Товщина хвостика
        const headW = Math.min(this.width * 0.4, this.height); // Ширина самої стрілки (кінчика)
        
        const tailY1 = this.y + (this.height - tailH) / 2;
        const tailY2 = this.y + (this.height + tailH) / 2;
        
        const p1 = `${this.x},${tailY1}`;
        const p2 = `${this.x + this.width - headW},${tailY1}`;
        const p3 = `${this.x + this.width - headW},${this.y}`;
        const p4 = `${this.x + this.width},${this.y + this.height / 2}`;
        const p5 = `${this.x + this.width - headW},${this.y + this.height}`;
        const p6 = `${this.x + this.width - headW},${tailY2}`;
        const p7 = `${this.x},${tailY2}`;
        
        this.node.setAttribute('points', `${p1} ${p2} ${p3} ${p4} ${p5} ${p6} ${p7}`);
    }
}
