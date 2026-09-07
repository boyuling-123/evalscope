# Copyright (c) Alibaba, Inc. and its affiliates.
"""HTTP adapter for the shared workbench Action Registry."""

from flask import Blueprint, current_app, jsonify, request

from evalscope.workbench.actions import ActionRegistry, action_http_status

bp_workbench = Blueprint('workbench', __name__, url_prefix='/api/v1/workbench')


@bp_workbench.route('/actions/execute', methods=['POST'])
def execute_action():
    registry: ActionRegistry = current_app.config['WORKBENCH_ACTION_REGISTRY']
    payload = request.get_json(silent=True)
    response = registry.execute(payload if payload is not None else {})
    return jsonify(response.model_dump(mode='json', exclude_none=True)), action_http_status(response)
