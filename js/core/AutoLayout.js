class AutoLayoutManager {
    constructor(engine) {
        this.engine = engine;
    }

    triggerPass(child) {
        const frames = this.engine.shapes.filter(s => s.type === 'frame' && s.isAutoLayout);
        frames.forEach(f => {
            if (child.id !== f.id && child.x >= f.x - 20 && child.y >= f.y - 20 && child.x <= f.x+f.width+20 && child.y <= f.y+f.height+20) {
                this.apply(f);
            }
        });
    }

    apply(frame) {
        if (!frame.isAutoLayout) return;
        // Include both basic shapes AND groups/frames as children
        const children = this.engine.shapes.filter(s => s.groupId === frame.id && !s.isHidden);
        if (children.length === 0) return;
        
        const padding = frame.padding || 0;
        const gap = frame.gap || 0;
        let cx = frame.x + padding;
        let cy = frame.y + padding;
        let maxW = 0, maxH = 0;

        // Sort children by position before applying layout
        if (frame.layoutDirection === 'vertical') children.sort((a,b) => a.y - b.y);
        else children.sort((a,b) => a.x - b.x);

        children.forEach(c => {
            c.x = cx; c.y = cy;
            if (frame.layoutDirection === 'vertical') {
                cy += c.height + gap;
                if (c.width > maxW) maxW = c.width;
            } else {
                cx += c.width + gap;
                if (c.height > maxH) maxH = c.height;
            }
            this.engine.updateShapeNode(c);
        });
        
        const targetW = frame.layoutDirection === 'vertical' ? maxW + padding*2 : cx - frame.x - gap + padding;
        const targetH = frame.layoutDirection === 'vertical' ? cy - frame.y - gap + padding : maxH + padding*2;
        
        // Auto-sizing Frame
        frame.width = Math.max(20, targetW);
        frame.height = Math.max(20, targetH);
        
        this.engine.updateShapeNode(frame);
    }
}
