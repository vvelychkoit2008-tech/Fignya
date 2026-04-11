class CloudPanelManager {
    constructor(storageManager, engine) {
        this.storage = storageManager;
        this.engine = engine;
        this.isOpen = false;

        this.panel = document.getElementById('cloud-panel');
        this.trigger = document.getElementById('btn-cloud');
        this.fileNameEl = document.getElementById('file-name-display');
        this.projectsDropdownTrigger = document.getElementById('btn-projects-dropdown');
        this.projectsDropdown = document.getElementById('projects-dropdown');
        this.syncDot = document.getElementById('cloud-sync-dot');

        this._bindEvents();
        this._bindStorageCallbacks();
        this._updateUI();
        this._renderLeftSidebarProjects();
    }

    _bindEvents() {
        // Toggle panel
        if (this.trigger) {
            this.trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggle();
            });
        }

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (this.isOpen && this.panel && !this.panel.contains(e.target) && e.target !== this.trigger) {
                this.close();
            }
        });

        // File name editing
        if (this.fileNameEl) {
            this.fileNameEl.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                this._startRename();
            });
        }

        // Projects Dropdown Toggle
        if (this.projectsDropdownTrigger) {
            this.projectsDropdownTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                this.projectsDropdown.classList.toggle('hidden');
                if (!this.projectsDropdown.classList.contains('hidden')) {
                    // close cloud panel if open
                    this.close();
                }
            });
        }

        // Close dropdown on outside click
        document.addEventListener('click', (e) => {
            if (this.projectsDropdown && !this.projectsDropdown.classList.contains('hidden') 
                && !this.projectsDropdown.contains(e.target) 
                && !this.projectsDropdownTrigger.contains(e.target)) {
                this.projectsDropdown.classList.add('hidden');
            }
        });

        // Panel button delegates
        const handleDelegation = (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            this._handleAction(btn.dataset.action, btn.dataset);
        };

        if (this.panel) {
            this.panel.addEventListener('click', handleDelegation);
        }

        if (this.projectsDropdown) {
            this.projectsDropdown.addEventListener('click', handleDelegation);
        }
    }

    _bindStorageCallbacks() {
        this.storage.onStatusChange = (status) => {
            this._updateSyncIndicator(status);
        };

        this.storage.onProjectChange = (project) => {
            this._updateProjectName(project);
            if (this.isOpen) this._renderProjectList();
            this._renderLeftSidebarProjects();
        };

        this.storage.onAuthChange = (signedIn) => {
            this._updateAuthUI(signedIn);
            if (this.isOpen) this._renderProjectList();
            this._renderLeftSidebarProjects();
        };
    }

    toggle() {
        this.isOpen ? this.close() : this.open();
    }

    open() {
        if (!this.panel) return;
        this.isOpen = true;
        this.panel.classList.remove('hidden');
        this.panel.classList.add('cloud-panel-enter');
        this._renderProjectList();
    }

    close() {
        if (!this.panel) return;
        this.isOpen = false;
        this.panel.classList.add('hidden');
        this.panel.classList.remove('cloud-panel-enter');
    }

    // ═══════════════════════════════════════════
    //  ACTIONS
    // ═══════════════════════════════════════════

    async _handleAction(action, dataset) {
        switch (action) {
            case 'sign-in':
                this.storage.signIn();
                break;

            case 'sign-out':
                this.storage.signOut();
                break;

            case 'new-project':
                this.storage.createNewProject();
                this.engine.callbacks.onSceneChange();
                this._renderProjectList();
                this._renderLeftSidebarProjects();
                break;

            case 'load-project':
                if (dataset.projectId) {
                    this.storage.loadFromLocal(dataset.projectId);
                    this.engine.callbacks.onSceneChange();
                    this.close();
                    if (this.projectsDropdown) this.projectsDropdown.classList.add('hidden');
                }
                break;

            case 'delete-project':
                if (dataset.projectId) {
                    const name = dataset.projectName || 'цей проект';
                    if (confirm(`Видалити "${name}"?`)) {
                        // Also delete from Drive if linked
                        const store = this.storage._getProjectsStore();
                        const proj = store[dataset.projectId];
                        if (proj && proj.driveFileId && this.storage.isSignedIn()) {
                            await this.storage.deleteFromDrive(proj.driveFileId);
                        }
                        this.storage.deleteLocalProject(dataset.projectId);
                        this._renderProjectList();
                        this._renderLeftSidebarProjects();
                    }
                }
                break;

            case 'rename-project':
                if (dataset.projectId) {
                    const elDrop = this.panel.querySelector(`[data-rename-id="${dataset.projectId}"]`);
                    const elSidebar = this.projectsDropdown ? this.projectsDropdown.querySelector(`[data-rename-id="${dataset.projectId}"]`) : null;
                    if (elSidebar && !this.projectsDropdown.classList.contains('hidden')) this._startProjectRename(elSidebar, dataset.projectId);
                    else if (elDrop) this._startProjectRename(elDrop, dataset.projectId);
                }
                break;

            case 'save-to-drive':
                this._renderProjectList();
                this._renderLeftSidebarProjects();
                break;

            case 'pull-from-drive':
                await this.storage.pullFromDrive();
                this._renderProjectList();
                this._renderLeftSidebarProjects();
                break;

            case 'load-from-drive':
                if (dataset.fileId) {
                    await this.storage.loadFromDrive(dataset.fileId);
                    this.engine.callbacks.onSceneChange();
                    this.close();
                }
                break;

            case 'toggle-auto-sync':
                const toggle = this.panel.querySelector('#auto-sync-toggle');
                if (toggle) {
                    this.storage.setAutoSync(toggle.checked);
                }
                break;

            case 'sync-all':
                await this.storage.syncAllToDrive();
                this._renderProjectList();
                break;
        }
    }

    // ═══════════════════════════════════════════
    //  RENDER
    // ═══════════════════════════════════════════

    _renderProjectList() {
        if (!this.panel) return;
        const content = this.panel.querySelector('.cloud-panel-content');
        if (!content) return;

        const signedIn = this.storage.isSignedIn();
        const profile = this.storage.userProfile;
        const projects = this.storage.listLocalProjects();
        const currentId = this.storage.currentProject?.id;

        content.innerHTML = `
            <!-- Auth Section -->
            <div class="cp-section cp-auth-section">
                ${signedIn && profile ? `
                    <div class="cp-user-row">
                        <img class="cp-avatar" src="${profile.picture || ''}" alt="" referrerpolicy="no-referrer" />
                        <div class="cp-user-info">
                            <div class="cp-user-name">${profile.name || profile.email}</div>
                            <div class="cp-user-email">${profile.email || ''}</div>
                        </div>
                        <button class="cp-btn cp-btn-ghost" data-action="sign-out" title="Вийти">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                        </button>
                    </div>
                ` : `
                    <button class="cp-btn cp-btn-google" data-action="sign-in">
                        <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                        Увійти з Google
                    </button>
                `}
            </div>

            <!-- Drive Actions (when signed in) -->
            ${signedIn ? `
                <div class="cp-section cp-drive-actions">
                    <div class="cp-row">
                        <button class="cp-btn cp-btn-primary" data-action="save-to-drive">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                            Зберегти на Drive
                        </button>
                        <button class="cp-btn cp-btn-secondary" data-action="pull-from-drive" title="Завантажити з Drive">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        </button>
                    </div>
                    <div class="cp-auto-sync-row">
                        <label class="cp-toggle-label" for="auto-sync-toggle">
                            <span>Автосинхронізація</span>
                            <div class="cp-toggle">
                                <input type="checkbox" id="auto-sync-toggle" 
                                    ${this.storage.autoSyncEnabled ? 'checked' : ''} 
                                    data-action="toggle-auto-sync">
                                <span class="cp-toggle-slider"></span>
                            </div>
                        </label>
                    </div>
                </div>
            ` : ''}

            <!-- Projects List -->
            <div class="cp-section cp-projects-section">
                <div class="cp-section-header">
                    <span>Проекти</span>
                    <button class="cp-btn cp-btn-icon" data-action="new-project" title="Новий проект">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    </button>
                </div>
                <div class="cp-projects-list">
                    ${projects.map(p => `
                        <div class="cp-project-card ${p.id === currentId ? 'active' : ''}" data-action="load-project" data-project-id="${p.id}">
                            <div class="cp-project-info">
                                <div class="cp-project-name" data-rename-id="${p.id}">${this._escapeHtml(p.name)}</div>
                                <div class="cp-project-meta">
                                    ${this._formatDate(p.lastModified)}
                                    ${p.driveFileId ? '<span class="cp-cloud-badge" title="На Google Drive">☁</span>' : ''}
                                </div>
                            </div>
                            <div class="cp-project-actions" onclick="event.stopPropagation()">
                                <button class="cp-btn cp-btn-icon cp-btn-tiny" data-action="rename-project" data-project-id="${p.id}" title="Перейменувати">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                                </button>
                                <button class="cp-btn cp-btn-icon cp-btn-tiny cp-btn-danger" data-action="delete-project" data-project-id="${p.id}" data-project-name="${this._escapeHtml(p.name)}" title="Видалити">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                </button>
                            </div>
                        </div>
                    `).join('')}
                    ${projects.length === 0 ? '<div class="cp-empty">Немає збережених проектів</div>' : ''}
                </div>
            </div>

            <!-- Sync Status -->
            <div class="cp-section cp-status-section">
                <div class="cp-status-row">
                    <span class="cp-status-dot cp-status-${this.storage.syncStatus}"></span>
                    <span class="cp-status-text">${this._getStatusText(this.storage.syncStatus)}</span>
                </div>
            </div>
        `;

        // Bind the toggle change event
        const toggle = content.querySelector('#auto-sync-toggle');
        if (toggle) {
            toggle.addEventListener('change', () => {
                this.storage.setAutoSync(toggle.checked);
            });
        }
    }

    _renderLeftSidebarProjects() {
        if (!this.projectsDropdown) return;

        const projects = this.storage.listLocalProjects();
        const currentId = this.storage.currentProject?.id;

        this.projectsDropdown.innerHTML = `
            <div class="cp-section-header" style="padding: 0 8px;">
                <span>Всі проекти</span>
                <button class="cp-btn cp-btn-icon" data-action="new-project" title="Новий проект">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </button>
            </div>
            ${projects.map(p => `
                <div class="cp-project-card ${p.id === currentId ? 'active' : ''}" data-action="load-project" data-project-id="${p.id}">
                    <div class="cp-project-info">
                        <div class="cp-project-name" data-rename-id="${p.id}">${this._escapeHtml(p.name)}</div>
                        <div class="cp-project-meta">
                            ${this._formatDate(p.lastModified)}
                            ${p.driveFileId ? '<span class="cp-cloud-badge" title="На Google Drive">☁</span>' : ''}
                        </div>
                    </div>
                    <div class="cp-project-actions" onclick="event.stopPropagation()">
                        <button class="cp-btn cp-btn-icon cp-btn-tiny" data-action="rename-project" data-project-id="${p.id}" title="Перейменувати">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                        </button>
                        <button class="cp-btn cp-btn-icon cp-btn-tiny cp-btn-danger" data-action="delete-project" data-project-id="${p.id}" data-project-name="${this._escapeHtml(p.name)}" title="Видалити">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </div>
                </div>
            `).join('')}
            ${projects.length === 0 ? '<div class="cp-empty">Немає збережених проектів</div>' : ''}
        `;
    }

    // ═══════════════════════════════════════════
    //  UI UPDATES
    // ═══════════════════════════════════════════

    _updateUI() {
        this._updateProjectName(this.storage.currentProject);
        this._updateSyncIndicator(this.storage.syncStatus);
        this._updateAuthUI(this.storage.isSignedIn());
    }

    _updateProjectName(project) {
        if (this.fileNameEl && project) {
            this.fileNameEl.textContent = project.name;
        }
    }

    _updateSyncIndicator(status) {
        if (!this.syncDot) return;
        this.syncDot.className = 'cloud-sync-dot';
        this.syncDot.classList.add(`sync-${status}`);

        // Update tooltip
        const btn = document.getElementById('btn-cloud');
        if (btn) {
            btn.title = this._getStatusText(status);
        }
    }

    _updateAuthUI(signedIn) {
        const btn = document.getElementById('btn-cloud');
        if (btn) {
            btn.classList.toggle('cloud-signed-in', signedIn);
        }
    }

    _startRename() {
        if (!this.storage.currentProject) return;
        const el = this.fileNameEl;
        const original = el.textContent;
        el.contentEditable = true;
        el.classList.add('editing');
        el.focus();

        // Select all text
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        const finish = () => {
            el.contentEditable = false;
            el.classList.remove('editing');
            const newName = el.textContent.trim() || original;
            el.textContent = newName;
            this.storage.renameProject(this.storage.currentProject.id, newName);
        };

        el.addEventListener('blur', finish, { once: true });
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
            if (e.key === 'Escape') { el.textContent = original; el.blur(); }
        });
    }

    _startProjectRename(el, projectId) {
        const original = el.textContent;
        el.contentEditable = true;
        el.classList.add('editing');
        el.focus();

        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        const finish = () => {
            el.contentEditable = false;
            el.classList.remove('editing');
            const newName = el.textContent.trim() || original;
            el.textContent = newName;
            this.storage.renameProject(projectId, newName);
        };

        el.addEventListener('blur', finish, { once: true });
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
            if (e.key === 'Escape') { el.textContent = original; el.blur(); }
        });
    }

    // ═══════════════════════════════════════════
    //  HELPERS
    // ═══════════════════════════════════════════

    _getStatusText(status) {
        const map = {
            'idle': 'Готово',
            'saving': 'Зберігається...',
            'syncing': 'Синхронізація...',
            'synced': 'Синхронізовано ✓',
            'error': 'Помилка синхронізації'
        };
        return map[status] || status;
    }

    _formatDate(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        const now = new Date();
        const diff = now - d;

        if (diff < 60000) return 'щойно';
        if (diff < 3600000) return `${Math.floor(diff / 60000)} хв тому`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)} год тому`;

        return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
    }

    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}
