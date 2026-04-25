Ext.define('FileManagement.components.dialogs.CompressionDialog', {
    extend: 'Ext.window.Window',
    xtype: 'compressiondialog',

    title: 'Compression Settings',
    modal: true,
    width: 400,
    layout: 'form',
    padding: 10,
    closeAction: 'destroy',

    config: {
        selections: null,
        currentFolderId: null,
        currentFolder: null,
        onSuccess: null
    },

    items: [{
        xtype: 'textfield',
        fieldLabel: 'Archive Name',
        name: 'archiveName',
        allowBlank: false,
        width: '100%'
    }, {
        xtype: 'combobox',
        fieldLabel: 'Archive Type',
        name: 'archiveType',
        store: [
            ['7z', '7-Zip (.7z) - Best compression'],
            ['zip', 'ZIP (.zip) - Universal compatibility'],
            ['tgz', 'TGZ (.tar.gz) - Unix/Linux compatible']
        ],
        value: '7z',
        editable: false,
        width: '100%',
        listeners: {
            change: function(combo, newValue) {
                const nameField = combo.up('window').down('[name=archiveName]');
                const currentName = nameField.getValue();
                const baseName = currentName.substring(0, currentName.lastIndexOf('.')) || currentName;
                const ext = {
                    '7z': '.7z',
                    'zip': '.zip',
                    'tgz': '.tar.gz'
                }[newValue] || '.7z';
                nameField.setValue(baseName + ext);
            }
        }
    }, {
        xtype: 'slider',
        fieldLabel: 'Compression Level',
        name: 'compressionLevel',
        width: '100%',
        value: 6,
        minValue: 1,
        maxValue: 9,
        increment: 1,
        tipText: function(thumb) {
            const levels = {
                1: 'Fastest (1)',
                2: 'Fast (2)',
                3: 'Fast (3)',
                4: 'Normal (4)',
                5: 'Normal (5)',
                6: 'Normal (6 - Default)',
                7: 'Maximum (7)',
                8: 'Maximum (8)',
                9: 'Ultra (9 - Slowest)'
            };
            return levels[thumb.value] || thumb.value;
        }
    }],

    buttons: [{
        text: 'Cancel',
        handler: function(btn) {
            btn.up('window').close();
        }
    }, {
        text: 'Compress',
        handler: function() {
            const win = this.up('window');
            const values = {
                archiveName: win.down('[name=archiveName]').getValue(),
                archiveType: win.down('[name=archiveType]').getValue(),
                compressionLevel: win.down('[name=compressionLevel]').getValue()
            };

            if (!values.archiveName) {
                Ext.Msg.alert('Error', 'Please enter an archive name.');
                return;
            }

            const token = FileManagement.helpers.Functions.getToken();
            const archiveExtensions = {
                '7z': '.7z',
                zip: '.zip',
                tgz: '.tar.gz'
            };
            const archiveExtension = archiveExtensions[values.archiveType] || `.${values.archiveType}`;
	            const fileName = values.archiveName.toLowerCase().endsWith(archiveExtension)
	                ? values.archiveName
	                : `${values.archiveName}${archiveExtension}`;
	            const selectedItems = win.selections.map(record => record.get('id'));
	            const affectedItems = win.selections.map(record => ({
	                name: record.get('name'),
	                size: record.get('size') || null,
	                type: record.get('type') || '',
	                path: record.get('path') || ''
	            }));
	            const progressId = `compression-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

	            FileManagement.components.utils.ProgressBarManager.addProgressBar(
	                progressId,
	                `Compressing to ${fileName}`,
	                affectedItems.map(item => Ext.apply({ status: 'Queued' }, item)),
                function(progressBar) {
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
                    })
                        .then(response => response.json())
                        .then(result => {
                            if (!result.success) {
                                throw new Error(result.error || 'Failed to stop compression');
                            }
                        })
                        .catch(error => {
                            console.error('Error stopping compression:', error);
                            Ext.Msg.alert('Error', `Failed to stop compression: ${error.message}`);
                            throw error;
                        });
                },
                {
                    onComplete: () => {
                        const fileGrid = FileManagement.components.utils.PanelUtils.getPrimaryFileGrid();
                        if (fileGrid && fileGrid.getStore()) {
                            fileGrid.getStore().reload();
                        }
                        FileManagement.components.utils.PanelUtils.refreshHomeDashboard();

                        if (typeof win.onSuccess === 'function') {
                            win.onSuccess();
                        }
                    }
                }
            );

            if (selectedItems.length === 0) {
                FileManagement.components.utils.ProgressBarManager.removeProgressBar(progressId);
                Ext.Msg.alert('Error', 'No items selected for compression.');
                return;
            }

            win.close();

            fetch(FileManagementEnv.apiUrl('/api/files/compress'), {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    items: selectedItems,
                    folder: win.currentFolder,
                    parentId: win.currentFolderId,
	                    zipFileName: fileName,
	                    archiveType: values.archiveType,
	                    compressionLevel: values.compressionLevel,
	                    progressId,
	                    affectedItems
	                })
	            })
                .then(response => response.json())
                .then(result => {
                    if (!result.success) {
                        throw new Error(result.error || 'Failed to start compression');
                    }

                    FileManagement.components.utils.ProgressBarManager.setJobId(progressId, result.jobId);
                })
                .catch(error => {
                    FileManagement.components.utils.ProgressBarManager.removeProgressBar(progressId);
                    Ext.Msg.alert('Compression Error', `Failed to start compression: ${error.message}`);
                });
        }
    }]
});
