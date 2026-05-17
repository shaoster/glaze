# Common Tests

This directory contains cross-cutting and structural tests for PotterDoc, primarily focusing on validating the workflow state machine and custom fields DSL.

## What is tested

**Common** ([`test_workflow.py`](test_workflow.py)): structural validation of [`workflow.yml`](../workflow.yml) against [`workflow.schema.yml`](../workflow.schema.yml), semantic/referential integrity (successor references, reachability, terminal-state rules), `custom_fields` DSL rules (enum constraints, ref targets, calculated fields), and global/model alignment against `api/models.py`.
