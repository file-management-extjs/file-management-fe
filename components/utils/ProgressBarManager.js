Ext.define('FileManagement.components.utils.ProgressBarManager', {
    singleton: true,

    requires: [
        'FileManagement.components.utils.ResponsivePanel',
        'FileManagement.components.utils.PanelUtils'
    ],

    progressBars: {},
    queueWindow: null,
    fileQueueStore: null,
    operationsPopover: null,
    progressButton: null,
    activeOperationId: null,

    constructor: function() {
        this.callParent(arguments);

        this.fileQueueStore = Ext.create('Ext.data.Store', {
            fields: ['fileName', 'status', 'progressId'],
            data: []
        });
    },

    init: function() {
        this.fileQueueStore = Ext.create('Ext.data.Store', {
            fields: ['fileName', 'status', 'progressId'],
            data: []
        });

        this.operationsPopover = Ext.create('Ext.panel.Panel', {
            floating: true,
            preventResponsiveFloatingFit: true,
            hidden: true,
            shadow: true,
            width: 400,
            maxHeight: 300,
            minHeight: 30,
            autoScroll: true,
            cls: 'operations-popover',
            layout: {
                type: 'vbox',
                align: 'stretch'
            },
            style: {
                zIndex: 999999
            },
            bodyStyle: {
                background: '#fff',
                padding: '5px'
            },
            items: [],
            listeners: {
                hide: function() {
                    const btn = FileManagement.components.utils.ProgressBarManager.progressButton;
                    if (btn) {
                        btn.removeCls('active');
                    }
                }
            }
        });

        const userToolbar = Ext.getCmp('userToolbar');
        this.progressButton = userToolbar.down('#progressBar').add({
            xtype: 'button',
            itemId: 'operationsButton',
            hidden: true,
            tooltip: 'Activity Center',
            html: '<div class="circular-progress"><span class="percentage">0%</span></div>',
            handler: function(btn) {
                const popover = FileManagement.components.utils.ProgressBarManager.operationsPopover;
                if (popover && popover.isVisible()) {
                    popover.hide();
                }

                btn.removeCls('active');
                FileManagement.components.utils.PanelUtils.openActivityCenter();
            }
        });

        return this.progressButton;
    },

    normalizeOptions: function(options) {
        return options && typeof options === 'object' ? options : {};
    },

    addProgressBar: function(id, text, files = [], cancelCallback = null, options = null) {
        if (this.progressBars[id]) {
            console.warn(`Progress bar with ID "${id}" already exists.`);
            return this.progressBars[id].container;
        }

        if (!this.operationsPopover) {
            this.init();
        }

        const normalizedOptions = this.normalizeOptions(options);
        const normalizedFiles = (files || []).map(file => ({
            fileName: file.fileName || file.name || 'Unnamed file',
            name: file.fileName || file.name || 'Unnamed file',
            status: file.status || 'Queued',
            size: file.size || null,
            type: file.type || file.mimeType || '',
            path: file.path || file.filePath || file.folderPath || file.folder || '',
            progressId: id
        }));

        if (normalizedFiles.length > 0) {
            this.fileQueueStore.add(normalizedFiles);
        }

        const progressContainer = this.operationsPopover.add({
            xtype: 'container',
            layout: 'hbox',
            margin: '0 0 4 0',
            items: [{
                xtype: 'progressbar',
                text: `${text} (0%)`,
                flex: 1,
                value: 0
            }, {
                xtype: 'button',
                iconCls: 'fa fa-ban',
                margin: '0 0 0 5',
                handler: () => {
                    const progressBar = this.progressBars[id];
                    if (!progressBar || typeof progressBar.cancelCallback !== 'function') {
                        console.warn('No cancel handler configured for operation:', id);
                        return;
                    }

                    Promise.resolve(progressBar.cancelCallback(progressBar)).catch((error) => {
                        console.error('Failed to cancel operation:', error);
                    });
                }
            }]
        });

        this.progressBars[id] = {
            container: progressContainer,
            files: normalizedFiles,
            progress: 0,
            text,
            cancelCallback,
            jobId: normalizedOptions.jobId || null,
            onComplete: normalizedOptions.onComplete || null,
	            onError: normalizedOptions.onError || null,
	            onCancel: normalizedOptions.onCancel || null,
	            metadata: normalizedOptions.metadata || {},
	            suppressToast: normalizedOptions.suppressToast === true,
	            suppressButton: normalizedOptions.suppressButton === true,
	            status: 'running',
	            statusText: 'Running',
	            startedAt: new Date(),
	            updatedAt: new Date()
	        };

        this.syncProgressButtonVisibility();

        if (this.operationsPopover.isVisible()) {
            FileManagement.components.utils.ResponsivePanel.fitPopoverToViewport(this.operationsPopover, this.progressButton);
        }

	        this.fireActivityChanged();
	        if (!this.progressBars[id].suppressToast) {
	            this.showActivityToast(this.getActivityForProgressBar(id, this.progressBars[id]));
	        }

        return progressContainer;
    },

    getProgressBar: function(id) {
        return this.progressBars[id] || null;
    },

	    setJobId: function(id, jobId) {
        const progressBar = this.getProgressBar(id);
        if (progressBar) {
            progressBar.jobId = jobId;
            progressBar.updatedAt = new Date();
            this.fireActivityChanged();
        }
	    },

	    restoreOrUpdateProgressBar: function(id, config = {}) {
	        if (!id) {
	            return null;
	        }

	        const progressBar = this.getProgressBar(id);
	        const files = config.files || config.affectedFiles || [];
	        const cancelCallback = Ext.isFunction(config.cancelCallback) ? config.cancelCallback : null;

	        if (!progressBar) {
	            this.addProgressBar(
	                id,
	                config.text || config.title || 'Background operation',
	                files,
	                cancelCallback,
	                {
	                    jobId: config.jobId || null,
	                    metadata: {
	                        activityType: config.activityType || 'Background Job'
	                    },
	                    suppressToast: config.suppressToast !== false
	                }
	            );
	        } else if (cancelCallback && !progressBar.cancelCallback) {
	            progressBar.cancelCallback = cancelCallback;
	        }

	        if (config.jobId) {
	            this.setJobId(id, config.jobId);
	        }

	        if (config.status || config.statusText || config.detail) {
	            this.markActivityStatus(
	                id,
	                config.status || 'running',
	                config.statusText || null,
	                config.detail || null
	            );
	        }

	        if (config.progress !== undefined) {
	            this.updateProgress(id, Number(config.progress) || 0, config.text || config.title || null);
	        }

	        return this.getProgressBar(id);
	    },

    runCallback: function(id, callbackName, payload) {
        const progressBar = this.getProgressBar(id);
        if (!progressBar || typeof progressBar[callbackName] !== 'function') {
            return;
        }

        try {
            progressBar[callbackName](payload, progressBar);
        } catch (error) {
            console.error(`Error in ${callbackName} callback for "${id}":`, error);
        }
    },

    markActivityStatus: function(id, status, statusText = null, detail = null) {
        const progressBar = this.getProgressBar(id);
        if (!progressBar) {
            return;
        }

        progressBar.status = status || progressBar.status || 'running';
        progressBar.statusText = statusText || progressBar.statusText || null;
        progressBar.detail = detail || progressBar.detail || null;
        progressBar.updatedAt = new Date();
        this.fireActivityChanged();
    },

    removeProgressBar: function(id) {
        const progressBar = this.progressBars[id];

        if (!progressBar) {
            console.warn(`Progress bar with ID "${id}" does not exist.`);
            return;
        }

        const finalStatus = progressBar.status && progressBar.status !== 'running'
            ? progressBar.status
            : (progressBar.progress >= 100 ? 'completed' : 'cancelled');
        const finalStatusText = progressBar.statusText && progressBar.statusText !== 'Running'
            ? progressBar.statusText
            : (finalStatus === 'completed' ? 'Completed' : 'Cancelled');

        this.recordActivitySnapshot(this.getActivityForProgressBar(id, progressBar), {
            status: finalStatus,
            statusText: finalStatusText,
            progress: progressBar.progress >= 100 ? 100 : progressBar.progress
        });

        const filesToRemove = this.fileQueueStore.queryBy(record =>
            record.get('progressId') === id
        );
        if (filesToRemove.length > 0) {
            this.fileQueueStore.remove(filesToRemove.items);
        }

        if (this.operationsPopover && progressBar.container) {
            this.operationsPopover.remove(progressBar.container, true);
        }
        delete this.progressBars[id];

        this.syncProgressButtonVisibility();

        this.fireActivityChanged();
    },

    cancelRelatedProgressBars: function(files) {
        const progressBarsToRemove = [];

        Object.entries(this.progressBars).forEach(([id, progressBar]) => {
            if (progressBar.files && progressBar.files.some(file =>
                files.some(currentFile => currentFile.name === file.fileName))) {
                progressBarsToRemove.push(id);
            }
        });

        progressBarsToRemove.forEach(id => this.removeProgressBar(id));
    },

    updateQueuedStatus: function(id, fileName, status) {
        const record = this.fileQueueStore.findBy(currentRecord =>
            currentRecord.get('progressId') === id && currentRecord.get('fileName') === fileName
        );

        if (record !== -1) {
            const queueRecord = this.fileQueueStore.getAt(record);
            queueRecord.set('status', status);
            this.fileQueueStore.commitChanges();
        }

        const progressBar = this.progressBars[id];
        if (progressBar && progressBar.files) {
            const fileMeta = progressBar.files.find(file => file.fileName === fileName);
            if (fileMeta) {
                fileMeta.status = status;
            }
            progressBar.updatedAt = new Date();
        }

        this.fireActivityChanged();
    },

    updateProgress: function(id, progress, text = null) {
        const progressBar = this.progressBars[id];
        if (!progressBar) {
            console.warn(`Progress bar with ID "${id}" does not exist.`);
            return;
        }

        const progressComponent = progressBar.container.items.getAt(0);
        if (progressComponent) {
            const nextText = (text || progressBar.text || '').replace(/\s*\(\d+%\)\s*$/, '').trim();
            progressBar.text = nextText;
            progressComponent.updateProgress(
                progress / 100,
                `${nextText} (${Math.round(progress)}%)`
            );
        }

        const circularProgress = this.progressButton && this.progressButton.el
            ? this.progressButton.el.down('.circular-progress')
            : null;
        if (circularProgress) {
            circularProgress.setStyle({
                background: `conic-gradient(#4169E1 ${progress * 3.6}deg, #E8EBF4 0deg)`
            });
            const percentageEl = circularProgress.down('.percentage');
            if (percentageEl) {
                percentageEl.setHtml(`${Math.round(progress)}%`);
            }
        }

        progressBar.progress = progress;
        progressBar.updatedAt = new Date();
        this.fireActivityChanged();
    },

    getActiveCount: function() {
        return Object.keys(this.progressBars).length;
    },

    hasVisibleProgressBars: function() {
        return Object.keys(this.progressBars).some(id => {
            const progressBar = this.progressBars[id];
            return progressBar && progressBar.suppressButton !== true;
        });
    },

    syncProgressButtonVisibility: function() {
        if (!this.progressButton) {
            return;
        }

        if (this.hasVisibleProgressBars()) {
            this.progressButton.show();
            return;
        }

        this.progressButton.hide();

        if (this.operationsPopover && this.operationsPopover.isVisible && this.operationsPopover.isVisible()) {
            this.operationsPopover.hide();
        }
    },

    getActivities: function() {
        return Object.entries(this.progressBars).map(([id, progressBar]) =>
            this.getActivityForProgressBar(id, progressBar)
        );
    },

    getActivityForProgressBar: function(id, progressBar) {
        const activityType = this.inferActivityType(id, progressBar);
        const progress = Number(progressBar.progress) || 0;
        const status = progressBar.status || (progress >= 100 ? 'completed' : 'running');

        return {
            id: `progress-${id}`,
            source: 'progress',
            activityType,
            iconCls: this.getActivityIcon(activityType),
            title: progressBar.text || 'Background operation',
            detail: progressBar.detail || this.formatFilesDetail(progressBar.files, progressBar.jobId),
            affectedFiles: progressBar.files || [],
            affectedFileCount: progressBar.files ? progressBar.files.length : 0,
            status,
            statusText: progressBar.statusText || (progress >= 100 ? 'Completed' : 'Running'),
            progress,
            updatedAt: progressBar.updatedAt || progressBar.startedAt,
            createdAt: progressBar.startedAt || progressBar.updatedAt || new Date(),
            canCancel: progress < 100 && status !== 'failed' && typeof progressBar.cancelCallback === 'function',
            canOpenPanel: false,
            relatedProgressId: id,
            jobId: progressBar.jobId || null,
            fileCount: progressBar.files ? progressBar.files.length : 0
        };
    },

    inferActivityType: function(id, progressBar) {
        const metadataType = progressBar.metadata && progressBar.metadata.activityType;
        if (metadataType) {
            return metadataType;
        }

        const value = `${id || ''} ${progressBar.text || ''}`.toLowerCase();

        if (value.includes('upload')) {
            return 'Upload';
        }

        if (value.includes('media')) {
            return 'Media Conversion';
        }

        if (value.includes('document')) {
            return 'Document Conversion';
        }

        if (value.includes('download')) {
            return 'Download';
        }

        if (value.includes('compress') || value.includes('zip')) {
            return 'Compression';
        }

	        if (value.includes('move')) {
	            return 'Move';
	        }

	        if (value.includes('extract')) {
	            return 'Extraction';
	        }

        return 'Background Job';
    },

    getActivityIcon: function(activityType) {
        switch (activityType) {
            case 'Upload':
                return 'fa fa-upload blue-icon';
            case 'Download':
                return 'fa fa-download blue-icon';
            case 'Compression':
                return 'fa fa-file-zipper orange-icon';
            case 'Media Conversion':
                return 'fa fa-film blue-icon';
            case 'Document Conversion':
                return 'fa fa-file-lines blue-icon';
	            case 'Move':
	                return 'fa fa-arrows-up-down-left-right blue-icon';
	            case 'Extraction':
	                return 'fa fa-box-open orange-icon';
	            default:
	                return 'fa fa-spinner blue-icon';
	        }
    },

    formatFilesDetail: function(files, jobId) {
        const count = (files || []).length;
        const parts = [];

        if (count) {
            parts.push(`${count} affected ${count === 1 ? 'file' : 'files'}`);
        }

        if (!parts.length && jobId) {
            parts.push(`Job ${jobId}`);
        }

        return parts.join(', ');
    },

    recordActivitySnapshot: function(activity, overrides = {}) {
        if (activity && ['Upload', 'Media Conversion', 'Document Conversion'].includes(activity.activityType)) {
            return;
        }

        const activityCenter = FileManagement.components.status && FileManagement.components.status.ActivityCenterPanel;
        if (activityCenter && activityCenter.recordActivitySnapshot) {
            activityCenter.recordActivitySnapshot(activity, overrides);
        }
    },

    showActivityToast: function(activity) {
        const activityCenter = FileManagement.components.status && FileManagement.components.status.ActivityCenterPanel;
        if (activityCenter && activityCenter.showBackgroundToast) {
            activityCenter.showBackgroundToast(activity);
        }
    },

    fireActivityChanged: function() {
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
    }
});
