Ext.define('FileManagement.components.status.UploadRecoveryPanel', {
    extend: 'Ext.window.Window',
    xtype: 'uploadrecoverypanel',

    requires: [
        'FileManagement.components.forms.FileUploadForm',
        'FileManagement.components.utils.UploadSessionManager',
        'FileManagement.components.utils.ResponsivePanel',
        'FileManagement.components.utils.NotificationUtil'
    ],

    title: 'Interrupted Uploads',
    width: 560,
    height: 360,
    modal: false,
    mobileFloatingFill: false,
    frame: true,
    draggable: true,
    resizable: true,
    closeAction: 'hide',
    layout: {
        type: 'vbox',
        align: 'stretch'
    },

    listeners: {
        afterrender: function(panel) {
            FileManagement.components.utils.ResponsivePanel.fitFloatingPanel(panel);
            if (Ext.GlobalEvents) {
                panel.mon(Ext.GlobalEvents, 'uploadsessionchanged', panel.refreshSessionsFromStorage, panel);
            }
        },
        show: function(panel) {
            FileManagement.components.utils.ResponsivePanel.fitFloatingPanel(panel);
            panel.refreshSessionsFromStorage();
        },
        resize: function(panel) {
            if (!panel.responsiveFloatingApplying) {
                FileManagement.components.utils.ResponsivePanel.fitFloatingPanel(panel);
            }
        }
    },

    tools: [
        {
            type: 'minimize',
            tooltip: 'Minimize',
            handler: function() {
                this.up('window').hide();
            }
        }
    ],

    initComponent: function() {
        const me = this;
        me.sessions = me.sessions || [];
        me.uploadStore = Ext.create('Ext.data.Store', {
            fields: ['name', 'size', 'status', 'progress', 'sessionId'],
            data: me.buildRows()
        });

        Ext.apply(me, {
            items: [
                {
                    xtype: 'component',
                    padding: '10 10 4 10',
                    html: [
                        'Some uploads were interrupted by a page refresh. Reselect the same file(s), and the app will continue from the uploaded chunks.'
                    ].join('')
                },
                {
                    xtype: 'grid',
                    flex: 1,
                    margin: '4 10 8 10',
                    store: me.uploadStore,
                    columns: [
                        {
                            text: 'File',
                            dataIndex: 'name',
                            flex: 1
                        },
                        {
                            text: 'Size',
                            dataIndex: 'size',
                            width: 95,
                            renderer: function(value) {
                                return me.formatBytes(value);
                            }
                        },
                        {
                            text: 'Progress',
                            dataIndex: 'progress',
                            width: 90,
                            renderer: function(value) {
                                return `${Math.round(value || 0)}%`;
                            }
                        },
                        {
                            text: 'Status',
                            dataIndex: 'status',
                            width: 110
                        }
                    ]
                },
                {
                    xtype: 'filefield',
                    itemId: 'resumeFilesField',
                    fieldLabel: 'Files',
                    labelWidth: 50,
                    buttonText: 'Select Files...',
                    margin: '0 10 10 10',
                    anchor: '100%',
                    listeners: {
                        afterrender: function(filefield) {
                            filefield.fileInputEl.dom.setAttribute('multiple', 'multiple');
                        }
                    }
                }
            ],
            buttons: [
                {
                    itemId: 'resumeUploadsButton',
                    text: 'Resume Uploads',
                    iconCls: 'fa fa-play',
                    handler: function() {
                        me.resumeUploads();
                    }
                },
                {
                    itemId: 'discardUploadsButton',
                    text: 'Discard',
                    iconCls: 'fa fa-trash',
                    handler: function() {
                        me.discardUploads();
                    }
                },
                {
                    text: 'Later',
                    handler: function() {
                        me.hide();
                    }
                }
            ]
        });

        me.callParent(arguments);
    },

    loadSessions: function(sessions) {
        this.sessions = sessions || [];
        if (this.uploadStore) {
            this.uploadStore.loadData(this.buildRows());
        }
    },

    buildRows: function() {
        const rows = [];

        this.sessions.forEach(session => {
            (session.files || [])
                .filter(file => file.status !== 'complete' && file.status !== 'cancelled')
                .forEach(file => {
                    rows.push({
                        name: file.name,
                        size: file.size,
                        status: file.status || 'queued',
                        progress: file.progress || 0,
                        sessionId: session.id,
                        workspaceId: session.workspaceId || ''
                    });
                });
        });

        return rows;
    },

    resumeUploads: function() {
        const fileField = this.down('#resumeFilesField');
        const files = fileField && fileField.fileInputEl ? fileField.fileInputEl.dom.files : [];

        if (!files || !files.length) {
            Ext.Msg.alert('Select Files', 'Please reselect the interrupted file(s) first.');
            return;
        }

        const match = FileManagement.components.utils.UploadSessionManager.matchFilesToSessions(files, this.sessions);

        if (match.missingFiles.length > 0) {
            Ext.Msg.alert(
                'Missing Files',
                `Please select all interrupted files before resuming: ${match.missingFiles.map(file => file.name).join(', ')}`
            );
            return;
        }

        const uploadJobs = [];
        this.setRecoveryInProgress(true);

        match.groups.forEach(group => {
            const uploader = Ext.create('FileManagement.components.forms.FileUploadForm');
            uploadJobs.push(
                uploader.uploadFiles(group.files, {
                    folderId: group.session.folderId || '',
                    workspaceId: group.session.workspaceId || '',
                    sessionId: group.session.id,
                    recovering: true,
                    suppressSuccessNotification: true
                }).finally(() => {
                    uploader.destroy();
                })
            );
        });

        this.refreshSessionsFromStorage();

        Promise.allSettled(uploadJobs).then(() => {
            this.setRecoveryInProgress(false);
            this.refreshSessionsFromStorage();

            if (!this.uploadStore || this.uploadStore.getCount() === 0) {
                FileManagement.components.utils.NotificationUtil.showSuccess(
                    'Interrupted uploads resumed successfully.',
                    'Uploads Resumed',
                    { category: 'uploads' }
                );
                this.hide();
            }
        });
    },

    setRecoveryInProgress: function(inProgress) {
        this.resumingUploads = inProgress;

        const resumeButton = this.down('#resumeUploadsButton');
        const discardButton = this.down('#discardUploadsButton');
        const fileField = this.down('#resumeFilesField');

        if (resumeButton) {
            resumeButton.setDisabled(inProgress);
            resumeButton.setText(inProgress ? 'Resuming...' : 'Resume Uploads');
        }

        if (discardButton) {
            discardButton.setDisabled(inProgress);
        }

        if (fileField) {
            fileField.setDisabled(inProgress);
        }
    },

    refreshSessionsFromStorage: function() {
        if (this.destroyed || this.destroying) {
            return;
        }

        const manager = FileManagement.components.utils.UploadSessionManager;
        const trackedIds = (this.sessions || []).map(session => session.id);
        let sessions = manager.getRecoverableSessions();

        if (trackedIds.length) {
            sessions = sessions.filter(session => trackedIds.includes(session.id));
        }

        this.loadSessions(sessions);
    },

    discardUploads: function() {
        Ext.Msg.confirm('Discard Interrupted Uploads', 'Discard these resumable upload sessions?', (choice) => {
            if (choice !== 'yes') {
                return;
            }

            FileManagement.components.utils.UploadSessionManager.discardSessions(this.sessions);
            this.hide();
        });
    },

    formatBytes: function(bytes) {
        const value = Number(bytes) || 0;
        if (value < 1024) return `${value} B`;
        if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
        if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
        return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }
});
