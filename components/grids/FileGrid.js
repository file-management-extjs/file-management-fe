Ext.define('FileManagement.components.grids.FileGrid', {
    extend: 'Ext.grid.Panel',
    alias: 'widget.filegrid',
    requires: [
        'FileManagement.components.utils.PanelUtils',
        'FileManagement.components.utils.ResponsiveGrid',
        'FileManagement.components.utils.FileGridUtils',
        'FileManagement.components.actions.FileGridActions',
	        'FileManagement.components.utils.PasswordPromptUtil',
	        'FileManagement.components.utils.AccessTracker',
	        'FileManagement.components.utils.DecompressionUtil',
	        'FileManagement.components.utils.UploadSessionManager',
	        'FileManagement.components.utils.WorkspaceContext',
	        'FileManagement.components.status.ScanQueuePanel'
	    ],

    title: 'Files Explorer',

    frame: true,
    closable: true,

    store: 'FileManagement.components.stores.FileGridStore',

    currentFolder: '',
    currentFolderPath: [], // Store the folder path segments
    userId: null, // Store the user ID to represent the root directory
    listMode: 'files',
    sharedMode: false,
    sharedByMeMode: false,
    workspaceId: '',
    workspaceName: 'Personal',
    workspaceType: 'personal',

    draggable: {
        onMouseUp: function (e, panel) {
            FileManagement.components.utils.PanelUtils.onMouseUp(panel ?? this.panel, e, this);
        },
        onDrag: function (e, panel) {
            FileManagement.components.utils.PanelUtils.onDrag(panel ?? this.panel, e, this);
        }
    },

    resizable: {
        constrain: true, // Enable constraint within a specified element
        dynamic: true, // Updates size dynamically as resizing
        minHeight: 300,
        minWidth: 450,
    },

    listeners: {
        click: {
            element: 'el',
            fn: function () {
                FileManagement.components.utils.PanelUtils.onClick(this);
            }
        },
        destroy: function (panel) {
            // Safely close the upload panel if it exists and is visible
            const uploadForm = Ext.ComponentQuery.query('fileuploadform')[0];
            if (uploadForm && uploadForm.isVisible()) {
                uploadForm.close(); // Close the upload form if visible
            }

            // Ensure the FileGrid's reference button in the toolbar is unpressed if it exists
            if (panel.refBottomToolbarButton) {
                FileManagement.components.utils.PanelUtils.setPanelTogglePressed(panel, false);
            }

            // Remove all listeners associated with this panel to avoid lingering references
            panel.un('selectionchange', panel.onSelectionChange, panel);
            panel.un('itemcontextmenu', panel.onItemContextMenu, panel);
            panel.un('itemdblclick', panel.onFileDoubleClick, panel);
            panel.unbindCheckboxSelectionHandlers();

            // Perform any additional cleanup needed
            FileManagement.components.utils.PanelUtils.destroy(panel);
        },
        afterrender: function (panel) {
            // Ensure absolute positioning for free dragging
            const el = panel.getEl();
            if (el) {
                el.setStyle('position', 'absolute');
            }

            panel.bindCheckboxSelectionHandlers();
            panel.applyResponsiveColumns();
        },
        resize: function (panel) {
            panel.applyResponsiveColumns();
        }
    },

    header: {
        listeners: {
            dblclick: function (header) {
                const panel = header.up('panel');
                FileManagement.components.utils.PanelUtils.toggleMaximize(panel);
            }
        }
    },

    width: 600, // Set a fixed width
    height: 400, // Set a fixed height

    // Enable multi-selection
    selModel: {
        selType: 'checkboxmodel', // Use checkbox selection model
        mode: 'MULTI', // Allow multiple selections
        allowDeselect: true
    },

    tools: [
        {
            type: 'minimize',
            tooltip: 'Minimize to toolbar',
            handler: function () {
                FileManagement.components.utils.PanelUtils.minimizeToTaskbar(this.up('panel'));
            }
        },
        {
            type: 'maximize',
            itemId: 'maximizeTool',
            tooltip: 'Maximize',
            handler: function () {
                const panel = this.up('panel'); // Correctly reference the panel
                if (panel && !panel.maximized) {
                    FileManagement.components.utils.PanelUtils.maximizePanel(panel);
                } else if (panel) {
                    FileManagement.components.utils.PanelUtils.minimizePanel(panel);
                }
            }
        }
    ],

    // Define the columns for the grid
    columns: [
        {
            text: 'Name',
            dataIndex: 'name',
            flex: 1,
            renderer: function (value, metaData, record) {
                const iconCls = record.get('icon');
                const operationStatus = record.get('rowOperationStatus');
                const operationType = record.get('rowOperationType');
                const operationIconCls = operationType === 'scan'
                    ? 'fa fa-shield'
                    : 'fa fa-upload';
                const placeholderStatus = record.get('isUploadPlaceholder') && operationStatus
                    ? [
                        ` <span class="file-grid-operation-status file-grid-operation-status-${Ext.String.htmlEncode(operationType || 'upload')}">`,
                        `<i class="${operationIconCls}"></i> `,
                        Ext.String.htmlEncode(operationStatus),
                        '</span>'
                    ].join('')
                    : '';
                const sharedBy = record.get('isShared') && record.get('sharedBy')
                    ? ` <span style="color:#666;">(shared by ${Ext.String.htmlEncode(record.get('sharedBy'))})</span>`
                    : '';
                const deletedStatus = record.get('itemDeleted')
                    ? ' <span style="color:#a35b00;font-weight:bold;">(deleted item)</span>'
                    : '';
                let sharedIcon = '';

                if (record.get('isSharedByMe')) {
                    const sharedWith = Ext.String.htmlEncode(record.get('sharedWithList') || record.get('sharedWith') || 'Shared by me');
                    const tip = `<div class="shared-item-tip"><strong>Shared with</strong><span>${sharedWith}</span></div>`;
                    sharedIcon = ` <i class="fa fa-share-nodes blue-icon shared-item-icon" data-qwidth="220" data-qclass="shared-item-quicktip" data-qtip="${Ext.String.htmlEncode(tip)}"></i>`;
                }

                return `<i class="${iconCls}" style="margin-right: 5px;"></i> ${Ext.String.htmlEncode(value)}${placeholderStatus}${sharedBy}${deletedStatus}${sharedIcon}`;
            }
        },
        {
            text: 'Type',
            itemId: 'typeColumn',
            dataIndex: 'type',
            width: 100,
            renderer: function (value) {
                return value || 'Unknown';
            }
        },
        {
            text: 'Size',
            itemId: 'sizeColumn',
            dataIndex: 'size',
            flex: 1,
            renderer: function (value) {
                if (value < 1024) return `${value} Bytes`;
                else if (value < 1024 * 1024) return `${(value / 1024).toFixed(2)} KB`;
                else if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(2)} MB`;
                return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
            }
        },
        {
            text: 'Upload Date',
            itemId: 'uploadDateColumn',
            dataIndex: 'createdAt',
            width: 150,
            renderer: Ext.util.Format.dateRenderer('Y-m-d H:i:s')
        },
        {
            text: 'Shared With',
            itemId: 'sharedWithColumn',
            dataIndex: 'sharedWith',
            width: 190,
            hidden: true,
            renderer: function (value) {
                return Ext.String.htmlEncode(value || '');
            }
        },
        {
            text: 'Permission',
            itemId: 'permissionColumn',
            dataIndex: 'permission',
            width: 110,
            hidden: true,
            renderer: function (value) {
                return value === 'view' ? 'View only' : 'View and download';
            }
        },
        {
            text: 'Status',
            itemId: 'shareStatusColumn',
            dataIndex: 'shareStatus',
            width: 95,
            hidden: true,
            renderer: function (value) {
                const status = value || 'Active';
                const color = status === 'Expired' ? '#a35b00' : '#2c6d2f';
                return `<span style="color:${color};font-weight:bold;">${Ext.String.htmlEncode(status)}</span>`;
            }
        },
        {
            text: 'Shared Date',
            itemId: 'sharedAtColumn',
            dataIndex: 'sharedAt',
            width: 150,
            hidden: true,
            renderer: Ext.util.Format.dateRenderer('Y-m-d H:i:s')
        },
        {
            text: 'Expires',
            itemId: 'expiresAtColumn',
            dataIndex: 'expiresAt',
            width: 150,
            hidden: true,
            renderer: function(value) {
                if (!value) {
                    return 'Never';
                }

                return Ext.util.Format.date(value, 'Y-m-d H:i:s');
            }
        }
    ],

    // Add grouping feature to the grid
    features: [{
        ftype: 'grouping',
        groupHeaderTpl: [
            '{name:this.formatGroup}',
            {
                formatGroup: function (name) {
                    // Remove any userId from the group name
                    const cleanPath = name.replace(/\/[0-9a-f]{24}\/?/gi, '/');
                    return cleanPath === '/' ? 'Root Directory' : 'Directory: ' + cleanPath;
                }
            }
        ],
        startCollapsed: false,
        // Only show grouping when searching
        hideGroupedHeader: true,
        enableGroupingMenu: false
    }],

    viewConfig: {
        getRowClass: function (record) {
            const classes = [];
            const operationType = record.get('rowOperationType');

            if (operationType) {
                classes.push('file-grid-operation-row');
                classes.push(`file-grid-operation-row-${operationType}`);
            }

            if (record.get('isUploadPlaceholder')) {
                classes.push('file-grid-upload-placeholder-row');
            }

            return classes.join(' ');
        },
        plugins: {
            ptype: 'gridviewdragdrop',
            dragText: 'Drag and drop to move'
        },
        listeners: {
            drop: function (node, data, overModel, dropPosition, eOpts) {
                // Check if the target is a folder
                if (overModel.get('isFolder') || overModel.get('mimetype').includes('zip')) {
                    const draggedRecords = data.records;
                    const targetId = overModel.get('id');

                    // Call the moveItem function for each dragged record
                    // draggedRecords.forEach(record => {
                    //     this.up('filegrid').moveItem(record, targetFolderId);
                    // });

                    this.up('filegrid').moveItem(draggedRecords, overModel);
                } else {
                    Ext.Msg.alert('Invalid Drop', 'You can only drop items inside a folder or archives.');
                }
            }
        }
    },

    // Main toolbar with action buttons
    tbar: {
        xtype: 'toolbar',
        enableOverflow: true,
        cls: 'file-grid-action-toolbar',
        items: [
            {
                text: 'Share',
                iconCls: 'fa fa-duotone fa-solid fa-share-nodes',
                itemId: 'shareItemButton',
                disabled: true,
                handler: function () {
                    const grid = this.up('grid');
                    FileManagement.components.actions.FileGridActions.onShareItem(grid);
                }
            },
            {
                text: 'Revoke Share',
                iconCls: 'fa fa-user-slash red-icon',
                itemId: 'revokeShareButton',
                hidden: true,
                disabled: true,
                handler: function () {
                    const grid = this.up('grid');
                    FileManagement.components.actions.FileGridActions.onRevokeShares(grid);
                }
            },
            {
                xtype: 'tbseparator',
                itemId: 'selectionActionSeparator'
            },
            {
                text: 'Move Selected',
                iconCls: 'fa fa-arrows-alt',
                itemId: 'moveItemsButton',
                disabled: true,
                handler: function () {
                    const grid = this.up('grid');
                    grid.moveItemsHandler(arguments);
                }
            },
            {
                text: 'Download',
                iconCls: 'fa fa-download',
                itemId: 'downloadButton',
                disabled: true,
                handler: async function () {
                    const grid = this.up('gridpanel');
                    const selection = grid.getSelectionModel().getSelection();

                    if (selection.length === 0) {
                        Ext.Msg.alert('Error', 'Please select at least one file to download.');
                        return;
                    }

                    const token = FileManagement.helpers.Functions.getToken();

                    if (selection.length === 1 && !selection[0].get('isFolder')) {
                        const file = selection[0];
                        const fileName = file.get('name');
                        const chunkSize = 2 * 1024 * 1024;

                        await grid.downloadFileInChunks({
                            fileId: file.get('id'),
                            filePath: file.get('path'),
                            workspaceId: file.get('workspaceId') || grid.getWorkspaceId()
                        }, fileName, token, chunkSize);
                    } else {
                        Ext.Msg.prompt('Zip File Name', 'Enter the name of the zip file:', async function (btn, zipFileName) {
                            if (btn === 'ok' && zipFileName) {
	                                const selectedItems = selection.map(record => record.get('id'));
	                                const affectedItems = selection.map(record => ({
	                                    name: record.get('name'),
	                                    size: record.get('size') || null,
	                                    type: record.get('type') || '',
	                                    path: record.get('path') || ''
	                                }));
	                                const progressId = `compression-download-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	                                zipFileName = zipFileName.endsWith('.zip') ? zipFileName : `${zipFileName}.zip`;

	                                FileManagement.components.utils.ProgressBarManager.addProgressBar(
	                                    progressId,
	                                    `Compressing ${zipFileName}`,
	                                    affectedItems.map(item => Ext.apply({ status: 'Queued' }, item)),
                                    function (progressBar) {
                                        return fetch(FileManagementEnv.apiUrl('/api/files/stop-compression'), {
                                            method: 'POST',
                                            headers: {
                                                'Authorization': `Bearer ${token}`,
                                                'Content-Type': 'application/json',
                                            },
                                            body: JSON.stringify({
                                                jobId: progressBar.jobId,
                                                progressId
                                            })
                                        }).then(response => response.json()).then(result => {
                                            if (!result.success) {
                                                throw new Error(result.error || 'Failed to stop compression');
                                            }
                                        }).catch((error) => {
                                            Ext.Msg.alert('Error', `Failed to cancel compression: ${error.message}`);
                                            throw error;
                                        });
                                    },
                                    {
                                        onComplete: async function (data) {
                                            grid.getStore().reload();

                                            if (!data.file || !data.file.path) {
                                                Ext.Msg.alert('Error', 'Archive completed, but no downloadable file was returned.');
                                                return;
                                            }

                                            try {
                                                await grid.downloadFileInChunks(
                                                    {
                                                        fileId: data.file.id || data.file._id,
                                                        filePath: data.file.path
                                                    },
                                                    data.file.name || zipFileName,
                                                    token,
                                                    2 * 1024 * 1024
                                                );
                                            } catch (downloadError) {
                                                if (downloadError.name !== 'AbortError') {
                                                    Ext.Msg.alert('Error', `Failed to download ZIP: ${downloadError.message}`);
                                                }
                                            }
                                        }
                                    }
                                );

                                try {
                                    const response = await fetch(FileManagementEnv.apiUrl('/api/files/compress'), {
                                        method: 'POST',
                                        headers: {
                                            'Authorization': `Bearer ${token}`,
                                            'Content-Type': 'application/json',
                                        },
                                        body: JSON.stringify({
                                            items: selectedItems,
                                            zipFileName,
                                            folder: grid.currentFolder,
	                                            parentId: grid.currentFolderId,
	                                            archiveType: 'zip',
	                                            compressionLevel: 6,
	                                            progressId,
	                                            affectedItems,
                                                workspaceId: grid.getWorkspaceId()
	                                        })
	                                    });

                                    if (!response.ok) {
                                        throw new Error('Failed to create ZIP file.');
                                    }

                                    const result = await response.json();
                                    if (!result.success) {
                                        throw new Error(result.error || 'Failed to create ZIP file.');
                                    }

                                    FileManagement.components.utils.ProgressBarManager.setJobId(progressId, result.jobId);
                                } catch (error) {
                                    FileManagement.components.utils.ProgressBarManager.removeProgressBar(progressId);
                                    console.error('Error during compression:', error);
                                    Ext.Msg.alert('Error', `Failed to download ZIP: ${error.message}`);
                                }
                            }
                        });
                    }
                }
            },
            {
                text: 'Compress Selected',
                iconCls: 'fa fa-compress',
                itemId: 'compressButton',
                disabled: true,
                handler: function () {
                    const grid = this.up('grid');
                    grid.onCompressSelectedFiles(grid);
                }
            },
            {
                text: 'PDF Studio',
                iconCls: 'fa fa-file-pdf red-icon',
                itemId: 'pdfStudioButton',
                disabled: true,
                handler: function () {
                    const grid = this.up('grid');
                    FileManagement.components.actions.FileGridActions.onPDFStudio(grid);
                }
            },
            {
                text: 'Media Hub',
                iconCls: 'fa fa-film',
                itemId: 'mediaConversionButton',
                disabled: true,
                handler: function () {
                    const grid = this.up('grid');
                    FileManagement.components.actions.FileGridActions.onMediaConversionHub(grid);
                }
            },
            {
                text: 'Document Suite',
                iconCls: 'fa fa-file-export',
                itemId: 'documentConversionButton',
                disabled: true,
                handler: function () {
                    const grid = this.up('grid');
                    FileManagement.components.actions.FileGridActions.onDocumentConversionSuite(grid);
                }
            },
            {
                text: 'Content AI',
                iconCls: 'fa fa-brain',
                itemId: 'contentIntelligenceButton',
                disabled: true,
                handler: function () {
                    const grid = this.up('grid');
                    FileManagement.components.actions.FileGridActions.onContentIntelligence(grid);
                }
            }
        ]
    },

    // Sub toolbar with file management
    dockedItems: [{
        xtype: 'toolbar',
        dock: 'top',
        cls: 'sub-toolbar',
        enableOverflow: true,
        items: [
            {
                xtype: 'textfield',
                emptyText: 'Search files and content...',
                width: 200,
                itemId: 'searchField',
                enableKeyEvents: true,
                triggers: {
                    clear: {
                        cls: 'x-form-clear-trigger',
                        weight: 1,
                        hidden: true,
                        handler: function (field) {
                            field.setValue('');
                            const grid = field.up('gridpanel');
                            const store = grid.getStore();
                            store.getProxy().setExtraParams(grid.buildStoreParams());
                            store.load();
                            field.getTrigger('clear').hide();
                        }
                    }
                },
                listeners: {
                    change: function (field, newValue) {
                        const clearTrigger = field.getTrigger('clear');
                        if (newValue) {
                            clearTrigger.show();
                        } else {
                            clearTrigger.hide();
                        }
                    },
                    buffer: 300,
                    keyup: function (field) {
                        const value = field.getValue();
                        const grid = field.up('gridpanel');
                        const store = grid.getStore();

                        if (value) {
                            store.getProxy().setExtraParams(grid.buildStoreParams({ search: value }));
                        } else {
                            store.getProxy().setExtraParams(grid.buildStoreParams());
                        }
                        store.load();
                    },
                    specialkey: function (field, e) {
                        if (e.getKey() === e.ESC) {
                            field.setValue('');
                            const grid = field.up('gridpanel');
                            const store = grid.getStore();
                            store.getProxy().setExtraParams(grid.buildStoreParams());
                            store.load();
                        }
                    }
                }
            },
            {
                text: 'Go Up',
                iconCls: 'fa fa-level-up',
                itemId: 'goUpButton',
                disabled: true,
                handler: function () {
                    const grid = this.up('grid');
                    grid.navigateUp();
                }
            },
            {
                xtype: 'tbseparator',
                itemId: 'fileManagementSeparator'
            },
            {
                text: 'Reload',
                iconCls: 'fa fa-refresh',
                handler: function () {
                    const grid = this.up('grid');
                    grid.getStore().reload();
                }
            },
            {
                text: 'Delete Selected',
                iconCls: 'fa fa-trash red-icon',
                handler: function () {
                    var grid = this.up('grid');
                    FileManagement.components.actions.FileGridActions.onDeleteFiles(grid);
                },
                disabled: true,
                itemId: 'deleteButton'
            },
            {
                text: 'Upload',
                itemId: 'uploadButton',
                iconCls: 'fa fa-upload',
                handler: function () {
                    const mainPanelRegion = Ext.getCmp('mainPanelRegion');
                    let uploadForm = Ext.ComponentQuery.query('fileuploadform')[0];

                    if (!uploadForm) {
                        uploadForm = Ext.create('FileManagement.components.forms.FileUploadForm', {
                            targetGrid: this.up('grid')
                        });
                        mainPanelRegion.add(uploadForm);
                    } else {
                        uploadForm.targetGrid = this.up('grid');
                        uploadForm.setVisible(!uploadForm.isVisible());
                    }

                    if (uploadForm.isVisible()) {
                        const uploadFormZIndex = parseInt(this.getEl().getStyle('z-index'), 10) + 1 || 1000;
                        uploadForm.getEl().setStyle('z-index', uploadFormZIndex);
                    }

                    const navPanel = Ext.ComponentQuery.query('navigationpanel')[0];
                    if (navPanel) navPanel.refreshPanelList();
                }
            },
            {
                text: 'New Folder',
                itemId: 'newFolderButton',
                iconCls: 'fa fa-folder',
                handler: function () {
                    Ext.Msg.prompt('New Folder', 'Enter folder name:', function (btn, folderName) {
                        if (btn === 'ok' && folderName) {
                            const parentFolderId = this.up('grid').currentFolderId || null;

                            Ext.Ajax.request({
                                url: FileManagementEnv.apiUrl('/api/files/create-folder'),
                                method: 'POST',
                                jsonData: {
                                    name: folderName,
                                    parentId: parentFolderId,
                                    workspaceId: this.up('grid').getWorkspaceId()
                                },
                                success: function (response) {
                                    Ext.Msg.alert('Success', 'Folder created successfully.');
                                    const store = this.up('grid').getStore();
                                    if (store) {
                                        store.reload();
                                    }
                                    FileManagement.components.utils.PanelUtils.refreshHomeDashboard();
                                },
                                failure: function (response) {
                                    let error = JSON.parse(response.responseText).message;
                                    Ext.Msg.alert('Error', error ?? 'Failed to create folder');
                                },
                                scope: this
                            });
                        }
                    }, this);
                }
            }
        ]
    }],

    // Initialize the component
    initComponent: function () {
        var me = this;
        me.applyWorkspaceContext({ skipLoad: true, preserveFolder: true });

        // Create items count text
        me.itemsCountText = '0 items';
        me.currentFolderSizeText = 'Total size: 0 Bytes';
        me.downloadOperationStates = me.downloadOperationStates || {};
        me.uploadPlaceholderStates = me.uploadPlaceholderStates || {};
        me.rowOperationLayerUpdateTask = null;

        // Add listener for store data changes
        me.on('afterrender', function () {
            const store = me.getStore();
            if (!store) {
                return;
            }

            me.mon(store, 'datachanged', me.updateFooterStats, me);
            me.mon(store, 'datachanged', me.scheduleRowOperationLayerUpdate, me);
	            me.mon(store, 'load', me.restoreOperationRows, me);
	            if (Ext.GlobalEvents) {
	                me.mon(Ext.GlobalEvents, 'uploadsessionchanged', me.restoreOperationRows, me);
	                me.mon(Ext.GlobalEvents, 'scanqueuechanged', me.restoreOperationRows, me);
	                me.mon(Ext.GlobalEvents, 'backgroundactivityrestored', me.restoreOperationRows, me);
	            }
	            me.updateFooterStats();
            me.bindRowOperationLayer();
            me.hydrateOperationRowsAfterRender();
        });

        me.on('continueDecompression', (decision, zipFilePath, folderName, parentId) => {
            // debugger;

            // Notify the server about the user's decision
            const token = FileManagement.helpers.Functions.getToken();

            Ext.Ajax.request({
                url: FileManagementEnv.apiUrl('/api/files/decompress'),
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                jsonData: {
                    decision: decision, // Send the user's decision back to the server
                    filePath: zipFilePath,
                    targetFolder: folderName,
                    merge: decision,
                    parent_id: parentId,
                    workspaceId: me.getWorkspaceId()
                },
                success: function (response) {
                    // debugger;
                    const result = Ext.decode(response.responseText);
                    if (result.conflict) {
                        me.fireEvent('continueDecompression', result.conflict.decision, zipFilePath, folderName, parentId);
                    }
                },
                failure: function (response) {
                    // debugger;
                    console.error('Failed to notify the server of the decision:', response);
                    Ext.Msg.alert('Error', 'An error occurred while processing your decision. Retrying...');

                    // Retry logic
                    setTimeout(() => {
                        me.fireEvent('continueDecompression', decision, zipFilePath, folderName, parentId); // Retry firing the event
                    }, 2000);
                }
            });
        });

        // Create the context menu
        me.contextMenu = Ext.create('Ext.menu.Menu', {
            items: [
                {
                    text: 'View',
                    iconCls: 'fa fa-eye',
                    itemId: 'viewMenuItem',
                    hidden: true, // Initially hidden; shown only for files
                    handler: function () {
                        me.onViewFile();
                    }
                },
                {
                    text: 'Open',
                    iconCls: 'fa fa-folder-open',
                    itemId: 'openMenuItem',
                    hidden: true, // Initially hidden; shown only for folders
                    handler: function (menuItem, e) {
                        me.onOpenFolder();
                    }
                },
                {
                    text: 'Share',
                    iconCls: 'fa fa-share-nodes',
                    itemId: 'shareMenuItem',
                    handler: function () {
                        FileManagement.components.actions.FileGridActions.onShareItem(me);
                    }
                },
                {
                    text: 'Revoke Share',
                    iconCls: 'fa fa-user-slash red-icon',
                    itemId: 'revokeShareMenuItem',
                    hidden: true,
                    handler: function () {
                        FileManagement.components.actions.FileGridActions.onRevokeShares(me);
                    }
                },
                {
                    text: 'Delete',
                    iconCls: 'fa fa-trash red-icon', // Add the custom class here
                    itemId: 'deleteMenuItem',
                    handler: function () {
                        me.onDeleteFiles(); // Call the new delete function
                    }
                },
                {
                    text: 'Rename',
                    iconCls: 'fa fa-pen', // Add the custom class here
                    itemId: 'renameMenuItem',
                    handler: function () {
                        me.onRenameFile(); // Call the new delete function
                    }
                },
                {
                    text: 'Move Item',
                    iconCls: 'fa fa-arrows-alt',
                    itemId: 'moveMenuItem',
                    handler: function () {
                        me.moveItemsHandler();
                    }
                },
                {
                    text: 'Scan for viruses',
                    iconCls: 'fa fa-shield',
                    itemId: 'scanVirusMenuItem',
                    hidden: true,
                    handler: function () {
                        FileManagement.components.actions.FileGridActions.onRequestVirusScan(me);
                    }
                },
                {
                    text: 'Set Password',
                    iconCls: 'fa fa-lock',
                    itemId: 'setPasswordMenuItem',
                    handler: function (item) {
                        const record = me.getSelectionModel().getSelection()[0];
                        if (record) {
                            Ext.create('FileManagement.components.dialogs.SetPasswordDialog', {
                                itemId: record.get('id'),
                                itemName: record.get('name'),
                                isFolder: record.get('isFolder'),
                                onSuccess: function () {
                                    me.getStore().reload();
                                }
                            }).show();
                        }
                    }
                },
                {
                    text: 'Remove Password',
                    itemId: 'removePasswordMenuItem',
                    iconCls: 'fa fa-unlock',
                    hidden: true,
                    handler: function (item) {
                        const record = me.getSelectionModel().getSelection()[0];
                        if (record && record.get('isPasswordProtected')) {
                            FileManagement.components.utils.PasswordPromptUtil.showPasswordPrompt({
                                itemId: record.get('id'),
                                isFolder: record.get('isFolder'),
                                action: 'removePassword',
                                onSuccess: function (password) {
                                    // Remove password after verification
                                    const token = FileManagement.helpers.Functions.getToken();
                                    Ext.Ajax.request({
                                        url: FileManagementEnv.apiUrl('/api/files/password/remove'),
                                        method: 'POST',
                                        headers: {
                                            'Authorization': `Bearer ${token}`
                                        },
                                        jsonData: {
                                            itemId: record.get('id'),
                                            currentPassword: password,  // Password from the prompt
                                            isFolder: record.get('isFolder')
                                        },
                                        success: function (response) {
                                            me.getStore().reload();
                                            Ext.Msg.alert('Success', 'Password removed successfully.');
                                        },
                                        failure: function (response) {
                                            Ext.Msg.alert('Error', 'Failed to remove password.');
                                        }
                                    });
                                }
                            });
                        }
                    }
                },
                {
                    text: 'Actions',
                    itemId: 'actionsMenu',
                    menu: {
                        items: [
                            {
                                text: 'Decompress',
                                itemId: 'decompressMenuItem',
                                iconCls: 'fa fa-file-archive',
                                hidden: true,
                                handler: function () {
                                    const grid = this;
                                    const selection = grid.getSelectionModel().getSelection();
                                    const zipFile = selection[0];
                                    const token = FileManagement.helpers.Functions.getToken(); // Get the token for authorization

                                    if (zipFile && zipFile.get('mimetype') === 'application/zip') {
                                        const proceedWithDecompress = () => {
                                            FileManagement.components.utils.DecompressionUtil.showDecompressDialog({
                                                file: zipFile,
                                                currentFolder: this.currentFolder,
                                                parentId: this.currentFolderId,
                                                onSuccess: function () {
                                                    grid.getStore().reload();
                                                }
                                            });
                                        };

                                        // Check if archive is password protected
                                        if (zipFile.get('isPasswordProtected')) {
                                            FileManagement.components.utils.PasswordPromptUtil.showPasswordPrompt({
                                                itemId: zipFile.get('id'),
                                                isFolder: false,
                                                onSuccess: function () {
                                                    proceedWithDecompress();
                                                }
                                            });
                                        } else {
                                            proceedWithDecompress();
                                        }
                                    }
                                },
                                scope: this
                            },
                            {
                                text: 'PDF Studio',
                                itemId: 'pdfStudioMenuItem',
                                iconCls: 'fa fa-file-pdf red-icon',
                                handler: function () {
                                    FileManagement.components.actions.FileGridActions.onPDFStudio(me);
                                }
                            },
                            {
                                text: 'Media Conversion Hub',
                                itemId: 'mediaConversionMenuItem',
                                iconCls: 'fa fa-film',
                                handler: function () {
                                    FileManagement.components.actions.FileGridActions.onMediaConversionHub(me);
                                }
                            },
                            {
                                text: 'Document Conversion Suite',
                                itemId: 'documentConversionMenuItem',
                                iconCls: 'fa fa-file-export',
                                handler: function () {
                                    FileManagement.components.actions.FileGridActions.onDocumentConversionSuite(me);
                                }
                            },
                            {
                                text: 'Extract Content Intelligence',
                                itemId: 'contentIntelligenceMenuItem',
                                iconCls: 'fa fa-brain',
                                handler: function () {
                                    FileManagement.components.actions.FileGridActions.onContentIntelligence(me);
                                }
                            }
                        ]
                    },
                }
            ],
            listeners: {
                show: function (menu, e) {
                    const viewMenuItem = menu.down('#viewMenuItem');
                    const openMenuItem = menu.down('#openMenuItem');
                    const grid = me;
                    const selection = grid.getSelectionModel().getSelection();
                    const decompressMenuItem = menu.down('#decompressMenuItem');
                    const actionsMenu = menu.down('#actionsMenu');
                    const removePasswordMenuItem = menu.down('#removePasswordMenuItem');
                    const revokeShareMenuItem = menu.down('#revokeShareMenuItem');
                    const pdfStudioMenuItem = menu.down('#pdfStudioMenuItem');
                    const mediaConversionMenuItem = menu.down('#mediaConversionMenuItem');
                    const documentConversionMenuItem = menu.down('#documentConversionMenuItem');
                    const contentIntelligenceMenuItem = menu.down('#contentIntelligenceMenuItem');
                    const scanVirusMenuItem = menu.down('#scanVirusMenuItem');
                    const hasSharedSelection = selection.some(record => record.get('isShared'));
                    const hasUpDirectory = selection.some(record => record.get('isUpDirectory'));
                    const hasUploadPlaceholder = selection.some(record => record.get('isUploadPlaceholder'));
                    const hasFolderSelection = selection.some(record => record.get('isFolder'));
                    const ownerOnlyDisabled = hasSharedSelection || hasUpDirectory || hasUploadPlaceholder || grid.sharedMode || grid.sharedByMeMode;
                    const hasRevocableShareSelection = grid.hasRevocableShareSelection(selection);

                    // Reset visibility
                    viewMenuItem.setHidden(true);
                    openMenuItem.setHidden(true);

                    // Show "View" only if exactly one file is selected
                    if (selection.length === 1 && !selection[0].get('isFolder') && !selection[0].get('isUploadPlaceholder')) {
                        viewMenuItem.setHidden(false);
                    }

                    // Show "Open" only if exactly one folder is selected
                    if (selection.length === 1 && selection[0].get('isFolder')) {
                        openMenuItem.setHidden(false);
                    }

                    // Show "Decompress" only if exactly one item is selected and it is a zip file
                    const shouldShowDecompress = selection.length === 1 && selection[0].get('mimetype') === 'application/zip';
                    decompressMenuItem.setHidden(!shouldShowDecompress || ownerOnlyDisabled);

                    const shouldShowPdfStudio = grid.hasPdfStudioSelection(selection) && !hasFolderSelection && !ownerOnlyDisabled;
                    pdfStudioMenuItem.setHidden(!shouldShowPdfStudio);
                    pdfStudioMenuItem.setDisabled(!shouldShowPdfStudio);

                    const shouldShowMediaConversion = selection.length === 1 && grid.isMediaConversionRecord(selection[0]) && !ownerOnlyDisabled;
                    mediaConversionMenuItem.setHidden(!shouldShowMediaConversion);
                    mediaConversionMenuItem.setDisabled(!shouldShowMediaConversion);

                    const shouldShowDocumentConversion = grid.hasDocumentConversionSelection(selection) && !hasFolderSelection && !ownerOnlyDisabled;
                    documentConversionMenuItem.setHidden(!shouldShowDocumentConversion);
                    documentConversionMenuItem.setDisabled(!shouldShowDocumentConversion);

                    const shouldShowContentIntelligence = selection.length === 1 &&
                        grid.isContentIntelligenceRecord(selection[0]) &&
                        !ownerOnlyDisabled;
                    contentIntelligenceMenuItem.setHidden(!shouldShowContentIntelligence);
                    contentIntelligenceMenuItem.setDisabled(!shouldShowContentIntelligence);

                    const shouldShowScanVirus = grid.sharedMode &&
                        selection.length === 1 &&
                        !selection[0].get('isFolder') &&
                        !selection[0].get('isUpDirectory');
                    scanVirusMenuItem.setHidden(!shouldShowScanVirus);
                    scanVirusMenuItem.setDisabled(!shouldShowScanVirus);

                    // Check if any items in the "Actions" menu are visible
                    const actionsVisible = actionsMenu.menu.items.items.filter(item => !item.hidden);
                    actionsMenu.setHidden(!actionsVisible.length);

                    const renameMenuItem = menu.down('#renameMenuItem');
                    renameMenuItem.setDisabled(selection.length !== 1 || ownerOnlyDisabled);

                    const deleteMenuItem = menu.down('#deleteMenuItem');
                    deleteMenuItem.setDisabled(selection.length === 0 || ownerOnlyDisabled);

                    const moveMenuItem = menu.down('#moveMenuItem');
                    moveMenuItem.setDisabled(selection.length === 0 || ownerOnlyDisabled);

                    const shareMenuItem = menu.down('#shareMenuItem');
                    shareMenuItem.setHidden(grid.sharedMode || grid.sharedByMeMode);
                    shareMenuItem.setDisabled(selection.length !== 1 || ownerOnlyDisabled);

                    revokeShareMenuItem.setHidden(!hasRevocableShareSelection);
                    revokeShareMenuItem.setDisabled(!hasRevocableShareSelection);

                    const setPasswordMenuItem = menu.down('#setPasswordMenuItem');
                    setPasswordMenuItem.setHidden(selection.length !== 1 || selection[0].get('isPasswordProtected') || ownerOnlyDisabled);

                    removePasswordMenuItem.setHidden(selection.length !== 1 || !selection[0].get('isPasswordProtected') || ownerOnlyDisabled);

                    return true;
                },
            }
        });

        // Add the bottom toolbar (bbar) to display the breadcrumb navigation
        Ext.apply(me, {
            bbar: {
                overflowHandler: 'scroller',
                items: [
                    {
                        xtype: 'tbtext',
                        itemId: 'itemsCount',
                        text: me.itemsCountText
                    },
                    {
                        xtype: 'tbseparator'
                    },
                    {
                        xtype: 'tbtext',
                        text: 'Path: '
                    },
                    {
                        xtype: 'container',
                        itemId: 'breadcrumbScrollContainer',
                        flex: 1,
                        minWidth: 120,
                        cls: 'file-grid-breadcrumb-scroll-container',
                        style: {
                            overflowX: 'auto',
                            overflowY: 'hidden'
                        },
                        layout: 'auto',
                        listeners: {
                            afterrender: function (component) {
                                me.bindBreadcrumbScroll(component);
                                me.syncBreadcrumbScroll();
                            },
                            resize: function () {
                                me.syncBreadcrumbScroll();
                            }
                        },
                        items: [
                            {
                                xtype: 'toolbar',
                                itemId: 'breadcrumbToolbar',
                                cls: 'file-grid-breadcrumb-toolbar',
                                border: 0,
                                items: []
                            }
                        ]
                    },
                    {
                        xtype: 'tbseparator'
                    },
                    {
                        xtype: 'tbtext',
                        itemId: 'currentFolderSize',
                        text: me.currentFolderSizeText,
                        style: {
                            whiteSpace: 'nowrap'
                        }
                    }
                ]
            }
        });

        me.callParent(arguments);
        me.configureSelectionModel();
        me.itemsCountComponent = me.down('#itemsCount');
        me.currentFolderSizeComponent = me.down('#currentFolderSize');

        me.on('afterrender', function () {
            FileManagement.components.utils.WorkspaceContext.load().then(function() {
                if (!me.destroyed && !me.destroying) {
                    me.applyWorkspaceContext({ skipLoad: true, preserveFolder: true });
                    me.loadFiles();
                }
            });
        });

        // Add selection change listener to enable/disable the delete button
        me.getSelectionModel().on('selectionchange', function (selModel, selected) {
            me.updateSelectionActions(selected);
        });

        me.on('beforeitemmousedown', function (view, record, item, index, e) {
            if (!e || !e.shiftKey || me.isCheckboxSelectionTarget(e.getTarget())) {
                return;
            }

            e.stopEvent();
            me.selectRangeFromAnchor(record);
            return false;
        });

        me.on('itemclick', function (view, record, item, index, e) {
            if (!e || e.shiftKey || me.isCheckboxSelectionTarget(e.getTarget())) {
                return;
            }

            me.setSelectionRangeAnchor(record);
        });

        // Add context menu listener
        me.on('itemcontextmenu', function (view, record, item, index, e) {
            e.stopEvent(); // Prevent the default context menu
            me.contextMenu.showAt(e.getXY()); // Show the context menu at the mouse position
        });

        // Add double-click listener to open the file viewer
        me.on('itemdblclick', function (view, record) {
            me.onFileDoubleClick(record);
        });


        me.updateBreadcrumb([]);
    },

    // Handler for "View" option (for files)
    onViewFile: function (record) {
        FileManagement.components.actions.FileGridActions.onViewFile(this, record);
    },

    // Handler for "Open" option (for folders)
    onOpenFolder: function (record) {
        FileManagement.components.actions.FileGridActions.onOpenFolder(this, record);
    },

    // Method to update the breadcrumb based on the current folder path
    updateBreadcrumb: function (pathSegments) {
        if (this.destroyed || this.destroying || !this.items) {
            return;
        }

        const breadcrumbToolbar = this.down('#breadcrumbToolbar');
        if (!breadcrumbToolbar) {
            return;
        }

        breadcrumbToolbar.removeAll();

        breadcrumbToolbar.add({
            xtype: 'button',
            text: 'Root',
            handler: () => this.navigateToRoot()
        });

        if (pathSegments.length > 0) {
            breadcrumbToolbar.add(this.createBreadcrumbSeparator());
        }

        pathSegments.forEach((segment, index) => {
            breadcrumbToolbar.add({
                xtype: 'button',
                text: segment.name,
                handler: () => this.navigateToPathIndex(index)
            });

            if (index < pathSegments.length - 1) {
                breadcrumbToolbar.add(this.createBreadcrumbSeparator());
            }
        });

        if (breadcrumbToolbar.updateLayout) {
            breadcrumbToolbar.updateLayout();
        }

        this.syncBreadcrumbScroll();
    },

    createBreadcrumbSeparator: function () {
        return {
            xtype: 'tbseparator'
        };
    },

    syncBreadcrumbScroll: function (scheduleRetry = true) {
        if (this.destroyed || this.destroying || !this.items) {
            return;
        }

        const breadcrumbToolbar = this.down('#breadcrumbToolbar');
        const breadcrumbScrollContainer = this.down('#breadcrumbScrollContainer');
        if (!breadcrumbToolbar || !breadcrumbToolbar.getEl() || !breadcrumbScrollContainer || !breadcrumbScrollContainer.getEl()) {
            return;
        }

        Ext.defer(function () {
            if (breadcrumbToolbar.destroyed || breadcrumbToolbar.destroying ||
                breadcrumbScrollContainer.destroyed || breadcrumbScrollContainer.destroying ||
                !breadcrumbToolbar.getEl() || !breadcrumbScrollContainer.getEl()) {
                return;
            }

            const scrollDom = breadcrumbScrollContainer.getEl().dom;
            if (!scrollDom) {
                return;
            }

            let contentWidth = 0;
            breadcrumbToolbar.items.each(function (item) {
                if (item.isVisible && !item.isVisible()) {
                    return;
                }

                const itemEl = item.getEl ? item.getEl() : null;
                if (itemEl && itemEl.dom) {
                    contentWidth += itemEl.dom.offsetWidth;
                } else if (item.getWidth) {
                    contentWidth += item.getWidth();
                }
            });

            const targetEl = breadcrumbToolbar.getTargetEl ? breadcrumbToolbar.getTargetEl() : null;
            if (targetEl && targetEl.dom) {
                contentWidth = Math.max(contentWidth, targetEl.dom.scrollWidth);
            }

            const containerWidth = breadcrumbScrollContainer.getWidth ? breadcrumbScrollContainer.getWidth() : scrollDom.clientWidth;
            const toolbarWidth = Math.max(contentWidth + 16, containerWidth);

            if (contentWidth > 0 && breadcrumbToolbar.setWidth) {
                breadcrumbToolbar.setWidth(toolbarWidth);
            }

            const toolbarEl = breadcrumbToolbar.getEl();
            if (toolbarEl && toolbarEl.dom) {
                toolbarEl.setStyle('width', `${toolbarWidth}px`);
            }

            const outerCt = breadcrumbScrollContainer.getEl().down('.x-autocontainer-outerCt');
            const innerCt = breadcrumbScrollContainer.getEl().down('.x-autocontainer-innerCt');
            const toolbarTarget = breadcrumbToolbar.getTargetEl ? breadcrumbToolbar.getTargetEl() : null;

            [outerCt, innerCt, toolbarTarget].forEach(function (el) {
                if (el && el.dom) {
                    el.setStyle('width', `${toolbarWidth}px`);
                }
            });

            if (scrollDom.scrollWidth <= scrollDom.clientWidth && toolbarWidth > scrollDom.clientWidth) {
                scrollDom.style.minWidth = '0';
            }

            if (breadcrumbToolbar.updateLayout) {
                breadcrumbToolbar.updateLayout();
            }

            const maxScrollLeft = Math.max(scrollDom.scrollWidth - scrollDom.clientWidth, 0);
            scrollDom.scrollLeft = Math.min(scrollDom.scrollLeft, maxScrollLeft);
        }, 10);

        if (!scheduleRetry) {
            return;
        }

        Ext.defer(function () {
            if (!breadcrumbToolbar || breadcrumbToolbar.destroyed || breadcrumbToolbar.destroying) {
                return;
            }

            const grid = breadcrumbToolbar.up('filegrid');
            if (grid && grid.syncBreadcrumbScroll) {
                grid.syncBreadcrumbScroll(false);
            }
        }, 80);
    },

    bindBreadcrumbScroll: function (component) {
        if (!component || component.breadcrumbScrollBound || !component.getEl()) {
            return;
        }

        const el = component.getEl();
        const doc = Ext.getDoc();
        let isDragging = false;
        let dragStartX = 0;
        let dragStartScrollLeft = 0;

        component.breadcrumbScrollBound = true;

        el.on('wheel', function (event) {
            const dom = el.dom;
            if (!dom || dom.scrollWidth <= dom.clientWidth) {
                return;
            }

            const browserEvent = event.browserEvent || {};
            const deltaX = browserEvent.deltaX || 0;
            const deltaY = browserEvent.deltaY || 0;
            const delta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;

            if (delta === 0) {
                return;
            }

            dom.scrollLeft += delta;
            event.preventDefault();
        });

        el.on('mousedown', function (event) {
            const dom = el.dom;
            if (!dom || dom.scrollWidth <= dom.clientWidth) {
                return;
            }

            isDragging = true;
            dragStartX = event.getX();
            dragStartScrollLeft = dom.scrollLeft;
            el.addCls('file-grid-breadcrumb-scroll-dragging');
        });

        doc.on('mousemove', function (event) {
            if (!isDragging) {
                return;
            }

            const dom = el.dom;
            if (!dom) {
                return;
            }

            dom.scrollLeft = dragStartScrollLeft - (event.getX() - dragStartX);
            event.preventDefault();
        });

        doc.on('mouseup', function () {
            if (!isDragging) {
                return;
            }

            isDragging = false;
            el.removeCls('file-grid-breadcrumb-scroll-dragging');
        });
    },

    updateFooterStats: function () {
        if (this.destroyed || this.destroying || !this.items) {
            return;
        }

        const visibleRecords = this.getVisibleFolderRecords();
        const count = visibleRecords.length;
        const totalSize = visibleRecords.reduce(function (sum, record) {
            return sum + (Number(record.get('size')) || 0);
        }, 0);

        this.itemsCountText = `${count} item${count !== 1 ? 's' : ''}`;
        this.currentFolderSizeText = `Total size: ${this.formatSize(totalSize)}`;

        const countText = this.itemsCountComponent && !this.itemsCountComponent.destroyed
            ? this.itemsCountComponent
            : null;
        if (countText) {
            countText.setText(this.itemsCountText);
        }

        const sizeText = this.currentFolderSizeComponent && !this.currentFolderSizeComponent.destroyed
            ? this.currentFolderSizeComponent
            : null;
        if (sizeText) {
            sizeText.setText(this.currentFolderSizeText);
        }
    },

    getVisibleFolderRecords: function () {
        if (this.destroyed || this.destroying) {
            return [];
        }

        const store = this.getStore();
        if (!store || store.destroyed || store.destroying) {
            return [];
        }

        return store.getRange().filter(function (record) {
            return !(record && record.get && record.get('isUpDirectory'));
        });
    },

    formatSize: function (value) {
        const bytes = Math.max(Number(value) || 0, 0);

        if (bytes < 1024) {
            return `${bytes} Bytes`;
        }

        if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(2)} KB`;
        }

        if (bytes < 1024 * 1024 * 1024) {
            return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
        }

        if (bytes < 1024 * 1024 * 1024 * 1024) {
            return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
        }

        return `${(bytes / (1024 * 1024 * 1024 * 1024)).toFixed(2)} TB`;
    },

    bindRowOperationLayer: function () {
        if (this.rowOperationLayerBound) {
            return;
        }

        const view = this.getView ? this.getView() : null;
        if (!view) {
            return;
        }

        this.rowOperationLayerBound = true;
        this.ensureRowOperationLayer();

        if (view.on) {
            this.mon(view, 'refresh', this.scheduleRowOperationLayerUpdate, this);
            this.mon(view, 'itemupdate', this.scheduleRowOperationLayerUpdate, this);
            this.mon(view, 'resize', this.scheduleRowOperationLayerUpdate, this);
        }

        if (view.el && view.el.on) {
            view.el.on('scroll', this.scheduleRowOperationLayerUpdate, this);
        }

        const scrollable = view.getScrollable ? view.getScrollable() : null;
        if (scrollable && scrollable.on) {
            this.mon(scrollable, 'scroll', this.scheduleRowOperationLayerUpdate, this);
        }

        if (this.headerCt && this.headerCt.on) {
            this.mon(this.headerCt, 'columnhide', this.scheduleRowOperationLayerUpdate, this);
            this.mon(this.headerCt, 'columnshow', this.scheduleRowOperationLayerUpdate, this);
            this.mon(this.headerCt, 'columnmove', this.scheduleRowOperationLayerUpdate, this);
            this.mon(this.headerCt, 'columnresize', this.scheduleRowOperationLayerUpdate, this);
        }

        this.on('resize', this.scheduleRowOperationLayerUpdate, this);
        this.on('destroy', this.destroyRowOperationLayer, this);
        this.scheduleRowOperationLayerUpdate();
    },

    ensureRowOperationLayer: function () {
        const view = this.getView ? this.getView() : null;
        if (!view || !view.el || !view.el.dom) {
            return null;
        }

        if (this.rowOperationLayer && this.rowOperationLayer.dom &&
            this.rowOperationLayer.dom.parentNode === view.el.dom) {
            return this.rowOperationLayer;
        }

        view.el.setStyle('position', 'relative');
        this.rowOperationLayer = view.el.createChild({
            cls: 'file-grid-row-progress-layer'
        });

        return this.rowOperationLayer;
    },

    destroyRowOperationLayer: function () {
        if (this.rowOperationLayerUpdateTask) {
            clearTimeout(this.rowOperationLayerUpdateTask);
            this.rowOperationLayerUpdateTask = null;
        }

        if (this.rowOperationLayer && this.rowOperationLayer.destroy) {
            this.rowOperationLayer.destroy();
        }

        this.rowOperationLayer = null;
    },

    scheduleRowOperationLayerUpdate: function () {
        if (this.destroyed || this.destroying) {
            return;
        }

        if (this.rowOperationLayerUpdateTask) {
            clearTimeout(this.rowOperationLayerUpdateTask);
        }

        this.rowOperationLayerUpdateTask = setTimeout(() => {
            this.rowOperationLayerUpdateTask = null;
            this.updateRowOperationLayer();
        }, 20);
    },

    updateRowOperationLayer: function () {
        if (this.destroyed || this.destroying || !this.rendered) {
            return;
        }

        const layer = this.ensureRowOperationLayer();
        const view = this.getView ? this.getView() : null;
        const store = this.getStore ? this.getStore() : null;

        if (!layer || !view || !view.el || !store) {
            return;
        }

        layer.update('');

        const viewRect = view.el.dom.getBoundingClientRect();
        const records = store.getRange ? store.getRange() : [];

        records.forEach(record => {
            const operationType = record.get('rowOperationType');
            if (!operationType) {
                return;
            }

            const row = view.getNode ? view.getNode(record) : null;
            if (!row) {
                return;
            }

            const rowRect = row.getBoundingClientRect();
            const progress = Math.max(0, Math.min(Number(record.get('rowOperationProgress')) || 0, 100));
            const rowWidth = Math.max(rowRect.width, 0);
            const fillWidth = Math.max(Math.round(rowWidth * (progress / 100)), progress > 0 ? 2 : 0);

            layer.createChild({
                cls: `file-grid-row-progress-track file-grid-row-progress-${operationType}`,
                style: [
                    `left:${rowRect.left - viewRect.left}px`,
                    `top:${rowRect.top - viewRect.top}px`,
                    `width:${rowWidth}px`,
                    `height:${rowRect.height}px`
                ].join(';'),
                children: [{
                    cls: 'file-grid-row-progress-fill',
                    style: `width:${fillWidth}px`
                }]
            });
        });
    },

    setRowOperation: function (record, operationType, progress, status, operationKey) {
        if (!record || !record.set) {
            return;
        }

        record.set({
            rowOperationType: operationType || '',
            rowOperationProgress: Math.max(0, Math.min(Number(progress) || 0, 100)),
            rowOperationStatus: status || '',
            rowOperationKey: operationKey || record.get('rowOperationKey') || ''
        });
        record.commit();
        this.scheduleRowOperationLayerUpdate();
    },

    clearRowOperation: function (record) {
        if (!record || !record.set) {
            return;
        }

        record.set({
            rowOperationType: '',
            rowOperationProgress: 0,
            rowOperationStatus: '',
            rowOperationKey: ''
        });
        record.commit();
        this.scheduleRowOperationLayerUpdate();
    },

    restoreOperationRows: function () {
        this.restoreDownloadIndicators();
        this.restoreRecoverableUploadPlaceholders();
        this.restoreUploadScanPlaceholdersFromQueue();
        this.restoreUploadPlaceholderRecords();
        this.scheduleRowOperationLayerUpdate();
    },

    hydrateOperationRowsAfterRender: function () {
        this.restoreOperationRows();

        Ext.defer(this.restoreOperationRows, 250, this);
        Ext.defer(this.restoreOperationRows, 1000, this);

        const socketManager = FileManagement.components.utils.SocketManager;
        if (socketManager && socketManager.restoreBackgroundActivityState) {
            Promise.resolve(socketManager.restoreBackgroundActivityState())
                .then(() => {
                    if (!this.destroyed && !this.destroying) {
                        this.restoreOperationRows();
                    }
                })
                .catch(error => {
                    console.error('Failed to hydrate File Explorer operation rows:', error);
                });
        }
    },

    normalizeOperationFolderId: function (folderId) {
        return folderId === null || folderId === undefined ? '' : String(folderId);
    },

    isCurrentFolderForOperation: function (folderId) {
        return this.normalizeOperationFolderId(folderId) === this.normalizeOperationFolderId(this.currentFolderId || '');
    },

    isCurrentWorkspaceForOperation: function (workspaceId) {
        const currentWorkspaceId = this.getWorkspaceId ? this.getWorkspaceId() : '';
        return !currentWorkspaceId || !workspaceId || String(currentWorkspaceId) === String(workspaceId);
    },

    getFileSignature: function (file) {
        return [
            file && (file.name || file.fileName) || 'file',
            file && file.size || 0,
            file && file.lastModified || 0
        ].join('|');
    },

    getUploadPlaceholderKey: function (sessionId, file) {
        return `${sessionId || 'upload'}|${this.getFileSignature(file)}`;
    },

    getUploadPlaceholderStates: function () {
        if (this.destroyed || this.destroying) {
            return null;
        }

        if (!this.uploadPlaceholderStates) {
            this.uploadPlaceholderStates = {};
        }

        return this.uploadPlaceholderStates;
    },

    createUploadPlaceholders: function (files, options = {}) {
        const filesArray = Array.from(files || []);
        const folderId = this.normalizeOperationFolderId(options.folderId);
        const workspaceId = options.workspaceId || this.getWorkspaceId();
        const placeholderStates = this.getUploadPlaceholderStates();

        if (!filesArray.length || this.sharedMode || this.sharedByMeMode ||
            !placeholderStates ||
            !this.isCurrentFolderForOperation(folderId) ||
            !this.isCurrentWorkspaceForOperation(workspaceId)) {
            return;
        }

        filesArray.forEach(file => {
            const key = this.getUploadPlaceholderKey(options.sessionId, file);
            placeholderStates[key] = {
                key,
                sessionId: options.sessionId || '',
                folderId,
                workspaceId,
                name: file.name || 'Uploading file',
                size: Number(file.size) || 0,
                mimetype: file.type || '',
                lastModified: file.lastModified || 0,
                progress: 0,
                status: 'Queued',
                scanPending: false,
                scanStatus: null,
                fileId: '',
                filePath: '',
                completed: false,
                createdAt: new Date()
            };
        });

        this.restoreUploadPlaceholderRecords();
    },

    buildUploadPlaceholderData: function (state) {
        return {
            id: `upload-placeholder-${state.key}`,
            name: state.name,
            mimetype: state.mimetype,
            path: '',
            size: state.size,
            createdAt: state.createdAt || new Date(),
            isFolder: false,
            isUploadPlaceholder: true,
            rowOperationType: this.getUploadPlaceholderOperationType(state),
            rowOperationProgress: state.progress || 0,
            rowOperationStatus: state.status || 'Queued',
            rowOperationKey: state.key
        };
    },

    getUploadPlaceholderOperationType: function (state) {
        const scanStatus = state && state.scanStatus ? String(state.scanStatus).toLowerCase() : '';
        if (state && (state.scanPending || ['pending', 'scanning', 'clean', 'infected', 'error'].includes(scanStatus))) {
            return 'scan';
        }

        return 'upload';
    },

    getUploadPlaceholderInsertIndex: function () {
        const store = this.getStore();
        const first = store && store.getCount ? store.getAt(0) : null;
        return first && first.get && first.get('isUpDirectory') ? 1 : 0;
    },

    findUploadPlaceholderRecord: function (key) {
        const store = this.getStore();
        return store ? store.findRecord('rowOperationKey', key, 0, false, true, true) : null;
    },

    restoreRecoverableUploadPlaceholders: function () {
        const uploadManager = FileManagement.components.utils.UploadSessionManager;
        if (!uploadManager || !uploadManager.getInterruptedSessions || this.sharedMode || this.sharedByMeMode) {
            return;
        }

        const activeRecoveryKeys = {};
        const sessions = uploadManager.getInterruptedSessions();
        const placeholderStates = this.getUploadPlaceholderStates();

        if (!placeholderStates) {
            return;
        }

        sessions.forEach(session => {
            if (!this.isCurrentFolderForOperation(session.folderId || '') ||
                !this.isCurrentWorkspaceForOperation(session.workspaceId || '')) {
                return;
            }

            (session.files || [])
                .filter(file => file.status !== 'complete' && file.status !== 'cancelled')
                .forEach(file => {
                    const key = `recovery|${session.id}|${file.signature || `${file.name}|${file.size || 0}`}`;
                    activeRecoveryKeys[key] = true;

                    if (placeholderStates[key]) {
                        return;
                    }

                    placeholderStates[key] = {
                        key,
                        sessionId: session.id,
                        folderId: this.normalizeOperationFolderId(session.folderId || ''),
                        workspaceId: session.workspaceId || '',
                        name: file.name || 'Interrupted upload',
                        size: Number(file.size) || 0,
                        mimetype: file.type || '',
                        lastModified: file.lastModified || 0,
                        progress: Math.max(0, Math.min(Number(file.progress) || 0, 100)),
                        status: file.status === 'queued' ? 'Queued' : 'Interrupted',
                        scanPending: false,
                        scanStatus: null,
                        fileId: '',
                        filePath: '',
                        completed: false,
                        createdAt: session.updatedAt ? new Date(session.updatedAt) : new Date()
                    };
                });
        });

        Object.keys(placeholderStates).forEach(key => {
            if (key.indexOf('recovery|') === 0 && !activeRecoveryKeys[key]) {
                this.clearUploadPlaceholder(key);
            }
        });
    },

    restoreUploadScanPlaceholdersFromQueue: function () {
        const scanPanel = FileManagement.components.status && FileManagement.components.status.ScanQueuePanel;
        const activeScans = scanPanel && scanPanel.getActiveScanItems ? scanPanel.getActiveScanItems() : [];

        activeScans
            .filter(scan => scan.status === 'pending' || scan.status === 'scanning')
            .forEach(scan => this.handleUploadScanUpdate(scan));
    },

    restoreUploadPlaceholderRecords: function () {
        const store = this.getStore();
        if (!store) {
            return;
        }

        const placeholderStates = this.getUploadPlaceholderStates();
        if (!placeholderStates) {
            return;
        }

        let insertIndex = this.getUploadPlaceholderInsertIndex();
        Object.keys(placeholderStates).forEach(key => {
            const state = placeholderStates[key];
            if (!state || state.completed ||
                !this.isCurrentFolderForOperation(state.folderId) ||
                !this.isCurrentWorkspaceForOperation(state.workspaceId || '') ||
                this.sharedMode || this.sharedByMeMode) {
                return;
            }

            const existingPlaceholder = this.findUploadPlaceholderRecord(key);
            if (existingPlaceholder) {
                this.setRowOperation(
                    existingPlaceholder,
                    this.getUploadPlaceholderOperationType(state),
                    state.progress || 0,
                    state.status || 'Queued',
                    key
                );
                return;
            }

            const existingFile = store.findBy(record =>
                !record.get('isUploadPlaceholder') &&
                !record.get('isUpDirectory') &&
                record.get('name') === state.name
            );

            if (existingFile !== -1 && state.progress >= 100) {
                delete placeholderStates[key];
                return;
            }

            store.insert(insertIndex, this.buildUploadPlaceholderData(state));
            insertIndex += 1;
        });

        this.updateFooterStats();
        this.scheduleRowOperationLayerUpdate();
    },

    updateUploadPlaceholder: function (sessionId, file, progress, status = 'Uploading') {
        const key = this.getUploadPlaceholderKey(sessionId, file);
        const placeholderStates = this.getUploadPlaceholderStates();
        const state = placeholderStates ? placeholderStates[key] : null;

        if (!state) {
            return;
        }

        state.progress = Math.max(0, Math.min(Number(progress) || 0, 100));
        state.status = status;

        const record = this.findUploadPlaceholderRecord(key);
        if (record) {
            this.setRowOperation(record, this.getUploadPlaceholderOperationType(state), state.progress, state.status, key);
        }
    },

    completeUploadPlaceholder: function (sessionId, file) {
        const key = this.getUploadPlaceholderKey(sessionId, file);
        const placeholderStates = this.getUploadPlaceholderStates();
        const state = placeholderStates ? placeholderStates[key] : null;

        if (!state) {
            return;
        }

        if (state.scanStatus === 'infected' || state.scanStatus === 'error') {
            state.status = this.getUploadPlaceholderScanStatusText(state.scanStatus);
            state.completed = true;

            const unavailableRecord = this.findUploadPlaceholderRecord(key);
            if (unavailableRecord) {
                this.setRowOperation(unavailableRecord, this.getUploadPlaceholderOperationType(state), 100, state.status, key);
            }

            this.clearUploadPlaceholder(key, state.scanStatus === 'error' ? 1400 : 0);
            return;
        }

        const scanAlreadyClean = state.scanStatus === 'clean';
        state.progress = 100;
        state.scanStatus = state.scanStatus || (scanAlreadyClean ? 'clean' : 'pending');
        state.status = scanAlreadyClean ? 'Ready' : this.getUploadPlaceholderScanStatusText(state.scanStatus);
        state.scanPending = !scanAlreadyClean;
        state.completed = scanAlreadyClean;

        const record = this.findUploadPlaceholderRecord(key);
        if (record) {
            this.setRowOperation(record, this.getUploadPlaceholderOperationType(state), 100, state.status, key);
        }

        if (scanAlreadyClean) {
            this.clearUploadPlaceholder(key, 1200);
        }
    },

    cancelUploadPlaceholder: function (sessionId, file, status = 'Cancelled') {
        const key = this.getUploadPlaceholderKey(sessionId, file);
        const placeholderStates = this.getUploadPlaceholderStates();
        const state = placeholderStates ? placeholderStates[key] : null;

        if (state) {
            state.status = status;
            state.completed = true;
        }

        const record = this.findUploadPlaceholderRecord(key);
        if (record) {
            this.setRowOperation(record, this.getUploadPlaceholderOperationType(state), Number(record.get('rowOperationProgress')) || 0, status, key);
        }

        this.clearUploadPlaceholder(key, 1800);
    },

    clearUploadPlaceholder: function (key, delay = 0) {
        const clear = () => {
            const record = this.findUploadPlaceholderRecord(key);
            const store = this.getStore();

            const placeholderStates = this.getUploadPlaceholderStates();
            if (placeholderStates) {
                delete placeholderStates[key];
            }

            if (record && record.get('isUploadPlaceholder') && store) {
                store.remove(record);
            }

            this.updateFooterStats();
            this.scheduleRowOperationLayerUpdate();
        };

        if (delay > 0) {
            Ext.defer(clear, delay);
            return;
        }

        clear();
    },

    handleUploadScanUpdate: function (data = {}) {
        if (this.destroyed || this.destroying) {
            return;
        }

        const status = data.status || 'pending';
        let key = this.findUploadPlaceholderKeyForScan(data);

        if (!key && (status === 'pending' || status === 'scanning')) {
            key = this.createUploadScanPlaceholderFromUpdate(data);
        }

        if (!key) {
            return;
        }

        const placeholderStates = this.getUploadPlaceholderStates();
        const state = placeholderStates ? placeholderStates[key] : null;
        const terminalUnavailable = status === 'infected' || status === 'error';
        const terminalClean = status === 'clean';

        if (!state) {
            return;
        }

        state.fileId = data.fileId || state.fileId || '';
        state.filePath = data.filePath || data.path || state.filePath || '';
        state.scanStatus = status;
        state.scanPending = status === 'pending' || status === 'scanning';
        state.progress = 100;
        state.status = this.getUploadPlaceholderScanStatusText(status);

        const record = this.findUploadPlaceholderRecord(key);

        if (terminalUnavailable) {
            state.completed = true;
            if (record) {
                this.setRowOperation(record, this.getUploadPlaceholderOperationType(state), 100, state.status, key);
            }
            this.clearUploadPlaceholder(key, status === 'error' ? 1400 : 0);
            return;
        }

        if (terminalClean) {
            state.completed = true;
            if (record) {
                this.setRowOperation(record, this.getUploadPlaceholderOperationType(state), 100, state.status, key);
            }
            this.clearUploadPlaceholder(key, 1200);
            return;
        }

        if (record) {
            this.setRowOperation(record, this.getUploadPlaceholderOperationType(state), 100, state.status, key);
        } else {
            this.restoreUploadPlaceholderRecords();
        }
    },

    createUploadScanPlaceholderFromUpdate: function (data = {}) {
        const fileName = data.fileName || data.name;
        const folderValue = data.folderId !== undefined
            ? data.folderId
            : (data.parentId !== undefined ? data.parentId : data.parent_id);
        const folderId = this.normalizeOperationFolderId(folderValue);
        const workspaceId = data.workspaceId || '';

        if (!fileName || this.sharedMode || this.sharedByMeMode ||
            !this.isCurrentFolderForOperation(folderId) ||
            !this.isCurrentWorkspaceForOperation(workspaceId)) {
            return null;
        }

        const store = this.getStore();
        const placeholderStates = this.getUploadPlaceholderStates();
        if (store) {
            const existingFile = store.findBy(record =>
                !record.get('isUploadPlaceholder') &&
                !record.get('isUpDirectory') &&
                record.get('name') === fileName
            );

            if (existingFile !== -1) {
                return null;
            }
        }

        const key = `scan|${data.fileId || data.filePath || fileName}|${folderId}`;
        if (!placeholderStates) {
            return null;
        }

        placeholderStates[key] = {
            key,
            sessionId: 'scan-restore',
            folderId,
            workspaceId,
            name: fileName,
            size: Number(data.size) || 0,
            mimetype: data.mimetype || '',
            lastModified: 0,
            progress: 100,
            status: this.getUploadPlaceholderScanStatusText(data.status || 'pending'),
            scanPending: true,
            scanStatus: data.status || 'pending',
            fileId: data.fileId || '',
            filePath: data.filePath || data.path || '',
            completed: false,
            createdAt: data.createdAt ? new Date(data.createdAt) : new Date()
        };

        this.restoreUploadPlaceholderRecords();
        return key;
    },

    getUploadPlaceholderScanStatusText: function (status) {
        switch (status) {
            case 'pending':
                return 'Virus scan queued';
            case 'scanning':
                return 'Virus scan running';
            case 'clean':
                return 'Ready';
            case 'infected':
                return 'Blocked';
            case 'error':
                return 'Scan failed';
            default:
                return 'Virus scan running';
        }
    },

    findUploadPlaceholderKeyForScan: function (data = {}) {
        const fileName = data.fileName || data.name || '';
        const fileId = data.fileId ? String(data.fileId) : '';
        const filePath = data.filePath || data.path || '';
        const folderValue = data.folderId !== undefined
            ? data.folderId
            : (data.parentId !== undefined ? data.parentId : data.parent_id);
        const hasFolderContext = folderValue !== undefined && folderValue !== null;
        const folderId = this.normalizeOperationFolderId(folderValue);
        const workspaceId = data.workspaceId || '';
        const states = this.getUploadPlaceholderStates() || {};
        let fallbackKey = null;

        Object.keys(states).some(key => {
            const state = states[key];
            if (!state || state.completed) {
                return false;
            }

            if (fileId && state.fileId && String(state.fileId) === fileId) {
                fallbackKey = key;
                return true;
            }

            if (filePath && state.filePath && state.filePath === filePath) {
                fallbackKey = key;
                return true;
            }

            if (!fileName || state.name !== fileName) {
                return false;
            }

            if (workspaceId && state.workspaceId && String(state.workspaceId) !== String(workspaceId)) {
                return false;
            }

            if (hasFolderContext && this.normalizeOperationFolderId(state.folderId) !== folderId) {
                return false;
            }

            if (!hasFolderContext && !this.isCurrentFolderForOperation(state.folderId)) {
                return false;
            }

            fallbackKey = key;
            return true;
        });

        return fallbackKey;
    },

    startDownloadIndicator: function (fileRef, fileName, progressId) {
        const record = this.findDownloadRecord(fileRef, fileName);

        if (!record) {
            return;
        }

        this.downloadOperationStates[progressId] = {
            progressId,
            fileId: fileRef && fileRef.fileId || record.get('id') || '',
            filePath: fileRef && fileRef.filePath || record.get('path') || '',
            fileName: fileName || record.get('name') || '',
            progress: 1,
            status: 'Downloading'
        };

        this.setRowOperation(record, 'download', 1, 'Downloading', progressId);
    },

    updateDownloadIndicator: function (progressId, progress) {
        const state = this.downloadOperationStates[progressId];
        if (!state) {
            return;
        }

        state.progress = Math.max(0, Math.min(Number(progress) || 0, 100));
        const record = this.findDownloadRecord({
            fileId: state.fileId,
            filePath: state.filePath
        }, state.fileName);

        if (record) {
            this.setRowOperation(record, 'download', state.progress, 'Downloading', progressId);
        }
    },

    finishDownloadIndicator: function (progressId, status = 'Downloaded', delay = 1400) {
        const state = this.downloadOperationStates[progressId];
        if (!state) {
            return;
        }

        const record = this.findDownloadRecord({
            fileId: state.fileId,
            filePath: state.filePath
        }, state.fileName);

        if (record) {
            this.setRowOperation(record, 'download', status === 'Downloaded' ? 100 : state.progress, status, progressId);
        }

        Ext.defer(() => {
            const currentRecord = this.findDownloadRecord({
                fileId: state.fileId,
                filePath: state.filePath
            }, state.fileName);

            if (currentRecord && currentRecord.get('rowOperationKey') === progressId) {
                this.clearRowOperation(currentRecord);
            }

            delete this.downloadOperationStates[progressId];
        }, delay);
    },

    restoreDownloadIndicators: function () {
        Object.keys(this.downloadOperationStates || {}).forEach(progressId => {
            const state = this.downloadOperationStates[progressId];
            const record = this.findDownloadRecord({
                fileId: state.fileId,
                filePath: state.filePath
            }, state.fileName);

            if (record) {
                this.setRowOperation(record, 'download', state.progress || 0, state.status || 'Downloading', progressId);
            }
        });
    },

    findDownloadRecord: function (fileRef, fileName) {
        const store = this.getStore();
        if (!store) {
            return null;
        }

        const fileId = fileRef && fileRef.fileId;
        const filePath = fileRef && fileRef.filePath;

        const index = store.findBy(record => {
            if (record.get('isFolder') || record.get('isUpDirectory') || record.get('isUploadPlaceholder')) {
                return false;
            }

            if (fileId && record.get('id') === fileId) {
                return true;
            }

            if (filePath && record.get('path') === filePath) {
                return true;
            }

            return !!fileName && record.get('name') === fileName;
        });

        return index === -1 ? null : store.getAt(index);
    },

    // Method to navigate back to the root directory
    navigateToRoot: function () {
        this.currentFolderPath = [];
        this.loadFolderContents(null, null);
        this.updateBreadcrumb([]);
    },

    navigateToPathIndex: function (index) {
        const newPath = this.currentFolderPath.slice(0, index + 1);
        this.currentFolderPath = newPath;
        const targetFolder = newPath[newPath.length - 1] || { id: null, name: '' };
        this.currentFolder = newPath.map(segment => segment.name).join('/') || '';
        this.loadFolderContents(targetFolder.name, targetFolder.id, false);
        this.updateBreadcrumb(newPath);
    },

    // Optionally, you can add methods for additional functionality
    loadFiles: function () {
        var me = this;

        // Load the store data
        me.getStore().getProxy().setExtraParams(me.buildStoreParams());
        me.getStore().load({
            callback: function (records, operation, success) {
                if (!success) {
                    console.error('Failed to load files:', operation.getError());
                }
            }
        });
    },

    buildStoreParams: function (extraParams = {}) {
        return {
            parent_id: this.sharedByMeMode ? '' : this.currentFolderId || '',
            ...(!this.sharedMode && !this.sharedByMeMode && this.getWorkspaceId() ? { workspaceId: this.getWorkspaceId() } : {}),
            ...(this.sharedMode ? { shared: 'true' } : {}),
            ...(this.sharedByMeMode ? { sharedByMe: 'true' } : {}),
            ...extraParams
        };
    },

    applyResponsiveColumns: function () {
        if (!this.rendered || !FileManagement.components.utils.ResponsiveGrid) {
            return;
        }

        FileManagement.components.utils.ResponsiveGrid.prepareGrid(this);
        FileManagement.components.utils.ResponsiveGrid.applyGrid(this);
    },

    configureSelectionModel: function () {
        const selectionModel = this.getSelectionModel ? this.getSelectionModel() : null;

        if (!selectionModel) {
            return;
        }

        if (selectionModel.setSelectionMode) {
            selectionModel.setSelectionMode('MULTI');
        } else {
            selectionModel.mode = 'MULTI';
        }

        selectionModel.allowDeselect = true;
    },

    isCheckboxSelectionTarget: function (target) {
        const view = this.getView ? this.getView() : null;
        const viewEl = view && view.el && view.el.dom ? view.el.dom : null;

        while (target && target !== viewEl) {
            const targetEl = Ext.fly(target);
            if (targetEl && (targetEl.hasCls('x-grid-row-checker') || targetEl.hasCls('x-grid-cell-special'))) {
                return true;
            }

            target = target.parentNode;
        }

        return false;
    },

    setSelectionRangeAnchor: function (record) {
        if (!record) {
            this.selectionRangeAnchor = null;
            this.selectionRangeAnchorId = null;
            return;
        }

        this.selectionRangeAnchor = record;
        this.selectionRangeAnchorId = this.getSelectionRecordIdentity(record);
    },

    getSelectionRecordIdentity: function (record) {
        if (!record) {
            return null;
        }

        return (record.getId && record.getId()) ||
            (record.get && record.get('id')) ||
            record.internalId ||
            null;
    },

    getSelectionRangeAnchor: function () {
        const store = this.getStore ? this.getStore() : null;
        let anchor = this.selectionRangeAnchor;

        if (anchor && store && store.indexOf(anchor) !== -1) {
            return anchor;
        }

        if (store && this.selectionRangeAnchorId) {
            anchor = store.getById ? store.getById(this.selectionRangeAnchorId) : null;
            if (!anchor) {
                const index = store.findBy(function (candidate) {
                    return this.getSelectionRecordIdentity(candidate) === this.selectionRangeAnchorId;
                }, this);
                anchor = index !== -1 ? store.getAt(index) : null;
            }

            if (anchor) {
                this.selectionRangeAnchor = anchor;
                return anchor;
            }
        }

        const selectionModel = this.getSelectionModel ? this.getSelectionModel() : null;
        const selected = selectionModel ? selectionModel.getSelection() : [];
        anchor = selected.length ? selected[selected.length - 1] : null;
        this.setSelectionRangeAnchor(anchor);
        return anchor;
    },

    getSelectionRangeRecords: function (anchorRecord, targetRecord) {
        const store = this.getStore ? this.getStore() : null;
        if (!store || !anchorRecord || !targetRecord) {
            return targetRecord ? [targetRecord] : [];
        }

        const anchorIndex = store.indexOf(anchorRecord);
        const targetIndex = store.indexOf(targetRecord);

        if (anchorIndex === -1 || targetIndex === -1) {
            return [targetRecord];
        }

        const start = Math.min(anchorIndex, targetIndex);
        const end = Math.max(anchorIndex, targetIndex);
        const records = [];

        for (let index = start; index <= end; index += 1) {
            const record = store.getAt(index);
            if (record) {
                records.push(record);
            }
        }

        return records;
    },

    selectRangeFromAnchor: function (targetRecord) {
        const selectionModel = this.getSelectionModel ? this.getSelectionModel() : null;
        if (!selectionModel || !targetRecord) {
            return;
        }

        const anchorRecord = this.getSelectionRangeAnchor() || targetRecord;
        const records = this.getSelectionRangeRecords(anchorRecord, targetRecord);

        if (!records.length) {
            return;
        }

        selectionModel.select(records, true);
        this.updateSelectionActions(selectionModel.getSelection());
    },

    bindCheckboxSelectionHandlers: function () {
        const view = this.getView ? this.getView() : null;
        const viewEl = view && view.el && view.el.dom ? view.el.dom : null;

        if (!viewEl || this.checkboxSelectionHandlersBound) {
            return;
        }

        const grid = this;

        const findCheckerTarget = function (target) {
            while (target && target !== viewEl) {
                const targetEl = Ext.fly(target);
                if (targetEl.hasCls('x-grid-row-checker') || targetEl.hasCls('x-grid-cell-special')) {
                    return target;
                }

                target = target.parentNode;
            }

            return null;
        };

        const getRecordFromTarget = function (target) {
            const row = view.findItemByChild
                ? view.findItemByChild(target)
                : Ext.fly(target).up(view.itemSelector, viewEl, true);

            return row && view.getRecord ? view.getRecord(row) : null;
        };

        const guardCheckerEvent = function (event) {
            if (!findCheckerTarget(event.target)) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
        };

        const toggleCheckerSelection = function (event) {
            const checkerTarget = findCheckerTarget(event.target);
            if (!checkerTarget) {
                return;
            }

            const record = getRecordFromTarget(checkerTarget);
            const selectionModel = grid.getSelectionModel ? grid.getSelectionModel() : null;

            event.preventDefault();
            event.stopPropagation();

            if (!record || !selectionModel) {
                return;
            }

            if (event.shiftKey) {
                grid.selectRangeFromAnchor(record);
                return;
            }

            if (selectionModel.isSelected(record)) {
                selectionModel.deselect(record);
                const selected = selectionModel.getSelection();
                grid.setSelectionRangeAnchor(selected.length ? selected[selected.length - 1] : null);
            } else {
                selectionModel.select(record, true);
                grid.setSelectionRangeAnchor(record);
            }

            grid.updateSelectionActions(selectionModel.getSelection());
        };

        viewEl.addEventListener('mousedown', guardCheckerEvent, true);
        viewEl.addEventListener('click', toggleCheckerSelection, true);

        this.checkboxSelectionHandlersBound = true;
        this.checkboxSelectionHandlers = {
            viewEl,
            guardCheckerEvent,
            toggleCheckerSelection
        };
    },

    unbindCheckboxSelectionHandlers: function () {
        const handlers = this.checkboxSelectionHandlers;

        if (!handlers || !handlers.viewEl) {
            return;
        }

        handlers.viewEl.removeEventListener('mousedown', handlers.guardCheckerEvent, true);
        handlers.viewEl.removeEventListener('click', handlers.toggleCheckerSelection, true);
        this.checkboxSelectionHandlers = null;
        this.checkboxSelectionHandlersBound = false;
    },

    setSharedMode: function (sharedMode) {
        this.setListMode(sharedMode ? 'sharedWithMe' : 'files');
    },

    getWorkspaceId: function () {
        if (this.sharedMode || this.sharedByMeMode) {
            return '';
        }

        return this.workspaceId || FileManagement.components.utils.WorkspaceContext.getActiveWorkspaceId() || '';
    },

    applyWorkspaceContext: function (options = {}) {
        if (this.sharedMode || this.sharedByMeMode) {
            return;
        }

        const workspace = FileManagement.components.utils.WorkspaceContext.getActiveWorkspace();
        if (!workspace) {
            return;
        }

        const changed = this.workspaceId && this.workspaceId !== workspace.id;
        this.workspaceId = workspace.id;
        this.workspaceName = workspace.name || 'Personal';
        this.workspaceType = workspace.type || 'personal';
        this.updateWorkspaceTitle();

        if (changed && options.preserveFolder !== true) {
            this.currentFolder = '';
            this.currentFolderId = '';
            this.currentFolderPath = [];
            this.updateBreadcrumb([]);
        }

        if (changed && options.skipLoad !== true) {
            this.loadFiles();
        }
    },

    updateWorkspaceTitle: function () {
        if (this.sharedMode || this.sharedByMeMode) {
            return;
        }

        const suffix = this.workspaceType === 'organization'
            ? `${this.workspaceName} (Org)`
            : 'Personal';
        this.setTitle(`Files Explorer - ${suffix}`);
    },

    setListMode: function (mode, options = {}) {
        const nextMode = mode === 'sharedWithMe' || mode === 'sharedByMe' ? mode : 'files';
        if (this.listMode === nextMode) {
            this.updateModeControls();
            this.updateSelectionActions();
            return;
        }

        this.listMode = nextMode;
        this.sharedMode = nextMode === 'sharedWithMe';
        this.sharedByMeMode = nextMode === 'sharedByMe';
        this.setTitle(this.sharedMode ? 'Shared With Me' : this.sharedByMeMode ? 'Shared By Me' : 'Files Explorer');
        if (!this.sharedMode && !this.sharedByMeMode) {
            this.updateWorkspaceTitle();
        }
        this.currentFolder = '';
        this.currentFolderId = '';
        this.currentFolderPath = [];
        this.updateBreadcrumb([]);

        const selectionModel = this.getSelectionModel ? this.getSelectionModel() : null;
        if (selectionModel) {
            selectionModel.deselectAll();
        }

        this.updateModeControls();
        this.updateSelectionActions([]);

        if (!options.skipLoad) {
            this.loadFiles();
        }
    },

    updateModeControls: function () {
        const managementMode = this.sharedMode || this.sharedByMeMode;
        const uploadButton = this.down('#uploadButton');
        const newFolderButton = this.down('#newFolderButton');
        const goUpButton = this.down('#goUpButton');
        const deleteButton = this.down('#deleteButton');
        const shareButton = this.down('#shareItemButton');
        const revokeShareButton = this.down('#revokeShareButton');
        const moveButton = this.down('#moveItemsButton');
        const compressButton = this.down('#compressButton');
        const pdfStudioButton = this.down('#pdfStudioButton');
        const mediaConversionButton = this.down('#mediaConversionButton');
        const documentConversionButton = this.down('#documentConversionButton');
        const contentIntelligenceButton = this.down('#contentIntelligenceButton');
        const selectionActionSeparator = this.down('#selectionActionSeparator');
        const fileManagementSeparator = this.down('#fileManagementSeparator');

        if (uploadButton) {
            uploadButton.setHidden(managementMode);
            uploadButton.setDisabled(managementMode);
        }

        if (newFolderButton) {
            newFolderButton.setHidden(managementMode);
            newFolderButton.setDisabled(managementMode);
        }

        if (deleteButton) {
            deleteButton.setHidden(managementMode);
            deleteButton.setDisabled(true);
        }

        if (goUpButton) goUpButton.setDisabled(this.sharedByMeMode || this.currentFolderPath.length === 0);

        if (shareButton) shareButton.setHidden(managementMode);
        if (revokeShareButton) revokeShareButton.setHidden(!this.sharedByMeMode);
        if (moveButton) moveButton.setHidden(managementMode);
        if (compressButton) compressButton.setHidden(managementMode);
        if (pdfStudioButton) pdfStudioButton.setHidden(managementMode);
        if (mediaConversionButton) mediaConversionButton.setHidden(managementMode);
        if (documentConversionButton) documentConversionButton.setHidden(managementMode);
        if (contentIntelligenceButton) contentIntelligenceButton.setHidden(managementMode);
        if (selectionActionSeparator) selectionActionSeparator.setHidden(managementMode);
        if (fileManagementSeparator) fileManagementSeparator.setHidden(false);

        this.setModeColumnVisible('sharedWithColumn', this.sharedByMeMode);
        this.setModeColumnVisible('permissionColumn', this.sharedByMeMode);
        this.setModeColumnVisible('shareStatusColumn', this.sharedByMeMode);
        this.setModeColumnVisible('sharedAtColumn', this.sharedByMeMode);
        this.setModeColumnVisible('expiresAtColumn', this.sharedByMeMode);
        this.applyResponsiveColumns();

        if (this.rendered && !this.destroyed && !this.destroying) {
            this.updateLayout();
        }
    },

    setModeColumnVisible: function (itemId, visible) {
        const column = this.down(`#${itemId}`);
        if (!column) {
            return;
        }

        column.responsiveOriginalHidden = !visible;

        if (column.setVisible) {
            column.setVisible(visible);
        } else if (column.setHidden) {
            column.setHidden(!visible);
        } else {
            column.hidden = !visible;
        }
    },

    isMediaConversionRecord: function (record) {
        if (!record || !record.get || record.get('isFolder') || record.get('isUpDirectory')) {
            return false;
        }

        const mimetype = String(record.get('mimetype') || '').toLowerCase();
        return mimetype.indexOf('audio/') === 0 ||
            mimetype.indexOf('video/') === 0 ||
            mimetype.indexOf('image/') === 0;
    },

    isContentIntelligenceRecord: function (record) {
        if (!record || !record.get || record.get('isFolder') || record.get('isUpDirectory') || record.get('isUploadPlaceholder')) {
            return false;
        }

        const mimetype = String(record.get('mimetype') || '').toLowerCase();
        const name = String(record.get('name') || '').toLowerCase();

        if (mimetype.indexOf('video/') === 0 || mimetype.indexOf('audio/') === 0) {
            return false;
        }

        if (/\.(zip|rar|7z|tar|gz|bz2|xz)$/i.test(name) ||
            /zip|rar|7z|tar|gzip|compressed/.test(mimetype)) {
            return false;
        }

        return mimetype === 'application/pdf' ||
            mimetype.indexOf('image/') === 0 ||
            mimetype.indexOf('text/') === 0 ||
            mimetype === 'application/json' ||
            mimetype === 'application/xml' ||
            mimetype === 'application/javascript' ||
            mimetype.indexOf('word') !== -1 ||
            mimetype.indexOf('excel') !== -1 ||
            mimetype.indexOf('powerpoint') !== -1 ||
            mimetype.indexOf('spreadsheet') !== -1 ||
            mimetype.indexOf('presentation') !== -1 ||
            mimetype.indexOf('opendocument') !== -1 ||
            /\.(pdf|doc|docx|odt|rtf|txt|md|markdown|html|htm|csv|json|xml|xls|xlsx|ods|ppt|pptx|odp|png|jpg|jpeg|gif|bmp|tif|tiff|webp)$/i.test(name);
    },

    getDocumentConversionTargetValuesForRecord: function (record) {
        if (!record || !record.get || record.get('isFolder') || record.get('isUpDirectory')) {
            return [];
        }

        const mimetype = String(record.get('mimetype') || '').toLowerCase();
        const name = String(record.get('name') || '').toLowerCase();

        const isPdf = mimetype === 'application/pdf' || /\.pdf$/i.test(name);
        const isWord = mimetype.indexOf('word') !== -1 ||
            mimetype.indexOf('opendocument.text') !== -1 ||
            /\.(doc|docx|odt|rtf)$/i.test(name);
        const isSpreadsheet = mimetype.indexOf('excel') !== -1 ||
            mimetype.indexOf('spreadsheet') !== -1 ||
            mimetype === 'text/csv' ||
            /\.(xls|xlsx|ods|csv)$/i.test(name);
        const isPresentation = mimetype.indexOf('powerpoint') !== -1 ||
            mimetype.indexOf('presentation') !== -1 ||
            mimetype.indexOf('opendocument.presentation') !== -1 ||
            /\.(ppt|pptx|odp)$/i.test(name);
        const isMarkdown = mimetype === 'text/markdown' || /\.(md|markdown)$/i.test(name);
        const isHtml = mimetype === 'text/html' || mimetype === 'application/xhtml+xml' || /\.(html?|xhtml)$/i.test(name);
        const isPlainText = mimetype === 'text/plain' || /\.txt$/i.test(name);

        if (isPdf) {
            return ['docx', 'xlsx', 'pptx', 'txt', 'md', 'rtf', 'csv', 'webhtml'];
        }

        if (isWord) {
            const formats = ['pdf', 'webhtml', 'txt', 'md'];
            if (!/\.rtf$/i.test(name)) {
                formats.push('rtf');
            }
            if (!/\.docx$/i.test(name)) {
                formats.push('docx');
            }
            return formats;
        }

        if (isSpreadsheet) {
            const formats = ['pdf', 'webhtml'];
            if (!/\.xlsx$/i.test(name)) {
                formats.push('xlsx');
            }
            if (!/\.csv$/i.test(name)) {
                formats.push('csv');
            }
            return formats;
        }

        if (isPresentation) {
            const formats = ['pdf', 'webhtml'];
            if (!/\.pptx$/i.test(name)) {
                formats.push('pptx');
            }
            return formats;
        }

        if (isMarkdown) {
            return ['pdf', 'webhtml', 'docx', 'txt', 'rtf'];
        }

        if (isHtml) {
            return ['pdf', 'webhtml', 'docx', 'txt', 'md', 'rtf'];
        }

        if (isPlainText) {
            return ['pdf', 'webhtml', 'docx', 'md', 'rtf'];
        }

        return [];
    },

    getDocumentConversionTargetOptions: function (selected) {
        selected = selected || this.getSelectionModel().getSelection();
        if (!selected.length) {
            return [];
        }

        const targetMetadata = {
            pdf: {
                value: 'pdf',
                label: 'PDF',
                description: 'Portable document output with layout preserved through LibreOffice.'
            },
            webhtml: {
                value: 'webhtml',
                label: 'HTML Web Preview',
                description: 'Self-contained browser preview with embedded page images.'
            },
            docx: {
                value: 'docx',
                label: 'Word DOCX',
                description: 'Editable Word document output.'
            },
            xlsx: {
                value: 'xlsx',
                label: 'Excel XLSX',
                description: 'Workbook output. PDF sources preserve page visuals and extracted text.'
            },
            pptx: {
                value: 'pptx',
                label: 'PowerPoint PPTX',
                description: 'Presentation output. PDF sources preserve each page as a slide.'
            },
            txt: {
                value: 'txt',
                label: 'Plain Text TXT',
                description: 'Plain text extraction.'
            },
            md: {
                value: 'md',
                label: 'Markdown MD',
                description: 'Markdown text output.'
            },
            rtf: {
                value: 'rtf',
                label: 'Rich Text RTF',
                description: 'Rich text document output.'
            },
            csv: {
                value: 'csv',
                label: 'CSV',
                description: 'Comma-separated text rows.'
            }
        };

        const intersection = selected.reduce(function (currentTargets, record) {
            const nextTargets = this.getDocumentConversionTargetValuesForRecord(record);

            if (!currentTargets) {
                return nextTargets.slice();
            }

            return currentTargets.filter(function (value) {
                return nextTargets.indexOf(value) !== -1;
            });
        }.bind(this), null) || [];

        return intersection
            .map(function (value) {
                return targetMetadata[value];
            })
            .filter(Boolean);
    },

    isDocumentConversionRecord: function (record) {
        return this.getDocumentConversionTargetValuesForRecord(record).length > 0;
    },

    hasDocumentConversionSelection: function (selected) {
        selected = selected || this.getSelectionModel().getSelection();

        if (!selected.length) {
            return false;
        }

        return selected.every(function (record) {
            return this.isDocumentConversionRecord(record);
        }, this) && this.getDocumentConversionTargetOptions(selected).length > 0;
    },

    isPdfStudioRecord: function (record) {
        if (!record || !record.get || record.get('isFolder') || record.get('isUpDirectory')) {
            return false;
        }

        const mimetype = String(record.get('mimetype') || '').toLowerCase();
        const name = String(record.get('name') || '').toLowerCase();

        return mimetype === 'application/pdf' ||
            mimetype.indexOf('image/') === 0 ||
            mimetype.indexOf('text/') === 0 ||
            mimetype === 'application/json' ||
            mimetype === 'application/xml' ||
            mimetype === 'application/javascript' ||
            mimetype.indexOf('word') !== -1 ||
            mimetype.indexOf('excel') !== -1 ||
            mimetype.indexOf('powerpoint') !== -1 ||
            mimetype.indexOf('spreadsheet') !== -1 ||
            mimetype.indexOf('presentation') !== -1 ||
            /\.(pdf|doc|docx|odt|rtf|txt|md|html|htm|csv|json|xml|xls|xlsx|ods|ppt|pptx|odp)$/i.test(name);
    },

    hasPdfStudioSelection: function (selected) {
        selected = selected || this.getSelectionModel().getSelection();
        return selected.length > 0 && selected.every(record => this.isPdfStudioRecord(record));
    },

    updateSelectionActions: function (selected) {
        selected = selected || this.getSelectionModel().getSelection();

        const hasSelection = selected.length > 0;
        const hasSharedSelection = selected.some(record => record.get('isShared'));
        const hasUpDirectory = selected.some(record => record.get('isUpDirectory'));
        const hasUploadPlaceholder = selected.some(record => record.get('isUploadPlaceholder'));
        const hasDeletedItem = selected.some(record => record.get('itemDeleted'));
        const hasFolder = selected.some(record => record.get('isFolder'));
        const hasViewOnlyShare = selected.some(record => record.get('isShared') && record.get('permission') !== 'download');
        const managementMode = this.sharedMode || this.sharedByMeMode;
        const hasRevocableShareSelection = this.hasRevocableShareSelection(selected);

        var deleteButton = this.down('#deleteButton');
        if (deleteButton) deleteButton.setDisabled(!hasSelection || hasSharedSelection || hasUpDirectory || hasUploadPlaceholder || managementMode);

        var compressButton = this.down('#compressButton');
        if (compressButton) compressButton.setDisabled(!hasSelection || hasSharedSelection || hasUpDirectory || hasUploadPlaceholder || managementMode);

        var pdfStudioButton = this.down('#pdfStudioButton');
        if (pdfStudioButton) {
            pdfStudioButton.setDisabled(
                !this.hasPdfStudioSelection(selected) ||
                hasFolder ||
                hasSharedSelection ||
                hasUpDirectory ||
                hasUploadPlaceholder ||
                managementMode
            );
        }

        var mediaConversionButton = this.down('#mediaConversionButton');
        if (mediaConversionButton) {
            mediaConversionButton.setDisabled(
                selected.length !== 1 ||
                !this.isMediaConversionRecord(selected[0]) ||
                hasSharedSelection ||
                hasUpDirectory ||
                hasUploadPlaceholder ||
                managementMode
            );
        }

        var documentConversionButton = this.down('#documentConversionButton');
        if (documentConversionButton) {
            documentConversionButton.setDisabled(
                !this.hasDocumentConversionSelection(selected) ||
                hasFolder ||
                hasSharedSelection ||
                hasUpDirectory ||
                hasUploadPlaceholder ||
                managementMode
            );
        }

        var contentIntelligenceButton = this.down('#contentIntelligenceButton');
        if (contentIntelligenceButton) {
            contentIntelligenceButton.setDisabled(
                selected.length !== 1 ||
                !this.isContentIntelligenceRecord(selected[0]) ||
                hasSharedSelection ||
                hasUpDirectory ||
                hasUploadPlaceholder ||
                managementMode
            );
        }

        var downloadButton = this.down('#downloadButton');
        if (downloadButton) downloadButton.setDisabled(!hasSelection || hasUpDirectory || hasUploadPlaceholder || hasDeletedItem || hasViewOnlyShare || (hasSharedSelection && (hasFolder || selected.length > 1)));

        var moveButton = this.down('#moveItemsButton');
        if (moveButton) moveButton.setDisabled(!hasSelection || hasSharedSelection || hasUpDirectory || hasUploadPlaceholder || managementMode);

        var shareButton = this.down('#shareItemButton');
        if (shareButton) shareButton.setDisabled(selected.length !== 1 || hasSharedSelection || hasUpDirectory || hasUploadPlaceholder || managementMode);

        var revokeShareButton = this.down('#revokeShareButton');
        if (revokeShareButton) {
            revokeShareButton.setHidden(!(this.sharedByMeMode || hasRevocableShareSelection));
            revokeShareButton.setDisabled(!hasRevocableShareSelection);
        }
    },

    getRevocableShareTarget: function (record) {
        const result = {
            shareIds: [],
            itemTarget: null,
            publicLinkTarget: null
        };

        if (!record || !record.get || (!record.get('isSharedByMe') && !this.sharedByMeMode)) {
            return result;
        }

        const directShareId = record.get('shareId');
        if (directShareId) {
            result.shareIds.push(directShareId);
        }

        const outgoingShareIds = record.get('outgoingShareIds');
        if (Ext.isArray(outgoingShareIds)) {
            result.shareIds = result.shareIds.concat(outgoingShareIds.filter(Boolean));
        } else if (typeof outgoingShareIds === 'string' && outgoingShareIds.length > 0) {
            result.shareIds = result.shareIds.concat(
                outgoingShareIds.split(',').map(shareId => Ext.String.trim(shareId)).filter(Boolean)
            );
        }

        result.shareIds = Ext.Array.unique(result.shareIds);

        const publicLinkIds = record.get('publicLinkIds');
        const hasPublicLink = record.get('hasPublicLink') ||
            record.get('shareKind') === 'publicLink' ||
            !!record.get('publicLinkId') ||
            (Ext.isArray(publicLinkIds) && publicLinkIds.length > 0) ||
            (typeof publicLinkIds === 'string' && publicLinkIds.length > 0);

        if (record.get('id')) {
            const itemTarget = {
                itemId: record.get('id'),
                itemType: record.get('isFolder') ? 'folder' : 'file',
                workspaceId: record.get('workspaceId') || this.getWorkspaceId()
            };

            if (hasPublicLink) {
                result.publicLinkTarget = itemTarget;
            }

            if (!hasPublicLink && result.shareIds.length === 0) {
                result.itemTarget = itemTarget;
            }
        }

        return result;
    },

    getRevocableShareIds: function (record) {
        return this.getRevocableShareTarget(record).shareIds;
    },

    hasRevocableShareSelection: function (selected) {
        selected = selected || this.getSelectionModel().getSelection();

        return selected.length > 0 && selected.every(record => {
            const target = this.getRevocableShareTarget(record);
            return target.shareIds.length > 0 || !!target.itemTarget || !!target.publicLinkTarget;
        });
    },

    onDeleteFiles: function () {
        FileManagement.components.actions.FileGridActions.onDeleteFiles(this);
    },

    onRenameFile: function () {
        FileManagement.components.actions.FileGridActions.onRenameFile(this);
    },

    onCompressSelectedFiles: function () {
        FileManagement.components.actions.FileGridActions.onCompressSelectedFiles(this);
    },

    downloadFileInChunks: function (filePath, fileName, token, chunkSize) {
        return FileManagement.components.utils.FileGridUtils.downloadFileInChunks(filePath, fileName, token, chunkSize, this);
    },

    concatenateChunks: function (chunks) {
        return FileManagement.components.utils.FileGridUtils.concatenateChunks(chunks);
    },

    moveItem: function (selectedItems, targetRecord) {
        return FileManagement.components.utils.FileGridUtils.moveItem(selectedItems, targetRecord, this);
    },

    // FileGrid.js
    onFileDoubleClick: function (record) {
        if (!record) return;
        if (record.get('isUploadPlaceholder')) return;

        const fileId = record.get('id');

        // Check if file/folder is password protected and not already verified
        if (record.get('isPasswordProtected') && !FileManagement.components.utils.AccessTracker.isItemVerified(fileId)) {
            FileManagement.components.utils.PasswordPromptUtil.showPasswordPrompt({
                itemId: fileId,
                isFolder: record.get('isFolder'),
                action: 'removePassword',
                onSuccess: () => {
                    this.handleItemDblClick(record);
                }
            });
        } else {
            this.handleItemDblClick(record);
        }
    },

    handleItemDblClick: function (record) {
        if (record.get('isFolder')) {
            if (this.sharedByMeMode) {
                const fileExplorer = FileManagement.components.utils.PanelUtils.openFileExplorer();
                if (fileExplorer) {
                    fileExplorer.navigateToFolderRecord(record);
                }
                return;
            }

            this.navigateToFolderRecord(record);
        } else {
            const fileId = record.get('id');
            const mainPanel = Ext.getCmp('mainPanelRegion');

            if (!mainPanel) {
                Ext.Msg.alert('Error', 'Main panel not found.');
                return;
            }

            // Check if a viewer for this file is already open
            const existingViewer = mainPanel.items.findBy(item => item.fileId === fileId);
            if (existingViewer) {
                FileManagement.components.utils.PanelUtils.bringPanelForward(existingViewer);
                return;
            }

            // Create and add the new viewer panel
            const viewer = FileManagement.components.viewers.ViewerFactory.createViewer(record);
            if (viewer) {
                viewer.fileId = fileId;
                viewer.show();

                const toolbar = Ext.ComponentQuery.query('userToolbar')[0];
                if (toolbar) {
                    toolbar.addPanelToggleButton(viewer, record.get('name'), record.get('icon'));
                }
            }
        }
    },

    navigateToFolderRecord: function (record) {
        const recordId = record.get('id');
        this.currentFolderPath = this.resolveFolderPath(record);
        this.loadFolderContents(null, recordId, false);
    },

    resolveFolderPath: function (record) {
        const recordId = record.get('id');
        const recordName = record.get('name');
        const ancestors = record.get('ancestors');

        if (Array.isArray(ancestors) && ancestors.length > 0) {
            const ancestorPath = ancestors.map(segment => ({
                id: segment.id,
                name: segment.name
            }));
            const lastSegment = ancestorPath[ancestorPath.length - 1];

            if (!lastSegment || lastSegment.id !== recordId) {
                ancestorPath.push({
                    id: recordId,
                    name: recordName
                });
            }

            return ancestorPath;
        }

        if (!this.sharedMode && !this.sharedByMeMode) {
            return this.appendFolderToCurrentPath(recordId, recordName);
        }

        const nextPath = Array.isArray(this.currentFolderPath)
            ? this.currentFolderPath.slice()
            : [];
        const parentId = record.get('parent_id') || null;
        const currentFolderId = this.currentFolderId || null;
        const lastSegment = nextPath[nextPath.length - 1];
        const isDirectChild = parentId === currentFolderId;

        if (isDirectChild) {
            if (!lastSegment || lastSegment.id !== recordId) {
                nextPath.push({
                    id: recordId,
                    name: recordName
                });
            }

            return nextPath;
        }

        return [{
            id: recordId,
            name: recordName
        }];
    },

    appendFolderToCurrentPath: function (recordId, recordName) {
        const nextPath = Array.isArray(this.currentFolderPath)
            ? this.currentFolderPath.slice()
            : [];
        const existingIndex = nextPath.findIndex(segment => segment.id === recordId);

        if (existingIndex >= 0) {
            return nextPath.slice(0, existingIndex + 1);
        }

        nextPath.push({
            id: recordId,
            name: recordName
        });

        return nextPath;
    },

    // Function to load the contents of a folder
    loadFolderContents: function (folderName, folderId, pushToPath = true) {
        // Only push the folder to currentFolderPath if explicitly allowed
        if (folderName !== null && folderId !== this.currentFolderId && pushToPath) {
            this.currentFolderPath.push({ name: folderName, id: folderId });
        }

        this.currentFolder = this.currentFolderPath.map(segment => segment.name).join('/') || '';
        this.currentFolderId = folderId ?? '';

        this.updateBreadcrumb(this.currentFolderPath);

        const store = this.getStore();
        if (!store) return;

        store.getProxy().setExtraParams(this.buildStoreParams());

        store.load({
            callback: function (records, operation, success) {
                if (!success) {
                    Ext.Msg.alert('Error', `Failed to load contents of folder "${folderName}".`);
                }
            }
        });

        const goUpButton = this.down('#goUpButton');
        if (goUpButton) {
            goUpButton.setDisabled(this.sharedByMeMode || this.currentFolderPath.length === 0);
        }
    },

    navigateUp: function () {
        if (this.currentFolderPath.length > 1) {
            // Remove the last folder from the current folder path
            this.currentFolderPath.pop();

            // Update `currentFolder` based on the new path
            const folderId = this.currentFolderPath.length > 0 ? this.currentFolderPath[this.currentFolderPath.length - 1].id : null;
            this.currentFolder = this.currentFolderPath.map(segment => segment.name).join('/') || '';

            // Load the contents of the parent folder
            this.loadFolderContents(null, folderId, false);
        } else if (this.currentFolderPath.length === 1) {
            // If only one folder remains, navigate to root
            this.navigateToRoot();
        } else {
            Ext.Msg.alert('Info', 'You are already in the root folder.');
        }
    },

    moveItemsHandler: function () {
        const grid = this;
        const selected = grid.getSelectionModel().getSelection();

        if (selected.length === 0) {
            Ext.Msg.alert('Error', 'No items selected for moving.');
            return;
        }

        Ext.create('Ext.window.Window', {
            title: 'Move Item',
            modal: true,
            frame: true,
            layout: 'fit',
            width: 400,
            height: 300,
            items: [
                {
                    xtype: 'treepanel',
                    store: Ext.create('FileManagement.components.stores.FolderTreeStore'),
                    listeners: {
                        select: function (tree, record) {
                            // Update the "Move To" button with the selected folder name
                            const moveButton = this.up('window').down('#moveButton');
                            moveButton.setText(`Move To "${record.get('text')}"`);
                            moveButton.setDisabled(false); // Enable the button when a folder is selected
                        }
                    }
                }
            ],
            bbar: [
                {
                    text: 'Move To', // Default button text
                    itemId: 'moveButton', // Unique ID for easy access
                    disabled: true, // Disabled by default until a folder is selected
                    handler: function (btn) {
                        const window = btn.up('window');
                        const tree = window.down('treepanel');
                        const selectedNode = tree.getSelectionModel().getSelection()[0]; // Get the selected folder

                        if (!selectedNode) {
                            Ext.Msg.alert('Error', 'Please select a target folder.');
                            return;
                        }

                        const fileGrid = grid;
                        const selectedItems = fileGrid.getSelectionModel().getSelection();

                        if (selectedItems.length === 0) {
                            Ext.Msg.alert('Error', 'No items selected for moving.');
                            return;
                        }

                        // Show loading mask
                        const mask = new Ext.LoadMask({
                            msg: 'Moving items...',
                            target: fileGrid
                        });
                        mask.show();

                        // Use the moveItem function
                        fileGrid.moveItem(selectedItems, selectedNode)
                            .then(function (response) {
                                mask.hide();
                                window.close();
                                fileGrid.getStore().reload();
                            }).catch(function (error) {
                                mask.hide();
                                Ext.Msg.alert('Error', error);
                            });
                    }
                },
                {
                    text: 'Cancel',
                    handler: function (btn) {
                        btn.up('window').close(); // Close the window
                    }
                }
            ]
        }).show();
    }
});
