import { Injectable } from '@nestjs/common';

export interface AppInfo {
  name: string;
  version: string;
  status: string;
}

@Injectable()
export class AppService {
  getHello(): AppInfo {
    return {
      name: 'FlowMind API',
      version: '0.1.0',
      status: 'running',
    };
  }
}
