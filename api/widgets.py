import json
import os
from django import forms
from django.conf import settings
from django.templatetags.static import static
from django.utils.safestring import mark_safe


class WorkflowStateWidget(forms.Widget):
    template_name = None

    def __init__(self, attrs=None, piece_id=None, state_id=None, ui_schema=None):
        super().__init__(attrs)
        self.piece_id = piece_id
        self.state_id = state_id
        self.ui_schema = ui_schema

    def get_context(self, name, value, attrs):
        context = super().get_context(name, value, attrs)
        context["widget"]["piece_id"] = str(self.piece_id)
        context["widget"]["state_id"] = self.state_id
        context["widget"]["ui_schema_json"] = json.dumps(self.ui_schema)

        # 'value' here is the initial PieceState data as a dict
        context["widget"]["initial_state_json"] = json.dumps(value)
        return context

    def render(self, name, value, attrs=None, renderer=None):
        context = self.get_context(name, value, attrs)

        container_id = f"workflow-state-root-{name}"
        initial_state = context["widget"]["initial_state_json"]
        ui_schema = context["widget"]["ui_schema_json"]
        piece_id = context["widget"]["piece_id"]

        # In development, we prefer the Vite dev server if running.
        # gz_start sets APP_ORIGIN to the Vite URL (e.g. http://localhost:5173).
        app_origin = os.environ.get("APP_ORIGIN")
        is_dev = settings.DEBUG and app_origin

        if is_dev:
            # When using Vite dev server, we need the React Refresh preamble.
            # We also load the entry point via a dynamic import inside a module script.
            vite_preamble = f"""
            <script type="module">
                import {{ injectIntoGlobalHook }} from "{app_origin}/@react-refresh";
                injectIntoGlobalHook(window);
                window.$RefreshReg$ = () => {{}};
                window.$RefreshSig$ = () => (type) => type;
                window.__vite_plugin_react_preamble_installed__ = true;
            </script>
            <script type="module" src="{app_origin}/@vite/client"></script>
            """
            js_url = f"{app_origin}/src/admin.tsx"
            css_html = ""
        else:
            vite_preamble = ""
            js_url = static("admin-widget.js")
            css_url = static("assets/admin-widget.css")
            css_html = f'<link rel="stylesheet" href="{css_url}">'

        html = f"""
        {vite_preamble}
        {css_html}
        <div id="{container_id}" class="workflow-state-widget-container"
             style="min-height: 200px; border: 1px solid #ccc; border-radius: 4px; padding: 16px; background: #fff; margin-bottom: 20px;">
            Loading custom fields...
        </div>
        <input type="hidden" name="{name}" id="id_{name}" value="">
        
        <script type="module">
            // Use dynamic import to catch errors and ensure predictable execution
            import {{ mountWorkflowStateWidget }} from "{js_url}";
            
            const mount = () => {{
                try {{
                    if (typeof mountWorkflowStateWidget !== 'function') {{
                        throw new Error("mountWorkflowStateWidget is not a function (is: " + typeof mountWorkflowStateWidget + ")");
                    }}
                    mountWorkflowStateWidget({{
                        containerId: '{container_id}',
                        pieceId: '{piece_id}',
                        initialPieceState: {initial_state},
                        uiSchema: {ui_schema},
                        onDirtyChange: (dirty) => {{
                            // console.log('Form dirty:', dirty);
                        }},
                        saveStateFn: (payload) => {{
                            // Update hidden input so main Admin "Save" sees the changes
                            document.getElementById('id_{name}').value = JSON.stringify(payload);
                            return Promise.resolve({{}}); 
                        }}
                    }});
                }} catch (e) {{
                    console.error("Failed to mount WorkflowState widget:", e);
                    document.getElementById('{container_id}').innerHTML = 
                        '<div style="color: red; padding: 10px;">' +
                        '<strong>Error loading workflow fields:</strong><br>' + 
                        e.message + 
                        '<br><br>Check browser console for details.' +
                        '</div>';
                }}
            }};

            if (document.readyState === 'loading') {{
                document.addEventListener('DOMContentLoaded', mount);
            }} else {{
                mount();
            }}
        </script>
        """
        return mark_safe(html)
