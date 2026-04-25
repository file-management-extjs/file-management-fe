Ext.define('FileManagement.components.status.ActivityCenterPanel', {
    extend: 'Ext.panel.Panel',
    xtype: 'activitycenterpanel',

    requires: [
        'FileManagement.components.status.ScanQueuePanel',
        'FileManagement.components.status.MediaConversionQueuePanel',
        'FileManagement.components.status.DocumentConversionQueuePanel',
        'FileManagement.components.utils.ProgressBarManager',
        'FileManagement.components.utils.UploadSessionManager',
        'FileManagement.components.utils.PanelUtils',
        'FileManagement.components.utils.NotificationUtil'
    ],

    title: 'Activity Center',
    iconCls: 'fa fa-list-check',
    frame: true,
    closable: true,
    width: 980,
    height: 620,
    minWidth: 720,
    minHeight: 460,
    bodyPadding: 8,
    bodyCls: 'activity-center-body',
    layout: {
        type: 'vbox',
        align: 'stretch'
    },

    draggable: {
        onMouseUp: function(e, panel) {
            FileManagement.components.utils.PanelUtils.onMouseUp(panel ?? this.panel, e, this);
        },
        onDrag: function(e, panel) {
            FileManagement.components.utils.PanelUtils.onDrag(panel ?? this.panel, e, this);
        }
    },

    resizable: {
        constrain: true,
        dynamic: true,
        minHeight: 460,
        minWidth: 720
    },

    tools: [
        {
            type: 'minimize',
            tooltip: 'Minimize to toolbar',
            handler: function() {
                FileManagement.components.utils.PanelUtils.minimizeToTaskbar(this.up('panel'));
            }
        },
        {
            type: 'maximize',
            itemId: 'maximizeTool',
            tooltip: 'Maximize',
            handler: function() {
                const panel = this.up('panel');
                if (panel && !panel.maximized) {
                    FileManagement.components.utils.PanelUtils.maximizePanel(panel);
                } else if (panel) {
                    FileManagement.components.utils.PanelUtils.minimizePanel(panel);
                }
            }
        }
    ],

    statics: {
        activityHistory: [],
        activityHistoryById: {},
        activityHistoryLimit: 100,
        affectedFilesRenderLimit: 300,
        backgroundToastKeys: {},

        notifyChanged: function() {
            if (Ext.GlobalEvents) {
                Ext.GlobalEvents.fireEvent('activitycenterchanged');
            }

            const navPanel = Ext.ComponentQuery.query('navigationpanel')[0];
            if (navPanel && navPanel.refreshActivityCenterCount) {
                navPanel.refreshActivityCenterCount();
            }
        },

        getActiveCount: function() {
            return this.collectActivities().filter(function(activity) {
                return !activity.history &&
                    (activity.statusGroup === 'active' || activity.statusGroup === 'attention');
            }).length;
        },

        collectActivities: function() {
            const rows = [];
            const liveIds = {};
            const conversionProgressIds = {};
            const progressManager = FileManagement.components.utils.ProgressBarManager;
            const scanPanel = FileManagement.components.status.ScanQueuePanel;
            const mediaPanel = FileManagement.components.status.MediaConversionQueuePanel;
            const documentPanel = FileManagement.components.status.DocumentConversionQueuePanel;

            const addRows = function(sourceRows) {
                Ext.Array.forEach(sourceRows || [], function(row) {
                    if (row && row.id) {
                        liveIds[row.id] = true;
                    }
                    rows.push(row);
                });
            };

            addRows(scanPanel && scanPanel.getActivities ? scanPanel.getActivities() : []);

            const mediaRows = mediaPanel && mediaPanel.getActivities ? mediaPanel.getActivities() : [];
            Ext.Array.forEach(mediaRows, function(row) {
                if (row.relatedProgressId) {
                    conversionProgressIds[row.relatedProgressId] = true;
                }
            });
            addRows(mediaRows);

            const documentRows = documentPanel && documentPanel.getActivities ? documentPanel.getActivities() : [];
            Ext.Array.forEach(documentRows, function(row) {
                if (row.relatedProgressId) {
                    conversionProgressIds[row.relatedProgressId] = true;
                }
            });
            addRows(documentRows);

            const progressRows = progressManager && progressManager.getActivities ? progressManager.getActivities() : [];
            addRows(progressRows.filter(function(row) {
                return !row.relatedProgressId || !conversionProgressIds[row.relatedProgressId];
            }));

            addRows(this.getRecoveryActivities());

            Ext.Array.forEach(this.activityHistory || [], function(row) {
                if (!row || liveIds[row.id]) {
                    return;
                }

                rows.push(row);
            });

            return rows.map(activity => this.normalizeActivity(activity)).sort(function(a, b) {
                if (a.sortWeight !== b.sortWeight) {
                    return a.sortWeight - b.sortWeight;
                }

                const aIsLive = !a.history && (a.statusGroup === 'active' || a.statusGroup === 'attention');
                const bIsLive = !b.history && (b.statusGroup === 'active' || b.statusGroup === 'attention');

                if (aIsLive && bIsLive) {
                    if (a.sortStartedAt !== b.sortStartedAt) {
                        return a.sortStartedAt - b.sortStartedAt;
                    }

                    return String(a.stableSortKey).localeCompare(String(b.stableSortKey));
                }

                const updatedDiff = b.updatedAt.getTime() - a.updatedAt.getTime();
                if (updatedDiff !== 0) {
                    return updatedDiff;
                }

                return String(a.stableSortKey).localeCompare(String(b.stableSortKey));
            });
        },

        getRecoveryActivities: function() {
            const uploadManager = FileManagement.components.utils.UploadSessionManager;
            const sessions = uploadManager && uploadManager.getInterruptedSessions
                ? uploadManager.getInterruptedSessions()
                : [];
            const rows = [];

            Ext.Array.forEach(sessions, function(session) {
                const files = (session.files || []).filter(function(file) {
                    return file.status !== 'complete' && file.status !== 'cancelled';
                });

                if (!files.length) {
                    return;
                }

                const totalProgress = files.reduce(function(sum, file) {
                    return sum + (Number(file.progress) || 0);
                }, 0);

                rows.push({
                    id: `recovery-${session.id}`,
                    source: 'recovery',
                    activityType: 'Interrupted Upload',
                    iconCls: 'fa fa-rotate-left orange-icon',
                    title: files.length === 1
                        ? (files[0].name || 'Interrupted upload')
                        : `${files.length} interrupted uploads`,
                    detail: `${files.length} affected ${files.length === 1 ? 'file' : 'files'} can be resumed from Activity Center`,
                    affectedFiles: files.map(function(file) {
                        return {
                            name: file.name || 'Interrupted upload',
                            fileName: file.name || 'Interrupted upload',
                            size: file.size || null,
                            type: file.type || '',
                            status: file.status || 'interrupted',
                            progress: file.progress || 0
                        };
                    }),
                    affectedFileCount: files.length,
                    status: 'interrupted',
                    statusText: 'Needs attention',
                    statusGroup: 'attention',
                    progress: Math.round(totalProgress / files.length),
                    updatedAt: session.updatedAt || session.createdAt,
                    createdAt: session.createdAt || session.updatedAt,
                    canOpenPanel: true,
                    canCancel: false,
                    sessionId: session.id
                });
            });

            return rows;
        },

        recordActivitySnapshot: function(activity, overrides = {}) {
            if (!activity) {
                return;
            }

            const normalized = this.normalizeActivity(Ext.apply(Ext.apply({}, activity), overrides));
            if (!this.shouldKeepHistory(normalized)) {
                return;
            }

            normalized.canCancel = false;
            normalized.canOpenPanel = false;
            normalized.history = true;
            normalized.updatedAt = this.normalizeDate(normalized.updatedAt || new Date());
            normalized.sortWeight = this.getSortWeight(normalized.statusGroup);

            this.activityHistoryById[normalized.id] = normalized;
            this.activityHistory = Object.keys(this.activityHistoryById)
                .map(key => this.activityHistoryById[key])
                .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
                .slice(0, this.activityHistoryLimit);

            this.activityHistoryById = this.activityHistory.reduce(function(index, row) {
                index[row.id] = row;
                return index;
            }, {});

            this.notifyChanged();
        },

        ingestPersistedEvents: function(events) {
            Ext.Array.forEach(events || [], function(event) {
                this.recordActivitySnapshot(event);
            }, this);
        },

        handleActivityEvent: function(event) {
            if (!event) {
                return;
            }

            const normalized = this.normalizeActivity(event);
            const alreadyKnown = !!this.activityHistoryById[normalized.id];

            this.recordActivitySnapshot(normalized);

            if (alreadyKnown ||
                normalized.activityType !== 'Share' ||
                !normalized.metadata ||
                normalized.metadata.direction !== 'incoming') {
                return;
            }

            if (FileManagement.components.utils.NotificationUtil) {
                FileManagement.components.utils.NotificationUtil.showInfo(
                    Ext.String.htmlEncode(normalized.title),
                    'Shared With You',
                    { category: 'shares' }
                );
            }
        },

        shouldKeepHistory: function(activity) {
            return activity &&
                activity.activityType !== 'Upload' &&
                activity.source !== 'recovery' &&
                ['completed', 'failed', 'attention'].includes(activity.statusGroup);
        },

        showBackgroundToast: function(activity) {
            if (!activity) {
                return;
            }

            const normalized = this.normalizeActivity(activity);
            if (normalized.statusGroup !== 'active') {
                return;
            }

            const activityPanel = Ext.ComponentQuery.query('activitycenterpanel')[0];
            if (activityPanel && activityPanel.isVisible && activityPanel.isVisible()) {
                return;
            }

            const key = normalized.relatedProgressId || normalized.jobId || normalized.id;
            if (!key || this.backgroundToastKeys[key]) {
                return;
            }

            this.backgroundToastKeys[key] = true;

            if (FileManagement.components.utils.NotificationUtil) {
                FileManagement.components.utils.NotificationUtil.showInfo(
                    `${Ext.String.htmlEncode(normalized.activityType)} started: ${Ext.String.htmlEncode(normalized.title)}. Open Activity Center to track progress.`,
                    'Background Activity',
                    { category: normalized.activityType }
                );
            }
        },

        normalizeActivity: function(activity) {
            const normalizedStatus = String(activity.status || 'running').toLowerCase();
            const updatedAt = this.normalizeDate(activity.updatedAt);
            const createdAt = this.normalizeDate(activity.createdAt || activity.startedAt || activity.updatedAt);
            const statusGroup = activity.statusGroup || this.getStatusGroup(normalizedStatus);
            const progress = Number(activity.progress);
            const affectedFiles = Array.isArray(activity.affectedFiles) ? activity.affectedFiles : [];
            const affectedFileCount = Number(activity.affectedFileCount || activity.fileCount || affectedFiles.length || 0);
            const stableSortKey = activity.stableSortKey ||
                activity.relatedProgressId ||
                activity.jobId ||
                activity.sessionId ||
                activity.id ||
                activity.title ||
                '';

            return Ext.apply(Ext.apply({}, activity), {
                id: activity.id || `${activity.source || 'activity'}-${Ext.id()}`,
                source: activity.source || 'activity',
                activityType: activity.activityType || 'Background Job',
                iconCls: activity.iconCls || 'fa fa-spinner blue-icon',
                title: activity.title || 'Background job',
                detail: activity.detail || '',
                affectedFiles,
                affectedFileCount,
                status: normalizedStatus,
                statusText: activity.statusText || this.humanizeStatus(normalizedStatus),
                statusGroup,
                progress: Number.isFinite(progress) ? Math.max(0, Math.min(progress, 100)) : 0,
                updatedAt,
                createdAt,
                canCancel: activity.canCancel === true,
                canOpenPanel: activity.canOpenPanel === true,
                relatedProgressId: activity.relatedProgressId || null,
                jobId: activity.jobId || null,
                fileCount: affectedFileCount,
                sortWeight: this.getSortWeight(statusGroup),
                sortStartedAt: createdAt.getTime(),
                stableSortKey
            });
        },

        normalizeDate: function(value) {
            const date = value instanceof Date ? value : new Date(value || Date.now());
            return Number.isFinite(date.getTime()) ? date : new Date();
        },

        getStatusGroup: function(status) {
            if (['failed', 'error', 'infected'].includes(status)) {
                return 'failed';
            }

            if (['interrupted', 'cancelled', 'canceled'].includes(status)) {
                return 'attention';
            }

            if (['completed', 'complete', 'clean', 'uploaded', 'downloaded', 'moved'].includes(status)) {
                return 'completed';
            }

            return 'active';
        },

        getSortWeight: function(statusGroup) {
            switch (statusGroup) {
                case 'active':
                    return 10;
                case 'attention':
                    return 20;
                case 'failed':
                    return 30;
                case 'completed':
                    return 40;
                default:
                    return 50;
            }
        },

        humanizeStatus: function(status) {
            switch (status) {
                case 'queued':
                case 'pending':
                    return 'Queued';
                case 'running':
                case 'uploading':
                case 'downloading':
                case 'scanning':
                    return 'Running';
                case 'saving':
                    return 'Saving output';
                case 'clean':
                    return 'Clean';
                case 'infected':
                    return 'Threat found';
                case 'failed':
                case 'error':
                    return 'Failed';
                case 'interrupted':
                    return 'Needs attention';
                case 'cancelled':
                case 'canceled':
                    return 'Cancelled';
                case 'completed':
                case 'complete':
                    return 'Completed';
                default:
                    return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Running';
            }
        }
    },

    initComponent: function() {
        const me = this;

        me.currentTypeFilter = '';
        me.currentStatusFilter = '';
        me.selectedActivityId = null;
        me.rawActivities = [];
        me.expandedActivityIds = me.expandedActivityIds || {};
        me.activityStore = Ext.create('Ext.data.Store', {
            fields: [
                { name: 'id', type: 'string' },
                { name: 'parentActivityId', type: 'string' },
                { name: 'source', type: 'string' },
                { name: 'activityType', type: 'string' },
                { name: 'iconCls', type: 'string' },
                { name: 'title', type: 'string' },
                { name: 'detail', type: 'string' },
                { name: 'affectedFiles' },
                { name: 'affectedFileCount', type: 'number' },
                { name: 'isAffectedRow', type: 'boolean' },
                { name: 'isOverflowRow', type: 'boolean' },
                { name: 'expanded', type: 'boolean' },
                { name: 'expandable', type: 'boolean' },
                { name: 'fileSize' },
                { name: 'fileType', type: 'string' },
                { name: 'filePath', type: 'string' },
                { name: 'showProgress', type: 'boolean' },
                { name: 'status', type: 'string' },
                { name: 'statusText', type: 'string' },
                { name: 'statusGroup', type: 'string' },
                { name: 'progress', type: 'number' },
                { name: 'updatedAt', type: 'date' },
                { name: 'canCancel', type: 'boolean' },
                { name: 'canOpenPanel', type: 'boolean' },
                { name: 'relatedProgressId', type: 'string' },
                { name: 'jobId', type: 'string' },
                { name: 'fileCount', type: 'number' },
                { name: 'sortWeight', type: 'number' },
                { name: 'history', type: 'boolean' }
            ]
        });

        Ext.apply(me, {
            dockedItems: [me.createTopToolbar()],
            items: [
                me.createSummaryRow(),
                me.createActivityGrid()
            ],
            listeners: {
                afterrender: function(panel) {
                    panel.getEl().setStyle('position', 'absolute');
                    panel.reloadActivities();
                    if (Ext.GlobalEvents) {
                        panel.mon(Ext.GlobalEvents, 'activitycenterchanged', panel.scheduleReloadActivities, panel);
                    }
                },
                show: function(panel) {
                    panel.reloadActivities();
                },
                destroy: function(panel) {
                    FileManagement.components.utils.PanelUtils.destroy(panel);
                }
            }
        });

        me.callParent(arguments);
    },

    createTopToolbar: function() {
        const me = this;

        return {
            xtype: 'toolbar',
            dock: 'top',
            enableOverflow: true,
            items: [
                {
                    text: 'Refresh',
                    iconCls: 'fa fa-refresh',
                    handler: function() {
                        me.reloadActivities();
                    }
                },
                '-',
                {
                    xtype: 'combo',
                    itemId: 'typeFilter',
                    width: 170,
                    editable: false,
                    queryMode: 'local',
                    displayField: 'label',
                    valueField: 'value',
                    value: '',
                    store: Ext.create('Ext.data.Store', {
                        fields: ['value', 'label'],
                        data: [
                            { value: '', label: 'All activity' },
                            { value: 'Upload', label: 'Uploads' },
	                            { value: 'Download', label: 'Downloads' },
	                            { value: 'Compression', label: 'Compression' },
	                            { value: 'Extraction', label: 'Extraction' },
                            { value: 'Move', label: 'Moves' },
	                            { value: 'Security', label: 'Virus scans' },
                            { value: 'Share', label: 'Shares' },
                            { value: 'Media Conversion', label: 'Media conversions' },
                            { value: 'Document Conversion', label: 'Document conversions' },
                            { value: 'Interrupted Upload', label: 'Interrupted uploads' }
                        ]
                    }),
                    listeners: {
                        change: function(field, value) {
                            me.currentTypeFilter = value || '';
                            me.applyFilters();
                            me.restoreActivitySelection(me.down('#activityGrid'), me.selectedActivityId);
                            me.updateActionButtons();
                        }
                    }
                },
                {
                    xtype: 'combo',
                    itemId: 'statusFilter',
                    width: 150,
                    editable: false,
                    queryMode: 'local',
                    displayField: 'label',
                    valueField: 'value',
                    value: '',
                    store: Ext.create('Ext.data.Store', {
                        fields: ['value', 'label'],
                        data: [
                            { value: '', label: 'All statuses' },
                            { value: 'active', label: 'Active' },
                            { value: 'attention', label: 'Needs attention' },
                            { value: 'failed', label: 'Failed' },
                            { value: 'completed', label: 'Completed' }
                        ]
                    }),
                    listeners: {
                        change: function(field, value) {
                            me.currentStatusFilter = value || '';
                            me.applyFilters();
                            me.restoreActivitySelection(me.down('#activityGrid'), me.selectedActivityId);
                            me.updateActionButtons();
                        }
                    }
                },
                '->',
                {
                    text: 'Cancel',
                    itemId: 'cancelActivityButton',
                    iconCls: 'fa fa-ban',
                    disabled: true,
                    handler: function() {
                        me.cancelSelectedActivity();
                    }
                },
                {
                    text: 'Open Details',
                    itemId: 'openActivityButton',
                    iconCls: 'fa fa-up-right-from-square',
                    disabled: true,
                    handler: function() {
                        me.openSelectedActivityDetails();
                    }
                }
            ]
        };
    },

    createSummaryRow: function() {
        const cards = [
            this.createSummaryCard('activeActivityCard', 'Active', '0', 'Jobs running now', 'fa fa-play blue-icon'),
            this.createSummaryCard('attentionActivityCard', 'Needs Attention', '0', 'Interrupted or cancelled work', 'fa fa-circle-exclamation orange-icon'),
            this.createSummaryCard('failedActivityCard', 'Failed', '0', 'Jobs that ended with errors', 'fa fa-triangle-exclamation red-icon'),
            this.createSummaryCard('totalActivityCard', 'Tracked', '0', 'Visible background jobs', 'fa fa-list-check blue-icon')
        ];

        return {
            xtype: 'container',
            itemId: 'activitySummaryRow',
            height: 92,
            margin: '0 0 8 0',
            layout: {
                type: 'hbox',
                align: 'stretch'
            },
            defaults: {
                margin: '0 8 0 0'
            },
            items: cards
        };
    },

    createSummaryCard: function(itemId, label, value, hint, iconCls) {
        return {
            xtype: 'panel',
            itemId,
            flex: 1,
            frame: true,
            cls: 'activity-center-card',
            bodyPadding: 8,
            html: this.renderSummaryCard(label, value, hint, iconCls)
        };
    },

    createActivityGrid: function() {
        const me = this;

        return {
            xtype: 'grid',
            itemId: 'activityGrid',
            cls: 'activity-center-grid',
            flex: 1,
            store: me.activityStore,
            columns: [
                {
                    text: '',
                    dataIndex: 'iconCls',
                    width: 34,
                    menuDisabled: true,
                    sortable: false,
                    renderer: function(value, meta, record) {
                        if (record.get('isAffectedRow')) {
                            return `<i class="${Ext.String.htmlEncode(value || 'fa fa-file blue-icon')} activity-center-file-icon"></i>`;
                        }

                        const canExpand = record.get('expandable') === true;
                        const expanderCls = record.get('expanded')
                            ? 'fa fa-chevron-down'
                            : 'fa fa-chevron-right';
                        const expander = canExpand
                            ? `<span class="activity-center-expander-hit" data-qtip="Show affected files"><i class="${expanderCls} activity-center-expander"></i></span>`
                            : '<span class="activity-center-expander-placeholder"></span>';

                        return `${expander}<i class="${Ext.String.htmlEncode(value || 'fa fa-spinner blue-icon')}"></i>`;
                    }
                },
                {
                    text: 'Activity',
                    dataIndex: 'title',
                    flex: 1.5,
                    renderer: function(value, meta, record) {
                        const detail = record.get('detail');
                        const encodedTitle = Ext.String.htmlEncode(value || 'Background job');
                        const encodedDetail = Ext.String.htmlEncode(detail || '');
                        const rowClass = record.get('isAffectedRow')
                            ? 'activity-center-title activity-center-file-title'
                            : 'activity-center-title';

                        if (detail) {
                            meta.tdAttr = `data-qtip="${encodedDetail}"`;
                        }

                        return [
                            `<div class="${rowClass}">${encodedTitle}</div>`,
                            encodedDetail ? `<div class="activity-center-detail">${encodedDetail}</div>` : ''
                        ].join('');
                    }
                },
                {
                    text: 'Type',
                    dataIndex: 'activityType',
                    width: 145,
                    renderer: function(value, meta, record) {
                        return Ext.String.htmlEncode(record.get('isAffectedRow')
                            ? (record.get('fileType') || 'File')
                            : (value || ''));
                    }
                },
                {
                    text: 'Files / Size',
                    dataIndex: 'affectedFileCount',
                    width: 86,
                    align: 'right',
                    renderer: function(value, meta, record) {
                        if (record.get('isAffectedRow')) {
                            return record.get('isOverflowRow') ? '' : me.formatBytes(record.get('fileSize'));
                        }

                        const count = Number(value) || 0;
                        return count ? Ext.String.htmlEncode(String(count)) : '';
                    }
                },
                {
                    text: 'Status',
                    dataIndex: 'statusText',
                    width: 145,
                    renderer: function(value, meta, record) {
                        if (record.get('isOverflowRow')) {
                            return '';
                        }

                        const group = record.get('statusGroup') || 'active';
                        return `<span class="activity-center-status activity-center-status-${group}">${Ext.String.htmlEncode(value || '')}</span>`;
                    }
                },
                {
                    text: 'Progress',
                    dataIndex: 'progress',
                    width: 155,
                    renderer: function(value, meta, record) {
                        if (record.get('isAffectedRow') && record.get('showProgress') !== true) {
                            return '';
                        }

                        return me.renderProgress(value);
                    }
                },
                {
                    text: 'Updated / Path',
                    dataIndex: 'updatedAt',
                    width: 170,
                    renderer: function(value, meta, record) {
                        if (record.get('isAffectedRow')) {
                            const path = record.get('filePath') || '';
                            if (path) {
                                meta.tdAttr = `data-qtip="${Ext.String.htmlEncode(path)}"`;
                            }

                            return Ext.String.htmlEncode(path);
                        }

                        return value ? Ext.Date.format(value, 'M j, Y g:i A') : '';
                    }
                }
            ],
            viewConfig: {
                deferEmptyText: false,
                emptyText: 'No background activity to show.',
                getRowClass: function(record) {
                    if (record.get('isOverflowRow')) {
                        return 'activity-center-overflow-row';
                    }

                    return record.get('isAffectedRow') ? 'activity-center-affected-row' : '';
                }
            },
            listeners: {
                cellmousedown: function(view, td, cellIndex, record, tr, rowIndex, event) {
                    if (!event.getTarget('.activity-center-expander-hit') &&
                        !event.getTarget('.activity-center-expander')) {
                        return;
                    }

                    event.stopEvent();
                    me.expanderMouseDownHandled = true;
                    me.toggleActivityExpansion(record);
                    Ext.defer(function() {
                        me.expanderMouseDownHandled = false;
                    }, 250);
                    return false;
                },
                selectionchange: function(selectionModel, records) {
                    const record = records && records.length ? records[0] : null;
                    me.selectedActivityId = record
                        ? (record.get('parentActivityId') || record.get('id'))
                        : null;
                    me.updateActionButtons();
                },
                itemclick: function(view, record, item, index, event) {
                    if (event.getTarget('.activity-center-expander-hit') ||
                        event.getTarget('.activity-center-expander')) {
                        event.stopEvent();
                        if (me.expanderMouseDownHandled) {
                            return false;
                        }

                        me.toggleActivityExpansion(record);
                        return false;
                    }
                },
                itemdblclick: function(view, record, item, index, event) {
                    if (event && (
                        event.getTarget('.activity-center-expander-hit') ||
                        event.getTarget('.activity-center-expander')
                    )) {
                        return false;
                    }

                    me.toggleActivityExpansion(record);
                }
            }
        };
    },

    scheduleReloadActivities: function() {
        if (this.activityReloadTimer || this.destroyed || this.destroying) {
            return;
        }

        this.activityReloadTimer = Ext.defer(function() {
            this.activityReloadTimer = null;
            if (!this.destroyed && !this.destroying) {
                this.reloadActivities();
            }
        }, 120, this);
    },

    reloadActivities: function() {
        const grid = this.down('#activityGrid');
        const previousSelection = this.getSelectedRecord();
        const selectedId = previousSelection
            ? (previousSelection.get('parentActivityId') || previousSelection.get('id'))
            : this.selectedActivityId;
        const activities = FileManagement.components.status.ActivityCenterPanel.collectActivities();

        this.rawActivities = activities;
        this.refreshActivityRows(selectedId);
        this.updateSummary(activities);
        this.restoreActivitySelection(grid, selectedId);
        this.updateActionButtons();
    },

    applyFilters: function() {
        this.refreshActivityRows(this.selectedActivityId);
    },

    restoreActivitySelection: function(grid, selectedId) {
        if (!grid) {
            return;
        }

        let record = selectedId
            ? this.activityStore.findRecord('id', selectedId, 0, false, true, true)
            : null;

        if (!record && this.activityStore.getCount() > 0) {
            record = this.activityStore.getAt(0);
        }

        if (record) {
            grid.getSelectionModel().select(record);
            this.selectedActivityId = record.get('id');
            return;
        }

        this.selectedActivityId = null;
    },

    refreshActivityRows: function(selectedId) {
        const me = this;
        const rows = [];
        const activities = (me.rawActivities || []).filter(function(activity) {
            if (me.currentTypeFilter && activity.activityType !== me.currentTypeFilter) {
                return false;
            }

            if (me.currentStatusFilter && activity.statusGroup !== me.currentStatusFilter) {
                return false;
            }

            return true;
        });

        activities.forEach(function(activity) {
            const expanded = me.expandedActivityIds[activity.id] === true;
            const parentRow = Ext.apply(Ext.apply({}, activity), {
                expanded,
                expandable: (Number(activity.affectedFileCount) || 0) > 0,
                isAffectedRow: false,
                isOverflowRow: false
            });

            rows.push(parentRow);

            if (expanded) {
                rows.push.apply(rows, me.buildAffectedFileRows(activity));
            }
        });

        me.activityStore.clearFilter(true);
        me.activityStore.loadData(rows);

        if (selectedId) {
            me.selectedActivityId = selectedId;
        }
    },

    toggleActivityExpansion: function(record) {
        if (!record) {
            return;
        }

        const activityId = record.get('parentActivityId') || record.get('id');
        const parentRecord = record.get('isAffectedRow')
            ? this.activityStore.findRecord('id', activityId, 0, false, true, true)
            : record;

        if (!parentRecord || parentRecord.get('expandable') !== true) {
            return;
        }

        this.expandedActivityIds[activityId] = !this.expandedActivityIds[activityId];
        this.selectedActivityId = activityId;
        this.refreshActivityRows(activityId);
        this.restoreActivitySelection(this.down('#activityGrid'), activityId);
        this.updateActionButtons();
    },

    buildAffectedFileRows: function(activity) {
        const files = this.normalizeAffectedFiles(activity.affectedFiles);
        const limit = FileManagement.components.status.ActivityCenterPanel.affectedFilesRenderLimit || 300;
        const shownFiles = files.slice(0, limit);
        const rows = shownFiles.map(function(file, index) {
            const status = file.statusLabel || FileManagement.components.status.ActivityCenterPanel.humanizeStatus(
                String(file.status || 'queued').toLowerCase()
            );
            const progress = Number(file.progress);
            const showProgress = Number.isFinite(progress) && progress > 0 && progress < 100;

            return {
                id: `${activity.id}-affected-${index}-${Ext.String.htmlEncode(file.name || 'file')}`,
                parentActivityId: activity.id,
                source: 'affected',
                activityType: 'Affected File',
                iconCls: this.getAffectedFileIcon(file),
                title: file.name || file.fileName || 'Unnamed file',
                detail: '',
                affectedFileCount: 0,
                isAffectedRow: true,
                isOverflowRow: false,
                expandable: false,
                expanded: false,
                fileSize: file.size || null,
                fileType: this.getAffectedFileType(file),
                filePath: this.sanitizeAffectedPath(file.path || file.filePath || file.folderPath || ''),
                status: String(file.status || '').toLowerCase() || 'queued',
                statusText: status,
                statusGroup: activity.statusGroup || 'active',
                progress: Number.isFinite(progress) ? progress : 0,
                showProgress,
                updatedAt: activity.updatedAt,
                canCancel: false,
                canOpenPanel: false,
                relatedProgressId: activity.relatedProgressId || null,
                jobId: activity.jobId || null,
                fileCount: 0,
                sortWeight: activity.sortWeight
            };
        }, this);

        if (files.length > limit) {
            rows.push({
                id: `${activity.id}-affected-overflow`,
                parentActivityId: activity.id,
                source: 'affected',
                activityType: 'Affected File',
                iconCls: 'fa fa-ellipsis-h',
                title: `${files.length - limit} more files hidden to keep this view responsive`,
                detail: '',
                affectedFileCount: 0,
                isAffectedRow: true,
                isOverflowRow: true,
                expandable: false,
                expanded: false,
                status: 'hidden',
                statusText: '',
                statusGroup: activity.statusGroup || 'active',
                progress: 0,
                showProgress: false,
                updatedAt: activity.updatedAt,
                canCancel: false,
                canOpenPanel: false
            });
        }

        return rows;
    },

    updateSummary: function(activities) {
        const counts = {
            active: 0,
            attention: 0,
            failed: 0,
            total: activities.length
        };

        Ext.Array.forEach(activities, function(activity) {
            if (activity.statusGroup === 'active') {
                counts.active++;
            } else if (activity.statusGroup === 'attention') {
                counts.attention++;
            } else if (activity.statusGroup === 'failed') {
                counts.failed++;
            }
        });

        this.updateSummaryCard('activeActivityCard', 'Active', counts.active, 'Jobs running now', 'fa fa-play blue-icon');
        this.updateSummaryCard('attentionActivityCard', 'Needs Attention', counts.attention, 'Interrupted or cancelled work', 'fa fa-circle-exclamation orange-icon');
        this.updateSummaryCard('failedActivityCard', 'Failed', counts.failed, 'Jobs that ended with errors', 'fa fa-triangle-exclamation red-icon');
        this.updateSummaryCard('totalActivityCard', 'Tracked', counts.total, 'Visible background jobs', 'fa fa-list-check blue-icon');
    },

    updateSummaryCard: function(itemId, label, value, hint, iconCls) {
        const card = this.down(`#${itemId}`);
        if (card) {
            card.update(this.renderSummaryCard(label, value, hint, iconCls));
        }
    },

    renderSummaryCard: function(label, value, hint, iconCls) {
        return [
            '<div class="activity-center-metric">',
            `<i class="${Ext.String.htmlEncode(iconCls)}"></i>`,
            '<div class="activity-center-metric-copy">',
            `<div class="activity-center-metric-label">${Ext.String.htmlEncode(label)}</div>`,
            `<div class="activity-center-metric-value">${Ext.String.htmlEncode(String(value))}</div>`,
            `<div class="activity-center-metric-hint">${Ext.String.htmlEncode(hint)}</div>`,
            '</div>',
            '</div>'
        ].join('');
    },

    renderProgress: function(value) {
        const progress = Math.max(0, Math.min(Number(value) || 0, 100));

        return [
            '<div class="activity-center-progress-shell">',
            `<div class="activity-center-progress-fill" style="width:${progress}%"></div>`,
            `<span>${Math.round(progress)}%</span>`,
            '</div>'
        ].join('');
    },

    normalizeAffectedFiles: function(files) {
        if (!Array.isArray(files)) {
            return [];
        }

        return files.map(function(file, index) {
            return {
                name: file.name || file.fileName || file.text || 'Unnamed file',
                fileName: file.fileName || file.name || file.text || 'Unnamed file',
                status: file.status || 'Queued',
                statusLabel: file.statusLabel || null,
                size: file.size || null,
                type: file.type || file.mimeType || '',
                path: file.path || file.filePath || file.folderPath || file.folder || '',
                progress: file.progress,
                originalIndex: Number.isFinite(Number(file.originalIndex)) ? Number(file.originalIndex) : index
            };
        }).sort(function(first, second) {
            return first.originalIndex - second.originalIndex;
        });
    },

    sanitizeAffectedPath: function(path) {
        const rawPath = String(path || '').trim();
        if (!rawPath) {
            return '';
        }

        const parts = rawPath
            .replace(/\\/g, '/')
            .split('/')
            .filter(Boolean);

        if (!parts.length) {
            return '';
        }

        const userIdIndex = parts.findIndex(part => /^[0-9a-f]{24}$/i.test(part));
        const visibleParts = userIdIndex >= 0 ? parts.slice(userIdIndex + 1) : parts;

        if (!visibleParts.length) {
            return 'Root';
        }

        return ['Root'].concat(visibleParts).join(' / ');
    },

    getAffectedFileType: function(file) {
        const type = String(file.type || '').trim();
        const name = String(file.name || file.fileName || '').toLowerCase();

        if (type && type.indexOf('/') === -1) {
            return type;
        }

        if (type.indexOf('image/') === 0) return 'Image';
        if (type.indexOf('video/') === 0) return 'Video';
        if (type.indexOf('audio/') === 0) return 'Audio';
        if (type === 'application/pdf' || /\.pdf$/i.test(name)) return 'PDF';
        if (/\.(zip|7z|rar|tar|gz|tgz)$/i.test(name)) return 'Archive';

        const extensionMatch = name.match(/\.([a-z0-9]+)$/i);
        return extensionMatch ? extensionMatch[1].toUpperCase() : 'File';
    },

    getAffectedFileIcon: function(file) {
        const type = String(file.type || '').toLowerCase();
        const name = String(file.name || file.fileName || '').toLowerCase();

        if (type.indexOf('image/') === 0 || /\.(png|jpe?g|gif|webp|svg)$/.test(name)) {
            return 'fa fa-image blue-icon';
        }

        if (type.indexOf('video/') === 0 || /\.(mp4|mov|webm|mkv|avi)$/.test(name)) {
            return 'fa fa-film blue-icon';
        }

        if (type.indexOf('audio/') === 0 || /\.(mp3|wav|ogg|m4a)$/.test(name)) {
            return 'fa fa-music blue-icon';
        }

        if (/\.pdf$/.test(name)) {
            return 'fa fa-file-pdf red-icon';
        }

        if (/\.(zip|7z|rar|tar|gz|tgz)$/.test(name)) {
            return 'fa fa-file-zipper orange-icon';
        }

        return 'fa fa-file blue-icon';
    },

    formatBytes: function(value) {
        const bytes = Number(value) || 0;
        if (!bytes) return '';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    },

    getSelectedRecord: function() {
        const grid = this.down('#activityGrid');
        const selection = grid ? grid.getSelectionModel().getSelection() : [];
        return selection.length ? selection[0] : null;
    },

    updateActionButtons: function() {
        const record = this.getSelectedRecord();
        const cancelButton = this.down('#cancelActivityButton');
        const openButton = this.down('#openActivityButton');

        if (cancelButton) {
            cancelButton.setDisabled(!record || record.get('canCancel') !== true);
        }

        if (openButton) {
            openButton.setDisabled(!record || record.get('canOpenPanel') !== true);
        }
    },

    cancelSelectedActivity: function() {
        const record = this.getSelectedRecord();
        if (!record || record.get('canCancel') !== true) {
            return;
        }

        const progressId = record.get('relatedProgressId');
        const jobId = record.get('jobId');
        const progressManager = FileManagement.components.utils.ProgressBarManager;
        const progressBar = progressId && progressManager ? progressManager.getProgressBar(progressId) : null;

        if (progressBar && typeof progressBar.cancelCallback === 'function') {
            Promise.resolve(progressBar.cancelCallback(progressBar)).catch(function(error) {
                Ext.Msg.alert('Cancel Activity', error.message || 'Failed to cancel the selected activity.');
            });
            return;
        }

        if (FileManagement.components.utils.SocketManager &&
            FileManagement.components.utils.SocketManager.cancelOperation &&
            (jobId || progressId)) {
            FileManagement.components.utils.SocketManager.cancelOperation(jobId, progressId);
        }
    },

    openSelectedActivityDetails: function() {
        const record = this.getSelectedRecord();
        if (!record || record.get('canOpenPanel') !== true) {
            return;
        }

        switch (record.get('source')) {
            case 'scan':
                FileManagement.components.status.ScanQueuePanel.restore();
                break;
            case 'media':
                FileManagement.components.status.MediaConversionQueuePanel.restore();
                break;
            case 'document':
                FileManagement.components.status.DocumentConversionQueuePanel.restore();
                break;
            case 'recovery':
                FileManagement.components.utils.UploadSessionManager.restoreRecoveryPanel();
                break;
            default:
                break;
        }
    }
});
