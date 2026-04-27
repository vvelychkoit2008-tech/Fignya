class ExportManager {
    constructor(engine) {
        this.engine = engine;
    }

    exportJSON() {
        const data = this.engine.exportJSON();
        const blob = new Blob([data], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'fihnya-project.json';
        a.click();
    }

    exportToImage(format = 'png') {
        const svg = document.getElementById('canvas-svg');
        const serializer = new XMLSerializer();
        let source = serializer.serializeToString(svg);
        
        // Ensure namespaces
        if(!source.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)){
            source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
        }
        if(!source.match(/^<svg[^>]+xmlns:xlink="http:\/\/www\.w3\.org\/1999\/xlink"/)){
            source = source.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
        }

        if (format === 'svg') {
            const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
            const link = document.createElement('a');
            link.download = 'fihnya-export.svg';
            link.href = URL.createObjectURL(blob);
            link.click();
            return;
        }

        const img = new Image();
        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(source)));
        
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const bbox = svg.getBBox();
            canvas.width = bbox.width + 100;
            canvas.height = bbox.height + 100;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 50 - bbox.x, 50 - bbox.y);
            
            const link = document.createElement('a');
            link.download = `fihnya-export.${format}`;
            link.href = canvas.toDataURL(`image/${format}`, 1.0);
            link.click();
        };
    }
}
