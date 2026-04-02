class AutoLayoutManager {
    constructor(engine) {
        this.engine = engine;
    }

    triggerPass(child) {
        const frames = this.engine.shapes.filter(s => s.type === 'frame' && s.isAutoLayout);
        frames.forEach(f => {
            if (child.x >= f.x - 50 && child.y >= f.y - 50 && child.x <= f.x+f.width+50 && child.y <= f.y+f.height+50) {
                this.apply(f);
            }
        });
    }

    apply(frame) {
        if (!frame.isAutoLayout) return;
        const children = this.engine.shapes.filter(s => s.groupId === frame.id && !s.isHidden && s.type !== 'group');
        if (children.length === 0) return;
        
        let cx = frame.x + frame.padding;
        let cy = frame.y + frame.padding;
        let maxW = 0, maxH = 0;

        // Dynamic Sorting for Reordering (Figma style)
        if (frame.layoutDirection === 'vertical') children.sort((a,b) => a.y - b.y);
        else children.sort((a,b) => a.x - b.x);

        children.forEach(c => {
            c.x = cx; c.y = cy;
            if (frame.layoutDirection === 'vertical') {
                cy += c.height + frame.gap;
                if (c.width > maxW) maxW = c.width;
            } else {
                cx += c.width + frame.gap;
                if (c.height > maxH) maxH = c.height;
            }
            this.engine.updateShapeNode(c);
        });
        
        const targetW = frame.layoutDirection === 'vertical' ? maxW + frame.padding*2 : cx - frame.x - frame.gap + frame.padding;
        const targetH = frame.layoutDirection === 'vertical' ? cy - frame.y - frame.gap + frame.padding : maxH + frame.padding*2;
        
        // Size constraints
        frame.width = Math.max(frame.width, targetW);
        frame.height = Math.max(frame.height, targetH);
        
        if (frame.layoutDirection === 'vertical') frame.height = targetH;
        else frame.width = targetW;

        this.engine.updateShapeNode(frame);
    }
}
