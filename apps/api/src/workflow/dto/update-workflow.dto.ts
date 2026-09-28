import { PartialType } from '@nestjs/swagger';
import { CreateWorkflowDto } from './create-workflow.dto.js';

export class UpdateWorkflowDto extends PartialType(CreateWorkflowDto) {}