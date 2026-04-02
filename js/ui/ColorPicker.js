class ColorPicker {
    constructor(options = {}) {
        this.onChange = options.onChange || (() => {});
        this.color = this.parseColor(options.color || '#ff0000');
        this.isOpen = false;
        this.initUI();
    }

    parseColor(colorStr) {
        // Simple hex/rgba parser to HSV + Alpha
        let r=0, g=0, b=0, a=1;
        if (colorStr.startsWith('#')) {
            const hex = colorStr.replace('#', '');
            if (hex.length === 3) {
                r = parseInt(hex[0]+hex[0], 16);
                g = parseInt(hex[1]+hex[1], 16);
                b = parseInt(hex[2]+hex[2], 16);
            } else {
                r = parseInt(hex.substring(0, 2), 16);
                g = parseInt(hex.substring(2, 4), 16);
                b = parseInt(hex.substring(4, 6), 16);
                if (hex.length === 8) a = parseInt(hex.substring(6, 8), 16) / 255;
            }
        } else if (colorStr.startsWith('rgb')) {
            const parts = colorStr.match(/[\d.]+/g);
            r = parseInt(parts[0]); g = parseInt(parts[1]); b = parseInt(parts[2]);
            if (parts[3] !== undefined) a = parseFloat(parts[3]);
        } else if (colorStr === 'transparent') {
            return { h: 0, s: 0, v: 0, a: 0 };
        }

        const { h, s, v } = this.rgbToHsv(r, g, b);
        return { h, s, v, a };
    }

    rgbToHsv(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, v = max;
        const d = max - min;
        s = max === 0 ? 0 : d / max;
        if (max === min) {
            h = 0;
        } else {
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return { h, s, v };
    }

    hsvToRgb(h, s, v) {
        let r, g, b;
        const i = Math.floor(h * 6);
        const f = h * 6 - i;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);
        switch (i % 6) {
            case 0: r = v; g = t; b = p; break;
            case 1: r = q; g = v; b = p; break;
            case 2: r = p; g = v; b = t; break;
            case 3: r = p; g = q; b = v; break;
            case 4: r = t; g = p; b = v; break;
            case 5: r = v; g = p; b = q; break;
        }
        return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
    }

    toHex(r, g, b, a) {
        const toHexByte = (val) => val.toString(16).padStart(2, '0');
        let hex = `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;
        if (a < 1) hex += toHexByte(Math.round(a * 255));
        return hex;
    }

    initUI() {
        this.container = document.createElement('div');
        this.container.className = 'custom-color-picker hidden';
        this.container.innerHTML = `
            <div class="cp-saturation-area">
                <div class="cp-saturation-white"></div>
                <div class="cp-saturation-black"></div>
                <div class="cp-cursor"></div>
            </div>
            <div class="cp-controls">
                <div class="cp-previews">
                    <div class="cp-preview-current"></div>
                </div>
                <div class="cp-sliders">
                    <div class="cp-slider-hue"><div class="cp-slider-handle"></div></div>
                    <div class="cp-slider-alpha"><div class="cp-slider-handle"></div></div>
                </div>
            </div>
            <div class="cp-inputs">
                <div class="cp-input-group">
                    <input type="text" class="cp-hex-input" spellcheck="false">
                    <label>HEX</label>
                </div>
                <div class="cp-input-group">
                    <input type="text" class="cp-alpha-input" spellcheck="false">
                    <label>A</label>
                </div>
            </div>
            <div class="cp-swatches">
                ${['#ffffff', '#000000', '#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#cddc39', '#ffeb3b', '#ffc107', '#ff9800', '#ff5722', 'transparent'].map(c => `<div class="cp-swatch" style="background:${c.startsWith('#')?c:'white'}" data-color="${c}"></div>`).join('')}
            </div>
        `;
        document.body.appendChild(this.container);

        this.saturationArea = this.container.querySelector('.cp-saturation-area');
        this.satCursor = this.container.querySelector('.cp-cursor');
        this.hueSlider = this.container.querySelector('.cp-slider-hue');
        this.alphaSlider = this.container.querySelector('.cp-slider-alpha');
        this.hexInput = this.container.querySelector('.cp-hex-input');
        this.alphaInput = this.container.querySelector('.cp-alpha-input');
        this.preview = this.container.querySelector('.cp-preview-current');

        this.initEvents();
    }

    initEvents() {
        // Saturation/Value
        const handleSatMove = (e) => {
            const rect = this.saturationArea.getBoundingClientRect();
            let x = (e.clientX - rect.left) / rect.width;
            let y = (e.clientY - rect.top) / rect.height;
            this.color.s = Math.max(0, Math.min(1, x));
            this.color.v = Math.max(0, Math.min(1, 1 - y));
            this.update();
        };

        this.saturationArea.addEventListener('pointerdown', (e) => {
            handleSatMove(e);
            const move = (ev) => handleSatMove(ev);
            const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
        });

        // Hue
        const handleHueMove = (e) => {
            const rect = this.hueSlider.getBoundingClientRect();
            let x = (e.clientX - rect.left) / rect.width;
            this.color.h = Math.max(0, Math.min(1, x));
            this.update();
        };

        this.hueSlider.addEventListener('pointerdown', (e) => {
            handleHueMove(e);
            const move = (ev) => handleHueMove(ev);
            const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
        });

        // Alpha
        const handleAlphaMove = (e) => {
            const rect = this.alphaSlider.getBoundingClientRect();
            let x = (e.clientX - rect.left) / rect.width;
            this.color.a = Math.max(0, Math.min(1, x));
            this.update();
        };

        this.alphaSlider.addEventListener('pointerdown', (e) => {
            handleAlphaMove(e);
            const move = (ev) => handleAlphaMove(ev);
            const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
        });

        // Inputs
        this.hexInput.addEventListener('change', (e) => {
            let val = e.target.value;
            if (!val.startsWith('#')) val = '#' + val;
            this.color = this.parseColor(val);
            this.update();
        });

        this.alphaInput.addEventListener('change', (e) => {
            let val = parseFloat(e.target.value);
            if (isNaN(val)) val = 100;
            this.color.a = Math.max(0, Math.min(1, val / 100));
            this.update();
        });

        // Swatches
        this.container.querySelector('.cp-swatches').addEventListener('click', (e) => {
            if (e.target.classList.contains('cp-swatch')) {
                this.color = this.parseColor(e.target.dataset.color);
                this.update();
            }
        });

        // Close on outside click
        window.addEventListener('mousedown', (e) => {
            if (this.isOpen && !this.container.contains(e.target) && !this.triggerElement.contains(e.target)) {
                this.close();
            }
        });
    }

    open(triggerElement, currentColor) {
        this.triggerElement = triggerElement;
        this.color = this.parseColor(currentColor);
        this.isOpen = true;
        this.container.classList.remove('hidden');
        this.update(true);

        const rect = triggerElement.getBoundingClientRect();
        this.container.style.left = rect.left + 'px';
        this.container.style.top = (rect.bottom + 8) + 'px';
        
        // Ensure it doesn't go off screen
        const cpRect = this.container.getBoundingClientRect();
        if (cpRect.right > window.innerWidth) this.container.style.left = (window.innerWidth - cpRect.width - 16) + 'px';
        if (cpRect.bottom > window.innerHeight) this.container.style.top = (rect.top - cpRect.height - 8) + 'px';
    }

    close() {
        this.isOpen = false;
        this.container.classList.add('hidden');
    }

    update(skipCallback = false) {
        const { h, s, v, a } = this.color;
        const rgb = this.hsvToRgb(h, s, v);
        const hex = this.toHex(rgb.r, rgb.g, rgb.b, a);
        const pureHueRgb = this.hsvToRgb(h, 1, 1);
        const pureHueHex = this.toHex(pureHueRgb.r, pureHueRgb.g, pureHueRgb.b, 1);

        this.saturationArea.style.backgroundColor = pureHueHex;
        this.satCursor.style.left = (s * 100) + '%';
        this.satCursor.style.top = ((1 - v) * 100) + '%';
        
        this.hueSlider.querySelector('.cp-slider-handle').style.left = (h * 100) + '%';
        this.alphaSlider.querySelector('.cp-slider-handle').style.left = (a * 100) + '%';
        
        this.alphaSlider.style.background = `linear-gradient(to right, transparent, rgb(${rgb.r},${rgb.g},${rgb.b}))`;
        this.preview.style.backgroundColor = hex;
        
        if (document.activeElement !== this.hexInput) this.hexInput.value = hex.toUpperCase();
        if (document.activeElement !== this.alphaInput) this.alphaInput.value = Math.round(a * 100);

        if (!skipCallback) this.onChange(hex);
    }
}
