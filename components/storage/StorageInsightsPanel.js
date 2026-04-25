Ext.define('FileManagement.components.storage.StorageInsightsPanel', {
    extend: 'Ext.panel.Panel',
    xtype: 'storageinsightspanel',

    requires: [
        'FileManagement.components.viewers.ViewerFactory',
        'FileManagement.components.utils.WorkspaceContext',
        'FileManagement.components.utils.UploadSessionManager',
        'FileManagement.components.utils.SocketManager',
        'FileManagement.components.status.ScanQueuePanel'
    ],

    title: 'Storage Insights',
    iconCls: 'fa fa-chart-pie',
    frame: true,
    closable: true,
    width: 1060,
    height: 720,
    minWidth: 760,
    minHeight: 540,
    bodyPadding: 8,
    bodyCls: 'storage-insights-body',
    scrollable: true,
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
        minHeight: 540,
        minWidth: 760
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

    initComponent: function() {
        const me = this;

        me.currentTrendRange = 30;
        me.selectedCategory = null;
        me.trendData = null;
        me.folderTreeData = null;
        me.scanIssueWindow = null;

        me.categoryFilterStore = Ext.create('Ext.data.Store', {
            fields: ['category', 'label'],
            data: [
                { category: '', label: 'All types' },
                { category: 'Images', label: 'Images' },
                { category: 'Videos', label: 'Videos' },
                { category: 'Audio', label: 'Audio' },
                { category: 'PDFs', label: 'PDFs' },
                { category: 'Documents', label: 'Documents' },
                { category: 'Archives', label: 'Archives' },
                { category: 'Other', label: 'Other' }
            ]
        });

        me.typeStore = Ext.create('Ext.data.Store', {
            fields: ['category', 'count', 'bytes', 'percent', 'barValue', 'iconCls', 'sizeLabel']
        });

        me.extensionStore = Ext.create('Ext.data.Store', {
            fields: ['extension', 'fileType', 'count', 'bytes', 'percent', 'percentRatio', 'sizeLabel', 'colorIndex'],
            sorters: [{ property: 'bytes', direction: 'DESC' }]
        });

        me.largestFilesStore = Ext.create('Ext.data.Store', {
            fields: [
                { name: 'id', type: 'string' },
                { name: 'name', type: 'string' },
                { name: 'path', type: 'string' },
                { name: 'folderPath', type: 'string' },
                { name: 'parent_id', type: 'string' },
                { name: 'mimetype', type: 'string' },
                { name: 'type', type: 'string' },
                { name: 'size', type: 'number' },
                { name: 'sizeLabel', type: 'string' },
                { name: 'createdAt', type: 'date' },
                { name: 'updatedAt', type: 'date' },
                { name: 'ancestors', type: 'auto' }
            ],
            sorters: [{ property: 'size', direction: 'DESC' }]
        });

        me.cleanupStore = Ext.create('Ext.data.Store', {
            fields: ['title', 'detail', 'severity', 'iconCls', 'action', 'files', 'count']
        });

        me.folderTreeStore = Ext.create('Ext.data.TreeStore', {
            fields: [
                'id',
                'name',
                'text',
                'path',
                'type',
                'size',
                'sizeLabel',
                'allocatedLabel',
                'percentOfParent',
                'percentOfParentRatio',
                'itemCount',
                'fileCount',
                'folderCount',
                'modifiedAt',
                'attributes',
                'raw'
            ],
            root: {
                expanded: true,
                children: []
            }
        });

        Ext.apply(me, {
            dockedItems: [me.createTopToolbar()],
            items: [
                me.createSummaryRow(),
                me.createDistributionTrendRow(),
                me.createFolderVisualizationPanel(),
                me.createCleanupPanel()
            ],
            listeners: {
                afterrender: function(panel) {
                    panel.getEl().setStyle('position', 'absolute');
                    FileManagement.components.utils.WorkspaceContext.load().then(function() {
                        panel.loadInsights(false);
                    });
                },
                resize: function(panel) {
                    panel.renderTrendChart();
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
                        me.loadInsights(true);
                    }
                },
                {
                    text: 'Open File Explorer',
                    iconCls: 'fa fa-folder-open',
                    handler: function() {
                        FileManagement.components.utils.PanelUtils.openFileExplorer();
                    }
                },
                '->',
                {
                    xtype: 'tbtext',
                    itemId: 'storageInsightsScope',
                    text: 'Scope: Workspace'
                },
                '-',
                {
                    xtype: 'tbtext',
                    itemId: 'storageInsightsUpdatedAt',
                    text: 'Waiting for data'
                }
            ]
        };
    },

    createSummaryRow: function() {
        const cards = [
            this.createMetricPanel('Total quota', 'quotaMetric', 'quotaHint', 'quotaProgress', 'fa fa-hard-drive blue-icon'),
            this.createMetricPanel('Total used', 'usedMetric', 'usedHint', 'usedProgress', 'fa fa-database orange-icon'),
            this.createMetricPanel('Remaining', 'remainingMetric', 'remainingHint', 'remainingProgress', 'fa fa-box-archive green-icon'),
            this.createMetricPanel('Usage', 'usageMetric', 'usageHint', 'usageProgress', 'fa fa-gauge-high blue-icon')
        ];

        return {
            xtype: 'container',
            itemId: 'storageSummaryRow',
            height: 126,
            margin: '0 0 8 0',
            layout: {
                type: 'hbox',
                align: 'stretch'
            },
            defaults: {
                flex: 1,
                margin: '0 8 0 0'
            },
            items: cards.map(function(card, index) {
                if (index === cards.length - 1) {
                    card.margin = 0;
                }
                return card;
            })
        };
    },

    createMetricPanel: function(title, valueItemId, hintItemId, progressItemId, iconCls) {
        return {
            xtype: 'panel',
            title,
            iconCls,
            frame: true,
            bodyPadding: 8,
            cls: 'storage-insights-metric-panel',
            layout: {
                type: 'vbox',
                align: 'stretch'
            },
            items: [
                {
                    xtype: 'component',
                    itemId: valueItemId,
                    cls: 'storage-insights-metric-value',
                    html: '0'
                },
                {
                    xtype: 'component',
                    itemId: hintItemId,
                    cls: 'storage-insights-metric-hint',
                    html: '&nbsp;'
                },
                {
                    xtype: 'progressbar',
                    itemId: progressItemId,
                    height: 18,
                    margin: '8 0 0 0',
                    value: 0,
                    text: 'Waiting'
                }
            ]
        };
    },

    createDistributionTrendRow: function() {
        return {
            xtype: 'container',
            height: 254,
            margin: '0 0 8 0',
            layout: {
                type: 'hbox',
                align: 'stretch'
            },
            items: [
                this.createFileTypePanel(),
                this.createTrendPanel()
            ]
        };
    },

    createFileTypePanel: function() {
        const me = this;

        return {
            xtype: 'panel',
            title: 'Usage by File Type',
            iconCls: 'fa fa-chart-pie',
            frame: true,
            bodyPadding: 8,
            flex: 1,
            margin: '0 8 0 0',
            layout: {
                type: 'hbox',
                align: 'stretch'
            },
            tbar: [
                {
                    xtype: 'combobox',
                    itemId: 'fileTypeFilter',
                    width: 170,
                    store: me.categoryFilterStore,
                    displayField: 'label',
                    valueField: 'category',
                    queryMode: 'local',
                    editable: false,
                    value: '',
                    listeners: {
                        change: function(combo, value) {
                            me.applyTypeFilter(value || null);
                        }
                    }
                },
                {
                    text: 'Clear',
                    iconCls: 'fa fa-filter-circle-xmark',
                    handler: function() {
                        me.down('#fileTypeFilter').setValue('');
                    }
                }
            ],
            items: [
                {
                    xtype: 'sparklinepie',
                    itemId: 'fileTypePie',
                    width: 128,
                    height: 128,
                    margin: '18 14 0 0',
                    values: [1],
                    sliceColors: ['#2f7ed8', '#8bbc21', '#910000', '#f28f43', '#77a1e5', '#c42525', '#666666']
                },
                {
                    xtype: 'grid',
                    itemId: 'fileTypeGrid',
                    store: me.typeStore,
                    flex: 1,
                    columns: [
                        {
                            text: '',
                            dataIndex: 'iconCls',
                            width: 32,
                            menuDisabled: true,
                            sortable: false,
                            renderer: function(value) {
                                return `<i class="${Ext.String.htmlEncode(value || 'fa fa-file')}"></i>`;
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
                            dataIndex: 'sizeLabel',
                            width: 94,
                            align: 'right'
                        },
                        {
                            xtype: 'widgetcolumn',
                            text: 'Share',
                            dataIndex: 'barValue',
                            width: 120,
                            widget: {
                                xtype: 'progressbarwidget',
                                textTpl: ['{percent:number("0")}%']
                            }
                        }
                    ],
                    viewConfig: {
                        deferEmptyText: false,
                        emptyText: 'Upload files to see storage distribution.'
                    },
                    listeners: {
                        itemclick: function(grid, record) {
                            me.down('#fileTypeFilter').setValue(record.get('category'));
                        }
                    }
                }
            ]
        };
    },

    createTrendPanel: function() {
        const me = this;
        const rangeButton = function(days, pressed) {
            return {
                text: `${days} days`,
                enableToggle: true,
                toggleGroup: 'storageTrendRange',
                pressed,
                handler: function() {
                    me.setTrendRange(days);
                }
            };
        };

        return {
            xtype: 'panel',
            title: 'Growth Over Time',
            iconCls: 'fa fa-chart-line',
            frame: true,
            bodyPadding: 8,
            flex: 1,
            layout: {
                type: 'vbox',
                align: 'stretch'
            },
            tbar: [
                rangeButton(7, false),
                rangeButton(30, true),
                rangeButton(90, false)
            ],
            items: [
                {
                    xtype: 'component',
                    itemId: 'trendSummary',
                    cls: 'storage-trend-summary',
                    html: '&nbsp;'
                },
                {
                    xtype: 'component',
                    itemId: 'trendChart',
                    cls: 'storage-trend-chart',
                    flex: 1,
                    html: '<div class="storage-insights-empty">Waiting for trend data.</div>'
                }
            ]
        };
    },

    createFolderVisualizationPanel: function() {
        const me = this;

        return {
            xtype: 'panel',
            itemId: 'folderVisualizationPanel',
            title: 'Folder Size Visualization',
            iconCls: 'fa fa-folder-tree',
            frame: true,
            bodyPadding: 0,
            height: 300,
            minHeight: 260,
            margin: '0 0 8 0',
            layout: {
                type: 'fit'
            },
            items: [
                {
                    xtype: 'tabpanel',
                    itemId: 'folderVisualizationTabs',
                    plain: true,
                    border: false,
                    activeTab: 0,
                    items: [
                        {
                            title: 'Tree View',
                            itemId: 'folderTreeViewTab',
                            border: false,
                            layout: {
                                type: 'hbox',
                                align: 'stretch'
                            },
                            items: [
                                {
                                    xtype: 'treepanel',
                                    itemId: 'folderStatsTree',
                                    store: me.folderTreeStore,
                                    rootVisible: true,
                                    useArrows: false,
                                    lines: true,
                                    flex: 1,
                                    columnLines: true,
                                    forceFit: true,
                                    cls: 'storage-folder-tree',
                                    minWidth: 0,
                                    viewConfig: {
                                        deferEmptyText: false,
                                        emptyText: 'No folder storage has been accumulated yet.',
                                        stripeRows: false
                                    },
                                    columns: [
                                        {
                                            xtype: 'treecolumn',
                                            text: 'Folder',
                                            dataIndex: 'text',
                                            flex: 2,
                                            minWidth: 170,
                                            renderer: function(value) {
                                                return Ext.String.htmlEncode(value || '/');
                                            }
                                        },
                                        {
                                            text: '% of Parent',
                                            dataIndex: 'percentOfParent',
                                            width: 96,
                                            align: 'right',
                                            renderer: function(value, meta, record) {
                                                return me.renderParentPercent(value, record);
                                            }
                                        },
                                        {
                                            text: 'Size',
                                            dataIndex: 'size',
                                            width: 84,
                                            align: 'right',
                                            renderer: value => me.formatBytes(value)
                                        },
                                        {
                                            text: 'Allocated',
                                            dataIndex: 'allocatedLabel',
                                            width: 84,
                                            align: 'right'
                                        },
                                        {
                                            text: 'Items',
                                            dataIndex: 'itemCount',
                                            width: 60,
                                            align: 'right'
                                        },
                                        {
                                            text: 'Files',
                                            dataIndex: 'fileCount',
                                            width: 60,
                                            align: 'right'
                                        },
                                        {
                                            text: 'Folders',
                                            dataIndex: 'folderCount',
                                            width: 68,
                                            align: 'right'
                                        }
                                    ],
                                    listeners: {
                                        itemdblclick: function(view, record) {
                                            me.inspectFolderTreeRecord(record);
                                        }
                                    }
                                },
                                {
                                    xtype: 'splitter',
                                    width: 5
                                },
                                {
                                    xtype: 'grid',
                                    itemId: 'extensionBreakdownGrid',
                                    store: me.extensionStore,
                                    width: 340,
                                    minWidth: 300,
                                    maxWidth: 420,
                                    cls: 'storage-extension-grid',
                                    columnLines: true,
                                    forceFit: true,
                                    viewConfig: {
                                        deferEmptyText: false,
                                        emptyText: 'No file type usage yet.',
                                        stripeRows: false
                                    },
                                    columns: [
                                        {
                                            text: '',
                                            dataIndex: 'colorIndex',
                                            width: 28,
                                            menuDisabled: true,
                                            sortable: false,
                                            renderer: function(value) {
                                                const colorIndex = Math.max(0, Number(value) || 0) % 12;
                                                return `<span class="storage-extension-swatch storage-extension-color-${colorIndex}"></span>`;
                                            }
                                        },
                                        {
                                            text: 'Extension',
                                            dataIndex: 'extension',
                                            width: 74,
                                            renderer: function(value) {
                                                return Ext.String.htmlEncode(value || '[none]');
                                            }
                                        },
                                        {
                                            text: 'File Type',
                                            dataIndex: 'fileType',
                                            width: 104,
                                            renderer: function(value) {
                                                return Ext.String.htmlEncode(value || 'Other');
                                            }
                                        },
                                        {
                                            text: 'Percent',
                                            dataIndex: 'percent',
                                            flex: 1,
                                            minWidth: 92,
                                            align: 'right',
                                            renderer: function(value, meta, record) {
                                                return me.renderExtensionPercent(value, record);
                                            }
                                        }
                                    ]
                                }
                            ]
                        },
                        {
                            xtype: 'grid',
                            title: 'File View',
                            itemId: 'folderFileViewTab',
                            store: me.largestFilesStore,
                            border: false,
                            columns: [
                                {
                                    text: 'Name',
                                    dataIndex: 'name',
                                    flex: 1,
                                    renderer: function(value) {
                                        return Ext.String.htmlEncode(value || '');
                                    }
                                },
                                {
                                    text: 'File Type',
                                    dataIndex: 'type',
                                    width: 110
                                },
                                {
                                    text: 'Size',
                                    dataIndex: 'size',
                                    width: 110,
                                    align: 'right',
                                    renderer: value => me.formatBytes(value)
                                },
                                {
                                    text: 'Folder',
                                    dataIndex: 'folderPath',
                                    width: 220,
                                    renderer: function(value) {
                                        return Ext.String.htmlEncode(value || '/');
                                    }
                                },
                                {
                                    text: 'Modified',
                                    dataIndex: 'updatedAt',
                                    width: 132,
                                    renderer: Ext.util.Format.dateRenderer('M d, Y g:i A')
                                }
                            ],
                            viewConfig: {
                                deferEmptyText: false,
                                emptyText: 'No files are using storage yet.'
                            },
                            listeners: {
                                itemdblclick: function(grid, record) {
                                    me.viewFileRecord(record);
                                }
                            }
                        }
                    ]
                }
            ]
        };
    },

    createCleanupPanel: function() {
        const me = this;

        return {
            xtype: 'grid',
            itemId: 'cleanupSignalsGrid',
            title: 'Cleanup Signals',
            iconCls: 'fa fa-broom',
            frame: true,
            height: 214,
            store: me.cleanupStore,
            columns: [
                {
                    text: '',
                    dataIndex: 'iconCls',
                    width: 34,
                    menuDisabled: true,
                    sortable: false,
                    renderer: function(value) {
                        return `<i class="${Ext.String.htmlEncode(value || 'fa fa-circle-info')}"></i>`;
                    }
                },
                {
                    text: 'Signal',
                    dataIndex: 'title',
                    width: 210,
                    renderer: function(value) {
                        return Ext.String.htmlEncode(value || '');
                    }
                },
                {
                    text: 'Details',
                    dataIndex: 'detail',
                    flex: 1,
                    renderer: function(value) {
                        return Ext.String.htmlEncode(value || '');
                    }
                },
                {
                    xtype: 'widgetcolumn',
                    text: 'Action',
                    width: 132,
                    widget: {
                        xtype: 'button',
                        text: 'Review',
                        iconCls: 'fa fa-arrow-up-right-from-square',
                        handler: function(button) {
                            me.handleCleanupAction(button.getWidgetRecord());
                        }
                    }
                }
            ],
            viewConfig: {
                deferEmptyText: false,
                emptyText: 'No cleanup signals right now.'
            }
        };
    },

    loadInsights: function(refresh) {
        const me = this;

        if (me.rendered) {
            me.setLoading('Loading storage insights...');
        }

        const workspaceId = FileManagement.components.utils.WorkspaceContext.getActiveWorkspaceId() || '';
        me.workspaceId = workspaceId;
        const params = new URLSearchParams();
        if (refresh) params.set('refresh', '1');
        if (workspaceId) params.set('workspaceId', workspaceId);
        params.set('folderVisualizationLimit', '1500');
        me.updateScopeText();

        Ext.Ajax.request({
            url: FileManagementEnv.apiUrl(`/api/files/storage-insights${params.toString() ? `?${params.toString()}` : ''}`),
            method: 'GET',
            success: function(response) {
                const payload = Ext.decode(response.responseText, true) || {};
                me.updateInsights(payload.insights || {});
            },
            failure: function(response) {
                const payload = response.responseText ? Ext.decode(response.responseText, true) : null;
                Ext.Msg.alert('Storage Insights', payload?.message || 'Unable to load storage insights right now.');
            },
            callback: function() {
                if (me.rendered) {
                    me.setLoading(false);
                }
            }
        });
    },

    updateInsights: function(insights) {
        const typeRows = this.prepareTypeRows(insights.usageByFileType || []);
        const extensionRows = this.prepareExtensionRows(insights.extensionBreakdown || insights.usageByFileType || []);
        const fileRows = this.prepareFileRows(insights.largestFiles || []);

        this.insights = insights;
        this.trendData = insights.growthTrend || null;
        this.folderTreeData = insights.folderVisualization || null;

        this.updateSummary(insights.summary || {});
        this.typeStore.loadData(typeRows);
        this.extensionStore.loadData(extensionRows);
        this.updateSparkline('fileTypePie', typeRows.map(row => row.bytes).filter(value => value > 0));

        this.largestFilesStore.clearFilter();
        this.largestFilesStore.loadData(fileRows);
        this.applyTypeFilter(this.selectedCategory, true);

        this.cleanupStore.loadData(this.prepareCleanupRows(insights.cleanupSignals || {}));
        this.updateFolderVisualization(this.folderTreeData);
        this.renderTrendChart();

        const generatedAt = insights.generatedAt
            ? Ext.Date.format(new Date(insights.generatedAt), 'M d, Y g:i A')
            : 'Just refreshed';
        const updatedAt = this.down('#storageInsightsUpdatedAt');
        if (updatedAt) {
            updatedAt.setText(`Updated ${generatedAt}`);
        }

        this.updateScopeText();
    },

    updateScopeText: function() {
        const scopeText = this.down('#storageInsightsScope');
        const workspaceContext = FileManagement.components.utils.WorkspaceContext;
        const workspaceLabel = workspaceContext.getActiveWorkspaceLabel
            ? workspaceContext.getActiveWorkspaceLabel()
            : 'Workspace';

        if (scopeText) {
            scopeText.setText(`Scope: ${Ext.String.htmlEncode(workspaceLabel)}`);
        }
    },

    updateSummary: function(summary) {
        const quota = summary.quotaBytes || 0;
        const used = summary.usedBytes || 0;
        const remaining = summary.remainingBytes || 0;
        const usageRatio = quota > 0 ? used / quota : 0;
        const remainingRatio = quota > 0 ? remaining / quota : 0;

        this.updateMetric('quotaMetric', 'quotaHint', 'quotaProgress', this.formatBytes(quota), `${summary.fileCount || 0} files across ${summary.folderCount || 0} folders`, 1, 'Workspace quota');
        this.updateMetric('usedMetric', 'usedHint', 'usedProgress', this.formatBytes(used), 'Stored by active files', usageRatio, `${summary.usagePercent || 0}% used`);
        this.updateMetric('remainingMetric', 'remainingHint', 'remainingProgress', this.formatBytes(remaining), remaining > 0 ? 'Available capacity' : 'Quota reached', remainingRatio, `${Math.round(remainingRatio * 100)}% free`);
        this.updateMetric('usageMetric', 'usageHint', 'usageProgress', `${summary.usagePercent || 0}%`, 'Current quota consumption', usageRatio, this.formatBytes(used));
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

    prepareTypeRows: function(rows) {
        return rows.map(row => ({
            category: row.category || 'Other',
            count: row.count || 0,
            bytes: row.bytes || 0,
            percent: row.percent || 0,
            barValue: this.normalizeRatio((row.percent || 0) / 100),
            iconCls: row.iconCls || 'fa fa-file',
            sizeLabel: this.formatBytes(row.bytes || 0)
        }));
    },

    prepareExtensionRows: function(rows) {
        return (rows || [])
            .filter(row => (row.bytes || 0) > 0 || (row.count || 0) > 0)
            .map((row, index) => ({
                extension: row.extension || row.category || '[none]',
                fileType: row.fileType || row.category || 'Other',
                count: row.count || 0,
                bytes: row.bytes || 0,
                percent: row.percent || 0,
                percentRatio: this.normalizeRatio((row.percent || 0) / 100),
                sizeLabel: this.formatBytes(row.bytes || 0),
                colorIndex: Number.isFinite(Number(row.colorIndex)) ? Number(row.colorIndex) : index
            }));
    },

    prepareFileRows: function(rows) {
        return rows.map(row => ({
            ...row,
            sizeLabel: this.formatBytes(row.size || 0),
            folderPath: row.folderPath || '/'
        }));
    },

    prepareScanIssueFiles: function(rows) {
        return rows.map(row => ({
            ...row,
            sizeLabel: this.formatBytes(row.size || 0),
            folderPath: row.folderPath || '/',
            scanStatus: row.scanStatus || row.status || 'pending',
            scanProgress: row.scanProgress || row.progress || 0,
            scanResult: row.scanResult || row.result || ''
        }));
    },

    prepareCleanupRows: function(signals) {
        const rows = [];
        const thresholds = signals.thresholds || {};
        const veryLargeFiles = signals.veryLargeFiles || [];
        const oldLargeFiles = signals.oldLargeFiles || [];
        const interruptedUploads = signals.interruptedUploads || [];
        const scanIssues = signals.scanIssues || {};
        const scanIssueFiles = this.prepareScanIssueFiles(signals.scanIssueFiles || []);
        const scanIssueCount = ['pending', 'scanning', 'infected'].reduce(function(sum, key) {
            return sum + ((scanIssues[key] && scanIssues[key].count) || 0);
        }, 0);

        if (veryLargeFiles.length) {
            rows.push({
                title: 'Very large files',
                detail: `${veryLargeFiles.length} files are over ${this.formatBytes(thresholds.veryLargeBytes || 0)}. Largest: ${veryLargeFiles[0].name} (${this.formatBytes(veryLargeFiles[0].size)})`,
                severity: 'warning',
                iconCls: 'fa fa-file-circle-exclamation orange-icon',
                action: 'reviewLargeFiles',
                files: veryLargeFiles,
                count: veryLargeFiles.length
            });
        }

        if (oldLargeFiles.length) {
            rows.push({
                title: 'Old large files',
                detail: `${oldLargeFiles.length} large files have not changed in ${thresholds.oldLargeOlderThanDays || 180}+ days.`,
                severity: 'info',
                iconCls: 'fa fa-clock blue-icon',
                action: 'reviewOldLargeFiles',
                files: oldLargeFiles,
                count: oldLargeFiles.length
            });
        }

        if (interruptedUploads.length) {
            rows.push({
                title: 'Interrupted uploads',
                detail: `${signals.interruptedUploadCount || interruptedUploads.length} unfinished upload sessions may hold ${this.formatBytes(signals.interruptedUploadEstimatedBytes || 0)} in chunks.`,
                severity: 'warning',
                iconCls: 'fa fa-upload orange-icon',
                action: 'openInterruptedUploads',
                files: [],
                count: signals.interruptedUploadCount || interruptedUploads.length
            });
        }

        if (scanIssueCount) {
            rows.push({
                title: 'Scan attention',
                detail: `${scanIssueCount} files are pending, scanning, or blocked by scan results.`,
                severity: 'info',
                iconCls: 'fa fa-shield blue-icon',
                action: 'reviewScanIssues',
                files: scanIssueFiles,
                count: scanIssueCount
            });
        }

        if (!rows.length) {
            rows.push({
                title: 'No cleanup flags',
                detail: 'Largest files, old large files, interrupted uploads, and scan blockers look clear.',
                severity: 'success',
                iconCls: 'fa fa-circle-check green-icon',
                action: 'none',
                files: [],
                count: 0
            });
        }

        return rows;
    },

    updateSparkline: function(itemId, values) {
        const sparkline = this.down(`#${itemId}`);
        const nextValues = values && values.length ? values : [1];

        if (!sparkline) {
            return;
        }

        if (sparkline.setValues) {
            sparkline.setValues(nextValues);
            return;
        }

        sparkline.values = nextValues;
        if (sparkline.refresh) {
            sparkline.refresh();
        }
    },

    applyTypeFilter: function(category, preserveCombo) {
        this.selectedCategory = category || null;
        this.largestFilesStore.clearFilter();

        if (this.selectedCategory) {
            this.largestFilesStore.filterBy(record => record.get('type') === this.selectedCategory);
        }

        if (!preserveCombo) {
            const combo = this.down('#fileTypeFilter');
            if (combo && combo.getValue() !== (this.selectedCategory || '')) {
                combo.setValue(this.selectedCategory || '');
            }
        }
    },

    setTrendRange: function(days) {
        this.currentTrendRange = days;
        this.renderTrendChart();
    },

    renderTrendChart: function() {
        const component = this.down('#trendChart');
        const summary = this.down('#trendSummary');
        const points = this.trendData && this.trendData.ranges
            ? this.trendData.ranges[this.currentTrendRange] || []
            : [];

        if (!component) {
            return;
        }

        if (!points.length) {
            component.update('<div class="storage-insights-empty">No storage trend data yet.</div>');
            if (summary) {
                summary.update('&nbsp;');
            }
            return;
        }

        const width = 640;
        const height = 154;
        const padding = 18;
        const values = points.map(point => point.usedBytes || 0);
        const minValue = Math.min.apply(Math, values);
        const maxValue = Math.max.apply(Math, values);
        const spread = Math.max(maxValue - minValue, 1);
        const coordinates = points.map(function(point, index) {
            const x = padding + ((width - (padding * 2)) * (points.length === 1 ? 0 : index / (points.length - 1)));
            const y = height - padding - (((point.usedBytes || 0) - minValue) / spread) * (height - (padding * 2));
            return {
                x,
                y,
                point
            };
        });
        const polyline = coordinates.map(item => `${item.x.toFixed(1)},${item.y.toFixed(1)}`).join(' ');
        const lastPoint = points[points.length - 1];
        const firstPoint = points[0];
        const delta = (lastPoint.usedBytes || 0) - (firstPoint.usedBytes || 0);
        const circles = coordinates
            .filter((item, index) => index === 0 || index === coordinates.length - 1 || index % Math.ceil(points.length / 6) === 0)
            .map(item => `<circle cx="${item.x.toFixed(1)}" cy="${item.y.toFixed(1)}" r="3"></circle>`)
            .join('');

        if (summary) {
            summary.update(Ext.String.htmlEncode(`${this.currentTrendRange} day trend: ${this.formatBytes(lastPoint.usedBytes || 0)} used, ${delta >= 0 ? '+' : ''}${this.formatBytes(delta)} net visible growth`));
        }

        component.update([
            '<svg class="storage-trend-svg" viewBox="0 0 640 154" preserveAspectRatio="none">',
                '<line class="storage-trend-grid" x1="18" y1="18" x2="622" y2="18"></line>',
                '<line class="storage-trend-grid" x1="18" y1="77" x2="622" y2="77"></line>',
                '<line class="storage-trend-grid" x1="18" y1="136" x2="622" y2="136"></line>',
                `<polyline class="storage-trend-line" points="${polyline}"></polyline>`,
                `<g class="storage-trend-points">${circles}</g>`,
            '</svg>',
            '<div class="storage-trend-axis">',
                `<span>${Ext.String.htmlEncode(points[0].date)}</span>`,
                `<span>${Ext.String.htmlEncode(lastPoint.date)}</span>`,
            '</div>'
        ].join(''));
    },

    updateFolderVisualization: function(folderVisualization) {
        const root = folderVisualization && folderVisualization.root
            ? this.prepareTreeNode(folderVisualization.root, 0, folderVisualization.root.size || 0)
            : {
                id: 'root',
                name: 'Workspace',
                text: 'Workspace',
                path: '/',
                type: 'root',
                size: 0,
                sizeLabel: this.formatBytes(0),
                allocatedLabel: this.formatBytes(0),
                percentOfParent: 100,
                percentOfParentRatio: 1,
                itemCount: 0,
                fileCount: 0,
                folderCount: 0,
                expanded: true,
                children: []
            };

        if (!root.children || !root.children.length) {
            root.leaf = true;
        }

        if (this.folderTreeStore.setRootNode) {
            this.folderTreeStore.setRootNode(root);
        } else {
            this.folderTreeStore.setRoot(root);
        }
    },

    prepareTreeNode: function(node, depth, parentSize) {
        const size = Math.max(0, Number(node.size) || 0);
        const childSource = (node.children || []).filter(child => (child.size || 0) > 0 || child.type === 'folder');
        const children = childSource.map(child => this.prepareTreeNode(child, depth + 1, size));
        const fileCount = Number(node.fileCount) || 0;
        const folderCount = Number(node.folderCount) || children.filter(child => child.type === 'folder').length;
        const percentOfParent = depth === 0
            ? 100
            : (parentSize > 0 ? Math.round((size / parentSize) * 1000) / 10 : 0);
        const displayName = node.type === 'root'
            ? this.getWorkspaceTreeLabel(node)
            : (node.name || '/');

        return {
            id: node.id || `node-${depth}-${displayName}`,
            name: displayName,
            text: displayName,
            path: node.path || '/',
            type: node.type || 'folder',
            size,
            sizeLabel: this.formatBytes(size),
            allocatedLabel: this.formatBytes(size),
            percentOfParent,
            percentOfParentRatio: this.normalizeRatio(percentOfParent / 100),
            itemCount: fileCount + folderCount,
            fileCount,
            folderCount,
            modifiedAt: node.updatedAt || node.createdAt || null,
            attributes: node.type === 'folder' || node.type === 'root' ? '' : 'A',
            raw: node,
            expanded: depth < 2,
            leaf: children.length === 0,
            children
        };
    },

    getWorkspaceTreeLabel: function(root) {
        const workspaceContext = FileManagement.components.utils.WorkspaceContext;
        return workspaceContext.getActiveWorkspaceLabel
            ? workspaceContext.getActiveWorkspaceLabel()
            : (root.name || 'Workspace');
    },

    renderParentPercent: function(value, record) {
        const percent = Math.max(0, Math.min(Number(value) || 0, 100));
        const ratio = this.normalizeRatio(record.get('percentOfParentRatio'));
        const label = percent >= 10 ? `${percent.toFixed(1)} %` : `${percent.toFixed(2)} %`;

        return [
            '<div class="storage-percent-cell">',
                `<div class="storage-percent-bar" style="width:${Math.round(ratio * 1000) / 10}%"></div>`,
                `<span>${Ext.String.htmlEncode(label)}</span>`,
            '</div>'
        ].join('');
    },

    renderExtensionPercent: function(value, record) {
        const percent = Math.max(0, Math.min(Number(value) || 0, 100));
        const label = percent >= 10 ? `${percent.toFixed(1)} %` : `${percent.toFixed(2)} %`;
        const colorIndex = Math.max(0, Number(record.get('colorIndex')) || 0) % 12;

        return [
            '<div class="storage-extension-percent">',
                `<div class="storage-extension-percent-fill storage-extension-color-${colorIndex}" style="width:${percent}%"></div>`,
                `<span>${Ext.String.htmlEncode(label)}</span>`,
            '</div>'
        ].join('');
    },

    formatDateValue: function(value) {
        if (!value) {
            return '';
        }

        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) {
            return '';
        }

        return Ext.Date.format(date, 'm/d/Y g:i A');
    },

    formatPercent: function(value) {
        const percent = Math.max(0, Number(value) || 0) * 100;
        if (percent > 0 && percent < 0.1) {
            return '<0.1%';
        }

        return `${percent.toFixed(percent >= 10 ? 1 : 2)}%`;
    },

    inspectFolderTreeRecord: function(record) {
        const data = record && record.getData ? record.getData() : record;
        const raw = (record && record.get && record.get('raw')) || data;

        if (!data || data.type !== 'folder') {
            return;
        }

        this.inspectFolderData({
            ...raw,
            id: data.id,
            path: data.path,
            name: data.name
        });
    },

    viewFileRecord: function(record) {
        const data = record.getData ? record.getData() : record;
        const viewerRecord = {
            get: function(field) {
                return data[field];
            }
        };
        const mainPanel = Ext.getCmp('mainPanelRegion');

        if (!mainPanel) {
            Ext.Msg.alert('Storage Insights', 'Main panel not found.');
            return;
        }

        const existingViewer = mainPanel.items.findBy(item => item.fileId === data.id);
        if (existingViewer) {
            FileManagement.components.utils.PanelUtils.bringPanelForward(existingViewer);
            return;
        }

        const viewer = FileManagement.components.viewers.ViewerFactory.createViewer(viewerRecord);
        if (viewer) {
            viewer.fileId = data.id;
            viewer.show();

            const toolbar = Ext.ComponentQuery.query('userToolbar')[0];
            if (toolbar && toolbar.addPanelToggleButton) {
                toolbar.addPanelToggleButton(viewer, data.name, this.getFileIcon(data));
            }
        }
    },

    openContainingFolder: function(record) {
        const data = record.getData ? record.getData() : record;
        const grid = FileManagement.components.utils.PanelUtils.openFileExplorer();

        if (!grid) {
            return;
        }

        if (!data.parent_id) {
            grid.navigateToRoot();
        } else {
            grid.currentFolderPath = (data.ancestors || []).map(segment => ({
                id: segment.id,
                name: segment.name
            }));
            grid.loadFolderContents(null, data.parent_id, false);
        }

        Ext.defer(function() {
            const loadedRecord = grid.getStore().getById(data.id) ||
                grid.getStore().findRecord('id', data.id, 0, false, true, true);
            if (loadedRecord) {
                grid.getSelectionModel().select(loadedRecord);
            }
        }, 500);
    },

    inspectFolderData: function(data) {
        const folderId = String(data && data.id || '');
        if (!data || !folderId || folderId.indexOf(':') !== -1) {
            return;
        }

        const grid = FileManagement.components.utils.PanelUtils.openFileExplorer();
        if (!grid) {
            return;
        }

        const ancestors = data.ancestors || this.buildAncestorsFromTree(folderId) || this.buildAncestorsFromPath(data);
        grid.currentFolderPath = ancestors.map(segment => ({
            id: segment.id,
            name: segment.name
        }));
        grid.loadFolderContents(null, data.id, false);
    },

    buildAncestorsFromTree: function(nodeId) {
        const path = [];
        const visit = function(node) {
            if (!node) {
                return false;
            }

            if (node.type === 'folder') {
                path.push({
                    id: node.id,
                    name: node.name
                });
            }

            if (node.id === nodeId) {
                return true;
            }

            const children = node.children || [];
            for (let index = 0; index < children.length; index += 1) {
                if (visit(children[index])) {
                    return true;
                }
            }

            if (node.type === 'folder') {
                path.pop();
            }

            return false;
        };

        return visit(this.folderTreeData && this.folderTreeData.root) ? path : null;
    },

    buildAncestorsFromPath: function(data) {
        const pathValue = data.path || data.displayPath || data.name || '';
        const names = String(pathValue).split('/').filter(Boolean);

        return names.map(function(name, index) {
            return {
                id: index === names.length - 1 ? data.id : '',
                name
            };
        }).filter(segment => segment.name);
    },

    handleCleanupAction: function(record) {
        const action = record.get('action');
        const files = record.get('files') || [];

        if (action === 'openInterruptedUploads') {
            FileManagement.components.utils.UploadSessionManager.restoreRecoveryPanel();
            return;
        }

        if (action === 'openScanQueue') {
            this.restoreScanQueueFromServer();
            return;
        }

        if (action === 'reviewScanIssues') {
            if (files.length) {
                this.openScanIssueReview(files, record.get('count') || files.length);
            } else {
                this.restoreScanQueueFromServer();
            }
            return;
        }

        if ((action === 'reviewLargeFiles' || action === 'reviewOldLargeFiles') && files.length) {
            this.openContainingFolder(files[0]);
            return;
        }

        if (action !== 'none') {
            Ext.Msg.alert('Storage Insights', 'No direct action is available for this signal yet.');
        }
    },

    openScanIssueReview: function(files, totalCount) {
        const me = this;
        const rows = (files || []).map(function(file) {
            const status = String(file.scanStatus || file.status || 'pending').toLowerCase();

            return {
                id: file.id || file.fileId || '',
                name: file.name || file.fileName || 'Unknown file',
                folderPath: file.folderPath || '/',
                status,
                statusText: me.getScanIssueStatusText(status),
                progress: Number(file.scanProgress || file.progress || 0),
                result: file.scanResult || file.result || '',
                sizeLabel: file.sizeLabel || me.formatBytes(file.size || 0),
                raw: file
            };
        });

        if (!rows.length) {
            this.restoreScanQueueFromServer();
            return;
        }

        if (me.scanIssueWindow && !me.scanIssueWindow.destroyed) {
            me.scanIssueWindow.close();
        }

        const store = Ext.create('Ext.data.Store', {
            fields: ['id', 'name', 'folderPath', 'status', 'statusText', 'progress', 'result', 'sizeLabel', 'raw'],
            data: rows
        });
        const issueCount = Number(totalCount) || rows.length;

        me.scanIssueWindow = Ext.create('Ext.window.Window', {
            title: `Scan Attention (${issueCount})`,
            iconCls: 'fa fa-shield',
            width: 720,
            height: 330,
            minWidth: 560,
            minHeight: 260,
            layout: 'fit',
            closeAction: 'destroy',
            constrain: true,
            shadow: true,
            tools: [
                {
                    type: 'refresh',
                    tooltip: 'Open active scan queue',
                    handler: function() {
                        me.restoreScanQueueFromServer();
                    }
                }
            ],
            items: [
                {
                    xtype: 'grid',
                    store,
                    columns: [
                        {
                            text: 'File',
                            dataIndex: 'name',
                            flex: 1,
                            minWidth: 190,
                            renderer: function(value, meta, record) {
                                const path = Ext.String.htmlEncode(record.get('folderPath') || '/');
                                meta.tdAttr = `data-qtip="${path}"`;
                                return Ext.String.htmlEncode(value || '');
                            }
                        },
                        {
                            text: 'Status',
                            dataIndex: 'statusText',
                            width: 150,
                            renderer: function(value) {
                                return Ext.String.htmlEncode(value || '');
                            }
                        },
                        {
                            text: 'Progress',
                            dataIndex: 'progress',
                            width: 90,
                            align: 'right',
                            renderer: function(value, meta, record) {
                                const status = record.get('status');
                                if (status !== 'pending' && status !== 'scanning') {
                                    return '';
                                }
                                return `${Math.round(value || 0)}%`;
                            }
                        },
                        {
                            text: 'Details',
                            dataIndex: 'result',
                            flex: 1,
                            minWidth: 180,
                            renderer: function(value, meta, record) {
                                return Ext.String.htmlEncode(value || record.get('sizeLabel') || '');
                            }
                        },
                        {
                            xtype: 'widgetcolumn',
                            text: 'Action',
                            width: 132,
                            widget: {
                                xtype: 'button',
                                text: 'Open Folder',
                                iconCls: 'fa fa-folder-open',
                                handler: function(button) {
                                    const row = button.getWidgetRecord();
                                    me.openContainingFolder(row.get('raw'));
                                }
                            }
                        }
                    ],
                    viewConfig: {
                        deferEmptyText: false,
                        emptyText: 'No scan attention files found.'
                    }
                }
            ],
            listeners: {
                destroy: function(window) {
                    if (me.scanIssueWindow === window) {
                        me.scanIssueWindow = null;
                    }
                }
            }
        });

        me.scanIssueWindow.show();
    },

    restoreScanQueueFromServer: function() {
        const scanPanel = FileManagement.components.status && FileManagement.components.status.ScanQueuePanel;
        const socketManager = FileManagement.components.utils && FileManagement.components.utils.SocketManager;

        if (!scanPanel || !scanPanel.restore) {
            return;
        }

        if (socketManager && socketManager.restoreBackgroundActivityState) {
            Promise.resolve(socketManager.restoreBackgroundActivityState())
                .then(function() {
                    scanPanel.restore();
                })
                .catch(function() {
                    scanPanel.restore();
                });
            return;
        }

        scanPanel.restore();
    },

    getScanIssueStatusText: function(status) {
        switch (status) {
            case 'pending':
                return 'Queued for scan';
            case 'scanning':
                return 'Scanning';
            case 'infected':
                return 'Blocked';
            case 'error':
                return 'Scan failed';
            default:
                return 'Needs review';
        }
    },

    getFileIcon: function(data) {
        const mimetype = data.mimetype || '';
        if (mimetype === 'application/pdf') return 'fa fa-file-pdf red-icon';
        if (mimetype.startsWith('image/')) return 'fa fa-image green-icon';
        if (mimetype.startsWith('video/')) return 'fa fa-film blue-icon';
        if (mimetype.startsWith('audio/')) return 'fa fa-music blue-icon';
        if (data.type === 'Archives') return 'fa fa-file-archive yellow-icon';
        return 'fa fa-file';
    },

    normalizeRatio: function(value) {
        const ratio = Number(value) || 0;
        return Math.max(0, Math.min(1, ratio));
    },

    formatBytes: function(bytes) {
        const sign = Number(bytes) < 0 ? '-' : '';
        const value = Math.abs(Number(bytes) || 0);

        if (value < 1024) return `${sign}${value} B`;
        if (value < 1024 * 1024) return `${sign}${(value / 1024).toFixed(1)} KB`;
        if (value < 1024 * 1024 * 1024) return `${sign}${(value / (1024 * 1024)).toFixed(1)} MB`;
        return `${sign}${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }
});
