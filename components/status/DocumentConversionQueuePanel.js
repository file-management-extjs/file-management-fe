Ext.define('FileManagement.components.status.DocumentConversionQueuePanel', {
    singleton: true,

    requires: [
        'FileManagement.components.utils.ResponsivePanel',
        'FileManagement.components.utils.NotificationUtil',
        'FileManagement.components.utils.ProgressBarManager'
    ],

    panel: null,
    store: null,
    items: {},
    completionDelay: 1800,
    autoShowSuppressed: false,

    ensureStore: function() {
        if (this.store) {
            return this.store;
        }

        this.store = Ext.create('Ext.data.Store', {
            fields: ['jobId', 'progressId', 'fileName', 'currentFileName', 'targetFormat', 'status', 'stage', 'progress', 'error']
        });

        return this.store;
    },

    ensurePanel: function() {
        if (this.panel && !this.panel.destroyed) {
            return this.panel;
        }

        this.panel = Ext.create('Ext.panel.Panel', {
            title: 'Document Conversions',
            floating: true,
            mobileFloatingFitToWorkspace: true,
            frame: true,
            draggable: true,
            hidden: true,
            shadow: true,
            width: 500,
            height: 260,
            layout: 'fit',
            tools: [
                {
                    type: 'minimize',
                    tooltip: 'Minimize document conversions',
                    handler: () => this.hidePanelByUser()
                },
                {
                    type: 'close',
                    tooltip: 'Hide document conversions',
                    handler: () => this.hidePanelByUser()
                }
            ],
            listeners: {
                afterrender: function(panel) {
                    FileManagement.components.utils.ResponsivePanel.fitFloatingPanel(panel);
                },
                show: function(panel) {
                    FileManagement.components.utils.ResponsivePanel.fitFloatingPanel(panel);
                },
                resize: function(panel) {
                    if (!panel.responsiveFloatingApplying) {
                        FileManagement.components.utils.ResponsivePanel.fitFloatingPanel(panel);
                    }
                },
                beforeclose: function() {
                    this.hidePanelByUser();
                    return false;
                },
                scope: this
            },
            items: [
                {
                    xtype: 'grid',
                    itemId: 'documentConversionQueueGrid',
                    store: this.ensureStore(),
                    columns: [
                        {
                            text: '',
                            width: 32,
                            dataIndex: 'status',
                            menuDisabled: true,
                            sortable: false,
                            renderer: function(status) {
                                const icon = status === 'failed'
                                    ? 'fa fa-exclamation-triangle red-icon'
                                    : status === 'completed'
                                        ? 'fa fa-check blue-icon'
                                        : 'fa fa-file-lines blue-icon';
                                return `<i class="${icon}"></i>`;
                            }
                        },
                        {
                            text: 'Batch',
                            dataIndex: 'fileName',
                            flex: 1,
                            renderer: function(value, meta, record) {
                                const currentFileName = record.get('currentFileName');
                                const error = record.get('error');
                                const lines = [
                                    `<div>${Ext.String.htmlEncode(value || 'Document conversion')}</div>`
                                ];

                                if (currentFileName) {
                                    lines.push(`<div style="color:#5f7591;font-size:11px;">Current: ${Ext.String.htmlEncode(currentFileName)}</div>`);
                                }

                                if (error) {
                                    meta.tdAttr = `data-qtip="${Ext.String.htmlEncode(error)}"`;
                                }

                                return lines.join('');
                            }
                        },
                        {
                            text: 'Status',
                            dataIndex: 'status',
                            width: 130,
                            renderer: (status, meta, record) => this.getStatusText(status, record.get('stage'))
                        },
                        {
                            text: 'Progress',
                            dataIndex: 'progress',
                            width: 90,
                            renderer: function(value) {
                                return `${Math.round(value || 0)}%`;
                            }
                        }
                    ],
                    viewConfig: {
                        deferEmptyText: false,
                        emptyText: 'No active document conversions.'
                    }
                }
            ]
        });

        return this.panel;
    },

    hidePanelByUser: function() {
        this.autoShowSuppressed = true;

        if (this.panel && !this.panel.destroyed) {
            this.panel.hide();
        }
    },

    getActiveCount: function() {
        return Object.keys(this.items).length;
    },

    hasActiveJobs: function() {
        return this.getActiveCount() > 0;
    },

    restore: function() {
        if (!this.hasActiveJobs()) {
            FileManagement.components.utils.NotificationUtil.showInfo(
                'There are no active document conversions.',
                'Document Conversions',
                { ignoreUserSettings: true }
            );
            return;
        }

        this.autoShowSuppressed = false;
        this.render();
    },

    handleUpdate: function(data) {
        const status = data.status || 'queued';

        if (['completed', 'failed', 'cancelled'].includes(status)) {
            this.completeJob(data);
            return;
        }

        this.upsertJob(data);
    },

    upsertJob: function(data) {
        const key = this.getKey(data);
        if (!key) {
            return;
        }

        const isNew = !this.items[key];
        this.items[key] = {
            jobId: data.jobId,
            progressId: data.progressId,
            fileName: data.fileName || 'Document conversion',
            currentFileName: data.currentFileName || null,
            targetFormat: data.targetFormat || '',
            status: data.status || 'queued',
            stage: data.stage || data.status || 'queued',
            progress: data.progress || 0,
            error: data.error || null,
            updatedAt: new Date()
        };

        if (isNew) {
            this.showActivityToast(this.getActivityForItem(key, this.items[key]));
        }

        this.render();
    },

    completeJob: function(data) {
        const key = this.getKey(data);
        if (!key) {
            return;
        }

        this.items[key] = {
            jobId: data.jobId,
            progressId: data.progressId,
            fileName: data.fileName || this.items[key] && this.items[key].fileName || 'Document conversion',
            currentFileName: data.currentFileName || null,
            targetFormat: data.targetFormat || this.items[key] && this.items[key].targetFormat || '',
            status: data.status,
            stage: data.stage || data.status,
            progress: data.status === 'completed' ? 100 : 0,
            error: data.error || data.message || null,
            updatedAt: new Date()
        };

        this.recordActivitySnapshot(this.getActivityForItem(key, this.items[key]));
        this.render();

        Ext.defer(() => {
            delete this.items[key];
            this.render();
        }, this.completionDelay);
    },

    render: function() {
        const panel = this.ensurePanel();
        const activeItems = Object.values(this.items);

        this.ensureStore().loadData(activeItems);
        this.refreshNavigationBadge();
        this.notifyActivityChanged();

        if (!activeItems.length) {
            this.autoShowSuppressed = false;
            panel.hide();
            return;
        }

        if (this.autoShowSuppressed) {
            return;
        }

        this.showPanel(panel);
    },

    showPanel: function(panel) {
        if (panel.isVisible()) {
            return;
        }

        const workspace = Ext.getCmp('mainPanelRegion');
        const box = workspace && workspace.rendered ? workspace.getBox() : null;
        const x = box ? box.x + 32 : 260;
        const y = box ? box.y + 60 : 90;

        panel.showAt(x, y);
        FileManagement.components.utils.ResponsivePanel.fitFloatingPanel(panel);
        panel.toFront();
    },

    refreshNavigationBadge: function() {
        const navPanel = Ext.ComponentQuery.query('navigationpanel')[0];
        if (navPanel && navPanel.refreshDocumentConversionCount) {
            navPanel.refreshDocumentConversionCount();
        }
    },

    notifyActivityChanged: function() {
        const activityCenter = FileManagement.components.status.ActivityCenterPanel;
        if (activityCenter && activityCenter.notifyChanged) {
            activityCenter.notifyChanged();
        }
    },

    getActivities: function() {
        return Object.entries(this.items).map(([key, item]) => this.getActivityForItem(key, item));
    },

    getActivityForItem: function(key, item) {
        const progressManager = FileManagement.components.utils.ProgressBarManager;
        const relatedProgressId = item.progressId || key;
        const progressBar = relatedProgressId && progressManager
            ? progressManager.getProgressBar(relatedProgressId)
            : null;
        const affectedFiles = progressBar && progressBar.files && progressBar.files.length
            ? progressBar.files
            : [{
                name: item.currentFileName || item.fileName || 'Document conversion',
                fileName: item.currentFileName || item.fileName || 'Document conversion',
                status: item.status || 'queued'
            }];
        const detailParts = [];

        if (item.currentFileName) {
            detailParts.push(`Current: ${item.currentFileName}`);
        }

        if (item.targetFormat) {
            detailParts.push(`Target: ${String(item.targetFormat).toUpperCase()}`);
        }

        if (item.error) {
            detailParts.push(item.error);
        }

        return {
            id: `document-${key}`,
            source: 'document',
            activityType: 'Document Conversion',
            iconCls: item.status === 'failed'
                ? 'fa fa-triangle-exclamation red-icon'
                : item.status === 'completed'
                    ? 'fa fa-check blue-icon'
                    : 'fa fa-file-lines blue-icon',
            title: item.fileName || 'Document conversion',
            detail: detailParts.join(' | ') || 'Document conversion job',
            status: item.status || 'queued',
            statusText: this.getStatusText(item.status, item.stage),
            progress: item.progress || 0,
            updatedAt: item.updatedAt || new Date(),
            canCancel: !!progressBar && typeof progressBar.cancelCallback === 'function',
            canOpenPanel: true,
            relatedProgressId,
            jobId: item.jobId || null,
            affectedFiles,
            affectedFileCount: affectedFiles.length,
            fileCount: affectedFiles.length
        };
    },

    recordActivitySnapshot: function(activity) {
        const activityCenter = FileManagement.components.status.ActivityCenterPanel;
        if (activityCenter && activityCenter.recordActivitySnapshot) {
            activityCenter.recordActivitySnapshot(activity);
        }
    },

    showActivityToast: function(activity) {
        const activityCenter = FileManagement.components.status.ActivityCenterPanel;
        if (activityCenter && activityCenter.showBackgroundToast) {
            activityCenter.showBackgroundToast(activity);
        }
    },

    getStatusText: function(status, stage) {
        if (status === 'running') {
            if (stage === 'preparing') return 'Preparing';
            if (stage === 'saving') return 'Saving output';
            if (stage === 'converting') return 'Converting';
            return 'Running';
        }

        switch (status) {
            case 'queued':
                return 'Queued';
            case 'completed':
                return 'Completed';
            case 'failed':
                return 'Failed';
            case 'cancelled':
                return 'Cancelled';
            default:
                return 'Waiting';
        }
    },

    getKey: function(data) {
        return data.progressId || data.jobId || data.fileName || null;
    }
});
