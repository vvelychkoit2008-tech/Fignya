class ThemeManager {
    constructor() {
        this.toggleBtn = document.getElementById('btn-theme-toggle');
        this.html = document.documentElement;
        this.theme = localStorage.getItem('fihnya-theme') || 'dark';
        this.init();
    }

    init() {
        if (!this.toggleBtn) return;
        
        // Apply initial theme
        if (this.theme === 'light') {
            this.html.classList.add('light-mode');
            this.updateIcon('sun');
        } else {
            this.html.classList.remove('light-mode');
            this.updateIcon('moon');
        }

        this.toggleBtn.addEventListener('click', () => this.toggle());
    }

    toggle() {
        const isLight = this.html.classList.toggle('light-mode');
        this.theme = isLight ? 'light' : 'dark';
        localStorage.setItem('fihnya-theme', this.theme);
        
        this.updateIcon(isLight ? 'sun' : 'moon');
        
        // Refresh icons globally
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    updateIcon(iconName) {
        const iconContainer = this.toggleBtn.querySelector('i');
        if (iconContainer) {
            iconContainer.setAttribute('data-lucide', iconName);
        }
    }
}
