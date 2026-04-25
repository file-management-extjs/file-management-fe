Ext.define('FileManagement.components.dialogs.DocumentConversionDialog', {
    extend: 'Ext.window.Window',
    xtype: 'documentconversiondialog',

    requires: [
        'FileManagement.components.status.DocumentConversionQueuePanel',
        'FileManagement.components.settings.UserSettings',
        'FileManagement.components.utils.NotificationUtil',
        'FileManagement.components.utils.ProgressBarManager'
    ],

    title: 'Document Conversion Suite',
    modal: true,
    frame: true,
    width: 620,
    height: 500,
    layout: 'fit',
    resizable: true,
    constrain: true,

    config: {
        grid: null,
        selections: null,
        currentFolderId: null,
        onSuccess: null
    },

    initComponent: function() {
        const me = this;
        me.records = me.getSelections() || [];
        const settings = FileManagement.components.settings.UserSettings.getSettings();
        const conversionSettings = settings.conversions || {};

        me.items = [
            {
                xtype: 'form',
                itemId: 'documentConversionForm',
                bodyPadding: 10,
                scrollable: true,
                defaults: {
                    anchor: '100%',
                    labelWidth: 130
                },
                items: [
                    {
                        xtype: 'fieldset',
                        title: 'Selected Items',
                        items: [
                            {
                                xtype: 'component',
                                itemId: 'selectedItemsSummary',
                                html: me.buildSelectedItemsHtml()
                            }
                        ]
                    },
                    {
                        xtype: 'combo',
                        fieldLabel: 'Target format',
                        itemId: 'targetFormatField',
                        editable: false,
                        forceSelection: true,
                        queryMode: 'local',
                        displayField: 'label',
                        valueField: 'value',
                        store: Ext.create('Ext.data.Store', {
                            fields: ['value', 'label', 'description'],
                            data: me.getAvailableTargets()
                        }),
                        value: me.getDefaultTarget(),
                        listeners: {
                            change: function(field, value) {
                                me.updateTargetHint(value);
                            }
                        }
                    },
                    {
                        xtype: 'textfield',
                        fieldLabel: 'Output name',
                        itemId: 'outputFileNameField',
                        emptyText: me.records.length > 1
                            ? 'Optional prefix for batch outputs'
                            : 'Optional output name'
                    },
                    {
                        xtype: 'checkbox',
                        fieldLabel: 'Layout',
                        itemId: 'preserveLayoutField',
                        boxLabel: 'Preserve layout as much as possible',
                        checked: conversionSettings.pdfPreserveLayout !== false
                    },
                    {
                        xtype: 'numberfield',
                        fieldLabel: 'Preview DPI',
                        itemId: 'previewDpiField',
                        value: conversionSettings.previewDpi || 144,
                        minValue: 72,
                        maxValue: 300,
                        allowDecimals: false
                    },
                    {
                        xtype: 'component',
                        itemId: 'targetHint',
                        style: 'padding: 6px 0 0 130px; color: #5f7591; line-height: 1.45;',
                        html: ''
                    }
                ]
            }
        ];

        me.buttons = [
            {
                text: 'Run Conversion',
                iconCls: 'fa fa-file-export',
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
            me.updateTargetHint(me.fieldValue('targetFormatField'));
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
        const nextWidth = Math.min(620, Math.max(340, viewportWidth - 24));
        const nextHeight = Math.min(500, Math.max(320, viewportHeight - 24));

        if (this.getWidth() !== nextWidth || this.getHeight() !== nextHeight) {
            this.setSize(nextWidth, nextHeight);
        }

        this.center();
    },

    buildSelectedItemsHtml: function() {
        if (!this.records.length) {
            return '<div>No files selected.</div>';
        }

        return this.records.map(record => {
            const typeLabel = record.get('type') || record.get('mimetype') || 'Document';
            return `
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                    <i class="${record.get('icon') || 'fa fa-file'}"></i>
                    <span>${Ext.String.htmlEncode(record.get('name'))}</span>
                    <span style="color:#5f7591;">${Ext.String.htmlEncode(typeLabel)}</span>
                </div>
            `;
        }).join('');
    },

    getAvailableTargets: function() {
        const grid = this.getGrid();
        return grid && grid.getDocumentConversionTargetOptions
            ? grid.getDocumentConversionTargetOptions(this.records)
            : [];
    },

    getDefaultTarget: function() {
        const targets = this.getAvailableTargets();
        return targets.length ? targets[0].value : null;
    },

    fieldValue: function(itemId) {
        const field = this.down(`#${itemId}`);
        return field && field.getValue ? field.getValue() : null;
    },

    updateTargetHint: function(targetFormat) {
        const hintCmp = this.down('#targetHint');
        const store = this.down('#targetFormatField').getStore();
        const record = store && store.findRecord('value', targetFormat);
        const value = targetFormat || '';
        let extraHint = '';

        if (value === 'webhtml') {
            extraHint = 'Creates a self-contained browser preview with embedded page images.';
        } else if (value === 'docx') {
            extraHint = 'For PDFs, Preserve Layout creates visual DOCX pages so watermarks and images stay in place. Turn it off for a more editable conversion.';
        } else if (value === 'pptx') {
            extraHint = 'PDF pages are preserved as full-slide visuals when converting into presentations.';
        } else if (value === 'xlsx') {
            extraHint = 'PDF pages are preserved visually and paired with extracted text rows in the workbook.';
        } else if (value === 'csv') {
            extraHint = 'PDF to CSV exports page and line text rows for traceability.';
        }

        if (hintCmp) {
            hintCmp.update(record
                ? `${Ext.String.htmlEncode(record.get('description') || '')}${extraHint ? `<br>${Ext.String.htmlEncode(extraHint)}` : ''}`
                : '');
        }
    },

    buildOptions: function() {
        return {
            preserveLayout: this.fieldValue('preserveLayoutField') !== false,
            previewDpi: this.fieldValue('previewDpiField')
        };
    },

    runConversion: function() {
        const me = this;
        const targetFormat = me.fieldValue('targetFormatField');
        const token = FileManagement.helpers.Functions.getToken();
        const progressId = `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const selectedIds = me.records.map(record => record.get('id'));
        const batchLabel = me.records.length === 1
            ? me.records[0].get('name')
            : `${me.records.length} documents`;
        const outputName = me.fieldValue('outputFileNameField');
        const mask = new Ext.LoadMask({
            target: me,
            msg: 'Queueing document conversion...'
        });

        if (!selectedIds.length || !targetFormat) {
            Ext.Msg.alert('Document Conversion Suite', 'Please select supported document files and a target format.');
            return;
        }

        mask.show();

        FileManagement.components.utils.ProgressBarManager.addProgressBar(
            progressId,
            `Converting ${batchLabel}`,
            me.records.map(record => ({
                name: record.get('name'),
                status: 'Queued',
                size: record.get('size') || null,
                type: record.get('type') || '',
                path: record.get('path') || ''
            })),
            function(progressBar) {
                return fetch(FileManagementEnv.apiUrl('/api/document-conversion/jobs/cancel'), {
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
                            throw new Error(result.error || 'Failed to cancel document conversion');
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

        FileManagement.components.status.DocumentConversionQueuePanel.handleUpdate({
            progressId,
            fileName: batchLabel,
            targetFormat,
            status: 'queued',
            stage: 'queued',
            progress: 0
        });

        Ext.Ajax.request({
            url: FileManagementEnv.apiUrl('/api/document-conversion/execute'),
            method: 'POST',
            timeout: 20 * 60 * 1000,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            jsonData: {
                fileIds: selectedIds,
                targetFormat,
                parentId: me.getCurrentFolderId() || null,
                outputFileName: outputName,
                options: me.buildOptions(),
                progressId
            },
            success: function(response) {
                mask.hide();
                const result = Ext.decode(response.responseText, true) || {};
                FileManagement.components.utils.ProgressBarManager.setJobId(progressId, result.jobId);
                FileManagement.components.status.DocumentConversionQueuePanel.handleUpdate({
                    progressId,
                    jobId: result.jobId,
                    fileName: result.batchLabel || batchLabel,
                    targetFormat,
                    status: 'queued',
                    stage: 'queued',
                    progress: 0,
                    message: result.message || 'Document conversion queued.'
                });
                me.close();
                FileManagement.components.utils.NotificationUtil.showInfo(
                    result.message || 'Document conversion queued.',
                    'Document Conversion Suite',
                    { category: 'conversions' }
                );
            },
            failure: function(response) {
                mask.hide();
                FileManagement.components.utils.ProgressBarManager.removeProgressBar(progressId);
                const payload = Ext.decode(response.responseText, true) || {};
                const errorMessage = payload.error || payload.message || 'Document conversion failed.';
                FileManagement.components.status.DocumentConversionQueuePanel.handleUpdate({
                    progressId,
                    fileName: batchLabel,
                    targetFormat,
                    status: 'failed',
                    stage: 'failed',
                    progress: 0,
                    error: errorMessage
                });
                Ext.Msg.alert('Document Conversion Suite', errorMessage);
            }
        });
    }
});
