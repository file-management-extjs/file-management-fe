Ext.define('FileManagement.components.utils.WorkspaceContext', {
    singleton: true,

    activeWorkspace: null,
    workspaces: [],
    loadPromise: null,
    storageKey: 'fileManagement.activeWorkspaceId',

    getStoredWorkspaceId: function() {
        try {
            return window.localStorage.getItem(this.storageKey) || '';
        } catch (error) {
            return '';
        }
    },

    setStoredWorkspaceId: function(workspaceId) {
        try {
            if (workspaceId) {
                window.localStorage.setItem(this.storageKey, workspaceId);
            }
        } catch (error) {
            // Storage may be unavailable in private/browser-restricted contexts.
        }
    },

    load: function(options = {}) {
        if (this.loadPromise && options.force !== true) {
            return this.loadPromise;
        }

        const token = FileManagement.helpers.Functions.getToken();
        if (!token) {
            return Promise.resolve(null);
        }

        const storedWorkspaceId = options.workspaceId || this.getStoredWorkspaceId();
        const query = storedWorkspaceId ? `?workspaceId=${encodeURIComponent(storedWorkspaceId)}` : '';

        this.loadPromise = fetch(FileManagementEnv.apiUrl(`/api/workspaces/context${query}`), {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
            .then(response => response.ok ? response.json() : Promise.reject(new Error('Failed to load workspaces')))
            .then(payload => {
                this.workspaces = (payload.workspaces || []).filter(workspace => !workspace.status || workspace.status === 'active');
                this.activeWorkspace = this.workspaces.find(workspace => payload.activeWorkspace && workspace.id === payload.activeWorkspace.id) ||
                    this.workspaces[0] ||
                    null;

                if (this.activeWorkspace) {
                    this.setStoredWorkspaceId(this.activeWorkspace.id);
                }

                this.fireChanged();
                return this.getContext();
            })
            .catch(error => {
                console.error('Workspace context failed:', error);
                return this.getContext();
            })
            .then(context => {
                Ext.defer(() => {
                    this.loadPromise = null;
                }, 250);
                return context;
            });

        return this.loadPromise;
    },

    getContext: function() {
        return {
            activeWorkspace: this.activeWorkspace,
            workspaces: this.workspaces || []
        };
    },

    getActiveWorkspace: function() {
        return this.activeWorkspace;
    },

    getActiveWorkspaceId: function() {
        return this.activeWorkspace ? this.activeWorkspace.id : '';
    },

    getActiveWorkspaceLabel: function() {
        const workspace = this.getActiveWorkspace();
        if (!workspace) {
            return 'Personal';
        }

        return workspace.type === 'organization'
            ? `${workspace.name} (Org)`
            : workspace.name;
    },

    setActiveWorkspace: function(workspaceId) {
        const workspace = (this.workspaces || []).find(item => item.id === workspaceId);
        if (!workspace) {
            return Promise.resolve(this.getContext());
        }

        this.activeWorkspace = workspace;
        this.setStoredWorkspaceId(workspace.id);
        this.fireChanged();
        return Promise.resolve(this.getContext());
    },

    fireChanged: function() {
        if (Ext.GlobalEvents) {
            Ext.GlobalEvents.fireEvent('workspacecontextchanged', this.getContext());
        }
    }
});
