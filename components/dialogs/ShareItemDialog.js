Ext.define('FileManagement.components.dialogs.ShareItemDialog', {
    extend: 'Ext.window.Window',
    xtype: 'shareitemdialog',

    requires: [
        'FileManagement.components.settings.UserSettings',
        'FileManagement.components.utils.NotificationUtil'
    ],

    title: 'Share Item',
    modal: true,
    width: 560,
    layout: 'fit',
    resizable: false,

    config: {
        record: null,
        workspaceId: '',
        onSuccess: Ext.emptyFn
    },

    initComponent: function() {
        const me = this;
        const record = me.getRecord();
        const settings = FileManagement.components.settings.UserSettings.getSettings();
        const sharingSettings = settings.sharing || {};

        Ext.apply(me, {
            items: [
                {
                    xtype: 'form',
                    bodyPadding: 12,
                    defaults: {
                        anchor: '100%',
                        labelWidth: 95
                    },
                    items: [
                        {
                            xtype: 'displayfield',
                            fieldLabel: 'Item',
                            value: Ext.String.htmlEncode(record ? record.get('name') : '')
                        },
                        {
                            xtype: 'combo',
                            name: 'targetType',
                            itemId: 'shareTargetType',
                            fieldLabel: 'Target type',
                            editable: false,
                            queryMode: 'local',
                            value: 'member',
                            store: Ext.create('Ext.data.Store', {
                                fields: ['id', 'label'],
                                data: [
                                    { id: 'member', label: 'User' }
                                ]
                            }),
                            valueField: 'id',
                            displayField: 'label',
                            listeners: {
                                change: function(combo, value) {
                                    me.syncShareTargetFields(value);
                                }
                            }
                        },
                        {
                            xtype: 'combo',
                            name: 'targetId',
                            itemId: 'organizationShareTarget',
                            fieldLabel: 'Target',
                            hidden: true,
                            allowBlank: true,
                            editable: false,
                            queryMode: 'local',
                            valueField: 'id',
                            displayField: 'label',
                            store: Ext.create('Ext.data.Store', {
                                fields: ['id', 'label', 'type']
                            })
                        },
                        {
                            xtype: 'textfield',
                            name: 'recipient',
                            itemId: 'shareRecipientField',
                            fieldLabel: 'Share with',
                            emptyText: 'Username or email',
                            allowBlank: true
                        },
                        {
                            xtype: 'combo',
                            name: 'permission',
                            itemId: 'sharePermission',
                            fieldLabel: 'Permission',
                            editable: false,
                            queryMode: 'local',
                            value: sharingSettings.defaultPermission || 'download',
                            valueField: 'id',
                            displayField: 'label',
                            store: Ext.create('Ext.data.Store', {
                                fields: ['id', 'label'],
                                data: this.getPermissionRows(['view', 'download'])
                            })
                        },
                        {
                            xtype: 'combo',
                            itemId: 'shareExpiry',
                            fieldLabel: 'Expires',
                            editable: false,
                            queryMode: 'local',
                            value: '',
                            store: [
                                ['', 'Never'],
                                ['24', '24 hours'],
                                ['168', '7 days'],
                                ['720', '30 days'],
                                ['custom', 'Custom...']
                            ],
                            listeners: {
                                change: function(combo, value) {
                                    me.syncCustomExpiryFields(combo, '#shareCustomExpiryValue', '#shareCustomExpiryUnit', value);
                                }
                            }
                        },
                        {
                            xtype: 'numberfield',
                            itemId: 'shareCustomExpiryValue',
                            fieldLabel: 'Custom expiry',
                            minValue: 1,
                            allowDecimals: false,
                            allowBlank: true,
                            hidden: true,
                            emptyText: 'Duration',
                            width: 170
                        },
                        {
                            xtype: 'combo',
                            itemId: 'shareCustomExpiryUnit',
                            fieldLabel: 'Unit',
                            editable: false,
                            queryMode: 'local',
                            value: 'minutes',
                            hidden: true,
                            allowBlank: true,
                            store: [
                                ['minutes', 'Minutes'],
                                ['hours', 'Hours'],
                                ['days', 'Days']
                            ]
                        },
                        {
                            xtype: 'fieldset',
                            itemId: 'directLinkFieldset',
                            title: 'Direct Link',
                            collapsible: true,
                            collapsed: sharingSettings.directLinkEnabled === false,
                            defaults: {
                                anchor: '100%',
                                labelWidth: 95
                            },
                            items: [
                                {
                                    xtype: 'displayfield',
                                    value: record && record.get('isPasswordProtected')
                                        ? 'This item is password protected. Visitors must enter the item password before viewing or downloading.'
                                        : 'Generate a public bearer link. Invalidated, expired, deleted, blocked, or password-protected items are handled on the public page.'
                                },
                                {
                                    xtype: 'combo',
                                    itemId: 'directLinkPermission',
                                    fieldLabel: 'Permission',
                                    editable: false,
                                    queryMode: 'local',
                                    value: sharingSettings.directLinkPermission || 'download',
                                    valueField: 'id',
                                    displayField: 'label',
                                    store: Ext.create('Ext.data.Store', {
                                        fields: ['id', 'label'],
                                        data: this.getPermissionRows(['view', 'download'])
                                    })
                                },
                                {
                                    xtype: 'combo',
                                    itemId: 'directLinkExpiry',
                                    fieldLabel: 'Expires',
                                    editable: false,
                                    queryMode: 'local',
                                    value: '',
                                    store: [
                                        ['', 'Never'],
                                        ['24', '24 hours'],
                                        ['168', '7 days'],
                                        ['720', '30 days'],
                                        ['custom', 'Custom...']
                                    ],
                                    listeners: {
                                        change: function(combo, value) {
                                            me.syncCustomExpiryFields(combo, '#directLinkCustomExpiryValue', '#directLinkCustomExpiryUnit', value);
                                        }
                                    }
                                },
                                {
                                    xtype: 'numberfield',
                                    itemId: 'directLinkCustomExpiryValue',
                                    fieldLabel: 'Custom expiry',
                                    minValue: 1,
                                    allowDecimals: false,
                                    allowBlank: true,
                                    hidden: true,
                                    emptyText: 'Duration',
                                    width: 170
                                },
                                {
                                    xtype: 'combo',
                                    itemId: 'directLinkCustomExpiryUnit',
                                    fieldLabel: 'Unit',
                                    editable: false,
                                    queryMode: 'local',
                                    value: 'minutes',
                                    hidden: true,
                                    allowBlank: true,
                                    store: [
                                        ['minutes', 'Minutes'],
                                        ['hours', 'Hours'],
                                        ['days', 'Days']
                                    ]
                                },
                                {
                                    xtype: 'textfield',
                                    itemId: 'directLinkField',
                                    fieldLabel: 'Link',
                                    readOnly: true,
                                    emptyText: 'Generate a link to copy it'
                                },
                                {
                                    xtype: 'container',
                                    layout: {
                                        type: 'hbox',
                                        align: 'stretch'
                                    },
                                    defaults: {
                                        xtype: 'button',
                                        margin: '0 6 0 0'
                                    },
                                    items: [
                                        {
                                            text: 'Generate Link',
                                            iconCls: 'fa fa-link',
                                            handler: function() {
                                                me.generateDirectLink();
                                            }
                                        },
                                        {
                                            text: 'Copy Link',
                                            itemId: 'copyDirectLinkButton',
                                            iconCls: 'fa fa-copy',
                                            disabled: true,
                                            handler: function() {
                                                me.copyDirectLink();
                                            }
                                        },
                                        {
                                            text: 'Invalidate Link',
                                            iconCls: 'fa fa-link-slash red-icon',
                                            handler: function() {
                                                me.invalidateDirectLink();
                                            }
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ],
            buttons: [
                {
                    text: 'Share',
                    itemId: 'shareSubmitButton',
                    iconCls: 'fa fa-share-nodes',
                    handler: function() {
                        me.submitShare();
                    }
                },
                {
                    text: 'Cancel',
                    handler: function() {
                        me.close();
                    }
                }
            ]
        });

        me.callParent(arguments);
        me.applyDefaultExpiry('#shareExpiry', '#shareCustomExpiryValue', '#shareCustomExpiryUnit', sharingSettings.defaultExpiryMinutes);
        me.applyDefaultExpiry('#directLinkExpiry', '#directLinkCustomExpiryValue', '#directLinkCustomExpiryUnit', sharingSettings.directLinkExpiryMinutes);
        me.loadOrganizationShareTargets();
    },

    normalizePolicyPermissions: function(permissions) {
        const allowed = ['view', 'download', 'upload', 'edit', 'reshare', 'manage'];
        const values = Ext.isArray(permissions) ? permissions : (permissions ? [permissions] : []);
        const normalized = Ext.Array.unique(values)
            .map(permission => String(permission || '').trim())
            .filter(permission => allowed.includes(permission));

        return normalized.length ? normalized : ['view'];
    },

    getPermissionRows: function(permissions) {
        const labels = {
            view: 'View only',
            download: 'View and download',
            upload: 'Upload into folder',
            edit: 'Edit/update',
            reshare: 'Reshare',
            manage: 'Manage'
        };

        return this.normalizePolicyPermissions(permissions).map(permission => ({
            id: permission,
            label: labels[permission] || permission
        }));
    },

    notifyShareResult: function(message, title) {
        const notificationUtil = FileManagement.components.utils && FileManagement.components.utils.NotificationUtil;

        if (notificationUtil && notificationUtil.showSuccess) {
            notificationUtil.showSuccess(message, title || 'Sharing', { category: 'shares' });
            return;
        }

        Ext.Msg.alert(title || 'Sharing', message);
    },

    setPermissionComboOptions: function(combo, permissions, preferredPermission) {
        if (!combo) {
            return;
        }

        const normalized = this.normalizePolicyPermissions(permissions);
        combo.getStore().loadData(this.getPermissionRows(normalized));
        combo.setValue(normalized.includes(preferredPermission) ? preferredPermission : normalized[0]);
    },

    getOrganizationSharePolicy: function() {
        return this.organizationSharingPolicy || null;
    },

    loadOrganizationShareTargets: function() {
        const targetTypeField = this.down('#shareTargetType');
        const targetField = this.down('#organizationShareTarget');
        const record = this.getRecord();
        const organizationId = record && record.get('workspaceType') === 'organization'
            ? record.get('organizationId')
            : null;

        if (!targetTypeField || !targetField) {
            return;
        }

        if (!organizationId) {
            this.organizationContext = null;
            return;
        }

        Ext.Ajax.request({
            url: FileManagementEnv.apiUrl(`/api/organizations/context?orgId=${encodeURIComponent(organizationId)}`),
            method: 'GET',
            headers: {
                'Authorization': FileManagement.helpers.Functions.getAuthorizationHeader()
            },
            success: (response) => {
                const payload = Ext.decode(response.responseText, true) || {};
                const context = payload.context || {};

                if (!context.hasOrganization || !context.organization || context.organization.id !== organizationId) {
                    this.organizationContext = null;
                    return;
                }

                this.organizationContext = context;
                Ext.Ajax.request({
                    url: FileManagementEnv.apiUrl(`/api/organizations/${context.organization.id}/share-targets`),
                    method: 'GET',
                    headers: {
                        'Authorization': FileManagement.helpers.Functions.getAuthorizationHeader()
                    },
                    success: (targetsResponse) => {
                        const targetsPayload = Ext.decode(targetsResponse.responseText, true) || {};
                        const targets = targetsPayload.targets || {};
                        const rows = [];
                        const policy = targets.policy || ((context.organization.settings || {}).sharing || {});

                        if (targets.organization) {
                            rows.push({
                                id: targets.organization.id,
                                label: targets.organization.name,
                                type: 'organization'
                            });
                        }

                        Ext.Array.forEach(targets.teams || [], function(team) {
                            rows.push({
                                id: team.id,
                                label: team.label || team.name,
                                type: 'team'
                            });
                        });

                        this.organizationShareTargetRows = rows;
                        this.applyOrganizationSharePolicy(policy, targets);
                    }
                });
            }
        });
    },

    applyOrganizationSharePolicy: function(policy, targets) {
        const targetTypeField = this.down('#shareTargetType');
        const shareButton = this.down('#shareSubmitButton');
        const directLinkFieldset = this.down('#directLinkFieldset');
        const directLinkPermission = this.down('#directLinkPermission');
        const sharePermission = this.down('#sharePermission');
        const normalizedPolicy = policy || {};
        const targetTypes = [];

        this.organizationSharingPolicy = normalizedPolicy;

        if (normalizedPolicy.memberSharingAllowed !== false) {
            targetTypes.push({ id: 'member', label: 'Member or user' });
        }

        if (normalizedPolicy.teamSharingAllowed !== false && targets && (targets.teams || []).length) {
            targetTypes.push({ id: 'team', label: 'Team' });
        }

        if (normalizedPolicy.organizationSharingAllowed !== false && targets && targets.organization) {
            targetTypes.push({ id: 'organization', label: 'Whole organization' });
        }

        if (normalizedPolicy.externalSharingAllowed !== false) {
            targetTypes.push({ id: 'external', label: 'External email' });
        }

        if (targetTypeField) {
            targetTypeField.getStore().loadData(targetTypes);
            targetTypeField.setDisabled(!targetTypes.length);
            targetTypeField.setValue(targetTypes.length ? targetTypes[0].id : null);
        }

        if (shareButton) {
            shareButton.setDisabled(!targetTypes.length);
        }

        this.setPermissionComboOptions(
            sharePermission,
            normalizedPolicy.allowedPermissions || ['view', 'download'],
            normalizedPolicy.defaultPermission || 'download'
        );

        const directLinkPermissions = this.normalizePolicyPermissions(normalizedPolicy.allowedPermissions || ['view', 'download'])
            .filter(permission => ['view', 'download'].includes(permission));
        const directLinksAllowed = normalizedPolicy.publicLinkSharingAllowed !== false &&
            normalizedPolicy.externalSharingAllowed !== false &&
            normalizedPolicy.requireExternalApproval !== true &&
            directLinkPermissions.length > 0;

        this.setPermissionComboOptions(
            directLinkPermission,
            directLinkPermissions.length ? directLinkPermissions : ['view'],
            ['view', 'download'].includes(normalizedPolicy.defaultPermission) ? normalizedPolicy.defaultPermission : 'download'
        );

        if (directLinkFieldset) {
            directLinkFieldset.setDisabled(!directLinksAllowed);
            directLinkFieldset.setCollapsed(!directLinksAllowed);
            directLinkFieldset.setTitle(directLinksAllowed ? 'Direct Link' : 'Direct Link (blocked by organization policy)');
        }

        if (normalizedPolicy.requireExternalExpiration) {
            this.ensureExpirySelected('#directLinkExpiry');
        }

        this.syncShareTargetFields(targetTypeField ? targetTypeField.getValue() : null);
    },

    getOrganizationTargetRows: function(targetType) {
        return (this.organizationShareTargetRows || []).filter(function(row) {
            return row.type === targetType;
        });
    },

    syncShareTargetFields: function(targetType) {
        targetType = targetType || 'member';
        const recipientField = this.down('#shareRecipientField');
        const targetField = this.down('#organizationShareTarget');
        const policy = this.getOrganizationSharePolicy();

        if (!recipientField || !targetField) {
            return;
        }

        const usesOrganizationTarget = targetType === 'team' || targetType === 'organization';
        recipientField.setHidden(usesOrganizationTarget);
        recipientField.allowBlank = usesOrganizationTarget;
        targetField.setHidden(!usesOrganizationTarget);
        targetField.allowBlank = !usesOrganizationTarget;

        if (usesOrganizationTarget) {
            const targetRows = this.getOrganizationTargetRows(targetType);
            targetField.setFieldLabel(targetType === 'organization' ? 'Organization' : 'Team');
            targetField.getStore().loadData(targetRows);
            targetField.setDisabled(!targetRows.length);

            if (targetType === 'organization') {
                targetField.setValue(targetRows.length ? targetRows[0].id : null);
            } else {
                const currentValue = targetField.getValue();
                const currentValueStillAvailable = targetRows.some(function(row) {
                    return row.id === currentValue;
                });
                targetField.setValue(currentValueStillAvailable ? currentValue : null);
            }
        } else {
            targetField.getStore().loadData([]);
            targetField.setDisabled(false);
            targetField.setValue(null);
        }

        if (targetType === 'external') {
            recipientField.setFieldLabel('External email');
            recipientField.emptyText = 'person@company.com';
        } else {
            recipientField.setFieldLabel('Share with');
            recipientField.emptyText = 'Username or email';
        }

        if (targetType === 'external' && policy && policy.requireExternalExpiration) {
            this.ensureExpirySelected('#shareExpiry');
        }
    },

    ensureExpirySelected: function(expirySelector) {
        const expiryField = this.down(expirySelector);
        if (expiryField && !expiryField.getValue()) {
            expiryField.setValue('24');
        }
    },

    applyDefaultExpiry: function(expirySelector, valueFieldSelector, unitFieldSelector, minutes) {
        const expiryField = this.down(expirySelector);
        const valueField = this.down(valueFieldSelector);
        const unitField = this.down(unitFieldSelector);
        const presetHours = {
            1440: '24',
            10080: '168',
            43200: '720'
        };

        if (!expiryField) {
            return;
        }

        if (!minutes) {
            expiryField.setValue('');
            return;
        }

        if (presetHours[Number(minutes)]) {
            expiryField.setValue(presetHours[Number(minutes)]);
            return;
        }

        expiryField.setValue('custom');

        if (minutes % 1440 === 0) {
            if (valueField) valueField.setValue(minutes / 1440);
            if (unitField) unitField.setValue('days');
        } else if (minutes % 60 === 0) {
            if (valueField) valueField.setValue(minutes / 60);
            if (unitField) unitField.setValue('hours');
        } else {
            if (valueField) valueField.setValue(minutes);
            if (unitField) unitField.setValue('minutes');
        }
    },

    syncCustomExpiryFields: function(combo, valueFieldSelector, unitFieldSelector, value) {
        const valueField = this.down(valueFieldSelector);
        const unitField = this.down(unitFieldSelector);
        if (!valueField || !unitField) {
            return;
        }

        const custom = value === 'custom';
        valueField.setHidden(!custom);
        unitField.setHidden(!custom);
        valueField.allowBlank = !custom;
        unitField.allowBlank = !custom;

        if (!custom) {
            valueField.setValue(null);
            unitField.setValue('minutes');
            return;
        }

        Ext.defer(function() {
            valueField.focus(false, 50);
        }, 50);
    },

    getExpiryMinutes: function(expirySelector, valueFieldSelector, unitFieldSelector, label) {
        const expiryField = this.down(expirySelector);
        const value = expiryField ? expiryField.getValue() : '';

        if (!value) {
            return null;
        }

        if (value !== 'custom') {
            return Number(value) * 60;
        }

        const valueField = this.down(valueFieldSelector);
        const unitField = this.down(unitFieldSelector);
        const amount = valueField ? Number(valueField.getValue()) : 0;
        const unit = unitField ? unitField.getValue() : 'minutes';
        const multiplierByUnit = {
            minutes: 1,
            hours: 60,
            days: 24 * 60
        };
        const minutes = amount * (multiplierByUnit[unit] || 1);

        if (!Number.isFinite(minutes) || minutes < 1 || minutes > 525600) {
            throw new Error(`${label} custom expiry must be between 1 minute and 365 days.`);
        }

        return Math.ceil(minutes);
    },

    submitShare: function() {
        const form = this.down('form');
        const record = this.getRecord();

        if (!record) {
            return;
        }

        const values = form.getValues();
        if (!this.isOrganizationShareTarget(values) && !values.recipient) {
            Ext.Msg.alert('Share', 'Enter a username or email, or use Generate Link for public direct access.');
            return;
        }

        let expiresInMinutes = null;

        try {
            expiresInMinutes = this.getExpiryMinutes('#shareExpiry', '#shareCustomExpiryValue', '#shareCustomExpiryUnit', 'Share');
        } catch (error) {
            Ext.Msg.alert('Expiry', error.message);
            return;
        }

        if (!form.isValid()) {
            return;
        }

        const targetType = values.targetType || 'member';

        if (this.organizationContext && this.organizationContext.organization) {
            this.submitOrganizationShare(values, targetType, expiresInMinutes);
            return;
        }

        const token = FileManagement.helpers.Functions.getToken();

        this.setLoading('Sharing...');

        Ext.Ajax.request({
            url: FileManagementEnv.apiUrl('/api/files/share'),
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            jsonData: {
                itemId: record.get('id'),
                isFolder: record.get('isFolder'),
                recipient: values.recipient,
                permission: values.permission,
                expiresInMinutes,
                workspaceId: this.getWorkspaceId() || record.get('workspaceId') || ''
            },
            success: (response) => {
                this.setLoading(false);
                const payload = Ext.decode(response.responseText, true) || {};
                const recipient = payload.share && payload.share.recipient
                    ? payload.share.recipient.username
                    : values.recipient;

                Ext.Msg.alert('Shared', `${record.get('name')} was shared with ${recipient}.`);
                this.getOnSuccess()();
                this.close();
            },
            failure: (response) => {
                this.setLoading(false);
                const payload = Ext.decode(response.responseText, true) || {};
                Ext.Msg.alert('Share Failed', payload.message || 'Failed to share item.');
            }
        });
    },

    isOrganizationShareTarget: function(values) {
        const targetType = values.targetType || 'member';
        return targetType === 'team' || targetType === 'organization';
    },

    submitOrganizationShare: function(values, targetType, expiresInMinutes) {
        const record = this.getRecord();
        const context = this.organizationContext || {};
        const organization = context.organization || {};
        const targetField = this.down('#organizationShareTarget');
        const targetId = targetField ? targetField.getValue() : values.targetId;
        const policy = this.getOrganizationSharePolicy();

        if ((targetType === 'team' || targetType === 'organization') && !targetId) {
            Ext.Msg.alert('Share', 'Select an organization target.');
            return;
        }

        if ((targetType === 'member' || targetType === 'external') && !values.recipient) {
            Ext.Msg.alert('Share', targetType === 'external' ? 'Enter an external email.' : 'Enter a username or email.');
            return;
        }

        if (targetType === 'external' && policy && policy.requireExternalExpiration && !expiresInMinutes) {
            Ext.Msg.alert('Share', 'External shares must have an expiration date by organization policy.');
            return;
        }

        this.setLoading('Sharing...');

        Ext.Ajax.request({
            url: FileManagementEnv.apiUrl(`/api/organizations/${organization.id}/shares`),
            method: 'POST',
            headers: {
                'Authorization': FileManagement.helpers.Functions.getAuthorizationHeader(),
                'Content-Type': 'application/json'
            },
            jsonData: {
                itemId: record.get('id'),
                itemType: record.get('isFolder') ? 'folder' : 'file',
                targetType,
                targetId,
                targetIdentifier: values.recipient,
                externalEmail: values.recipient,
                permission: values.permission,
                expiresInMinutes,
                workspaceId: this.getWorkspaceId() || record.get('workspaceId') || ''
            },
            success: (response) => {
                this.setLoading(false);
                const payload = Ext.decode(response.responseText, true) || {};
                const targetLabel = payload.share ? payload.share.targetLabel : (values.recipient || 'target');

                this.notifyShareResult(`${record.get('name')} was shared with ${targetLabel}.`, 'Shared');
                this.getOnSuccess()();
                this.close();
            },
            failure: (response) => {
                this.setLoading(false);
                const payload = Ext.decode(response.responseText, true) || {};
                Ext.Msg.alert('Share Failed', payload.message || 'Failed to share item.');
            }
        });
    },

    generateDirectLink: function() {
        const record = this.getRecord();
        if (!record) {
            return;
        }

        const policy = this.getOrganizationSharePolicy();
        if (policy) {
            if (policy.publicLinkSharingAllowed === false || policy.externalSharingAllowed === false) {
                Ext.Msg.alert('Direct Link', 'Public links are blocked by organization policy.');
                return;
            }

            if (policy.requireExternalApproval === true) {
                Ext.Msg.alert('Direct Link', 'Public links are blocked while external sharing approval is required by organization policy.');
                return;
            }
        }

        const token = FileManagement.helpers.Functions.getToken();
        const permissionField = this.down('#directLinkPermission');
        const linkField = this.down('#directLinkField');
        const copyButton = this.down('#copyDirectLinkButton');
        let expiresInMinutes = null;

        try {
            expiresInMinutes = this.getExpiryMinutes('#directLinkExpiry', '#directLinkCustomExpiryValue', '#directLinkCustomExpiryUnit', 'Direct link');
        } catch (error) {
            Ext.Msg.alert('Expiry', error.message);
            return;
        }

        if (policy && policy.requireExternalExpiration && !expiresInMinutes) {
            Ext.Msg.alert('Direct Link', 'Public links must have an expiration date by organization policy.');
            return;
        }

        this.setLoading('Generating link...');

        Ext.Ajax.request({
            url: FileManagementEnv.apiUrl('/api/files/share-link'),
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            jsonData: {
                itemId: record.get('id'),
                isFolder: record.get('isFolder'),
                permission: permissionField ? permissionField.getValue() : 'download',
                expiresInMinutes,
                workspaceId: this.getWorkspaceId() || record.get('workspaceId') || ''
            },
            success: (response) => {
                this.setLoading(false);
                const payload = Ext.decode(response.responseText, true) || {};
                const url = payload.link ? payload.link.url : '';

                if (linkField) {
                    linkField.setValue(url);
                }

                if (copyButton) {
                    copyButton.setDisabled(!url);
                }

                this.getOnSuccess()();
                this.notifyShareResult(payload.link && payload.link.requiresPassword
                    ? 'Direct link generated. Visitors will need the item password to open it.'
                    : 'Direct link generated.', 'Direct Link');
            },
            failure: (response) => {
                this.setLoading(false);
                const payload = Ext.decode(response.responseText, true) || {};
                Ext.Msg.alert('Link Failed', payload.message || 'Failed to generate direct link.');
            }
        });
    },

    copyDirectLink: function() {
        const linkField = this.down('#directLinkField');
        const url = linkField ? linkField.getValue() : '';

        if (!url) {
            Ext.Msg.alert('Copy Link', 'Generate a link first.');
            return;
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(function() {
                const notificationUtil = FileManagement.components.utils && FileManagement.components.utils.NotificationUtil;
                if (notificationUtil && notificationUtil.showInfo) {
                    notificationUtil.showInfo('Direct link copied.', 'Copy Link', { category: 'shares' });
                } else {
                    Ext.Msg.alert('Copy Link', 'Direct link copied.');
                }
            }).catch(function() {
                window.prompt('Copy this link:', url);
            });
            return;
        }

        window.prompt('Copy this link:', url);
    },

    invalidateDirectLink: function() {
        const record = this.getRecord();
        if (!record) {
            return;
        }

        Ext.Msg.confirm('Invalidate Direct Link', 'Invalidate active direct links for this item?', (btn) => {
            if (btn !== 'yes') {
                return;
            }

            const token = FileManagement.helpers.Functions.getToken();
            const itemType = record.get('isFolder') ? 'folder' : 'file';

            this.setLoading('Invalidating link...');
            const workspaceId = this.getWorkspaceId() || record.get('workspaceId') || '';
            Ext.Ajax.request({
                url: FileManagementEnv.apiUrl(`/api/files/share-link/item/${itemType}/${record.get('id')}${workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ''}`),
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                success: () => {
                    this.setLoading(false);
                    const linkField = this.down('#directLinkField');
                    const copyButton = this.down('#copyDirectLinkButton');

                    if (linkField) {
                        linkField.setValue('');
                    }

                    if (copyButton) {
                        copyButton.setDisabled(true);
                    }

                    this.getOnSuccess()();
                    this.notifyShareResult('Active direct links for this item were invalidated.', 'Direct Link');
                },
                failure: (response) => {
                    this.setLoading(false);
                    const payload = Ext.decode(response.responseText, true) || {};
                    Ext.Msg.alert('Invalidate Failed', payload.message || 'Failed to invalidate direct links.');
                }
            });
        });
    }
});
