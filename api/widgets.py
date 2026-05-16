import json
from django import forms
from django.conf import settings
from django.templatetags.static import static
from django.utils.safestring import mark_safe


class WorkflowStateWidget(forms.Widget):
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

        # Predictable asset paths from our Vite config
        js_url = static("admin-widget.js")
        css_url = static("assets/admin-widget.css")

        html = f"""
        <link rel="stylesheet" href="{css_url}">
        <div id="{container_id}" class="workflow-state-widget-container"
             style="min-height: 200px; border: 1px solid #ccc; border-radius: 4px; padding: 16px; background: #fff;">
            Loading custom fields...
        </div>
        <input type="hidden" name="{name}" id="id_{name}" value="">
        
        <script type="module">
            import {{ mountWorkflowStateWidget }} from "{js_url}";
            
            document.addEventListener('DOMContentLoaded', function() {{
                try {{
                    mountWorkflowStateWidget({{
                        containerId: '{container_id}',
                        pieceId: '{piece_id}',
                        initialPieceState: {initial_state},
                        uiSchema: {ui_schema},
                        onDirtyChange: function(dirty) {{
                            // console.log('Form dirty:', dirty);
                        }},
                        saveStateFn: function(payload) {{
                            // In Admin, we update the hidden input so the main Admin "Save" submits it.
                            document.getElementById('id_{name}').value = JSON.stringify(payload);
                            return Promise.resolve({{}}); 
                        }}
                    }});
                }} catch (e) {{
                    console.error("Failed to mount WorkflowState widget:", e);
                    document.getElementById('{container_id}').innerHTML = 
                        '<div style="color: red;">Error loading workflow fields. Check console.</div>';
                }}
            }});
        </script>
        """
        return mark_safe(html)
