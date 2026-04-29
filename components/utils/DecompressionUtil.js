Ext.define('FileManagement.components.utils.DecompressionUtil', {
    singleton: true,
    requires: [
        'FileManagement.components.utils.ProgressBarManager'
    ],

    decompressFile: function(config) {
        const token = FileManagement.helpers.Functions.getToken();
        const {
            filePath,
            parentId,
            onSuccess,
            onFailure,
            grid
        } = config;
        const fileName = (filePath || '').split('/').pop() || 'archive';
        const progressId = config.progressId || `extraction-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

        FileManagement.components.utils.ProgressBarManager.addProgressBar(
            progressId,
            `Extracting ${fileName}`,
            [{
                name: fileName,
                fileName,
                status: 'Queued',
                path: filePath || ''
            }],
            null,
            {
                metadata: {
                    activityType: 'Extraction'
                }
            }
        );

        // Show initial loading mask
        if (grid) {
            grid.setLoading('Extracting Files... Please wait (0%)');
        }

        Ext.Ajax.request({
            url: FileManagementEnv.apiUrl('/api/files/decompress'),
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            jsonData: {
                filePath: filePath,
                parentId: parentId,
                progressId: progressId,
                workspaceId: grid && grid.getWorkspaceId ? grid.getWorkspaceId() : ''
            },
            success: function(response) {
                if (grid) {
                    grid.setLoading(false);
                }
                FileManagement.components.utils.ProgressBarManager.markActivityStatus(progressId, 'completed', 'Extracted');
                FileManagement.components.utils.ProgressBarManager.updateProgress(progressId, 100, `Extracted ${fileName}`);
                Ext.defer(function() {
                    FileManagement.components.utils.ProgressBarManager.removeProgressBar(progressId);
                }, 1200);
                if (onSuccess) {
                    onSuccess(response);
                } else {
                    Ext.Msg.alert('Success', 'File decompressed successfully.');
                }
            },
            failure: function(response) {
                if (grid) {
                    grid.setLoading(false);
                }
                FileManagement.components.utils.ProgressBarManager.markActivityStatus(progressId, 'failed', 'Failed');
                FileManagement.components.utils.ProgressBarManager.removeProgressBar(progressId);
                if (grid && grid.handlePrivateVaultAccessFailure && grid.handlePrivateVaultAccessFailure(response, {
                    onUnlock: function() {
                        FileManagement.components.utils.DecompressionUtil.decompressFile(config);
                    }
                })) {
                    return;
                }
                if (onFailure) {
                    onFailure(response);
                } else {
                    let responseJSON;
                    try {
                        responseJSON = JSON.parse(response.responseText);
                    } catch (e) {
                        responseJSON = { error: 'Unknown error occurred' };
                    }
                    Ext.Msg.alert('Error', 'Failed to decompress file: ' + responseJSON.error);
                }
            }
        });
    },

    showDecompressDialog: function(config) {
        Ext.create('FileManagement.components.dialogs.ExtractionDialog', {
            grid: config.grid || null,
            file: config.file,
            onSuccess: config.onSuccess
        }).show();
    }
});
