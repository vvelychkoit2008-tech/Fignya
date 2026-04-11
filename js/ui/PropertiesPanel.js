class PropertiesPanelManager {
    constructor(engine, propertiesContent) {
        this.engine = engine;
        this.propertiesContent = propertiesContent;
        this.inputs = {}; // Cache for inputs to update values without re-rendering
        this.activeInput = null;
        this.onUpdate = null;
        this.colorPicker = new ColorPicker({
            onChange: (hex) => {
                if (this.activeColorKey) {
                    this.engine.updateSelectedProperty(this.activeColorKey, hex);
                    const group = document.querySelector(`.color-prop-group-${this.activeColorKey}`);
                    if (group) {
                        const preview = group.querySelector('.color-preview');
                        if (preview) preview.style.background = hex;
                        const textInp = group.querySelector('input[type="text"]');
                        if (textInp) textInp.value = hex;
                    }
                    if (this.onUpdate) this.onUpdate();
                }
            }
        });
        this.activeColorKey = null;
    }

    update() {
        if (this.activeInput) return; // Don't re-render while user is typing

        this.propertiesContent.innerHTML = '';
        this.inputs = {};

        if (this.engine.selectedIds.length === 0) {
            this.propertiesContent.innerHTML = '<div class="empty-state">Оберіть об\'єкт для редагування</div>';
            return;
        }

        const shape = this.engine.getShapeById(this.engine.selectedIds[this.engine.selectedIds.length - 1]);
        if (!shape) return;

        if (this.engine.mode === 'inspect') {
            this.renderInspectProperties(shape);
        } else {
            this.renderShapeProperties(shape);
        }
    }

    renderInspectProperties(shape) {
        this.addSectionTitle('CSS Властивості');
        const codeBlock = document.createElement('div');
        codeBlock.className = 'code-block';
        
        let css = `/* ${shape.type} */\n`;
        css += `position: absolute;\n`;
        css += `left: ${Math.round(shape.x)}px;\n`;
        css += `top: ${Math.round(shape.y)}px;\n`;
        css += `width: ${Math.round(shape.width)}px;\n`;
        css += `height: ${Math.round(shape.height)}px;\n`;
        
        if (shape.fill && shape.fill !== 'none') css += `background-color: ${shape.fill};\n`;
        if (shape.stroke && shape.stroke !== 'none') css += `border: ${shape.strokeWidth || 1}px solid ${shape.stroke};\n`;
        if (shape.cornerRadius) css += `border-radius: ${shape.cornerRadius}px;\n`;
        
        if (shape.type === 'text') {
            css += `font-size: ${shape.fontSize || 16}px;\n`;
            css += `font-weight: ${shape.fontWeight || 400};\n`;
            css += `color: ${shape.fill};\n`;
        }

        css = css.replace(/([a-z-]+)(:)/g, '<span class="code-prop">$1</span>$2');
        css = css.replace(/(:\s)([^;\n]+)(;)/g, '$1<span class="code-val">$2</span>$3');
        
        codeBlock.innerHTML = css;
        this.propertiesContent.appendChild(codeBlock);
    }

    renderShapeProperties(shape) {
        if (this.engine.selectedIds.length > 1) {
            this.renderAlignmentTools();
            const helper = document.createElement('div');
            helper.className = 'empty-state';
            helper.style.marginTop = '10px';
            helper.textContent = `Вибрано об'єктів: ${this.engine.selectedIds.length}`;
            this.propertiesContent.appendChild(helper);
        }

        this.addSectionTitle('Об\'єкт');
        this.addInput('Назва', 'name', shape.name || shape.type, 'text');

        this.addSectionTitle('Геометрія');
        const geoRow = this.addRow();
        this.addInput('Вісь Х', 'x', Math.round(shape.x), 'number', geoRow, 'X');
        this.addInput('Вісь Y', 'y', Math.round(shape.y), 'number', geoRow, 'Y');
        const sizeRow = this.addRow();
        this.addInput('Ширина', 'width', Math.round(shape.width), 'number', sizeRow, 'W');
        this.addInput('Висота', 'height', Math.round(shape.height), 'number', sizeRow, 'H');

        if (shape.cornerRadius !== undefined) {
            this.addInput('Радіус кутів', 'cornerRadius', shape.cornerRadius, 'number', null, 'R');
        }

        if (shape.type === 'star') {
            const pointsRow = this.addRow();
            this.addInput('Кількість променів (Star Points)', 'points', shape.points || 5, 'number', pointsRow, 'P');
        }

        this.addSectionTitle('Вигляд');
        const opacityRow = this.addRow();
        this.addSlider('Прозорість', 'opacity', shape.opacity !== undefined ? shape.opacity : 1, 0, 1, 0.01, opacityRow);
        this.addInput('Поворот', 'rotation', shape.rotation || 0, 'number', opacityRow, '°');

        if (shape.type !== 'group' && shape.type !== 'image') {
            this.addSectionTitle('Стиль');
            if (shape.type !== 'path') this.addColorInput('Заливка', 'fill', shape.fill);
            this.addColorInput('Контур', 'stroke', shape.stroke);
            this.addInput('Товщина', 'strokeWidth', shape.strokeWidth, 'number', null, 'px');
        }

        if (shape.type === 'text') {
            this.addSectionTitle('Текст');
            this.addInput('Вміст', 'text', shape.text, 'text');
            this.addInput('Розмір', 'fontSize', shape.fontSize, 'number');
            this.addSelect('Начерк', 'fontWeight', shape.fontWeight, [
                {label: 'Regular', value: 400},
                {label: 'Medium', value: 500},
                {label: 'Bold', value: 700}
            ]);
            this.addSelect('Шрифт', 'fontFamily', shape.fontFamily || 'Inter, sans-serif', [
                {label: 'Inter', value: 'Inter, sans-serif'},
                {label: 'Arial', value: 'Arial, sans-serif'},
                {label: 'Times', value: '"Times New Roman", Times, serif'},
                {label: 'Courier', value: '"Courier New", Courier, monospace'},
                {label: 'Comic Sans', value: '"Comic Sans MS", cursive'}
            ]);
        }

        if (shape.type === 'frame') {
            this.addSectionTitle('Параметри Фрейму');
            const alToggle = this.addToggle('Auto Layout', 'isAutoLayout', shape.isAutoLayout);
            if (shape.isAutoLayout) {
                this.addSelect('Напрямок', 'layoutDirection', shape.layoutDirection, [
                    {label: 'Вертикальний', value: 'vertical'},
                    {label: 'Горизонтальний', value: 'horizontal'}
                ]);
                const spacingRow = this.addRow();
                this.addInput('Відступ', 'gap', shape.gap, 'number', spacingRow);
                this.addInput('Паддінг', 'padding', shape.padding, 'number', spacingRow);
            }
        }
    }

    renderAlignmentTools() {
        const row = document.createElement('div');
        row.className = 'align-row';
        row.style.marginBottom = '12px';
        
        const tools = [
            { icon: 'align-left', action: 'left', title: 'По лівому краю' },
            { icon: 'align-center', action: 'center', title: 'По центру гориз.' },
            { icon: 'align-right', action: 'right', title: 'По правому краю' },
            { icon: 'align-vertical-space-between', action: 'top', title: 'По верхньому краю' },
            { icon: 'align-vertical-justify-center', action: 'middle', title: 'По центру верт.' },
            { icon: 'align-vertical-space-around', action: 'bottom', title: 'По нижньому краю' }
        ];

        // Fallback text if icon doesn't exist
        const textFallback = { 'left': 'L', 'center': 'C', 'right': 'R', 'top': 'T', 'middle': 'M', 'bottom': 'B' };

        tools.forEach(t => {
            const btn = document.createElement('button');
            btn.className = 'align-btn';
            btn.title = t.title;
            // Best effort with lucide icons, otherwise fallback text
            btn.innerHTML = `<i data-lucide="${t.icon}">${textFallback[t.action]}</i>`;
            btn.onclick = () => this.engine.alignSelected(t.action);
            row.appendChild(btn);
        });

        this.propertiesContent.appendChild(row);
        lucide.createIcons({root: row});
    }

    // New method to update values without re-rendering the whole panel
    updateValues(shape) {
        if (!shape) return;
        for (const key in this.inputs) {
            const input = this.inputs[key];
            if (input === this.activeInput) continue;
            
            let val = shape[key];
            if (input.type === 'number') val = Math.round(val);
            
            if (input.type === 'color') {
                input.value = (val && val.startsWith('#')) ? val.toLowerCase() : '#000000';
                const preview = input.closest('.prop-group').querySelector('.color-preview');
                if (preview) preview.style.background = val;
                const textInp = input.closest('.prop-group').querySelector('input[type="text"]');
                if (textInp && textInp !== this.activeInput) textInp.value = val;
            } else if (input.type === 'checkbox') {
                input.checked = !!val;
            } else {
                input.value = val !== undefined ? val : '';
            }
        }
    }

    addSectionTitle(text) {
        const title = document.createElement('div');
        title.className = 'prop-section-title';
        title.textContent = text;
        this.propertiesContent.appendChild(title);
    }

    addRow() {
        const row = document.createElement('div');
        row.className = 'prop-row';
        this.propertiesContent.appendChild(row);
        return row;
    }

    addInput(label, key, value, type, parent, iconText) {
        const group = document.createElement('div');
        group.className = 'prop-group';
        const id = `prop-${key}`;
        group.title = label;
        group.innerHTML = `<div class="prop-icon">${iconText || label[0].toUpperCase()}</div><input type="${type}" id="${id}" name="${id}" class="prop-input" value="${value}">`;
        const input = group.querySelector('input');
        
        input.addEventListener('focus', () => this.activeInput = input);
        input.addEventListener('blur', () => this.activeInput = null);
        input.addEventListener('input', (e) => {
            let val = e.target.value;
            if (type === 'number') {
                val = parseFloat(val);
                if (key === 'points' && val < 3) val = 3;
            }
            this.engine.updateSelectedProperty(key, val);
            if (this.onUpdate) this.onUpdate();
        });

        this.inputs[key] = input;
        (parent || this.propertiesContent).appendChild(group);
        return group;
    }

    addColorInput(label, key, value) {
        const group = document.createElement('div');
        group.className = 'prop-group color-prop-group';
        const id = `prop-${key}`;
        const hexValue = (value && value.startsWith('#')) ? value.toLowerCase() : '#000000';
        
        const swatches = ['#ffffff', '#000000', '#ff3b30', '#34c759', '#0a84ff', '#ffd60a'];
        const swatchesHtml = swatches.map(c => `<div class="color-swatch" style="background:${c}" data-color="${c}"></div>`).join('');

        group.classList.add(`color-prop-group-${key}`);
        group.innerHTML = `
            <div class="prop-icon-wrapper">
                <div class="prop-icon" title="${label}">${label[0].toUpperCase()}</div>
            </div>
            <div class="prop-color-container">
                <div class="prop-color">
                    <div class="color-preview" style="background:${value}"></div>
                    <input type="text" id="${id}-text" name="${id}-text" class="prop-input" value="${value}" style="flex:1" autocomplete="off">
                </div>
                <div class="color-swatches">${swatchesHtml}<div class="color-swatch transparent-swatch" data-color="transparent" title="Прозорий"></div></div>
            </div>`;
            
        const textInput = group.querySelector('input[type="text"]');
        const preview = group.querySelector('.color-preview');
        const swatchContainer = group.querySelector('.color-swatches');
        
        const update = (val) => {
            this.engine.updateSelectedProperty(key, val);
            preview.style.background = val;
            if (this.onUpdate) this.onUpdate();
        };

        preview.addEventListener('click', () => {
            this.activeColorKey = key;
            this.colorPicker.open(preview, textInput.value);
        });

        textInput.addEventListener('focus', () => this.activeInput = textInput);
        textInput.addEventListener('blur', () => this.activeInput = null);
        textInput.addEventListener('input', (e) => {
            const val = e.target.value;
            update(val);
        });

        swatchContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('color-swatch')) {
                const val = e.target.dataset.color;
                textInput.value = val;
                update(val);
            }
        });

        this.inputs[key] = textInput; 
        this.propertiesContent.appendChild(group);
    }

    addSelect(label, key, value, options, customCallback) {
        const group = document.createElement('div');
        group.className = 'prop-group';
        const id = `prop-${key}`;
        let optionsHTML = options.map(opt => `<option value="${opt.value}" ${opt.value == value ? 'selected' : ''}>${opt.label}</option>`).join('');
        group.innerHTML = `<div class="prop-icon">${label[0]}</div><select id="${id}" name="${id}" class="prop-select">${optionsHTML}</select>`;
        const select = group.querySelector('select');
        
        select.addEventListener('change', (e) => {
            if (customCallback) customCallback(e.target.value);
            else this.engine.updateSelectedProperty(key, e.target.value);
            if (this.onUpdate) this.onUpdate();
        });

        this.inputs[key] = select;
        this.propertiesContent.appendChild(group);
    }

    addToggle(label, key, value) {
        const group = document.createElement('div');
        group.className = 'prop-row';
        const id = `prop-${key}`;
        group.innerHTML = `<label for="${id}" style="font-size:12px">${label}</label><input type="checkbox" id="${id}" name="${id}" ${value ? 'checked' : ''}>`;
        const cb = group.querySelector('input');
        
        cb.addEventListener('change', (e) => {
            this.engine.updateSelectedProperty(key, e.target.checked);
            this.activeInput = null;
            this.update();
            if (this.onUpdate) this.onUpdate();
        });

        this.inputs[key] = cb;
        this.propertiesContent.appendChild(group);
    }

    addSlider(label, key, value, min, max, step, parent) {
        const group = document.createElement('div');
        group.className = 'prop-group prop-slider-group';
        group.title = label;
        const id = `prop-${key}`;
        const percent = Math.round(value * 100);
        group.innerHTML = `
            <div class="prop-icon">${percent}%</div>
            <input type="range" id="${id}" name="${id}" class="prop-slider" 
                   min="${min}" max="${max}" step="${step}" value="${value}">`;
        const slider = group.querySelector('input[type="range"]');
        const icon = group.querySelector('.prop-icon');
        
        slider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            icon.textContent = Math.round(val * 100) + '%';
            this.engine.updateSelectedProperty(key, val);
            if (this.onUpdate) this.onUpdate();
        });

        this.inputs[key] = slider;
        (parent || this.propertiesContent).appendChild(group);
        return group;
    }
}
