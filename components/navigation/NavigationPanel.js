Ext.define('FileManagement.components.navigation.NavigationPanel', {
    extend: 'Ext.panel.Panel',
    xtype: 'navigationpanel',
    id: 'navigationpanel',
    title: 'Navigation Panel',
    layout: {
        type: 'vbox',
        align: 'stretch'
    },
    collapsible: true,

    minWidth: 240,
    maxWidth: 360,

    requires: [
        'FileManagement.components.status.ScanQueuePanel',
        'FileManagement.components.status.MediaConversionQueuePanel',
        'FileManagement.components.status.DocumentConversionQueuePanel',
        'FileManagement.components.status.ActivityCenterPanel',
        'FileManagement.components.organizations.OrganizationAdminPanel',
        'FileManagement.components.utils.WorkspaceContext',
        'FileManagement.components.utils.PrivateVaultManager'
    ],

    mobileOverlayBreakpoint: 720,
    mobileOverlayPanel: null,

    initComponent: function() {
        const me = this;

        Ext.apply(this, {
            listeners: {
                beforeexpand: function(panel) {
                    if (panel.isMobileOverlayMode()) {
                        panel.showMobileOverlay();
                        return false;
                    }
                },
                collapse: function(panel) {
                    if (!panel.isMobileOverlayMode()) {
                        panel.hideMobileOverlay();
                    }
                },
                afterrender: function(panel) {
                    panel.fitMobileOverlayPanel();
                },
                resize: function(panel) {
                    panel.fitMobileOverlayPanel();
                }
            },
            items: [
                me.createNavigationTree(),
                me.createNavigationFooter()
            ],
        });

        this.callParent();
        this.refreshActivityCenterCount();
        Ext.defer(this.syncPrivateVaultNavigationState, 50, this);
    },

    isMobileOverlayMode: function(width) {
        return (Number(width) || Ext.Element.getViewportWidth()) < this.mobileOverlayBreakpoint;
    },

    createNavigationTree: function() {
        const me = this;

        return {
            xtype: 'treepanel',
            itemId: 'navigationTree',
            flex: 1,
            rootVisible: false,
            useArrows: true,
            lines: false,
            border: false,
            hideHeaders: true,
            bodyCls: 'workspace-navigation-tree-body',
            viewConfig: {
                stripeRows: false,
                trackOver: true,
                overItemCls: 'workspace-navigation-item-over',
                selectedItemCls: 'workspace-navigation-item-selected'
            },
            store: Ext.create('Ext.data.TreeStore', {
                fields: ['text', 'action', 'baseText', 'panelRef', 'badgeCount', 'iconCls', 'nodeKey', 'disabled'],
                root: {
                    expanded: true,
                    children: me.getNavigationTreeChildren()
                }
            }),
            columns: [
                {
                    xtype: 'treecolumn',
                    dataIndex: 'text',
                    flex: 1,
                    renderer: function(value) {
                        return Ext.String.htmlEncode(value);
                    }
                }
            ],
            listeners: {
                itemclick: function(view, record) {
                    me.handleTreeSelection(record);
                }
            }
        };
    },

    createNavigationFooter: function(isOverlay) {
        return {
            xtype: 'container',
            itemId: isOverlay ? 'navigationOverlayFooter' : 'navigationFooter',
            height: 276,
            padding: '6 8 6 8',
            style: {
                borderTop: '1px solid #9bbce3',
                background: '#dfeaf7'
            },
            layout: {
                type: 'vbox',
                align: 'stretch'
            },
            defaults: {
                margin: '0 0 6 0',
                textAlign: 'left'
            },
            items: [
                this.createWorkspaceSelector(),
                this.createActivityMiniPanel(),
                {
                    xtype: 'button',
                    text: 'Storage Insights',
                    iconCls: 'fa fa-chart-pie',
                    height: 30,
                    handler: () => {
                        FileManagement.components.utils.PanelUtils.openStorageInsights();
                        this.hideMobileOverlay();
                    }
                },
                {
                    xtype: 'button',
                    text: 'Organizations',
                    iconCls: 'fa fa-building',
                    height: 30,
                    handler: () => {
                        FileManagement.components.utils.PanelUtils.openOrganizationAdmin();
                        this.hideMobileOverlay();
                    }
                },
                {
                    xtype: 'button',
                    text: 'Settings',
                    iconCls: 'fa fa-gear',
                    height: 30,
                    margin: 0,
                    handler: () => {
                        FileManagement.components.utils.PanelUtils.openUserSettings();
                        this.hideMobileOverlay();
                    }
                }
            ]
        };
    },

    createWorkspaceSelector: function() {
        const me = this;

        return {
            xtype: 'combo',
            itemId: 'workspaceSelector',
            height: 48,
            editable: false,
            queryMode: 'local',
            fieldLabel: 'Workspace',
            labelAlign: 'top',
            labelSeparator: '',
            labelStyle: 'font-size:11px;font-weight:bold;color:#36506b;line-height:14px;',
            displayField: 'label',
            valueField: 'id',
            emptyText: 'Select workspace',
            store: Ext.create('Ext.data.Store', {
                fields: ['id', 'label', 'type', 'status'],
                data: []
            }),
            listeners: {
                afterrender: function(combo) {
                    me.refreshWorkspaceSelector(combo);
                    FileManagement.components.utils.WorkspaceContext.load();
                    if (Ext.GlobalEvents) {
                        combo.mon(Ext.GlobalEvents, 'workspacecontextchanged', function() {
                            me.refreshWorkspaceSelector(combo);
                            me.syncPrivateVaultNavigationState();
                        });
                    }
                },
                select: function(combo, records) {
                    const record = records && records[0];
                    const workspaceId = record ? record.get('id') : combo.getValue();
                    FileManagement.components.utils.WorkspaceContext.setActiveWorkspace(workspaceId).then(function() {
                        Ext.ComponentQuery.query('filegrid').forEach(function(grid) {
                            if (grid && !grid.destroyed && !grid.destroying && !grid.sharedMode && !grid.sharedByMeMode) {
                                grid.applyWorkspaceContext();
                            }
                        });
                        Ext.ComponentQuery.query('storageinsightspanel').forEach(function(panel) {
                            if (panel && !panel.destroyed && !panel.destroying && panel.loadInsights) {
                                panel.loadInsights(true);
                            }
                        });
                        FileManagement.components.utils.PanelUtils.refreshHomeDashboard();
                        me.syncPrivateVaultNavigationState();
                    });
                }
            }
        };
    },

    refreshWorkspaceSelector: function(combo) {
        combo = combo || this.down('#workspaceSelector');
        if (!combo || combo.destroyed || combo.destroying) {
            return;
        }

        const context = FileManagement.components.utils.WorkspaceContext.getContext();
        const data = (context.workspaces || [])
            .filter(function(workspace) {
                return !workspace.status || workspace.status === 'active';
            })
            .map(function(workspace) {
                return {
                    id: workspace.id,
                    type: workspace.type,
                    status: workspace.status,
                    label: workspace.type === 'organization'
                        ? `${workspace.name} (Org)`
                        : workspace.name
                };
            });

        combo.getStore().loadData(data);
        const activeWorkspace = context.activeWorkspace && data.some(workspace => workspace.id === context.activeWorkspace.id)
            ? context.activeWorkspace
            : data[0];

        if (activeWorkspace) {
            combo.suspendEvents(false);
            combo.setValue(activeWorkspace.id);
            combo.resumeEvents();
        }
    },

    createActivityMiniPanel: function() {
        const me = this;

        return {
            xtype: 'component',
            itemId: 'activityCenterMini',
            cls: 'navigation-activity-mini',
            height: 96,
            html: me.renderActivityMiniHtml([]),
            listeners: {
                afterrender: function(component) {
                    const el = component.getEl();
                    if (!el) {
                        return;
                    }

                    el.on('mousedown', function(event) {
                        event.stopEvent();
                        me.openActivityCenterFromNavigation();
                    });

                    el.on('click', function(event) {
                        event.stopEvent();
                        me.openActivityCenterFromNavigation();
                    });

                    el.on('keydown', function(event) {
                        const key = event.getKey();
                        if (key === 13 || key === 32) {
                            event.preventDefault();
                            me.openActivityCenterFromNavigation();
                        }
                    });

                    el.dom.setAttribute('tabindex', '0');
                    el.dom.setAttribute('role', 'button');
                }
            }
        };
    },

    openActivityCenterFromNavigation: function() {
        const now = Ext.Date.now();
        if (this.lastActivityCenterOpenAt && now - this.lastActivityCenterOpenAt < 300) {
            return;
        }

        this.lastActivityCenterOpenAt = now;
        FileManagement.components.utils.PanelUtils.openActivityCenter();
        this.hideMobileOverlay();
    },

    ensureMobileOverlayPanel: function() {
        if (this.mobileOverlayPanel && !this.mobileOverlayPanel.destroyed) {
            return this.mobileOverlayPanel;
        }

        this.mobileOverlayPanel = Ext.create('Ext.panel.Panel', {
            title: this.title,
            floating: true,
            alwaysOnTop: true,
            renderTo: Ext.getBody(),
            shadow: true,
            frame: true,
            hidden: true,
            closeAction: 'hide',
            layout: {
                type: 'vbox',
                align: 'stretch'
            },
            cls: 'navigation-panel-mobile-overlay',
            style: {
                pointerEvents: 'auto'
            },
            x: 0,
            y: 0,
            tools: [
                {
                    type: 'close',
                    tooltip: 'Hide navigation',
                    handler: () => this.hideMobileOverlay()
                }
            ],
            items: [
                this.createNavigationTree(),
                this.createNavigationFooter(true)
            ],
            listeners: {
                show: panel => this.fitMobileOverlayPanel(panel),
                afterrender: panel => this.fitMobileOverlayPanel(panel),
                resize: panel => this.fitMobileOverlayPanel(panel)
            }
        });

        return this.mobileOverlayPanel;
    },

    showMobileOverlay: function() {
        if (!this.isMobileOverlayMode()) {
            return;
        }

        const overlayPanel = this.ensureMobileOverlayPanel();
        this.refreshPanelList();
        this.refreshActivityCenterCount();
        overlayPanel.x = 0;
        overlayPanel.y = 0;
        this.fitMobileOverlayPanel(overlayPanel);
        overlayPanel.setPosition(0, 0);
        overlayPanel.show();
        overlayPanel.toFront();
        this.fitMobileOverlayPanel(overlayPanel);
        this.pinMobileOverlayPanel(overlayPanel);
        Ext.defer(this.pinMobileOverlayPanel, 50, this, [overlayPanel]);
        Ext.defer(this.pinMobileOverlayPanel, 150, this, [overlayPanel]);
    },

    hideMobileOverlay: function() {
        if (this.mobileOverlayPanel && !this.mobileOverlayPanel.destroyed) {
            this.mobileOverlayPanel.hide();
        }
    },

    fitMobileOverlayPanel: function(panel) {
        const overlayPanel = panel || this.mobileOverlayPanel;
        if (!overlayPanel || overlayPanel.destroyed || !this.isMobileOverlayMode()) {
            return;
        }

        const toolbar = Ext.ComponentQuery.query('#userToolbar')[0];
        const toolbarHeight = toolbar && toolbar.rendered ? toolbar.getHeight() : 0;
        const viewportWidth = Ext.Element.getViewportWidth();
        const viewportHeight = Ext.Element.getViewportHeight();
        const width = Math.min(240, Math.max(200, viewportWidth - 96));
        const height = Math.max(260, viewportHeight - toolbarHeight);

        overlayPanel.setSize(width, height);
        overlayPanel.setPosition(0, 0);

        if (overlayPanel.rendered && overlayPanel.getEl()) {
            window.highestZIndex = Math.max((window.highestZIndex || 1) + 1, 20000);
            overlayPanel.getEl().setStyle({
                zIndex: window.highestZIndex,
                pointerEvents: 'auto'
            });
            this.pinMobileOverlayPanel(overlayPanel);
        }
    },

    pinMobileOverlayPanel: function(panel) {
        const overlayPanel = panel || this.mobileOverlayPanel;
        if (!overlayPanel || overlayPanel.destroyed || !overlayPanel.rendered || !overlayPanel.getEl()) {
            return;
        }

        overlayPanel.x = 0;
        overlayPanel.y = 0;
        overlayPanel.getEl().setStyle({
            position: 'fixed',
            left: '0px',
            top: '0px',
            right: 'auto',
            bottom: 'auto',
            transform: 'none'
        });
        overlayPanel.getEl().setXY([0, 0]);
    },

    getNavigationTreeChildren: function() {
        return [
            {
                text: 'Quick Access',
                iconCls: 'fa fa-bolt',
                expanded: true,
                selectable: false,
                leaf: false,
                children: [
                    { text: 'Home', baseText: 'Home', iconCls: 'fa fa-home', action: 'home', leaf: true },
                    { text: 'File Explorer', baseText: 'File Explorer', iconCls: 'fa fa-folder-open', action: 'fileExplorer', leaf: true },
                    { text: 'Private Vault', baseText: 'Private Vault', iconCls: 'fa fa-user-lock', action: 'privateVault', leaf: true },
                    { text: 'Shared With Me', baseText: 'Shared With Me', iconCls: 'fa fa-share-nodes', action: 'sharedWithMe', leaf: true },
                    { text: 'Shared By Me', baseText: 'Shared By Me', iconCls: 'fa fa-share-from-square', action: 'sharedByMe', leaf: true },
                    { text: 'Upload Files', baseText: 'Upload Files', iconCls: 'fa fa-upload', action: 'upload', leaf: true },
                    { text: 'Quick Search', baseText: 'Quick Search', iconCls: 'fa fa-search', action: 'search', leaf: true },
                    { text: 'New Folder', baseText: 'New Folder', iconCls: 'fa fa-folder', action: 'newFolder', leaf: true }
                ]
            },
            {
                text: 'Opened Panels',
                iconCls: 'fa fa-window-restore',
                nodeKey: 'openedPanels',
                expanded: true,
                selectable: false,
                leaf: false,
                children: []
            }
        ];
    },

    refreshPanelList: function() {
        const mainPanelRegion = Ext.getCmp('mainPanelRegion');
        const navigationTrees = this.getNavigationTrees();

        if (!mainPanelRegion || !navigationTrees.length) {
            return;
        }

        new Ext.util.DelayedTask(function(){
            const visiblePanels = mainPanelRegion.items.getRange().filter(
                panel => panel instanceof Ext.panel.Panel &&
                    (panel.isVisible() || panel.minimizedToTaskbar) &&
                    panel.xtype !== 'homedashboard' &&
                    panel.itemId !== 'snapassist'
            );

            const data = visiblePanels.map(panel => ({
                text: `${panel.minimizedToTaskbar ? '[Minimized] ' : ''}${panel.title || 'Untitled Panel'}`,
                action: 'openedPanel',
                panelRef: panel,
                iconCls: panel.iconCls || (panel.xtype === 'filegrid' ? 'fa fa-folder-open' : 'fa fa-window-maximize'),
                leaf: true
            }));

            navigationTrees.forEach(function(tree) {
                const store = tree.getStore();
                const openedPanelsNode = store ? store.getRootNode().findChild('nodeKey', 'openedPanels', true) : null;
                if (!openedPanelsNode) {
                    return;
                }

                openedPanelsNode.removeAll(false);
                openedPanelsNode.appendChild(data);
            });
        }).delay(100);
    },

    refreshScanQueueCount: function() {
        this.refreshActivityCenterCount();
    },

    refreshMediaConversionCount: function() {
        this.refreshActivityCenterCount();
    },

    refreshDocumentConversionCount: function() {
        this.refreshActivityCenterCount();
    },

    refreshActivityCenterCount: function(force) {
        if (force !== true) {
            if (this.activityCenterRefreshTimer) {
                return;
            }

            this.activityCenterRefreshTimer = Ext.defer(function() {
                this.activityCenterRefreshTimer = null;
                this.refreshActivityCenterCount(true);
            }, 120, this);
            return;
        }

        const activities = this.getMiniActivityRows();
        const html = this.renderActivityMiniHtml(activities);

        this.getNavigationFooters().forEach(function(footer) {
            const miniPanel = footer.down('#activityCenterMini');
            if (!miniPanel) {
                return;
            }

            if (miniPanel.lastActivityCenterHtml === html) {
                return;
            }

            miniPanel.lastActivityCenterHtml = html;
            miniPanel.update(html);
        });
    },

    getMiniActivityRows: function() {
        const activityCenter = FileManagement.components.status.ActivityCenterPanel;
        const activities = activityCenter && activityCenter.collectActivities
            ? activityCenter.collectActivities()
            : [];

        return activities.filter(function(activity) {
            return !activity.history &&
                (activity.statusGroup === 'active' || activity.statusGroup === 'attention');
        });
    },

    renderActivityMiniHtml: function(activities) {
        const count = activities.length;
        const visibleRows = activities.slice(0, 2);
        const headerText = count > 0 ? `Activity Center (${count})` : 'Activity Center';
        const rows = visibleRows.map(activity => this.renderActivityMiniRow(activity)).join('');
        const overflowText = count > visibleRows.length
            ? `<div class="navigation-activity-more">+${count - visibleRows.length} more background job${count - visibleRows.length === 1 ? '' : 's'}</div>`
            : '';
        const emptyText = count === 0
            ? '<div class="navigation-activity-empty">No active background jobs</div>'
            : '';

        return [
            '<div class="navigation-activity-card">',
            '<div class="navigation-activity-header">',
            '<span><i class="fa fa-list-check"></i> ',
            Ext.String.htmlEncode(headerText),
            '</span>',
            count > 0 ? '<i class="fa fa-chevron-right navigation-activity-open-icon"></i>' : '',
            '</div>',
            '<div class="navigation-activity-body">',
            rows,
            overflowText,
            emptyText,
            '</div>',
            '</div>'
        ].join('');
    },

    renderActivityMiniRow: function(activity) {
        const progress = Math.max(0, Math.min(Number(activity.progress) || 0, 100));
        const title = Ext.String.htmlEncode(activity.title || activity.activityType || 'Background job');
        const type = Ext.String.htmlEncode(activity.activityType || 'Background job');
        const status = Ext.String.htmlEncode(activity.statusText || 'Running');
        const group = Ext.String.htmlEncode(activity.statusGroup || 'active');
        const iconCls = Ext.String.htmlEncode(activity.iconCls || 'fa fa-spinner blue-icon');

        return [
            `<div class="navigation-activity-row navigation-activity-row-${group}">`,
            `<i class="${iconCls}"></i>`,
            '<div class="navigation-activity-row-main">',
            `<div class="navigation-activity-row-title">${title}</div>`,
            `<div class="navigation-activity-row-meta">${type} | ${status}</div>`,
            '<div class="navigation-activity-progress">',
            `<div class="navigation-activity-progress-fill" style="width:${progress}%"></div>`,
            `<span>${Math.round(progress)}%</span>`,
            '</div>',
            '</div>',
            '</div>'
        ].join('');
    },

    getNavigationTrees: function() {
        const trees = [];
        const mainTree = this.down('#navigationTree');
        const overlayTree = this.mobileOverlayPanel && !this.mobileOverlayPanel.destroyed
            ? this.mobileOverlayPanel.down('#navigationTree')
            : null;

        if (mainTree) {
            trees.push(mainTree);
        }

        if (overlayTree && overlayTree !== mainTree) {
            trees.push(overlayTree);
        }

        return trees;
    },

    getNavigationFooters: function() {
        const footers = [];
        const mainFooter = this.down('#navigationFooter');
        const overlayFooter = this.mobileOverlayPanel && !this.mobileOverlayPanel.destroyed
            ? this.mobileOverlayPanel.down('#navigationOverlayFooter')
            : null;

        if (mainFooter) {
            footers.push(mainFooter);
        }

        if (overlayFooter && overlayFooter !== mainFooter) {
            footers.push(overlayFooter);
        }

        return footers;
    },

    handleTreeSelection: function(record) {
        if (!record || !record.isLeaf()) {
            if (record) {
                if (record.isExpanded()) {
                    record.collapse();
                } else {
                    record.expand();
                }
            }
            return;
        }

        const action = record.get('action');
        if (action === 'openedPanel') {
            this.activatePanel(record.get('panelRef'));
            this.hideMobileOverlay();
            return;
        }

        if (record.get('disabled')) {
            Ext.Msg.alert('Private Vault', 'Private Vault is available only in your Personal workspace.');
            return;
        }

        this.handleNavigationAction(action);

        const shouldAutoClose = !FileManagement.components.settings ||
            !FileManagement.components.settings.UserSettings ||
            FileManagement.components.settings.UserSettings.get('workspace.mobileNavAutoClose', true) !== false;

        if (shouldAutoClose) {
            this.hideMobileOverlay();
        }
    },

    activatePanel: function(targetPanel) {
        if (!targetPanel) {
            return;
        }

        const mainPanel = Ext.getCmp('mainPanelRegion');
        if (!mainPanel) {
            return;
        }

        FileManagement.components.utils.PanelUtils.activateWorkspacePanel(targetPanel);
    },

    handleNavigationAction: function(action) {
        const panelUtils = FileManagement.components.utils.PanelUtils;

        switch (action) {
            case 'home':
                panelUtils.showHomeDashboard();
                break;
            case 'fileExplorer':
                panelUtils.openFileExplorer();
                break;
            case 'privateVault':
                FileManagement.components.utils.PrivateVaultManager.openPrivateVault();
                break;
            case 'sharedWithMe':
                panelUtils.openSharedWithMe();
                break;
            case 'sharedByMe':
                panelUtils.openSharedByMe();
                break;
            case 'upload':
                panelUtils.openUploadForm();
                break;
            case 'search':
                panelUtils.showQuickSearch();
                break;
            case 'newFolder':
                panelUtils.promptCreateFolder();
                break;
            case 'settings':
                panelUtils.openUserSettings();
                break;
            case 'organizationAdmin':
                panelUtils.openOrganizationAdmin();
                break;
            default:
                break;
        }
    },

    syncPrivateVaultNavigationState: function() {
        const workspace = FileManagement.components.utils.WorkspaceContext.getActiveWorkspace();
        const disabled = !!workspace && workspace.type !== 'personal';

        this.getNavigationTrees().forEach(function(tree) {
            const store = tree.getStore();
            const vaultNode = store ? store.getRootNode().findChild('action', 'privateVault', true) : null;

            if (!vaultNode) {
                return;
            }

            vaultNode.set('disabled', disabled);
            vaultNode.set('text', disabled ? 'Private Vault (Personal)' : 'Private Vault');
            vaultNode.commit();
        });
    }
});
