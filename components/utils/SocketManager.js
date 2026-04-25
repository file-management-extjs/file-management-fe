Ext.define('FileManagement.components.utils.SocketManager', {
    singleton: true,

    requires: [
        'FileManagement.components.utils.NotificationUtil',
        'FileManagement.components.utils.ProgressBarManager',
        'FileManagement.components.utils.PanelUtils',
        'FileManagement.components.status.ScanQueuePanel',
        'FileManagement.components.status.MediaConversionQueuePanel',
        'FileManagement.components.status.DocumentConversionQueuePanel',
        'FileManagement.helpers.Functions'
    ],

    socket: null,
    backgroundActivityRestorePromise: null,
    scanGridRefreshTask: null,

    initSocket: function() {
            const token = FileManagement.helpers.Functions.getToken();
            const userId = FileManagement.helpers.Functions.getUserId();

        if (!this.socket) {
            this.socket = io.connect(FileManagementEnv.socketUrl(), {
                auth: {
                    token: token
                }
            });

	            this.socket.on('connect', () => {
	                // Join user's room on connection
	                if (userId) {
	                    this.socket.emit('joinRoom', userId);
	                }

	                Ext.defer(() => {
	                    this.restoreBackgroundActivityState();
	                }, 250);
	            });

            // Listen for compression progress
	            this.socket.on('compressionProgress', (data) => {
	                this.restoreProgressActivity(data, {
	                    activityType: 'Compression',
	                    operationType: 'compression',
	                    title: `Compressing ${data.fileName || 'archive'}`
	                });
	                FileManagement.components.utils.ProgressBarManager.updateProgress(
	                    data.progressId,
	                    data.progress,
                    `Compressing ${data.fileName} (${data.progress}%)`
                );
            });

            // Listen for compression completion
	            this.socket.on('compressionComplete', (data) => {
	                this.restoreProgressActivity(data, {
	                    activityType: 'Compression',
	                    operationType: 'compression',
	                    title: `Compressing ${data.fileName || 'archive'}`
	                });
	                FileManagement.components.utils.ProgressBarManager.markActivityStatus(
                    data.progressId,
                    'completed',
                    'Completed'
                );
                FileManagement.components.utils.ProgressBarManager.updateProgress(
                    data.progressId,
                    100,
                    'Compression Complete'
                );
                FileManagement.components.utils.ProgressBarManager.runCallback(
                    data.progressId,
                    'onComplete',
                    data
                );
	                FileManagement.components.utils.ProgressBarManager.removeProgressBar(data.progressId);
	                const fileGrid = FileManagement.components.utils.PanelUtils.getPrimaryFileGrid();
	                if (fileGrid && fileGrid.getStore()) {
	                    fileGrid.getStore().reload();
	                }
	                FileManagement.components.utils.PanelUtils.refreshHomeDashboard();
	            });

            // Listen for compression errors
	            this.socket.on('compressionError', (data) => {
	                this.restoreProgressActivity(data, {
	                    activityType: 'Compression',
	                    operationType: 'compression',
	                    title: `Compressing ${data.fileName || 'archive'}`
	                });
	                FileManagement.components.utils.ProgressBarManager.markActivityStatus(
                    data.progressId,
                    'failed',
                    'Failed',
                    data.error || 'Compression failed'
                );
                FileManagement.components.utils.ProgressBarManager.runCallback(
                    data.progressId,
                    'onError',
                    data
                );
                FileManagement.components.utils.ProgressBarManager.removeProgressBar(data.progressId);
                
                // Show error in a user-friendly dialog
                Ext.Msg.show({
                    title: 'Compression Error',
                    message: data.error || 'An error occurred during compression',
                    buttons: Ext.Msg.OK,
                    icon: Ext.Msg.ERROR
                });
            });

	            this.socket.on('compressionCancelled', (data) => {
	                this.restoreProgressActivity(data, {
	                    activityType: 'Compression',
	                    operationType: 'compression',
	                    title: `Compressing ${data.fileName || 'archive'}`
	                });
	                FileManagement.components.utils.ProgressBarManager.markActivityStatus(
                    data.progressId,
                    'cancelled',
                    'Cancelled'
                );
                FileManagement.components.utils.ProgressBarManager.runCallback(
                    data.progressId,
                    'onCancel',
                    data
                );
                FileManagement.components.utils.ProgressBarManager.removeProgressBar(data.progressId);
            });

	            this.socket.on('mediaConversionUpdate', data => this.handleMediaConversionUpdate(data));
	            this.socket.on('documentConversionUpdate', data => this.handleDocumentConversionUpdate(data));
	            this.socket.on('contentIntelligenceUpdate', data => this.handleContentIntelligenceUpdate(data));
	            this.socket.on('activityEvent', data => {
	                const activityCenter = FileManagement.components.status && FileManagement.components.status.ActivityCenterPanel;
	                if (activityCenter && activityCenter.handleActivityEvent) {
	                    activityCenter.handleActivityEvent(data);
	                }
	            });

            // Listen for download progress
            this.socket.on('downloadProgress', (data) => {
                FileManagement.components.utils.ProgressBarManager.updateProgress(
                    data.progressId,
                    data.progress,
                    `Downloading ${data.fileName} (${data.progress}%)`
                );
            });

            // Listen for download completion
            this.socket.on('downloadComplete', (data) => {
                FileManagement.components.utils.ProgressBarManager.markActivityStatus(
                    data.progressId,
                    'completed',
                    'Completed'
                );
                FileManagement.components.utils.ProgressBarManager.updateProgress(
                    data.progressId,
                    100,
                    'Download Complete'
                );
                FileManagement.components.utils.ProgressBarManager.removeProgressBar(data.progressId);
            });

            // Listen for moving progress
	            this.socket.on('movingProgress', (data) => {
	                this.restoreProgressActivity(data, {
	                    activityType: 'Move',
	                    title: data.itemName ? `Moving ${data.itemName}` : 'Moving items'
	                });
	                FileManagement.components.utils.ProgressBarManager.updateProgress(
                    data.progressId,
                    data.progress,
                    `Moving ${data.itemName} (${data.progress}%)`
                );
                FileManagement.components.utils.ProgressBarManager.updateQueuedStatus(data.progressId, data.itemName, 'Moved');
            });

            this.socket.on('connect_error', (error) => {
                console.error('Socket connection error:', error);

                if (error && String(error.message || '').indexOf('Authentication error') !== -1) {
                    FileManagement.helpers.Functions.handleSessionExpired('Your session is no longer valid. Please log in again.', {
                        reason: 'socket-auth-failure'
                    });
                    return;
                }
                
                // Show connection error to user
                Ext.Msg.show({
                    title: 'Connection Error',
                    message: 'Lost connection to server. Please check your internet connection.',
                    buttons: Ext.Msg.OK,
                    icon: Ext.Msg.WARNING
                });
            });

            this.socket.on('forceLogout', () => {
                FileManagement.helpers.Functions.handleSessionExpired('You have been logged out.', {
                    title: 'Logged Out',
                    reason: 'socket-force-logout'
                });
            });

            // Listen for decompression progress
	            this.socket.on('decompressionProgress', (data) => {
	                this.restoreProgressActivity(data, {
	                    activityType: 'Extraction',
	                    title: `Extracting ${data.fileName || 'archive'}`
	                });
	                FileManagement.components.utils.ProgressBarManager.updateProgress(
	                    data.progressId,
	                    data.progress,
	                    `Extracting ${data.fileName || 'archive'} (${data.progress}%)`
	                );

	                if (data.progress) {
                    // Find any active extraction dialogs
                    const extractionDialog = Ext.ComponentQuery.query('extractiondialog')[0];
                    if (extractionDialog && extractionDialog.isVisible()) {
                        extractionDialog.mask(`Extracting Files... Please wait (${data.progress}%)`);
                    }
                }
            });

            this.initCancellationListeners();
            this.setupListeners();
            
        }
    },

    setupListeners: function() {
        this.socket.on('fileScanUpdate', data => this.handleFileScanUpdate(data));
    },

    getUserSetting: function(path, fallback) {
        const settings = FileManagement.components.settings && FileManagement.components.settings.UserSettings;
        return settings && settings.get ? settings.get(path, fallback) : fallback;
    },

    shouldNotify: function(category, fallback) {
        const settings = FileManagement.components.settings && FileManagement.components.settings.UserSettings;
        return settings && settings.shouldNotify ? settings.shouldNotify(category, fallback) : fallback !== false;
    },

	    cancelOperation: function(jobId, progressId = null, operationType = null) {
	        if (this.socket) {
	            this.socket.emit('cancelOperation', { jobId, progressId, operationType });
            // Remove progress bar immediately for better UX
            FileManagement.components.utils.ProgressBarManager.markActivityStatus(
                progressId || jobId,
                'cancelled',
                'Cancelled'
            );
            FileManagement.components.utils.ProgressBarManager.removeProgressBar(progressId || jobId);
        }
    },

    // Listen for operation cancellation response
    initCancellationListeners: function() {
        this.socket.on('operationCancelled', (data) => {
            // Progress bar already removed in cancelOperation
        });

        this.socket.on('operationCancelError', (data) => {
            console.error('Failed to cancel operation:', data.jobId, data.error);
            // Could show an error message to user here if needed
        });
    },

    handleFileScanUpdate: function(data) {
        const { fileId, fileName, status, result, error } = data;
        FileManagement.components.status.ScanQueuePanel.handleScanUpdate(data);

        Ext.ComponentQuery.query('filegrid').forEach(grid => {
            if (grid && grid.handleUploadScanUpdate) {
                grid.handleUploadScanUpdate(data);
            }
        });

        const shouldNotifyScanResult = this.getUserSetting('scanning.notifyOnComplete', true) !== false &&
            this.shouldNotify('scans', true);

        if (status === 'infected') {
            Ext.defer(function() {
                FileManagement.components.utils.NotificationUtil.showScanResultNotification(fileName, true, {
                    suppressToast: !shouldNotifyScanResult
                });
            }, 100);
        } else if (status === 'clean') {
            Ext.defer(function() {
                FileManagement.components.utils.NotificationUtil.showScanResultNotification(fileName, false, {
                    suppressToast: !shouldNotifyScanResult
                });
            }, 100);
        } else if (status === 'error') {
            Ext.defer(function() {
                if (shouldNotifyScanResult) {
                    FileManagement.components.utils.NotificationUtil.showError(
                        `Virus scan failed for "${fileName}": ${result || error || 'Unknown error'}`,
                        'Virus Scan Error',
                        { category: 'scans' }
                    );
                }

                if (FileManagement.components.utils.NotificationUtil.closeScanningNotification) {
                    FileManagement.components.utils.NotificationUtil.closeScanningNotification(fileName);
                }
            }, 100);
        }   

        if (['clean', 'infected', 'error'].includes(status)) {
            this.scheduleScanGridRefresh();
        }
    },

    scheduleScanGridRefresh: function() {
        if (this.scanGridRefreshTask) {
            clearTimeout(this.scanGridRefreshTask);
        }

        this.scanGridRefreshTask = Ext.defer(() => {
            this.scanGridRefreshTask = null;

            Ext.ComponentQuery.query('filegrid').forEach(grid => {
                if (grid && grid.getStore && grid.getStore()) {
                    grid.getStore().reload();
                }
            });

            FileManagement.components.utils.PanelUtils.refreshHomeDashboard();
        }, 300);
    },

	    handleMediaConversionUpdate: function(data) {
	        const progressId = data.progressId || data.jobId;
	        const progressBar = FileManagement.components.utils.ProgressBarManager.getProgressBar(progressId);

	        FileManagement.components.status.MediaConversionQueuePanel.handleUpdate(data);
	        if (!progressBar && !['completed', 'failed', 'cancelled'].includes(data.status)) {
	            this.restoreProgressActivity(data, {
	                activityType: 'Media Conversion',
	                operationType: 'mediaConversion',
	                title: data.message || `Converting ${data.fileName || 'media'}`
	            });
	        }

        if (progressBar) {
            if (data.jobId && !progressBar.jobId) {
                FileManagement.components.utils.ProgressBarManager.setJobId(progressId, data.jobId);
            }

            if (['queued', 'running', 'saving'].includes(data.status)) {
                FileManagement.components.utils.ProgressBarManager.updateProgress(
                    progressId,
                    data.progress || 0,
                    data.message || `Converting ${data.fileName || 'media'}`
                );
            }

            if (data.status === 'completed') {
                FileManagement.components.utils.ProgressBarManager.updateProgress(
                    progressId,
                    100,
                    data.message || 'Media conversion complete'
                );
                FileManagement.components.utils.ProgressBarManager.runCallback(progressId, 'onComplete', data);
                Ext.defer(function() {
                    FileManagement.components.utils.ProgressBarManager.removeProgressBar(progressId);
                }, 1200);
            } else if (data.status === 'failed') {
                FileManagement.components.utils.ProgressBarManager.runCallback(progressId, 'onError', data);
                FileManagement.components.utils.ProgressBarManager.removeProgressBar(progressId);
            } else if (data.status === 'cancelled') {
                FileManagement.components.utils.ProgressBarManager.runCallback(progressId, 'onCancel', data);
                FileManagement.components.utils.ProgressBarManager.removeProgressBar(progressId);
            }
        }

        if (data.status === 'completed') {
            const fileGrid = FileManagement.components.utils.PanelUtils.getPrimaryFileGrid();
            if (fileGrid && fileGrid.getStore()) {
                fileGrid.getStore().reload();
            }
            FileManagement.components.utils.PanelUtils.refreshHomeDashboard();
            FileManagement.components.utils.NotificationUtil.showInfo(
                data.message || 'Media conversion completed.',
                'Media Conversion Hub',
                { category: 'conversions' }
            );
        } else if (data.status === 'failed') {
            Ext.Msg.show({
                title: 'Media Conversion Error',
                message: data.error || 'Media conversion failed.',
                buttons: Ext.Msg.OK,
                icon: Ext.Msg.ERROR
            });
        }
    },

	    handleDocumentConversionUpdate: function(data) {
	        const progressId = data.progressId || data.jobId;
	        const progressBar = FileManagement.components.utils.ProgressBarManager.getProgressBar(progressId);

	        FileManagement.components.status.DocumentConversionQueuePanel.handleUpdate(data);
	        if (!progressBar && !['completed', 'failed', 'cancelled'].includes(data.status)) {
	            this.restoreProgressActivity(data, {
	                activityType: 'Document Conversion',
	                operationType: 'documentConversion',
	                title: data.message || data.currentFileName || `Converting ${data.fileName || 'documents'}`
	            });
	        }

        if (progressBar) {
            if (data.jobId && !progressBar.jobId) {
                FileManagement.components.utils.ProgressBarManager.setJobId(progressId, data.jobId);
            }

            if (['queued', 'running', 'saving'].includes(data.status)) {
                FileManagement.components.utils.ProgressBarManager.updateProgress(
                    progressId,
                    data.progress || 0,
                    data.message || data.currentFileName || `Converting ${data.fileName || 'documents'}`
                );
            }

            if (data.status === 'completed') {
                FileManagement.components.utils.ProgressBarManager.updateProgress(
                    progressId,
                    100,
                    data.message || 'Document conversion complete'
                );
                FileManagement.components.utils.ProgressBarManager.runCallback(progressId, 'onComplete', data);
                Ext.defer(function() {
                    FileManagement.components.utils.ProgressBarManager.removeProgressBar(progressId);
                }, 1200);
            } else if (data.status === 'failed') {
                FileManagement.components.utils.ProgressBarManager.runCallback(progressId, 'onError', data);
                FileManagement.components.utils.ProgressBarManager.removeProgressBar(progressId);
            } else if (data.status === 'cancelled') {
                FileManagement.components.utils.ProgressBarManager.runCallback(progressId, 'onCancel', data);
                FileManagement.components.utils.ProgressBarManager.removeProgressBar(progressId);
            }
        }

        if (data.status === 'completed') {
            const fileGrid = FileManagement.components.utils.PanelUtils.getPrimaryFileGrid();
            if (fileGrid && fileGrid.getStore()) {
                fileGrid.getStore().reload();
            }
            FileManagement.components.utils.PanelUtils.refreshHomeDashboard();
            FileManagement.components.utils.NotificationUtil.showInfo(
                data.message || 'Document conversion completed.',
                'Document Conversion Suite',
                { category: 'conversions' }
            );
        } else if (data.status === 'failed') {
            Ext.Msg.show({
                title: 'Document Conversion Error',
                message: data.error || 'Document conversion failed.',
                buttons: Ext.Msg.OK,
                icon: Ext.Msg.ERROR
            });
        }
	    },

	    handleContentIntelligenceUpdate: function(data) {
	        const progressId = data.progressId || data.jobId;
	        const progressBar = FileManagement.components.utils.ProgressBarManager.getProgressBar(progressId);

	        if (!progressBar && !['completed', 'failed', 'cancelled'].includes(data.status)) {
	            this.restoreProgressActivity(data, {
	                activityType: 'Content Intelligence',
	                operationType: 'contentIntelligence',
	                title: data.message || `Analyzing ${data.fileName || 'file'}`
	            });
	        }

	        if (progressBar) {
	            if (data.jobId && !progressBar.jobId) {
	                FileManagement.components.utils.ProgressBarManager.setJobId(progressId, data.jobId);
	            }

	            if (['queued', 'processing', 'running'].includes(data.status)) {
	                FileManagement.components.utils.ProgressBarManager.updateProgress(
	                    progressId,
	                    data.progress || 0,
	                    data.message || `Analyzing ${data.fileName || 'file'}`
	                );
	            }

	            if (data.status === 'completed') {
	                FileManagement.components.utils.ProgressBarManager.updateProgress(
	                    progressId,
	                    100,
	                    data.message || 'Content intelligence complete'
	                );
	                FileManagement.components.utils.ProgressBarManager.runCallback(progressId, 'onComplete', data);
	                Ext.defer(function() {
	                    FileManagement.components.utils.ProgressBarManager.removeProgressBar(progressId);
	                }, 1200);
	            } else if (data.status === 'failed') {
	                FileManagement.components.utils.ProgressBarManager.runCallback(progressId, 'onError', data);
	                FileManagement.components.utils.ProgressBarManager.removeProgressBar(progressId);
	            } else if (data.status === 'cancelled') {
	                FileManagement.components.utils.ProgressBarManager.runCallback(progressId, 'onCancel', data);
	                FileManagement.components.utils.ProgressBarManager.removeProgressBar(progressId);
	            }
	        }

	        if (['completed', 'failed'].includes(data.status)) {
	            Ext.ComponentQuery.query('filegrid').forEach(grid => {
	                if (grid && grid.getStore && grid.getStore()) {
	                    grid.getStore().reload();
	                }
	            });
	        }

	        if (data.status === 'completed') {
	            FileManagement.components.utils.NotificationUtil.showInfo(
	                data.message || 'Content intelligence completed.',
	                'Content Intelligence',
	                { category: 'conversions' }
	            );
	        } else if (data.status === 'failed') {
	            Ext.Msg.show({
	                title: 'Content Intelligence Error',
	                message: data.error || 'Content intelligence failed.',
	                buttons: Ext.Msg.OK,
	                icon: Ext.Msg.ERROR
	            });
	        }
	    },

	    restoreBackgroundActivityState: function() {
	        if (this.backgroundActivityRestorePromise) {
	            return this.backgroundActivityRestorePromise;
	        }

	        const token = FileManagement.helpers.Functions.getToken();
	        if (!token) {
	            return Promise.resolve(null);
	        }

	        this.backgroundActivityRestorePromise = fetch(FileManagementEnv.apiUrl('/api/files/background-activity'), {
	            headers: {
	                'Authorization': `Bearer ${token}`
	            }
	        })
	            .then(response => response.ok ? response.json() : null)
	            .then(state => {
	                if (!state || state.success === false) {
	                    return;
	                }

	                (state.uploads || []).forEach(upload => {
	                    if (FileManagement.components.utils.UploadSessionManager &&
	                        FileManagement.components.utils.UploadSessionManager.syncServerUploadProgress) {
	                        FileManagement.components.utils.UploadSessionManager.syncServerUploadProgress([upload]);
	                    }
	                });

	                (state.scans || []).forEach(scan => this.handleFileScanUpdate(scan));

	                (state.compression || []).forEach(job => {
	                    this.restoreProgressActivity(job, {
	                        activityType: 'Compression',
	                        operationType: 'compression',
	                        title: job.title || `Compressing ${job.fileName || 'archive'}`
	                    });
	                });

	                (state.mediaConversions || []).forEach(job => {
	                    FileManagement.components.status.MediaConversionQueuePanel.handleUpdate(job);
	                    this.restoreProgressActivity(job, {
	                        activityType: 'Media Conversion',
	                        operationType: 'mediaConversion',
	                        title: job.message || `Converting ${job.fileName || 'media'}`
	                    });
	                });

	                (state.documentConversions || []).forEach(job => {
	                    FileManagement.components.status.DocumentConversionQueuePanel.handleUpdate(job);
	                    this.restoreProgressActivity(job, {
	                        activityType: 'Document Conversion',
	                        operationType: 'documentConversion',
	                        title: job.message || `Converting ${job.fileName || 'documents'}`
	                    });
	                });

	                (state.contentIntelligence || []).forEach(job => {
	                    this.restoreProgressActivity(job, {
	                        activityType: 'Content Intelligence',
	                        operationType: 'contentIntelligence',
	                        title: job.message || `Analyzing ${job.fileName || 'file'}`
	                    });
	                });

	                (state.operations || []).forEach(operation => {
	                    this.restoreProgressActivity(operation, {
	                        activityType: operation.type || operation.activityType || 'Background Job',
	                        title: operation.title || 'Background operation'
	                    });
	                });

	                if (FileManagement.components.status.ActivityCenterPanel &&
	                    FileManagement.components.status.ActivityCenterPanel.ingestPersistedEvents) {
	                    FileManagement.components.status.ActivityCenterPanel.ingestPersistedEvents(state.events || []);
	                }

	                if (FileManagement.components.status.ActivityCenterPanel) {
	                    FileManagement.components.status.ActivityCenterPanel.notifyChanged();
	                }

	                Ext.ComponentQuery.query('filegrid').forEach(grid => {
	                    if (grid && grid.restoreOperationRows) {
	                        grid.restoreOperationRows();
	                    }
	                });

	                if (Ext.GlobalEvents) {
	                    Ext.GlobalEvents.fireEvent('backgroundactivityrestored', state);
	                }

	                return state;
	            })
	            .catch(error => {
	                console.error('Failed to restore background activity state:', error);
	                return null;
	            })
	            .then(state => {
	                Ext.defer(() => {
	                    this.backgroundActivityRestorePromise = null;
	                }, 1000);

	                return state;
	            });

	        return this.backgroundActivityRestorePromise;
	    },

	    restoreProgressActivity: function(data = {}, options = {}) {
	        const progressId = data.progressId || data.relatedProgressId || data.jobId;
	        if (!progressId) {
	            return null;
	        }

	        const status = data.status || 'running';
	        const activityType = options.activityType || data.activityType || 'Background Job';
	        const title = options.title || data.title || data.message || data.fileName || 'Background operation';
	        const progressManager = FileManagement.components.utils.ProgressBarManager;
	        const canCancel = ['compression', 'mediaConversion', 'documentConversion', 'contentIntelligence'].includes(options.operationType);
	        const activityCenter = FileManagement.components.status && FileManagement.components.status.ActivityCenterPanel;

	        const progressBar = progressManager.restoreOrUpdateProgressBar(progressId, {
	            jobId: data.jobId || null,
	            title,
	            text: title,
	            status,
	            statusText: data.statusText || (activityCenter && activityCenter.humanizeStatus
	                ? activityCenter.humanizeStatus(status)
	                : status),
	            detail: data.detail || data.error || data.message || '',
	            progress: data.progress || 0,
	            activityType,
	            affectedFiles: data.affectedFiles || data.files || [],
	            cancelCallback: canCancel
	                ? () => this.cancelOperation(data.jobId || null, progressId, options.operationType)
	                : null,
	            suppressToast: true
	        });

	        if (['completed', 'complete', 'failed', 'error', 'cancelled', 'canceled'].includes(String(status).toLowerCase())) {
	            Ext.defer(() => {
	                if (progressManager.getProgressBar(progressId)) {
	                    progressManager.removeProgressBar(progressId);
	                }
	            }, 1800);
	        }

	        return progressBar;
	    }
	});
