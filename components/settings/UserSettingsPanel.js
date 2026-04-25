Ext.define('FileManagement.components.settings.UserSettingsPanel', {
    extend: 'Ext.panel.Panel',
    xtype: 'usersettingspanel',

    requires: [
        'FileManagement.components.settings.UserSettings',
        'FileManagement.components.utils.PanelUtils',
        'FileManagement.components.utils.WorkspaceContext'
    ],

    title: 'Settings',
    iconCls: 'fa fa-gear',
    frame: true,
    closable: true,
    width: 760,
    height: 560,
    minWidth: 420,
    minHeight: 360,
    x: 70,
    y: 54,
    layout: 'fit',
    bodyPadding: 0,

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
        minWidth: 420
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

    listeners: {
        afterrender: function(panel) {
            panel.loadSettings();
        },
        show: function(panel) {
            FileManagement.components.utils.PanelUtils.show(panel);
            panel.loadSettings(false);
        },
        hide: function(panel) {
            FileManagement.components.utils.PanelUtils.hide(panel);
        },
        destroy: function(panel) {
            FileManagement.components.utils.PanelUtils.destroy(panel);
        }
    },

    initComponent: function() {
        Ext.apply(this, {
            items: [
                {
                    xtype: 'tabpanel',
                    itemId: 'settingsTabs',
                    deferredRender: false,
                    bodyPadding: 0,
                    defaults: {
                        xtype: 'form',
                        bodyPadding: 12,
                        autoScroll: true,
                        defaults: {
                            anchor: '100%',
                            labelWidth: 170
                        }
                    },
                    items: [
                        this.buildAccountTab(),
                        this.buildSharingTab(),
                        this.buildUploadScanTab(),
                        this.buildConversionTab(),
                        this.buildContentIntelligenceTab(),
                        this.buildWorkspaceTab(),
                        this.buildNotificationTab()
                    ]
                }
            ],
            buttons: [
                {
                    text: 'Save Settings',
                    iconCls: 'fa fa-save',
                    handler: () => this.saveSettings()
                },
                {
                    text: 'Reload',
                    iconCls: 'fa fa-refresh',
                    handler: () => this.loadSettings(true)
                },
                {
                    text: 'Close',
                    handler: () => this.close()
                }
            ]
        });

        this.callParent(arguments);
    },

    buildAccountTab: function() {
        return {
            title: 'Account',
            itemId: 'accountTab',
            items: [
                {
                    xtype: 'fieldset',
                    title: 'Profile',
                    defaults: {
                        anchor: '100%',
                        labelWidth: 170
                    },
                    items: [
                        {
                            xtype: 'textfield',
                            itemId: 'usernameField',
                            fieldLabel: 'Username',
                            allowBlank: false
                        },
                        {
                            xtype: 'textfield',
                            itemId: 'emailField',
                            fieldLabel: 'Email',
                            vtype: 'email',
                            allowBlank: false
                        },
                        {
                            xtype: 'checkbox',
                            itemId: 'rememberMeDefaultField',
                            fieldLabel: 'Login',
                            boxLabel: 'Prefer Remember Me on trusted devices'
                        },
                        {
                            xtype: 'button',
                            text: 'Save Profile',
                            iconCls: 'fa fa-user-check',
                            margin: '4 0 0 170',
                            handler: () => this.saveProfile()
                        }
                    ]
                },
                {
                    xtype: 'fieldset',
                    title: 'Password',
                    defaults: {
                        anchor: '100%',
                        labelWidth: 170
                    },
                    items: [
                        {
                            xtype: 'textfield',
                            itemId: 'currentPasswordField',
                            fieldLabel: 'Current password',
                            inputType: 'password'
                        },
                        {
                            xtype: 'textfield',
                            itemId: 'newPasswordField',
                            fieldLabel: 'New password',
                            inputType: 'password'
                        },
                        {
                            xtype: 'textfield',
                            itemId: 'confirmPasswordField',
                            fieldLabel: 'Confirm password',
                            inputType: 'password'
                        },
                        {
                            xtype: 'button',
                            text: 'Change Password',
                            iconCls: 'fa fa-key',
                            margin: '4 0 0 170',
                            handler: () => this.changePassword()
                        }
                    ]
                },
                {
                    xtype: 'fieldset',
                    title: 'Sessions',
                    items: [
                        {
                            xtype: 'displayfield',
                            hideLabel: true,
                            value: 'End every active browser session for this account, including this one.'
                        },
                        {
                            xtype: 'button',
                            text: 'Log Out All Sessions',
                            iconCls: 'fa fa-right-from-bracket',
                            handler: () => this.logoutAllSessions()
                        }
                    ]
                }
            ]
        };
    },

    buildSharingTab: function() {
        return {
            title: 'Sharing',
            itemId: 'sharingTab',
            items: [
                {
                    xtype: 'fieldset',
                    title: 'Shared Items Defaults',
                    defaults: {
                        anchor: '100%',
                        labelWidth: 170
                    },
                    items: [
                        this.permissionCombo('defaultSharePermissionField', 'Default permission'),
                        this.expiryCombo('shareExpiryTypeField', 'Default expiry'),
                        this.expiryValueField('shareExpiryValueField'),
                        this.expiryUnitCombo('shareExpiryUnitField')
                    ]
                },
                {
                    xtype: 'fieldset',
                    title: 'Direct Links',
                    defaults: {
                        anchor: '100%',
                        labelWidth: 170
                    },
                    items: [
                        {
                            xtype: 'checkbox',
                            itemId: 'directLinkEnabledField',
                            fieldLabel: 'Direct links',
                            boxLabel: 'Offer direct link generation by default'
                        },
                        this.permissionCombo('directLinkPermissionField', 'Default permission'),
                        this.expiryCombo('directLinkExpiryTypeField', 'Default expiry'),
                        this.expiryValueField('directLinkExpiryValueField'),
                        this.expiryUnitCombo('directLinkExpiryUnitField')
                    ]
                }
            ]
        };
    },

    buildUploadScanTab: function() {
        return {
            title: 'Uploads & Scans',
            itemId: 'uploadScanTab',
            items: [
                {
                    xtype: 'fieldset',
                    title: 'Uploads',
                    defaults: {
                        anchor: '100%',
                        labelWidth: 190
                    },
                    items: [
                        { xtype: 'checkbox', itemId: 'autoResumeInterruptedField', fieldLabel: 'Interrupted uploads', boxLabel: 'Auto-detect resumable uploads' },
                        { xtype: 'checkbox', itemId: 'showRecoveryPanelField', fieldLabel: 'Recovery panel', boxLabel: 'Show interrupted uploads panel when needed' },
                        { xtype: 'checkbox', itemId: 'showUploadPanelField', fieldLabel: 'Upload panel', boxLabel: 'Show upload progress automatically' }
                    ]
                },
                {
                    xtype: 'fieldset',
                    title: 'Virus Scanning',
                    defaults: {
                        anchor: '100%',
                        labelWidth: 190
                    },
                    items: [
                        { xtype: 'checkbox', itemId: 'showScanPanelField', fieldLabel: 'Scan panel', boxLabel: 'Show active scan queue automatically' },
                        { xtype: 'checkbox', itemId: 'notifyScanCompleteField', fieldLabel: 'Notifications', boxLabel: 'Notify me when scans finish' },
                        { xtype: 'checkbox', itemId: 'scanSharedBeforeOpenField', fieldLabel: 'Shared files', boxLabel: 'Prefer scanning shared-with-me files before opening' }
                    ]
                }
            ]
        };
    },

    buildConversionTab: function() {
        return {
            title: 'Conversions',
            itemId: 'conversionTab',
            items: [
                {
                    xtype: 'fieldset',
                    title: 'Documents',
                    defaults: {
                        anchor: '100%',
                        labelWidth: 190
                    },
                    items: [
                        { xtype: 'checkbox', itemId: 'pdfPreserveLayoutField', fieldLabel: 'PDF to DOCX', boxLabel: 'Preserve layout by default' },
                        { xtype: 'numberfield', itemId: 'previewDpiField', fieldLabel: 'PDF preview DPI', minValue: 72, maxValue: 300, allowDecimals: false }
                    ]
                },
                {
                    xtype: 'fieldset',
                    title: 'Media',
                    defaults: {
                        anchor: '100%',
                        labelWidth: 190
                    },
                    items: [
                        {
                            xtype: 'combo',
                            itemId: 'mediaQualityField',
                            fieldLabel: 'Media quality',
                            editable: false,
                            queryMode: 'local',
                            store: [
                                ['low', 'Smaller files'],
                                ['balanced', 'Balanced'],
                                ['high', 'High quality'],
                                ['source', 'Keep source quality']
                            ]
                        },
                        {
                            xtype: 'combo',
                            itemId: 'gifQualityField',
                            fieldLabel: 'GIF quality',
                            editable: false,
                            queryMode: 'local',
                            store: [
                                ['low', 'Low'],
                                ['balanced', 'Balanced'],
                                ['high', 'High'],
                                ['source', 'Keep source quality']
                            ]
                        }
                    ]
                }
            ]
        };
    },

    buildContentIntelligenceTab: function() {
        return {
            title: 'Content Intelligence',
            itemId: 'contentIntelligenceTab',
            defaults: {
                anchor: '100%',
                labelWidth: 190
            },
            items: [
                {
                    xtype: 'displayfield',
                    itemId: 'contentIntelligenceScopeField',
                    fieldLabel: 'Settings scope',
                    value: 'Personal'
                },
                {
                    xtype: 'fieldset',
                    title: 'Processing',
                    defaults: {
                        anchor: '100%',
                        labelWidth: 190
                    },
                    items: [
                        { xtype: 'checkbox', itemId: 'contentAiEnabledField', fieldLabel: 'Content intelligence', boxLabel: 'Enabled' },
                        { xtype: 'checkbox', itemId: 'contentAiAutoUploadsField', fieldLabel: 'Uploads', boxLabel: 'Analyze new uploads in the background' },
                        {
                            xtype: 'combo',
                            itemId: 'contentAiProviderField',
                            fieldLabel: 'AI provider',
                            editable: false,
                            queryMode: 'local',
                            store: [
                                ['local', 'Local'],
                                ['openai', 'OpenAI'],
                                ['anthropic', 'Claude'],
                                ['huggingface', 'HuggingFace'],
                                ['generic', 'Generic API']
                            ]
                        },
                        { xtype: 'textfield', itemId: 'contentAiModelField', fieldLabel: 'Model' },
                        { xtype: 'textfield', itemId: 'contentAiEndpointField', fieldLabel: 'Endpoint' },
                        { xtype: 'textfield', itemId: 'contentAiApiKeyField', fieldLabel: 'API key', inputType: 'password' }
                    ]
                },
                {
                    xtype: 'fieldset',
                    title: 'OCR',
                    defaults: {
                        anchor: '100%',
                        labelWidth: 190
                    },
                    items: [
                        { xtype: 'checkbox', itemId: 'contentAiOcrEnabledField', fieldLabel: 'OCR', boxLabel: 'Enabled' },
                        {
                            xtype: 'combo',
                            itemId: 'contentAiOcrProviderField',
                            fieldLabel: 'OCR provider',
                            editable: false,
                            queryMode: 'local',
                            store: [
                                ['local', 'Local Tesseract'],
                                ['openai', 'OpenAI'],
                                ['anthropic', 'Claude'],
                                ['huggingface', 'HuggingFace'],
                                ['generic', 'Generic API']
                            ]
                        },
                        { xtype: 'textfield', itemId: 'contentAiOcrModelField', fieldLabel: 'OCR model' },
                        { xtype: 'textfield', itemId: 'contentAiOcrEndpointField', fieldLabel: 'OCR endpoint' },
                        { xtype: 'textfield', itemId: 'contentAiOcrApiKeyField', fieldLabel: 'OCR API key', inputType: 'password' },
                        { xtype: 'textfield', itemId: 'contentAiOcrLanguageField', fieldLabel: 'OCR language' },
                        { xtype: 'numberfield', itemId: 'contentAiOcrDpiField', fieldLabel: 'OCR DPI', minValue: 120, maxValue: 400, allowDecimals: false }
                    ]
                },
                {
                    xtype: 'fieldset',
                    title: 'Outputs',
                    defaults: {
                        anchor: '100%',
                        labelWidth: 190
                    },
                    items: [
                        { xtype: 'checkbox', itemId: 'contentAiClassificationField', fieldLabel: 'Classification', boxLabel: 'Enabled' },
                        { xtype: 'checkbox', itemId: 'contentAiTaggingField', fieldLabel: 'Smart tags', boxLabel: 'Enabled' },
                        { xtype: 'checkbox', itemId: 'contentAiSummaryField', fieldLabel: 'Summary', boxLabel: 'Enabled' },
                        { xtype: 'checkbox', itemId: 'contentAiImageRecognitionField', fieldLabel: 'Image recognition', boxLabel: 'Enabled' },
                        { xtype: 'numberfield', itemId: 'contentAiMaxTextField', fieldLabel: 'Max text chars', minValue: 1000, maxValue: 200000, allowDecimals: false },
                        { xtype: 'numberfield', itemId: 'contentAiMaxFileSizeField', fieldLabel: 'Max file MB', minValue: 1, maxValue: 1000, allowDecimals: false },
                        { xtype: 'numberfield', itemId: 'contentAiMaxPagesField', fieldLabel: 'Max OCR pages', minValue: 1, maxValue: 100, allowDecimals: false }
                    ]
                }
            ]
        };
    },

    buildWorkspaceTab: function() {
        return {
            title: 'Workspace',
            itemId: 'workspaceTab',
            items: [
                {
                    xtype: 'fieldset',
                    title: 'Desktop Behavior',
                    defaults: {
                        anchor: '100%',
                        labelWidth: 190
                    },
                    items: [
                        { xtype: 'checkbox', itemId: 'reopenLastPanelsField', fieldLabel: 'Startup', boxLabel: 'Reopen last panels when possible' },
                        { xtype: 'checkbox', itemId: 'enablePanelAnimationsField', fieldLabel: 'Animations', boxLabel: 'Use minimize and maximize animations' },
                        { xtype: 'checkbox', itemId: 'dimInactivePanelsField', fieldLabel: 'Focus mode', boxLabel: 'Dim inactive panels behind the focused panel' },
                        { xtype: 'checkbox', itemId: 'mobileNavAutoCloseField', fieldLabel: 'Mobile navigation', boxLabel: 'Close navigation after selecting an item' }
                    ]
                }
            ]
        };
    },

    buildNotificationTab: function() {
        return {
            title: 'Notifications',
            itemId: 'notificationTab',
            items: [
                {
                    xtype: 'fieldset',
                    title: 'Notify Me About',
                    defaults: {
                        anchor: '100%',
                        labelWidth: 170
                    },
                    items: [
                        { xtype: 'checkbox', itemId: 'notifyUploadsField', fieldLabel: 'Uploads', boxLabel: 'Upload results' },
                        { xtype: 'checkbox', itemId: 'notifySharesField', fieldLabel: 'Sharing', boxLabel: 'Share and link results' },
                        { xtype: 'checkbox', itemId: 'notifyScansField', fieldLabel: 'Virus scans', boxLabel: 'Scan results' },
                        { xtype: 'checkbox', itemId: 'notifyConversionsField', fieldLabel: 'Conversions', boxLabel: 'Conversion job results' },
                        { xtype: 'checkbox', itemId: 'notifyDownloadsField', fieldLabel: 'Downloads', boxLabel: 'Download starts and failures' }
                    ]
                }
            ]
        };
    },

    permissionCombo: function(itemId, fieldLabel) {
        return {
            xtype: 'combo',
            itemId: itemId,
            fieldLabel: fieldLabel,
            editable: false,
            queryMode: 'local',
            store: [
                ['download', 'View and download'],
                ['view', 'View only']
            ]
        };
    },

    expiryCombo: function(itemId, fieldLabel) {
        return {
            xtype: 'combo',
            itemId: itemId,
            fieldLabel: fieldLabel,
            editable: false,
            queryMode: 'local',
            store: [
                ['never', 'Never'],
                ['15m', '15 minutes'],
                ['1h', '1 hour'],
                ['24h', '24 hours'],
                ['7d', '7 days'],
                ['30d', '30 days'],
                ['custom', 'Custom']
            ],
            listeners: {
                change: (combo, value) => this.syncExpiryFields(combo, value)
            }
        };
    },

    expiryValueField: function(itemId) {
        return {
            xtype: 'numberfield',
            itemId: itemId,
            fieldLabel: 'Custom expiry',
            minValue: 1,
            maxValue: 365,
            allowDecimals: false,
            hidden: true
        };
    },

    expiryUnitCombo: function(itemId) {
        return {
            xtype: 'combo',
            itemId: itemId,
            fieldLabel: 'Custom unit',
            editable: false,
            queryMode: 'local',
            hidden: true,
            store: [
                ['minutes', 'Minutes'],
                ['hours', 'Hours'],
                ['days', 'Days']
            ]
        };
    },

    loadSettings: function(force) {
        this.setLoading('Loading settings...');
        FileManagement.components.settings.UserSettings.load((settings, user) => {
            if (this.destroyed || this.destroying) {
                return;
            }

            this.setLoading(false);
            this.applyValues(settings, user);
            this.loadContentIntelligenceSettings(force === true);
        }, force === true);
    },

    field: function(itemId) {
        return this.down(`#${itemId}`);
    },

    setFieldValue: function(itemId, value) {
        const field = this.field(itemId);
        if (field && field.setValue) {
            field.setValue(value);
        }
    },

    getFieldValue: function(itemId) {
        const field = this.field(itemId);
        return field && field.getValue ? field.getValue() : null;
    },

    applyValues: function(settings, user) {
        const normalized = FileManagement.components.settings.UserSettings.mergeDefaults(settings || {});

        this.setFieldValue('usernameField', user && user.username || FileManagement.helpers.Functions.getUsername() || '');
        this.setFieldValue('emailField', user && user.email || '');
        this.setFieldValue('rememberMeDefaultField', normalized.account.rememberMeDefault);

        this.setFieldValue('defaultSharePermissionField', normalized.sharing.defaultPermission);
        this.applyExpiryMinutes('share', normalized.sharing.defaultExpiryMinutes);
        this.setFieldValue('directLinkEnabledField', normalized.sharing.directLinkEnabled);
        this.setFieldValue('directLinkPermissionField', normalized.sharing.directLinkPermission);
        this.applyExpiryMinutes('directLink', normalized.sharing.directLinkExpiryMinutes);

        this.setFieldValue('autoResumeInterruptedField', normalized.uploads.autoResumeInterrupted);
        this.setFieldValue('showRecoveryPanelField', normalized.uploads.showRecoveryPanel);
        this.setFieldValue('showUploadPanelField', normalized.uploads.showUploadPanel);
        this.setFieldValue('showScanPanelField', normalized.scanning.showScanPanel);
        this.setFieldValue('notifyScanCompleteField', normalized.scanning.notifyOnComplete);
        this.setFieldValue('scanSharedBeforeOpenField', normalized.scanning.scanSharedBeforeOpen);

        this.setFieldValue('pdfPreserveLayoutField', normalized.conversions.pdfPreserveLayout);
        this.setFieldValue('previewDpiField', normalized.conversions.previewDpi);
        this.setFieldValue('mediaQualityField', normalized.conversions.mediaQuality);
        this.setFieldValue('gifQualityField', normalized.conversions.gifQuality);

        this.setFieldValue('reopenLastPanelsField', normalized.workspace.reopenLastPanels);
        this.setFieldValue('enablePanelAnimationsField', normalized.workspace.enablePanelAnimations);
        this.setFieldValue('dimInactivePanelsField', normalized.workspace.dimInactivePanels);
        this.setFieldValue('mobileNavAutoCloseField', normalized.workspace.mobileNavAutoClose);

        this.setFieldValue('notifyUploadsField', normalized.notifications.uploads);
        this.setFieldValue('notifySharesField', normalized.notifications.shares);
        this.setFieldValue('notifyScansField', normalized.notifications.scans);
        this.setFieldValue('notifyConversionsField', normalized.notifications.conversions);
        this.setFieldValue('notifyDownloadsField', normalized.notifications.downloads);
    },

    syncExpiryFields: function(combo, value) {
        const prefix = combo.getItemId().indexOf('directLink') === 0 ? 'directLink' : 'share';
        const valueField = this.field(`${prefix}ExpiryValueField`);
        const unitField = this.field(`${prefix}ExpiryUnitField`);
        const custom = value === 'custom';

        if (valueField) {
            valueField.setHidden(!custom);
            valueField.allowBlank = !custom;
        }

        if (unitField) {
            unitField.setHidden(!custom);
            unitField.allowBlank = !custom;
        }
    },

    applyExpiryMinutes: function(prefix, minutes) {
        const typeField = this.field(`${prefix}ExpiryTypeField`);
        const valueField = this.field(`${prefix}ExpiryValueField`);
        const unitField = this.field(`${prefix}ExpiryUnitField`);
        const presets = {
            15: '15m',
            60: '1h',
            1440: '24h',
            10080: '7d',
            43200: '30d'
        };

        if (!minutes) {
            if (typeField) typeField.setValue('never');
            return;
        }

        const preset = presets[Number(minutes)];
        if (preset) {
            if (typeField) typeField.setValue(preset);
            return;
        }

        if (typeField) typeField.setValue('custom');

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

    collectExpiryMinutes: function(prefix) {
        const type = this.getFieldValue(`${prefix}ExpiryTypeField`);
        const presetMinutes = {
            never: null,
            '15m': 15,
            '1h': 60,
            '24h': 1440,
            '7d': 10080,
            '30d': 43200
        };

        if (type !== 'custom') {
            return presetMinutes[type] === undefined ? null : presetMinutes[type];
        }

        const value = Number(this.getFieldValue(`${prefix}ExpiryValueField`));
        const unit = this.getFieldValue(`${prefix}ExpiryUnitField`) || 'minutes';
        const multipliers = {
            minutes: 1,
            hours: 60,
            days: 1440
        };
        const minutes = value * (multipliers[unit] || 1);

        if (!Number.isFinite(minutes) || minutes < 1 || minutes > 525600) {
            throw new Error('Custom expiry must be between 1 minute and 365 days.');
        }

        return Math.round(minutes);
    },

    collectSettings: function() {
        return {
            account: {
                rememberMeDefault: this.getFieldValue('rememberMeDefaultField') === true
            },
            sharing: {
                defaultPermission: this.getFieldValue('defaultSharePermissionField') || 'download',
                defaultExpiryMinutes: this.collectExpiryMinutes('share'),
                directLinkEnabled: this.getFieldValue('directLinkEnabledField') === true,
                directLinkPermission: this.getFieldValue('directLinkPermissionField') || 'download',
                directLinkExpiryMinutes: this.collectExpiryMinutes('directLink')
            },
            uploads: {
                autoResumeInterrupted: this.getFieldValue('autoResumeInterruptedField') === true,
                showRecoveryPanel: this.getFieldValue('showRecoveryPanelField') === true,
                showUploadPanel: this.getFieldValue('showUploadPanelField') === true
            },
            scanning: {
                showScanPanel: this.getFieldValue('showScanPanelField') === true,
                notifyOnComplete: this.getFieldValue('notifyScanCompleteField') === true,
                scanSharedBeforeOpen: this.getFieldValue('scanSharedBeforeOpenField') === true
            },
            conversions: {
                pdfPreserveLayout: this.getFieldValue('pdfPreserveLayoutField') === true,
                previewDpi: Number(this.getFieldValue('previewDpiField')) || 144,
                mediaQuality: this.getFieldValue('mediaQualityField') || 'balanced',
                gifQuality: this.getFieldValue('gifQualityField') || 'balanced'
            },
            workspace: {
                reopenLastPanels: this.getFieldValue('reopenLastPanelsField') === true,
                enablePanelAnimations: this.getFieldValue('enablePanelAnimationsField') === true,
                dimInactivePanels: this.getFieldValue('dimInactivePanelsField') === true,
                mobileNavAutoClose: this.getFieldValue('mobileNavAutoCloseField') === true
            },
            notifications: {
                uploads: this.getFieldValue('notifyUploadsField') === true,
                shares: this.getFieldValue('notifySharesField') === true,
                scans: this.getFieldValue('notifyScansField') === true,
                conversions: this.getFieldValue('notifyConversionsField') === true,
                downloads: this.getFieldValue('notifyDownloadsField') === true
            }
        };
    },

    getContentIntelligenceWorkspace: function() {
        const workspaceContext = FileManagement.components.utils.WorkspaceContext;
        const context = workspaceContext && workspaceContext.getContext ? workspaceContext.getContext() : {};
        const workspaces = context.workspaces || [];

        return workspaces.find(workspace => workspace.type === 'personal') ||
            (context.activeWorkspace && context.activeWorkspace.type === 'personal' ? context.activeWorkspace : null) ||
            null;
    },

    getContentIntelligenceWorkspaceId: function() {
        const workspace = this.getContentIntelligenceWorkspace();
        return workspace && workspace.id || '';
    },

    getContentIntelligenceFieldIds: function() {
        return [
            'contentAiEnabledField',
            'contentAiAutoUploadsField',
            'contentAiProviderField',
            'contentAiModelField',
            'contentAiEndpointField',
            'contentAiApiKeyField',
            'contentAiOcrEnabledField',
            'contentAiOcrProviderField',
            'contentAiOcrModelField',
            'contentAiOcrEndpointField',
            'contentAiOcrApiKeyField',
            'contentAiOcrLanguageField',
            'contentAiOcrDpiField',
            'contentAiClassificationField',
            'contentAiTaggingField',
            'contentAiSummaryField',
            'contentAiImageRecognitionField',
            'contentAiMaxTextField',
            'contentAiMaxFileSizeField',
            'contentAiMaxPagesField'
        ];
    },

    setContentIntelligenceEditable: function(canManage) {
        this.getContentIntelligenceFieldIds().forEach(itemId => {
            const field = this.field(itemId);
            if (field && field.setDisabled) {
                field.setDisabled(!canManage);
            }
        });
    },

    applyContentIntelligenceValues: function(payload) {
        const settings = payload && payload.settings || {};
        const provider = settings.provider || {};
        const ocr = settings.ocr || {};
        const features = settings.features || {};
        const limits = settings.limits || {};
        const workspace = payload && payload.workspace || this.getContentIntelligenceWorkspace();
        const scopeText = payload && payload.scope === 'organization'
            ? `${workspace && workspace.name || 'Organization'} (organization owner settings)`
            : `${workspace && workspace.name || 'Personal'} (workspace settings)`;

        this.setFieldValue('contentIntelligenceScopeField', scopeText);
        this.setFieldValue('contentAiEnabledField', settings.enabled === true);
        this.setFieldValue('contentAiAutoUploadsField', settings.autoProcessUploads === true);
        this.setFieldValue('contentAiProviderField', provider.type || 'local');
        this.setFieldValue('contentAiModelField', provider.model || '');
        this.setFieldValue('contentAiEndpointField', provider.endpoint || '');
        this.setFieldValue('contentAiApiKeyField', provider.apiKey || '');

        this.setFieldValue('contentAiOcrEnabledField', ocr.enabled !== false);
        this.setFieldValue('contentAiOcrProviderField', ocr.provider || 'local');
        this.setFieldValue('contentAiOcrModelField', ocr.model || '');
        this.setFieldValue('contentAiOcrEndpointField', ocr.endpoint || '');
        this.setFieldValue('contentAiOcrApiKeyField', ocr.apiKey || '');
        this.setFieldValue('contentAiOcrLanguageField', ocr.language || 'eng');
        this.setFieldValue('contentAiOcrDpiField', ocr.dpi || 220);

        this.setFieldValue('contentAiClassificationField', features.classification !== false);
        this.setFieldValue('contentAiTaggingField', features.tagging !== false);
        this.setFieldValue('contentAiSummaryField', features.summarization !== false);
        this.setFieldValue('contentAiImageRecognitionField', features.imageRecognition !== false);
        this.setFieldValue('contentAiMaxTextField', limits.maxTextChars || 40000);
        this.setFieldValue('contentAiMaxFileSizeField', limits.maxFileSizeMb || 100);
        this.setFieldValue('contentAiMaxPagesField', limits.maxPages || 12);

        this.setContentIntelligenceEditable(payload && payload.canManage === true);
    },

    collectContentIntelligenceSettings: function() {
        return {
            enabled: this.getFieldValue('contentAiEnabledField') === true,
            autoProcessUploads: this.getFieldValue('contentAiAutoUploadsField') === true,
            provider: {
                type: this.getFieldValue('contentAiProviderField') || 'local',
                model: String(this.getFieldValue('contentAiModelField') || '').trim(),
                endpoint: String(this.getFieldValue('contentAiEndpointField') || '').trim(),
                apiKey: String(this.getFieldValue('contentAiApiKeyField') || '').trim()
            },
            ocr: {
                enabled: this.getFieldValue('contentAiOcrEnabledField') === true,
                provider: this.getFieldValue('contentAiOcrProviderField') || 'local',
                model: String(this.getFieldValue('contentAiOcrModelField') || '').trim(),
                endpoint: String(this.getFieldValue('contentAiOcrEndpointField') || '').trim(),
                apiKey: String(this.getFieldValue('contentAiOcrApiKeyField') || '').trim(),
                language: String(this.getFieldValue('contentAiOcrLanguageField') || 'eng').trim() || 'eng',
                dpi: Number(this.getFieldValue('contentAiOcrDpiField')) || 220
            },
            features: {
                classification: this.getFieldValue('contentAiClassificationField') === true,
                tagging: this.getFieldValue('contentAiTaggingField') === true,
                summarization: this.getFieldValue('contentAiSummaryField') === true,
                imageRecognition: this.getFieldValue('contentAiImageRecognitionField') === true
            },
            limits: {
                maxTextChars: Number(this.getFieldValue('contentAiMaxTextField')) || 40000,
                maxFileSizeMb: Number(this.getFieldValue('contentAiMaxFileSizeField')) || 100,
                maxPages: Number(this.getFieldValue('contentAiMaxPagesField')) || 12
            }
        };
    },

    loadContentIntelligenceSettings: function(force) {
        const token = FileManagement.helpers.Functions.getToken();
        if (!token) {
            return;
        }

        FileManagement.components.utils.WorkspaceContext.load({ force: force === true }).then(() => {
            const workspaceId = this.getContentIntelligenceWorkspaceId();
            const query = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
            const tab = this.field('contentIntelligenceTab') || this;

            if (tab && tab.setLoading) {
                tab.setLoading('Loading content intelligence...');
            }

            Ext.Ajax.request({
                url: FileManagementEnv.apiUrl(`/api/content-intelligence/settings${query}`),
                method: 'GET',
                headers: {
                    Authorization: FileManagement.helpers.Functions.getAuthorizationHeader()
                },
                success: (response) => {
                    if (tab && tab.setLoading) {
                        tab.setLoading(false);
                    }

                    const payload = Ext.decode(response.responseText, true) || {};
                    if (payload.success === false) {
                        Ext.Msg.alert('Content Intelligence', payload.error || 'Failed to load content intelligence settings.');
                        return;
                    }

                    this.applyContentIntelligenceValues(payload);
                },
                failure: (response) => {
                    if (tab && tab.setLoading) {
                        tab.setLoading(false);
                    }

                    const payload = Ext.decode(response.responseText, true) || {};
                    Ext.Msg.alert('Content Intelligence', payload.error || payload.message || 'Failed to load content intelligence settings.');
                }
            });
        });
    },

    saveContentIntelligenceSettings: function(options) {
        const settings = this.collectContentIntelligenceSettings();
        const token = FileManagement.helpers.Functions.getToken();
        const saveOptions = options || {};
        const tab = this.field('contentIntelligenceTab') || this;

        if (!token) {
            return Promise.resolve({ success: true, skipped: true });
        }

        if (saveOptions.showLoading !== false && tab && tab.setLoading) {
            tab.setLoading('Saving content intelligence...');
        }

        return FileManagement.components.utils.WorkspaceContext.load({ force: saveOptions.force === true }).then(() => {
            const workspaceId = this.getContentIntelligenceWorkspaceId();
            const query = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';

            return new Promise(resolve => {
                Ext.Ajax.request({
                    url: FileManagementEnv.apiUrl(`/api/content-intelligence/settings${query}`),
                    method: 'PUT',
                    headers: {
                        Authorization: FileManagement.helpers.Functions.getAuthorizationHeader(),
                        'Content-Type': 'application/json'
                    },
                    jsonData: {
                        workspaceId,
                        settings
                    },
                    success: (response) => {
                        if (saveOptions.showLoading !== false && tab && tab.setLoading) {
                            tab.setLoading(false);
                        }

                        const payload = Ext.decode(response.responseText, true) || {};
                        if (payload.success === false) {
                            resolve({
                                success: false,
                                payload,
                                message: payload.error || 'Failed to save content intelligence settings.'
                            });
                            return;
                        }

                        this.applyContentIntelligenceValues(payload);
                        resolve({
                            success: true,
                            payload
                        });
                    },
                    failure: (response) => {
                        if (saveOptions.showLoading !== false && tab && tab.setLoading) {
                            tab.setLoading(false);
                        }

                        const payload = Ext.decode(response.responseText, true) || {};
                        resolve({
                            success: false,
                            payload,
                            message: payload.error || payload.message || 'Failed to save content intelligence settings.'
                        });
                    }
                });
            });
        }).catch(error => {
            if (saveOptions.showLoading !== false && tab && tab.setLoading) {
                tab.setLoading(false);
            }

            return {
                success: false,
                message: error && error.message || 'Failed to save content intelligence settings.'
            };
        });
    },

    saveSettings: function() {
        let settings;

        try {
            settings = this.collectSettings();
        } catch (error) {
            Ext.Msg.alert('Settings', error.message);
            return;
        }

        this.setLoading('Saving settings...');
        FileManagement.components.settings.UserSettings.saveSettings(settings, (success, savedSettings, payload) => {
            if (!success) {
                this.setLoading(false);
                Ext.Msg.alert('Settings', payload && (payload.error || payload.message) || 'Failed to save settings.');
                return;
            }

            this.saveContentIntelligenceSettings({ showLoading: false }).then(result => {
                this.setLoading(false);

                if (!result.success) {
                    Ext.Msg.alert('Settings', result.message || 'Settings were saved, but Content Intelligence settings failed to save.');
                    return;
                }

                this.applyValues(savedSettings, FileManagement.components.settings.UserSettings.user);
                Ext.Msg.alert('Settings', 'Your settings were saved.');
            });
        });
    },

    saveProfile: function() {
        const username = String(this.getFieldValue('usernameField') || '').trim();
        const email = String(this.getFieldValue('emailField') || '').trim();

        if (!username || !email) {
            Ext.Msg.alert('Profile', 'Username and email are required.');
            return;
        }

        this.setLoading('Saving profile...');
        FileManagement.components.settings.UserSettings.updateProfile({ username, email }, (success, user, payload) => {
            this.setLoading(false);

            if (!success) {
                Ext.Msg.alert('Profile', payload && (payload.error || payload.message) || 'Failed to save profile.');
                return;
            }

            this.applyValues(FileManagement.components.settings.UserSettings.getSettings(), user);
            this.refreshToolbarGreeting(user.username);
            Ext.Msg.alert('Profile', 'Profile updated.');
        });
    },

    refreshToolbarGreeting: function(username) {
        const toolbar = Ext.ComponentQuery.query('userToolbar')[0];
        const welcomeText = toolbar && toolbar.items ? toolbar.items.getAt(0) : null;
        if (welcomeText && welcomeText.setText) {
            welcomeText.setText(`Welcome, ${username}`);
        }
    },

    changePassword: function() {
        const currentPassword = String(this.getFieldValue('currentPasswordField') || '');
        const newPassword = String(this.getFieldValue('newPasswordField') || '');
        const confirmPassword = String(this.getFieldValue('confirmPasswordField') || '');

        if (!currentPassword || !newPassword) {
            Ext.Msg.alert('Password', 'Current and new password are required.');
            return;
        }

        if (newPassword !== confirmPassword) {
            Ext.Msg.alert('Password', 'New password and confirmation do not match.');
            return;
        }

        this.setLoading('Updating password...');
        FileManagement.components.settings.UserSettings.changePassword({ currentPassword, newPassword }, (success, payload) => {
            this.setLoading(false);

            if (!success) {
                Ext.Msg.alert('Password', payload && (payload.error || payload.message) || 'Failed to update password.');
                return;
            }

            ['currentPasswordField', 'newPasswordField', 'confirmPasswordField'].forEach(itemId => this.setFieldValue(itemId, ''));
            Ext.Msg.alert('Password', payload.message || 'Password updated successfully.');
        });
    },

    logoutAllSessions: function() {
        Ext.Msg.confirm('Log Out All Sessions', 'This will end every active session for your account, including this tab. Continue?', (choice) => {
            if (choice !== 'yes') {
                return;
            }

            FileManagement.components.settings.UserSettings.logoutAllSessions(() => {
                FileManagement.helpers.Functions.handleSessionExpired('All sessions were logged out.', {
                    title: 'Logged Out',
                    reason: 'logout-all'
                });
            });
        });
    }
});
