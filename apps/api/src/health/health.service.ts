import { Injectable } from '@nestjs/common';

export interface HealthStatus {
  status: string;
  service: string;
  version: string;
}

@Injectable()
export class HealthService {
  check(): HealthStatus {
    return {
      status: 'running',
      service: 'FlowMind API',
      version: '0.1.0',
    };
  }
}
