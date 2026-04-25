Ext.define('FileManagement.components.actions.FileGridActions', {
    extend: 'Ext.panel.Panel',
    requires: [
        'FileManagement.components.utils.PasswordPromptUtil',
        'FileManagement.components.viewers.ViewerFactory',
        'FileManagement.components.utils.AccessTracker',
        'FileManagement.components.utils.PanelUtils',
        'FileManagement.components.dialogs.ShareItemDialog',
        'FileManagement.components.dialogs.PDFStudioDialog',
        'FileManagement.components.dialogs.MediaConversionDialog',
        'FileManagement.components.dialogs.DocumentConversionDialog',
        'FileManagement.components.status.ScanQueuePanel',
        'FileManagement.components.settings.UserSettings',
        'FileManagement.components.utils.ProgressBarManager',
        'FileManagement.components.utils.SocketManager'
    ],
    singleton: true,

    onDeleteFiles: function(grid) {
        const selectedRecords = grid.getSelectionModel().getSelection();
        if (selectedRecords.length === 0) return;

        Ext.Msg.confirm('Delete Files', 'Are you sure you want to delete the selected files?', function(btn) {
            if (btn === 'yes') {
                // Show loading mask
                grid.setLoading('Deleting files...');

                const token = FileManagement.helpers.Functions.getToken();
                const fileIds = selectedRecords.map(record => record.get('id'));

                Ext.Ajax.request({
                    url: FileManagementEnv.apiUrl('/api/files'),
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    jsonData: {
                        ids: fileIds,
                        workspaceId: grid && grid.getWorkspaceId ? grid.getWorkspaceId() : ''
                    },
                    success: function() {
                        grid.getStore().reload();
                        grid.setLoading(false);
                        FileManagement.components.utils.PanelUtils.refreshHomeDashboard();
                    },
                    failure: function(response) {
                        grid.setLoading(false);
                        Ext.Msg.alert('Error', 'Failed to delete files/folders.');
                    }
                });
            }
        });
    },

    onShareItem: function(grid) {
        const selectedRecord = grid.getSelectionModel().getSelection()[0];
        if (!selectedRecord || selectedRecord.get('isUpDirectory')) {
            Ext.Msg.alert('Share', 'Please select one file or folder to share.');
            return;
        }

        if (selectedRecord.get('isShared')) {
            Ext.Msg.alert('Share', 'Shared items can only be reshared by their owner.');
            return;
        }

        Ext.create('FileManagement.components.dialogs.ShareItemDialog', {
            record: selectedRecord,
            workspaceId: grid && grid.getWorkspaceId ? grid.getWorkspaceId() : '',
            onSuccess: function() {
                grid.getStore().reload();
            }
        }).show();
    },

    onRevokeShares: function(grid) {
        const selectedRecords = grid.getSelectionModel().getSelection();
        const shareRecords = selectedRecords
            .map(record => {
                const target = grid.getRevocableShareTarget
                    ? grid.getRevocableShareTarget(record)
                    : {
                        shareIds: record.get('shareId') ? [record.get('shareId')] : [],
                        itemTarget: record.get('id') ? {
                            itemId: record.get('id'),
                            itemType: record.get('isFolder') ? 'folder' : 'file'
                        } : null
                    };

                return {
                    record,
                    shareIds: target.shareIds || [],
                    itemTarget: target.itemTarget || null,
                    publicLinkTarget: target.publicLinkTarget || null
                };
            })
            .filter(entry => entry.shareIds.length > 0 || entry.itemTarget || entry.publicLinkTarget);

        if (!shareRecords.length) {
            Ext.Msg.alert('Revoke Share', 'Please select one shared item to revoke.');
            return;
        }

        const shareIdsById = {};
        const itemTargetsByKey = {};
        const publicLinkTargetsByKey = {};
        Ext.Array.each(shareRecords, function(entry) {
            Ext.Array.each(entry.shareIds, function(shareId) {
                shareIdsById[shareId] = shareId;
            });

            if (entry.shareIds.length === 0 && entry.itemTarget) {
                itemTargetsByKey[`${entry.itemTarget.itemType}:${entry.itemTarget.itemId}`] = entry.itemTarget;
            }

            if (entry.publicLinkTarget) {
                publicLinkTargetsByKey[`${entry.publicLinkTarget.itemType}:${entry.publicLinkTarget.itemId}`] = entry.publicLinkTarget;
            }
        });

        const shareIds = Object.keys(shareIdsById).map(shareId => shareIdsById[shareId]);
        const itemTargets = Object.keys(itemTargetsByKey).map(key => itemTargetsByKey[key]);
        const publicLinkTargets = Object.keys(publicLinkTargetsByKey).map(key => publicLinkTargetsByKey[key]);
        const firstRecord = shareRecords[0].record;
        const itemName = shareRecords.length === 1 ? Ext.String.htmlEncode(firstRecord.get('name')) : '';
        const recipientName = shareRecords.length === 1 ? Ext.String.htmlEncode(firstRecord.get('sharedWithList') || firstRecord.get('sharedWith') || 'all recipients') : '';
        const revokeCount = shareIds.length + itemTargets.length + publicLinkTargets.length;
        const message = shareRecords.length === 1
            ? `Stop sharing "${itemName}" with ${recipientName}?`
            : `Stop sharing ${shareRecords.length} selected items? This will revoke ${revokeCount} share target${revokeCount !== 1 ? 's' : ''}.`;

        Ext.Msg.confirm('Revoke Share', message, function(btn) {
            if (btn !== 'yes') {
                return;
            }

            const token = FileManagement.helpers.Functions.getToken();
            let pending = shareIds.length + itemTargets.length + publicLinkTargets.length;
            let failed = 0;

            grid.setLoading('Revoking share...');

            const finishOne = function(success) {
                if (!success) {
                    failed += 1;
                }

                pending -= 1;
                if (pending > 0) {
                    return;
                }

                grid.setLoading(false);
                grid.getStore().reload();

                if (failed > 0) {
                    Ext.Msg.alert('Revoke Share', `${failed} revoke request${failed !== 1 ? 's' : ''} failed.`);
                }
            };

            Ext.Array.each(shareIds, function(shareId) {
                Ext.Ajax.request({
                    url: FileManagementEnv.apiUrl(`/api/files/share/${shareId}`),
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    },
                    callback: function(options, success) {
                        finishOne(success);
                    }
                });
            });

            Ext.Array.each(itemTargets, function(itemTarget) {
                const workspaceQuery = itemTarget.workspaceId
                    ? `?workspaceId=${encodeURIComponent(itemTarget.workspaceId)}`
                    : '';
                Ext.Ajax.request({
                    url: FileManagementEnv.apiUrl(`/api/files/share/item/${itemTarget.itemType}/${itemTarget.itemId}${workspaceQuery}`),
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    },
                    callback: function(options, success) {
                        finishOne(success);
                    }
                });
            });

            Ext.Array.each(publicLinkTargets, function(itemTarget) {
                const workspaceQuery = itemTarget.workspaceId
                    ? `?workspaceId=${encodeURIComponent(itemTarget.workspaceId)}`
                    : '';
                Ext.Ajax.request({
                    url: FileManagementEnv.apiUrl(`/api/files/share-link/item/${itemTarget.itemType}/${itemTarget.itemId}${workspaceQuery}`),
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    },
                    callback: function(options, success) {
                        finishOne(success);
                    }
                });
            });
        });
    },

    onRenameFile: function(grid) {
        const selectedRecord = grid.getSelectionModel().getSelection()[0];
        if (!selectedRecord) return;

        Ext.Msg.prompt('Rename', 'Enter new name:', function(btn, text) {
            if (btn === 'ok' && text) {
                const token = FileManagement.helpers.Functions.getToken();
                
                Ext.Ajax.request({
                    url: FileManagementEnv.apiUrl('/api/files/rename'),
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    jsonData: {
                        itemId: selectedRecord.get('id'),
                        newName: text,
                        isFolder: selectedRecord.get('isFolder'),
                        workspaceId: grid && grid.getWorkspaceId ? grid.getWorkspaceId() : ''
                    },
                    success: function() {
                        grid.getStore().reload();
                        FileManagement.components.utils.PanelUtils.refreshHomeDashboard();
                    },
                    failure: function(response) {
                        const responseJson = Ext.decode(response.responseText, true) || {};
                        Ext.Msg.alert('Error', responseJson.message || 'Failed to rename file/folder.');
                    }
                });
            }
        }, null, null, selectedRecord.get('name'));
    },

    onRequestVirusScan: function(grid) {
        const selectedRecord = grid.getSelectionModel().getSelection()[0];

        if (!selectedRecord || selectedRecord.get('isFolder') || selectedRecord.get('isUpDirectory')) {
            Ext.Msg.alert('Virus Scan', 'Please select one file to scan.');
            return;
        }

        const token = FileManagement.helpers.Functions.getToken();
        grid.setLoading('Queueing virus scan...');

        Ext.Ajax.request({
            url: FileManagementEnv.apiUrl(`/api/files/scan/${selectedRecord.get('id')}`),
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            success: function(response) {
                grid.setLoading(false);

                const result = Ext.decode(response.responseText, true) || {};
                if (!result.success) {
                    Ext.Msg.alert('Virus Scan', result.error || 'Failed to queue virus scan.');
                    return;
                }

                FileManagement.components.actions.FileGridActions.syncVirusScanActivity(selectedRecord, result);

                if (result.queued === false) {
                    const status = String(result.status || '').toLowerCase();
                    if (status === 'clean') {
                        Ext.Msg.alert('Virus Scan', `"${selectedRecord.get('name')}" was already scanned and no threats were found.`);
                    } else if (status === 'infected') {
                        Ext.Msg.alert('Virus Scan', `"${selectedRecord.get('name')}" failed virus scanning and is not available.`);
                    } else {
                        Ext.Msg.alert('Virus Scan', `"${selectedRecord.get('name')}" is already queued for scanning.`);
                    }
                    return;
                }

                Ext.Msg.alert('Virus Scan', `"${selectedRecord.get('name')}" was added to the virus scan queue.`);
            },
            failure: function(response) {
                grid.setLoading(false);
                const result = Ext.decode(response.responseText, true) || {};
                Ext.Msg.alert('Virus Scan', result.error || 'Failed to queue virus scan.');
            }
        });
    },

    syncVirusScanActivity: function(record, result) {
        const status = String(result.status || '').toLowerCase();
        if (!record || !['pending', 'scanning', 'clean', 'infected', 'error'].includes(status)) {
            return;
        }

        const scanPanel = FileManagement.components.status && FileManagement.components.status.ScanQueuePanel;
        if (!scanPanel || !scanPanel.handleScanUpdate) {
            return;
        }

        scanPanel.handleScanUpdate({
            fileId: result.fileId || record.get('id'),
            fileName: result.fileName || record.get('name'),
            filePath: result.filePath || record.get('path') || '',
            parentId: result.parentId || record.get('parent_id') || null,
            workspaceId: result.workspaceId || record.get('workspaceId') || '',
            mimetype: result.mimetype || record.get('mimetype') || '',
            size: result.size || record.get('size') || 0,
            status,
            progress: result.progress || (status === 'clean' ? 100 : 0),
            result: result.result || null
        });
    },

    onViewFile: function(grid, record) {
        if (!record) {
            record = grid.getSelectionModel().getSelection()[0];
            if (!record) {
                Ext.Msg.alert('Error', 'No file selected.');
                return;
            }
        }

        if (record.get('isFolder')) {
            Ext.Msg.alert('Error', 'Cannot view folders. Please select a file.');
            return;
        }

        const fileId = record.get('id');
        const mainPanel = Ext.getCmp('mainPanelRegion');

        if (!mainPanel) {
            Ext.Msg.alert('Error', 'Main panel not found.');
            return;
        }

        try {
            // Check if a viewer for this file is already open
            const existingViewer = mainPanel.items.findBy(item => item.fileId === fileId);
            if (existingViewer) {
                FileManagement.components.utils.PanelUtils.bringPanelForward(existingViewer);
                return;
            }

            if (this.shouldScanSharedFileBeforeOpen(record)) {
                this.requestSharedScanBeforeOpen(grid, record, () => {
                    this.onViewFile(grid, record);
                });
                return;
            }

            // Check if file is password protected and not already verified
            if (record.get('isPasswordProtected') && !FileManagement.components.utils.AccessTracker.isItemVerified(fileId)) {
                FileManagement.components.utils.PasswordPromptUtil.showPasswordPrompt({
                    itemId: fileId,
                    isFolder: false,
                    onSuccess: () => {
                        this.createAndShowViewer(mainPanel, record);
                    }
                });
            } else {
                this.createAndShowViewer(mainPanel, record);
            }
        } catch (error) {
            console.error('Error viewing file:', error);
            Ext.Msg.alert('Error', 'Failed to view file.');
        }
    },

    shouldScanSharedFileBeforeOpen: function(record) {
        if (!record || !record.get || !record.get('isShared') || record.get('isFolder')) {
            return false;
        }

        const settings = FileManagement.components.settings && FileManagement.components.settings.UserSettings;
        if (settings && settings.get && settings.get('scanning.scanSharedBeforeOpen', true) === false) {
            return false;
        }

        const status = String(record.get('scanStatus') || '').toLowerCase();
        return status !== 'clean';
    },

    requestSharedScanBeforeOpen: function(grid, record, onReady) {
        const token = FileManagement.helpers.Functions.getToken();
        const fileName = record.get('name') || 'shared file';

        if (grid && grid.setLoading) {
            grid.setLoading('Checking shared file scan...');
        }

        Ext.Ajax.request({
            url: FileManagementEnv.apiUrl(`/api/files/scan/${record.get('id')}`),
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            success: (response) => {
                if (grid && grid.setLoading) {
                    grid.setLoading(false);
                }

                const result = Ext.decode(response.responseText, true) || {};
                const status = String(result.status || '').toLowerCase();

                if (result.success === false) {
                    Ext.Msg.alert('Virus Scan', result.error || 'Failed to check the shared file scan status.');
                    return;
                }

                this.syncVirusScanActivity(record, result);

                if (record.set && status) {
                    record.set('scanStatus', status);
                    record.set('scanProgress', result.progress || (status === 'clean' ? 100 : 0));
                    record.set('scanResult', result.result || null);
                }

                if (status === 'clean') {
                    if (onReady) {
                        onReady();
                    }
                    return;
                }

                if (status === 'infected') {
                    Ext.Msg.alert('Virus Scan', `"${fileName}" failed virus scanning and is not available.`);
                    return;
                }

                Ext.Msg.alert(
                    'Virus Scan',
                    result.queued === false
                        ? `"${fileName}" is already being scanned. Please try again when the scan completes.`
                        : `"${fileName}" was queued for virus scanning. Please open it again when the scan completes.`
                );
            },
            failure: (response) => {
                if (grid && grid.setLoading) {
                    grid.setLoading(false);
                }

                const result = Ext.decode(response.responseText, true) || {};
                const errorMessage = result.error || result.message || 'Failed to check the shared file scan status.';

                if (String(errorMessage).toLowerCase().indexOf('disabled') !== -1 && onReady) {
                    if (record.set) {
                        record.set('scanStatus', 'clean');
                    }
                    onReady();
                    return;
                }

                Ext.Msg.alert('Virus Scan', errorMessage);
            }
        });
    },

    createAndShowViewer: function(mainPanel, record) {
        const fileId = record.get('id');
        try {
            // Create and show viewer after password verification
            const viewer = FileManagement.components.viewers.ViewerFactory.createViewer(record);
            if (viewer) {
                viewer.fileId = fileId;
                viewer.show();

                const toolbar = Ext.ComponentQuery.query('userToolbar')[0];
                if (toolbar) {
                    toolbar.addPanelToggleButton(viewer, record.get('name'), record.get('icon'));
                }
            }
        } catch (error) {
            console.error('Error viewing file:', error);
            Ext.Msg.alert('Error', error.message || 'Failed to view file. Please try again.');
        }
    },

    onOpenFolder: function(grid, record) {
        if (!record) {
            record = grid.getSelectionModel().getSelection()[0];
            if (!record) {
                Ext.Msg.alert('Error', 'No folder selected.');
                return;
            }
        }

        if (!record.get('isFolder')) {
            Ext.Msg.alert('Error', 'Selected item is not a folder.');
            return;
        }

        const folderId = record.get('id');
        
        try {
            // Check if folder is password protected and not already verified
            if (record.get('isPasswordProtected') && !FileManagement.components.utils.AccessTracker.isItemVerified(folderId)) {
                FileManagement.components.utils.PasswordPromptUtil.showPasswordPrompt({
                    itemId: folderId,
                    isFolder: true,
                    onSuccess: () => {
                        grid.navigateToFolderRecord(record);
                    },
                    onFailure: (response) => {
                        console.error('Failed to verify folder password:', response);
                    }
                });
            } else {
                grid.navigateToFolderRecord(record);
            }
        } catch (error) {
            console.error('Error opening folder:', error);
            Ext.Msg.alert('Error', 'Failed to open folder.');
        }
    },

    onCompressSelectedFiles: function(grid) {
        const selectedRecords = grid.getSelectionModel().getSelection();
        if (selectedRecords.length === 0) return;

        // Filter out the up directory entry
        const validRecords = selectedRecords.filter(record => !record.get('isUpDirectory'));
        if (validRecords.length === 0) {
            Ext.Msg.alert('Error', 'Please select valid files or folders to compress.');
            return;
        }

        // Get file/folder info for compression
        // const items = validRecords.map(record => ({
        //     id: record.get('id'),
        //     type: record.get('isFolder') ? 'folder' : 'file',
        //     name: record.get('name')
        // }));

        // Use the CompressionDialog for better user experience
        const store = grid.getStore();
        store.compressSelected(
            grid,
            validRecords,
            grid.currentFolderId || null,
            grid.currentFolder || ''
        );
    },

    onPDFStudio: function(grid) {
        const selectedRecords = grid.getSelectionModel().getSelection()
            .filter(record => !record.get('isUpDirectory'));

        if (!selectedRecords.length) {
            Ext.Msg.alert('PDF Studio', 'Please select one or more files.');
            return;
        }

        if (!grid.hasPdfStudioSelection || !grid.hasPdfStudioSelection(selectedRecords)) {
            Ext.Msg.alert('PDF Studio', 'PDF Studio supports PDFs, images, text files, and Office documents.');
            return;
        }

        Ext.create('FileManagement.components.dialogs.PDFStudioDialog', {
            grid,
            selections: selectedRecords,
            currentFolderId: grid.currentFolderId || null,
            onSuccess: function() {
                grid.getStore().reload();
            }
        }).show();
    },

    onMediaConversionHub: function(grid) {
        const selectedRecords = grid.getSelectionModel().getSelection()
            .filter(record => !record.get('isUpDirectory'));
        const selectedRecord = selectedRecords[0];
        const isSupportedMedia = grid.isMediaConversionRecord && grid.isMediaConversionRecord(selectedRecord);

        if (selectedRecords.length !== 1 || !isSupportedMedia) {
            Ext.Msg.alert('Media Conversion Hub', 'Please select one audio, video, or image file.');
            return;
        }

        Ext.create('FileManagement.components.dialogs.MediaConversionDialog', {
            grid,
            record: selectedRecord,
            currentFolderId: grid.currentFolderId || null,
            onSuccess: function() {
                grid.getStore().reload();
            }
        }).show();
    },

    onDocumentConversionSuite: function(grid) {
        const selectedRecords = grid.getSelectionModel().getSelection()
            .filter(record => !record.get('isUpDirectory'));

        if (!selectedRecords.length) {
            Ext.Msg.alert('Document Conversion Suite', 'Please select one or more supported document files.');
            return;
        }

        if (!grid.hasDocumentConversionSelection || !grid.hasDocumentConversionSelection(selectedRecords)) {
            Ext.Msg.alert(
                'Document Conversion Suite',
                'Document Conversion Suite supports PDF, Office, text, Markdown, HTML, RTF, and CSV files with a shared target format.'
            );
            return;
        }

        Ext.create('FileManagement.components.dialogs.DocumentConversionDialog', {
            grid,
            selections: selectedRecords,
            currentFolderId: grid.currentFolderId || null,
            onSuccess: function() {
                grid.getStore().reload();
            }
        }).show();
    },

    onContentIntelligence: function(grid) {
        const selectedRecords = grid.getSelectionModel().getSelection()
            .filter(record => !record.get('isUpDirectory'));
        const selectedRecord = selectedRecords[0];

        if (selectedRecords.length !== 1 || !grid.isContentIntelligenceRecord || !grid.isContentIntelligenceRecord(selectedRecord)) {
            Ext.Msg.alert('Content Intelligence', 'Please select one supported document, PDF, image, or text file.');
            return;
        }

        const token = FileManagement.helpers.Functions.getToken();
        const progressId = `content-intelligence-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const fileName = selectedRecord.get('name') || 'file';
        const workspaceId = selectedRecord.get('workspaceId') || (grid.getWorkspaceId ? grid.getWorkspaceId() : '');

        FileManagement.components.utils.ProgressBarManager.addProgressBar(
            progressId,
            `Analyzing ${fileName}`,
            [{
                name: fileName,
                size: selectedRecord.get('size') || null,
                type: selectedRecord.get('type') || selectedRecord.get('mimetype') || '',
                path: selectedRecord.get('path') || '',
                status: 'Queued'
            }],
            function(progressBar) {
                FileManagement.components.utils.SocketManager.cancelOperation(
                    progressBar.jobId || null,
                    progressId,
                    'contentIntelligence'
                );
                return Promise.resolve();
            },
            {
                metadata: {
                    activityType: 'Content Intelligence'
                },
                onComplete: function() {
                    if (grid && grid.getStore) {
                        grid.getStore().reload();
                    }
                }
            }
        );

        grid.setLoading('Queueing content intelligence...');

        Ext.Ajax.request({
            url: FileManagementEnv.apiUrl(`/api/content-intelligence/files/${selectedRecord.get('id')}/extract`),
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            jsonData: {
                workspaceId,
                progressId
            },
            success: function(response) {
                grid.setLoading(false);
                const result = Ext.decode(response.responseText, true) || {};

                if (!result.success) {
                    FileManagement.components.utils.ProgressBarManager.removeProgressBar(progressId);
                    Ext.Msg.alert('Content Intelligence', result.error || 'Failed to queue content intelligence.');
                    return;
                }

                if (result.jobId) {
                    FileManagement.components.utils.ProgressBarManager.setJobId(progressId, result.jobId);
                }

                if (selectedRecord.set) {
                    selectedRecord.set('contentIntelligence', Ext.apply({}, selectedRecord.get('contentIntelligence') || {}, {
                        status: result.status || 'queued',
                        progress: result.progress || 0
                    }));
                }

                FileManagement.components.utils.ProgressBarManager.updateProgress(
                    progressId,
                    result.progress || 0,
                    result.message || `Queued ${fileName} for content intelligence`
                );

                if (result.queued === false) {
                    Ext.Msg.alert('Content Intelligence', result.message || `"${fileName}" is already queued for analysis.`);
                }
            },
            failure: function(response) {
                grid.setLoading(false);
                FileManagement.components.utils.ProgressBarManager.removeProgressBar(progressId);
                const result = Ext.decode(response.responseText, true) || {};
                Ext.Msg.alert('Content Intelligence', result.error || result.message || 'Failed to queue content intelligence.');
            }
        });
    }
});
