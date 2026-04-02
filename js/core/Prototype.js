class PrototypeManager {
    constructor(engine, svg, ui) {
        this.engine = engine;
        this.svg = svg;
        this.ui = ui;
        this.links = [];
    }

    render() {
        this.ui.querySelectorAll('.proto-link-node').forEach(n => n.remove());
        if (this.engine.mode !== 'prototype') return;

        this.links.forEach(link => {
            const sShape = this.engine.getShapeById(link.sourceId);
            const tShape = this.engine.getShapeById(link.targetId);
            if (!sShape || !tShape) return;
            const sx = sShape.x + sShape.width/2; const sy = sShape.y + sShape.height/2;
            const tx = tShape.x + tShape.width/2; const ty = tShape.y + tShape.height/2;

            const pathNode = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            pathNode.setAttribute('class', 'arrow-line proto-link-node');
            pathNode.setAttribute('d', `M ${sx} ${sy} Q ${(sx+tx)/2} ${(sy+ty)/2-50} ${tx} ${ty}`);
            
            const id = 'arrowhead';
            if (!document.getElementById(id)) {
                this.createMarker(id);
            }
            pathNode.setAttribute('marker-end', `url(#${id})`);
            this.svg.appendChild(pathNode); 
        });
    }

    createMarker(id) {
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        marker.id = id;
        marker.setAttribute('markerWidth', '10'); marker.setAttribute('markerHeight', '7');
        marker.setAttribute('refX', '10'); marker.setAttribute('refY', '3.5');
        marker.setAttribute('orient', 'auto');
        const head = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        head.setAttribute('points', '0 0, 10 3.5, 0 7');
        head.setAttribute('class', 'arrow-head');
        marker.appendChild(head); this.svg.appendChild(marker);
    }
}
