Ext.define('FileManagement.components.utils.UploadSessionManager', {
    singleton: true,

    storageKey: 'fileManagement.pendingUploads',
    recoveryPanel: null,
    initialized: false,
    settingsListenerInstalled: false,

    init: function() {
        if (this.initialized) {
            return;
        }

        this.initialized = true;
        this.installSettingsListener();

        window.addEventListener('beforeunload', (event) => {
            if (!this.isAutoResumeEnabled() || !this.hasRecoverableSessions()) {
                return;
            }

            if (event.cancelable !== false) {
                event.preventDefault();
            }
            event.returnValue = '';
        });

        if (!this.isAutoResumeEnabled()) {
            this.discardAllRecoverableSessions();
            return;
        }

        this.markStaleActiveSessionsInterrupted();

        Ext.defer(() => {
            this.showRecoveryPanelIfNeeded();
        }, 500);
    },

    getUserSetting: function(path, fallback) {
        const settings = FileManagement.components.settings && FileManagement.components.settings.UserSettings;
        return settings && settings.get ? settings.get(path, fallback) : fallback;
    },

    isAutoResumeEnabled: function() {
        return this.getUserSetting('uploads.autoResumeInterrupted', true) !== false;
    },

    shouldAutoShowRecoveryPanel: function() {
        return this.isAutoResumeEnabled() &&
            this.getUserSetting('uploads.showRecoveryPanel', true) !== false;
    },

    installSettingsListener: function() {
        if (this.settingsListenerInstalled || !Ext.GlobalEvents) {
            return;
        }

        this.settingsListenerInstalled = true;
        Ext.GlobalEvents.on('usersettingschanged', function() {
            if (!this.isAutoResumeEnabled()) {
                this.discardAllRecoverableSessions();
                if (this.recoveryPanel && !this.recoveryPanel.destroyed) {
                    this.recoveryPanel.hide();
                }
                return;
            }

            this.markStaleActiveSessionsInterrupted();
            this.showRecoveryPanelIfNeeded();
        }, this);
    },

    createSession: function(files, folderId = '', workspaceId = '') {
        const session = {
            id: `upload-session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            folderId: folderId || '',
            workspaceId: workspaceId || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            status: 'active',
            files: Array.from(files || []).map(file => this.createFileSnapshot(file))
        };

        const sessions = this.getSessions();
        sessions.push(session);
        this.saveSessions(sessions);

        return session.id;
    },

    ensureSession: function(sessionId, files, folderId = '', workspaceId = '') {
        const sessions = this.getSessions();
        const existingSession = sessions.find(session => session.id === sessionId);

        if (existingSession) {
            existingSession.status = 'active';
            existingSession.updatedAt = new Date().toISOString();
            existingSession.folderId = folderId || existingSession.folderId || '';
            existingSession.workspaceId = workspaceId || existingSession.workspaceId || '';
            this.saveSessions(sessions);
            return existingSession.id;
        }

        return this.createSession(files, folderId, workspaceId);
    },

    markFileStatus: function(sessionId, file, status, progress = null) {
        this.updateSessionFile(sessionId, file, function(fileMeta) {
            fileMeta.status = status;
            if (progress !== null) {
                fileMeta.progress = progress;
            }
        });
    },

    updateFileProgress: function(sessionId, file, progress) {
        this.updateSessionFile(sessionId, file, function(fileMeta) {
            fileMeta.status = progress >= 100 ? 'complete' : 'uploading';
            fileMeta.progress = progress;
        });
    },

    completeFile: function(sessionId, file) {
        this.markFileStatus(sessionId, file, 'complete', 100);
        this.removeSessionIfComplete(sessionId);
    },

    cancelFile: function(sessionId, file) {
        this.updateSessionFile(sessionId, file, function(fileMeta) {
            fileMeta.status = 'cancelled';
            fileMeta.progress = 0;
        });
        this.removeSessionIfComplete(sessionId);
    },

    interruptSession: function(sessionId) {
        const sessions = this.getSessions();
        const session = sessions.find(currentSession => currentSession.id === sessionId);

        if (!session) {
            return;
        }

        session.status = 'interrupted';
        session.updatedAt = new Date().toISOString();
        session.files.forEach(file => {
            if (file.status !== 'complete' && file.status !== 'cancelled') {
                file.status = file.progress > 0 ? 'interrupted' : 'queued';
            }
        });
        this.saveSessions(sessions);
    },

    removeSession: function(sessionId) {
        this.saveSessions(this.getSessions().filter(session => session.id !== sessionId));
    },

    discardAllRecoverableSessions: function() {
        const sessions = this.getSessions().filter(session => !this.isRecoverableSession(session));
        this.saveSessions(sessions);
    },

    discardSessions: function(sessionsToDiscard) {
        const discardIds = (sessionsToDiscard || []).map(session => session.id);

        (sessionsToDiscard || []).forEach(session => {
            (session.files || [])
                .filter(file => file.status !== 'complete' && file.status !== 'cancelled')
                .forEach(file => {
                    this.resetServerUpload(file.name, session.folderId, session.workspaceId);
                });
        });

        this.saveSessions(this.getSessions().filter(session => !discardIds.includes(session.id)));
    },

    getRecoverableSessions: function() {
        if (!this.isAutoResumeEnabled()) {
            return [];
        }

        return this.getSessions().filter(session => this.isRecoverableSession(session));
    },

    getInterruptedSessions: function() {
        return this.getSessions().filter(session =>
            session.status === 'interrupted' && this.isRecoverableSession(session)
        );
    },

    hasRecoverableSessions: function() {
        return this.getRecoverableSessions().length > 0;
    },

    showRecoveryPanelIfNeeded: function() {
        const sessions = this.getRecoverableSessions();

        if (!sessions.length) {
            return;
        }

        if (!this.shouldAutoShowRecoveryPanel()) {
            return;
        }

        this.showRecoveryPanel(sessions);
    },

    restoreRecoveryPanel: function() {
        if (!this.isAutoResumeEnabled()) {
            FileManagement.components.utils.NotificationUtil.showInfo(
                'Interrupted upload recovery is disabled in Settings.',
                'Interrupted Uploads',
                { ignoreUserSettings: true }
            );
            return;
        }

        if (!this.hasRecoverableSessions()) {
            FileManagement.components.utils.NotificationUtil.showInfo(
                'There are no interrupted uploads to resume.',
                'Interrupted Uploads',
                { ignoreUserSettings: true }
            );
            return;
        }

        this.showRecoveryPanel();
    },

    showRecoveryPanel: function(sessions = null) {
        const recoverableSessions = sessions || this.getRecoverableSessions();

        if (!recoverableSessions.length) {
            return;
        }

        if (!this.recoveryPanel || this.recoveryPanel.destroyed) {
            this.recoveryPanel = Ext.create('FileManagement.components.status.UploadRecoveryPanel', {
                sessions: recoverableSessions
            });
        } else {
            this.recoveryPanel.loadSessions(recoverableSessions);
        }

        this.recoveryPanel.show();
        this.recoveryPanel.toFront();
    },

    matchFilesToSessions: function(files, sessions) {
        const selectedFiles = Array.from(files || []);
        const selectedBySignature = {};
        const groups = [];
        const missingFiles = [];

	        selectedFiles.forEach(file => {
	            selectedBySignature[this.getFileSignature(file)] = file;
	        });

        sessions.forEach(session => {
            const filesForSession = [];

            session.files
                .filter(fileMeta => fileMeta.status !== 'complete' && fileMeta.status !== 'cancelled')
	                .forEach(fileMeta => {
	                    const selectedFile = selectedBySignature[fileMeta.signature] ||
	                        selectedFiles.find(file => this.matchesLooseFileIdentity(file, fileMeta));
	                    if (selectedFile) {
	                        filesForSession.push(selectedFile);
	                    } else {
                        missingFiles.push(fileMeta);
                    }
                });

            if (filesForSession.length) {
                groups.push({
                    session,
                    files: filesForSession
                });
            }
        });

	        return { groups, missingFiles };
	    },

	    syncServerUploadProgress: function(uploads) {
	        if (!this.isAutoResumeEnabled()) {
	            return;
	        }

	        const serverUploads = Array.isArray(uploads) ? uploads : [];
	        if (!serverUploads.length) {
	            return;
	        }

	        const sessions = this.getSessions();
	        let changed = false;

	        serverUploads.forEach(upload => {
	            const folderId = upload.folderId || '';
	            const workspaceId = upload.workspaceId || '';
	            const fileName = upload.fileName || upload.filename;
	            const fileSize = Number(upload.fileSize) || 0;
	            const progress = Math.max(0, Math.min(Number(upload.progress) || 0, 100));

	            if (!fileName) {
	                return;
	            }

	            let existingFile = null;
	            const existingSession = sessions.find(session =>
	                (session.folderId || '') === folderId &&
                    (session.workspaceId || '') === workspaceId &&
	                (existingFile = (session.files || []).find(file =>
	                    file.name === fileName &&
	                    (!file.size || !fileSize || Number(file.size) === fileSize) &&
	                    file.status !== 'complete' &&
	                    file.status !== 'cancelled'
	                ))
	            );

	            if (existingSession && existingFile) {
	                const sessionIsActive = existingSession.status === 'active';
	                existingSession.status = sessionIsActive ? 'active' : 'interrupted';
	                existingSession.updatedAt = new Date().toISOString();
	                existingFile.progress = progress;
	                existingFile.status = sessionIsActive
	                    ? (progress >= 100 ? 'complete' : 'uploading')
	                    : (progress > 0 ? 'interrupted' : 'queued');
	                if (fileSize && !existingFile.size) {
	                    existingFile.size = fileSize;
	                }
	                changed = true;
	                return;
	            }

	            sessions.push({
	                id: `server-upload-${upload.id || Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
	                folderId,
                    workspaceId,
	                createdAt: upload.createdAt || new Date().toISOString(),
	                updatedAt: new Date().toISOString(),
	                status: 'interrupted',
	                files: [{
	                    name: fileName,
	                    size: fileSize,
	                    type: upload.type || '',
	                    lastModified: 0,
	                    signature: null,
	                    status: progress > 0 ? 'interrupted' : 'queued',
	                    progress
	                }]
	            });
	            changed = true;
	        });

	        if (changed) {
	            this.saveSessions(sessions);
	        }
	    },

    updateSessionFile: function(sessionId, file, updater) {
        const sessions = this.getSessions();
        const session = sessions.find(currentSession => currentSession.id === sessionId);

        if (!session) {
            return;
        }

        const signature = this.getFileSignature(file);
        const fileMeta = session.files.find(currentFile => currentFile.signature === signature);

        if (!fileMeta) {
            return;
        }

        updater(fileMeta);
        session.updatedAt = new Date().toISOString();
        this.saveSessions(sessions);
    },

    removeSessionIfComplete: function(sessionId) {
        const sessions = this.getSessions();
        const session = sessions.find(currentSession => currentSession.id === sessionId);

        if (!session) {
            return;
        }

        if (session.files.every(file => file.status === 'complete' || file.status === 'cancelled')) {
            this.removeSession(sessionId);
        }
    },

    markStaleActiveSessionsInterrupted: function() {
        const sessions = this.getSessions();
        let changed = false;

        sessions.forEach(session => {
            if (session.status !== 'active' || !this.isRecoverableSession(session)) {
                return;
            }

            session.status = 'interrupted';
            session.updatedAt = new Date().toISOString();
            (session.files || []).forEach(file => {
                if (file.status !== 'complete' && file.status !== 'cancelled') {
                    file.status = file.progress > 0 ? 'interrupted' : 'queued';
                }
            });
            changed = true;
        });

        if (changed) {
            this.saveSessions(sessions);
        }
    },

    isRecoverableSession: function(session) {
        return session &&
            session.status !== 'cancelled' &&
            Array.isArray(session.files) &&
            session.files.some(file => file.status !== 'complete' && file.status !== 'cancelled');
    },

    createFileSnapshot: function(file) {
        return {
            name: file.name,
            size: file.size,
            type: file.type || '',
            lastModified: file.lastModified || 0,
            signature: this.getFileSignature(file),
            status: 'queued',
            progress: 0
        };
    },

	    getFileSignature: function(file) {
        return [
            file.name,
            file.size,
            file.lastModified || 0
	        ].join('|');
	    },

	    matchesLooseFileIdentity: function(file, fileMeta) {
	        if (!file || !fileMeta || file.name !== fileMeta.name) {
	            return false;
	        }

	        const selectedSize = Number(file.size) || 0;
	        const expectedSize = Number(fileMeta.size) || 0;

	        return !expectedSize || selectedSize === expectedSize;
	    },

    getSessions: function() {
        const raw = localStorage.getItem(this.storageKey);
        if (!raw) {
            return [];
        }

        try {
            const sessions = JSON.parse(raw);
            return Array.isArray(sessions) ? sessions : [];
        } catch (error) {
            console.error('Failed to parse pending uploads:', error);
            return [];
        }
    },

    saveSessions: function(sessions) {
        localStorage.setItem(this.storageKey, JSON.stringify(sessions));
        if (Ext.GlobalEvents) {
            Ext.GlobalEvents.fireEvent('uploadsessionchanged', sessions);
        }
        this.notifyActivityChanged();
    },

    notifyActivityChanged: function() {
        const activityCenter = FileManagement.components.status && FileManagement.components.status.ActivityCenterPanel;
        if (activityCenter && activityCenter.notifyChanged) {
            activityCenter.notifyChanged();
            return;
        }

        if (Ext.GlobalEvents) {
            Ext.GlobalEvents.fireEvent('activitycenterchanged');
        }

        const navPanel = Ext.ComponentQuery.query('navigationpanel')[0];
        if (navPanel && navPanel.refreshActivityCenterCount) {
            navPanel.refreshActivityCenterCount();
        }
    },

    resetServerUpload: function(fileName, folderId, workspaceId = '') {
        const token = FileManagement.helpers.Functions.getToken();

        if (!token) {
            return;
        }

        fetch(FileManagementEnv.apiUrl('/api/files/upload/reset'), {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                filename: fileName,
                folderId: folderId || '',
                workspaceId: workspaceId || ''
            })
        }).catch(error => {
            console.error(`Failed to reset interrupted upload for ${fileName}:`, error);
        });
    }
});
