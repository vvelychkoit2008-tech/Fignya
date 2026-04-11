class PrototypePlayer {
    constructor(engine) {
        this.engine = engine;
        this.node = document.getElementById('proto-player');
        this.inner = document.getElementById('proto-player-inner');
        this.btnClose = document.getElementById('btn-close-proto');
        this.currentFrameId = null;
        this.history = []; // Navigation history for back button
        this.isTransitioning = false;
        this.init();
    }

    init() {
        if (this.btnClose) {
            this.btnClose.addEventListener('click', () => this.stop());
        }
        // Escape key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.node.style.display !== 'none') {
                this.stop();
            }
        });
    }

    start() {
        const startFrame = this.engine.prototype.getStartFrame();
        if (!startFrame) {
            this._showNoFrameMessage();
            return;
        }

        // Check if there are any links
        if (this.engine.prototype.links.length === 0) {
            this._showNoLinksMessage();
            return;
        }

        this.history = [];
        this.node.style.display = 'flex';
        this.node.classList.remove('hidden');
        document.body.style.overflow = 'hidden';

        // Build navigation UI
        this._buildPlayerUI();

        // Open the first frame
        this.navigateTo(startFrame.id, 'none');
    }

    stop() {
        this.node.style.display = 'none';
        this.node.classList.add('hidden');
        this.inner.innerHTML = '';
        this.currentFrameId = null;
        this.history = [];
        document.body.style.overflow = '';
    }

    _showNoFrameMessage() {
        this.node.style.display = 'flex';
        this.node.classList.remove('hidden');
        this.inner.innerHTML = `
            <div class="proto-empty-state">
                <div class="proto-empty-icon">🖼</div>
                <div class="proto-empty-title">Немає фреймів</div>
                <div class="proto-empty-desc">Створіть хоча б один фрейм (F) для запуску прототипу</div>
                <button class="proto-empty-btn" onclick="document.getElementById('proto-player').style.display='none'">Закрити</button>
            </div>
        `;
    }

    _showNoLinksMessage() {
        this.node.style.display = 'flex';
        this.node.classList.remove('hidden');
        this.inner.innerHTML = `
            <div class="proto-empty-state">
                <div class="proto-empty-icon">🔗</div>
                <div class="proto-empty-title">Немає з'єднань</div>
                <div class="proto-empty-desc">
                    Перейдіть у режим <strong>Prototype</strong>, потім перетягніть 
                    синій кружок від елемента до цільового фрейму
                </div>
                <button class="proto-empty-btn" onclick="document.getElementById('proto-player').style.display='none'">Закрити</button>
            </div>
        `;
    }

    _buildPlayerUI() {
        // Clear and setup structure
        this.inner.innerHTML = '';
        this.inner.className = 'player-stage';
    }

    // ═══════════════════════════════════════════
    //  NAVIGATION
    // ═══════════════════════════════════════════

    navigateTo(frameId, animation = 'slide-left') {
        if (this.isTransitioning) return;

        const frame = this.engine.getShapeById(frameId);
        if (!frame || frame.type !== 'frame') return;

        const prevFrameId = this.currentFrameId;
        if (prevFrameId) {
            this.history.push(prevFrameId);
        }
        this.currentFrameId = frameId;

        // Update nav bar
        this._updateNavBar(frame);

        // Build the new frame content
        const newView = this._buildFrameView(frame);

        if (prevFrameId && animation !== 'none') {
            this._animateTransition(newView, animation);
        } else {
            this.inner.querySelector('.proto-viewport')?.remove();
            this.inner.appendChild(newView);
        }
    }

    goBack() {
        if (this.history.length === 0) return;
        const prevId = this.history.pop();
        const frame = this.engine.getShapeById(prevId);
        if (!frame) return;

        this.currentFrameId = prevId;
        this._updateNavBar(frame);

        const newView = this._buildFrameView(frame);
        this._animateTransition(newView, 'slide-right');
    }

    // ═══════════════════════════════════════════
    //  FRAME RENDERING
    // ═══════════════════════════════════════════

    _buildFrameView(frame) {
        const viewport = document.createElement('div');
        viewport.className = 'proto-viewport';
        viewport.style.width = frame.width + 'px';
        viewport.style.height = frame.height + 'px';
        viewport.style.background = frame.fill || '#FFFFFF';
        viewport.style.position = 'relative';
        viewport.style.overflow = 'hidden';
        viewport.style.borderRadius = (frame.cornerRadius || 0) + 'px';

        // Recursively render all children
        this._renderChildren(viewport, frame, frame.x, frame.y);

        return viewport;
    }

    _renderChildren(container, parent, offsetX, offsetY) {
        const children = this.engine.shapes.filter(s => s.groupId === parent.id);

        children.forEach(child => {
            if (child.isHidden) return;

            const el = document.createElement('div');
            el.className = 'proto-element';
            el.style.position = 'absolute';
            el.style.left = (child.x - offsetX) + 'px';
            el.style.top = (child.y - offsetY) + 'px';
            el.style.width = child.width + 'px';
            el.style.height = child.height + 'px';
            el.style.opacity = child.opacity != null ? child.opacity : 1;
            el.style.transform = child.rotation ? `rotate(${child.rotation}deg)` : '';

            // Render by shape type
            switch (child.type) {
                case 'text':
                    el.textContent = child.text || '';
                    el.style.color = child.fill;
                    el.style.fontSize = (child.fontSize || 16) + 'px';
                    el.style.fontWeight = child.fontWeight || 400;
                    el.style.fontFamily = 'Inter, -apple-system, sans-serif';
                    el.style.lineHeight = '1.3';
                    el.style.display = 'flex';
                    el.style.alignItems = 'center';
                    el.style.overflow = 'hidden';
                    if (child.textAlign) el.style.textAlign = child.textAlign;
                    break;

                case 'image':
                    el.style.backgroundImage = `url(${child.src})`;
                    el.style.backgroundSize = 'cover';
                    el.style.backgroundPosition = 'center';
                    el.style.borderRadius = (child.cornerRadius || 0) + 'px';
                    break;

                case 'ellipse':
                    el.style.background = child.fill || '#ccc';
                    el.style.borderRadius = '50%';
                    if (child.stroke && child.stroke !== 'none') {
                        el.style.border = `${child.strokeWidth || 1}px solid ${child.stroke}`;
                    }
                    break;

                case 'triangle':
                    el.style.background = 'transparent';
                    el.style.width = '0';
                    el.style.height = '0';
                    el.style.borderLeft = `${child.width / 2}px solid transparent`;
                    el.style.borderRight = `${child.width / 2}px solid transparent`;
                    el.style.borderBottom = `${child.height}px solid ${child.fill || '#ccc'}`;
                    break;

                case 'frame':
                case 'group':
                    el.style.background = child.fill || 'transparent';
                    el.style.borderRadius = (child.cornerRadius || 0) + 'px';
                    el.style.overflow = 'hidden';
                    if (child.stroke && child.stroke !== 'none') {
                        el.style.border = `${child.strokeWidth || 1}px solid ${child.stroke}`;
                    }
                    // Recursively render sub-children
                    this._renderChildren(el, child, child.x, child.y);
                    break;

                default: // rectangle, star, etc
                    el.style.background = child.fill || '#ccc';
                    el.style.borderRadius = (child.cornerRadius || 0) + 'px';
                    if (child.stroke && child.stroke !== 'none') {
                        el.style.border = `${child.strokeWidth || 1}px solid ${child.stroke}`;
                    }
                    break;
            }

            // Check for prototype link (interactive element)
            const link = this.engine.prototype.links.find(l => l.sourceId === child.id);
            if (link) {
                el.classList.add('proto-hotspot');
                el.style.cursor = 'pointer';

                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    // Ripple animation
                    this._createRipple(el, e);
                    // Navigate to target frame
                    setTimeout(() => {
                        this.navigateTo(link.targetId, link.animation || 'slide-left');
                    }, 150);
                });

                // Hover effect
                el.addEventListener('mouseenter', () => {
                    el.classList.add('proto-hotspot-hover');
                });
                el.addEventListener('mouseleave', () => {
                    el.classList.remove('proto-hotspot-hover');
                });
            }

            container.appendChild(el);
        });
    }

    // ═══════════════════════════════════════════
    //  TRANSITIONS
    // ═══════════════════════════════════════════

    _animateTransition(newView, animation) {
        this.isTransitioning = true;
        const oldView = this.inner.querySelector('.proto-viewport');

        if (!oldView) {
            this.inner.appendChild(newView);
            this.isTransitioning = false;
            return;
        }

        // Setup animation classes
        newView.style.position = 'absolute';
        newView.style.top = '50%';
        newView.style.left = '50%';

        switch (animation) {
            case 'slide-left':
                newView.style.transform = 'translate(calc(-50% + 100%), -50%)';
                this.inner.appendChild(newView);
                requestAnimationFrame(() => {
                    oldView.style.transition = 'transform 0.35s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.35s';
                    newView.style.transition = 'transform 0.35s cubic-bezier(0.25, 1, 0.5, 1)';
                    oldView.style.transform = 'translate(calc(-50% - 30%), -50%)';
                    oldView.style.opacity = '0.3';
                    newView.style.transform = 'translate(-50%, -50%)';
                });
                break;

            case 'slide-right':
                newView.style.transform = 'translate(calc(-50% - 100%), -50%)';
                this.inner.appendChild(newView);
                requestAnimationFrame(() => {
                    oldView.style.transition = 'transform 0.35s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.35s';
                    newView.style.transition = 'transform 0.35s cubic-bezier(0.25, 1, 0.5, 1)';
                    oldView.style.transform = 'translate(calc(-50% + 30%), -50%)';
                    oldView.style.opacity = '0.3';
                    newView.style.transform = 'translate(-50%, -50%)';
                });
                break;

            case 'dissolve':
                newView.style.transform = 'translate(-50%, -50%)';
                newView.style.opacity = '0';
                this.inner.appendChild(newView);
                requestAnimationFrame(() => {
                    oldView.style.transition = 'opacity 0.3s';
                    newView.style.transition = 'opacity 0.3s';
                    oldView.style.opacity = '0';
                    newView.style.opacity = '1';
                });
                break;

            case 'push':
                newView.style.transform = 'translate(calc(-50% + 100%), -50%) scale(0.95)';
                this.inner.appendChild(newView);
                requestAnimationFrame(() => {
                    oldView.style.transition = 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.4s';
                    newView.style.transition = 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)';
                    oldView.style.transform = 'translate(calc(-50% - 100%), -50%) scale(0.95)';
                    oldView.style.opacity = '0';
                    newView.style.transform = 'translate(-50%, -50%) scale(1)';
                });
                break;

            default: // instant
                this.inner.appendChild(newView);
                oldView.remove();
                this.isTransitioning = false;
                return;
        }

        // Cleanup old view after animation
        setTimeout(() => {
            oldView.remove();
            // Reset positioning
            newView.style.position = '';
            newView.style.top = '';
            newView.style.left = '';
            newView.style.transform = '';
            newView.style.transition = '';
            this.isTransitioning = false;
        }, 400);
    }

    _createRipple(el, e) {
        const ripple = document.createElement('div');
        ripple.className = 'proto-ripple';
        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        ripple.style.left = x + 'px';
        ripple.style.top = y + 'px';
        el.style.position = el.style.position || 'relative';
        el.style.overflow = 'hidden';
        el.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
    }

    // ═══════════════════════════════════════════
    //  NAVIGATION BAR
    // ═══════════════════════════════════════════

    _updateNavBar(frame) {
        let nav = this.node.querySelector('.proto-nav-bar');
        if (!nav) {
            nav = document.createElement('div');
            nav.className = 'proto-nav-bar';
            this.node.insertBefore(nav, this.inner);
        }

        const frameName = frame.name || frame.type || 'Frame';
        const canGoBack = this.history.length > 0;

        nav.innerHTML = `
            <div class="proto-nav-left">
                <button class="proto-nav-btn ${canGoBack ? '' : 'disabled'}" id="proto-btn-back" title="Назад">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <span class="proto-nav-title">${this._escapeHtml(frameName)}</span>
                <span class="proto-nav-breadcrumb">${this.history.length > 0 ? `(${this.history.length + 1} / ${this._countFrames()})` : ''}</span>
            </div>
            <div class="proto-nav-right">
                <span class="proto-nav-hint">Натисніть на виділені елементи для навігації</span>
                <button class="proto-nav-btn proto-nav-close" id="proto-btn-close" title="Закрити">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
        `;

        // Bind events
        const backBtn = nav.querySelector('#proto-btn-back');
        if (backBtn && canGoBack) {
            backBtn.onclick = () => this.goBack();
        }
        const closeBtn = nav.querySelector('#proto-btn-close');
        if (closeBtn) {
            closeBtn.onclick = () => this.stop();
        }
    }

    _countFrames() {
        return this.engine.shapes.filter(s => s.type === 'frame').length;
    }

    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }
}
