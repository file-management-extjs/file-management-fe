Ext.define('FileManagement.components.status.ScanQueuePanel', {
    singleton: true,

    requires: [
        'FileManagement.components.utils.ResponsivePanel',
        'FileManagement.components.utils.NotificationUtil',
        'FileManagement.components.settings.UserSettings'
    ],

    panel: null,
    store: null,
    items: {},
    completionDelay: 1300,
    autoShowSuppressed: false,

    ensureStore: function() {
        if (this.store) {
            return this.store;
        }

	        this.store = Ext.create('Ext.data.Store', {
	            fields: ['fileId', 'fileName', 'filePath', 'parentId', 'workspaceId', 'mimetype', 'size', 'status', 'progress', 'result']
	        });

        return this.store;
    },

    ensurePanel: function() {
        if (this.panel && !this.panel.destroyed) {
            return this.panel;
        }

        this.panel = Ext.create('Ext.panel.Panel', {
            title: 'Virus Scan',
            floating: true,
            mobileFloatingFitToWorkspace: true,
            frame: true,
            draggable: true,
            hidden: true,
            shadow: true,
            width: 420,
            height: 230,
            layout: 'fit',
            tools: [
                {
                    type: 'minimize',
                    tooltip: 'Minimize scan panel',
                    handler: () => {
                        this.hidePanelByUser();
                    }
                },
                {
                    type: 'close',
                    tooltip: 'Hide scan panel',
                    handler: () => {
                        this.hidePanelByUser();
                    }
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
                beforeclose: function(panel) {
                    this.hidePanelByUser();
                    return false;
                },
                scope: this
            },
            items: [
                {
                    xtype: 'grid',
                    itemId: 'scanQueueGrid',
                    store: this.ensureStore(),
                    columns: [
                        {
                            text: '',
                            width: 32,
                            dataIndex: 'status',
                            menuDisabled: true,
                            sortable: false,
                            renderer: function(status) {
                                const icon = status === 'infected' || status === 'error'
                                    ? 'fa fa-exclamation-triangle red-icon'
                                    : 'fa fa-shield blue-icon';
                                return `<i class="${icon}"></i>`;
                            }
                        },
                        {
                            text: 'File',
                            dataIndex: 'fileName',
                            flex: 1,
                            renderer: function(value) {
                                return Ext.String.htmlEncode(value);
                            }
                        },
                        {
                            text: 'Status',
                            dataIndex: 'status',
                            width: 145,
                            renderer: (status) => this.getStatusText(status)
                        },
                        {
                            text: 'Progress',
                            dataIndex: 'progress',
                            width: 85,
                            renderer: function(value) {
                                return `${Math.round(value || 0)}%`;
                            }
                        }
                    ],
                    viewConfig: {
                        deferEmptyText: false,
                        emptyText: 'No files queued for virus scan.'
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

    hasActiveScans: function() {
        return this.getActiveScanCount() > 0;
    },

    getActiveScanCount: function() {
        return Object.keys(this.items).length;
    },

    getUserSetting: function(path, fallback) {
        const settings = FileManagement.components.settings && FileManagement.components.settings.UserSettings;
        return settings && settings.get ? settings.get(path, fallback) : fallback;
    },

    shouldAutoShowPanel: function() {
        return this.getUserSetting('scanning.showScanPanel', true) !== false;
    },

    restore: function() {
        if (!this.hasActiveScans()) {
            FileManagement.components.utils.NotificationUtil.showInfo(
                'There are no files currently queued or scanning.',
                'Virus Scan',
                { ignoreUserSettings: true }
            );
            return;
        }

        this.autoShowSuppressed = false;
        this.render(true);
    },

    handleScanUpdate: function(data) {
        const status = data.status || 'pending';

        if (['clean', 'infected', 'error'].includes(status)) {
            this.completeScan(data);
            return;
        }

        this.upsertScan(data);
    },

    upsertScan: function(data) {
        const key = this.getKey(data);
        if (!key) {
            return;
        }

        const isNew = !this.items[key];
	        this.items[key] = {
	            fileId: data.fileId,
	            fileName: data.fileName || 'Unknown file',
	            filePath: data.filePath || data.path || '',
	            parentId: data.parentId || data.parent_id || data.folderId || null,
                workspaceId: data.workspaceId || '',
	            mimetype: data.mimetype || '',
	            size: data.size || 0,
	            createdAt: this.items[key]?.createdAt || data.createdAt || new Date(),
	            status: data.status || 'pending',
	            progress: data.progress || 0,
	            result: data.result || data.error || null,
            updatedAt: new Date()
        };

        if (isNew) {
            this.showActivityToast(this.getActivityForItem(key, this.items[key]));
        }

        this.render();
    },

    completeScan: function(data) {
        const key = this.getKey(data);
        if (!key) {
            return;
        }

	        this.items[key] = {
	            fileId: data.fileId,
	            fileName: data.fileName || this.items[key]?.fileName || 'Unknown file',
	            filePath: data.filePath || data.path || this.items[key]?.filePath || '',
	            parentId: data.parentId || data.parent_id || data.folderId || this.items[key]?.parentId || null,
                workspaceId: data.workspaceId || this.items[key]?.workspaceId || '',
	            mimetype: data.mimetype || this.items[key]?.mimetype || '',
	            size: data.size || this.items[key]?.size || 0,
	            createdAt: this.items[key]?.createdAt || data.createdAt || new Date(),
	            status: data.status || 'clean',
	            progress: data.progress || 100,
	            result: data.result || data.error || null,
            updatedAt: new Date()
        };

        this.recordActivitySnapshot(this.getActivityForItem(key, this.items[key]));
        this.render();

        Ext.defer(() => {
            delete this.items[key];
            this.render();
        }, this.completionDelay);
    },

    render: function(forceShow) {
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

        if (!forceShow && (this.autoShowSuppressed || !this.shouldAutoShowPanel())) {
            return;
        }

        this.showPanel(panel);
    },

    showPanel: function(panel) {
        if (panel.isVisible()) {
            panel.toFront();
            return;
        }

        const workspace = Ext.getCmp('mainPanelRegion');
        const box = workspace && workspace.rendered ? workspace.getBox() : null;
        const x = box ? box.x + 16 : 220;
        const y = box ? box.y + 16 : 48;

        panel.showAt(x, y);
        FileManagement.components.utils.ResponsivePanel.fitFloatingPanel(panel);
        panel.toFront();
    },

    refreshNavigationBadge: function() {
        const navPanel = Ext.ComponentQuery.query('navigationpanel')[0];
        if (navPanel && navPanel.refreshScanQueueCount) {
            navPanel.refreshScanQueueCount();
        }
    },

    notifyActivityChanged: function() {
        if (Ext.GlobalEvents) {
            Ext.GlobalEvents.fireEvent('scanqueuechanged', this.getActiveScanItems());
        }

        const activityCenter = FileManagement.components.status.ActivityCenterPanel;
        if (activityCenter && activityCenter.notifyChanged) {
            activityCenter.notifyChanged();
        }
    },

	    getActivities: function() {
	        return Object.entries(this.items).map(([key, item]) => this.getActivityForItem(key, item));
	    },

	    getActiveScanItems: function() {
	        return Object.values(this.items || {});
	    },

    getActivityForItem: function(key, item) {
        return {
            id: `scan-${key}`,
            source: 'scan',
            activityType: 'Security',
            iconCls: item.status === 'infected' || item.status === 'error'
                ? 'fa fa-triangle-exclamation red-icon'
                : 'fa fa-shield blue-icon',
            title: item.fileName || 'File scan',
            detail: item.result || 'Virus scan queue',
            status: item.status || 'pending',
            statusText: this.getStatusText(item.status),
            progress: item.progress || 0,
            updatedAt: item.updatedAt || new Date(),
	            createdAt: item.createdAt || item.updatedAt || new Date(),
            canCancel: false,
            canOpenPanel: true,
	            affectedFiles: [{
	                name: item.fileName || 'File scan',
	                fileName: item.fileName || 'File scan',
	                path: item.filePath || '',
                    workspaceId: item.workspaceId || '',
	                size: item.size || null,
	                type: item.mimetype || '',
	                status: item.status || 'pending'
	            }],
            affectedFileCount: 1,
            fileCount: 1
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

    getStatusText: function(status) {
        switch (status) {
            case 'pending':
                return 'Queued for virus scan';
            case 'scanning':
                return 'Scanning file';
            case 'clean':
                return 'No threats found';
            case 'infected':
                return 'Threat found, file removed';
            case 'error':
                return 'Scan failed';
            default:
                return 'Waiting for scan';
        }
    },

    getKey: function(data) {
        return data.fileId || data.fileName || null;
    }
});
