import json
from django import forms
from django.conf import settings
from django.utils.safestring import mark_safe

class WorkflowStateWidget(forms.Widget):
    template_name = "api/widgets/workflow_state.html"

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

    @property
    def media(self):
        # In a real setup, we would point to the hashed bundle in STATIC_ROOT.
        # For development/demo, we point to the Vite output.
        js = [
            "admin-widget.js",
        ]
        return forms.Media(js=js)

    def render(self, name, value, attrs=None, renderer=None):
        context = self.get_context(name, value, attrs)
        
        container_id = f"workflow-state-root-{name}"
        initial_state = context["widget"]["initial_state_json"]
        ui_schema = context["widget"]["ui_schema_json"]
        piece_id = context["widget"]["piece_id"]
        
        html = f"""
        <div id="{container_id}" class="workflow-state-widget-container"></div>
        <input type="hidden" name="{name}" id="id_{name}" value="">
        <script>
            document.addEventListener('DOMContentLoaded', function() {{
                if (window.mountWorkflowStateWidget) {{
                    window.mountWorkflowStateWidget({{
                        containerId: '{container_id}',
                        pieceId: '{piece_id}',
                        initialPieceState: {initial_state},
                        uiSchema: {ui_schema},
                        onDirtyChange: function(dirty) {{
                            // console.log('Form dirty:', dirty);
                        }},
                        saveStateFn: function(payload) {{
                            // In Admin, we don't save via API immediately.
                            // We update the hidden input so the main Admin "Save" submits it.
                            document.getElementById('id_{name}').value = JSON.stringify(payload);
                            return Promise.resolve({{}}); // Mock success
                        }}
                    }});
                }}
            }});
        </script>
        <style>
            .workflow-state-widget-container {{
                border: 1px solid #ccc;
                padding: 10px;
                border-radius: 4px;
                background: #f9f9f9;
                margin-bottom: 10px;
            }}
        </style>
        """
        return mark_safe(html)
