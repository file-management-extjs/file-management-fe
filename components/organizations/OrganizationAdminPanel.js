Ext.define('FileManagement.components.organizations.OrganizationAdminPanel', {
    extend: 'Ext.panel.Panel',
    xtype: 'organizationadminpanel',

    title: 'Organization Admin',
    iconCls: 'fa fa-building',
    frame: true,
    closable: true,
    width: 1080,
    height: 720,
    minWidth: 300,
    minHeight: 360,
    bodyPadding: 8,
    layout: 'card',
    mobileCompactBreakpoint: 560,

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
        minHeight: 360,
        minWidth: 300
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

        me.context = null;
        me.orgId = null;
        me.createStores();

        Ext.apply(me, {
            dockedItems: [me.createToolbar()],
            items: [
                me.createOnboardingPanel(),
                me.createMembershipPanel(),
                me.createAdminTabs()
            ],
            listeners: {
                afterrender: function(panel) {
                    panel.getEl().setStyle('position', 'absolute');
                    Ext.defer(function() {
                        if (!panel.destroyed && !panel.destroying) {
                            panel.applyResponsiveLayout();
                        }
                    }, 50);
                    panel.loadContext();
                },
                resize: function(panel) {
                    panel.applyResponsiveLayout();
                },
                destroy: function(panel) {
                    FileManagement.components.utils.PanelUtils.destroy(panel);
                }
            }
        });

        me.callParent(arguments);
    },

    createStores: function() {
        this.teamsStore = Ext.create('Ext.data.Store', {
            fields: ['id', 'name', 'description', 'status', 'memberCount', 'adminUserIds', 'settings', 'createdAt', 'updatedAt'],
            sorters: [{ property: 'name', direction: 'ASC' }]
        });

        this.membersStore = Ext.create('Ext.data.Store', {
            fields: ['id', 'userId', 'username', 'email', 'displayName', 'status', 'roles', 'teamNames', 'teams', 'settings', 'createdAt', 'updatedAt']
        });

        this.organizationMembershipStore = Ext.create('Ext.data.Store', {
            fields: ['id', 'organizationId', 'organization', 'organizationName', 'status', 'roles', 'joinedAt', 'updatedAt']
        });

        this.organizationSelectorStore = Ext.create('Ext.data.Store', {
            fields: ['organizationId', 'name', 'roles', 'canManage'],
            sorters: [{ property: 'name', direction: 'ASC' }]
        });

        this.organizationInvitationStore = Ext.create('Ext.data.Store', {
            fields: ['id', 'organizationId', 'organization', 'status', 'roles', 'invitedAt', 'updatedAt']
        });

        this.sharesStore = Ext.create('Ext.data.Store', {
            fields: ['id', 'kind', 'itemName', 'itemType', 'itemPath', 'targetType', 'targetLabel', 'ownerName', 'creatorName', 'permission', 'permissions', 'approvalStatus', 'shareStatus', 'isExternalTarget', 'risky', 'riskReason', 'expiresAt', 'createdAt', 'updatedAt', 'accessCount', 'maxDownloads', 'downloadCount', 'lastDownloadedAt', 'downloadLimitReached']
        });

        this.auditStore = Ext.create('Ext.data.Store', {
            fields: ['id', 'actorUserId', 'actor', 'action', 'entityType', 'entityId', 'targetUserId', 'metadata', 'createdAt']
        });
    },

    createToolbar: function() {
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
                        me.loadContext();
                    }
                },
                {
                    text: 'Create Organization',
                    itemId: 'createOrgToolbarButton',
                    iconCls: 'fa fa-building-circle-plus',
                    hidden: true,
                    handler: function() {
                        me.getLayout().setActiveItem(0);
                    }
                },
                {
                    xtype: 'combo',
                    itemId: 'organizationSelector',
                    width: 220,
                    hidden: true,
                    editable: false,
                    queryMode: 'local',
                    emptyText: 'Select organization',
                    store: me.organizationSelectorStore,
                    valueField: 'organizationId',
                    displayField: 'name',
                    listeners: {
                        select: function(combo, records) {
                            const record = Ext.isArray(records) ? records[0] : records;
                            const orgId = record ? record.get('organizationId') : combo.getValue();
                            if (orgId && orgId !== me.orgId) {
                                me.selectedOrgId = orgId;
                                me.loadContext();
                            }
                        }
                    }
                },
                '->',
                {
                    xtype: 'tbtext',
                    itemId: 'organizationStatusText',
                    cls: 'organization-admin-status-text',
                    text: 'Loading organization context...'
                }
            ]
        };
    },

    createOnboardingPanel: function() {
        const me = this;

        return {
            xtype: 'panel',
            itemId: 'organizationOnboardingPanel',
            border: false,
            bodyPadding: 18,
            layout: {
                type: 'vbox',
                align: 'stretch'
            },
            items: [
                {
                    xtype: 'component',
                    margin: '0 0 14 0',
                    html: [
                        '<div style="font-size:20px;font-weight:bold;color:#2b3d55;">Create your organization account</div>',
                        '<div style="color:#52677f;margin-top:6px;max-width:760px;">Manage teams, members, sharing policy, and admin activity from a dedicated organization console.</div>'
                    ].join('')
                },
                {
                    xtype: 'form',
                    itemId: 'createOrganizationForm',
                    maxWidth: 540,
                    bodyPadding: 12,
                    frame: true,
                    defaults: {
                        anchor: '100%',
                        labelWidth: 110,
                        labelAlign: 'top'
                    },
                    items: [
                        {
                            xtype: 'textfield',
                            name: 'name',
                            fieldLabel: 'Name',
                            allowBlank: false,
                            emptyText: 'Acme Operations'
                        },
                        {
                            xtype: 'textfield',
                            name: 'slug',
                            fieldLabel: 'Code',
                            emptyText: 'Optional short code'
                        },
                        {
                            xtype: 'textarea',
                            name: 'description',
                            fieldLabel: 'Description',
                            height: 70
                        }
                    ],
                    buttons: [
                        {
                            text: 'Create Organization',
                            iconCls: 'fa fa-building-circle-plus',
                            handler: function() {
                                me.createOrganization();
                            }
                        }
                    ]
                }
            ]
        };
    },

    createMembershipPanel: function() {
        const me = this;

        return {
            xtype: 'panel',
            itemId: 'organizationMembershipPanel',
            border: false,
            bodyPadding: 12,
            layout: {
                type: 'vbox',
                align: 'stretch'
            },
            items: [
                {
                    xtype: 'component',
                    itemId: 'membershipSummary',
                    height: 72,
                    margin: '0 0 10 0',
                    html: ''
                },
                {
                    xtype: 'grid',
                    title: 'Pending Invitations',
                    itemId: 'invitationsGrid',
                    iconCls: 'fa fa-envelope-open-text',
                    height: 210,
                    margin: '0 0 10 0',
                    store: me.organizationInvitationStore,
                    columns: [
                        { text: 'Organization', dataIndex: 'organization', flex: 1, renderer: me.renderOrganizationName },
                        { text: 'Role', dataIndex: 'roles', width: 170, renderer: value => Ext.String.htmlEncode((value || []).join(', ')) },
                        { text: 'Invited', dataIndex: 'invitedAt', width: 155, renderer: me.renderDate }
                    ],
                    viewConfig: {
                        emptyText: 'No pending organization invitations.',
                        deferEmptyText: false
                    },
                    tbar: {
                        enableOverflow: true,
                        items: [
                            { text: 'Accept', iconCls: 'fa fa-check green-icon', handler: () => me.respondToSelectedInvitation('accept') },
                            { text: 'Decline', iconCls: 'fa fa-xmark red-icon', handler: () => me.respondToSelectedInvitation('decline') }
                        ]
                    }
                },
                {
                    xtype: 'grid',
                    title: 'My Organizations',
                    itemId: 'membershipsGrid',
                    iconCls: 'fa fa-building-user',
                    flex: 1,
                    store: me.organizationMembershipStore,
                    columns: [
                        { text: 'Organization', dataIndex: 'organization', flex: 1, renderer: me.renderOrganizationName },
                        { text: 'Status', dataIndex: 'status', width: 120 },
                        { text: 'Roles', dataIndex: 'roles', width: 220, renderer: value => Ext.String.htmlEncode((value || []).join(', ')) },
                        { text: 'Joined', dataIndex: 'joinedAt', width: 155, renderer: me.renderDate }
                    ],
                    viewConfig: {
                        emptyText: 'No active organization memberships.',
                        deferEmptyText: false
                    }
                },
                {
                    xtype: 'button',
                    itemId: 'membershipCreateOrgButton',
                    text: 'Create Organization',
                    iconCls: 'fa fa-building-circle-plus',
                    height: 32,
                    margin: '10 0 0 0',
                    hidden: true,
                    handler: function() {
                        me.getLayout().setActiveItem(me.down('#organizationOnboardingPanel'));
                    }
                }
            ]
        };
    },

    createAdminTabs: function() {
        return {
            xtype: 'tabpanel',
            itemId: 'organizationAdminTabs',
            cls: 'organization-admin-tabs',
            border: false,
            activeTab: 0,
            enableTabScroll: true,
            items: [
                this.createOverviewTab(),
                this.createTeamsTab(),
                this.createMembersTab(),
                this.createSharingTab(),
                this.createSettingsTab(),
                this.createAuditTab()
            ]
        };
    },

    createOverviewTab: function() {
        return {
            xtype: 'panel',
            title: 'Overview',
            iconCls: 'fa fa-gauge-high',
            itemId: 'overviewTab',
            autoScroll: true,
            bodyPadding: 10,
            layout: {
                type: 'vbox',
                align: 'stretch'
            },
            items: [
                {
                    xtype: 'component',
                    itemId: 'overviewHero',
                    height: 86,
                    margin: '0 0 10 0',
                    tpl: [
                        '<div style="padding:12px;border:1px solid #b7cbe5;background:#f4f8fd;">',
                        '<div style="font-size:18px;font-weight:bold;color:#20364f;">{name}</div>',
                        '<div style="color:#52677f;margin-top:4px;">{description}</div>',
                        '<div style="color:#6b7f95;margin-top:8px;">Status: <b>{status}</b> | Code: <b>{slug}</b></div>',
                        '</div>'
                    ]
                },
                {
                    xtype: 'component',
                    itemId: 'organizationSuspendedNotice',
                    hidden: true,
                    margin: '0 0 10 0',
                    html: [
                        '<div style="padding:10px;border:1px solid #d7b46a;background:#fff8e6;color:#6f4a00;">',
                        '<b>Organization suspended.</b> Members, teams, files, folders, and shares are retained. Workspace access and sharing actions are paused until reactivated.',
                        '</div>'
                    ].join('')
                },
                {
                    xtype: 'component',
                    itemId: 'overviewMetricRow',
                    cls: 'overview-metric-row',
                    html: ''
                },
                {
                    xtype: 'panel',
                    title: 'Quick Actions',
                    itemId: 'overviewQuickActions',
                    margin: '10 0 0 0',
                    height: 86,
                    bodyPadding: 10,
                    layout: 'fit',
                    items: [
                        {
                            xtype: 'component',
                            itemId: 'quickActionsGrid',
                            cls: 'overview-quick-actions-grid',
                            html: this.renderQuickActionsHtml(),
                            listeners: {
                                afterrender: component => {
                                    component.getEl().on('click', (event, target) => {
                                        let button = target;
                                        const root = component.getEl().dom;

                                        while (button && button !== root && !(button.classList && button.classList.contains('overview-quick-action'))) {
                                            button = button.parentNode;
                                        }

                                        if (!button || button === root || button.disabled) {
                                            return;
                                        }

                                        this.handleQuickAction(button.getAttribute('data-action'));
                                    });
                                }
                            }
                        }
                    ]
                }
            ]
        };
    },

    createTeamsTab: function() {
        const me = this;

        return {
            xtype: 'grid',
            title: 'Teams',
            iconCls: 'fa fa-users-gear',
            itemId: 'teamsTab',
            store: me.teamsStore,
            columns: [
                { text: 'Team', dataIndex: 'name', flex: 1 },
                { text: 'Members', dataIndex: 'memberCount', width: 90, align: 'right' },
                { text: 'Status', dataIndex: 'status', width: 110 },
                { text: 'Description', dataIndex: 'description', flex: 2 },
                { text: 'Updated', dataIndex: 'updatedAt', width: 150, renderer: me.renderDate }
            ],
            viewConfig: {
                emptyText: 'No teams yet.',
                deferEmptyText: false
            },
            tbar: {
                enableOverflow: true,
                items: [
                    { text: 'Create Team', iconCls: 'fa fa-plus', handler: () => me.showTeamWindow() },
                    { text: 'Edit', iconCls: 'fa fa-pen', handler: () => me.editSelectedTeam() },
                    { text: 'Deactivate', iconCls: 'fa fa-ban', handler: () => me.deactivateSelectedTeam() },
                    '->',
                    { text: 'Refresh', iconCls: 'fa fa-refresh', handler: () => me.loadTeams() }
                ]
            },
            listeners: {
                itemdblclick: function() {
                    me.editSelectedTeam();
                }
            }
        };
    },

    createMembersTab: function() {
        const me = this;

        return {
            xtype: 'grid',
            title: 'Members',
            iconCls: 'fa fa-id-badge',
            itemId: 'membersTab',
            store: me.membersStore,
            columns: [
                { text: 'Member', dataIndex: 'displayName', flex: 1, renderer: function(value, meta, record) {
                    const email = Ext.String.htmlEncode(record.get('email') || '');
                    return `${Ext.String.htmlEncode(value || record.get('username') || email)}<br><span style="color:#667;">${email}</span>`;
                } },
                { text: 'Roles', dataIndex: 'roles', width: 180, renderer: value => Ext.String.htmlEncode((value || []).join(', ')) },
                { text: 'Status', dataIndex: 'status', width: 110 },
                { text: 'Teams', dataIndex: 'teamNames', flex: 1 },
                { text: 'Updated', dataIndex: 'updatedAt', width: 150, renderer: me.renderDate }
            ],
            viewConfig: {
                emptyText: 'No organization members yet.',
                deferEmptyText: false
            },
            tbar: {
                enableOverflow: true,
                items: [
                    { text: 'Add/Invite', iconCls: 'fa fa-user-plus', handler: () => me.showMemberWindow() },
                    { text: 'Edit', iconCls: 'fa fa-pen', handler: () => me.editSelectedMember() },
                    { text: 'Suspend', iconCls: 'fa fa-user-slash', handler: () => me.suspendSelectedMember(true) },
                    { text: 'Reactivate', iconCls: 'fa fa-user-check', handler: () => me.suspendSelectedMember(false) },
                    { text: 'Remove', iconCls: 'fa fa-trash red-icon', handler: () => me.removeSelectedMember() },
                    '->',
                    { text: 'Refresh', iconCls: 'fa fa-refresh', handler: () => me.loadMembers() }
                ]
            },
            listeners: {
                itemdblclick: function() {
                    me.editSelectedMember();
                }
            }
        };
    },

    createSharingTab: function() {
        const me = this;

        return {
            xtype: 'grid',
            title: 'Sharing',
            iconCls: 'fa fa-share-nodes',
            itemId: 'sharingTab',
            store: me.sharesStore,
            columns: [
                { text: 'Item', dataIndex: 'itemName', flex: 1, renderer: function(value, meta, record) {
                    const icon = record.get('itemType') === 'folder' ? 'fa-folder' : 'fa-file';
                    return `<i class="fa ${icon}"></i> ${Ext.String.htmlEncode(value || 'Missing item')}`;
                } },
                { text: 'Owner', dataIndex: 'ownerName', width: 130 },
                { text: 'Target', dataIndex: 'targetLabel', flex: 1, renderer: function(value, meta, record) {
                    const targetType = Ext.String.htmlEncode(record.get('targetType') || 'member');
                    return `${Ext.String.htmlEncode(value || 'Unknown target')}<br><span style="color:#667;">${targetType}</span>`;
                } },
                { text: 'Permission', dataIndex: 'permission', width: 110 },
                { text: 'Status', dataIndex: 'shareStatus', width: 130, renderer: function(value, meta, record) {
                    const status = value || record.get('approvalStatus') || 'Active';
                    const color = status === 'Expired' ? '#a35b00' : status === 'Active' ? '#2c6d2f' : '#2b4f8f';
                    return `<span style="color:${color};font-weight:bold;">${Ext.String.htmlEncode(status)}</span>`;
                } },
                { text: 'Downloads', dataIndex: 'downloadCount', width: 120, renderer: function(value, meta, record) {
                    const used = Number(value) || 0;
                    const max = Number(record.get('maxDownloads')) || 0;
                    const reached = record.get('downloadLimitReached') === true || (max > 0 && used >= max);
                    const color = reached ? '#9c2f2f' : '#2b4f8f';
                    return max > 0
                        ? `<span style="color:${color};font-weight:bold;">${used}/${max}</span>`
                        : `${used}`;
                } },
                { text: 'Risk', dataIndex: 'riskReason', flex: 1, renderer: function(value, meta, record) {
                    return record.get('risky') ? `<span style="color:#a35b00;">${Ext.String.htmlEncode(value || 'Review')}</span>` : 'Normal';
                } },
                { text: 'Expires', dataIndex: 'expiresAt', width: 145, renderer: me.renderDate },
                { text: 'Updated', dataIndex: 'updatedAt', width: 145, renderer: me.renderDate }
            ],
            viewConfig: {
                emptyText: 'No active shares found for this organization.',
                deferEmptyText: false
            },
            tbar: {
                enableOverflow: true,
                items: [
                    {
                        xtype: 'combo',
                        itemId: 'shareTargetFilter',
                        width: 150,
                        editable: false,
                        queryMode: 'local',
                        value: '',
                        store: [
                            ['', 'All targets'],
                            ['member', 'Members'],
                            ['team', 'Teams'],
                            ['organization', 'Organization'],
                            ['external', 'External']
                        ],
                        listeners: { change: () => me.loadShares() }
                    },
                    {
                        xtype: 'combo',
                        itemId: 'sharePermissionFilter',
                        width: 150,
                        editable: false,
                        queryMode: 'local',
                        value: '',
                        store: [
                            ['', 'All permissions'],
                            ['view', 'View'],
                            ['download', 'Download'],
                            ['upload', 'Upload'],
                            ['edit', 'Edit'],
                            ['reshare', 'Reshare'],
                            ['manage', 'Manage']
                        ],
                        listeners: { change: () => me.loadShares() }
                    },
                    {
                        xtype: 'checkbox',
                        itemId: 'externalOnlyFilter',
                        boxLabel: 'External only',
                        listeners: { change: () => me.loadShares() }
                    },
                    '->',
                    { text: 'Change Permission', iconCls: 'fa fa-key', handler: () => me.editSelectedShare() },
                    { text: 'Approve', iconCls: 'fa fa-check green-icon', handler: () => me.setSelectedShareApprovalStatus('approved') },
                    { text: 'Reject', iconCls: 'fa fa-xmark red-icon', handler: () => me.setSelectedShareApprovalStatus('rejected') },
                    { text: 'Revoke', iconCls: 'fa fa-ban', handler: () => me.revokeSelectedShare() },
                    { text: 'Refresh', iconCls: 'fa fa-refresh', handler: () => me.loadShares() }
                ]
            }
        };
    },

    createSettingsTab: function() {
        const me = this;

        return {
            xtype: 'form',
            title: 'Settings',
            iconCls: 'fa fa-sliders',
            itemId: 'settingsTab',
            bodyPadding: 12,
            autoScroll: true,
            defaults: {
                anchor: '100%',
                labelWidth: 190,
                labelAlign: 'top'
            },
            items: [
                {
                    xtype: 'fieldset',
                    title: 'Profile',
                    defaults: { anchor: '100%', labelWidth: 190, labelAlign: 'top' },
                    items: [
                        { xtype: 'textfield', name: 'name', fieldLabel: 'Organization name', allowBlank: false },
                        { xtype: 'textarea', name: 'description', fieldLabel: 'Description', height: 70 },
                        {
                            xtype: 'combo',
                            name: 'status',
                            fieldLabel: 'Status',
                            editable: false,
                            queryMode: 'local',
                            store: [['active', 'Active'], ['suspended', 'Suspended']]
                        }
                    ]
                },
                {
                    xtype: 'fieldset',
                    title: 'Sharing Governance',
                    defaults: { anchor: '100%', labelWidth: 260, labelAlign: 'top' },
                    items: [
                        { xtype: 'checkbox', name: 'memberSharingAllowed', boxLabel: 'Allow member shares', hideLabel: true },
                        { xtype: 'checkbox', name: 'teamSharingAllowed', boxLabel: 'Allow team shares', hideLabel: true },
                        { xtype: 'checkbox', name: 'organizationSharingAllowed', boxLabel: 'Allow whole-org shares', hideLabel: true },
                        { xtype: 'checkbox', name: 'teamToTeamSharingAllowed', boxLabel: 'Allow team-to-team shares', hideLabel: true },
                        { xtype: 'checkbox', name: 'externalSharingAllowed', boxLabel: 'Allow external sharing', hideLabel: true },
                        { xtype: 'checkbox', name: 'publicLinkSharingAllowed', boxLabel: 'Allow public links', hideLabel: true },
                        { xtype: 'checkbox', name: 'requireExternalExpiration', boxLabel: 'Require external expiration', hideLabel: true },
                        { xtype: 'checkbox', name: 'requireExternalApproval', boxLabel: 'Require external approval', hideLabel: true },
                        { xtype: 'checkbox', name: 'resharingAllowed', boxLabel: 'Allow resharing', hideLabel: true },
                        {
                            xtype: 'combo',
                            name: 'defaultPermission',
                            fieldLabel: 'Default permission',
                            editable: false,
                            queryMode: 'local',
                            store: [
                                ['view', 'View'],
                                ['download', 'Download'],
                                ['upload', 'Upload into folder'],
                                ['edit', 'Edit/update'],
                                ['reshare', 'Reshare'],
                                ['manage', 'Manage']
                            ]
                        },
                        {
                            xtype: 'checkboxgroup',
                            fieldLabel: 'Allowed permissions',
                            columns: 3,
                            vertical: true,
                            items: [
                                { boxLabel: 'View', name: 'allowedPermissions', inputValue: 'view' },
                                { boxLabel: 'Download', name: 'allowedPermissions', inputValue: 'download' },
                                { boxLabel: 'Upload', name: 'allowedPermissions', inputValue: 'upload' },
                                { boxLabel: 'Edit', name: 'allowedPermissions', inputValue: 'edit' },
                                { boxLabel: 'Reshare', name: 'allowedPermissions', inputValue: 'reshare' },
                                { boxLabel: 'Manage', name: 'allowedPermissions', inputValue: 'manage' }
                            ]
                        },
                        {
                            xtype: 'checkbox',
                            itemId: 'downloadLimitEnabledField',
                            name: 'downloadLimitEnabled',
                            boxLabel: 'Limit downloads per share/link',
                            hideLabel: true,
                            listeners: {
                                change: function() {
                                    me.syncDownloadLimitField();
                                }
                            }
                        },
                        {
                            xtype: 'numberfield',
                            itemId: 'maxDownloadsField',
                            name: 'maxDownloads',
                            fieldLabel: 'Max downloads',
                            minValue: 1,
                            maxValue: 1000000,
                            allowDecimals: false,
                            allowBlank: false,
                            disabled: true,
                            width: 220
                        }
                    ]
                }
            ],
            buttons: [
                {
                    text: 'Simulate Policy',
                    iconCls: 'fa fa-flask',
                    handler: function() {
                        me.simulateOrganizationPolicy();
                    }
                },
                {
                    text: 'Save Settings',
                    iconCls: 'fa fa-save',
                    handler: function() {
                        me.saveOrganizationSettings();
                    }
                }
            ]
        };
    },

    createAuditTab: function() {
        return {
            xtype: 'grid',
            title: 'Audit',
            iconCls: 'fa fa-clock-rotate-left',
            itemId: 'auditTab',
            store: this.auditStore,
            columns: [
                { text: 'When', dataIndex: 'createdAt', width: 155, renderer: this.renderDate },
                { text: 'Actor', dataIndex: 'actor', width: 150, renderer: function(value) {
                    return Ext.String.htmlEncode(value && value.username ? value.username : 'System');
                } },
                { text: 'Action', dataIndex: 'action', width: 190 },
                { text: 'Entity', dataIndex: 'entityType', width: 110 },
                { text: 'Details', dataIndex: 'metadata', flex: 1, renderer: function(value) {
                    return Ext.String.htmlEncode(JSON.stringify(value || {}));
                } }
            ],
            viewConfig: {
                emptyText: 'No organization admin activity yet.',
                deferEmptyText: false
            },
            tbar: {
                enableOverflow: true,
                items: [
                    '->',
                    { text: 'Refresh', iconCls: 'fa fa-refresh', handler: () => this.loadAudit() }
                ]
            }
        };
    },

    isCompactLayout: function() {
        const width = this.getWidth ? Number(this.getWidth()) : 0;
        const viewportWidth = Ext.Element.getViewportWidth ? Ext.Element.getViewportWidth() : width;
        return (width > 0 && width < this.mobileCompactBreakpoint) || viewportWidth < this.mobileCompactBreakpoint;
    },

    applyResponsiveLayout: function() {
        if (!this.rendered || this.destroyed || this.destroying) {
            return;
        }

        const compact = this.isCompactLayout();
        this.organizationAdminCompactApplied = compact;

        Ext.suspendLayouts();
        try {
            this[compact ? 'addCls' : 'removeCls']('organization-admin-compact');

            if (this.body && this.body.setStyle) {
                this.body.setStyle('padding', compact ? '4px' : '8px');
            }

            this.syncToolbarLayout(compact);
            this.syncOnboardingLayout(compact);
            this.syncMembershipLayout(compact);
            this.syncOverviewLayout(compact);
        } finally {
            Ext.resumeLayouts(true);
        }

        if (FileManagement.components.utils.ResponsiveGrid) {
            FileManagement.components.utils.ResponsiveGrid.prepareContainer(this);
            FileManagement.components.utils.ResponsiveGrid.applyContainer(this);
        }
    },

    syncToolbarLayout: function(compact) {
        const createButton = this.down('#createOrgToolbarButton');
        const selector = this.down('#organizationSelector');
        const statusText = this.down('#organizationStatusText');

        if (createButton && createButton.setText) {
            createButton.setText(compact ? 'Create' : 'Create Organization');
        }

        if (selector && selector.setWidth) {
            selector.setWidth(compact ? Math.max(138, Math.min(180, (this.getWidth ? this.getWidth() : 320) - 126)) : 220);
        }

        if (statusText) {
            statusText.setHidden(compact);
        }
    },

    syncOnboardingLayout: function(compact) {
        const onboardingPanel = this.down('#organizationOnboardingPanel');
        const form = this.down('#createOrganizationForm');

        if (onboardingPanel && onboardingPanel.body && onboardingPanel.body.setStyle) {
            onboardingPanel.body.setStyle('padding', compact ? '10px' : '18px');
        }

        if (form && form.setWidth) {
            form.setWidth(compact ? Math.max(260, (this.getWidth ? this.getWidth() : 320) - 28) : 540);
        }
    },

    syncMembershipLayout: function(compact) {
        const membershipPanel = this.down('#organizationMembershipPanel');
        const summary = this.down('#membershipSummary');
        const invitationsGrid = this.down('#invitationsGrid');

        if (membershipPanel && membershipPanel.body && membershipPanel.body.setStyle) {
            membershipPanel.body.setStyle('padding', compact ? '8px' : '12px');
        }

        if (summary) {
            summary.height = compact ? 118 : 72;
        }

        if (invitationsGrid) {
            invitationsGrid.height = compact ? 190 : 210;
        }
    },

    syncOverviewLayout: function(compact) {
        const hero = this.down('#overviewHero');
        const quickActions = this.down('#overviewQuickActions');

        if (hero) {
            hero.height = compact ? 118 : 86;
        }

        if (quickActions) {
            quickActions.height = compact ? 216 : 86;
            this.setHorizontalScroll(quickActions, false);
        }
    },

    setHorizontalScroll: function(component, enabled) {
        if (!component || !component.rendered || !component.getEl) {
            return;
        }

        const el = component.getEl();
        if (!el || !el.dom) {
            return;
        }

        el.setStyle('overflow-x', enabled ? 'auto' : 'hidden');
        el.setStyle('overflow-y', 'hidden');
    },

    apiUrl: function(path) {
        return FileManagementEnv.apiUrl(`/api/organizations${path}`);
    },

    request: function(options) {
        Ext.Ajax.request(Ext.apply({
            headers: {
                'Authorization': FileManagement.helpers.Functions.getAuthorizationHeader(),
                'Content-Type': 'application/json'
            },
            failure: (response) => {
                this.setLoading(false);
                const payload = Ext.decode(response.responseText, true) || {};
                Ext.Msg.alert('Organization', payload.message || 'Organization request failed.');
            }
        }, options));
    },

    loadContext: function() {
        const me = this;
        me.setLoading('Loading organization...');

        const params = me.selectedOrgId ? `?orgId=${encodeURIComponent(me.selectedOrgId)}` : '';

        me.request({
            url: me.apiUrl(`/context${params}`),
            method: 'GET',
            success: function(response) {
                me.setLoading(false);
                const payload = Ext.decode(response.responseText, true) || {};
                me.context = payload.context || null;
                me.applyContext();
            }
        });
    },

    applyContext: function() {
        const statusText = this.down('#organizationStatusText');
        const createButton = this.down('#createOrgToolbarButton');
        const context = this.context || {};
        const capabilities = context.capabilities || {};
        const canCreateOrganization = capabilities.canCreateOrganization === true;

        this.syncOrganizationSelector();

        if (createButton) {
            createButton.setHidden(!canCreateOrganization);
        }

        if (!context.hasOrganization && !context.hasPendingInvitations && canCreateOrganization) {
            this.orgId = null;
            if (statusText) statusText.setText('No organization account yet');
            this.getLayout().setActiveItem(this.down('#organizationOnboardingPanel'));
            return;
        }

        if (!context.hasOrganization || capabilities.canManageOrganization !== true) {
            this.orgId = context.organization ? context.organization.id : null;
            this.populateMembershipPanel();
            if (statusText) {
                const invitationCount = (context.invitations || []).length;
                const membershipCount = (context.memberships || []).length;
                statusText.setText(`${membershipCount} membership${membershipCount === 1 ? '' : 's'} | ${invitationCount} pending invitation${invitationCount === 1 ? '' : 's'}`);
            }
            this.getLayout().setActiveItem(this.down('#organizationMembershipPanel'));
            return;
        }

        this.orgId = context.organization.id;
        this.selectedOrgId = this.orgId;
        if (statusText) {
            const status = context.organization.status ? ` | ${Ext.String.htmlEncode(context.organization.status)}` : '';
            statusText.setText(`${Ext.String.htmlEncode(context.organization.name)} | ${Ext.String.htmlEncode((context.membership.roles || []).join(', '))}${status}`);
        }
        this.populateMembershipPanel();
        this.getLayout().setActiveItem(this.down('#organizationAdminTabs'));
        this.populateSettingsForm(context.organization);
        this.applyResponsiveLayout();
        this.reloadAdminData();
    },

    populateMembershipPanel: function() {
        const context = this.context || {};
        const memberships = (context.memberships || []).concat(context.suspendedMemberships || []);
        const invitations = context.invitations || [];
        const summary = this.down('#membershipSummary');
        const createButton = this.down('#membershipCreateOrgButton');
        const canCreateOrganization = context.capabilities && context.capabilities.canCreateOrganization === true;

        this.organizationMembershipStore.loadData(memberships.map(membership => ({
            ...membership,
            organizationName: membership.organization ? membership.organization.name : ''
        })));
        this.organizationInvitationStore.loadData(invitations);

        if (createButton) {
            createButton.setHidden(!canCreateOrganization);
        }

        if (summary) {
            summary.update([
                '<div style="padding:12px;border:1px solid #b7cbe5;background:#f7fbff;">',
                '<div style="font-size:18px;font-weight:bold;color:#20364f;">My Organizations</div>',
                `<div style="color:#52677f;margin-top:5px;">${memberships.length} active/suspended membership${memberships.length === 1 ? '' : 's'} and ${invitations.length} pending invitation${invitations.length === 1 ? '' : 's'}.</div>`,
                canCreateOrganization
                    ? '<div style="color:#667;margin-top:5px;">This account can create an organization.</div>'
                    : '<div style="color:#667;margin-top:5px;">Organization creation is disabled while this account has a membership or pending invitation.</div>',
                '</div>'
            ].join(''));
        }
    },

    reloadAdminData: function() {
        this.syncOrganizationSuspendedState();
        this.loadOverview();
        this.loadAudit();

        if (this.isOrganizationSuspended()) {
            this.teamsStore.removeAll();
            this.membersStore.removeAll();
            this.sharesStore.removeAll();
            return;
        }

        this.loadTeams();
        this.loadMembers();
        this.loadShares();
    },

    isOrganizationSuspended: function() {
        const organization = this.context && this.context.organization;
        return !!(organization && organization.status === 'suspended');
    },

    syncOrganizationSuspendedState: function() {
        const suspended = this.isOrganizationSuspended();
        const notice = this.down('#organizationSuspendedNotice');
        const adminTabs = this.down('#organizationAdminTabs');

        if (notice) {
            notice.setHidden(!suspended);
        }

        ['#teamsTab', '#membersTab', '#sharingTab'].forEach(selector => {
            const tab = this.down(selector);
            if (tab) {
                tab.setDisabled(suspended);
            }
        });

        this.renderQuickActions();

        if (suspended && adminTabs) {
            const activeTab = adminTabs.getActiveTab && adminTabs.getActiveTab();
            if (activeTab && activeTab.disabled) {
                adminTabs.setActiveTab(this.down('#settingsTab'));
            }
        }
    },

    syncOrganizationSelector: function() {
        const context = this.context || {};
        const selector = this.down('#organizationSelector');
        const memberships = context.memberships || [];

        this.organizationSelectorStore.loadData(memberships.map(membership => ({
            organizationId: membership.organizationId,
            name: membership.organization ? membership.organization.name : membership.organizationId,
            roles: membership.roles || [],
            canManage: ['owner', 'admin'].some(role => (membership.roles || []).includes(role))
        })));

        if (!selector) {
            return;
        }

        selector.setHidden(memberships.length <= 1);
        const selectedOrgId = context.organization ? context.organization.id : this.selectedOrgId;
        if (selectedOrgId) {
            selector.suspendEvents(false);
            selector.setValue(selectedOrgId);
            selector.resumeEvents();
        }
    },

    createOrganization: function() {
        const form = this.down('#createOrganizationForm');
        if (!form || !form.isValid()) {
            return;
        }

        this.setLoading('Creating organization...');
        this.request({
            url: this.apiUrl('/'),
            method: 'POST',
            jsonData: form.getValues(),
            success: (response) => {
                this.setLoading(false);
                const payload = Ext.decode(response.responseText, true) || {};
                this.context = payload.context || null;
                this.applyContext();
            }
        });
    },

    respondToSelectedInvitation: function(action) {
        const grid = this.down('#invitationsGrid');
        const record = grid && grid.getSelectionModel().getSelection()[0];

        if (!record) {
            Ext.Msg.alert('Organization Invitation', 'Select an invitation first.');
            return;
        }

        const organization = record.get('organization') || {};
        const verb = action === 'accept' ? 'Accept' : 'Decline';

        Ext.Msg.confirm(`${verb} Invitation`, `${verb} invitation to "${Ext.String.htmlEncode(organization.name || 'this organization')}"?`, (btn) => {
            if (btn !== 'yes') {
                return;
            }

            this.setLoading(`${verb}ing invitation...`);
            this.request({
                url: this.apiUrl(`/invitations/${record.get('id')}/${action}`),
                method: 'POST',
                success: (response) => {
                    this.setLoading(false);
                    const payload = Ext.decode(response.responseText, true) || {};
                    this.context = payload.context || null;
                    this.applyContext();
                }
            });
        });
    },

    loadOverview: function() {
        if (!this.orgId) return;

        this.request({
            url: this.apiUrl(`/${this.orgId}/overview`),
            method: 'GET',
            success: (response) => {
                const payload = Ext.decode(response.responseText, true) || {};
                this.renderOverview(payload.overview || {});
            }
        });
    },

    renderOverview: function(overview) {
        const organization = overview.organization || (this.context && this.context.organization) || {};
        const counts = overview.counts || {};
        const storage = overview.storage || {};
        const hero = this.down('#overviewHero');
        const metricRow = this.down('#overviewMetricRow');

        if (hero) {
            hero.update({
                name: organization.name || '',
                description: organization.description || 'Organization administration workspace',
                status: organization.status || '',
                slug: organization.slug || ''
            });
        }

        if (metricRow) {
            metricRow.update([
                '<div class="overview-metric-row-inner">',
                this.renderMetricCard('Teams', counts.teams || 0, 'Active teams in this organization', 'fa fa-users-gear'),
                this.renderMetricCard('Members', counts.members || 0, `${counts.activeMembers || 0} active, ${counts.suspendedMembers || 0} suspended`, 'fa fa-id-badge'),
                this.renderMetricCard('Shares', counts.sharedItems || 0, `${counts.externalShares || 0} external/public`, 'fa fa-share-nodes'),
                this.renderMetricCard('Storage Used', this.formatBytes(storage.usedBytes || 0), `${storage.fileCount || 0} files counted`, 'fa fa-database'),
                '</div>'
            ].join(''));
        }
    },

    renderMetricCard: function(label, value, hint, iconCls) {
        return [
            '<div class="overview-metric-card">',
            '<div class="overview-metric-card-inner">',
            `<div class="overview-metric-label"><i class="${Ext.String.htmlEncode(iconCls)}"></i> ${Ext.String.htmlEncode(label)}</div>`,
            `<div class="overview-metric-value">${Ext.String.htmlEncode(String(value))}</div>`,
            `<div class="overview-metric-hint">${Ext.String.htmlEncode(hint)}</div>`,
            '</div>',
            '</div>'
        ].join('');
    },

    renderQuickActions: function() {
        const grid = this.down('#quickActionsGrid');
        if (grid) {
            grid.update(this.renderQuickActionsHtml());
        }
    },

    renderQuickActionsHtml: function() {
        const suspended = this.isOrganizationSuspended();
        const actions = [
            { action: 'add-member', text: 'Add Member', iconCls: 'fa fa-user-plus', disabled: suspended },
            { action: 'create-team', text: 'Create Team', iconCls: 'fa fa-users-gear', disabled: suspended },
            { action: 'review-shares', text: 'Review Shares', iconCls: 'fa fa-share-nodes', disabled: suspended },
            { action: 'settings', text: 'Open Settings', iconCls: 'fa fa-sliders', disabled: false }
        ];

        return [
            '<div class="overview-quick-actions-grid-inner">',
            actions.map(action => this.renderQuickActionButton(action)).join(''),
            '</div>'
        ].join('');
    },

    renderQuickActionButton: function(action) {
        const disabled = action.disabled ? ' overview-quick-action-disabled' : '';
        const disabledAttrs = action.disabled ? ' disabled="disabled" aria-disabled="true"' : '';

        return [
            `<button type="button" class="overview-quick-action${disabled}" data-action="${Ext.String.htmlEncode(action.action)}"${disabledAttrs}>`,
            `<i class="${Ext.String.htmlEncode(action.iconCls)}"></i>`,
            `<span>${Ext.String.htmlEncode(action.text)}</span>`,
            '</button>'
        ].join('');
    },

    handleQuickAction: function(action) {
        const adminTabs = this.down('#organizationAdminTabs');

        if (this.isOrganizationSuspended() && action !== 'settings') {
            return;
        }

        if (action === 'add-member') {
            this.showMemberWindow();
        } else if (action === 'create-team') {
            this.showTeamWindow();
        } else if (action === 'review-shares' && adminTabs) {
            adminTabs.setActiveTab(this.down('#sharingTab'));
        } else if (action === 'settings' && adminTabs) {
            adminTabs.setActiveTab(this.down('#settingsTab'));
        }
    },

    loadTeams: function() {
        if (!this.orgId) return;
        if (this.isOrganizationSuspended()) {
            this.teamsStore.removeAll();
            return;
        }

        this.request({
            url: this.apiUrl(`/${this.orgId}/teams`),
            method: 'GET',
            success: (response) => {
                const payload = Ext.decode(response.responseText, true) || {};
                this.teamsStore.loadData(payload.teams || []);
            }
        });
    },

    loadMembers: function() {
        if (!this.orgId) return;
        if (this.isOrganizationSuspended()) {
            this.membersStore.removeAll();
            return;
        }

        this.request({
            url: this.apiUrl(`/${this.orgId}/members`),
            method: 'GET',
            success: (response) => {
                const payload = Ext.decode(response.responseText, true) || {};
                this.membersStore.loadData(payload.members || []);
            }
        });
    },

    loadShares: function() {
        if (!this.orgId) return;
        if (this.isOrganizationSuspended()) {
            this.sharesStore.removeAll();
            return;
        }

        const targetFilter = this.down('#shareTargetFilter');
        const permissionFilter = this.down('#sharePermissionFilter');
        const externalOnly = this.down('#externalOnlyFilter');
        const params = {};

        if (targetFilter && targetFilter.getValue()) params.targetType = targetFilter.getValue();
        if (permissionFilter && permissionFilter.getValue()) params.permission = permissionFilter.getValue();
        if (externalOnly && externalOnly.getValue()) params.externalOnly = true;

        this.request({
            url: this.apiUrl(`/${this.orgId}/shares`),
            method: 'GET',
            params,
            success: (response) => {
                const payload = Ext.decode(response.responseText, true) || {};
                this.sharesStore.loadData((payload.shares || []).concat(payload.publicLinks || []));
            }
        });
    },

    loadAudit: function() {
        if (!this.orgId) return;
        this.request({
            url: this.apiUrl(`/${this.orgId}/audit`),
            method: 'GET',
            success: (response) => {
                const payload = Ext.decode(response.responseText, true) || {};
                this.auditStore.loadData(payload.audit || []);
            }
        });
    },

    showTeamWindow: function(record) {
        const me = this;
        const isEdit = !!record;
        const form = Ext.create('Ext.form.Panel', {
            bodyPadding: 12,
            defaults: { anchor: '100%', labelWidth: 125 },
            items: [
                { xtype: 'textfield', name: 'name', fieldLabel: 'Team name', allowBlank: false },
                { xtype: 'textarea', name: 'description', fieldLabel: 'Description', height: 70 },
                {
                    xtype: 'combo',
                    name: 'status',
                    fieldLabel: 'Status',
                    editable: false,
                    queryMode: 'local',
                    value: 'active',
                    store: [['active', 'Active'], ['inactive', 'Inactive']]
                },
                {
                    xtype: 'fieldset',
                    title: 'Team sharing restrictions',
                    defaults: { anchor: '100%', labelWidth: 220 },
                    items: [
                        { xtype: 'checkbox', name: 'teamSharingAllowed', boxLabel: 'Allow team shares', hideLabel: true, checked: true },
                        { xtype: 'checkbox', name: 'organizationSharingAllowed', boxLabel: 'Allow org-wide shares', hideLabel: true, checked: true },
                        { xtype: 'checkbox', name: 'externalSharingAllowed', boxLabel: 'Allow external sharing', hideLabel: true, checked: true },
                        { xtype: 'checkbox', name: 'resharingAllowed', boxLabel: 'Allow resharing', hideLabel: true, checked: true }
                    ]
                }
            ]
        });

        if (record) {
            const settings = record.get('settings') || {};
            const sharing = settings.sharing || {};
            form.getForm().setValues({
                name: record.get('name'),
                description: record.get('description'),
                status: record.get('status'),
                teamSharingAllowed: sharing.teamSharingAllowed !== false,
                organizationSharingAllowed: sharing.organizationSharingAllowed !== false,
                externalSharingAllowed: sharing.externalSharingAllowed !== false,
                resharingAllowed: sharing.resharingAllowed !== false
            });
        }

        Ext.create('Ext.window.Window', {
            title: isEdit ? 'Edit Team' : 'Create Team',
            modal: true,
            width: 520,
            layout: 'fit',
            items: [form],
            buttons: [
                {
                    text: isEdit ? 'Save' : 'Create',
                    iconCls: 'fa fa-save',
                    handler: function(button) {
                        if (!form.isValid()) return;
                        const values = form.getValues();
                        const data = {
                            name: values.name,
                            description: values.description,
                            status: values.status,
                            settings: {
                                sharing: {
                                    teamSharingAllowed: values.teamSharingAllowed === 'on',
                                    organizationSharingAllowed: values.organizationSharingAllowed === 'on',
                                    externalSharingAllowed: values.externalSharingAllowed === 'on',
                                    resharingAllowed: values.resharingAllowed === 'on'
                                }
                            }
                        };

                        me.request({
                            url: me.apiUrl(`/${me.orgId}/teams${isEdit ? `/${record.get('id')}` : ''}`),
                            method: isEdit ? 'PUT' : 'POST',
                            jsonData: data,
                            success: function() {
                                button.up('window').close();
                                me.loadTeams();
                                me.loadAudit();
                            }
                        });
                    }
                },
                { text: 'Cancel', handler: button => button.up('window').close() }
            ]
        }).show();
    },

    editSelectedTeam: function() {
        const grid = this.down('#teamsTab');
        const record = grid && grid.getSelectionModel().getSelection()[0];
        if (!record) {
            Ext.Msg.alert('Teams', 'Select a team first.');
            return;
        }
        this.showTeamWindow(record);
    },

    deactivateSelectedTeam: function() {
        const grid = this.down('#teamsTab');
        const record = grid && grid.getSelectionModel().getSelection()[0];
        if (!record) {
            Ext.Msg.alert('Teams', 'Select a team first.');
            return;
        }

        Ext.Msg.confirm('Deactivate Team', `Deactivate "${Ext.String.htmlEncode(record.get('name'))}"?`, (btn) => {
            if (btn !== 'yes') return;
            this.request({
                url: this.apiUrl(`/${this.orgId}/teams/${record.get('id')}`),
                method: 'DELETE',
                success: () => {
                    this.loadTeams();
                    this.loadMembers();
                    this.loadAudit();
                }
            });
        });
    },

    showMemberWindow: function(record) {
        const me = this;
        const isEdit = !!record;
        const selectedTeamIds = record
            ? (record.get('teams') || []).map(team => team.id)
            : [];
        const form = Ext.create('Ext.form.Panel', {
            bodyPadding: 12,
            defaults: { anchor: '100%', labelWidth: 130 },
            items: [
                {
                    xtype: 'textfield',
                    name: 'identifier',
                    fieldLabel: 'Username/email',
                    allowBlank: isEdit,
                    hidden: isEdit,
                    emptyText: 'existing user or invite email'
                },
                { xtype: 'textfield', name: 'displayName', fieldLabel: 'Display name' },
                {
                    xtype: 'checkboxgroup',
                    fieldLabel: 'Roles',
                    columns: 2,
                    vertical: true,
                    items: [
                        { boxLabel: 'Organization Admin', name: 'roleAdmin', inputValue: 'admin' },
                        { boxLabel: 'Team Admin', name: 'roleTeamAdmin', inputValue: 'teamAdmin' },
                        { boxLabel: 'Member', name: 'roleMember', inputValue: 'member', checked: true }
                    ]
                },
                {
                    xtype: 'combo',
                    name: 'status',
                    fieldLabel: 'Status',
                    editable: false,
                    queryMode: 'local',
                    value: isEdit ? 'active' : 'invited',
                    disabled: !isEdit,
                    store: [['invited', 'Invited'], ['active', 'Active'], ['suspended', 'Suspended']]
                },
                {
                    xtype: 'combo',
                    name: 'teamIds',
                    itemId: 'memberTeamsField',
                    fieldLabel: 'Teams',
                    multiSelect: true,
                    queryMode: 'local',
                    displayField: 'name',
                    valueField: 'id',
                    store: me.teamsStore,
                    emptyText: 'Assign teams'
                },
                {
                    xtype: 'fieldset',
                    title: 'Member sharing restrictions',
                    defaults: { anchor: '100%', labelWidth: 230 },
                    items: [
                        { xtype: 'checkbox', name: 'externalSharingAllowed', boxLabel: 'Allow external sharing', hideLabel: true, checked: true },
                        { xtype: 'checkbox', name: 'resharingAllowed', boxLabel: 'Allow resharing', hideLabel: true, checked: true }
                    ]
                }
            ]
        });

        if (record) {
            const roles = record.get('roles') || [];
            const sharing = ((record.get('settings') || {}).sharing || {});
            form.getForm().setValues({
                displayName: record.get('displayName'),
                status: record.get('status'),
                roleAdmin: roles.includes('admin') ? 'admin' : null,
                roleTeamAdmin: roles.includes('teamAdmin') ? 'teamAdmin' : null,
                roleMember: roles.includes('member') ? 'member' : null,
                externalSharingAllowed: sharing.externalSharingAllowed !== false,
                resharingAllowed: sharing.resharingAllowed !== false
            });
            form.down('#memberTeamsField').setValue(selectedTeamIds);
        }

        Ext.create('Ext.window.Window', {
            title: isEdit ? 'Edit Member' : 'Add or Invite Member',
            modal: true,
            width: 560,
            layout: 'fit',
            items: [form],
            buttons: [
                {
                    text: isEdit ? 'Save' : 'Add/Invite',
                    iconCls: 'fa fa-save',
                    handler: function(button) {
                        if (!form.isValid()) return;
                        const values = form.getValues();
                        const roles = [];
                        if (values.roleAdmin) roles.push('admin');
                        if (values.roleTeamAdmin) roles.push('teamAdmin');
                        if (values.roleMember || roles.length === 0) roles.push('member');

                        const data = {
                            identifier: values.identifier,
                            displayName: values.displayName,
                            status: values.status,
                            roles,
                            teamIds: me.getSelectedTeamIds(form),
                            settings: {
                                sharing: {
                                    externalSharingAllowed: values.externalSharingAllowed === 'on',
                                    resharingAllowed: values.resharingAllowed === 'on'
                                }
                            }
                        };
                        const url = isEdit
                            ? me.apiUrl(`/${me.orgId}/members/${record.get('id')}`)
                            : me.apiUrl(`/${me.orgId}/members`);

                        me.request({
                            url,
                            method: isEdit ? 'PUT' : 'POST',
                            jsonData: data,
                            success: function() {
                                button.up('window').close();
                                me.loadMembers();
                                me.loadTeams();
                                me.loadAudit();
                            }
                        });
                    }
                },
                { text: 'Cancel', handler: button => button.up('window').close() }
            ]
        }).show();
    },

    getSelectedTeamIds: function(form) {
        const teamsField = form ? form.down('#memberTeamsField') : null;
        const value = teamsField && teamsField.getValue ? teamsField.getValue() : null;

        if (Ext.isArray(value)) {
            return value.filter(Boolean);
        }

        if (value) {
            return [value];
        }

        return [];
    },

    editSelectedMember: function() {
        const grid = this.down('#membersTab');
        const record = grid && grid.getSelectionModel().getSelection()[0];
        if (!record) {
            Ext.Msg.alert('Members', 'Select a member first.');
            return;
        }
        this.showMemberWindow(record);
    },

    suspendSelectedMember: function(suspended) {
        const grid = this.down('#membersTab');
        const record = grid && grid.getSelectionModel().getSelection()[0];
        if (!record) {
            Ext.Msg.alert('Members', 'Select a member first.');
            return;
        }

        const action = suspended ? 'suspend' : 'reactivate';
        this.request({
            url: this.apiUrl(`/${this.orgId}/members/${record.get('id')}/${action}`),
            method: 'POST',
            success: () => {
                this.loadMembers();
                this.loadAudit();
            }
        });
    },

    removeSelectedMember: function() {
        const grid = this.down('#membersTab');
        const record = grid && grid.getSelectionModel().getSelection()[0];
        if (!record) {
            Ext.Msg.alert('Members', 'Select a member first.');
            return;
        }

        Ext.Msg.confirm('Remove Member', `Remove "${Ext.String.htmlEncode(record.get('displayName') || record.get('email'))}" from this organization?`, (btn) => {
            if (btn !== 'yes') return;
            this.request({
                url: this.apiUrl(`/${this.orgId}/members/${record.get('id')}`),
                method: 'DELETE',
                success: () => {
                    this.loadMembers();
                    this.loadAudit();
                }
            });
        });
    },

    editSelectedShare: function() {
        const grid = this.down('#sharingTab');
        const record = grid && grid.getSelectionModel().getSelection()[0];
        if (!record) {
            Ext.Msg.alert('Sharing', 'Select a share first.');
            return;
        }

        if (record.get('kind') === 'publicLink') {
            Ext.Msg.alert('Sharing', 'Public link permissions are managed from the link owner flow. Disable public link policy to block access.');
            return;
        }

        Ext.Msg.prompt('Permission', 'Enter permission: view, download, upload, edit, reshare, or manage', (btn, text) => {
            if (btn !== 'ok') return;
            this.request({
                url: this.apiUrl(`/${this.orgId}/shares/${record.get('id')}`),
                method: 'PUT',
                jsonData: { permission: text },
                success: () => {
                    this.loadShares();
                    this.loadAudit();
                }
            });
        }, this, false, record.get('permission') || 'download');
    },

    setSelectedShareApprovalStatus: function(approvalStatus) {
        const grid = this.down('#sharingTab');
        const record = grid && grid.getSelectionModel().getSelection()[0];
        const label = approvalStatus === 'approved' ? 'Approve' : 'Reject';

        if (!record) {
            Ext.Msg.alert('Sharing', 'Select a share first.');
            return;
        }

        if (record.get('kind') === 'publicLink') {
            Ext.Msg.alert('Sharing', 'Public links do not use the external approval workflow.');
            return;
        }

        if (record.get('isExternalTarget') !== true) {
            Ext.Msg.alert('Sharing', 'Only external shares can be approved or rejected.');
            return;
        }

        Ext.Msg.confirm(`${label} Share`, `${label} external access for "${Ext.String.htmlEncode(record.get('targetLabel') || 'target')}"?`, (btn) => {
            if (btn !== 'yes') return;
            this.request({
                url: this.apiUrl(`/${this.orgId}/shares/${record.get('id')}`),
                method: 'PUT',
                jsonData: { approvalStatus },
                success: () => {
                    this.loadShares();
                    this.loadAudit();
                }
            });
        });
    },

    revokeSelectedShare: function() {
        const grid = this.down('#sharingTab');
        const record = grid && grid.getSelectionModel().getSelection()[0];
        if (!record) {
            Ext.Msg.alert('Sharing', 'Select a share first.');
            return;
        }

        if (record.get('kind') === 'publicLink') {
            Ext.Msg.alert('Sharing', 'Public links are surfaced here for governance visibility. Revoke them from the owner item or Shared By Me.');
            return;
        }

        Ext.Msg.confirm('Revoke Share', `Revoke access for "${Ext.String.htmlEncode(record.get('targetLabel') || 'target')}"?`, (btn) => {
            if (btn !== 'yes') return;
            this.request({
                url: this.apiUrl(`/${this.orgId}/shares/${record.get('id')}`),
                method: 'DELETE',
                success: () => {
                    this.loadShares();
                    this.loadAudit();
                }
            });
        });
    },

    normalizeAllowedPermissions: function(value) {
        const allowed = ['view', 'download', 'upload', 'edit', 'reshare', 'manage'];
        const values = Ext.isArray(value) ? value : (value ? [value] : []);
        const normalized = Ext.Array.unique(values)
            .map(permission => String(permission || '').trim())
            .filter(permission => allowed.includes(permission));

        return normalized.length ? normalized : ['view'];
    },

    isCheckedValue: function(value) {
        return value === true || value === 'on' || value === 'true' || value === 1 || value === '1';
    },

    normalizeMaxDownloads: function(value) {
        const parsed = parseInt(value, 10);
        return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 1000000) : null;
    },

    syncDownloadLimitField: function() {
        const enabledField = this.down('#downloadLimitEnabledField');
        const maxField = this.down('#maxDownloadsField');
        const enabled = enabledField ? enabledField.getValue() === true : false;

        if (!maxField) {
            return;
        }

        maxField.setDisabled(!enabled);
        maxField.allowBlank = !enabled;

        if (enabled && !maxField.getValue()) {
            maxField.setValue(10);
        }
    },

    collectOrganizationSettingsPayload: function() {
        const form = this.down('#settingsTab');
        if (!form || !form.isValid()) {
            return null;
        }

        const values = form.getValues();
        const settings = ((this.context && this.context.organization && this.context.organization.settings) || {});
        const allowedPermissions = this.normalizeAllowedPermissions(values.allowedPermissions);
        const defaultPermission = allowedPermissions.includes(values.defaultPermission)
            ? values.defaultPermission
            : (allowedPermissions.includes('download') ? 'download' : allowedPermissions[0]);
        const downloadLimitEnabled = this.isCheckedValue(values.downloadLimitEnabled);
        const maxDownloads = downloadLimitEnabled ? this.normalizeMaxDownloads(values.maxDownloads) : null;

        if (downloadLimitEnabled && maxDownloads === null) {
            Ext.Msg.alert('Organization', 'Enter a valid max downloads value.');
            return null;
        }

        return {
            name: values.name,
            description: values.description,
            status: values.status,
            settings: Ext.apply(Ext.apply({}, settings), {
                sharing: {
                    memberSharingAllowed: this.isCheckedValue(values.memberSharingAllowed),
                    teamSharingAllowed: this.isCheckedValue(values.teamSharingAllowed),
                    organizationSharingAllowed: this.isCheckedValue(values.organizationSharingAllowed),
                    teamToTeamSharingAllowed: this.isCheckedValue(values.teamToTeamSharingAllowed),
                    externalSharingAllowed: this.isCheckedValue(values.externalSharingAllowed),
                    publicLinkSharingAllowed: this.isCheckedValue(values.publicLinkSharingAllowed),
                    requireExternalExpiration: this.isCheckedValue(values.requireExternalExpiration),
                    requireExternalApproval: this.isCheckedValue(values.requireExternalApproval),
                    resharingAllowed: this.isCheckedValue(values.resharingAllowed),
                    defaultPermission,
                    allowedPermissions,
                    downloadLimitEnabled,
                    maxDownloads
                }
            })
        };
    },

    populateSettingsForm: function(organization) {
        const form = this.down('#settingsTab');
        if (!form || !organization) return;

        const sharing = ((organization.settings || {}).sharing || {});
        form.getForm().setValues({
            name: organization.name,
            description: organization.description,
            status: organization.status,
            memberSharingAllowed: sharing.memberSharingAllowed !== false,
            teamSharingAllowed: sharing.teamSharingAllowed !== false,
            organizationSharingAllowed: sharing.organizationSharingAllowed !== false,
            teamToTeamSharingAllowed: sharing.teamToTeamSharingAllowed !== false,
            externalSharingAllowed: sharing.externalSharingAllowed !== false,
            publicLinkSharingAllowed: sharing.publicLinkSharingAllowed !== false,
            requireExternalExpiration: sharing.requireExternalExpiration === true,
            requireExternalApproval: sharing.requireExternalApproval === true,
            resharingAllowed: sharing.resharingAllowed !== false,
            defaultPermission: sharing.defaultPermission || 'download',
            allowedPermissions: this.normalizeAllowedPermissions(sharing.allowedPermissions || ['view', 'download']),
            downloadLimitEnabled: sharing.downloadLimitEnabled === true,
            maxDownloads: sharing.maxDownloads || 10
        });
        this.syncDownloadLimitField();
    },

    getPolicyReasonLabel: function(reason) {
        const labels = {
            member_sharing_blocked: 'Member sharing blocked',
            team_sharing_blocked: 'Team sharing blocked',
            organization_sharing_blocked: 'Whole-org sharing blocked',
            external_sharing_blocked: 'External sharing blocked',
            public_link_sharing_blocked: 'Public links blocked',
            external_expiration_required: 'External expiration required',
            external_approval_required: 'External approval required',
            permission_blocked: 'Permission blocked',
            download_limit_reached: 'Download limit reached',
            owner_inactive: 'Owner inactive'
        };

        return labels[reason] || reason;
    },

    renderPolicySimulation: function(simulation) {
        const totals = simulation.totals || {};
        const reasonCounts = simulation.reasonCounts || {};
        const reasons = Object.keys(reasonCounts).sort((a, b) => reasonCounts[b] - reasonCounts[a]);
        const policy = simulation.proposedPolicy || {};
        const maxDownloads = policy.downloadLimitEnabled ? policy.maxDownloads : null;
        const rows = [
            `<div><b>Direct shares affected:</b> ${Number(totals.affectedDirectShares) || 0} / ${Number(totals.directShares) || 0}</div>`,
            `<div><b>Public links affected:</b> ${Number(totals.affectedPublicLinks) || 0} / ${Number(totals.publicLinks) || 0}</div>`,
            `<div><b>Download-limited shares:</b> ${Number(totals.downloadLimitedDirectShares) || 0}</div>`,
            `<div><b>Download-limited public links:</b> ${Number(totals.downloadLimitedPublicLinks) || 0}</div>`,
            `<div><b>Max downloads:</b> ${maxDownloads ? Ext.String.htmlEncode(String(maxDownloads)) : 'Off'}</div>`
        ];

        const reasonHtml = reasons.length
            ? reasons.map(reason => `<li>${Ext.String.htmlEncode(this.getPolicyReasonLabel(reason))}: ${reasonCounts[reason]}</li>`).join('')
            : '<li>No blocking changes detected.</li>';
        const sampleRows = (simulation.affectedShares || []).concat(simulation.affectedPublicLinks || []).slice(0, 8)
            .map(item => {
                const label = item.targetLabel || item.itemId || item.id;
                const itemType = item.kind === 'publicLink' ? 'Public link' : 'Share';
                const reasonText = (item.reasons || []).map(reason => this.getPolicyReasonLabel(reason)).join(', ');
                return `<li><b>${Ext.String.htmlEncode(itemType)}</b> ${Ext.String.htmlEncode(label)}: ${Ext.String.htmlEncode(reasonText)}</li>`;
            }).join('');

        return [
            '<div class="policy-simulator-result">',
            rows.join(''),
            '<div style="margin-top:10px;"><b>Reasons</b></div>',
            `<ul style="margin:4px 0 0 18px;padding:0;">${reasonHtml}</ul>`,
            sampleRows ? '<div style="margin-top:10px;"><b>Examples</b></div>' : '',
            sampleRows ? `<ul style="margin:4px 0 0 18px;padding:0;">${sampleRows}</ul>` : '',
            simulation.truncated ? '<div style="margin-top:8px;color:#667;">Only the first affected items are shown.</div>' : '',
            '</div>'
        ].join('');
    },

    simulateOrganizationPolicy: function() {
        const jsonData = this.collectOrganizationSettingsPayload();
        if (!jsonData) return;

        this.setLoading('Simulating policy...');
        this.request({
            url: this.apiUrl(`/${this.orgId}/policy-simulator`),
            method: 'POST',
            jsonData: {
                settings: jsonData.settings
            },
            success: (response) => {
                this.setLoading(false);
                const payload = Ext.decode(response.responseText, true) || {};
                Ext.Msg.show({
                    title: 'Policy Simulator',
                    msg: this.renderPolicySimulation(payload.simulation || {}),
                    buttons: Ext.Msg.OK,
                    width: 520,
                    minWidth: 420
                });
            }
        });
    },

    saveOrganizationSettings: function() {
        const form = this.down('#settingsTab');
        if (!form || !form.isValid()) return;
        const jsonData = this.collectOrganizationSettingsPayload();
        if (!jsonData) return;

        const previousStatus = this.context && this.context.organization ? this.context.organization.status : null;
        const nextStatus = jsonData.status || previousStatus || 'active';
        jsonData.status = nextStatus;

        if (previousStatus !== 'suspended' && nextStatus === 'suspended') {
            Ext.Msg.show({
                title: 'Suspend Organization',
                msg: [
                    '<div style="width:360px;line-height:18px;padding:2px 0 8px 0;">',
                    '<div style="font-weight:bold;margin-bottom:6px;">Suspend this organization?</div>',
                    '<div>Workspace access and sharing actions will be paused until reactivated.</div>',
                    '<div style="margin-top:6px;">Members, teams, files, folders, and shares will be retained.</div>',
                    '</div>'
                ].join(''),
                buttons: Ext.Msg.YESNO,
                icon: Ext.Msg.QUESTION,
                width: 430,
                minWidth: 430,
                fn: (btn) => {
                    if (btn !== 'yes') {
                        this.populateSettingsForm(this.context && this.context.organization);
                        return;
                    }

                    this.submitOrganizationSettings(jsonData, previousStatus);
                }
            });
            return;
        }

        this.submitOrganizationSettings(jsonData, previousStatus);
    },

    submitOrganizationSettings: function(jsonData, previousStatus) {
        this.setLoading('Saving organization...');
        this.request({
            url: this.apiUrl(`/${this.orgId}`),
            method: 'PUT',
            jsonData,
            success: (response) => {
                this.setLoading(false);
                const payload = Ext.decode(response.responseText, true) || {};
                const organization = payload.organization || null;

                if (this.context && organization) {
                    this.context.organization = organization;
                }

                if (organization) {
                    this.populateSettingsForm(organization);
                }

                this.syncOrganizationSuspendedState();

                if (organization && organization.status === 'suspended') {
                    this.reloadAdminData();
                    Ext.Msg.alert('Organization', 'Organization suspended. Nested members, teams, files, folders, and shares were kept in place.');
                    return;
                }

                if (previousStatus === 'suspended') {
                    Ext.Msg.alert('Organization', 'Organization reactivated.');
                    this.loadContext();
                    return;
                }

                this.reloadAdminData();
                Ext.Msg.alert('Organization', 'Settings saved.');
            }
        });
    },

    renderDate: function(value) {
        if (!value) return '';
        const date = Ext.isDate(value) ? value : new Date(value);
        return Number.isFinite(date.getTime()) ? Ext.Date.format(date, 'M j, Y g:i A') : '';
    },

    renderOrganizationName: function(value) {
        const organization = value || {};
        const name = organization.name || 'Unknown organization';
        const slug = organization.slug ? ` <span style="color:#667;">${Ext.String.htmlEncode(organization.slug)}</span>` : '';
        return `${Ext.String.htmlEncode(name)}${slug}`;
    },

    formatBytes: function(bytes) {
        let size = Number(bytes) || 0;
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let unitIndex = 0;

        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex += 1;
        }

        return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
    }
});
