Ext.define('FileManagement.components.forms.FileUploadForm', {
    extend: 'Ext.form.Panel',
    xtype: 'fileuploadform',
    requires: [
        'FileManagement.components.utils.UploadSessionManager',
        'FileManagement.components.utils.PrivateVaultManager',
        'FileManagement.components.settings.UserSettings'
    ],
    title: 'Upload Files',
    bodyPadding: 10,
    frame: true,
    closable: true,

    titleAlign: 'left',
    width: 400,
    height: 300,
    x: 100,
    y: 100,

    draggable: {
        onMouseUp: function(e, panel) {
            FileManagement.components.utils.PanelUtils.onMouseUp(panel ?? this.panel, e, this);
        },
        onDrag: function(e, panel) {
            FileManagement.components.utils.PanelUtils.onDrag(panel ?? this.panel, e, this);
        }
    },

    resizable: {
        constrain: true, // Enable constraint within a specified element
        dynamic: true, // Updates size dynamically as resizing
        minHeight: 300,
        minWidth: 450,
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
        afterrender: function(form) {
            form.initDragAndDropZone();
        },
        click: {
            element: 'el', // could be 'body', or any other Ext.Elements
                           // that are available from the component
            fn: function() {
                window.highestZIndex += 1;
                this.setStyle('z-index', window.highestZIndex);
            }
        },
        show: function() {
            FileManagement.components.utils.PanelUtils.show(this);
        },
        hide: function() {
            FileManagement.components.utils.PanelUtils.hide(this);
        },
        destroy: function(form) {
            FileManagement.components.utils.PanelUtils.destroy(this);
        },
    },

    items: [
        {
            xtype: 'container',
            itemId: 'dropZone',
            cls: 'drag-drop-zone',
            html: '<div class="drop-zone-text">Drop files here to upload</div>',
            height: 150,
            anchor: '100%',
            border: true,
            bodyPadding: 10
        },
        {
            xtype: 'fieldcontainer',
            layout: 'hbox',
            margin: '20 0',
            items: [
                {
                    xtype: 'filefield',
                    name: 'file',
                    fieldLabel: 'Files',
                    labelWidth: 50,
                    flex: 1,
                    buttonText: 'Select Files...',
                    margin: '0 10 0 0',
                    multiple: true,
                    listeners: {
                        afterrender: function (filefield) {
                            // Set the file input to accept multiple files
                            filefield.fileInputEl.dom.setAttribute('multiple', 'multiple');
                        }
                    }
                }
            ]
        }
    ],

    buttons: [
        {
            text: 'Upload',
            handler: function (btn) {
                const form = btn.up('form');
                const basicForm = form.getForm();
                if (!basicForm.isValid()) return;

                const fileField = basicForm.findField('file');
                const files = fileField.fileInputEl.dom.files;

                form.uploadFiles(files);

                try {
                    basicForm.reset();
                    form.destroy();
                } catch (err) {
                    // do nothing, as the form might be closed
                }
            }
        }
    ],

    uploadFiles: async function (files, options = {}) {
        const filesArray = Array.from(files || []);
        if (!filesArray.length) return;

        const CHUNK_SIZE = 1024 * 1024; // 1MB per chunk
        const failedFiles = [];
        const fileGrid = options.fileGrid ||
            (this.targetGrid && !this.targetGrid.destroyed && !this.targetGrid.destroying ? this.targetGrid : null) ||
            FileManagement.components.utils.PanelUtils.getPrimaryFileGrid();

        if (fileGrid && fileGrid.ensurePrivateVaultUnlocked && !fileGrid.ensurePrivateVaultUnlocked(() => {
            this.uploadFiles(filesArray, options);
        })) {
            return;
        }

        const currentFolderId = options.folderId !== undefined
            ? (options.folderId || '')
            : (fileGrid ? (fileGrid.currentFolderId || '') : '');
        const workspaceId = options.workspaceId !== undefined
            ? (options.workspaceId || '')
            : (fileGrid && fileGrid.getWorkspaceId ? fileGrid.getWorkspaceId() : '');
        const uploadSessionManager = FileManagement.components.utils.UploadSessionManager;
        const sessionId = uploadSessionManager.ensureSession(
            options.sessionId || uploadSessionManager.createSession(filesArray, currentFolderId, workspaceId),
            filesArray,
            currentFolderId,
            workspaceId
        );
        const operationGrid = this.getLiveOperationGrid(fileGrid, 'createUploadPlaceholders');
        let wasCancelled = false;
        let userCancelled = false;

        const fileQueueData = filesArray.map(file => ({
            fileName: file.name,
            status: 'Queued',
            size: file.size || null,
            type: file.type || ''
        }));

        const progressId = `upload-progress-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const abortController = new AbortController();
        const totalBytes = filesArray.reduce((sum, file) => sum + (Number(file.size) || 0), 0);
        const progressTotalBytes = Math.max(totalBytes, 1);
        let completedBytes = 0;
        const progressTitle = filesArray.length === 1
            ? `Uploading ${filesArray[0].name}`
            : `Uploading ${filesArray.length} files`;
        const userSettings = FileManagement.components.settings.UserSettings;
        const showUploadPanel = userSettings.get('uploads.showUploadPanel', true) !== false;
        const notifyUploads = userSettings.shouldNotify('uploads', true);

        if (operationGrid) {
            operationGrid.createUploadPlaceholders(filesArray, {
                sessionId,
                folderId: currentFolderId,
                workspaceId
            });
        }

        FileManagement.components.utils.ProgressBarManager.addProgressBar(
            progressId,
            progressTitle,
            fileQueueData,
            function () {
                userCancelled = true;
                abortController.abort(); // Abort ongoing requests
            },
            {
                metadata: {
                    activityType: 'Upload'
                },
                suppressButton: !showUploadPanel,
                suppressToast: !notifyUploads
            }
        );

        for (let index = 0; index < filesArray.length; index++) {
            const file = filesArray[index];
            try {
                uploadSessionManager.markFileStatus(sessionId, file, 'uploading');
                await this.uploadFileInChunks(file, progressId, CHUNK_SIZE, abortController.signal, false, {
                    folderId: currentFolderId,
                    workspaceId,
                    sessionId,
                    fileIndex: index,
                    totalFiles: filesArray.length,
                    completedBytes,
                    totalBytes: progressTotalBytes,
                    fileGrid: operationGrid
                });
                FileManagement.components.utils.ProgressBarManager.updateProgress(
                    progressId,
                    Math.round(((completedBytes + (Number(file.size) || 0)) / progressTotalBytes) * 100),
                    filesArray.length > 1
                        ? `Uploaded ${index + 1} of ${filesArray.length}: ${file.name}`
                        : `Uploaded ${file.name}`
                );
                completedBytes += Number(file.size) || 0;
                uploadSessionManager.completeFile(sessionId, file);
                const completionGrid = this.getLiveOperationGrid(operationGrid, 'completeUploadPlaceholder');
                if (completionGrid) {
                    completionGrid.completeUploadPlaceholder(sessionId, file);
                }
                FileManagement.components.utils.ProgressBarManager.updateQueuedStatus(progressId, file.name, 'Uploaded');
            } catch (error) {
                if (error.name === 'AbortError') {
                    wasCancelled = true;
                    if (userCancelled) {
                        await this.resetUploadSession(file.name, currentFolderId, workspaceId);
                        if (options.recovering) {
                            uploadSessionManager.cancelFile(sessionId, file);
                        } else {
                            uploadSessionManager.removeSession(sessionId);
                        }
                        const cancelGrid = this.getLiveOperationGrid(operationGrid, 'cancelUploadPlaceholder');
                        if (cancelGrid) {
                            cancelGrid.cancelUploadPlaceholder(sessionId, file, 'Cancelled');
                        }
                    } else {
                        uploadSessionManager.interruptSession(sessionId);
                        const interruptGrid = this.getLiveOperationGrid(operationGrid, 'cancelUploadPlaceholder');
                        if (interruptGrid) {
                            interruptGrid.cancelUploadPlaceholder(sessionId, file, 'Interrupted');
                        }
                    }
                    FileManagement.components.utils.ProgressBarManager.updateProgress(progressId, 0, 'Upload Canceled');
                    FileManagement.components.utils.NotificationUtil.showWarning(`Upload canceled for ${file.name}`, 'Upload Canceled', { category: 'uploads' });
                } else {
                    if (operationGrid && operationGrid.handlePrivateVaultAccessFailure && operationGrid.handlePrivateVaultAccessFailure(error, {
                        onUnlock: () => {
                            this.uploadFiles(filesArray.slice(index), options);
                        }
                    })) {
                        FileManagement.components.utils.ProgressBarManager.removeProgressBar(progressId);
                        return;
                    }

                    console.error('Error during upload:', error);
                    uploadSessionManager.interruptSession(sessionId);
                    const failedGrid = this.getLiveOperationGrid(operationGrid, 'cancelUploadPlaceholder');
                    if (failedGrid) {
                        failedGrid.cancelUploadPlaceholder(sessionId, file, 'Failed');
                    }
                    failedFiles.push(file.name);
                    FileManagement.components.utils.ProgressBarManager.updateQueuedStatus(progressId, file.name, 'Failed');
                    FileManagement.components.utils.NotificationUtil.showError(`Failed to upload: ${file.name}`, 'Upload Error', { category: 'uploads' });
                }
                break; // Stop processing on failure
            }
        }

        // Remove the progress bar after uploads are complete
        FileManagement.components.utils.ProgressBarManager.removeProgressBar(progressId);

        // Notify user
        if (failedFiles.length) {
            FileManagement.components.utils.NotificationUtil.showError(
                `The following files failed to upload: ${failedFiles.join(', ')}`,
                'Upload Failed',
                { category: 'uploads' }
            );
        } else if (!wasCancelled) {
            uploadSessionManager.removeSessionIfComplete(sessionId);
            if (options.suppressSuccessNotification !== true) {
                FileManagement.components.utils.NotificationUtil.showSuccess('All files uploaded successfully!', 'Upload Complete', { category: 'uploads' });
            }
            if (fileGrid) {
            fileGrid.getStore().reload();
            }
            FileManagement.components.utils.PanelUtils.refreshHomeDashboard();
        }
    },

    getLiveOperationGrid: function (grid, methodName = null) {
        if (!grid || grid.destroyed || grid.destroying) {
            return null;
        }

        if (methodName && typeof grid[methodName] !== 'function') {
            return null;
        }

        return grid;
    },

    uploadFileInChunks: async function (file, progressId, chunkSize, abortSignal, hasRetriedFromScratch = false, options = {}) {
        let start = 0;
        let resumedUpload = false;
        const totalChunks = Math.ceil(file.size / chunkSize);
        const token = FileManagement.helpers.Functions.getToken();
        const fileGrid = options.fileGrid ||
            (this.targetGrid && !this.targetGrid.destroyed && !this.targetGrid.destroying ? this.targetGrid : null) ||
            FileManagement.components.utils.PanelUtils.getPrimaryFileGrid();
        const currentFolderId = options.folderId !== undefined
            ? (options.folderId || '')
            : (fileGrid ? (fileGrid.currentFolderId || '') : '');
        const workspaceId = options.workspaceId !== undefined
            ? (options.workspaceId || '')
            : (fileGrid && fileGrid.getWorkspaceId ? fileGrid.getWorkspaceId() : '');
        const operationGrid = this.getLiveOperationGrid(
            options.fileGrid || fileGrid,
            'updateUploadPlaceholder'
        );
        const sessionId = options.sessionId || null;
        const fileIndex = Number(options.fileIndex) || 0;
        const totalFiles = Math.max(Number(options.totalFiles) || 1, 1);
        const completedBytes = Number(options.completedBytes) || 0;
        const totalBytes = Math.max(Number(options.totalBytes) || file.size || 1, 1);
        const progressLabel = totalFiles > 1
            ? `Uploading ${fileIndex + 1} of ${totalFiles}: ${file.name}`
            : `Uploading ${file.name}`;

        try {
            const statusParams = new URLSearchParams({
                filename: file.name,
                folderId: currentFolderId,
                workspaceId,
                totalChunks: totalChunks.toString(),
                fileSize: file.size.toString()
            });

            // Query server for already uploaded chunks
            const response = await fetch(FileManagementEnv.apiUrl(`/api/files/upload/status?${statusParams.toString()}`), {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const uploadedChunks = await response.json();
                if (uploadedChunks && uploadedChunks.length) {
                    resumedUpload = true;
                    FileManagement.components.utils.NotificationUtil.showInfo(
                        `Resuming upload for ${file.name} from chunk ${uploadedChunks.length + 1}`,
                        'Resuming Upload',
                        { category: 'uploads' }
                    );
                    start = uploadedChunks.length * chunkSize; // Skip already uploaded chunks
                    if (sessionId) {
                        const resumedProgress = Math.round((start / file.size) * 100);
                        const aggregateProgress = Math.round(((completedBytes + start) / totalBytes) * 100);
                        FileManagement.components.utils.ProgressBarManager.updateProgress(progressId, aggregateProgress, progressLabel);
                        FileManagement.components.utils.UploadSessionManager.updateFileProgress(
                            sessionId,
                            file,
                            resumedProgress
                        );
                        const resumedGrid = this.getLiveOperationGrid(operationGrid, 'updateUploadPlaceholder');
                        if (resumedGrid) {
                            resumedGrid.updateUploadPlaceholder(sessionId, file, resumedProgress, 'Uploading');
                        }
                    }
                }
            } else if (response.status !== 404) {
                throw await FileManagement.components.utils.PrivateVaultManager.createErrorFromFetchResponse(response, 'Failed to check upload status');
            }

            while (start < file.size) {
                const end = Math.min(start + chunkSize, file.size);
                const chunk = file.slice(start, end);

                const formData = new FormData();
                formData.append('folderId', currentFolderId);
                formData.append('workspaceId', workspaceId);
                formData.append('chunk', chunk);
                formData.append('filename', file.name);
                formData.append('fileSize', file.size);
                formData.append('currentChunk', Math.floor(start / chunkSize) + 1);
                formData.append('totalChunks', totalChunks);

                const uploadResponse = await fetch(FileManagementEnv.apiUrl('/api/files/upload'), {
                    method: 'POST',
                    body: formData,
                    headers: {
                        'Authorization': `Bearer ${token}`
                    },
                    signal: abortSignal
                });

                if (!uploadResponse.ok) {
                    throw await FileManagement.components.utils.PrivateVaultManager.createErrorFromFetchResponse(uploadResponse, `Failed to upload chunk ${start} - ${end}`);
                }

                start = end;
                const progress = Math.round((start / file.size) * 100);
                const aggregateProgress = Math.round(((completedBytes + start) / totalBytes) * 100);
                FileManagement.components.utils.ProgressBarManager.updateProgress(progressId, aggregateProgress, progressLabel);
                if (sessionId) {
                    FileManagement.components.utils.UploadSessionManager.updateFileProgress(sessionId, file, progress);
                    const progressGrid = this.getLiveOperationGrid(operationGrid, 'updateUploadPlaceholder');
                    if (progressGrid) {
                        progressGrid.updateUploadPlaceholder(sessionId, file, progress, 'Uploading');
                    }
                }
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                throw error;
            }

            if (resumedUpload && !hasRetriedFromScratch) {
                await this.resetUploadSession(file.name, currentFolderId, workspaceId);
                FileManagement.components.utils.NotificationUtil.showWarning(
                    `Upload state for ${file.name} was inconsistent. Restarting from the beginning.`,
                    'Restarting Upload',
                    { category: 'uploads' }
                );
                return this.uploadFileInChunks(file, progressId, chunkSize, abortSignal, true, options);
            }

            throw error;
        }
    },

    resetUploadSession: async function(fileName, folderId, workspaceId = '') {
        const token = FileManagement.helpers.Functions.getToken();

        await fetch(FileManagementEnv.apiUrl('/api/files/upload/reset'), {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                filename: fileName,
                folderId: folderId || '',
                workspaceId: workspaceId || ''
            })
        });
    },

    initDragAndDropZone: function() {
        const dropZone = this.down('#dropZone').getEl().dom;

        // Drag & Drop Event Handlers
        dropZone.addEventListener('dragover', (e) => {
            if (e.cancelable !== false) {
                e.preventDefault();
            }
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('drag-over');
        });

        dropZone.addEventListener('drop', async (e) => {
            if (e.cancelable !== false) {
                e.preventDefault();
            }
            dropZone.classList.remove('drag-over');

            const files = e.dataTransfer.files;
            if (files.length) {
                await this.uploadFiles(files);
            }
        });
    },
});
