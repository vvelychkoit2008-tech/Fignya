class FrameShape extends RectShape {
    constructor(params) {
        super(params);
        this.isAutoLayout = params.isAutoLayout || false;
        this.layoutDirection = params.layoutDirection || 'vertical';
        this.gap = params.gap || 10;
        this.padding = params.padding || 10;
    }

    render(svg) {
        super.render(svg);
        if (this.node) this.node.classList.add('frame');
    }
}
