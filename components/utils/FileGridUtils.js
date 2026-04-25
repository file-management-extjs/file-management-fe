Ext.define('FileManagement.components.utils.FileGridUtils', {
    singleton: true,
	    requires: [
	        'FileManagement.helpers.Functions',
	        'FileManagement.components.utils.PanelUtils',
	        'FileManagement.components.utils.ProgressBarManager'
	    ],

    downloadFileInChunks: async function(fileRef, fileName, token, chunkSize, fileGrid = null) {
        const downloadRef = Ext.isObject(fileRef) ? fileRef : { filePath: fileRef };
        const progressId = `download-${fileName}`; // Use fileName for more readable ID
        const abortController = new AbortController();
        const grid = fileGrid && !fileGrid.destroyed && !fileGrid.destroying
            ? fileGrid
            : FileManagement.components.utils.PanelUtils.getPrimaryFileGrid();

        if (grid && grid.startDownloadIndicator) {
            grid.startDownloadIndicator(downloadRef, fileName, progressId);
        }

        // Add progress bar with cancel callback
        FileManagement.components.utils.ProgressBarManager.addProgressBar(
            progressId, 
            `Downloading ${fileName}`, 
            [{
                fileName: fileName,
                status: 'Queued',
                path: downloadRef.filePath || '',
                size: null
            }],
            function() {
                abortController.abort();
            },
            false
        );

        try {
            // First get the file size
            const metadataResponse = await fetch(FileManagementEnv.apiUrl('/api/files/file-size'), {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(downloadRef),
                signal: abortController.signal
            });

            if (!metadataResponse.ok) {
                throw new Error('Failed to fetch file size');
            }

            const { fileSize } = await metadataResponse.json();
            const progressBar = FileManagement.components.utils.ProgressBarManager.getProgressBar(progressId);
            if (progressBar && progressBar.files && progressBar.files[0]) {
                progressBar.files[0].size = fileSize || null;
            }

            // Set initial status
            FileManagement.components.utils.ProgressBarManager.updateQueuedStatus(
                progressId,
                fileName,
                'Downloading'
            );

            const chunks = [];
            let totalSize = 0;
            
            // Calculate optimal chunk size (max 2MB)
            const optimalChunkSize = Math.min(chunkSize, Math.max(256 * 1024, Math.floor(fileSize / 10)));

            while (totalSize < fileSize) {
                const end = Math.min(totalSize + optimalChunkSize - 1, fileSize - 1);
                
                const response = await fetch(FileManagementEnv.apiUrl('/api/files/download'), {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'Range': `bytes=${totalSize}-${end}`
                    },
                    body: JSON.stringify(downloadRef),
                    signal: abortController.signal
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const chunk = await response.arrayBuffer();
                if (chunk.byteLength === 0) {
                    throw new Error('Received empty chunk');
                }

                chunks.push(chunk);
                totalSize += chunk.byteLength;
                
                // Update progress for each chunk
                const progress = Math.round((totalSize / fileSize) * 100);
                FileManagement.components.utils.ProgressBarManager.updateProgress(
                    progressId,
                    progress,
                    `Downloading ${fileName}... ${progress}%`
                );
                if (grid && grid.updateDownloadIndicator) {
                    grid.updateDownloadIndicator(progressId, progress);
                }
            }

            // Combine chunks and create final blob
            const blob = new Blob(chunks, { type: 'application/octet-stream' });
            const url = window.URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            // Update final status
            FileManagement.components.utils.ProgressBarManager.updateProgress(
                progressId,
                100,
                `Downloaded ${fileName}`
            );
            if (grid && grid.updateDownloadIndicator) {
                grid.updateDownloadIndicator(progressId, 100);
            }

            // Keep progress bar visible briefly so user can see completion
            setTimeout(() => {
                FileManagement.components.utils.ProgressBarManager.removeProgressBar(progressId);
                if (grid && grid.finishDownloadIndicator) {
                    grid.finishDownloadIndicator(progressId, 'Downloaded');
                }
            }, 2000);

        } catch (error) {
            console.error('Download error:', error);
            if (error.name === 'AbortError') {
                if (grid && grid.finishDownloadIndicator) {
                    grid.finishDownloadIndicator(progressId, 'Cancelled', 900);
                }
                FileManagement.components.utils.ProgressBarManager.markActivityStatus(
                    progressId,
                    'cancelled',
                    'Cancelled'
                );
                FileManagement.components.utils.ProgressBarManager.updateQueuedStatus(
                    progressId,
                    fileName,
                    'Cancelled'
                );
                FileManagement.components.utils.ProgressBarManager.removeProgressBar(progressId);
            } else {
                if (grid && grid.finishDownloadIndicator) {
                    grid.finishDownloadIndicator(progressId, 'Failed', 1600);
                }
                FileManagement.components.utils.ProgressBarManager.markActivityStatus(
                    progressId,
                    'failed',
                    'Failed',
                    error.message || 'Download failed'
                );
                FileManagement.components.utils.ProgressBarManager.updateQueuedStatus(
                    progressId,
                    fileName,
                    'Failed'
                );
                FileManagement.components.utils.ProgressBarManager.removeProgressBar(progressId);
                Ext.Msg.alert('Error', `Download failed: ${error.message}`);
            }
            throw error;
        }
    },

    concatenateChunks: function(chunks) {
        return chunks.join('');
    },

    handleItemAccess: function(record, callback) {
        if (record.get('isLocked')) {
            // Show password prompt dialog
            Ext.create('FileManagement.components.dialogs.PasswordPromptDialog', {
                itemId: record.get('id'),
                itemName: record.get('name'),
                isFolder: record.get('isFolder'),
                onSuccess: callback
            }).show();
        } else {
            // If not password protected, proceed directly
            callback();
        }
    },

    moveItem: function(selectedItems, targetRecord, sourceGrid) {
        if (!targetRecord || !targetRecord.get('id')) {
            return Promise.reject('Invalid target folder');
        }

        const token = FileManagement.helpers.Functions.getToken();
        const targetFolderId = targetRecord.get('id');
        const targetFolderName = targetRecord.get('name') || targetRecord.get('text');
        
        return new Promise((resolve, reject) => {
            const isTargetZip = targetFolderName ? targetFolderName.endsWith('.zip') : false;
            const confirmMessage = isTargetZip ? 
                `Move items into "${targetFolderName}"?` :
                `Move items to "${targetFolderName}"?`;

            // First check if target is password protected
            this.handleItemAccess(targetRecord, () => {
                Ext.Msg.confirm('Move', confirmMessage, function(choice) {
	                    if (choice === 'yes') {
	                        const progressId = `moving-${Date.now()}`;
	                        // Prepare the data for the move operation
	                        const moveData = {
	                            itemIds: selectedItems.map(item => item.get('id')),
	                            targetId: targetFolderId,
	                            isTargetZip: isTargetZip,
	                            progressId,
                                workspaceId: sourceGrid && sourceGrid.getWorkspaceId ? sourceGrid.getWorkspaceId() : ''
	                        };

	                        FileManagement.components.utils.ProgressBarManager.addProgressBar(
	                            progressId,
	                            `Moving ${selectedItems.length} item${selectedItems.length === 1 ? '' : 's'}`,
	                            selectedItems.map(item => ({
	                                name: item.get('name'),
	                                fileName: item.get('name'),
	                                status: 'Queued',
	                                size: item.get('size') || null,
	                                type: item.get('type') || '',
	                                path: item.get('path') || ''
	                            })),
	                            null,
	                            {
	                                metadata: {
	                                    activityType: 'Move'
	                                }
	                            }
	                        );

	                        // Make the API call to move the items
	                        Ext.Ajax.request({
                            url: FileManagementEnv.apiUrl('/api/files/move'),
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            },
                            jsonData: moveData,
	                            success: function(response) {
	                                FileManagement.components.utils.ProgressBarManager.markActivityStatus(progressId, 'completed', 'Moved');
	                                FileManagement.components.utils.ProgressBarManager.updateProgress(progressId, 100, 'Move complete');
	                                Ext.defer(function() {
	                                    FileManagement.components.utils.ProgressBarManager.removeProgressBar(progressId);
	                                }, 1200);
	                                // Refresh the grid after successful move
	                                const grid = sourceGrid || FileManagement.components.utils.PanelUtils.getPrimaryFileGrid();
                                if (grid && grid.getStore()) {
                                    grid.getStore().reload();
                                }
                                resolve(response);
                            },
	                            failure: function(response) {
	                                FileManagement.components.utils.ProgressBarManager.markActivityStatus(progressId, 'failed', 'Failed');
	                                FileManagement.components.utils.ProgressBarManager.removeProgressBar(progressId);
	                                reject('Move operation failed: ' + response.statusText);
	                            }
                        });
                    }
                });
            });
        });
    }
});
