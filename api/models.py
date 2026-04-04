import json
import uuid
from pathlib import Path

from django.db import models

# Load workflow at module import time and cache — do not re-read per request.
_workflow = json.loads((Path(__file__).resolve().parent.parent / 'workflow.json').read_text())
VALID_STATES: set[str] = {s['id'] for s in _workflow['states']}
SUCCESSORS: dict[str, list[str]] = {s['id']: s.get('successors', []) for s in _workflow['states']}
ENTRY_STATE = 'designed'


class Piece(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    created = models.DateTimeField(auto_now_add=True)
    # Tracks changes to owned fields (name, thumbnail) only.
    # Use the `last_modified` property externally — it incorporates the current state's timestamp.
    fields_last_modified = models.DateTimeField(auto_now=True)
    thumbnail = models.CharField(max_length=1024, blank=True, default='')

    class Meta:
        ordering = ['-fields_last_modified']

    @property
    def current_state(self) -> 'PieceState | None':
        return self.states.order_by('-created').first()  # type: ignore[return-value]

    @property
    def last_modified(self):
        cs = self.current_state
        if cs is None:
            return self.fields_last_modified
        return max(self.fields_last_modified, cs.last_modified)

    def __str__(self) -> str:
        return self.name


class PieceState(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    piece = models.ForeignKey(Piece, on_delete=models.CASCADE, related_name='states')
    state = models.CharField(max_length=64)
    notes = models.TextField(blank=True, default='')
    created = models.DateTimeField(auto_now_add=True)
    last_modified = models.DateTimeField(auto_now=True)
    location = models.CharField(max_length=255, blank=True, default='')
    # Stored as a list of {url, caption, created} objects.
    images = models.JSONField(default=list)

    class Meta:
        ordering = ['created']

    def save(self, *args, allow_sealed_edit: bool = False, **kwargs):
        """
        Past states are sealed — only the current state of a piece may be modified.

        Pass allow_sealed_edit=True to bypass this check for exceptional admin
        operations. This should never be done in normal application code paths.
        """
        if self.pk and not allow_sealed_edit:
            current = self.piece.current_state
            if current is None or current.pk != self.pk:
                raise ValueError(
                    f'PieceState {self.pk} is sealed: only the current state of a piece '
                    f'may be modified. Pass allow_sealed_edit=True to override.'
                )
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f'{self.piece.name} → {self.state}'
