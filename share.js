(function() {
    const API_BASE = FileManagementEnv.apiUrl('/api/public/share');
    let rootPanel = null;
    let shareToken = null;
    let passwordAccessToken = null;
    let currentMetadata = null;

    function getTokenFromUrl() {
        const params = new URLSearchParams(window.location.search);
        return params.get('token') || '';
    }

    function encode(value) {
        return Ext.String.htmlEncode(String(value || ''));
    }

    function formatSize(bytes) {
        const value = Number(bytes) || 0;
        if (value < 1024) return `${value} B`;
        if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
        if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
        return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }

    function isCompact() {
        return Ext.Element.getViewportWidth() < 780;
    }

    function getItemIcon(item) {
        const mimetype = item.mimetype || '';
        if (item.isFolder) return 'fa fa-folder';
        if (mimetype.startsWith('image/')) return 'fa fa-image';
        if (mimetype.startsWith('audio/')) return 'fa fa-music';
        if (mimetype.startsWith('video/')) return 'fa fa-film';
        if (mimetype === 'application/pdf') return 'fa fa-file-pdf';
        if (mimetype.startsWith('text/') || mimetype === 'application/json') return 'fa fa-file-lines';
        return 'fa fa-file';
    }

    function getPreviewKind(item) {
        const mimetype = String(item.mimetype || '').toLowerCase();

        if (item.isFolder) return 'folder';
        if (mimetype.startsWith('image/')) return 'image';
        if (mimetype.startsWith('audio/')) return 'audio';
        if (mimetype.startsWith('video/')) return 'video';
        if (mimetype === 'application/pdf') return 'pdf';
        if (
            mimetype.startsWith('text/') ||
            [
                'application/json',
                'application/xml',
                'application/javascript',
                'application/x-javascript',
                'application/csv'
            ].indexOf(mimetype) !== -1
        ) {
            return 'text';
        }

        return 'unsupported';
    }

    function isFilePreviewable(item) {
        return getPreviewKind(item) !== 'unsupported';
    }

    function getPermissionLabel(link) {
        return link.canDownload ? 'Preview and download' : 'Preview only';
    }

    function getExpiryLabel(link) {
        if (!link.expiresAt) {
            return 'No expiry';
        }

        return `Expires ${Ext.Date.format(new Date(link.expiresAt), 'M d, Y g:i A')}`;
    }

    function apiUrl(suffix) {
        return `${API_BASE}/${encodeURIComponent(shareToken)}${suffix || ''}`;
    }

    function accessQuery() {
        return passwordAccessToken ? `?accessToken=${encodeURIComponent(passwordAccessToken)}` : '';
    }

    function contentUrl() {
        return apiUrl('/content') + accessQuery();
    }

    function downloadUrl() {
        return apiUrl('/download') + accessQuery();
    }

    function childrenUrl() {
        return apiUrl('/children') + accessQuery();
    }

    function ensureRoot() {
        if (rootPanel) {
            return rootPanel;
        }

        Ext.create('Ext.container.Viewport', {
            layout: 'fit',
            style: {
                backgroundColor: '#e7eef7'
            },
            items: [
                {
                    xtype: 'panel',
                    id: 'publicShareRoot',
                    header: false,
                    border: false,
                    layout: 'fit',
                    bodyCls: 'public-share-root'
                }
            ]
        });

        rootPanel = Ext.getCmp('publicShareRoot');
        return rootPanel;
    }

    function setContent(config) {
        const root = ensureRoot();
        root.removeAll();
        root.add(config);
        root.updateLayout();
    }

    function renderMessage(title, message, iconCls) {
        setContent({
            xtype: 'container',
            cls: 'public-share-message',
            layout: {
                type: 'vbox',
                pack: 'center',
                align: 'center'
            },
            items: [
                {
                    xtype: 'component',
                    cls: 'public-share-message-card',
                    html: [
                        `<i class="${iconCls || 'fa fa-link-slash'}"></i>`,
                        '<div class="public-share-eyebrow">Shared link status</div>',
                        `<h1>${encode(title)}</h1>`,
                        `<p>${encode(message)}</p>`,
                        '<div class="public-share-message-actions">',
                            '<span>Ask the owner for a new link, or check that the URL was copied completely.</span>',
                        '</div>'
                    ].join('')
                }
            ]
        });
    }

    function renderLoading() {
        renderMessage('Opening shared item', 'Checking whether this direct link is still valid...', 'fa fa-spinner fa-spin');
    }

    function loadMetadata() {
        if (!shareToken) {
            renderMessage('Invalid link', 'This direct link is missing its token.', 'fa fa-link-slash');
            return;
        }

        Ext.Ajax.request({
            url: apiUrl(''),
            method: 'GET',
            success: function(response) {
                currentMetadata = Ext.decode(response.responseText, true);
                renderShare();
            },
            failure: function(response) {
                const payload = Ext.decode(response.responseText, true) || {};
                renderMessage('Link unavailable', payload.message || 'This direct link is invalid, expired, or has been invalidated.', 'fa fa-link-slash');
            }
        });
    }

    function verifyPassword(passwordField) {
        const password = passwordField.getValue();
        if (!password) {
            Ext.Msg.alert('Password Required', 'Enter the item password to continue.');
            return;
        }

        const panel = passwordField.up('panel');
        panel.setLoading('Verifying password...');

        Ext.Ajax.request({
            url: apiUrl('/password'),
            method: 'POST',
            jsonData: {
                password
            },
            success: function(response) {
                panel.setLoading(false);
                const payload = Ext.decode(response.responseText, true) || {};
                passwordAccessToken = payload.accessToken || null;
                renderShare();
            },
            failure: function(response) {
                panel.setLoading(false);
                const payload = Ext.decode(response.responseText, true) || {};
                Ext.Msg.alert('Password Failed', payload.message || 'Invalid password.');
            }
        });
    }

    function renderShare() {
        const payload = currentMetadata || {};
        const item = payload.item || {};
        const link = payload.link || {};
        const locked = link.requiresPassword && !passwordAccessToken;

        setContent({
            xtype: 'container',
            scrollable: {
                x: false,
                y: true
            },
            cls: 'public-share-layout',
            layout: {
                type: 'vbox',
                align: 'stretch'
            },
            items: [
                createSummaryCard(item, link, locked),
                locked ? createPasswordPanel(item) : createAccessWorkspace(item, link)
            ]
        });
    }

    function createSummaryCard(item, link, locked) {
        return {
            xtype: 'component',
            html: [
                '<div class="public-share-summary-card">',
                    '<div class="public-share-file-mark">',
                        `<i class="${getItemIcon(item)}"></i>`,
                    '</div>',
                    '<div class="public-share-summary-copy">',
                        '<div class="public-share-eyebrow">Secure shared item</div>',
                        `<h1>${encode(item.name)}</h1>`,
                        '<div class="public-share-badges">',
                            `<span>${encode(item.type || 'File')}</span>`,
                            `<span>${formatSize(item.size)}</span>`,
                            `<span>${encode(getPermissionLabel(link))}</span>`,
                            `<span>${encode(getExpiryLabel(link))}</span>`,
                            locked ? '<span class="public-share-badge-warning">Password required</span>' : '',
                        '</div>',
                    '</div>',
                '</div>'
            ].join('')
        };
    }

    function createPasswordPanel(item) {
        return {
            xtype: 'container',
            layout: {
                type: 'hbox',
                pack: 'center',
                align: 'stretch'
            },
            items: [
                {
                    xtype: 'panel',
                    title: 'Protected Share',
                    iconCls: 'fa fa-lock',
                    frame: true,
                    cls: 'public-share-password-panel',
                    width: isCompact() ? null : 560,
                    flex: isCompact() ? 1 : null,
                    bodyPadding: 18,
                    layout: 'anchor',
                    defaults: {
                        anchor: '100%'
                    },
                    items: [
                        {
                            xtype: 'component',
                            cls: 'public-share-lock-copy',
                            html: [
                                '<h2>Enter the item password</h2>',
                                `<p>This ${item.isFolder ? 'folder' : 'file'} is protected by its owner. Unlock it to continue.</p>`
                            ].join('')
                        },
                        {
                            xtype: 'textfield',
                            inputType: 'password',
                            fieldLabel: 'Password',
                            itemId: 'publicSharePassword',
                            allowBlank: false,
                            margin: '12 0 0 0',
                            listeners: {
                                specialkey: function(field, event) {
                                    if (event.getKey() === event.ENTER) {
                                        verifyPassword(field);
                                    }
                                }
                            }
                        }
                    ],
                    buttons: [
                        {
                            text: 'Unlock',
                            iconCls: 'fa fa-lock-open',
                            handler: function(button) {
                                verifyPassword(button.up('panel').down('#publicSharePassword'));
                            }
                        }
                    ]
                }
            ]
        };
    }

    function createAccessWorkspace(item, link) {
        const compact = isCompact();

        return {
            xtype: 'container',
            cls: 'public-share-workspace',
            flex: compact ? null : 1,
            layout: {
                type: compact ? 'vbox' : 'hbox',
                align: 'stretch'
            },
            items: [
                createPreviewPanel(item, link, compact),
                createActionsPanel(item, link, compact)
            ]
        };
    }

    function createPreviewPanel(item, link, compact) {
        if (item.isFolder) {
            return createFolderContentsPanel(compact);
        }

        return {
            xtype: 'panel',
            title: 'Preview',
            iconCls: 'fa fa-eye',
            frame: true,
            cls: 'public-share-preview-panel',
            flex: compact ? null : 1,
            height: compact ? 420 : null,
            margin: compact ? '0 0 12 0' : '0 14 0 0',
            layout: 'fit',
            items: [
                {
                    xtype: 'container',
                    itemId: 'previewRegion',
                    cls: 'public-share-preview-region',
                    html: '<div class="public-share-empty"><i class="fa fa-spinner fa-spin"></i><h2>Loading preview</h2><p>Preparing the file for your browser.</p></div>'
                }
            ],
            listeners: {
                afterrender: function(panel) {
                    Ext.defer(function() {
                        renderPreview(item, link, panel.down('#previewRegion'));
                    }, 80);
                }
            }
        };
    }

    function createFolderContentsPanel(compact) {
        const folderStore = Ext.create('Ext.data.Store', {
            fields: [
                { name: 'id', type: 'string' },
                { name: 'name', type: 'string' },
                { name: 'isFolder', type: 'boolean' },
                { name: 'type', type: 'string' },
                { name: 'mimetype', type: 'string' },
                { name: 'size', type: 'number' },
                { name: 'createdAt', type: 'date' },
                { name: 'hasChildren', type: 'boolean' }
            ]
        });

        return {
            xtype: 'panel',
            title: 'Folder Contents',
            iconCls: 'fa fa-folder-open',
            frame: true,
            cls: 'public-share-preview-panel',
            flex: compact ? null : 1,
            height: compact ? 420 : null,
            margin: compact ? '0 0 12 0' : '0 14 0 0',
            layout: 'fit',
            tbar: [
                {
                    xtype: 'tbtext',
                    itemId: 'folderContentsSummary',
                    text: 'Loading folder contents...'
                },
                '->',
                {
                    xtype: 'button',
                    text: 'Refresh',
                    iconCls: 'fa fa-refresh',
                    handler: function(button) {
                        loadFolderChildren(button.up('panel'));
                    }
                }
            ],
            items: [
                {
                    xtype: 'grid',
                    itemId: 'folderContentsGrid',
                    cls: 'public-share-folder-grid',
                    store: folderStore,
                    border: false,
                    columns: [
                        {
                            text: '',
                            dataIndex: 'isFolder',
                            width: 36,
                            menuDisabled: true,
                            sortable: false,
                            renderer: function(value, metaData, record) {
                                return `<i class="${getItemIcon(record.data)}"></i>`;
                            }
                        },
                        {
                            text: 'Name',
                            dataIndex: 'name',
                            flex: 1,
                            renderer: function(value, metaData, record) {
                                const childHint = record.get('isFolder') && record.get('hasChildren')
                                    ? '<span class="public-share-child-hint">Contains items</span>'
                                    : '';
                                return [
                                    '<div class="public-share-child-name">',
                                        encode(value),
                                    '</div>',
                                    childHint
                                ].join('');
                            }
                        },
                        {
                            text: 'Type',
                            dataIndex: 'type',
                            width: 130,
                            renderer: function(value) {
                                return encode(value || 'File');
                            }
                        },
                        {
                            text: 'Size',
                            dataIndex: 'size',
                            width: 95,
                            align: 'right',
                            renderer: formatSize
                        },
                        {
                            text: 'Created',
                            dataIndex: 'createdAt',
                            width: 135,
                            renderer: Ext.util.Format.dateRenderer('M d, Y')
                        }
                    ],
                    viewConfig: {
                        deferEmptyText: false,
                        emptyText: '<div class="public-share-empty public-share-empty-grid"><i class="fa fa-folder-open"></i><h2>No visible items</h2><p>This folder has no clean, unprotected items to show.</p></div>'
                    }
                }
            ],
            listeners: {
                afterrender: function(panel) {
                    loadFolderChildren(panel);
                }
            }
        };
    }

    function loadFolderChildren(panel) {
        if (!panel || panel.destroyed) {
            return;
        }

        const grid = panel.down('#folderContentsGrid');
        const summary = panel.down('#folderContentsSummary');
        if (!grid) {
            return;
        }

        panel.setLoading('Loading folder contents...');
        Ext.Ajax.request({
            url: childrenUrl(),
            method: 'GET',
            success: function(response) {
                panel.setLoading(false);
                const payload = Ext.decode(response.responseText, true) || {};
                const children = payload.children || [];
                grid.getStore().loadData(children);

                if (summary) {
                    const visibleText = `${children.length} visible item${children.length === 1 ? '' : 's'}`;
                    const hiddenText = payload.hiddenCount
                        ? `, ${payload.hiddenCount} protected or unavailable`
                        : '';
                    summary.setText(`${visibleText}${hiddenText}`);
                }
            },
            failure: function(response) {
                panel.setLoading(false);
                const payload = Ext.decode(response.responseText, true) || {};
                if (summary) {
                    summary.setText('Unable to load folder contents');
                }
                Ext.Msg.alert('Folder Contents', payload.message || 'Unable to load folder contents.');
            }
        });
    }

    function createActionsPanel(item, link, compact) {
        const canPreview = !item.isFolder && isFilePreviewable(item);
        const canDownload = !!link.canDownload;
        const unsupportedPreview = !item.isFolder && !canPreview;

        return {
            xtype: 'panel',
            title: 'Access',
            iconCls: 'fa fa-key',
            frame: true,
            cls: 'public-share-actions-panel',
            width: compact ? null : 320,
            bodyPadding: 14,
            layout: {
                type: 'vbox',
                align: 'stretch'
            },
            defaults: {
                margin: '0 0 10 0'
            },
            items: [
                {
                    xtype: 'component',
                    cls: 'public-share-action-copy',
                    html: [
                        '<h2>Ready to open</h2>',
                        `<p>${getAccessDescription(item, link, canPreview)}</p>`,
                        `<div class="public-share-fact"><span>Permission</span><strong>${encode(getPermissionLabel(link))}</strong></div>`,
                        `<div class="public-share-fact"><span>Expires</span><strong>${encode(getExpiryLabel(link))}</strong></div>`
                    ].join('')
                },
                {
                    xtype: 'button',
                    text: 'Preview File',
                    iconCls: 'fa fa-eye',
                    disabled: !canPreview,
                    hidden: item.isFolder,
                    tooltip: canPreview ? 'Preview this file in the browser.' : 'This file type cannot be previewed in the browser.',
                    handler: function() {
                        const root = Ext.getCmp('publicShareRoot');
                        const previewRegion = root ? root.down('#previewRegion') : null;
                        if (previewRegion) {
                            renderPreview(item, link, previewRegion);
                        }
                    }
                },
                {
                    xtype: 'button',
                    text: item.isFolder ? 'Download ZIP' : 'Download File',
                    iconCls: 'fa fa-download',
                    disabled: !canDownload,
                    handler: function() {
                        window.location.href = downloadUrl();
                    }
                },
                {
                    xtype: 'component',
                    hidden: !unsupportedPreview,
                    cls: 'public-share-note',
                    html: '<i class="fa fa-eye-slash"></i> This file type cannot be previewed in the browser. Nothing will download unless you choose Download.'
                },
                {
                    xtype: 'component',
                    hidden: canDownload,
                    cls: 'public-share-note',
                    html: '<i class="fa fa-circle-info"></i> The owner disabled downloads for this link.'
                }
            ]
        };
    }

    function getAccessDescription(item, link, canPreview) {
        if (item.isFolder) {
            return 'Download the folder as a ZIP if the owner allowed it.';
        }

        if (canPreview) {
            return 'Preview the file here, or download it if the owner allowed downloads.';
        }

        if (link.canDownload) {
            return 'This file type does not have a browser preview. Use Download when you are ready.';
        }

        return 'This file type cannot be previewed in the browser, and downloads are disabled by the owner.';
    }

    function renderUnsupportedPreview(item, region) {
        region.update([
            '<div class="public-share-empty public-share-unsupported">',
                `<i class="${getItemIcon(item)}"></i>`,
                '<h2>Preview unavailable</h2>',
                `<p>${encode(item.name)} cannot be previewed safely in the browser.</p>`,
                '<p>No download has started. Use the Download button only if the owner allowed downloads.</p>',
            '</div>'
        ].join(''));
    }

    function applyMediaPreviewRestrictions(region, selector, canDownload) {
        if (!region || region.destroyed || canDownload) {
            return;
        }

        const mediaEl = region.getEl() ? region.getEl().down(selector) : null;
        if (!mediaEl || !mediaEl.dom) {
            return;
        }

        mediaEl.on('contextmenu', function(event) {
            event.preventDefault();
        });

        mediaEl.dom.setAttribute('controlslist', 'nodownload noplaybackrate noremoteplayback');
        mediaEl.dom.setAttribute('disablePictureInPicture', 'true');
        mediaEl.dom.setAttribute('disableremoteplayback', 'true');
        mediaEl.dom.setAttribute('playsinline', 'true');
        mediaEl.dom.setAttribute('draggable', 'false');
    }

    function renderPreview(item, link, region) {
        const mimetype = item.mimetype || '';
        const previewKind = getPreviewKind(item);
        const src = contentUrl();
        const canDownload = !!(link && link.canDownload);
        let html;

        if (previewKind === 'image') {
            html = `<div class="public-share-preview-wrap"><img class="public-share-preview-image" src="${src}" alt="${encode(item.name)}"></div>`;
        } else if (previewKind === 'audio') {
            html = `<div class="public-share-preview-wrap"><audio controls class="public-share-preview-media" src="${src}"></audio></div>`;
        } else if (previewKind === 'video') {
            html = `<div class="public-share-preview-wrap"><video controls class="public-share-preview-media" src="${src}"></video></div>`;
        } else if (previewKind === 'pdf') {
            html = `<iframe class="public-share-preview-frame" src="${src}"></iframe>`;
        } else if (previewKind === 'text') {
            region.update('<div class="public-share-empty"><i class="fa fa-spinner fa-spin"></i><h2>Loading text preview</h2></div>');
            Ext.Ajax.request({
                url: src,
                method: 'GET',
                success: function(response) {
                    region.update(`<pre class="public-share-preview-text">${encode(response.responseText)}</pre>`);
                },
                failure: function(response) {
                    const payload = Ext.decode(response.responseText, true) || {};
                    region.update(`<div class="public-share-empty"><i class="fa fa-triangle-exclamation"></i><h2>Preview failed</h2><p>${encode(payload.message || 'Preview failed.')}</p></div>`);
                }
            });
            return;
        } else {
            renderUnsupportedPreview(item, region);
            return;
        }

        region.update(html);

        if (previewKind === 'audio') {
            applyMediaPreviewRestrictions(region, 'audio', canDownload);
        } else if (previewKind === 'video') {
            applyMediaPreviewRestrictions(region, 'video', canDownload);
        }
    }

    Ext.onReady(function() {
        shareToken = getTokenFromUrl();
        renderLoading();
        loadMetadata();
    });
})();
