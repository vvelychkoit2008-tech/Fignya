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
        const bbox = svg.getBBox();
        const exportSvg = svg.cloneNode(true);

        const width = bbox.width > 0 ? bbox.width : 100;
        const height = bbox.height > 0 ? bbox.height : 100;
        const pad = format === 'png' ? 20 : 0;
        
        exportSvg.setAttribute('width', width + pad * 2);
        exportSvg.setAttribute('height', height + pad * 2);
        exportSvg.setAttribute('viewBox', `${bbox.x - pad} ${bbox.y - pad} ${width + pad * 2} ${height + pad * 2}`);

        // 1. Inline Styles (CRITICAL for data-url rendering)
        const inlineStyles = (element) => {
            const children = element.querySelectorAll('*');
            [element, ...children].forEach(el => {
                const id = el.getAttribute('data-id');
                if (!id) return;
                const original = document.querySelector(`[data-id="${id}"]`);
                if (original) {
                    const styles = window.getComputedStyle(original);
                    el.style.fill = styles.fill;
                    el.style.stroke = styles.stroke;
                    el.style.strokeWidth = styles.strokeWidth;
                    el.style.opacity = styles.opacity;
                }
            });
        };
        inlineStyles(exportSvg);

        const serializer = new XMLSerializer();
        let source = serializer.serializeToString(exportSvg);
        
        if(!source.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)){
            source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
        }
        if(!source.match(/^<svg[^>]+xmlns:xlink="http:\/\/www\.w3\.org\/1999\/xlink"/)){
            source = source.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
        }

        if (format === 'svg') {
            const blob = new Blob([source], {type: 'image/svg+xml'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'fihnya-export.svg';
            a.click();
            return;
        }

        const img = new Image();
        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(source)));
        
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const scale = 2; // Export at 2x for quality
            canvas.width = (width + pad * 2) * scale;
            canvas.height = (height + pad * 2) * scale;
            const ctx = canvas.getContext('2d');
            ctx.scale(scale, scale);
            
            // Clean transparent background for PNG
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, width + pad * 2, height + pad * 2);
            
            const link = document.createElement('a');
            link.download = `fihnya-export.${format}`;
            link.href = canvas.toDataURL(`image/${format}`, 1.0);
            link.click();
        };
    }
}
