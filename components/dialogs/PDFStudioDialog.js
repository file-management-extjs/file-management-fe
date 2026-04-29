Ext.define('FileManagement.components.dialogs.PDFStudioDialog', {
    extend: 'Ext.window.Window',
    xtype: 'pdfstudiodialog',

    title: 'PDF Studio',
    modal: true,
    frame: true,
    width: 640,
    height: 560,
    layout: 'fit',
    resizable: true,
    bodyPadding: 0,

    config: {
        grid: null,
        selections: null,
        currentFolderId: null,
        onSuccess: null
    },

    initComponent: function() {
        const me = this;
        me.records = me.getSelections() || [];

        me.items = [
            {
                xtype: 'form',
                itemId: 'pdfStudioForm',
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
                        collapsible: false,
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
                        fieldLabel: 'Operation',
                        itemId: 'operationField',
                        editable: false,
                        forceSelection: true,
                        queryMode: 'local',
                        displayField: 'label',
                        valueField: 'value',
                        value: me.getDefaultOperation(),
                        store: Ext.create('Ext.data.Store', {
                            fields: ['value', 'label'],
                            data: [
                                { value: 'merge', label: 'Merge PDFs' },
                                { value: 'split', label: 'Split PDF' },
                                { value: 'extract', label: 'Extract Selected Pages' },
                                { value: 'reorder', label: 'Reorder Pages' },
                                { value: 'rotate', label: 'Rotate Pages' },
                                { value: 'compress', label: 'Compress PDF' },
                                { value: 'watermark', label: 'Add Watermark' },
                                { value: 'protect', label: 'Add Password Protection' },
                                { value: 'decorate', label: 'Headers, Footers, Page Numbers' },
                                { value: 'convert', label: 'Convert PDF' },
                                { value: 'create', label: 'Create PDF From Files' }
                            ]
                        }),
                        listeners: {
                            change: function(field, value) {
                                me.switchOperationCard(value);
                                me.updateOutputPlaceholder(value);
                            }
                        }
                    },
                    {
                        xtype: 'textfield',
                        fieldLabel: 'Output name',
                        emptyText: 'Optional, extension is added automatically',
                        itemId: 'outputFileNameField'
                    },
                    {
                        xtype: 'container',
                        itemId: 'operationCards',
                        layout: 'card',
                        defaults: {
                            xtype: 'fieldset',
                            border: true,
                            padding: 10,
                            defaults: {
                                anchor: '100%',
                                labelWidth: 130
                            }
                        },
                        items: [
                            me.buildMergeCard(),
                            me.buildSplitCard(),
                            me.buildExtractCard(),
                            me.buildReorderCard(),
                            me.buildRotateCard(),
                            me.buildCompressCard(),
                            me.buildWatermarkCard(),
                            me.buildProtectCard(),
                            me.buildDecorateCard(),
                            me.buildConvertCard(),
                            me.buildCreateCard()
                        ]
                    }
                ]
            }
        ];

        me.buttons = [
            {
                text: 'Run Operation',
                iconCls: 'fa fa-wand-magic-sparkles',
                handler: function() {
                    me.runOperation();
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
            const operation = me.down('#operationField').getValue();
            me.switchOperationCard(operation);
            me.updateOutputPlaceholder(operation);
        });
    },

    buildMergeCard: function() {
        return {
            itemId: 'mergeCard',
            title: 'Merge PDFs',
            items: [
                {
                    xtype: 'displayfield',
                    value: 'Merges the selected PDFs in the same order they appear in your selection.'
                }
            ]
        };
    },

    buildSplitCard: function() {
        return {
            itemId: 'splitCard',
            title: 'Split PDF',
            items: [
                {
                    xtype: 'combo',
                    fieldLabel: 'Split mode',
                    itemId: 'splitModeField',
                    editable: false,
                    queryMode: 'local',
                    displayField: 'label',
                    valueField: 'value',
                    value: 'span',
                    store: Ext.create('Ext.data.Store', {
                        fields: ['value', 'label'],
                        data: [
                            { value: 'span', label: 'Every N pages' },
                            { value: 'page', label: 'Before specific pages' },
                            { value: 'bookmark', label: 'By bookmarks' }
                        ]
                    })
                },
                {
                    xtype: 'numberfield',
                    fieldLabel: 'Pages per file',
                    itemId: 'splitSpanField',
                    value: 1,
                    minValue: 1,
                    allowDecimals: false
                },
                {
                    xtype: 'textfield',
                    fieldLabel: 'Split before pages',
                    itemId: 'splitBeforePagesField',
                    emptyText: 'Example: 2,4,10'
                }
            ]
        };
    },

    buildExtractCard: function() {
        return {
            itemId: 'extractCard',
            title: 'Extract Pages',
            items: [
                {
                    xtype: 'textfield',
                    fieldLabel: 'Pages',
                    itemId: 'extractPagesField',
                    emptyText: 'Example: 1-3,7,10-'
                }
            ]
        };
    },

    buildReorderCard: function() {
        return {
            itemId: 'reorderCard',
            title: 'Reorder Pages',
            items: [
                {
                    xtype: 'textfield',
                    fieldLabel: 'Page order',
                    itemId: 'pageOrderField',
                    emptyText: 'Example: 3,1,2,4-'
                }
            ]
        };
    },

    buildRotateCard: function() {
        return {
            itemId: 'rotateCard',
            title: 'Rotate Pages',
            items: [
                {
                    xtype: 'textfield',
                    fieldLabel: 'Pages',
                    itemId: 'rotatePagesField',
                    emptyText: 'Blank means all pages'
                },
                {
                    xtype: 'combo',
                    fieldLabel: 'Rotation',
                    itemId: 'rotationField',
                    editable: false,
                    queryMode: 'local',
                    displayField: 'label',
                    valueField: 'value',
                    value: 90,
                    store: Ext.create('Ext.data.Store', {
                        fields: ['value', 'label'],
                        data: [
                            { value: 90, label: '90 degrees clockwise' },
                            { value: 180, label: '180 degrees' },
                            { value: 270, label: '270 degrees clockwise' },
                            { value: -90, label: '90 degrees counter-clockwise' }
                        ]
                    })
                }
            ]
        };
    },

    buildCompressCard: function() {
        return {
            itemId: 'compressCard',
            title: 'Compress PDF',
            items: [
                {
                    xtype: 'combo',
                    fieldLabel: 'Profile',
                    itemId: 'compressionProfileField',
                    editable: false,
                    queryMode: 'local',
                    displayField: 'label',
                    valueField: 'value',
                    value: 'optimize',
                    store: Ext.create('Ext.data.Store', {
                        fields: ['value', 'label'],
                        data: [
                            { value: 'optimize', label: 'Safe optimize' },
                            { value: 'screen', label: 'Smallest size' },
                            { value: 'ebook', label: 'Balanced' },
                            { value: 'printer', label: 'Print quality' },
                            { value: 'prepress', label: 'Prepress quality' }
                        ]
                    })
                }
            ]
        };
    },

    buildWatermarkCard: function() {
        return {
            itemId: 'watermarkCard',
            title: 'Watermark',
            items: [
                {
                    xtype: 'textfield',
                    fieldLabel: 'Text',
                    itemId: 'watermarkTextField',
                    allowBlank: false
                },
                {
                    xtype: 'textfield',
                    fieldLabel: 'Pages',
                    itemId: 'watermarkPagesField',
                    emptyText: 'Blank means all pages'
                },
                {
                    xtype: 'combo',
                    fieldLabel: 'Position',
                    itemId: 'watermarkPositionField',
                    editable: false,
                    queryMode: 'local',
                    displayField: 'label',
                    valueField: 'value',
                    value: 'c',
                    store: Ext.create('Ext.data.Store', {
                        fields: ['value', 'label'],
                        data: [
                            { value: 'c', label: 'Center' },
                            { value: 'tc', label: 'Top center' },
                            { value: 'bc', label: 'Bottom center' },
                            { value: 'tl', label: 'Top left' },
                            { value: 'tr', label: 'Top right' },
                            { value: 'bl', label: 'Bottom left' },
                            { value: 'br', label: 'Bottom right' }
                        ]
                    })
                },
                {
                    xtype: 'numberfield',
                    fieldLabel: 'Opacity',
                    itemId: 'watermarkOpacityField',
                    value: 0.25,
                    minValue: 0.05,
                    maxValue: 1,
                    decimalPrecision: 2,
                    step: 0.05
                },
                {
                    xtype: 'numberfield',
                    fieldLabel: 'Font size',
                    itemId: 'watermarkFontSizeField',
                    value: 48,
                    minValue: 6,
                    maxValue: 144,
                    allowDecimals: false
                },
                {
                    xtype: 'numberfield',
                    fieldLabel: 'Text rotation',
                    itemId: 'watermarkRotationField',
                    value: 35,
                    minValue: -180,
                    maxValue: 180,
                    allowDecimals: false
                },
                {
                    xtype: 'checkbox',
                    fieldLabel: 'Overlay',
                    boxLabel: 'Place watermark above existing page content',
                    itemId: 'watermarkOverlayField',
                    checked: true
                }
            ]
        };
    },

    buildProtectCard: function() {
        return {
            itemId: 'protectCard',
            title: 'Password Protection',
            items: [
                {
                    xtype: 'textfield',
                    inputType: 'password',
                    fieldLabel: 'Open password',
                    itemId: 'userPasswordField'
                },
                {
                    xtype: 'textfield',
                    inputType: 'password',
                    fieldLabel: 'Owner password',
                    itemId: 'ownerPasswordField'
                },
                {
                    xtype: 'checkbox',
                    fieldLabel: 'Permissions',
                    boxLabel: 'Allow full access after opening',
                    itemId: 'allowFullAccessField',
                    checked: false
                }
            ]
        };
    },

    buildDecorateCard: function() {
        return {
            itemId: 'decorateCard',
            title: 'Headers, Footers, Page Numbers',
            items: [
                {
                    xtype: 'textfield',
                    fieldLabel: 'Header text',
                    itemId: 'headerTextField'
                },
                {
                    xtype: 'textfield',
                    fieldLabel: 'Footer text',
                    itemId: 'footerTextField'
                },
                {
                    xtype: 'checkbox',
                    fieldLabel: 'Page numbers',
                    boxLabel: 'Add page numbers',
                    itemId: 'includePageNumbersField',
                    checked: true
                },
                {
                    xtype: 'textfield',
                    fieldLabel: 'Number format',
                    itemId: 'pageNumberTextField',
                    value: 'Page %p of %P'
                },
                {
                    xtype: 'textfield',
                    fieldLabel: 'Pages',
                    itemId: 'decoratePagesField',
                    emptyText: 'Blank means all pages'
                },
                {
                    xtype: 'numberfield',
                    fieldLabel: 'Font size',
                    itemId: 'decorateFontSizeField',
                    value: 10,
                    minValue: 6,
                    maxValue: 48,
                    allowDecimals: false
                }
            ]
        };
    },

    buildConvertCard: function() {
        return {
            itemId: 'convertCard',
            title: 'Convert PDF',
            items: [
                {
                    xtype: 'combo',
                    fieldLabel: 'Target',
                    itemId: 'convertTargetField',
                    editable: false,
                    queryMode: 'local',
                    displayField: 'label',
                    valueField: 'value',
                    value: 'images',
                    store: Ext.create('Ext.data.Store', {
                        fields: ['value', 'label'],
                        data: [
                            { value: 'images', label: 'Images' },
                            { value: 'text', label: 'Text' },
                            { value: 'docx', label: 'Word document' },
                            { value: 'html', label: 'HTML' }
                        ]
                    })
                },
                {
                    xtype: 'combo',
                    fieldLabel: 'Image format',
                    itemId: 'imageFormatField',
                    editable: false,
                    queryMode: 'local',
                    displayField: 'label',
                    valueField: 'value',
                    value: 'png',
                    store: Ext.create('Ext.data.Store', {
                        fields: ['value', 'label'],
                        data: [
                            { value: 'png', label: 'PNG' },
                            { value: 'jpeg', label: 'JPEG' }
                        ]
                    })
                },
                {
                    xtype: 'numberfield',
                    fieldLabel: 'Image DPI',
                    itemId: 'dpiField',
                    value: 150,
                    minValue: 72,
                    maxValue: 600,
                    allowDecimals: false
                },
                {
                    xtype: 'numberfield',
                    fieldLabel: 'First page',
                    itemId: 'firstPageField',
                    minValue: 1,
                    allowDecimals: false,
                    emptyText: 'Optional'
                },
                {
                    xtype: 'numberfield',
                    fieldLabel: 'Last page',
                    itemId: 'lastPageField',
                    minValue: 1,
                    allowDecimals: false,
                    emptyText: 'Optional'
                },
                {
                    xtype: 'checkbox',
                    fieldLabel: 'Text layout',
                    boxLabel: 'Preserve text layout when converting to text',
                    itemId: 'preserveLayoutField',
                    checked: true
                },
                {
                    xtype: 'checkbox',
                    fieldLabel: 'HTML images',
                    boxLabel: 'Ignore images when converting to HTML',
                    itemId: 'ignoreImagesField',
                    checked: false
                }
            ]
        };
    },

    buildCreateCard: function() {
        return {
            itemId: 'createCard',
            title: 'Create PDF',
            items: [
                {
                    xtype: 'displayfield',
                    value: 'Creates a PDF from selected images, text files, PDFs, or Office documents. Mixed selections are converted and merged in the selected order.'
                }
            ]
        };
    },

    buildSelectedItemsHtml: function() {
        const rows = this.records.map(function(record) {
            const name = Ext.String.htmlEncode(record.get('name') || '');
            const type = Ext.String.htmlEncode(record.get('type') || record.get('mimetype') || 'File');
            const icon = Ext.String.htmlEncode(record.get('icon') || 'fa fa-file');
            return `<tr><td style="width:28px;"><i class="${icon}"></i></td><td>${name}</td><td style="width:120px;">${type}</td></tr>`;
        }).join('');

        return `<table class="x-grid-table" style="width:100%;">${rows}</table>`;
    },

    getDefaultOperation: function() {
        const records = this.records || [];
        const pdfRecords = records.filter(record => this.isPdfRecord(record));

        if (records.length > 1 && records.length === pdfRecords.length) {
            return 'merge';
        }

        if (records.length === 1 && pdfRecords.length === 1) {
            return 'compress';
        }

        return 'create';
    },

    switchOperationCard: function(operation) {
        const cards = this.down('#operationCards');
        const card = cards ? cards.down(`#${operation}Card`) : null;

        if (cards && card) {
            cards.getLayout().setActiveItem(card);
        }
    },

    updateOutputPlaceholder: function(operation) {
        const field = this.down('#outputFileNameField');
        if (!field) {
            return;
        }

        const placeholders = {
            merge: 'merged.pdf',
            split: 'Ignored for split; files are named automatically',
            extract: 'extracted.pdf',
            reorder: 'reordered.pdf',
            rotate: 'rotated.pdf',
            compress: 'compressed.pdf',
            watermark: 'watermarked.pdf',
            protect: 'protected.pdf',
            decorate: 'decorated.pdf',
            convert: 'converted output name',
            create: 'created.pdf'
        };

        field.setEmptyText(placeholders[operation] || 'Optional output name');
    },

    fieldValue: function(itemId) {
        const field = this.down(`#${itemId}`);
        return field && field.getValue ? field.getValue() : null;
    },

    isPdfRecord: function(record) {
        const mimetype = String(record.get('mimetype') || '');
        const name = String(record.get('name') || '');
        return mimetype === 'application/pdf' || /\.pdf$/i.test(name);
    },

    isCreatableRecord: function(record) {
        const mimetype = String(record.get('mimetype') || '');
        const name = String(record.get('name') || '');
        return this.isPdfRecord(record) ||
            mimetype.indexOf('image/') === 0 ||
            mimetype.indexOf('text/') === 0 ||
            mimetype.indexOf('word') !== -1 ||
            mimetype.indexOf('excel') !== -1 ||
            mimetype.indexOf('powerpoint') !== -1 ||
            mimetype.indexOf('spreadsheet') !== -1 ||
            mimetype.indexOf('presentation') !== -1 ||
            /\.(doc|docx|odt|rtf|txt|md|html|xls|xlsx|ods|ppt|pptx|odp)$/i.test(name);
    },

    validateSelection: function(operation) {
        const records = this.records || [];
        const hasFolder = records.some(record => record.get('isFolder'));
        const hasShared = records.some(record => record.get('isShared'));
        const pdfCount = records.filter(record => this.isPdfRecord(record)).length;

        if (!records.length) {
            return 'Select at least one file.';
        }

        if (hasFolder) {
            return 'PDF Studio works on files. Please open folders and select their files.';
        }

        if (hasShared) {
            return 'Only owners can create transformed files from PDF Studio.';
        }

        if (operation === 'merge' && (records.length < 2 || pdfCount !== records.length)) {
            return 'Merge requires at least two PDF files.';
        }

        if (['split', 'extract', 'reorder', 'rotate', 'compress', 'watermark', 'protect', 'decorate', 'convert'].includes(operation) && (records.length !== 1 || pdfCount !== 1)) {
            return 'This operation requires exactly one PDF file.';
        }

        if (operation === 'create' && records.some(record => !this.isCreatableRecord(record))) {
            return 'Create PDF supports images, text files, PDFs, and Office documents.';
        }

        return null;
    },

    buildOptions: function(operation) {
        switch (operation) {
            case 'split':
                return {
                    splitMode: this.fieldValue('splitModeField'),
                    span: this.fieldValue('splitSpanField'),
                    splitBeforePages: this.fieldValue('splitBeforePagesField')
                };
            case 'extract':
                return {
                    pages: this.fieldValue('extractPagesField')
                };
            case 'reorder':
                return {
                    pageOrder: this.fieldValue('pageOrderField')
                };
            case 'rotate':
                return {
                    pages: this.fieldValue('rotatePagesField'),
                    rotation: this.fieldValue('rotationField')
                };
            case 'compress':
                return {
                    compressionProfile: this.fieldValue('compressionProfileField')
                };
            case 'watermark':
                return {
                    watermarkText: this.fieldValue('watermarkTextField'),
                    pages: this.fieldValue('watermarkPagesField'),
                    position: this.fieldValue('watermarkPositionField'),
                    opacity: this.fieldValue('watermarkOpacityField'),
                    fontSize: this.fieldValue('watermarkFontSizeField'),
                    rotation: this.fieldValue('watermarkRotationField'),
                    overlay: this.fieldValue('watermarkOverlayField')
                };
            case 'protect':
                return {
                    userPassword: this.fieldValue('userPasswordField'),
                    ownerPassword: this.fieldValue('ownerPasswordField'),
                    allowFullAccess: this.fieldValue('allowFullAccessField')
                };
            case 'decorate':
                return {
                    headerText: this.fieldValue('headerTextField'),
                    footerText: this.fieldValue('footerTextField'),
                    includePageNumbers: this.fieldValue('includePageNumbersField'),
                    pageNumberText: this.fieldValue('pageNumberTextField'),
                    pages: this.fieldValue('decoratePagesField'),
                    fontSize: this.fieldValue('decorateFontSizeField')
                };
            case 'convert':
                return {
                    targetFormat: this.fieldValue('convertTargetField'),
                    imageFormat: this.fieldValue('imageFormatField'),
                    dpi: this.fieldValue('dpiField'),
                    firstPage: this.fieldValue('firstPageField'),
                    lastPage: this.fieldValue('lastPageField'),
                    preserveLayout: this.fieldValue('preserveLayoutField'),
                    ignoreImages: this.fieldValue('ignoreImagesField')
                };
            default:
                return {};
        }
    },

    validateOperationOptions: function(operation, options) {
        if (operation === 'extract' && !String(options.pages || '').trim()) {
            return 'Enter the pages to extract.';
        }

        if (operation === 'reorder' && !String(options.pageOrder || '').trim()) {
            return 'Enter the desired page order.';
        }

        if (operation === 'watermark' && !String(options.watermarkText || '').trim()) {
            return 'Enter watermark text.';
        }

        if (operation === 'protect' && (!String(options.userPassword || '').trim() || !String(options.ownerPassword || '').trim())) {
            return 'Enter both open and owner passwords.';
        }

        if (operation === 'decorate' && !String(options.headerText || '').trim() && !String(options.footerText || '').trim() && !options.includePageNumbers) {
            return 'Add a header, footer, or page numbers.';
        }

        return null;
    },

    runOperation: function() {
        const me = this;
        const operation = me.fieldValue('operationField');
        const selectionError = me.validateSelection(operation);

        if (selectionError) {
            Ext.Msg.alert('PDF Studio', selectionError);
            return;
        }

        const options = me.buildOptions(operation);
        const optionError = me.validateOperationOptions(operation, options);

        if (optionError) {
            Ext.Msg.alert('PDF Studio', optionError);
            return;
        }

        const grid = me.getGrid ? me.getGrid() : null;
        if (grid && grid.ensurePrivateVaultUnlocked && !grid.ensurePrivateVaultUnlocked(function() {
            me.runOperation();
        })) {
            return;
        }

        const token = FileManagement.helpers.Functions.getToken();
        const mask = new Ext.LoadMask({
            target: me,
            msg: 'Running PDF Studio operation...'
        });

        mask.show();

        Ext.Ajax.request({
            url: FileManagementEnv.apiUrl('/api/pdf-studio/execute'),
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            jsonData: {
                operation,
                fileIds: me.records.map(record => record.get('id')),
                parentId: me.getCurrentFolderId() || null,
                outputFileName: me.fieldValue('outputFileNameField'),
                options
            },
            success: function(response) {
                mask.hide();
                const result = Ext.decode(response.responseText, true) || {};
                const files = result.files || [];
                const scanNote = files.some(file => file.scanStatus === 'pending' || file.scanStatus === 'scanning')
                    ? ' The generated file is queued for virus scanning and will appear when clean.'
                    : '';

                if (me.getGrid() && me.getGrid().getStore) {
                    me.getGrid().getStore().reload();
                }

                if (FileManagement.components.utils.PanelUtils) {
                    FileManagement.components.utils.PanelUtils.refreshHomeDashboard();
                }

                me.close();
                Ext.Msg.alert('PDF Studio', `${result.message || 'Operation completed.'}${scanNote}`);

                if (Ext.isFunction(me.getOnSuccess())) {
                    me.getOnSuccess()(result);
                }
            },
            failure: function(response) {
                mask.hide();
                if (grid && grid.handlePrivateVaultAccessFailure && grid.handlePrivateVaultAccessFailure(response, {
                    onUnlock: function() {
                        me.runOperation();
                    }
                })) {
                    return;
                }
                const result = Ext.decode(response.responseText, true) || {};
                Ext.Msg.alert('PDF Studio', result.error || result.message || 'PDF Studio operation failed.');
            }
        });
    }
});
