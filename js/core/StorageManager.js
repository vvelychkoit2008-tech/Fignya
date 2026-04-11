class StorageManager {
    constructor(engine) {
        this.engine = engine;
        this.CLIENT_ID = '417738008765-ndguolltnlbvmi3n91rrohjuvi7c1h3g.apps.googleusercontent.com';
        this.SCOPES = 'https://www.googleapis.com/auth/drive.appdata';
        this.DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

        // State
        this.syncStatus = 'idle'; // idle | saving | syncing | synced | error
        this.autoSyncEnabled = this._loadSetting('fihnya-auto-sync') === 'true';
        this.currentProject = null;
        this.tokenClient = null;
        this.gapiInited = false;
        this.gisInited = false;
        this.accessToken = null;
        this.userProfile = null;

        // Debounce timers
        this._localSaveTimer = null;
        this._driveSyncTimer = null;
        this._localSaveDelay = 500;
        this._driveSyncDelay = 5000;

        // Callbacks for UI updates
        this.onStatusChange = null;
        this.onProjectChange = null;
        this.onAuthChange = null;
    }

    // ═══════════════════════════════════════════
    //  INITIALIZATION
    // ═══════════════════════════════════════════

    async initGapi() {
        await new Promise((resolve) => {
            gapi.load('client', resolve);
        });
        await gapi.client.init({
            discoveryDocs: [this.DISCOVERY_DOC],
        });
        this.gapiInited = true;
        this._maybeEnableButtons();
    }

    initGis() {
        this.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: this.CLIENT_ID,
            scope: this.SCOPES,
            callback: (tokenResponse) => {
                if (tokenResponse.error) {
                    console.error('Auth error:', tokenResponse);
                    this._setStatus('error');
                    return;
                }
                this.accessToken = tokenResponse.access_token;
                this._fetchUserProfile();
                this._setStatus('idle');
                if (this.onAuthChange) this.onAuthChange(true);
            },
        });
        this.gisInited = true;
        this._maybeEnableButtons();
    }

    _maybeEnableButtons() {
        if (this.gapiInited && this.gisInited) {
            // Check if we have a stored token hint
            const storedToken = this._loadSetting('fihnya-gdrive-token');
            if (storedToken) {
                // Try silent re-auth
                this.tokenClient.requestAccessToken({ prompt: '' });
            }
        }
    }

    // ═══════════════════════════════════════════
    //  GOOGLE AUTH
    // ═══════════════════════════════════════════

    signIn() {
        if (!this.tokenClient) {
            console.error('GIS not initialized');
            return;
        }
        if (this.accessToken) {
            // Already signed in, request with no prompt to refresh
            this.tokenClient.requestAccessToken({ prompt: '' });
        } else {
            this.tokenClient.requestAccessToken({ prompt: 'consent' });
        }
    }

    signOut() {
        if (this.accessToken) {
            google.accounts.oauth2.revoke(this.accessToken, () => {
                this.accessToken = null;
                this.userProfile = null;
                this._removeSetting('fihnya-gdrive-token');
                this._setStatus('idle');
                if (this.onAuthChange) this.onAuthChange(false);
            });
        }
    }

    isSignedIn() {
        return !!this.accessToken;
    }

    async _fetchUserProfile() {
        try {
            const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${this.accessToken}` }
            });
            if (resp.ok) {
                this.userProfile = await resp.json();
                this._saveSetting('fihnya-gdrive-token', 'active');
                if (this.onAuthChange) this.onAuthChange(true);
            }
        } catch (e) {
            console.warn('Failed to fetch user profile:', e);
        }
    }

    async _ensureAuth() {
        if (!this.accessToken) {
            return new Promise((resolve, reject) => {
                const origCallback = this.tokenClient.callback;
                this.tokenClient.callback = (resp) => {
                    if (resp.error) { reject(resp); return; }
                    this.accessToken = resp.access_token;
                    this._fetchUserProfile();
                    resolve();
                };
                this.tokenClient.requestAccessToken({ prompt: 'consent' });
            });
        }
    }

    // ═══════════════════════════════════════════
    //  LOCAL STORAGE — PROJECTS CRUD
    // ═══════════════════════════════════════════

    _getProjectsStore() {
        try {
            return JSON.parse(localStorage.getItem('fihnya-projects') || '{}');
        } catch {
            return {};
        }
    }

    _saveProjectsStore(store) {
        localStorage.setItem('fihnya-projects', JSON.stringify(store));
    }

    generateProjectId() {
        return 'proj_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    }

    /** Create a new empty project and set it as active */
    createNewProject(name = 'Без назви') {
        const id = this.generateProjectId();
        const project = {
            id,
            name,
            lastModified: new Date().toISOString(),
            driveFileId: null,
            data: { shapes: [], links: [] }
        };
        const store = this._getProjectsStore();
        store[id] = project;
        this._saveProjectsStore(store);
        this.currentProject = project;
        this._saveSetting('fihnya-active-project', id);

        // Clear the canvas
        this.engine.loadJSON(JSON.stringify(project.data));

        if (this.onProjectChange) this.onProjectChange(this.currentProject);
        return project;
    }

    /** Save current engine state to localStorage for the active project */
    saveToLocal() {
        clearTimeout(this._localSaveTimer);
        this._localSaveTimer = setTimeout(() => {
            this._doSaveToLocal();
        }, this._localSaveDelay);
    }

    _doSaveToLocal() {
        if (!this.currentProject) {
            this.currentProject = this.createNewProject();
        }

        const data = this.engine.exportJSON();
        const store = this._getProjectsStore();

        this.currentProject.data = JSON.parse(data);
        this.currentProject.lastModified = new Date().toISOString();
        store[this.currentProject.id] = this.currentProject;
        this._saveProjectsStore(store);

        this._setStatus('saving');
        setTimeout(() => {
            if (this.syncStatus === 'saving') this._setStatus('idle');
        }, 300);

        // Trigger Drive auto-sync if enabled
        if (this.autoSyncEnabled && this.isSignedIn()) {
            this._scheduleDriveSync();
        }
    }

    /** Load a project from localStorage by ID */
    loadFromLocal(projectId) {
        const store = this._getProjectsStore();
        const project = store[projectId];
        if (!project) return false;

        this.currentProject = project;
        this._saveSetting('fihnya-active-project', projectId);
        this.engine.loadJSON(JSON.stringify(project.data));
        this.engine.history.save();

        if (this.onProjectChange) this.onProjectChange(this.currentProject);
        return true;
    }

    /** Load the last active project on startup */
    loadLastSession() {
        const activeId = this._loadSetting('fihnya-active-project');
        if (activeId) {
            return this.loadFromLocal(activeId);
        }
        // No active project — check if any projects exist
        const store = this._getProjectsStore();
        const ids = Object.keys(store);
        if (ids.length > 0) {
            return this.loadFromLocal(ids[ids.length - 1]);
        }
        // No projects at all — create a new one
        this.createNewProject();
        return false;
    }

    /** Get list of all local projects */
    listLocalProjects() {
        const store = this._getProjectsStore();
        return Object.values(store).sort((a, b) =>
            new Date(b.lastModified) - new Date(a.lastModified)
        );
    }

    /** Delete a project from localStorage */
    deleteLocalProject(projectId) {
        const store = this._getProjectsStore();
        delete store[projectId];
        this._saveProjectsStore(store);

        if (this.currentProject && this.currentProject.id === projectId) {
            const remaining = Object.keys(store);
            if (remaining.length > 0) {
                this.loadFromLocal(remaining[0]);
            } else {
                this.createNewProject();
            }
        }
    }

    /** Rename a project */
    renameProject(projectId, newName) {
        const store = this._getProjectsStore();
        if (store[projectId]) {
            store[projectId].name = newName;
            this._saveProjectsStore(store);
            if (this.currentProject && this.currentProject.id === projectId) {
                this.currentProject.name = newName;
                if (this.onProjectChange) this.onProjectChange(this.currentProject);
            }
        }
    }

    // ═══════════════════════════════════════════
    //  GOOGLE DRIVE — SYNC
    // ═══════════════════════════════════════════

    _scheduleDriveSync() {
        clearTimeout(this._driveSyncTimer);
        this._driveSyncTimer = setTimeout(() => {
            this.saveToDrive();
        }, this._driveSyncDelay);
    }

    /** Upload current project to Google Drive */
    async saveToDrive(projectId) {
        if (!this.isSignedIn()) {
            try { await this._ensureAuth(); } catch { return; }
        }

        const pid = projectId || (this.currentProject && this.currentProject.id);
        if (!pid) return;

        const store = this._getProjectsStore();
        const project = store[pid];
        if (!project) return;

        this._setStatus('syncing');

        try {
            const fileContent = JSON.stringify({
                version: 1,
                projectId: project.id,
                name: project.name,
                lastModified: project.lastModified,
                data: project.data
            });

            const metadata = {
                name: `fihnya_${project.id}.json`,
                mimeType: 'application/json',
            };

            let response;

            if (project.driveFileId) {
                // Update existing file
                response = await this._driveUpdateFile(project.driveFileId, fileContent, metadata);
            } else {
                // Create new file in appDataFolder
                metadata.parents = ['appDataFolder'];
                response = await this._driveCreateFile(metadata, fileContent);
                // Store the Drive file ID
                project.driveFileId = response.id;
                store[pid] = project;
                this._saveProjectsStore(store);
                if (this.currentProject && this.currentProject.id === pid) {
                    this.currentProject.driveFileId = response.id;
                }
            }

            this._setStatus('synced');
            if (this.onProjectChange) this.onProjectChange(this.currentProject);
        } catch (err) {
            console.error('Drive save error:', err);
            // If 401, try re-auth
            if (err.status === 401) {
                this.accessToken = null;
                try {
                    await this._ensureAuth();
                    return this.saveToDrive(projectId);
                } catch {
                    this._setStatus('error');
                }
            } else {
                this._setStatus('error');
            }
        }
    }

    /** Load a file from Google Drive by file ID */
    async loadFromDrive(fileId) {
        if (!this.isSignedIn()) {
            try { await this._ensureAuth(); } catch { return; }
        }

        this._setStatus('syncing');

        try {
            const response = await gapi.client.drive.files.get({
                fileId: fileId,
                alt: 'media'
            });

            const fileData = typeof response.result === 'string'
                ? JSON.parse(response.result)
                : response.result;

            // Create or update local project
            const store = this._getProjectsStore();
            const localId = fileData.projectId || this.generateProjectId();

            const project = {
                id: localId,
                name: fileData.name || 'Imported Project',
                lastModified: fileData.lastModified || new Date().toISOString(),
                driveFileId: fileId,
                data: fileData.data
            };

            store[localId] = project;
            this._saveProjectsStore(store);

            this.currentProject = project;
            this._saveSetting('fihnya-active-project', localId);
            this.engine.loadJSON(JSON.stringify(project.data));
            this.engine.history.save();

            this._setStatus('synced');
            if (this.onProjectChange) this.onProjectChange(this.currentProject);
            return project;
        } catch (err) {
            console.error('Drive load error:', err);
            this._setStatus('error');
            return null;
        }
    }

    /** List all Fihnya files in appDataFolder */
    async listDriveFiles() {
        if (!this.isSignedIn()) return [];

        try {
            const response = await gapi.client.drive.files.list({
                spaces: 'appDataFolder',
                fields: 'files(id, name, modifiedTime, size)',
                orderBy: 'modifiedTime desc',
                pageSize: 50,
                q: "name contains 'fihnya_'"
            });

            return response.result.files || [];
        } catch (err) {
            console.error('Drive list error:', err);
            return [];
        }
    }

    /** Delete a file from Google Drive */
    async deleteFromDrive(fileId) {
        if (!this.isSignedIn()) return;

        try {
            await gapi.client.drive.files.delete({ fileId });
            // Also clear driveFileId from local project
            const store = this._getProjectsStore();
            Object.values(store).forEach(p => {
                if (p.driveFileId === fileId) {
                    p.driveFileId = null;
                    if (this.currentProject && this.currentProject.id === p.id) {
                        this.currentProject.driveFileId = null;
                    }
                }
            });
            this._saveProjectsStore(store);
        } catch (err) {
            console.error('Drive delete error:', err);
        }
    }

    /** Sync all local projects to Drive */
    async syncAllToDrive() {
        if (!this.isSignedIn()) return;
        const projects = this.listLocalProjects();
        for (const p of projects) {
            await this.saveToDrive(p.id);
        }
    }

    /** Pull all Drive files and merge with local */
    async pullFromDrive() {
        if (!this.isSignedIn()) return;

        this._setStatus('syncing');
        const driveFiles = await this.listDriveFiles();
        const store = this._getProjectsStore();

        for (const file of driveFiles) {
            try {
                const resp = await gapi.client.drive.files.get({
                    fileId: file.id,
                    alt: 'media'
                });
                const fileData = typeof resp.result === 'string'
                    ? JSON.parse(resp.result)
                    : resp.result;

                const localId = fileData.projectId || this.generateProjectId();
                const existing = store[localId];

                // Only overwrite if Drive is newer
                if (!existing || new Date(fileData.lastModified) > new Date(existing.lastModified)) {
                    store[localId] = {
                        id: localId,
                        name: fileData.name || file.name,
                        lastModified: fileData.lastModified || file.modifiedTime,
                        driveFileId: file.id,
                        data: fileData.data
                    };
                }
            } catch (e) {
                console.warn('Failed to pull file:', file.name, e);
            }
        }

        this._saveProjectsStore(store);
        this._setStatus('synced');
        if (this.onProjectChange) this.onProjectChange(this.currentProject);
    }

    // ═══════════════════════════════════════════
    //  DRIVE API HELPERS (multipart upload)
    // ═══════════════════════════════════════════

    async _driveCreateFile(metadata, content) {
        const boundary = '-------fihnya_boundary';
        const delimiter = '\r\n--' + boundary + '\r\n';
        const closeDelimiter = '\r\n--' + boundary + '--';

        const body =
            delimiter +
            'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            'Content-Type: application/json\r\n\r\n' +
            content +
            closeDelimiter;

        const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': `multipart/related; boundary=${boundary}`,
            },
            body: body,
        });

        if (!resp.ok) {
            const err = new Error('Drive create failed');
            err.status = resp.status;
            throw err;
        }

        return await resp.json();
    }

    async _driveUpdateFile(fileId, content, metadata) {
        const boundary = '-------fihnya_boundary';
        const delimiter = '\r\n--' + boundary + '\r\n';
        const closeDelimiter = '\r\n--' + boundary + '--';

        const body =
            delimiter +
            'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
            JSON.stringify({ name: metadata.name }) +
            delimiter +
            'Content-Type: application/json\r\n\r\n' +
            content +
            closeDelimiter;

        const resp = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': `multipart/related; boundary=${boundary}`,
            },
            body: body,
        });

        if (!resp.ok) {
            const err = new Error('Drive update failed');
            err.status = resp.status;
            throw err;
        }

        return await resp.json();
    }

    // ═══════════════════════════════════════════
    //  AUTO-SYNC TOGGLE
    // ═══════════════════════════════════════════

    setAutoSync(enabled) {
        this.autoSyncEnabled = enabled;
        this._saveSetting('fihnya-auto-sync', enabled ? 'true' : 'false');
        if (!enabled) {
            clearTimeout(this._driveSyncTimer);
        }
        if (this.onStatusChange) this.onStatusChange(this.syncStatus);
    }

    // ═══════════════════════════════════════════
    //  STATUS & SETTINGS HELPERS
    // ═══════════════════════════════════════════

    _setStatus(status) {
        this.syncStatus = status;
        if (this.onStatusChange) this.onStatusChange(status);
    }

    _saveSetting(key, value) {
        try { localStorage.setItem(key, value); } catch (e) { /* quota exceeded */ }
    }

    _loadSetting(key) {
        try { return localStorage.getItem(key); } catch { return null; }
    }

    _removeSetting(key) {
        try { localStorage.removeItem(key); } catch { /* ignore */ }
    }
}
