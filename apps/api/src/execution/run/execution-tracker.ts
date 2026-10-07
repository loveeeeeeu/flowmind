import { Injectable } from '@nestjs/common';
import {
  type CreateNodeRunParams,
  NodeRunService,
} from './node-run.service.js';

@Injectable()
export class ExecutionTracker {
  constructor(private readonly nodeRuns: NodeRunService) {}

  startNode(params: CreateNodeRunParams) {
    return this.nodeRuns.create(params);
  }

  completeNode(nodeRunId: string, output: unknown) {
    return this.nodeRuns.markSuccess(nodeRunId, output);
  }

  failNode(nodeRunId: string, error: unknown) {
    return this.nodeRuns.markFailed(nodeRunId, error);
  }
}
