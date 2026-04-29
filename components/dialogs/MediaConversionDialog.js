Ext.define('FileManagement.components.dialogs.MediaConversionDialog', {
    extend: 'Ext.window.Window',
    xtype: 'mediaconversiondialog',

    requires: [
        'FileManagement.components.status.MediaConversionQueuePanel',
        'FileManagement.components.settings.UserSettings',
        'FileManagement.components.utils.NotificationUtil',
        'FileManagement.components.utils.ProgressBarManager'
    ],

    title: 'Media Conversion Hub',
    modal: true,
    frame: true,
    width: 560,
    height: 520,
    layout: 'fit',
    resizable: true,
    constrain: true,

    config: {
        grid: null,
        record: null,
        currentFolderId: null,
        onSuccess: null
    },

    initComponent: function() {
        const me = this;

        me.items = [
            {
                xtype: 'form',
                itemId: 'mediaConversionForm',
                bodyPadding: 10,
                scrollable: true,
                defaults: {
                    anchor: '100%',
                    labelWidth: 130
                },
                items: [
                    {
                        xtype: 'fieldset',
                        title: 'Source',
                        items: [
                            {
                                xtype: 'displayfield',
                                fieldLabel: 'File',
                                value: me.buildSourceLabel()
                            }
                        ]
                    },
                    {
                        xtype: 'combo',
                        fieldLabel: 'Operation',
                        itemId: 'operationField',
                        editable: false,
                        forceSelection: true,
                        queryMode: 'local',
                        displayField: 'label',
                        valueField: 'value',
                        store: Ext.create('Ext.data.Store', {
                            fields: ['value', 'label'],
                            data: me.getAvailableOperations()
                        }),
                        value: me.getDefaultOperation(),
                        listeners: {
                            change: function(field, value) {
                                me.switchOperation(value);
                            }
                        }
                    },
                    {
                        xtype: 'textfield',
                        fieldLabel: 'Output name',
                        itemId: 'outputFileNameField',
                        emptyText: 'Optional, extension is added automatically'
                    },
                    {
                        xtype: 'container',
                        itemId: 'operationCards',
                        layout: 'card',
                        defaults: {
                            xtype: 'fieldset',
                            padding: 10,
                            defaults: {
                                anchor: '100%',
                                labelWidth: 130
                            }
                        },
                        items: [
                            me.buildAudioCard(),
                            me.buildVideoCard(),
                            me.buildImageCard(),
                            me.buildExtractAudioCard(),
                            me.buildGifCard(),
                            me.buildThumbnailCard()
                        ]
                    }
                ]
            }
        ];

        me.buttons = [
            {
                text: 'Run Conversion',
                iconCls: 'fa fa-exchange-alt',
                handler: function() {
                    me.runConversion();
                }
            },
            {
                text: 'Cancel',
                handler: function() {
                    me.close();
                }
            }
        ];

        me.callParent(arguments);

        me.on('afterrender', function() {
            me.fitToViewport();
            me.switchOperation(me.down('#operationField').getValue());
        });

        me.on('destroy', function() {
            if (Ext.EventManager && Ext.EventManager.removeResizeListener) {
                Ext.EventManager.removeResizeListener(me.fitToViewport, me);
            }
        });

        if (Ext.EventManager && Ext.EventManager.onWindowResize) {
            Ext.EventManager.onWindowResize(me.fitToViewport, me);
        }
    },

    fitToViewport: function() {
        if (!this.rendered || this.destroyed || this.destroying) {
            return;
        }

        const viewportWidth = Ext.Element.getViewportWidth();
        const viewportHeight = Ext.Element.getViewportHeight();
        const nextWidth = Math.min(560, Math.max(320, viewportWidth - 24));
        const nextHeight = Math.min(520, Math.max(300, viewportHeight - 24));

        if (this.getWidth() !== nextWidth || this.getHeight() !== nextHeight) {
            this.setSize(nextWidth, nextHeight);
        }

        this.center();
    },

    buildSourceLabel: function() {
        const record = this.getRecord();
        if (!record) {
            return '';
        }

        return Ext.String.htmlEncode(`${record.get('name')} (${record.get('type') || record.get('mimetype') || 'Media'})`);
    },

    getMimeType: function() {
        const record = this.getRecord();
        return record ? String(record.get('mimetype') || '') : '';
    },

    isAudio: function() {
        return this.getMimeType().indexOf('audio/') === 0;
    },

    isVideo: function() {
        return this.getMimeType().indexOf('video/') === 0;
    },

    isImage: function() {
        return this.getMimeType().indexOf('image/') === 0;
    },

    getAvailableOperations: function() {
        if (this.isAudio()) {
            return [
                { value: 'convertAudio', label: 'Convert Audio' }
            ];
        }

        if (this.isVideo()) {
            return [
                { value: 'convertVideo', label: 'Convert Video' },
                { value: 'extractAudio', label: 'Extract Audio' },
                { value: 'videoToGif', label: 'Convert Video to GIF' },
                { value: 'thumbnail', label: 'Generate Thumbnail' }
            ];
        }

        if (this.isImage()) {
            return [
                { value: 'convertImage', label: 'Convert Image' },
                { value: 'thumbnail', label: 'Generate Thumbnail' }
            ];
        }

        return [];
    },

    getDefaultOperation: function() {
        if (this.isAudio()) return 'convertAudio';
        if (this.isVideo()) return 'convertVideo';
        if (this.isImage()) return 'convertImage';
        return null;
    },

    switchOperation: function(operation) {
        const cards = this.down('#operationCards');
        const cardMap = {
            convertAudio: 'audioCard',
            convertVideo: 'videoCard',
            convertImage: 'imageCard',
            extractAudio: 'extractAudioCard',
            videoToGif: 'gifCard',
            thumbnail: 'thumbnailCard'
        };

        const card = cards ? cards.down(`#${cardMap[operation]}`) : null;
        if (cards && card) {
            cards.getLayout().setActiveItem(card);
        }
    },

    buildAudioCard: function() {
        return {
            itemId: 'audioCard',
            title: 'Audio Conversion',
            items: [
                this.formatCombo('audioTargetFormatField', 'Target format', ['mp3', 'aac', 'm4a', 'wav', 'ogg', 'flac'], 'mp3'),
                this.qualityCombo('audioQualityPresetField'),
                {
                    xtype: 'textfield',
                    fieldLabel: 'Audio bitrate',
                    itemId: 'audioBitrateField',
                    emptyText: 'Example: 128k, 192k, 320k'
                }
            ]
        };
    },

    buildVideoCard: function() {
        return {
            itemId: 'videoCard',
            title: 'Video Conversion',
            items: [
                this.formatCombo('videoTargetFormatField', 'Target format', ['mp4', 'webm', 'mov', 'mkv', 'avi'], 'mp4'),
                this.qualityCombo('videoQualityPresetField'),
                this.resolutionCombo('videoResolutionField'),
                {
                    xtype: 'textfield',
                    fieldLabel: 'Video bitrate',
                    itemId: 'videoBitrateField',
                    emptyText: 'Optional, example: 2500k'
                },
                {
                    xtype: 'textfield',
                    fieldLabel: 'Audio bitrate',
                    itemId: 'videoAudioBitrateField',
                    emptyText: 'Optional, example: 128k'
                },
                {
                    xtype: 'checkbox',
                    fieldLabel: 'Preview',
                    boxLabel: 'Generate a thumbnail preview output',
                    itemId: 'videoPreviewField',
                    checked: true
                }
            ]
        };
    },

    buildImageCard: function() {
        return {
            itemId: 'imageCard',
            title: 'Image Conversion',
            items: [
                this.formatCombo('imageTargetFormatField', 'Target format', ['png', 'jpg', 'webp', 'avif'], 'png'),
                {
                    xtype: 'numberfield',
                    fieldLabel: 'Quality',
                    itemId: 'imageQualityField',
                    value: 90,
                    minValue: 1,
                    maxValue: 100,
                    allowDecimals: false
                },
                {
                    xtype: 'checkbox',
                    fieldLabel: 'Preview',
                    boxLabel: 'Generate a small JPG preview output',
                    itemId: 'imagePreviewField',
                    checked: false
                }
            ]
        };
    },

    buildExtractAudioCard: function() {
        return {
            itemId: 'extractAudioCard',
            title: 'Extract Audio From Video',
            items: [
                this.formatCombo('extractAudioFormatField', 'Audio format', ['mp3', 'aac', 'm4a', 'wav', 'ogg', 'flac'], 'mp3'),
                {
                    xtype: 'textfield',
                    fieldLabel: 'Audio bitrate',
                    itemId: 'extractAudioBitrateField',
                    emptyText: 'Optional, example: 192k'
                }
            ]
        };
    },

    buildGifCard: function() {
        return {
            itemId: 'gifCard',
            title: 'Video to GIF',
            items: [
                this.qualityCombo('gifQualityPresetField'),
                {
                    xtype: 'textfield',
                    fieldLabel: 'Start time',
                    itemId: 'gifStartTimeField',
                    value: '0',
                    emptyText: 'Seconds or HH:MM:SS'
                },
                {
                    xtype: 'numberfield',
                    fieldLabel: 'Duration sec',
                    itemId: 'gifDurationField',
                    value: 6,
                    minValue: 1,
                    maxValue: 60,
                    allowDecimals: true
                },
                {
                    xtype: 'numberfield',
                    fieldLabel: 'Width',
                    itemId: 'gifWidthField',
                    value: 640,
                    minValue: 120,
                    maxValue: 1280,
                    allowDecimals: false
                },
                {
                    xtype: 'numberfield',
                    fieldLabel: 'FPS',
                    itemId: 'gifFpsField',
                    value: 12,
                    minValue: 4,
                    maxValue: 24,
                    allowDecimals: false
                }
            ]
        };
    },

    buildThumbnailCard: function() {
        return {
            itemId: 'thumbnailCard',
            title: 'Thumbnail / Preview',
            items: [
                {
                    xtype: 'textfield',
                    fieldLabel: 'Time',
                    itemId: 'thumbnailTimeField',
                    value: '1',
                    emptyText: 'Video only: seconds or HH:MM:SS'
                },
                {
                    xtype: 'numberfield',
                    fieldLabel: 'Width',
                    itemId: 'thumbnailWidthField',
                    value: 480,
                    minValue: 64,
                    maxValue: 1200,
                    allowDecimals: false
                },
                {
                    xtype: 'numberfield',
                    fieldLabel: 'Height',
                    itemId: 'thumbnailHeightField',
                    value: 320,
                    minValue: 64,
                    maxValue: 1200,
                    allowDecimals: false
                },
                {
                    xtype: 'numberfield',
                    fieldLabel: 'Quality',
                    itemId: 'thumbnailQualityField',
                    value: 82,
                    minValue: 1,
                    maxValue: 100,
                    allowDecimals: false
                }
            ]
        };
    },

    formatCombo: function(itemId, label, formats, value) {
        return {
            xtype: 'combo',
            fieldLabel: label,
            itemId,
            editable: false,
            forceSelection: true,
            queryMode: 'local',
            store: formats,
            value
        };
    },

    qualityCombo: function(itemId) {
        const settings = FileManagement.components.settings.UserSettings.getSettings();
        const conversions = settings.conversions || {};
        const defaultValue = itemId === 'gifQualityPresetField'
            ? (conversions.gifQuality || 'balanced')
            : (conversions.mediaQuality || 'balanced');

        return {
            xtype: 'combo',
            fieldLabel: 'Quality preset',
            itemId,
            editable: false,
            forceSelection: true,
            queryMode: 'local',
            store: ['low', 'balanced', 'high', 'source'],
            value: defaultValue
        };
    },

    resolutionCombo: function(itemId) {
        return {
            xtype: 'combo',
            fieldLabel: 'Resolution',
            itemId,
            editable: false,
            forceSelection: true,
            queryMode: 'local',
            store: ['source', '2160p', '1440p', '1080p', '720p', '480p', '360p'],
            value: 'source'
        };
    },

    fieldValue: function(itemId) {
        const field = this.down(`#${itemId}`);
        return field && field.getValue ? field.getValue() : null;
    },

    buildOptions: function(operation) {
        switch (operation) {
            case 'convertAudio':
                return {
                    targetFormat: this.fieldValue('audioTargetFormatField'),
                    qualityPreset: this.fieldValue('audioQualityPresetField'),
                    audioBitrate: this.fieldValue('audioBitrateField')
                };
            case 'convertVideo':
                return {
                    targetFormat: this.fieldValue('videoTargetFormatField'),
                    qualityPreset: this.fieldValue('videoQualityPresetField'),
                    resolution: this.fieldValue('videoResolutionField'),
                    videoBitrate: this.fieldValue('videoBitrateField'),
                    audioBitrate: this.fieldValue('videoAudioBitrateField'),
                    generatePreview: this.fieldValue('videoPreviewField')
                };
            case 'convertImage':
                return {
                    targetFormat: this.fieldValue('imageTargetFormatField'),
                    quality: this.fieldValue('imageQualityField'),
                    generatePreview: this.fieldValue('imagePreviewField')
                };
            case 'extractAudio':
                return {
                    targetFormat: this.fieldValue('extractAudioFormatField'),
                    audioBitrate: this.fieldValue('extractAudioBitrateField')
                };
            case 'videoToGif':
                return {
                    qualityPreset: this.fieldValue('gifQualityPresetField'),
                    startTime: this.fieldValue('gifStartTimeField'),
                    duration: this.fieldValue('gifDurationField'),
                    width: this.fieldValue('gifWidthField'),
                    fps: this.fieldValue('gifFpsField')
                };
            case 'thumbnail':
                return {
                    thumbnailTime: this.fieldValue('thumbnailTimeField'),
                    width: this.fieldValue('thumbnailWidthField'),
                    height: this.fieldValue('thumbnailHeightField'),
                    quality: this.fieldValue('thumbnailQualityField')
                };
            default:
                return {};
        }
    },

    runConversion: function() {
        const me = this;
        const record = me.getRecord();
        const operation = me.fieldValue('operationField');

        if (!record || !operation) {
            Ext.Msg.alert('Media Conversion Hub', 'Please select a supported media file.');
            return;
        }

        const grid = me.getGrid ? me.getGrid() : null;
        if (grid && grid.ensurePrivateVaultUnlocked && !grid.ensurePrivateVaultUnlocked(function() {
            me.runConversion();
        })) {
            return;
        }

        const token = FileManagement.helpers.Functions.getToken();
        const progressId = `media-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const sourceName = record.get('name') || 'media file';
        const outputName = me.fieldValue('outputFileNameField');
        const mask = new Ext.LoadMask({
            target: me,
            msg: 'Queueing media conversion...'
        });
        mask.show();

        FileManagement.components.utils.ProgressBarManager.addProgressBar(
            progressId,
            `Converting ${sourceName}`,
            [{
                name: sourceName,
                status: 'Queued',
                size: record.get('size') || null,
                type: record.get('type') || '',
                path: record.get('path') || ''
            }],
            function(progressBar) {
                return fetch(FileManagementEnv.apiUrl('/api/media-conversion/jobs/cancel'), {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        jobId: progressBar.jobId,
                        progressId
                    })
                })
                    .then(response => response.json())
                    .then(result => {
                        if (!result.success) {
                            throw new Error(result.error || 'Failed to cancel media conversion');
                        }
                    });
            },
            {
                onComplete: function(result) {
                    if (me.getGrid() && me.getGrid().getStore) {
                        me.getGrid().getStore().reload();
                    }

                    if (FileManagement.components.utils.PanelUtils) {
                        FileManagement.components.utils.PanelUtils.refreshHomeDashboard();
                    }

                    if (Ext.isFunction(me.getOnSuccess())) {
                        me.getOnSuccess()(result);
                    }
                }
            }
        );

        FileManagement.components.status.MediaConversionQueuePanel.handleUpdate({
            progressId,
            fileName: sourceName,
            outputFileName: outputName,
            operation,
            status: 'queued',
            stage: 'queued',
            progress: 0
        });

        Ext.Ajax.request({
            url: FileManagementEnv.apiUrl('/api/media-conversion/execute'),
            method: 'POST',
            timeout: 20 * 60 * 1000,
            headers: {
                'Authorization': `Bearer ${FileManagement.helpers.Functions.getToken()}`,
                'Content-Type': 'application/json'
            },
            jsonData: {
                operation,
                fileId: record.get('id'),
                parentId: me.getCurrentFolderId() || null,
                outputFileName: outputName,
                options: me.buildOptions(operation),
                progressId
            },
            success: function(response) {
                mask.hide();
                const result = Ext.decode(response.responseText, true) || {};
                FileManagement.components.utils.ProgressBarManager.setJobId(progressId, result.jobId);
                FileManagement.components.status.MediaConversionQueuePanel.handleUpdate({
                    progressId,
                    jobId: result.jobId,
                    fileName: sourceName,
                    outputFileName: outputName,
                    operation,
                    status: 'queued',
                    stage: 'queued',
                    progress: 0,
                    message: result.message || 'Media conversion queued.'
                });
                me.close();
                FileManagement.components.utils.NotificationUtil.showInfo(
                    result.message || 'Media conversion queued.',
                    'Media Conversion Hub',
                    { category: 'conversions' }
                );
            },
            failure: function(response) {
                mask.hide();
                FileManagement.components.utils.ProgressBarManager.removeProgressBar(progressId);
                if (grid && grid.handlePrivateVaultAccessFailure && grid.handlePrivateVaultAccessFailure(response, {
                    onUnlock: function() {
                        me.runConversion();
                    }
                })) {
                    return;
                }
                const payload = Ext.decode(response.responseText, true) || {};
                const errorMessage = payload.error || payload.message || 'Media conversion failed.';
                FileManagement.components.status.MediaConversionQueuePanel.handleUpdate({
                    progressId,
                    fileName: sourceName,
                    outputFileName: outputName,
                    operation,
                    status: 'failed',
                    stage: 'failed',
                    progress: 0,
                    error: errorMessage
                });
                Ext.Msg.alert('Media Conversion Hub', errorMessage);
            }
        });
    }
});
