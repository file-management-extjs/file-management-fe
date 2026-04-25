Ext.define('FileManagement.components.dashboard.HomeDashboard', {
    extend: 'Ext.container.Container',
    xtype: 'homedashboard',

    requires: [
        'FileManagement.components.status.ScanQueuePanel',
        'FileManagement.components.utils.WorkspaceContext',
        'FileManagement.components.utils.PanelUtils',
        'FileManagement.helpers.Functions'
    ],

    cls: 'workspace-dashboard-body',
    padding: 10,
    layout: {
        type: 'vbox',
        align: 'stretch'
    },
    scrollable: true,

    initComponent: function() {
        const me = this;
        const username = FileManagement.helpers.Functions.getUsername() || 'there';
        me.responsiveMode = me.getResponsiveMode(Ext.Element.getViewportWidth());

        me.recentStore = Ext.create('Ext.data.Store', {
            fields: [
                { name: 'id', type: 'string' },
                { name: 'name', type: 'string' },
                { name: 'path', type: 'string' },
                { name: 'type', type: 'string' },
                { name: 'mimetype', type: 'string' },
                { name: 'size', type: 'number' },
                { name: 'createdAt', type: 'date' },
                { name: 'isFolder', type: 'boolean' },
                { name: 'isPasswordProtected', type: 'boolean' },
                { name: 'parent_id', type: 'string' },
                { name: 'ancestors', type: 'auto' },
                {
                    name: 'displayType',
                    convert: function(value, record) {
                        if (record.get('isFolder')) return 'Folder';

                        const mimetype = record.get('mimetype') || record.get('type') || '';
                        if (mimetype === 'application/pdf') return 'PDF';
                        if (mimetype === 'application/zip') return 'ZIP';
                        if (mimetype.startsWith('image/')) return 'Image';
                        if (mimetype.startsWith('video/')) return 'Video';
                        if (mimetype.startsWith('audio/')) return 'Audio';
                        if (mimetype.startsWith('text/')) return 'Text';
                        return mimetype.split('/')[1] || 'File';
                    }
                },
                {
                    name: 'icon',
                    convert: function(value, record) {
                        let iconClass = 'fa';
                        const mimetype = record.get('mimetype') || record.get('type') || '';

                        if (record.get('isFolder')) {
                            iconClass += ' fa-folder';
                        } else if (mimetype === 'application/pdf') {
                            iconClass += ' fa-file-pdf red-icon';
                        } else if (mimetype === 'application/zip') {
                            iconClass += ' fa-file-archive yellow-icon';
                        } else if (mimetype.startsWith('image/')) {
                            iconClass += ' fa-image green-icon';
                        } else if (mimetype.startsWith('text/')) {
                            iconClass += ' fa-file-lines';
                        } else {
                            iconClass += ' fa-file';
                        }

                        if (record.get('isPasswordProtected')) {
                            iconClass += ' fa-lock';
                        }

                        return iconClass;
                    }
                }
            ]
        });

        me.typeBreakdownStore = Ext.create('Ext.data.Store', {
            fields: [
                { name: 'category', type: 'string' },
                { name: 'count', type: 'number' },
                { name: 'bytes', type: 'number' },
                { name: 'percent', type: 'number' },
                { name: 'barValue', type: 'number' },
                { name: 'iconCls', type: 'string' },
                { name: 'sizeLabel', type: 'string' }
            ]
        });

        me.guideStore = Ext.create('Ext.data.Store', {
            fields: ['step', 'title', 'description', 'iconCls'],
            data: [
                {
                    step: 1,
                    iconCls: 'fa fa-folder-open',
                    title: 'Open File Explorer',
                    description: 'Browse folders, view files, move items, and manage passwords.'
                },
                {
                    step: 2,
                    iconCls: 'fa fa-search',
                    title: 'Use Quick Search',
                    description: 'Press Ctrl+Space or use the left navigation to jump straight to files.'
                },
                {
                    step: 3,
                    iconCls: 'fa fa-list-check',
                    title: 'Activity Center',
                    description: 'Track uploads, downloads, compression, scans, conversions, and interrupted work.'
                }
            ]
        });

        Ext.apply(me, {
            items: me.createDashboardItems(username)
        });

        me.callParent(arguments);

        me.on('afterrender', function() {
            me.syncInitialResponsiveChrome();
            me.fitToWorkspace();
            me.loadSummary();

            const workspace = Ext.getCmp('mainPanelRegion');
            if (workspace) {
                me.mon(workspace, 'resize', function() {
                    me.fitToWorkspace(workspace);
                });
            }
        });
    },

    createDashboardItems: function(username) {
        return [
            this.createDashboardActionBar(),
            this.createCommandCenter(username),
            this.createMetricRow(),
            this.createAnalyticsRow(),
            this.createWorkspaceLists()
        ];
    },

    createDashboardActionBar: function() {
        const me = this;

        return {
            xtype: 'toolbar',
            itemId: 'dashboardActionBar',
            enableOverflow: true,
            margin: '0 0 8 0',
            items: [
                {
                    text: 'Open File Explorer',
                    iconCls: 'fa fa-folder-open',
                    handler: function() {
                        FileManagement.components.utils.PanelUtils.openFileExplorer();
                    }
                },
                {
                    text: 'Upload Files',
                    iconCls: 'fa fa-upload',
                    handler: function() {
                        FileManagement.components.utils.PanelUtils.openUploadForm();
                    }
                },
                {
                    text: 'Create Folder',
                    iconCls: 'fa fa-folder',
                    handler: function() {
                        FileManagement.components.utils.PanelUtils.promptCreateFolder();
                    }
                },
                {
                    text: 'Quick Search',
                    iconCls: 'fa fa-search',
                    handler: function() {
                        FileManagement.components.utils.PanelUtils.showQuickSearch();
                    }
                },
                {
                    text: 'Activity Center',
                    iconCls: 'fa fa-list-check',
                    handler: function() {
                        FileManagement.components.utils.PanelUtils.openActivityCenter();
                    }
                },
                '->',
                {
                    text: 'Refresh',
                    iconCls: 'fa fa-refresh',
                    handler: function() {
                        me.loadSummary();
                    }
                }
            ]
        };
    },

    createCommandCenter: function(username) {
        const compact = this.isCompactMode();

        return {
            xtype: 'panel',
            itemId: 'commandCenterPanel',
            title: 'Workspace Command Center',
            frame: true,
            bodyPadding: 10,
            margin: '0 0 8 0',
            minHeight: 118,
            layout: {
                type: compact ? 'vbox' : 'hbox',
                align: compact ? 'stretch' : 'middle'
            },
            items: [
                {
                    xtype: 'component',
                    itemId: 'commandCenterIntro',
                    flex: compact ? null : 1,
                    margin: 0,
                    html: [
                        '<h2><i class="fa fa-gauge-high blue-icon"></i> Welcome back, ',
                        Ext.String.htmlEncode(username),
                        '</h2>',
                        '<p>Open your explorer, upload files, search everything, and keep an eye on activity from one place.</p>'
                    ].join('')
                },
                {
                    xtype: 'container',
                    itemId: 'commandCenterStatus',
                    width: compact ? null : 270,
                    margin: compact ? '8 0 0 0' : 0,
                    layout: {
                        type: 'vbox',
                        align: 'stretch'
                    },
                    defaults: {
                        margin: '0 0 6 0'
                    },
                    items: [
                        {
                            xtype: 'displayfield',
                            itemId: 'updatedAtField',
                            fieldLabel: 'Last refresh',
                            labelWidth: 82,
                            value: 'Waiting for data'
                        },
                        {
                            xtype: 'progressbar',
                            itemId: 'activityProgress',
                            value: 0,
                            text: 'No recent activity yet'
                        },
                        {
                            xtype: 'sparklinebar',
                            itemId: 'recentSparkline',
                            height: 32,
                            values: [0, 0, 0, 0, 0, 0, 0, 0],
                            barColor: '#3a87ad'
                        }
                    ]
                }
            ]
        };
    },

    createMetricRow: function() {
        const compact = this.isCompactMode();
        const compactMetricHeight = 128;
        const compactMetricGap = 8;
        const panels = [
            this.createMetricPanel({
                title: 'Files',
                panelItemId: 'filesMetricPanel',
                valueItemId: 'filesMetric',
                hintItemId: 'filesHint',
                progressItemId: 'filesProgress',
                iconCls: 'fa fa-file blue-icon'
            }),
            this.createMetricPanel({
                title: 'Folders',
                panelItemId: 'foldersMetricPanel',
                valueItemId: 'foldersMetric',
                hintItemId: 'foldersHint',
                progressItemId: 'foldersProgress',
                iconCls: 'fa fa-folder green-icon'
            }),
            this.createMetricPanel({
                title: 'Storage',
                panelItemId: 'storageMetricPanel',
                valueItemId: 'storageMetric',
                hintItemId: 'storageHint',
                progressItemId: 'storageProgress',
                iconCls: 'fa fa-database blue-icon'
            }),
            this.createMetricPanel({
                title: 'Protected',
                panelItemId: 'protectedMetricPanel',
                valueItemId: 'protectedMetric',
                hintItemId: 'protectedHint',
                progressItemId: 'protectedProgress',
                iconCls: 'fa fa-lock orange-icon'
            })
        ];

        panels.forEach(function(panel, index) {
            panel.flex = compact ? null : 1;
            panel.height = compact ? compactMetricHeight : null;
            panel.margin = compact
                ? (index === panels.length - 1 ? 0 : `0 0 ${compactMetricGap} 0`)
                : (index === panels.length - 1 ? 0 : '0 8 0 0');
        });

        return {
            xtype: 'container',
            itemId: 'metricRow',
            layout: {
                type: compact ? 'vbox' : 'hbox',
                align: 'stretch'
            },
            margin: '0 0 8 0',
            flex: null,
            height: compact ? (panels.length * compactMetricHeight) + ((panels.length - 1) * compactMetricGap) : null,
            items: panels
        };
    },

    createMetricPanel: function(config) {
        return {
            xtype: 'panel',
            itemId: config.panelItemId,
            title: config.title,
            iconCls: config.iconCls,
            frame: true,
            cls: 'workspace-metric-panel',
            bodyPadding: 8,
            minHeight: 118,
            layout: {
                type: 'vbox',
                align: 'stretch'
            },
            items: [
                {
                    xtype: 'container',
                    layout: {
                        type: 'hbox',
                        align: 'middle'
                    },
                    items: [
                        {
                            xtype: 'component',
                            width: 38,
                            html: `<i class="${config.iconCls}" style="font-size: 24px;"></i>`
                        },
                        {
                            xtype: 'container',
                            flex: 1,
                            items: [
                                {
                                    xtype: 'component',
                                    itemId: config.valueItemId,
                                    html: '0',
                                    style: 'font-size: 24px; font-weight: bold; line-height: 28px;'
                                },
                                {
                                    xtype: 'component',
                                    itemId: config.hintItemId,
                                    html: '&nbsp;',
                                    style: 'color: #445;'
                                }
                            ]
                        }
                    ]
                },
                {
                    xtype: 'progressbar',
                    itemId: config.progressItemId,
                    cls: 'workspace-metric-progress',
                    height: 18,
                    value: 0,
                    text: 'Waiting for data',
                    margin: '8 4 2 4'
                }
            ]
        };
    },

    createAnalyticsRow: function() {
        const compact = this.isCompactMode();
        const narrow = this.isNarrowMode();

        return {
            xtype: 'container',
            itemId: 'analyticsRow',
            height: compact ? (narrow ? 620 : 480) : 210,
            margin: '0 0 8 0',
            layout: {
                type: compact ? 'vbox' : 'hbox',
                align: 'stretch'
            },
            items: [
                {
                    xtype: 'panel',
                    itemId: 'storageMixPanel',
                    title: 'Storage Mix',
                    iconCls: 'fa fa-chart-pie',
                    frame: true,
                    bodyPadding: 8,
                    flex: compact ? null : 2,
                    height: compact ? (narrow ? 400 : 270) : null,
                    margin: compact ? '0 0 8 0' : '0 8 0 0',
                    layout: {
                        type: narrow ? 'vbox' : 'hbox',
                        align: 'stretch'
                    },
                    items: [
                        {
                            xtype: 'sparklinepie',
                            itemId: 'typeSparkline',
                            width: narrow ? 118 : 142,
                            height: narrow ? 118 : 142,
                            margin: narrow ? '6 0 8 0' : '10 14 0 4',
                            values: [1],
                            sliceColors: ['#3a87ad', '#468847', '#f0ad4e', '#b94a48', '#777777', '#5bc0de']
                        },
                        this.createTypeBreakdownGrid()
                    ]
                },
                {
                    xtype: 'panel',
                    itemId: 'workspaceHealthPanel',
                    title: 'Workspace Health',
                    iconCls: 'fa fa-heart-pulse',
                    frame: true,
                    bodyPadding: 10,
                    flex: compact ? null : 1,
                    height: compact ? 190 : null,
                    layout: {
                        type: 'vbox',
                        align: 'stretch'
                    },
                    defaults: {
                        margin: '0 0 8 0'
                    },
                    items: [
                        {
                            xtype: 'displayfield',
                            itemId: 'healthSummary',
                            fieldLabel: 'Snapshot',
                            labelWidth: 70,
                            value: 'Waiting for data'
                        },
                        {
                            xtype: 'progressbar',
                            itemId: 'rootItemsProgress',
                            value: 0,
                            text: 'Root visibility'
                        },
                        {
                            xtype: 'progressbar',
                            itemId: 'scanReadyProgress',
                            value: 0,
                            text: 'Scan readiness'
                        },
                        {
                            xtype: 'progressbar',
                            itemId: 'storageSpreadProgress',
                            value: 0,
                            text: 'Storage balance'
                        }
                    ]
                }
            ]
        };
    },

    createTypeBreakdownGrid: function() {
        return {
            xtype: 'grid',
            itemId: 'typeBreakdownGrid',
            store: this.typeBreakdownStore,
            flex: 1,
            hideHeaders: false,
            columns: [
                {
                    text: '',
                    dataIndex: 'iconCls',
                    width: 34,
                    menuDisabled: true,
                    sortable: false,
                    renderer: function(value) {
                        return `<i class="${value}"></i>`;
                    }
                },
                {
                    text: 'Type',
                    dataIndex: 'category',
                    flex: 1
                },
                {
                    text: 'Files',
                    dataIndex: 'count',
                    width: 58,
                    align: 'right'
                },
                {
                    text: 'Size',
                    itemId: 'typeSizeColumn',
                    dataIndex: 'sizeLabel',
                    width: 92,
                    align: 'right'
                },
                {
                    xtype: 'widgetcolumn',
                    text: 'Share',
                    itemId: 'typeShareColumn',
                    dataIndex: 'barValue',
                    width: 130,
                    widget: {
                        xtype: 'progressbarwidget',
                        textTpl: ['{percent:number("0")}%']
                    }
                }
            ],
            viewConfig: {
                deferEmptyText: false,
                emptyText: 'Upload files to see your storage mix.'
            }
        };
    },

    createWorkspaceLists: function() {
        const compact = this.isCompactMode();

        return {
            xtype: 'container',
            itemId: 'workspaceLists',
            flex: compact ? null : 1,
            height: compact ? 620 : null,
            minHeight: 280,
            layout: {
                type: compact ? 'vbox' : 'hbox',
                align: 'stretch'
            },
            items: [
                this.createRecentActivityGrid(),
                this.createGuideGrid()
            ]
        };
    },

    createRecentActivityGrid: function() {
        const compact = this.isCompactMode();

        return {
            xtype: 'grid',
            itemId: 'recentActivityGrid',
            title: 'Recent Activity',
            iconCls: 'fa fa-clock',
            frame: true,
            store: this.recentStore,
            flex: compact ? null : 2,
            height: compact ? 340 : null,
            margin: compact ? '0 0 8 0' : '0 8 0 0',
            columns: [
                {
                    text: '',
                    dataIndex: 'icon',
                    width: 34,
                    menuDisabled: true,
                    sortable: false,
                    renderer: function(value) {
                        return `<i class="${value}"></i>`;
                    }
                },
                {
                    text: 'Name',
                    dataIndex: 'name',
                    flex: 1,
                    renderer: function(value) {
                        return Ext.String.htmlEncode(value);
                    }
                },
                {
                    text: 'Type',
                    itemId: 'recentTypeColumn',
                    dataIndex: 'displayType',
                    width: 100
                },
                {
                    text: 'Size',
                    itemId: 'recentSizeColumn',
                    dataIndex: 'size',
                    width: 110,
                    renderer: (value) => this.formatBytes(value)
                },
                {
                    text: 'Created',
                    itemId: 'recentCreatedColumn',
                    dataIndex: 'createdAt',
                    width: 120,
                    renderer: Ext.util.Format.dateRenderer('M d, Y')
                }
            ],
            viewConfig: {
                deferEmptyText: false,
                emptyText: 'No recent files yet.'
            },
            listeners: {
                itemdblclick: (grid, record) => {
                    this.openRecentItem(record);
                }
            }
        };
    },

    createGuideGrid: function() {
        const compact = this.isCompactMode();

        return {
            xtype: 'grid',
            itemId: 'workspaceGuideGrid',
            title: 'Workspace Guide',
            iconCls: 'fa fa-map',
            frame: true,
            store: this.guideStore,
            flex: compact ? null : 1,
            height: compact ? 260 : null,
            columns: [
                {
                    text: '',
                    dataIndex: 'iconCls',
                    width: 34,
                    menuDisabled: true,
                    sortable: false,
                    renderer: function(value) {
                        return `<i class="${value}"></i>`;
                    }
                },
                {
                    text: 'Guide',
                    dataIndex: 'title',
                    flex: 1,
                    tdCls: 'workspace-guide-text-cell',
                    renderer: function(value, metaData, record) {
                        return [
                            '<div class="workspace-guide-title">',
                                Ext.String.htmlEncode(value),
                            '</div>',
                            '<div class="workspace-guide-description">',
                                Ext.String.htmlEncode(record.get('description') || ''),
                            '</div>'
                        ].join('');
                    }
                }
            ],
            hideHeaders: true,
            viewConfig: {
                stripeRows: false
            }
        };
    },

    resolveWorkspaceSize: function(workspace) {
        const target = workspace || Ext.getCmp('mainPanelRegion');

        if (!target || target.destroyed || target.destroying) {
            return null;
        }

        if (target.rendered && target.getEl && target.getEl()) {
            const renderedSize = target.getSize();
            if (renderedSize && renderedSize.width && renderedSize.height) {
                return renderedSize;
            }
        }

        if (target.lastBox && target.lastBox.width && target.lastBox.height) {
            return {
                width: target.lastBox.width,
                height: target.lastBox.height
            };
        }

        if (target.width && target.height) {
            return {
                width: target.width,
                height: target.height
            };
        }

        return null;
    },

    fitToWorkspace: function(workspace) {
        if (this.destroyed || this.destroying || !this.rendered) {
            return;
        }

        const size = this.resolveWorkspaceSize(workspace);
        if (!size || !size.width || !size.height) {
            return;
        }

        this.setPosition(0, 0);
        this.setSize(size.width, size.height);
        this.applyResponsiveLayout(size.width);
    },

    applyResponsiveLayout: function(width) {
        if (!this.rendered) {
            return;
        }

        const mode = this.getResponsiveMode(width);
        if (this.responsiveMode === mode) {
            return;
        }

        this.responsiveMode = mode;

        const compact = mode !== 'desktop';

        if (compact) {
            this.addCls('workspace-dashboard-compact');
        } else {
            this.removeCls('workspace-dashboard-compact');
        }
    },

    getResponsiveMode: function(width) {
        const viewportWidth = Number(width) || Ext.Element.getViewportWidth();
        if (viewportWidth < 480) return 'narrow';
        if (viewportWidth < 720) return 'compact';
        return 'desktop';
    },

    isCompactMode: function() {
        return this.responsiveMode !== 'desktop';
    },

    isNarrowMode: function() {
        return this.responsiveMode === 'narrow';
    },

    syncInitialResponsiveChrome: function() {
        const compact = this.isCompactMode();

        if (compact) {
            this.addCls('workspace-dashboard-compact');
        }
    },

    loadSummary: function() {
        const me = this;
        const workspaceContext = FileManagement.components.utils.WorkspaceContext;
        const contextReady = workspaceContext.getActiveWorkspace()
            ? Promise.resolve(workspaceContext.getContext())
            : workspaceContext.load();
        const requestId = (me.summaryRequestId || 0) + 1;

        me.summaryRequestId = requestId;

        if (me.rendered) {
            me.setLoading('Refreshing workspace...');
        }

        contextReady.then(function() {
            if (me.destroyed || me.destroying || requestId !== me.summaryRequestId) {
                return;
            }

            Ext.Ajax.request({
                url: FileManagementEnv.apiUrl('/api/files/summary'),
                method: 'GET',
                params: {
                    workspaceId: workspaceContext.getActiveWorkspaceId() || ''
                },
                success: function(response) {
                    if (requestId !== me.summaryRequestId) {
                        return;
                    }

                    const payload = Ext.decode(response.responseText);
                    me.updateSummary(payload.summary || {});
                },
                failure: function() {
                    if (requestId !== me.summaryRequestId) {
                        return;
                    }

                    me.recentStore.removeAll();
                    Ext.Msg.alert('Dashboard', 'Unable to refresh the dashboard summary right now.');
                },
                callback: function() {
                    if (me.rendered && requestId === me.summaryRequestId) {
                        me.setLoading(false);
                    }
                }
            });
        }).catch(function() {
            if (me.rendered && requestId === me.summaryRequestId) {
                me.setLoading(false);
            }
        });
    },

    updateSummary: function(summary) {
        const counts = summary.counts || {};
        const storage = summary.storage || {};
        const scan = summary.scan || {};
        const recentItems = summary.recentItems || [];
        const typeBreakdown = this.prepareTypeBreakdown(summary.typeBreakdown || []);
        const totalItems = (counts.files || 0) + (counts.folders || 0);
        const fileRatio = totalItems ? (counts.files || 0) / totalItems : 0;
        const folderRatio = totalItems ? (counts.folders || 0) / totalItems : 0;
        const protectedRatio = totalItems ? (counts.protectedItems || 0) / totalItems : 0;
        const largestType = typeBreakdown[0];
        const storageBalanceRatio = largestType ? (largestType.percent || 0) / 100 : 0;

        this.updateMetric('filesMetric', 'filesHint', 'filesProgress', counts.files || 0, `${counts.rootItems || 0} visible at root`, fileRatio, `${Math.round(fileRatio * 100)}% of items`);
        this.updateMetric('foldersMetric', 'foldersHint', 'foldersProgress', counts.folders || 0, 'Directories across your workspace', folderRatio, `${Math.round(folderRatio * 100)}% folder mix`);
        this.updateMetric('storageMetric', 'storageHint', 'storageProgress', this.formatBytes(storage.totalBytes || 0), 'Total clean file size', storageBalanceRatio, largestType ? `${largestType.category}: ${largestType.percent}%` : 'No files yet');
        this.updateMetric('protectedMetric', 'protectedHint', 'protectedProgress', counts.protectedItems || 0, 'Password protected items', protectedRatio, `${Math.round(protectedRatio * 100)}% protected`);

        this.recentStore.loadData(recentItems);
        this.typeBreakdownStore.loadData(typeBreakdown);
        this.updateDashboardPulse(summary, recentItems, typeBreakdown, scan);
    },

    updateMetric: function(valueItemId, hintItemId, progressItemId, value, hint, progressValue, progressText) {
        const valueField = this.down(`#${valueItemId}`);
        const hintField = this.down(`#${hintItemId}`);
        const progressBar = this.down(`#${progressItemId}`);

        if (valueField) {
            valueField.update(Ext.String.htmlEncode(String(value)));
        }

        if (hintField) {
            hintField.update(Ext.String.htmlEncode(hint));
        }

        if (progressBar) {
            progressBar.updateProgress(this.normalizeRatio(progressValue), Ext.String.htmlEncode(progressText), true);
        }
    },

    updateDashboardPulse: function(summary, recentItems, typeBreakdown, scan) {
        const counts = summary.counts || {};
        const totalItems = (counts.files || 0) + (counts.folders || 0);
        const activeScanCount = FileManagement.components.status.ScanQueuePanel.getActiveScanCount();
        const rootRatio = totalItems ? (counts.rootItems || 0) / totalItems : 0;
        const scanReadyRatio = scan.total ? (scan.ready || 0) / scan.total : 0;
        const largestType = typeBreakdown[0];
        const storageBalanceRatio = largestType ? (largestType.percent || 0) / 100 : 0;
        const updatedAt = summary.generatedAt ? Ext.Date.format(new Date(summary.generatedAt), 'M d, Y g:i A') : 'Just now';
        const activityRatio = Math.min(recentItems.length / 8, 1);
        const sparklineValues = recentItems.map((item) => Math.max(1, Math.round((item.size || 0) / 1024))).slice(0, 8);
        const pieValues = typeBreakdown.map((item) => item.bytes || item.count).filter((value) => value > 0);

        this.updateDisplayField('updatedAtField', updatedAt);
        this.updateDisplayField('healthSummary', `${totalItems} items, ${activeScanCount} active scan${activeScanCount === 1 ? '' : 's'}`);
        this.updateProgressBar('activityProgress', activityRatio, `${recentItems.length} recent item${recentItems.length === 1 ? '' : 's'} loaded`);
        this.updateProgressBar('rootItemsProgress', rootRatio, `${counts.rootItems || 0} of ${totalItems} items visible at root`);
        this.updateProgressBar('scanReadyProgress', scanReadyRatio, `${scan.ready || 0} of ${scan.total || 0} files ready`);
        this.updateProgressBar('storageSpreadProgress', storageBalanceRatio, largestType ? `${largestType.category} holds ${largestType.percent}% of storage` : 'No storage mix yet');
        this.updateSparkline('recentSparkline', sparklineValues.length ? sparklineValues : [0, 0, 0, 0]);
        this.updateSparkline('typeSparkline', pieValues.length ? pieValues : [1]);
    },

    prepareTypeBreakdown: function(typeBreakdown) {
        return typeBreakdown.map((entry) => {
            const percent = Number(entry.percent) || 0;

            return {
                category: entry.category || 'Other',
                count: entry.count || 0,
                bytes: entry.bytes || 0,
                percent,
                barValue: this.normalizeRatio(percent / 100),
                iconCls: entry.iconCls || 'fa fa-file',
                sizeLabel: this.formatBytes(entry.bytes || 0)
            };
        }).sort((first, second) => {
            if (second.bytes !== first.bytes) {
                return second.bytes - first.bytes;
            }

            return second.count - first.count;
        });
    },

    updateDisplayField: function(itemId, value) {
        const field = this.down(`#${itemId}`);
        if (field) {
            field.setValue(Ext.String.htmlEncode(value));
        }
    },

    updateProgressBar: function(itemId, value, text) {
        const progressBar = this.down(`#${itemId}`);
        if (progressBar) {
            progressBar.updateProgress(this.normalizeRatio(value), Ext.String.htmlEncode(text), true);
        }
    },

    updateSparkline: function(itemId, values) {
        const sparkline = this.down(`#${itemId}`);
        if (!sparkline) {
            return;
        }

        if (sparkline.setValues) {
            sparkline.setValues(values);
            return;
        }

        sparkline.values = values;
        if (sparkline.refresh) {
            sparkline.refresh();
        }
    },

    normalizeRatio: function(value) {
        const ratio = Number(value) || 0;
        return Math.max(0, Math.min(1, ratio));
    },

    openRecentItem: function(record) {
        const grid = FileManagement.components.utils.PanelUtils.openFileExplorer();
        if (!grid) {
            return;
        }

        if (record.get('isFolder')) {
            grid.navigateToFolderRecord(record);
            return;
        }

        grid.onFileDoubleClick(record);
    },

    formatBytes: function(bytes) {
        const value = Number(bytes) || 0;
        if (value < 1024) return `${value} B`;
        if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
        if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
        return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }
});
